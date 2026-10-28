import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Copy, KeyRound, Loader2, LogOut, MessageCircle, RefreshCw,
  ShieldCheck, Store, X,
} from 'lucide-react';
import {
  ago, api, copyText, dateLabel, extractToken, inviteUrl, waLink,
} from './pilot-lib.js';

const EMPTY_FORM = {
  name: '', city: 'Lagos', area: '', address: '', phone: '', whatsapp: '',
  licenceNumber: '', superintendent: '', licenceChecked: false,
};

const STATUS = {
  active: ['ok', 'Active'],
  invited: ['warn', 'Invite sent'],
  revoked: ['muted', 'Revoked'],
};

function InviteShare({ invite, onDismiss, onCopy }) {
  const link = inviteUrl(invite.token);
  const message = `Hello ${invite.name}, here is your private Medstock pilot link. It opens your pharmacy workspace, where you can list up to 20 medicines and confirm stock. Please keep it private: ${link}`;
  return (
    <section className="pilot-invite-share">
      <div className="pilot-invite-share-head">
        <div>
          <span className="pilot-chip ok"><MessageCircle size={12} /> Ready to send</span>
          <h2>{invite.name}</h2>
        </div>
        <button className="pilot-icon-btn" onClick={onDismiss} aria-label="Dismiss invite"><X size={16} /></button>
      </div>
      <p>Send this private link to the verified pharmacy contact. Anyone with it can update their stock, so avoid public groups.</p>
      <div className="pilot-copy-row">
        <code>{link}</code>
        <button onClick={() => onCopy(link, 'Invite link copied.')}><Copy size={14} /> Copy</button>
      </div>
      <div className="pilot-share-actions">
        {invite.phone && (
          <a className="p-btn wa" href={waLink(invite.phone, message)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Open WhatsApp</a>
        )}
        <button className="p-btn ghost" onClick={() => onCopy(message, 'WhatsApp message copied.')}><Copy size={15} /> Copy message</button>
      </div>
      <small>Valid until {dateLabel(invite.expiresAt)} · reusable link for this pharmacy · avoid public groups.</small>
    </section>
  );
}

export default function AdminPage({ route, session, setSession, navigate, showToast }) {
  const token = route.params.get('token') || '';
  const [phase, setPhase] = useState(token ? 'signing' : 'checking');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [invite, setInvite] = useState(null);
  const [adminLink, setAdminLink] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState('');

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    try {
      const [payload, log] = await Promise.all([
        api('/api/admin/pharmacies'),
        api('/api/admin/audit'),
      ]);
      setData(payload);
      setAudit(log.entries || []);
      setPhase('console');
      setError('');
    } catch (err) {
      if (err.status === 401) {
        setSession({ loading: false, role: null, pharmacy: null });
        setPhase('locked');
        setError('Your admin session has ended. Sign in again.');
      } else {
        setError(err.message);
        setPhase(current => current === 'console' ? current : 'error');
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    setPhase('signing');
    setError('');
    api('/api/admin/login', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => {
        if (!alive) return;
        history.replaceState(null, '', `${location.pathname}#/admin`);
        setSession({ loading: false, role: 'admin', pharmacy: null });
        setPhase('checking');
        load();
      })
      .catch(err => {
        if (!alive) return;
        setError(err.message);
        setPhase('locked');
      });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (token) return;
    if (session.loading) { setPhase('checking'); return; }
    if (session.role === 'admin') load();
    else setPhase('locked');
  }, [token, session.loading, session.role]);

  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const copy = async (text, message) => {
    const ok = await copyText(text);
    showToast(ok ? message : 'Copy the link from the prompt.');
  };

  const loginManual = async event => {
    event.preventDefault();
    const parsed = extractToken(manual);
    if (!parsed) {
      setManualError('Paste the full admin link or the 43-character token.');
      return;
    }
    setManualError('');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ token: parsed }) });
      history.replaceState(null, '', `${location.pathname}#/admin`);
      setSession({ loading: false, role: 'admin', pharmacy: null });
      setManual('');
      setPhase('checking');
      await load();
    } catch (err) {
      setManualError(err.message);
    }
  };

  const createPharmacy = async event => {
    event.preventDefault();
    setFormBusy(true);
    setFormError('');
    try {
      const result = await api('/api/admin/pharmacies', { method: 'POST', body: JSON.stringify(form) });
      setInvite({
        token: result.token,
        name: result.pharmacy.name,
        phone: result.pharmacy.whatsapp || result.pharmacy.phone,
        expiresAt: result.pharmacy.inviteExpiresAt,
      });
      setForm({ ...EMPTY_FORM });
      showToast(`${result.pharmacy.name} added. Send the private link.`);
      await load({ quiet: true });
    } catch (err) {
      if (err.status === 401) {
        setSession({ loading: false, role: null, pharmacy: null });
        setPhase('locked');
        setError('Your admin session has ended. Sign in again.');
      } else {
        setFormError(err.message);
      }
    } finally {
      setFormBusy(false);
    }
  };

  const act = async (pharmacy, action) => {
    setBusyId(pharmacy.id);
    setError('');
    try {
      const result = await api('/api/admin/pharmacies', { method: 'PATCH', body: JSON.stringify({ id: pharmacy.id, action }) });
      if (action === 'new-link') {
        setInvite({
          token: result.token,
          name: result.pharmacy.name,
          phone: result.pharmacy.whatsapp || result.pharmacy.phone,
          expiresAt: result.pharmacy.inviteExpiresAt,
        });
        showToast(`New link created for ${result.pharmacy.name}.`);
      } else if (action === 'revoke') {
        showToast(`${result.pharmacy.name} revoked. Existing sessions were signed out.`);
      } else {
        showToast(`${pharmacy.name} deleted.`);
      }
      setConfirming(null);
      await load({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const createAdminLink = async () => {
    setBusyId('admin-link');
    setError('');
    try {
      const result = await api('/api/admin/invite', { method: 'POST', body: JSON.stringify({}) });
      setAdminLink(result);
      showToast('Backup admin link created.');
      await load({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const signOut = async () => {
    try { await api('/api/pilot/session', { method: 'DELETE' }); } catch {}
    setSession({ loading: false, role: null, pharmacy: null });
    showToast('Signed out.');
    navigate('/');
  };

  if (phase === 'checking' || phase === 'signing') {
    return (
      <section className="pilot-narrow">
        <div className="pilot-loading-card">
          <Loader2 size={25} className="spin" />
          <h2>{phase === 'signing' ? 'Signing you in…' : 'Checking admin access…'}</h2>
        </div>
      </section>
    );
  }

  if (phase === 'error') {
    return (
      <section className="pilot-narrow">
        <div className="pilot-loading-card">
          <h2>The admin console is unavailable.</h2>
          <p>{error}</p>
          <button className="p-btn primary" onClick={() => load()}>Try again</button>
        </div>
      </section>
    );
  }

  if (phase === 'locked') {
    return (
      <section className="pilot-narrow">
        <a className="pilot-back" href="#/"><ArrowLeft size={15} /> Back to the directory</a>
        <div className="pilot-join-intro">
          <span className="eyebrow plain">MEDSTOCK STAFF</span>
          <h1>Pilot admin console.</h1>
          <p>Onboard pharmacies, issue private links and review pilot activity. Access uses a single-use admin link.</p>
        </div>
        {error && <div className="pilot-alert error" role="alert">{error}</div>}
        <div className="pilot-card pilot-pad">
          <h2 className="pilot-h3">Staff sign in</h2>
          <p className="pilot-body">Paste the admin link issued by Medstock. Each link works once and expires after 7 days.</p>
          <form className="pilot-token-form" onSubmit={loginManual}>
            <label htmlFor="admin-token">Admin link or token</label>
            <div className="pilot-token-row">
              <input id="admin-token" value={manual} onChange={event => setManual(event.target.value)} placeholder="Paste your admin link" autoComplete="off" spellCheck={false} />
              <button className="p-btn primary" type="submit">Sign in <ArrowRight size={15} /></button>
            </div>
            {manualError && <p className="pilot-field-error" role="alert">{manualError}</p>}
          </form>
        </div>
        <div className="pilot-join-note">
          <ShieldCheck size={18} />
          <p>Not staff? Return to the <a href="#/">public directory</a> or request a <a href="#/join">pharmacy link</a>. Admin actions are recorded in the pilot audit log.</p>
        </div>
      </section>
    );
  }

  const stats = data?.stats || { active: 0, invited: 0, revoked: 0, listed: 0 };

  return (
    <section className="pilot-admin pilot-wrap">
      <div className="pilot-page-head">
        <div>
          <span className="eyebrow plain">MEDSTOCK STAFF</span>
          <h1>Pilot admin</h1>
          <p>Onboard pharmacies, issue private links and review activity.</p>
        </div>
        <div className="pilot-head-actions">
          <button className="p-btn ghost" onClick={() => load()} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
          <button className="p-btn subtle" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </div>

      {error && <div className="pilot-alert error" role="alert"><span>{error}</span><button onClick={() => load()}>Retry</button></div>}

      <div className="pilot-stat-row admin">
        <article><Store size={18} /><strong>{stats.active}</strong><span>Active pharmacies</span></article>
        <article><MessageCircle size={18} /><strong>{stats.invited}</strong><span>Invites pending</span></article>
        <article><X size={18} /><strong>{stats.revoked}</strong><span>Revoked</span></article>
        <article><ShieldCheck size={18} /><strong>{stats.listed}</strong><span>Public price reports</span></article>
      </div>

      {invite && <InviteShare invite={invite} onDismiss={() => setInvite(null)} onCopy={copy} />}

      <div className="pilot-admin-grid">
        <div className="pilot-card pilot-pad pilot-onboard">
          <h2>Onboard a pharmacy</h2>
          <p className="pilot-body">Check the licence details before adding. The pharmacy receives a private link to publish stock; no password is created.</p>
          <form className="pilot-form-grid" onSubmit={createPharmacy}>
            <label className="pilot-field pilot-span-2"><span>Pharmacy name</span><input value={form.name} onChange={event => setField('name', event.target.value)} maxLength={80} required /></label>
            <label className="pilot-field"><span>City</span>
              <div className="pilot-select">
                <select value={form.city} onChange={event => setField('city', event.target.value)}>
                  <option>Lagos</option>
                  <option>Ibadan</option>
                </select>
              </div>
            </label>
            <label className="pilot-field"><span>Area</span><input value={form.area} onChange={event => setField('area', event.target.value)} maxLength={60} required /></label>
            <label className="pilot-field pilot-span-2"><span>Street address</span><input value={form.address} onChange={event => setField('address', event.target.value)} maxLength={160} required /></label>
            <label className="pilot-field"><span>Phone</span><input value={form.phone} onChange={event => setField('phone', event.target.value)} inputMode="tel" placeholder="080…" required /></label>
            <label className="pilot-field"><span>WhatsApp number <small>(optional)</small></span><input value={form.whatsapp} onChange={event => setField('whatsapp', event.target.value)} inputMode="tel" placeholder="Same as phone" /></label>
            <label className="pilot-field"><span>PCN premises number</span><input value={form.licenceNumber} onChange={event => setField('licenceNumber', event.target.value)} maxLength={40} required /></label>
            <label className="pilot-field"><span>Superintendent pharmacist</span><input value={form.superintendent} onChange={event => setField('superintendent', event.target.value)} maxLength={80} required /></label>
            <label className="pilot-check pilot-span-2">
              <input type="checkbox" checked={form.licenceChecked} onChange={event => setField('licenceChecked', event.target.checked)} />
              <span>I checked the premises registration number and superintendent pharmacist for this pharmacy.</span>
            </label>
            {formError && <div className="pilot-alert error pilot-span-2" role="alert">{formError}</div>}
            <button className="p-btn primary pilot-span-2" type="submit" disabled={formBusy}>
              {formBusy ? <><Loader2 size={16} className="spin" /> Adding…</> : <>Add pharmacy &amp; generate link <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <div className="pilot-card pilot-admin-list">
          <div className="pilot-panel-head">
            <div>
              <h2>Pilot pharmacies</h2>
              <p>Private licence details stay in this console.</p>
            </div>
            <span className="pilot-chip muted">{data?.pharmacies.length || 0} total</span>
          </div>
          {!data?.pharmacies.length ? (
            <div className="pilot-empty compact">
              <Store size={28} />
              <h2>No pharmacies yet.</h2>
              <p>Add the first pharmacy using the form.</p>
            </div>
          ) : (
            <div className="pilot-table-wrap" tabIndex={0} role="region" aria-label="Pilot pharmacy table">
              <table className="pilot-table admin">
                <thead>
                  <tr><th>Pharmacy</th><th>Status</th><th>Contact</th><th>Listing</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {data.pharmacies.map(pharmacy => {
                    const status = STATUS[pharmacy.status] || ['muted', pharmacy.status];
                    return (
                      <tr key={pharmacy.id}>
                        <td data-label="Pharmacy">
                          <strong>{pharmacy.name}</strong>
                          <small>{pharmacy.area}, {pharmacy.city}</small>
                          <small className="pilot-mono">Licence {pharmacy.licenceNumber} · {pharmacy.superintendent}</small>
                        </td>
                        <td data-label="Status">
                          <span className={`pilot-chip ${status[0]}`}>{status[1]}</span>
                          {pharmacy.status === 'invited' && pharmacy.inviteExpiresAt && <small>Link expires {dateLabel(pharmacy.inviteExpiresAt)}</small>}
                          {pharmacy.status === 'active' && <small>Licence checked {dateLabel(pharmacy.licenceCheckedAt)}</small>}
                        </td>
                        <td data-label="Contact">
                          <a href={`tel:${pharmacy.phone}`}>{pharmacy.phone}</a>
                          {pharmacy.whatsapp && pharmacy.whatsapp !== pharmacy.phone && <small>WhatsApp {pharmacy.whatsapp}</small>}
                        </td>
                        <td data-label="Listing">
                          <strong className="pilot-listing-count">{pharmacy.inventoryCount}</strong>
                          <small>{pharmacy.inventoryCount ? `priced · confirmed ${pharmacy.lastConfirmedAt ? ago(pharmacy.lastConfirmedAt) : 'never'}` : 'nothing listed'}</small>
                        </td>
                        <td data-label="Actions">
                          <div className="pilot-row-actions">
                            <button onClick={() => act(pharmacy, 'new-link')} disabled={busyId === pharmacy.id} title="Create a new 30-day link and sign out existing sessions">
                              {pharmacy.status === 'revoked' ? 'Restore link' : 'New link'}
                            </button>
                            {pharmacy.status !== 'revoked' && <button onClick={() => setConfirming({ id: pharmacy.id, action: 'revoke' })} disabled={busyId === pharmacy.id}>Revoke</button>}
                            <button className="danger" onClick={() => setConfirming({ id: pharmacy.id, action: 'delete' })} disabled={busyId === pharmacy.id}>Delete</button>
                          </div>
                          {confirming?.id === pharmacy.id && (
                            <div className="pilot-confirm">
                              <span>{confirming.action === 'delete' ? 'Delete permanently, including sessions?' : 'Revoke access and sign them out?'}</span>
                              <button onClick={() => act(pharmacy, confirming.action)} disabled={busyId === pharmacy.id}>Confirm</button>
                              <button onClick={() => setConfirming(null)}>Cancel</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="pilot-admin-bottom">
        <div className="pilot-card pilot-pad">
          <div className="pilot-panel-head">
            <div><h2>Activity log</h2><p>Staff and pharmacy actions recorded by the pilot.</p></div>
            <button className="pilot-refresh" onClick={() => load()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh</button>
          </div>
          <ul className="pilot-audit" tabIndex={0} aria-label="Pilot activity log">
            {audit.length === 0 && <li className="pilot-audit-empty">No activity recorded yet.</li>}
            {audit.map((entry, index) => (
              <li key={`${entry.at}-${entry.action}-${index}`}>
                <span className={`pilot-audit-dot ${entry.actor === 'pharmacy' ? 'pharmacy' : ''}`} aria-hidden="true" />
                <div>
                  <strong>{entry.summary}</strong>
                  <small>{entry.actor === 'pharmacy' ? 'Pharmacy' : 'Medstock staff'} · {ago(entry.at)}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="pilot-side">
          <div className="pilot-side-card">
            <span className="pilot-side-icon"><KeyRound size={19} /></span>
            <h3>Backup admin access</h3>
            <p>Create a single-use 7-day link for another trusted device. It grants full admin access, so keep it out of group chats.</p>
            {adminLink ? (
              <>
                <div className="pilot-copy-row stack">
                  <code>{inviteUrl(adminLink.token, 'admin')}</code>
                  <button onClick={() => copy(inviteUrl(adminLink.token, 'admin'), 'Admin link copied.')}><Copy size={14} /> Copy</button>
                </div>
                <small>Valid until {dateLabel(adminLink.expiresAt)} · works once.</small>
              </>
            ) : (
              <button className="p-btn secondary" onClick={createAdminLink} disabled={busyId === 'admin-link'}>
                {busyId === 'admin-link' ? <><Loader2 size={15} className="spin" /> Creating…</> : <>Create admin link <KeyRound size={15} /></>}
              </button>
            )}
          </div>
          <div className="pilot-side-card">
            <span className="pilot-side-icon"><ShieldCheck size={19} /></span>
            <h3>Pilot ground rules</h3>
            <ul>
              <li>Check licence details before activation.</li>
              <li>Send links only to the verified contact.</li>
              <li>Revoke at once if a link is shared.</li>
              <li>Never describe the pilot as NAFDAC-verified.</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
