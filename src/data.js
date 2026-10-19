export const medicines = [
  ['metformin', 'Metformin', '500 mg', 'Tablet', 'Diabetes care', '30 tablets', 2400],
  ['amlodipine', 'Amlodipine', '5 mg', 'Tablet', 'Heart & blood pressure', '30 tablets', 1800],
  ['insulin', 'Insulin (human, soluble)', '100 IU/mL', 'Injection', 'Diabetes care', '10 mL vial', 14500],
  ['losartan', 'Losartan', '50 mg', 'Tablet', 'Heart & blood pressure', '30 tablets', 3200],
  ['atorvastatin', 'Atorvastatin', '20 mg', 'Tablet', 'Heart & blood pressure', '30 tablets', 4500],
  ['salbutamol', 'Salbutamol', '100 mcg/dose', 'Inhaler', 'Respiratory care', '200 doses', 6800],
  ['artemether', 'Artemether / Lumefantrine', '20 / 120 mg', 'Tablet', 'Malaria treatment', '24 tablets', 3500],
  ['azithromycin', 'Azithromycin', '500 mg', 'Tablet', 'Antibiotics', '3 tablets', 2800],
  ['amoxicillin', 'Amoxicillin', '500 mg', 'Capsule', 'Antibiotics', '21 capsules', 2200],
  ['paracetamol', 'Paracetamol', '500 mg', 'Tablet', 'Pain & fever', '20 tablets', 600],
  ['ibuprofen', 'Ibuprofen', '400 mg', 'Tablet', 'Pain & fever', '20 tablets', 1200],
  ['omeprazole', 'Omeprazole', '20 mg', 'Capsule', 'Digestive care', '28 capsules', 2500],
  ['oral-rehydration', 'Oral rehydration salts', 'WHO formula', 'Powder', 'Essential supplies', '10 sachets', 1500],
  ['cetirizine', 'Cetirizine', '10 mg', 'Tablet', 'Allergy care', '10 tablets', 800],
  ['hydrochlorothiazide', 'Hydrochlorothiazide', '25 mg', 'Tablet', 'Heart & blood pressure', '30 tablets', 1000],
  ['glibenclamide', 'Glibenclamide', '5 mg', 'Tablet', 'Diabetes care', '30 tablets', 1600],
  ['budesonide', 'Budesonide', '200 mcg/dose', 'Inhaler', 'Respiratory care', '200 doses', 12000],
  ['levothyroxine', 'Levothyroxine', '50 mcg', 'Tablet', 'Thyroid care', '28 tablets', 5200],
  ['folic-acid', 'Folic acid', '5 mg', 'Tablet', 'Essential supplies', '30 tablets', 700],
  ['timolol', 'Timolol', '0.5%', 'Eye drops', 'Eye care', '5 mL bottle', 3200],
].map(([id, name, strength, form, category, pack, basePrice]) => ({ id, name, strength, form, category, pack, basePrice, prescription: !['paracetamol', 'oral-rehydration', 'folic-acid'].includes(id) }));

export const pharmacies = [
  { id: 'p1', name: 'Everwell Pharmacy', area: 'Ikeja', city: 'Lagos', address: '18 Example Way, Ikeja, Lagos', lat: 6.596, lng: 3.351, verified: true, hours: '8am – 9pm', initials: 'EW', color: 'green' },
  { id: 'p2', name: 'Cedar Care Pharmacy', area: 'Maryland', city: 'Lagos', address: '24 Sample Avenue, Maryland, Lagos', lat: 6.571, lng: 3.371, verified: true, hours: '8am – 8pm', initials: 'CC', color: 'blue' },
  { id: 'p3', name: 'Bridgewell Health', area: 'Yaba', city: 'Lagos', address: '6 Demo Crescent, Yaba, Lagos', lat: 6.509, lng: 3.371, verified: true, hours: '9am – 8pm', initials: 'BH', color: 'orange' },
  { id: 'p4', name: 'Olive Community Pharmacy', area: 'Surulere', city: 'Lagos', address: '32 Example Road, Surulere, Lagos', lat: 6.497, lng: 3.347, verified: true, hours: '8am – 10pm', initials: 'OC', color: 'purple' },
  { id: 'p5', name: 'Harbour Medical Store', area: 'Lekki', city: 'Lagos', address: '9 Sample Street, Lekki, Lagos', lat: 6.447, lng: 3.465, verified: false, hours: '9am – 7pm', initials: 'HM', color: 'blue' },
  { id: 'p6', name: 'Sunrise Pharmacy', area: 'Victoria Island', city: 'Lagos', address: '14 Demo Close, Victoria Island, Lagos', lat: 6.429, lng: 3.423, verified: true, hours: '8am – 9pm', initials: 'SP', color: 'orange' },
  { id: 'p7', name: 'Maple Health Pharmacy', area: 'Bodija', city: 'Ibadan', address: '12 Example Way, Bodija, Ibadan', lat: 7.438, lng: 3.918, verified: true, hours: '8am – 8pm', initials: 'MH', color: 'green' },
  { id: 'p8', name: 'Hilltop Community Pharmacy', area: 'Dugbe', city: 'Ibadan', address: '7 Demo Avenue, Dugbe, Ibadan', lat: 7.387, lng: 3.877, verified: true, hours: '9am – 9pm', initials: 'HC', color: 'purple' },
  { id: 'p9', name: 'Bloom Care Pharmacy', area: 'Ring Road', city: 'Ibadan', address: '22 Sample Road, Ring Road, Ibadan', lat: 7.363, lng: 3.872, verified: false, hours: '8am – 7pm', initials: 'BC', color: 'orange' },
  { id: 'p10', name: 'Northside Pharmacy', area: 'Agbowo', city: 'Ibadan', address: '3 Example Street, Agbowo, Ibadan', lat: 7.446, lng: 3.902, verified: true, hours: '8am – 9pm', initials: 'NP', color: 'blue' },
];

export const cityCenters = { Lagos: [6.5244, 3.3792], Ibadan: [7.3775, 3.9470] };
export const categories = [...new Set(medicines.map(m => m.category))];
export const sampleTime = Date.now();
export function initialInventory() {
  return pharmacies.flatMap((p, pi) => medicines.map((m, mi) => ({
    id: `${p.id}-${m.id}`, pharmacyId: p.id, medicineId: m.id,
    quantity: (pi + mi) % 7 === 5 ? 0 : (pi + mi) % 5 === 3 ? 4 : 24 + ((pi * 13 + mi * 7) % 96),
    price: Math.round(m.basePrice * [1, 1.15, 0.92, 1.06, 1.6, 1.22, 0.88, 1.1, 1.4, 1.03][pi] / 50) * 50,
    updatedAt: sampleTime - [35, 90, 180, 960, 3100, 75, 42, 260, 1500, 120][pi] * 60000,
  })));
}

export const batches = {
  'MS-MET-2026-001': { medicineId: 'metformin', batch: 'MET-26-0142', manufacturer: 'Example Therapeutics Ltd. (fictional)', manufactured: '2026-02-10', expiry: '2028-02-10', status: 'record', events: [
    ['Manufacturing record', 'Example Therapeutics', '10 Feb 2026', 'Batch created · 5,000 packs'],
    ['Distributor received', 'Sample Medical Distribution', '18 Feb 2026', 'Custody transfer recorded'],
    ['Pharmacy received', 'Everwell Pharmacy', '21 Feb 2026', '120 packs received'],
  ] },
  'MS-INS-2026-002': { medicineId: 'insulin', batch: 'INS-26-0088', manufacturer: 'Example Biologics (fictional)', manufactured: '2026-03-01', expiry: '2027-03-01', status: 'flagged', events: [
    ['Manufacturing record', 'Example Biologics', '1 Mar 2026', 'Temperature-sensitive batch'],
    ['Distribution alert', 'Sample Cold Chain Logistics', '5 Mar 2026', 'Temperature excursion reported · needs investigation'],
  ] },
};
