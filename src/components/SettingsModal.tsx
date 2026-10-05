import { useState } from 'react';
import { newId, TYPE_COLORS, TYPE_EMOJI } from '../model/defaults';
import type { Emphasis, RelationshipType, Vault } from '../model/types';
import type { Action } from '../state/reducer';
import type { Prefs } from '../state/usePrefs';
import type { VaultApi } from '../state/useVault';
import { ConfirmButton, EmojiPicker, Modal, Swatches, Toggle } from './ui';

type Tab = 'types' | 'privacy' | 'backup';

export default function SettingsModal({
  api,
  prefs,
  setPrefs,
  onClose,
}: {
  api: VaultApi;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('types');
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="tabs">
        {(
          [
            ['types', '🎨 Relationship types'],
            ['privacy', '🔒 Privacy'],
            ['backup', '💾 Backup'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'types' && <TypesTab vault={api.vault} dispatch={api.dispatch} />}
      {tab === 'privacy' && <PrivacyTab api={api} prefs={prefs} setPrefs={setPrefs} />}
      {tab === 'backup' && <BackupTab api={api} />}
    </Modal>
  );
}

function TypesTab({ vault, dispatch }: { vault: Vault; dispatch: (a: Action) => void }) {
  const counts = new Map<string, number>();
  for (const r of vault.relationships) counts.set(r.typeId, (counts.get(r.typeId) ?? 0) + 1);

  const add = () =>
    dispatch({
      type: 'upsertType',
      relType: { id: newId(), label: 'New type', emoji: '✨', color: TYPE_COLORS[vault.types.length % TYPE_COLORS.length], dashed: false, emphasis: 'normal', builtIn: false },
    });

  return (
    <div className="types-tab">
      <p className="hint">
        Rename, recolour, or invent your own kinds of connection. Every type is directional and independent. “BIG” types
        draw thick and glowing with a badge on the line; “whisper” types draw thin and faint.
      </p>
      {vault.types.map((t) => (
        <TypeEditor key={t.id} t={t} count={counts.get(t.id) ?? 0} dispatch={dispatch} />
      ))}
      <button className="btn btn-primary" onClick={add}>
        ＋ Add a type
      </button>
    </div>
  );
}

function TypeEditor({ t, count, dispatch }: { t: RelationshipType; count: number; dispatch: (a: Action) => void }) {
  const set = (patch: Partial<RelationshipType>) => dispatch({ type: 'upsertType', relType: { ...t, ...patch } });
  return (
    <div className="type-editor" style={{ '--c': t.color } as React.CSSProperties}>
      <div className="type-editor-row">
        <EmojiPicker value={t.emoji} options={TYPE_EMOJI} onChange={(emoji) => set({ emoji })} />
        <input value={t.label} onChange={(e) => set({ label: e.target.value })} aria-label="Type name" />
        <select value={t.emphasis} onChange={(e) => set({ emphasis: e.target.value as Emphasis })} aria-label="Line style" title="How loudly this type draws on the map">
          <option value="subtle">whisper</option>
          <option value="normal">normal</option>
          <option value="bold">BIG 💖</option>
        </select>
        <Toggle checked={t.dashed} onChange={(dashed) => set({ dashed })} label="dashed" color={t.color} />
        <span className="count" title="connections of this type">
          {count}
        </span>
        <ConfirmButton
          onConfirm={() => dispatch({ type: 'removeType', id: t.id })}
          label={count ? `Delete + ${count} links?` : 'Delete?'}
        >
          🗑
        </ConfirmButton>
      </div>
      <Swatches value={t.color} options={TYPE_COLORS} onChange={(color) => set({ color })} />
    </div>
  );
}

function PrivacyTab({ api, prefs, setPrefs }: { api: VaultApi; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function change() {
    if (p1.length < 8) return setMsg('At least 8 characters, please.');
    if (p1 !== p2) return setMsg('Those don’t match.');
    await api.changePassphrase(p1);
    setP1('');
    setP2('');
    setMsg('Done! Your vault is re-encrypted with the new passphrase. 💗');
  }

  return (
    <div className="privacy-tab">
      <section>
        <h4>How your data is stored</h4>
        <p className="hint">
          Everything is encrypted with AES-256-GCM using a key derived from your passphrase (PBKDF2, 600k rounds). Only
          the scrambled ciphertext is saved in this browser. Your passphrase is never stored — not even hashed.
        </p>
      </section>
      <section>
        <h4>Auto-lock</h4>
        <label className="field-inline">
          Lock after
          <select value={prefs.autoLockMinutes} onChange={(e) => setPrefs({ autoLockMinutes: Number(e.target.value) })}>
            <option value={0}>never</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={60}>1 hour</option>
          </select>
          of inactivity
        </label>
      </section>
      <section>
        <h4>Change passphrase</h4>
        <input type="password" placeholder="new passphrase" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
        <input type="password" placeholder="once more" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
        <button className="btn btn-primary" onClick={change} disabled={!p1}>
          Re-encrypt
        </button>
        {msg && <p className="hint">{msg}</p>}
      </section>
      <section>
        <h4>Danger zone</h4>
        <ConfirmButton onConfirm={api.destroy} label="This erases everything. Click again.">
          Erase vault from this browser
        </ConfirmButton>
      </section>
    </div>
  );
}

function BackupTab({ api }: { api: VaultApi }) {
  const [msg, setMsg] = useState<string | null>(null);

  async function exportFile() {
    const sealed = await api.exportSealed();
    const blob = new Blob([JSON.stringify(sealed, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heartstrings-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Backup saved. It’s still encrypted — you’ll need your passphrase to restore it.');
  }

  return (
    <div className="backup-tab">
      <p className="hint">
        Backups are encrypted with your current passphrase, so they’re safe to keep in cloud storage. To restore, use{' '}
        <b>“Restore from a backup file”</b> on the lock screen.
      </p>
      <button className="btn btn-primary" onClick={exportFile}>
        ⬇ Download encrypted backup
      </button>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
