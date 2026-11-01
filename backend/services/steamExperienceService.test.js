import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { getSteamExperienceHealth } from './steamExperienceService.js';

function fixture(t, { missingAccount = false, failJob = false } = {}) {
  const statements = [];
  let released = false;
  t.mock.method(pool, 'query', async (sql, values) => {
    assert.ok(sql.includes('SELECT is_guest'));
    assert.deepEqual(values, [7]);
    statements.push(sql);
    return { rows: [{ is_guest: false }] };
  });
  t.mock.method(pool, 'connect', async () => ({
    async query(sql, values) {
      statements.push(sql);
      if (sql.includes('FROM user_external_accounts')) {
        assert.deepEqual(values, [7]);
        return { rows: missingAccount ? [] : [{ id: 11, provider: 'steam', price_revision: '9',
          last_library_sync_at: '2026-10-23T05:00:00Z', last_wishlist_sync_at: '2026-10-23T05:10:00Z' }] };
      }
      if (sql.includes("status IN ('queued', 'running')")) {
        assert.deepEqual(values, [7, 11]);
        if (failJob) throw Error('injected job-read failure');
        return { rows: [{ id: 'active', sync_kind: 'library', status: 'running', cursor: 3,
          total: 10, progress_json: { phase: 'achievements' }, created_at: '2026-10-23T05:20:00Z' }] };
      }
      if (sql.includes('SELECT MAX(created_at)')) return { rows: [{ last_scheduled_at: '2026-10-23T05:00:00Z' }] };
      return { rows: [] };
    },
    release() { released = true; },
  }));
  return { statements, get released() { return released; } };
}

test('summary health retains account freshness and active progress but skips all three diagnostic reads', async t => {
  const observed = fixture(t);
  const summary = await getSteamExperienceHealth(7, { detail: 'summary' });
  assert.deepEqual(Object.keys(summary).sort(), ['account', 'activeJob']);
  assert.equal(summary.account.priceRevision, '9');
  assert.equal(summary.account.lastLibrarySyncAt, '2026-10-23T05:00:00Z');
  assert.equal(summary.account.lastWishlistSyncAt, '2026-10-23T05:10:00Z');
  assert.equal(summary.activeJob.processed, 3);
  assert.deepEqual(summary.activeJob.progress, { phase: 'achievements' });
  assert.equal(observed.statements.length, 5, 'guard, begin, account, active job, commit');
  assert.ok(!observed.statements.some(sql => /integration_sync_runs|MAX\(created_at\)|daily_automation_run/.test(sql)));
  assert.equal(observed.released, true);
});

test('default health keeps the full diagnostic response and existing queries', async t => {
  const observed = fixture(t);
  const full = await getSteamExperienceHealth(7);
  assert.deepEqual(full.runs, []);
  assert.deepEqual(full.dailyRuns, []);
  assert.equal(full.lastScheduledAt, '2026-10-23T05:00:00Z');
  assert.equal(full.activeJob.id, 'active');
  assert.equal(observed.statements.length, 8);
  assert.equal(observed.released, true);
});

test('summary health without a current account returns no old diagnostics', async t => {
  const observed = fixture(t, { missingAccount: true });
  assert.deepEqual(await getSteamExperienceHealth(7, { detail: 'summary' }), { account: null, activeJob: null });
  assert.equal(observed.statements.length, 4);
  assert.equal(observed.released, true);
});

test('failed summary reads roll back and release their client', async t => {
  const observed = fixture(t, { failJob: true });
  await assert.rejects(getSteamExperienceHealth(7, { detail: 'summary' }), /injected job-read failure/);
  assert.equal(observed.statements.at(-1), 'ROLLBACK');
  assert.equal(observed.released, true);
});
