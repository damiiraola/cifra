/**
 * The PDF review survives a reload. Reading a statement costs several of the
 * day's assistant uses, and on the iPhone switching apps reloads the page: the
 * review was lost and reading it again cost the uses again. What the server
 * read (movements and totals, never the PDF or its password) stays in this
 * browser until it is imported, cancelled, a day goes by or the user signs
 * out. Pure apart from the storage passed in.
 */

export const DRAFT_PREFIX = "cifra-pdf-review:v1:";
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function saveDraft(storage: DraftStorage, cardId: string, read: unknown, now = Date.now()) {
  try {
    storage.setItem(DRAFT_PREFIX + cardId, JSON.stringify({ at: now, read }));
  } catch {
    /* full or blocked: the review still works, it just won't survive a reload */
  }
}

export function loadDraft<T>(storage: DraftStorage, cardId: string, now = Date.now()): T | null {
  const key = DRAFT_PREFIX + cardId;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { at?: unknown; read?: unknown };
    if (
      typeof v.at !== "number" ||
      now - v.at > DRAFT_MAX_AGE_MS ||
      !v.read ||
      typeof v.read !== "object"
    ) {
      storage.removeItem(key);
      return null;
    }
    return v.read as T;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearDraft(storage: DraftStorage, cardId: string) {
  try {
    storage.removeItem(DRAFT_PREFIX + cardId);
  } catch {
    /* ignore */
  }
}

/** On sign-out: no statement of this user stays on the device. */
export function clearAllDrafts(storage: DraftStorage) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** The browser's storage, or null on the server or when it is blocked. */
export function draftStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Where the review of a PDF uploaded without a card waits across a reload. */
export const UPLOAD_DRAFT_KEY = "subir";

/** A review left from before a reload (the PDF was already read and paid for). */
export function hasUploadDraft() {
  const st = draftStorage();
  return Boolean(st && loadDraft(st, UPLOAD_DRAFT_KEY));
}
