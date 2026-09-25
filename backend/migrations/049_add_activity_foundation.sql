-- Preserve the raw provider boundary and classify only evidence-backed intervals.
-- Existing finalization timestamps are retained when a saved snapshot timestamp is
-- unavailable; those intervals remain explicitly uncertain.
CREATE OR REPLACE FUNCTION gaming_activity_day(value TIMESTAMPTZ)
RETURNS DATE
LANGUAGE SQL
STABLE
STRICT
AS $$
  SELECT ((value AT TIME ZONE 'Asia/Jerusalem') - INTERVAL '5 hours')::date
$$;

ALTER TABLE steam_activity_observations
  ADD COLUMN IF NOT EXISTS observation_time_source TEXT NOT NULL DEFAULT 'legacy_finalization',
  ADD COLUMN IF NOT EXISTS activity_precision TEXT NOT NULL DEFAULT 'baseline',
  ADD COLUMN IF NOT EXISTS activity_day DATE,
  ADD COLUMN IF NOT EXISTS counter_rebaseline BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE steam_activity_observations
  DROP CONSTRAINT IF EXISTS steam_activity_observations_time_source_check,
  ADD CONSTRAINT steam_activity_observations_time_source_check
    CHECK (observation_time_source IN ('snapshot', 'legacy_finalization')),
  DROP CONSTRAINT IF EXISTS steam_activity_observations_precision_check,
  ADD CONSTRAINT steam_activity_observations_precision_check
    CHECK (activity_precision IN ('baseline', 'daily', 'uncertain')),
  DROP CONSTRAINT IF EXISTS steam_activity_observations_activity_day_check,
  ADD CONSTRAINT steam_activity_observations_activity_day_check
    CHECK ((activity_precision = 'daily') = (activity_day IS NOT NULL));

ALTER TABLE user_game_sources
  ADD COLUMN IF NOT EXISTS first_play_activity_day DATE;

WITH snapshot_evidence AS (
  SELECT observation.id,
    (job.payload_json->>'snapshotObservedAt')::timestamptz AS snapshot_observed_at
  FROM steam_activity_observations observation
  JOIN steam_sync_jobs job ON job.sync_run_id = observation.sync_run_id
    AND job.user_id = observation.user_id
  WHERE job.payload_json->>'snapshotObservedAt'
    ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
)
UPDATE steam_activity_observations observation
SET observed_at = evidence.snapshot_observed_at,
    observation_time_source = 'snapshot'
FROM snapshot_evidence evidence
WHERE evidence.id = observation.id;

WITH app_ordered AS (
  SELECT observation.id, observation.user_id, observation.sync_run_id,
    observation.steam_app_id, observation.observed_at,
    observation.observation_time_source, observation.playtime_minutes_forever,
    job.account_id, job.provider_user_id,
    lag(observation.observed_at) OVER connection_app AS previous_observed_at,
    lag(observation.observation_time_source) OVER connection_app AS previous_time_source,
    lag(observation.playtime_minutes_forever) OVER connection_app AS previous_playtime
  FROM steam_activity_observations observation
  JOIN steam_sync_jobs job ON job.sync_run_id = observation.sync_run_id
    AND job.user_id = observation.user_id
  WINDOW connection_app AS (
    PARTITION BY observation.user_id, observation.steam_app_id,
      job.account_id, job.provider_user_id
    ORDER BY observation.observed_at, observation.id
  )
), ordered AS (
  SELECT app_ordered.*,
    COALESCE(app_ordered.previous_observed_at, account_previous.observed_at)
      AS effective_previous_observed_at,
    COALESCE(app_ordered.previous_time_source, account_previous.observation_time_source)
      AS effective_previous_time_source
  FROM app_ordered
  LEFT JOIN user_external_accounts account
    ON account.id = app_ordered.account_id AND account.user_id = app_ordered.user_id
  LEFT JOIN LATERAL (
    SELECT prior.observed_at, prior.observation_time_source
    FROM steam_activity_observations prior
    JOIN steam_sync_jobs prior_job ON prior_job.sync_run_id = prior.sync_run_id
      AND prior_job.user_id = prior.user_id
    WHERE app_ordered.previous_observed_at IS NULL
      AND prior.user_id = app_ordered.user_id
      AND prior_job.account_id = app_ordered.account_id
      AND prior_job.provider_user_id = app_ordered.provider_user_id
      AND prior.sync_run_id <> app_ordered.sync_run_id
      AND prior.observed_at >= account.linked_at
      AND prior.observed_at < app_ordered.observed_at
    ORDER BY prior.observed_at DESC, prior.id DESC
    LIMIT 1
  ) account_previous ON TRUE
), classified AS (
  SELECT id, effective_previous_observed_at,
    previous_observed_at IS NULL
      AND effective_previous_observed_at IS NOT NULL AS newly_observed_after_baseline,
    CASE
      WHEN effective_previous_observed_at IS NULL THEN 'baseline'
      WHEN observation_time_source = 'snapshot'
        AND effective_previous_time_source = 'snapshot'
        AND gaming_activity_day(observed_at) - gaming_activity_day(effective_previous_observed_at) BETWEEN 0 AND 1
        THEN 'daily'
      ELSE 'uncertain'
    END AS precision,
    CASE
      WHEN effective_previous_observed_at IS NOT NULL
        AND observation_time_source = 'snapshot'
        AND effective_previous_time_source = 'snapshot'
        AND gaming_activity_day(observed_at) = gaming_activity_day(effective_previous_observed_at)
        THEN gaming_activity_day(observed_at)
      WHEN effective_previous_observed_at IS NOT NULL
        AND observation_time_source = 'snapshot'
        AND effective_previous_time_source = 'snapshot'
        AND gaming_activity_day(observed_at) = gaming_activity_day(effective_previous_observed_at) + 1
        THEN gaming_activity_day(effective_previous_observed_at)
      ELSE NULL
    END AS derived_activity_day,
    previous_playtime IS NOT NULL
      AND playtime_minutes_forever < previous_playtime AS rebaseline
  FROM ordered
)
UPDATE steam_activity_observations observation
SET interval_started_at = classified.effective_previous_observed_at,
    is_baseline = classified.effective_previous_observed_at IS NULL,
    playtime_delta_minutes = CASE
      WHEN classified.newly_observed_after_baseline
        THEN observation.playtime_minutes_forever
      ELSE observation.playtime_delta_minutes
    END,
    activity_precision = classified.precision,
    activity_day = classified.derived_activity_day,
    counter_rebaseline = classified.rebaseline
FROM classified
WHERE classified.id = observation.id;

UPDATE user_game_sources source
SET first_play_activity_day = observation.activity_day
FROM steam_activity_observations observation
WHERE observation.source_id = source.id
  AND observation.activity_precision = 'daily'
  AND source.first_play_observed_at = observation.observed_at
  AND source.first_play_activity_day IS NULL;

UPDATE user_activity_events event
SET payload_json = jsonb_set(
  event.payload_json,
  '{activityDay}',
  to_jsonb(source.first_play_activity_day::text),
  TRUE
)
FROM user_game_sources source
WHERE event.user_id = source.user_id
  AND event.source = 'steam_library'
  AND event.external_id = source.provider_app_id
  AND event.event_type IN ('steam_started_playing', 'steam_status_suggestion')
  AND source.first_play_activity_day IS NOT NULL
  AND NOT (event.payload_json ? 'activityDay');

CREATE INDEX IF NOT EXISTS steam_activity_observations_user_activity_day
  ON steam_activity_observations (user_id, activity_day DESC, observed_at DESC)
  WHERE activity_precision = 'daily';
