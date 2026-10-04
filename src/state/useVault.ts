import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearStored,
  createKey,
  readStored,
  seal,
  unseal,
  writeStored,
  type SealedVault,
  type VaultKey,
} from '../crypto/vault';
import { emptyVault } from '../model/defaults';
import type { Vault } from '../model/types';
import { normaliseVault, vaultReducer, type Action } from './reducer';

export type VaultStatus = 'new' | 'locked' | 'unlocked';
export type SaveState = 'saved' | 'saving' | 'error';

const SAVE_DEBOUNCE_MS = 400;
const UNDO_LIMIT = 50;

export function useVault() {
  const [status, setStatus] = useState<VaultStatus>(() => (readStored() ? 'locked' : 'new'));
  const [vault, setVault] = useState<Vault>(emptyVault);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [undoStack, setUndoStack] = useState<Vault[]>([]);
  const keyRef = useRef<VaultKey | null>(null);
  const dirty = useRef(false);

  // Debounced encrypt-and-save whenever the vault changes while unlocked.
  useEffect(() => {
    if (status !== 'unlocked' || !dirty.current || !keyRef.current) return;
    setSaveState('saving');
    const vk = keyRef.current;
    const t = setTimeout(async () => {
      try {
        writeStored(await seal(vault, vk));
        dirty.current = false;
        setSaveState('saved');
      } catch (e) {
        console.error('Save failed', e);
        setSaveState('error');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [vault, status]);

  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const undoRef = useRef(undoStack);
  undoRef.current = undoStack;

  const dispatch = useCallback((a: Action) => {
    const prev = vaultRef.current;
    const next = vaultReducer(prev, a);
    if (next === prev) return;
    // Layout pins are housekeeping, not something you'd want to "undo".
    if (a.type !== 'pinAll') {
      undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), prev];
      setUndoStack(undoRef.current);
    }
    vaultRef.current = next;
    dirty.current = true;
    setVault(next);
  }, []);

  const undo = useCallback(() => {
    const s = undoRef.current;
    if (!s.length) return;
    dirty.current = true;
    setVault(s[s.length - 1]);
    setUndoStack(s.slice(0, -1));
  }, []);

  const create = useCallback(async (passphrase: string) => {
    const vk = await createKey(passphrase);
    const v = emptyVault();
    writeStored(await seal(v, vk));
    keyRef.current = vk;
    setVault(v);
    setUndoStack([]);
    setStatus('unlocked');
  }, []);

  const unlock = useCallback(async (passphrase: string, sealed: SealedVault | null = readStored()) => {
    if (!sealed) throw new Error('No vault found.');
    const { vault: v, vk } = await unseal(sealed, passphrase);
    keyRef.current = vk;
    setVault(normaliseVault(v));
    setUndoStack([]);
    setStatus('unlocked');
  }, []);

  /** Import an exported (still-encrypted) backup, replacing what's here. */
  const importSealed = useCallback(async (sealed: SealedVault, passphrase: string) => {
    const { vault: v, vk } = await unseal(sealed, passphrase);
    keyRef.current = vk;
    writeStored(sealed);
    setVault(normaliseVault(v));
    setUndoStack([]);
    setStatus('unlocked');
  }, []);

  const exportSealed = useCallback(async (): Promise<SealedVault> => {
    if (!keyRef.current) throw new Error('Locked');
    return seal(vault, keyRef.current);
  }, [vault]);

  const changePassphrase = useCallback(
    async (passphrase: string) => {
      const vk = await createKey(passphrase);
      writeStored(await seal(vault, vk));
      keyRef.current = vk;
    },
    [vault],
  );

  const lock = useCallback(async () => {
    // Flush any pending save before dropping the key.
    if (dirty.current && keyRef.current) {
      writeStored(await seal(vault, keyRef.current));
      dirty.current = false;
    }
    keyRef.current = null;
    setVault(emptyVault());
    setUndoStack([]);
    setSaveState('saved');
    setStatus('locked');
  }, [vault]);

  const destroy = useCallback(() => {
    clearStored();
    keyRef.current = null;
    dirty.current = false;
    setVault(emptyVault());
    setUndoStack([]);
    setStatus('new');
  }, []);

  return {
    status,
    vault,
    saveState,
    canUndo: undoStack.length > 0,
    dispatch,
    undo,
    create,
    unlock,
    lock,
    destroy,
    importSealed,
    exportSealed,
    changePassphrase,
  };
}

export type VaultApi = ReturnType<typeof useVault>;
