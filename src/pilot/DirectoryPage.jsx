import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Check, ChevronDown, Clock3, MapPin, MessageCircle, Phone, RefreshCw,
  Search, ShieldCheck, Store, TriangleAlert, X,
} from 'lucide-react';
import {
  ago, api, confirmedAt, dateLabel, initials, isFresh, mapsLink, medicines, money,
  stockLabel, waLink,
} from './pilot-lib.js';

const medicineById = new Map(medicines.map(medicine => [medicine.id, medicine]));
const cities = ['All cities', 'Lagos', 'Ibadan'];

function whatsappMessage(pharmacy, item) {
  if (item) {
    return `Hello ${pharmacy.name}, I saw ${item.medicine.name} ${item.medicine.strength} (${item.medicine.pack}) listed on the Medstock pilot directory at ${money(item.price)}. Is it still available today?`;
  }
  return `Hello ${pharmacy.name}, I found your pharmacy on the Medstock pilot directory. Is the stock you listed still available today?`;
}

function PharmacyCard({ pharmacy, item, now, expanded, onToggle }) {
  const stamp = item ? confirmedAt(item) : pharmacy.lastConfirmedAt;
  const fresh = isFresh(stamp, now);
  const items = useMemo(() => [...pharmacy.items].sort((a, b) => a.medicine.name.localeCompare(b.medicine.name)), [pharmacy.items]);
  const shown = item ? [] : expanded ? items : items.slice(0, 4);

  return (
    <article className="pilot-card">
      <div className="pilot-card-head">
        <span className="pilot-avatar" aria-hidden="true">{initials(pharmacy.name)}</span>
        <div className="pilot-card-title">
          <h3>{pharmacy.name}</h3>
          <p><MapPin size={13} /> {pharmacy.area}, {pharmacy.city}</p>
        </div>
        <span className={`pilot-chip ${fresh ? 'ok' : 'warn'}`}>
          {fresh ? <Check size={13} /> : <Clock3 size={13} />}
          {fresh ? `Confirmed ${ago(stamp, now)}` : 'Call to confirm'}
        </span>
      </div>

      {item ? (
        <>
          <div className="pilot-focus">
            <div>
              <span>Pack price</span>
              <strong>{money(item.price)}</strong>
              <small>{item.medicine.pack}</small>
            </div>
            <div>
              <span>Reported stock</span>
              <strong className={item.quantity <= 0 ? 'out' : ''}>{item.quantity <= 0 ? 'None' : item.quantity}</strong>
              <small>{item.quantity <= 0 ? 'Out of stock' : 'packs listed'}</small>
            </div>
            <div>
              <span>Confirmed</span>
              <strong>{ago(confirmedAt(item), now)}</strong>
              <small>{isFresh(confirmedAt(item), now) ? 'Within 24 hours' : 'Needs reconfirmation'}</small>
            </div>
          </div>
          {!fresh && (
            <p className="pilot-warnline"><TriangleAlert size={14} /> This listing is older than 24 hours. Call before travelling.</p>
          )}
        </>
      ) : (
        <>
          <ul className="pilot-stocklist">
            {shown.map(row => (
              <li key={row.medicine.id}>
                <div>
                  <strong>{row.medicine.name}</strong>
                  <small>{row.medicine.strength} · {row.medicine.pack}</small>
                </div>
                <span className={row.quantity <= 0 ? 'out' : ''}>{row.quantity <= 0 ? 'Out of stock' : `${row.quantity} packs`}</span>
                <b>{money(row.price)}</b>
              </li>
            ))}
          </ul>
          {items.length > 4 && (
            <button type="button" className="pilot-linkbtn" onClick={onToggle}>
              {expanded ? 'Show fewer' : `Show all ${items.length} medicines`}
            </button>
          )}
          {!fresh && (
            <p className="pilot-warnline"><TriangleAlert size={14} /> Last confirmed {ago(lastConfirmed, now)}. Call before travelling.</p>
          )}
        </>
      )}

      <div className="pilot-card-actions">
        <a className="pilot-act" href={`tel:${pharmacy.phone}`}><Phone size={14} /> Call</a>
        <a className="pilot-act wa" href={waLink(pharmacy.whatsapp || pharmacy.phone, whatsappMessage(pharmacy, item))} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
        {pharmacy.address && (
          <a className="pilot-act" href={mapsLink(pharmacy.address)} target="_blank" rel="noreferrer"><MapPin size={14} /> Directions</a>
        )}
      </div>
      <div className="pilot-card-meta">
        <ShieldCheck size={12} />
        <span>Manual licence check · {dateLabel(pharmacy.licenceCheckedAt)}</span>
      </div>
    </article>
  );
}

export default function DirectoryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [city, setCity] = useState('All cities');
  const [medicineId, setMedicineId] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api('/api/pilot/public');
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const now = data?.serverTime || Date.now();
  const pharmacies = useMemo(() => (data?.pharmacies || []).map(pharmacy => ({
    ...pharmacy,
    items: pharmacy.inventory
      .map(row => ({ ...row, medicine: medicineById.get(row.medicineId) }))
      .filter(row => row.medicine),
  })), [data]);

  const allItems = pharmacies.flatMap(pharmacy => pharmacy.items);
  const staleCount = allItems.filter(item => !isFresh(confirmedAt(item), now)).length;
  const lastConfirmed = pharmacies.reduce((latest, pharmacy) => Math.max(latest, pharmacy.lastConfirmedAt || 0), 0);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const list = pharmacies
      .filter(pharmacy => city === 'All cities' || pharmacy.city === city)
      .filter(pharmacy => !search || [pharmacy.name, pharmacy.area, pharmacy.address].some(value => value.toLowerCase().includes(search)))
      .map(pharmacy => ({
        ...pharmacy,
        items: medicineId === 'all' ? pharmacy.items : pharmacy.items.filter(item => item.medicineId === medicineId),
      }))
      .filter(pharmacy => pharmacy.items.length);
    if (medicineId === 'all') return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a, b) => {
      const stock = (b.items[0].quantity > 0 ? 1 : 0) - (a.items[0].quantity > 0 ? 1 : 0);
      return stock || a.items[0].price - b.items[0].price || a.name.localeCompare(b.name);
    });
  }, [pharmacies, city, medicineId, query]);

  const selectedMedicine = medicineId === 'all' ? null : medicineById.get(medicineId);
  const filtered = city !== 'All cities' || medicineId !== 'all' || query.trim();
  const reset = () => { setCity('All cities'); setMedicineId('all'); setQuery(''); };
  const toggle = id => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      <section className="pilot-hero pilot-wrap">
        <div className="pilot-hero-copy">
          <span className="pilot-live"><i aria-hidden="true" /> Live pilot directory</span>
          <h1>Know what&apos;s on the shelf <em>before you travel.</em></h1>
          <p>Participating pharmacies in Lagos and Ibadan publish the medicines they have and the price per pack. Every item shows when the pharmacy last confirmed it.</p>
          <div className="pilot-hero-actions">
            <button className="p-btn primary" onClick={() => document.getElementById('stock-search')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Find stock <ArrowRight size={16} /></button>
            <a className="p-btn ghost" href="#/join"><Store size={16} /> I own a pharmacy</a>
          </div>
        </div>
        <aside className="pilot-live-card" aria-label="Pilot summary">
          <div className="pilot-live-head">
            <span className="pilot-live"><i aria-hidden="true" /> Pilot status</span>
            <span>{data ? `${pharmacies.length} ${pharmacies.length === 1 ? 'pharmacy' : 'pharmacies'}` : 'Loading'}</span>
          </div>
          <dl>
            <div><dt>Price reports</dt><dd>{data ? allItems.length : '—'}</dd></div>
            <div><dt>Need reconfirmation</dt><dd className={data && staleCount ? 'warn' : ''}>{data ? staleCount : '—'}</dd></div>
            <div><dt>Last pharmacy confirmation</dt><dd>{data ? (lastConfirmed ? ago(lastConfirmed, now) : 'No reports yet') : '—'}</dd></div>
          </dl>
          <p>Only participating pharmacies appear. Listings are self-reported and manually licence-checked before activation.</p>
        </aside>
      </section>

      <section className="pilot-search-section pilot-wrap" id="stock-search">
        <div className="pilot-searchbar">
          <label className="pilot-field">
            <span>City</span>
            <div className="pilot-select">
              <select value={city} onChange={event => setCity(event.target.value)} aria-label="Filter by city">
                {cities.map(option => <option key={option}>{option}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>
          <label className="pilot-field pilot-field-wide">
            <span>Medicine</span>
            <div className="pilot-select">
              <select value={medicineId} onChange={event => setMedicineId(event.target.value)} aria-label="Filter by medicine">
                <option value="all">All medicines</option>
                {medicines.map(medicine => (
                  <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.strength}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>
          <label className="pilot-field pilot-field-wide">
            <span>Pharmacy or area</span>
            <div className="pilot-input">
              <Search size={15} />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Ikeja" aria-label="Search pharmacy or area" />
            </div>
          </label>
          <button className="pilot-icon-btn pilot-clear" onClick={reset} disabled={!filtered} aria-label="Clear filters" title="Clear filters"><X size={16} /> Clear</button>
        </div>

        {error && (
          <div className="pilot-alert error" role="alert">
            <span>{error}</span>
            <button onClick={load}>Try again</button>
          </div>
        )}

        <div className="pilot-results-head">
          <div>
            <span className="eyebrow plain">{selectedMedicine ? `${city === 'All cities' ? 'LAGOS & IBADAN' : city.toUpperCase()} · LISTED STOCK` : 'PARTICIPATING PHARMACIES'}</span>
            <h2>{selectedMedicine ? `${selectedMedicine.name} ${selectedMedicine.strength}` : 'Pharmacies in the pilot'}</h2>
            <p>{selectedMedicine ? `${selectedMedicine.form} · ${selectedMedicine.pack}` : 'Pharmacies with at least one listed medicine'}</p>
          </div>
          <div className="pilot-results-actions">
            <span>{loading && !data ? 'Loading listings…' : `${visible.length} ${visible.length === 1 ? 'pharmacy' : 'pharmacies'}`}</span>
            <button className="pilot-refresh" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {!data && loading ? (
          <div className="pilot-skeleton-grid" aria-label="Loading pharmacy listings">
            {[0, 1].map(key => <div className="pilot-card pilot-skeleton" key={key}><span /><span /><span /></div>)}
          </div>
        ) : !data ? null : pharmacies.length === 0 ? (
          <div className="pilot-empty">
            <Store size={36} />
            <h2>No pharmacies have published stock yet.</h2>
            <p>This pilot is being onboarded in Lagos and Ibadan. If you own or manage a pharmacy, request a private workspace link.</p>
            <a className="p-btn primary" href="#/join">Join the pilot <ArrowRight size={15} /></a>
          </div>
        ) : visible.length === 0 ? (
          <div className="pilot-empty">
            <Search size={34} />
            <h2>No listings match these filters.</h2>
            <p>Try another medicine, city or search term.</p>
            <button className="p-btn ghost" onClick={reset}>Clear filters</button>
          </div>
        ) : (
          <div className="pilot-grid">
            {visible.map(pharmacy => (
              <PharmacyCard
                key={pharmacy.id}
                pharmacy={pharmacy}
                item={selectedMedicine ? pharmacy.items[0] : null}
                now={now}
                expanded={expanded.has(pharmacy.id)}
                onToggle={() => toggle(pharmacy.id)}
              />
            ))}
          </div>
        )}

        <p className="pilot-inline-note"><TriangleAlert size={14} /> Listings are self-reported by pharmacies and can change. Confirm stock and price by phone before travelling. Medstock does not process payments, reservations or prescriptions.</p>
      </section>

      <section className="pilot-explain pilot-wrap">
        <article>
          <Clock3 size={22} />
          <h3>Freshness on every item</h3>
          <p>Listings show when the pharmacy last confirmed them. Anything older than 24 hours carries a call-first warning.</p>
        </article>
        <article>
          <ShieldCheck size={22} />
          <h3>Manual licence checks</h3>
          <p>We record each participant&apos;s premises registration number and superintendent pharmacist before activation. This is not a regulator verification.</p>
        </article>
        <article>
          <Phone size={22} />
          <h3>A signal, not a reservation</h3>
          <p>Stock moves quickly. Call or WhatsApp the pharmacy before you travel; no stock is held for you.</p>
        </article>
      </section>

      <section className="pilot-wrap">
        <div className="pilot-cta-band">
          <div>
            <span className="eyebrow">FOR LAGOS &amp; IBADAN PHARMACIES</span>
            <h2>Put your shelf on the map.</h2>
            <p>Join a small pilot and publish your pack prices in minutes. No passwords, no commissions, and you decide what appears.</p>
          </div>
          <div className="pilot-cta-actions">
            <a className="p-btn light" href="#/join">Request a pharmacy link <ArrowRight size={16} /></a>
            <small>A private WhatsApp link opens your workspace.</small>
          </div>
        </div>
      </section>
    </>
  );
}
