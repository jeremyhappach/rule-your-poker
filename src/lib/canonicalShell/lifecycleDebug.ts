/**
 * Temporary cold-start lifecycle instrumentation.
 * Components register mount/unmount and arbitrary facts;
 * <LifecycleDebugBadge/> renders the current snapshot.
 *
 * Remove after Gin cold-start lifecycle is verified.
 */

import { useEffect, useSyncExternalStore } from 'react';

type Snapshot = Record<string, string | number | boolean | null | undefined>;

let snapshot: Snapshot = {};
const listeners = new Set<() => void>();

function emit() {
  snapshot = { ...snapshot };
  for (const l of listeners) l();
}

export function setLifecycleFact(key: string, value: Snapshot[string]) {
  if (snapshot[key] === value) return;
  snapshot[key] = value;
  // eslint-disable-next-line no-console
  console.log(`[lifecycle-debug] ${key} =`, value);
  emit();
}

export function clearLifecycleFact(key: string) {
  if (!(key in snapshot)) return;
  delete snapshot[key];
  // eslint-disable-next-line no-console
  console.log(`[lifecycle-debug] ${key} cleared`);
  emit();
}

export function useLifecycleMount(name: string, extra?: Snapshot) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(`[lifecycle-debug] MOUNT ${name}`, extra ?? '');
    setLifecycleFact(`mounted:${name}`, true);
    return () => {
      // eslint-disable-next-line no-console
      console.log(`[lifecycle-debug] UNMOUNT ${name}`);
      setLifecycleFact(`mounted:${name}`, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLifecycleSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
