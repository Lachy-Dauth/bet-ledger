"use client";

// Browser-side session + group memory (localStorage) and a fetch wrapper that
// attaches the bearer token. This is what makes "you don't have to enter again"
// work across reloads.

export type Session = { token: string; user: { id: string; name: string } };
export type SavedGroup = { code: string; name: string };

const SESSION_KEY = "bl.session";
const GROUPS_KEY = "bl.groups";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

export function getSavedGroups(): SavedGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? (JSON.parse(raw) as SavedGroup[]) : [];
  } catch {
    return [];
  }
}

export function rememberGroup(g: SavedGroup) {
  const groups = getSavedGroups().filter((x) => x.code !== g.code);
  groups.unshift(g);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function forgetGroup(code: string) {
  const groups = getSavedGroups().filter((x) => x.code !== code);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

/** Overwrite the cached group list (used to reconcile with the server). */
export function saveGroups(groups: SavedGroup[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** fetch JSON with the stored bearer token; throws ApiError(message, status). */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const session = getSession();
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // If we sent a token and it was rejected, the stored session is stale —
    // clear it so the UI stops showing a phantom signed-in state.
    if (res.status === 401 && session) setSession(null);
    throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}
