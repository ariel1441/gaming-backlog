import test from 'node:test';
import assert from 'node:assert/strict';
import { listAllWishlist, listWishlist, refreshWishlistPriceItem, syncWishlist } from './wishlistService.js';

test('wishlist pages preserve repeated server-side filter values', async () => {
  const original = globalThis.fetch;
  let requested;
  try {
    globalThis.fetch = async (input) => {
      requested = new URL(input instanceof Request ? input.url : String(input), 'http://test.local');
      return Response.json({ items: [], total: 0 });
    };
    await listWishlist({ genre: ['Action', 'Role Playing'], on_sale: true, price_attention: true, limit: 50 });
    assert.deepEqual(requested.searchParams.getAll('genre'), ['Action', 'Role Playing']);
    assert.equal(requested.searchParams.get('on_sale'), 'true');
    assert.equal(requested.searchParams.get('price_attention'), 'true');
    assert.equal(requested.searchParams.get('limit'), '50');
  } finally { globalThis.fetch = original; }
});

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

test('an item price refresh uses the scoped Wishlist endpoint', async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push([String(input), init.method]);
      return Response.json({ job: { id: 'item-price-job', status: 'completed', result: { run: { status: 'succeeded' } } } });
    };
    const result = await refreshWishlistPriceItem(42);
    assert.equal(result.run.status, 'succeeded');
    assert.match(calls[0][0], /\/api\/wishlist\/42\/price\/refresh$/);
    assert.equal(calls[0][1], 'POST');
  } finally { globalThis.fetch = original; }
});
