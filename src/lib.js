import { pharmacies, cityCenters, initialInventory } from './data.js';
export const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
export function distanceKm(a, b) {
  const rad = n => n * Math.PI / 180;
  const x = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function stockStatus(quantity) { return quantity === 0 ? 'Out of stock' : quantity < 10 ? 'Low stock' : 'In stock'; }
export function isStale(record) { return Date.now() - record.updatedAt > 86400000; }
export function age(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
export function stats(records) {
  const prices = records.filter(r => r.quantity > 0 && !isStale(r)).map(r => r.price).sort((a, b) => a - b);
  if (!prices.length) return null;
  const middle = Math.floor(prices.length / 2);
  return { min: prices[0], max: prices.at(-1), median: prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2, average: prices.reduce((a, b) => a + b, 0) / prices.length, count: prices.length };
}
function seededUnit(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}
export function recordHistory(record, weeks = 12) {
  const points = [record.price];
  for (let k = 1; k < weeks; k++) {
    const drift = 1 + (seededUnit(`${record.id}:${k}`) - 0.45) * 0.06;
    points.push(Math.max(50, Math.round(points[k - 1] / drift / 10) * 10));
  }
  return points.reverse();
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function marketSeries(records, weeks = 12) {
  const usable = records.filter(r => r.quantity > 0 && !isStale(r));
  const histories = usable.map(r => recordHistory(r, weeks));
  return Array.from({ length: weeks }, (_, i) => histories.length ? Math.round(median(histories.map(h => h[i]))) : null);
}
export function priceTrend(series) {
  const points = series.filter(Number.isFinite);
  if (points.length < 2) return null;
  const first = points[0], last = points.at(-1);
  return { first, last, change: ((last - first) / first) * 100, min: Math.min(...points), max: Math.max(...points) };
}
export function dataConfidence(record, medianPrice) {
  const hours = Math.max(0, (Date.now() - record.updatedAt) / 3600000);
  const freshness = Math.max(0, Math.round(100 - hours * 2.2));
  const price = !Number.isFinite(medianPrice) || medianPrice <= 0 ? 50 : Math.max(0, Math.round(100 - Math.abs(record.price - medianPrice) / medianPrice * 250));
  const verification = record.pharmacy.verified ? 100 : 40;
  return { score: Math.round(freshness * 0.4 + price * 0.3 + verification * 0.3), freshness, price, verification };
}
export function priceAnomalies(records, medicineFor) {
  return records.filter(r => r.quantity > 0 && !isStale(r)).flatMap(r => {
    const peerMedian = median(records.filter(p => p.medicineId === r.medicineId && p.quantity > 0 && !isStale(p)).map(p => p.price));
    if (!(r.price > peerMedian * 1.3)) return [];
    return [{ ...r, medicine: medicineFor(r.medicineId), median: peerMedian, above: Math.round((r.price / peerMedian - 1) * 100) }];
  }).sort((a, b) => b.above - a.above);
}
export function searchInventory(inventory, medicineId, city, filters = {}, location = null) {
  return inventory.filter(r => r.medicineId === medicineId).map(r => {
    const pharmacy = pharmacies.find(p => p.id === r.pharmacyId);
    return { ...r, pharmacy, distance: distanceKm(location || cityCenters[city], [pharmacy.lat, pharmacy.lng]) };
  }).filter(r => r.pharmacy.city === city && (!filters.inStock || r.quantity > 0) && (!filters.verified || r.pharmacy.verified) && (!filters.fresh || !isStale(r)) && (!filters.open24 || r.pharmacy.open24))
    .sort((a, b) => filters.sort === 'price' ? a.price - b.price : filters.sort === 'updated' ? b.updatedAt - a.updatedAt : a.distance - b.distance);
}
export function validInventoryUpdate(quantity, price) {
  return Number.isInteger(quantity) && quantity >= 0 && quantity <= 100000 && Number.isFinite(price) && price > 0 && price <= 1000000;
}
export function loadInventory() {
  try {
    const saved = JSON.parse(localStorage.getItem('medstock-inventory-v1'));
    const initial = initialInventory();
    if (!Array.isArray(saved)) return initial;
    return initial.map(r => {
      const s = saved.find(v => v.id === r.id);
      return s && validInventoryUpdate(s.quantity, s.price) && Number.isFinite(s.updatedAt) && s.updatedAt <= Date.now() ? { ...r, quantity: s.quantity, price: s.price, updatedAt: s.updatedAt } : r;
    });
  } catch { return initialInventory(); }
}
export function exportCsv(rows, filename) {
  const text = rows.map(row => row.map(value => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
