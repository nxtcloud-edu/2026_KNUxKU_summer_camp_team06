import { useCallback, useState } from 'react';

const STORAGE_KEY = 'keep-on-recent-queries';
const MAX_ITEMS = 6;

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function write(items: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 저장 실패는 무시한다.
  }
}

export function useRecentQueries() {
  const [items, setItems] = useState<string[]>(read);

  const remember = useCallback((query: string) => {
    const value = query.trim();
    if (value.length < 2) return;
    setItems((current) => {
      const next = [value, ...current.filter((item) => item !== value)].slice(0, MAX_ITEMS);
      write(next);
      return next;
    });
  }, []);

  const forget = useCallback((query: string) => {
    setItems((current) => {
      const next = current.filter((item) => item !== query);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    write([]);
  }, []);

  return { items, remember, forget, clear };
}
