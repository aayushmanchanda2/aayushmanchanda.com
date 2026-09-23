/**
 * storage.ts — `localStorage` that never throws (QA phase 2, B11). Blocked
 * storage (a private window, a policy) throws on access, and a reader with it
 * off should still get every toggle for the length of the page: a read comes
 * back as nothing and a write is simply not kept. The inline pre-paint
 * scripts cannot import, so they keep their own one-line guard. `/privacy`
 * names every key.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not persisted, still applied */
  }
}
