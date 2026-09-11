import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import router from './metadata.js';
import errorHandler from '../middleware/errorHandler.js';

process.env.JWT_SECRET ||= 'metadata-test-secret';

test('metadata status is read-only, authenticated, guest-restricted and owner-scoped', async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    assert.match(sql.trim(), /^SELECT/);
    return sql.includes('tracked_count')
      ? { rows: [{ tracked_count: 2, due_count: 1, failed_count: 0 }] }
      : { rows: [] };
  };
  const app = express();
  app.use('/api/metadata', router);
  app.use(errorHandler);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/metadata/repair-jobs/latest`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const token = payload => jwt.sign(payload, process.env.JWT_SECRET);
    const guest = await fetch(url, { headers: { Authorization: `Bearer ${token({ id: 8, is_guest: true })}` } });
    assert.equal(guest.status, 400);
    assert.equal(calls.length, 0);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token({ id: 7 })}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.refresh.trackedCount, 2);
    assert.equal(body.refresh.lastMetadataUpdateAt, null);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.values[0] === 7));
  } finally {
    pool.query = original;
    await new Promise(resolve => server.close(resolve));
  }
});
