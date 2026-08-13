import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'keep-on-liked-opportunities';
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function current() { if (!cache) cache = read(); return cache; }
function commit(next: string[]) {
  cache = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function toggleLikedOpportunity(id: string) {
  const ids = current();
  commit(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
}

export function useLikedOpportunities() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    current,
    () => [],
  );
}
