import { useState } from 'react';
import { newId, TYPE_COLORS } from '../model/defaults';
import { TYPE_EMOJI_GROUPS } from '../model/emoji';
import type { Emphasis, RelationshipType, Vault } from '../model/types';
import type { Action } from '../state/reducer';
import type { Prefs } from '../state/usePrefs';
import type { VaultApi } from '../state/useVault';
import { ConfirmButton, EmojiPicker, Modal, Swatches, Toggle } from './ui';

type Tab = 'types' | 'display' | 'privacy' | 'backup';

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
            ['display', '🔎 Display'],
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
      {tab === 'display' && <DisplayTab prefs={prefs} setPrefs={setPrefs} />}
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
      relType: { id: newId(), label: 'New type', emoji: '✨', color: TYPE_COLORS[vault.types.length % TYPE_COLORS.length], dashed: false, emphasis: 'normal', directed: false, builtIn: false, supersedes: [] },
    });

  return (
    <div className="types-tab">
      <p className="hint">
        Rename, recolour, or invent your own kinds of connection. Every type is directional and independent. “BIG” types
        draw thick and glowing with a badge on the line; “whisper” types draw thin and faint. Types marked
        “one-way ok” (like crushes) have a separate switch per direction; the rest are always a shared,
        mutual bond. A type can <b>outrank</b> others: between the same two people only the bigger bond draws on
        the map (a romance hides the friendship under it). Use “show lines under bigger bonds” in the legend to see them all.
      </p>
      {vault.types.map((t) => (
        <TypeEditor key={t.id} t={t} all={vault.types} count={counts.get(t.id) ?? 0} dispatch={dispatch} />
      ))}
      <button className="btn btn-primary" onClick={add}>
        ＋ Add a type
      </button>
    </div>
  );
}

function TypeEditor({
  t,
  all,
  count,
  dispatch,
}: {
  t: RelationshipType;
  all: RelationshipType[];
  count: number;
  dispatch: (a: Action) => void;
}) {
  const set = (patch: Partial<RelationshipType>) => dispatch({ type: 'upsertType', relType: { ...t, ...patch } });
  const outranks = t.supersedes ?? [];
  const toggleOutrank = (id: string) =>
    set({ supersedes: outranks.includes(id) ? outranks.filter((x) => x !== id) : [...outranks, id] });
  return (
    <div className="type-editor" style={{ '--c': t.color } as React.CSSProperties}>
      <div className="type-editor-row">
        <EmojiPicker value={t.emoji} groups={TYPE_EMOJI_GROUPS} onChange={(emoji) => set({ emoji })} />
        <input value={t.label} onChange={(e) => set({ label: e.target.value })} aria-label="Type name" />
        <select value={t.emphasis} onChange={(e) => set({ emphasis: e.target.value as Emphasis })} aria-label="Line style" title="How loudly this type draws on the map">
          <option value="subtle">whisper</option>
          <option value="normal">normal</option>
          <option value="bold">BIG 💖</option>
        </select>
        <span title={t.directed ? 'Each direction is separate (A→B, B→A). Turning this off merges them into one shared bond.' : 'One shared bond. Turning this on splits each bond into A→B and B→A.'}>
          <Toggle checked={t.directed} onChange={(directed) => set({ directed })} label="one-way ok" color={t.color} />
        </span>
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
      {t.directed && (
        <label className="type-editor-verb">
          arrow means <i>A</i>
          <input
            value={t.arrowVerb ?? ''}
            placeholder="feels this toward B"
            onChange={(e) => set({ arrowVerb: e.target.value || undefined })}
            aria-label="What the arrow means"
          />
        </label>
      )}
      <div className="outranks" role="group" aria-label="Types this one hides on the map">
        <span className="hint">outranks</span>
        {all
          .filter((o) => o.id !== t.id)
          .map((o) => (
            <button
              key={o.id}
              className={`outrank-chip ${outranks.includes(o.id) ? 'on' : ''}`}
              style={{ '--c': o.color } as React.CSSProperties}
              aria-pressed={outranks.includes(o.id)}
              title={outranks.includes(o.id) ? `${t.label} draws instead of ${o.label}` : `${o.label} draws alongside ${t.label}`}
              onClick={() => toggleOutrank(o.id)}
            >
              {o.emoji} {o.label}
            </button>
          ))}
      </div>
    </div>
  );
}

function SizeSlider({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="size-slider">
      <span className="size-slider-head">
        <b>{label}</b>
        <span className="size-value">{Math.round(value * 100)}%</span>
      </span>
      <input type="range" min={0.6} max={2} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="hint">{hint}</span>
    </label>
  );
}

/** A tiny stand-in for the map so size changes are visible right here. */
function SizePreview({ marker, label }: { marker: number; label: number }) {
  const len = 13 * marker;
  const half = len * 0.6;
  const tipX = 236;
  const q = 9 * marker;
  return (
    <svg className="size-preview" viewBox="0 0 320 96" role="img" aria-label="Preview of arrows, question marks and labels">
      <line x1="48" y1="40" x2={tipX} y2="40" stroke="#ff7eb6" strokeWidth="3" strokeDasharray="3 4" />
      <polygon
        points={`${tipX},40 ${tipX - len},${40 - half} ${tipX - len * 0.68},40 ${tipX - len},${40 + half}`}
        fill="#ff7eb6"
        stroke="var(--card)"
        strokeWidth={Math.max(1.2, len * 0.16)}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
      <circle cx="140" cy="40" r={q} fill="var(--card)" stroke="#ff7eb6" strokeWidth={Math.max(1, q * 0.22)} />
      <text x="140" y={40 + q * 0.5} textAnchor="middle" fontSize={q * 1.45} fontWeight="700" fill="#ff7eb6" fontFamily="Fredoka, Nunito, sans-serif">
        ?
      </text>
      <circle cx="30" cy="40" r="16" fill="#ffd166" />
      <text x="30" y="46" textAnchor="middle" fontSize="16">🦊</text>
      <circle cx="258" cy="40" r="16" fill="#bdb2ff" />
      <text x="258" y="46" textAnchor="middle" fontSize="16">🐰</text>
      <text x="258" y={68 + 8 * label} textAnchor="middle" fontSize={12 * label} fontWeight="800" fill="var(--ink)" fontFamily="Nunito, sans-serif">
        Sam
      </text>
    </svg>
  );
}

function DisplayTab({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }) {
  return (
    <div className="display-tab">
      <SizePreview marker={prefs.markerScale} label={prefs.labelScale} />
      <SizeSlider
        label="Arrows & badges"
        hint="Direction arrows, speculative ? marks and 💖 badges, in 2D and 3D."
        value={prefs.markerScale}
        onChange={(markerScale) => setPrefs({ markerScale })}
      />
      <SizeSlider label="Name labels" hint="The names under each person on the map." value={prefs.labelScale} onChange={(labelScale) => setPrefs({ labelScale })} />
      <button className="btn" onClick={() => setPrefs({ markerScale: 1, labelScale: 1 })} disabled={prefs.markerScale === 1 && prefs.labelScale === 1}>
        Reset to 100%
      </button>
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
