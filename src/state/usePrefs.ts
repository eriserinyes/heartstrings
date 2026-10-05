import { useCallback, useEffect, useState } from 'react';

/**
 * View preferences. These contain NO personal data (no names, no ids) and so
 * are stored in plaintext, separately from the encrypted vault.
 */
export interface Prefs {
  mode: '2d' | '3d';
  hiddenTypes: string[];
  mergeMutual: boolean;
  particles: boolean;
  labels: boolean;
  peopleOpen: boolean;
  autoLockMinutes: number;
  /** Show the 🔮 speculative layer. Off = it behaves as if it doesn't exist. */
  showSpeculative: boolean;
}

const KEY = 'heartstrings.prefs.v1';

const DEFAULTS: Prefs = {
  mode: '2d',
  hiddenTypes: [],
  mergeMutual: true,
  particles: true,
  labels: true,
  peopleOpen: true,
  autoLockMinutes: 15,
  showSpeculative: true,
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — prefs just won't persist */
    }
  }, [prefs]);
  const update = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);
  return [prefs, update] as const;
}
