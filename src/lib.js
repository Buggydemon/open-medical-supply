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
export function searchInventory(inventory, medicineId, city, filters = {}, location = null) {
  return inventory.filter(r => r.medicineId === medicineId).map(r => {
    const pharmacy = pharmacies.find(p => p.id === r.pharmacyId);
    return { ...r, pharmacy, distance: distanceKm(location || cityCenters[city], [pharmacy.lat, pharmacy.lng]) };
  }).filter(r => r.pharmacy.city === city && (!filters.inStock || r.quantity > 0) && (!filters.verified || r.pharmacy.verified) && (!filters.fresh || !isStale(r)))
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
