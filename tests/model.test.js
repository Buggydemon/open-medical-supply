import test from 'node:test';
import assert from 'node:assert/strict';
import { medicines, pharmacies, initialInventory, batches } from '../src/data.js';
import { distanceKm, stats, searchInventory, isStale, stockStatus, validInventoryUpdate, money, marketSeries, recordHistory, priceTrend, dataConfidence, priceAnomalies } from '../src/lib.js';

test('catalogue has 20 medicines, 10 unique sample pharmacies, valid relational stock', () => {
  assert.equal(medicines.length, 20); assert.equal(pharmacies.length, 10);
  const stock = initialInventory(); assert.equal(stock.length, 200);
  assert.equal(new Set(stock.map(r => r.id)).size, stock.length);
  stock.forEach(r => { assert.ok(medicines.some(m => m.id === r.medicineId)); assert.ok(pharmacies.some(p => p.id === r.pharmacyId)); assert.ok(validInventoryUpdate(r.quantity, r.price)); });
});
test('search honors city, medicine, stock and verification filters', () => {
  const records = searchInventory(initialInventory(), 'metformin', 'Lagos', { inStock: true, verified: true, fresh: true });
  assert.ok(records.length > 0);
  records.forEach(r => { assert.equal(r.pharmacy.city, 'Lagos'); assert.equal(r.medicineId, 'metformin'); assert.ok(r.quantity > 0 && r.pharmacy.verified && !isStale(r)); });
  assert.equal(searchInventory(initialInventory(), 'not-found', 'Lagos').length, 0);
});
test('price statistics exclude unavailable and stale records', () => {
  const now = Date.now();
  assert.deepEqual(stats([{ price: 100, quantity: 5, updatedAt: now }, { price: 200, quantity: 10, updatedAt: now }, { price: 999, quantity: 0, updatedAt: now }, { price: 999, quantity: 9, updatedAt: now - 90000000 }]), { min: 100, max: 200, median: 150, average: 150, count: 2 });
  assert.equal(stats([]), null);
});
test('sort by price and freshness; distance uses supplied location', () => {
  const inventory = initialInventory();
  const sorted = searchInventory(inventory, 'metformin', 'Ibadan', { sort: 'price' });
  assert.ok(sorted.every((r, i) => i === 0 || sorted[i - 1].price <= r.price));
  const located = searchInventory(inventory, 'metformin', 'Lagos', {}, [pharmacies[0].lat, pharmacies[0].lng]);
  assert.equal(located[0].pharmacyId, 'p1'); assert.equal(located[0].distance, 0);
});
test('inventory validation rejects negatives, fractions and invalid prices', () => {
  assert.ok(validInventoryUpdate(0, 1500));
  for (const [q, p] of [[-1, 100], [1.2, 100], [5, 0], [5, -2], [5, NaN], [Infinity, 100], [100001, 20], [3, 1000001]]) assert.equal(validInventoryUpdate(q, p), false);
});
test('price formatting preserves fractional naira', () => {
  assert.equal(money(1500), '₦1,500');
  assert.equal(money(1500.25), '₦1,500.25');
});

test('distance and stock labels have defined edge behavior', () => {
  assert.equal(distanceKm([6, 3], [6, 3]), 0);
  assert.ok(distanceKm([6.52, 3.38], [7.38, 3.95]) > 100);
  assert.equal(stockStatus(0), 'Out of stock'); assert.equal(stockStatus(4), 'Low stock'); assert.equal(stockStatus(10), 'In stock');
});
test('verification records distinguish traceability and alerts; unknown has no result', () => {
  assert.equal(batches['MS-MET-2026-001'].status, 'record');
  assert.equal(batches['MS-INS-2026-002'].status, 'flagged');
  assert.equal(batches['unknown'], undefined);
});
test('open-24 filter and illustrated price history are deterministic', () => {
  const inventory = initialInventory();
  const overnight = searchInventory(inventory, 'metformin', 'Lagos', { open24: true });
  assert.ok(overnight.length > 0);
  overnight.forEach(r => assert.equal(r.pharmacy.open24, true));
  assert.equal(searchInventory(inventory, 'metformin', 'Ibadan', { open24: true }).every(r => r.pharmacy.open24), true);
  const record = inventory[0];
  assert.deepEqual(recordHistory(record, 12), recordHistory(record, 12));
  const history = recordHistory(record, 12);
  assert.equal(history.length, 12); assert.equal(history.at(-1), record.price);
  const series = marketSeries(searchInventory(inventory, 'metformin', 'Lagos'));
  assert.equal(series.length, 12);
  assert.deepEqual(series, marketSeries(searchInventory(inventory, 'metformin', 'Lagos')));
  const trend = priceTrend(series);
  assert.ok(trend && trend.first > 0 && trend.max >= trend.min);
  assert.equal(priceTrend([null, null]), null);
});
test('confidence scoring responds to freshness, price position and demo verification', () => {
  const now = Date.now();
  const base = { price: 1000, quantity: 5, updatedAt: now, pharmacy: { verified: true } };
  const strong = dataConfidence(base, 1000), stale = dataConfidence({ ...base, updatedAt: now - 3 * 86400000 }, 1000);
  assert.ok(strong.score > stale.score);
  assert.ok(strong.price > dataConfidence({ ...base, price: 2000 }, 1000).price);
  assert.ok(strong.verification > dataConfidence({ ...base, pharmacy: { verified: false } }, 1000).verification);
  assert.ok(strong.score <= 100 && stale.score >= 0);
});
test('price anomalies only flag fresh, above-range listings', () => {
  const now = Date.now();
  const medicineFor = id => ({ id, name: 'Sample' });
  const rows = [
    { id: 'a', medicineId: 'metformin', price: 1000, quantity: 5, updatedAt: now },
    { id: 'b', medicineId: 'metformin', price: 1050, quantity: 5, updatedAt: now },
    { id: 'c', medicineId: 'metformin', price: 1600, quantity: 5, updatedAt: now },
    { id: 'd', medicineId: 'metformin', price: 9000, quantity: 0, updatedAt: now },
    { id: 'e', medicineId: 'metformin', price: 9000, quantity: 5, updatedAt: now - 3 * 86400000 },
  ];
  const found = priceAnomalies(rows, medicineFor);
  assert.equal(found.length, 1); assert.equal(found[0].id, 'c');
  assert.ok(found[0].above > 30); assert.equal(found[0].medicine.name, 'Sample');
});
