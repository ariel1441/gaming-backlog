-- Give each Steam sync job claim an ownership token so an expired worker
-- cannot checkpoint or finalize after another worker has recovered the job.
ALTER TABLE steam_sync_jobs
  ADD COLUMN IF NOT EXISTS lease_token UUID;
