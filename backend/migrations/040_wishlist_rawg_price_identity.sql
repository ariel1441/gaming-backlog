-- Keep the active Steam Wishlist app id authoritative for prices. Selecting a
-- RAWG catalog match must not introduce a different catalog Steam id into the
-- active Wishlist price target.
CREATE OR REPLACE VIEW steam_price_targets AS
SELECT w.user_id, a.id AS account_id, w.id AS wishlist_item_id,
       CASE WHEN cardinality(ids.app_ids) = 1 THEN ids.app_ids[1] END AS steam_app_id,
       CASE WHEN NOT (w.local_intent_active OR COALESCE(s.is_active, FALSE)) THEN 'removed'
            WHEN cardinality(ids.app_ids) IS DISTINCT FROM 1 THEN 'identity_unresolved'
            WHEN EXISTS (SELECT 1 FROM user_game_sources source
              WHERE source.user_id = w.user_id AND source.provider = 'steam'
                AND source.provider_app_id = ids.app_ids[1]
                AND source.source_status IN ('owned', 'ignored')
                AND source.last_synced_at >= a.linked_at) THEN 'owned'
            ELSE 'eligible' END AS reason
FROM user_wishlist_items w
JOIN user_external_accounts a ON a.user_id = w.user_id AND a.provider = 'steam' AND a.disconnected_at IS NULL
JOIN users u ON u.id = w.user_id AND u.is_guest = FALSE
LEFT JOIN LATERAL (
  SELECT bool_or(m.is_active AND m.account_id = a.id) AS is_active
  FROM steam_wishlist_items m
  WHERE m.wishlist_item_id = w.id AND m.user_id = w.user_id
) s ON TRUE
LEFT JOIN games g ON g.id = w.game_id AND g.user_id = w.user_id
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT app_id) AS app_ids FROM (
    SELECT m.steam_app_id AS app_id FROM steam_wishlist_items m
      WHERE m.wishlist_item_id = w.id AND m.user_id = w.user_id
        AND ((COALESCE(s.is_active, FALSE) AND m.account_id = a.id AND m.is_active)
          OR NOT COALESCE(s.is_active, FALSE))
    UNION ALL
    SELECT e.external_id FROM external_game_ids e
      WHERE e.source = 'steam'
        AND e.catalog_game_id IN (w.catalog_game_id, g.catalog_game_id)
        AND NOT COALESCE(s.is_active, FALSE)
  ) exact_ids WHERE app_id ~ '^[1-9][0-9]*$'
) ids ON TRUE;
