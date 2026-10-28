import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Clock3, Loader2, LockKeyhole, ShieldCheck, Store,
} from 'lucide-react';
import { api, dateLabel, extractToken } from './pilot-lib.js';

function ManualLink({ value, onChange, onSubmit, error, buttonLabel = 'Continue' }) {
  return (
    <form className="pilot-token-form" onSubmit={onSubmit}>
      <label htmlFor="pilot-token">Private link or token</label>
      <div className="pilot-token-row">
        <input
          id="pilot-token"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="Paste the link from WhatsApp"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="p-btn primary" type="submit">{buttonLabel} <ArrowRight size={15} /></button>
      </div>
      {error && <p className="pilot-field-error" role="alert">{error}</p>}
    </form>
  );
}

export default function JoinPage({ route, session, setSession, navigate, showToast }) {
  const token = route.params.get('token') || '';
  const [phase, setPhase] = useState(token ? 'loading' : 'idle');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPhase('idle');
      setPreview(null);
      setError('');
      return undefined;
    }
    let alive = true;
    setPhase('loading');
    setError('');
    api(`/api/pilot/invite?token=${encodeURIComponent(token)}`)
      .then(data => {
        if (!alive) return;
        setPreview(data);
        setPhase('ready');
      })
      .catch(err => {
        if (!alive) return;
        setError(err.message);
        setPhase('error');
      });
    return () => { alive = false; };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError('');
    try {
      const data = await api('/api/pilot/accept', { method: 'POST', body: JSON.stringify({ token }) });
      setSession({ loading: false, role: 'pharmacy', pharmacy: data.pharmacy });
      showToast(`Workspace opened for ${data.pharmacy.name}.`);
      navigate('/portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  };

  const submitManual = event => {
    event.preventDefault();
    const next = extractToken(manual);
    if (!next) {
      setManualError('Paste the full private link or the 43-character token Medstock sent you.');
      return;
    }
    if (next === token) {
      setManualError('That is the link you are already using.');
      return;
    }
    setManualError('');
    setManual('');
    location.hash = `/join?token=${next}`;
  };

  return (
    <section className="pilot-narrow">
      <a className="pilot-back" href="#/"><ArrowLeft size={15} /> Back to the directory</a>
      <div className="pilot-join-intro">
        <span className="eyebrow plain">FOR LAGOS &amp; IBADAN PHARMACIES</span>
        <h1>Put your shelf <em>on the map.</em></h1>
        <p>The Medstock pilot lets a small group of pharmacies publish the medicines they have and the price per pack. Patients see a clear, call-first listing. No passwords and no commissions.</p>
      </div>

      {session.role === 'pharmacy' && session.pharmacy && (
        <div className="pilot-alert info">
          <ShieldCheck size={16} />
          <span>You are already signed in to <strong>{session.pharmacy.name}</strong>.</span>
          <a href="#/portal">Open workspace</a>
        </div>
      )}

      {phase === 'loading' && (
        <div className="pilot-loading-card">
          <Loader2 size={25} className="spin" />
          <h2>Checking your private link…</h2>
          <p>This only takes a moment.</p>
        </div>
      )}

      {phase === 'ready' && preview && (
        <div className="pilot-card pilot-pad pilot-invite-card">
          <div className="pilot-invite-head">
            <span className="pilot-icon-badge"><Store size={24} /></span>
            <div>
              <span className="pilot-chip ok"><LockKeyhole size={12} /> Private pilot invite</span>
              <h2>{preview.name}</h2>
              <p>{preview.area}, {preview.city}</p>
            </div>
          </div>
          {error && <div className="pilot-alert error" role="alert">{error}</div>}
          <dl className="pilot-detail-list">
            <div><dt>Access</dt><dd>Private workspace for this pharmacy</dd></div>
            <div><dt>Link valid until</dt><dd>{dateLabel(preview.expiresAt)}</dd></div>
            <div><dt>Password</dt><dd>Not needed — this link is your access</dd></div>
          </dl>
          <ul className="pilot-check-list">
            <li><Check size={15} /> Publish up to 20 medicines with a price per pack</li>
            <li><Check size={15} /> Confirm stock so patients see how fresh it is</li>
            <li><Check size={15} /> Edit or remove your listing at any time</li>
            <li><Check size={15} /> Your licence number and superintendent stay private</li>
          </ul>
          <button className="p-btn primary pilot-wide" onClick={accept} disabled={accepting}>
            {accepting ? <><Loader2 size={16} className="spin" /> Opening workspace…</> : <>Open my workspace <ArrowRight size={16} /></>}
          </button>
          <p className="pilot-small">Keep this link private. Anyone with it can update this pharmacy&apos;s stock. Ask Medstock to replace it if it is shared by mistake.</p>
          <details className="pilot-manual-collapse">
            <summary>Open a different pharmacy link</summary>
            <ManualLink value={manual} onChange={setManual} onSubmit={submitManual} error={manualError} />
          </details>
        </div>
      )}

      {phase === 'error' && (
        <>
          <div className="pilot-alert error" role="alert">{error}</div>
          <div className="pilot-card pilot-pad">
            <h2 className="pilot-h3">Open your workspace</h2>
            <p className="pilot-body">If Medstock sent you a newer link, paste it below. Links expire after 30 days.</p>
            <ManualLink value={manual} onChange={setManual} onSubmit={submitManual} error={manualError} />
          </div>
        </>
      )}

      {phase === 'idle' && (
        <>
          <div className="pilot-join-steps">
            <article>
              <span className="pilot-step-icon"><ShieldCheck size={20} /></span>
              <h3>1. Quick licence check</h3>
              <p>Medstock records your premises registration number and superintendent pharmacist before activation.</p>
            </article>
            <article>
              <span className="pilot-step-icon"><Clock3 size={20} /></span>
              <h3>2. Get a private link</h3>
              <p>We send a WhatsApp link to the verified pharmacy contact. No password to create or remember.</p>
            </article>
            <article>
              <span className="pilot-step-icon"><Store size={20} /></span>
              <h3>3. Publish your shelf</h3>
              <p>Add up to 20 medicines, set pack prices and confirm your stock. Update it whenever things change.</p>
            </article>
          </div>
          <div className="pilot-card pilot-pad">
            <h2 className="pilot-h3">Already have your link?</h2>
            <p className="pilot-body">Open the link Medstock sent on WhatsApp, or paste it here.</p>
            <ManualLink value={manual} onChange={setManual} onSubmit={submitManual} error={manualError} buttonLabel="Open" />
          </div>
          <div className="pilot-join-note">
            <ShieldCheck size={18} />
            <p><strong>Built for a small, verified pilot.</strong> We are onboarding a limited number of pharmacies in Lagos and Ibadan. Medstock does not take a commission, process prescriptions or share your private licence details publicly.</p>
          </div>
        </>
      )}
    </section>
  );
}
