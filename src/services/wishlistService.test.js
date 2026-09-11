import test from 'node:test';
import assert from 'node:assert/strict';
import { listAllWishlist, syncWishlist } from './wishlistService.js';

test('price commits between membership pages reject mixed saved data', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => Response.json({ snapshotVersion: 'same-membership', priceRevision: String(++calls), total: 2,
      items: [{ id: calls }] });
    await assert.rejects(listAllWishlist(), /changed while loading/);
    assert.equal(calls, 4);
  } finally { globalThis.fetch = original; }
});

test('a single revision conflict quietly retries a coherent saved snapshot', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      const id = calls % 2 ? 1 : 2;
      return Response.json({ snapshotVersion: 'm', priceRevision: calls === 1 ? 'old' : 'new', total: 2, items: [{ id }] });
    };
    const saved = await listAllWishlist();
    assert.equal(saved.priceRevision, 'new');
    assert.deepEqual(saved.items.map(item => item.id), [1, 2]);
    assert.equal(calls, 4);
  } finally { globalThis.fetch = original; }
});

test('manual pricing uses its own endpoint and the existing polling contract', async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push([String(input), init.method]);
      return Response.json({ job: { id: 'price-job', status: 'completed', result: { run: { status: 'succeeded' } } } });
    };
    const result = await syncWishlist({ prices: true });
    assert.equal(result.run.status, 'succeeded');
    assert.match(calls[0][0], /\/api\/wishlist\/prices\/sync$/);
    assert.equal(calls[0][1], 'POST');
  } finally { globalThis.fetch = original; }
});
