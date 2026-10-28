import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Eye, Loader2, LogOut,
  Package, Plus, ShieldCheck, Store, Trash2, TriangleAlert,
} from 'lucide-react';
import { ago, api, dateLabel, extractToken, medicines, money, stockLabel } from './pilot-lib.js';

const medicineById = new Map(medicines.map(medicine => [medicine.id, medicine]));

function toRows(inventory) {
  return (inventory || []).map(row => ({
    medicineId: row.medicineId,
    quantity: String(row.quantity),
    price: String(row.price),
  }));
}

function rowsProblem(rows) {
  for (const row of rows) {
    const medicine = medicineById.get(row.medicineId);
    const name = medicine ? medicine.name : 'Item';
    const quantity = Number(row.quantity);
    if (String(row.quantity).trim() === '' || !Number.isInteger(quantity) || quantity < 0 || quantity > 100000) {
      return `${name}: enter a whole number of packs from 0 to 100,000.`;
    }
    const price = Number(row.price);
    if (String(row.price).trim() === '' || !Number.isFinite(price) || price <= 0 || price > 1000000) {
      return `${name}: enter a price from ₦0.01 to ₦1,000,000 per pack.`;
    }
  }
  return '';
}

function LockedWorkspace({ session, navigate }) {
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');

  const submit = event => {
    event.preventDefault();
    const token = extractToken(manual);
    if (!token) {
      setError('Paste the private link Medstock sent you on WhatsApp.');
      return;
    }
    setError('');
    setManual('');
    location.hash = `/join?token=${token}`;
  };

  if (session.loading) {
    return (
      <section className="pilot-narrow">
        <div className="pilot-loading-card"><Loader2 size={25} className="spin" /><h2>Checking your workspace…</h2></div>
      </section>
    );
  }

  return (
    <section className="pilot-narrow">
      <a className="pilot-back" href="#/"><ArrowLeft size={15} /> Back to the directory</a>
      <div className="pilot-join-intro">
        <span className="eyebrow plain">PRIVATE PHARMACY WORKSPACE</span>
        <h1>Open your link <em>to continue.</em></h1>
        <p>Your workspace is protected by the private link Medstock sent you. There is no password to remember.</p>
      </div>
      {session.role === 'admin' ? (
        <div className="pilot-card pilot-pad">
          <h2 className="pilot-h3">You are signed in as Medstock staff.</h2>
          <p className="pilot-body">Pharmacy workspaces open through their own private links.</p>
          <a className="p-btn primary" href="#/admin">Go to the admin console <ArrowRight size={15} /></a>
        </div>
      ) : (
        <div className="pilot-card pilot-pad">
          <h2 className="pilot-h3">Open your workspace</h2>
          <p className="pilot-body">Paste the link from WhatsApp. It is valid for 30 days; ask Medstock for a new one if it has expired.</p>
          <form className="pilot-token-form" onSubmit={submit}>
            <label htmlFor="portal-token">Private link or token</label>
            <div className="pilot-token-row">
              <input id="portal-token" value={manual} onChange={event => setManual(event.target.value)} placeholder="Paste the link from WhatsApp" autoComplete="off" spellCheck={false} />
              <button className="p-btn primary" type="submit">Continue <ArrowRight size={15} /></button>
            </div>
            {error && <p className="pilot-field-error" role="alert">{error}</p>}
          </form>
          <p className="pilot-small">No link yet? <a href="#/join">Join the pilot</a>.</p>
        </div>
      )}
      <div className="pilot-join-note">
        <ShieldCheck size={18} />
        <p>For your safety, never share your pharmacy link in a public group. Ask Medstock to replace it if it is shared by mistake.</p>
      </div>
    </section>
  );
}

export default function PortalPage({ session, setSession, navigate, showToast }) {
  const pharmacy = session.pharmacy;
  const [rows, setRows] = useState(() => toRows(pharmacy?.inventory));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addId, setAddId] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addPrice, setAddPrice] = useState('');

  useEffect(() => {
    setRows(toRows(pharmacy?.inventory));
    setDirty(false);
    setError('');
  }, [pharmacy]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (session.loading || session.role !== 'pharmacy' || !pharmacy) {
    return <LockedWorkspace session={session} navigate={navigate} />;
  }

  const available = medicines.filter(medicine => !rows.some(row => row.medicineId === medicine.id));
  const activeAddId = available.some(medicine => medicine.id === addId) ? addId : available[0]?.id || '';
  const lastConfirmed = (pharmacy.inventory || []).reduce((latest, row) => Math.max(latest, row.confirmedAt || row.updatedAt || 0), 0);
  const totalPacks = rows.reduce((sum, row) => sum + (Number.isInteger(Number(row.quantity)) ? Number(row.quantity) : 0), 0);
  const outOfStock = rows.filter(row => Number(row.quantity) <= 0).length;

  const updateRow = (index, key, value) => {
    setRows(current => current.map((row, position) => position === index ? { ...row, [key]: value } : row));
    setDirty(true);
    setError('');
  };

  const addItem = event => {
    event.preventDefault();
    if (!activeAddId) return;
    const quantity = Number(addQty);
    if (String(addQty).trim() === '' || !Number.isInteger(quantity) || quantity < 0 || quantity > 100000) {
      setError('Enter a whole number of packs from 0 to 100,000.');
      return;
    }
    const price = Number(addPrice);
    if (String(addPrice).trim() === '' || !Number.isFinite(price) || price <= 0 || price > 1000000) {
      setError('Enter a price from ₦0.01 to ₦1,000,000 per pack.');
      return;
    }
    setRows(current => [...current, { medicineId: activeAddId, quantity: String(quantity), price: String(price) }]);
    setDirty(true);
    setError('');
    setAddQty('');
    setAddPrice('');
    setAddId('');
  };

  const removeRow = index => {
    setRows(current => current.filter((_, position) => position !== index));
    setDirty(true);
    setError('');
  };

  const discard = () => {
    setRows(toRows(pharmacy.inventory));
    setDirty(false);
    setError('');
  };

  const save = async () => {
    const problem = rowsProblem(rows);
    if (problem) { setError(problem); return; }
    if (rows.length === 0 && !window.confirm('Your public listing will be removed because no medicines are listed. Continue?')) return;
    setSaving(true);
    setError('');
    try {
      const data = await api('/api/pilot/inventory', {
        method: 'PUT',
        body: JSON.stringify({
          inventory: rows.map(row => ({ medicineId: row.medicineId, quantity: Number(row.quantity), price: Number(row.price) })),
        }),
      });
      setSession({ loading: false, role: 'pharmacy', pharmacy: data.pharmacy });
      setRows(toRows(data.pharmacy.inventory));
      setDirty(false);
      showToast('Stock confirmed and published.');
    } catch (err) {
      if (err.status === 401) {
        setSession({ loading: false, role: null, pharmacy: null });
        showToast('Your session expired. Open your private link again.');
        navigate('/join');
        return;
      }
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    try { await api('/api/pilot/session', { method: 'DELETE' }); } catch {}
    setSession({ loading: false, role: null, pharmacy: null });
    showToast('Signed out.');
    navigate('/');
  };

  return (
    <section className="pilot-portal pilot-wrap">
      <div className="pilot-page-head">
        <div>
          <span className="eyebrow plain">PHARMACY WORKSPACE</span>
          <h1>{pharmacy.name}</h1>
          <p>{pharmacy.address} · {pharmacy.area}, {pharmacy.city}</p>
          <div className="pilot-head-chips">
            <span className="pilot-chip ok"><ShieldCheck size={13} /> Licence checked manually · {dateLabel(pharmacy.licenceCheckedAt)}</span>
            <span className="pilot-chip muted"><Clock3 size={13} /> Last confirmed {lastConfirmed ? ago(lastConfirmed) : 'not yet'}</span>
          </div>
        </div>
        <div className="pilot-head-actions">
          <a className="p-btn ghost" href="#/" target="_blank" rel="noreferrer">View directory <ArrowUpRight size={15} /></a>
          <button className="p-btn subtle" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </div>

      <div className="pilot-stat-row">
        <article><Package size={18} /><strong>{rows.length}</strong><span>Medicines listed</span></article>
        <article><Store size={18} /><strong>{totalPacks}</strong><span>Packs reported</span></article>
        <article><TriangleAlert size={18} /><strong className={outOfStock ? 'warn' : ''}>{outOfStock}</strong><span>Out-of-stock items</span></article>
      </div>

      <div className="pilot-notice">
        <Eye size={17} />
        <p><strong>This listing is public.</strong> Add a price to publish an item; remove it to hide it immediately. Your licence number and superintendent pharmacist are never shown publicly.</p>
      </div>

      <div className="pilot-portal-grid">
        <div className="pilot-editor pilot-card">
          <div className="pilot-panel-head">
            <div>
              <h2>Your listed medicines</h2>
              <p>Price is per listed pack, not per tablet or dose. Quantities are whole packs.</p>
            </div>
            <span className="pilot-chip muted">{rows.length}/20 listed</span>
          </div>

          {available.length > 0 && (
            <form className="pilot-add" onSubmit={addItem}>
              <label className="pilot-field pilot-field-wide">
                <span>Add a medicine</span>
                <div className="pilot-select">
                  <select value={activeAddId} onChange={event => setAddId(event.target.value)} aria-label="Medicine to add">
                    {available.map(medicine => (
                      <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.strength}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label className="pilot-field">
                <span>Packs</span>
                <input value={addQty} onChange={event => setAddQty(event.target.value)} inputMode="numeric" placeholder="e.g. 24" aria-label="Packs in stock" />
              </label>
              <label className="pilot-field">
                <span>Price / pack (₦)</span>
                <input value={addPrice} onChange={event => setAddPrice(event.target.value)} inputMode="decimal" placeholder="e.g. 2400" aria-label="Price per pack in naira" />
              </label>
              <button className="p-btn secondary" type="submit"><Plus size={15} /> Add</button>
            </form>
          )}

          {error && <div className="pilot-alert error" role="alert"><span>{error}</span></div>}

          {rows.length === 0 ? (
            <div className="pilot-empty compact">
              <Store size={28} />
              <h2>No medicines listed yet.</h2>
              <p>Add your first medicine above. It appears in the public directory as soon as you save.</p>
            </div>
          ) : (
            <div className="pilot-table-wrap" tabIndex={0} role="region" aria-label="Inventory table">
              <table className="pilot-table">
                <thead>
                  <tr>
                    <th>Medicine / pack</th>
                    <th>Status</th>
                    <th>Packs in stock</th>
                    <th>Price per pack</th>
                    <th><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const medicine = medicineById.get(row.medicineId);
                    const quantity = Number(row.quantity);
                    return (
                      <tr key={row.medicineId}>
                        <td data-label="Medicine">
                          <strong>{medicine.name} <span>{medicine.strength}</span></strong>
                          <small>{medicine.pack}</small>
                        </td>
                        <td data-label="Status">
                          <span className={`pilot-chip ${quantity > 0 ? 'ok' : 'muted'}`}>{stockLabel(quantity)}</span>
                        </td>
                        <td data-label="Packs">
                          <input
                            className="pilot-inline-input"
                            value={row.quantity}
                            onChange={event => updateRow(index, 'quantity', event.target.value)}
                            inputMode="numeric"
                            aria-label={`Packs of ${medicine.name}`}
                          />
                        </td>
                        <td data-label="Price">
                          <div className="pilot-price-input">
                            <span>₦</span>
                            <input
                              value={row.price}
                              onChange={event => updateRow(index, 'price', event.target.value)}
                              inputMode="decimal"
                              aria-label={`Price per pack of ${medicine.name}`}
                            />
                          </div>
                          <small className="pilot-price-preview">{money(Number(row.price) || 0)}</small>
                        </td>
                        <td>
                          <button className="pilot-remove" onClick={() => removeRow(index)} aria-label={`Remove ${medicine.name}`}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="pilot-save-row">
            <p>{dirty ? 'You have unsaved changes. Saving confirms every listed item as of now.' : lastConfirmed ? `All changes saved. Last confirmed ${ago(lastConfirmed)}.` : 'Nothing saved yet.'}</p>
            <div className="pilot-save-actions">
              {dirty && <button className="p-btn subtle" onClick={discard} disabled={saving}>Discard</button>}
              <button className="p-btn primary" onClick={save} disabled={saving || !dirty}>
                {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : <><Check size={16} /> Save &amp; confirm stock</>}
              </button>
            </div>
          </div>
        </div>

        <aside className="pilot-side">
          <div className="pilot-side-card">
            <span className="pilot-side-icon"><Store size={19} /></span>
            <h3>What the public sees</h3>
            <ul>
              <li>Pharmacy name, area, address and phone</li>
              <li>Each listed medicine, pack price and reported quantity</li>
              <li>When you last confirmed the item</li>
            </ul>
          </div>
          <div className="pilot-side-card">
            <span className="pilot-side-icon"><Clock3 size={19} /></span>
            <h3>Why freshness matters</h3>
            <p>After 24 hours, patients see a call-first warning instead of a fresh badge. Confirm your stock whenever it changes — it takes a few seconds.</p>
          </div>
          <div className="pilot-side-card">
            <span className="pilot-side-icon"><ShieldCheck size={19} /></span>
            <h3>Private by default</h3>
            <p>Your licence number, superintendent pharmacist and email are visible only to Medstock staff reviewing the pilot.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
