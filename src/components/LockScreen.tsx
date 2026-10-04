import { useRef, useState, type FormEvent } from 'react';
import { isSealedVault, WrongPassphraseError, type SealedVault } from '../crypto/vault';
import type { VaultApi } from '../state/useVault';

const MIN_LEN = 8;

export default function LockScreen({ api }: { api: VaultApi }) {
  const isNew = api.status === 'new';
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<SealedVault | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const mode: 'create' | 'unlock' | 'import' = importing ? 'import' : isNew ? 'create' : 'unlock';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'create') {
      if (pass.length < MIN_LEN) return setError(`Make it at least ${MIN_LEN} characters — a short phrase is perfect.`);
      if (pass !== confirm) return setError('Those two don’t match yet.');
    }
    setBusy(true);
    try {
      if (mode === 'create') await api.create(pass);
      else if (mode === 'import') await api.importSealed(importing!, pass);
      else await api.unlock(pass);
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? 'Hmm, that’s not it. Try again?' : (err as Error).message);
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!isSealedVault(parsed)) throw new Error();
      setImporting(parsed);
      setError(null);
      setPass('');
    } catch {
      setError('That file isn’t a Heartstrings backup.');
    }
  }

  return (
    <div className="lock">
      <div className="lock-floaties" aria-hidden>
        {['💗', '🌼', '💘', '✨', '🔥', '🌈', '💞', '🦋'].map((e, i) => (
          <span key={i} style={{ '--i': i, top: `${[12, 70, 30, 82, 18, 60, 40, 88][i]}%` } as React.CSSProperties}>
            {e}
          </span>
        ))}
      </div>
      <form className="lock-card" onSubmit={submit}>
        <div className="lock-logo">💗</div>
        <h1>Heartstrings</h1>
        <p className="lock-sub">
          {mode === 'create' && 'Map the people you love, in every shape love comes in.'}
          {mode === 'unlock' && 'Welcome back! Your constellation is locked up safe.'}
          {mode === 'import' && 'Enter the passphrase this backup was saved with.'}
        </p>

        <label className="field">
          <span>{mode === 'create' ? 'Choose a passphrase' : 'Passphrase'}</span>
          <input
            type="password"
            autoFocus
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="something only you know"
          />
        </label>
        {mode === 'create' && (
          <label className="field">
            <span>Once more</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}

        {error && <div className="lock-error">{error}</div>}

        <button className="btn btn-primary btn-big" disabled={busy || !pass}>
          {busy ? 'Working on it…' : mode === 'create' ? 'Create my vault 💗' : 'Unlock ✨'}
        </button>

        {mode === 'create' && (
          <p className="lock-fine">
            🔒 Everything — names, notes, connections — is encrypted on this device with your passphrase (AES-256).
            The passphrase is never saved anywhere, so <b>if you forget it, the data can’t be recovered</b>. Export
            a backup now and then!
          </p>
        )}

        <div className="lock-links">
          {mode === 'import' ? (
            <button type="button" className="linklike" onClick={() => setImporting(null)}>
              ← back
            </button>
          ) : (
            <button type="button" className="linklike" onClick={() => fileInput.current?.click()}>
              Restore from a backup file
            </button>
          )}
          {mode === 'unlock' &&
            (confirmReset ? (
              <span className="lock-reset">
                Erase this vault forever?{' '}
                <button type="button" className="linklike danger" onClick={api.destroy}>
                  Yes, start over
                </button>{' '}
                <button type="button" className="linklike" onClick={() => setConfirmReset(false)}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" className="linklike muted" onClick={() => setConfirmReset(true)}>
                Forgot it? Start fresh
              </button>
            ))}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </form>
    </div>
  );
}
