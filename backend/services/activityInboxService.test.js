import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { getActivityInboxCounts } from './activityInboxService.js';

test('badge-only reads use the saved-user guard and one scoped count, without loading groups', async t => {
  const statements = [];
  t.mock.method(pool, 'query', async (sql, values) => {
    statements.push(sql);
    assert.deepEqual(values, [7]);
    if (sql.includes('SELECT is_guest')) return { rows: [{ is_guest: false }] };
    assert.ok(sql.includes('COUNT(DISTINCT'));
    assert.ok(sql.includes('account.provider_user_id = job.provider_user_id'));
    assert.ok(sql.includes('e.user_id = $1'));
    assert.ok(!/json_agg|jsonb_agg|MAX\(id\)|LEFT JOIN|WITH candidates/.test(sql));
    return { rows: [{ attention: 2, pendingDecisions: 1 }] };
  });
  assert.deepEqual(await getActivityInboxCounts(7), { counts: { attention: 2, pendingDecisions: 1 } });
  assert.equal(statements.length, 2);
});
