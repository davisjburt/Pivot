import type { AppState, WeightEntry } from '../types';

export type CloudflareUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
};

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') ?? '';
const entrySubscribers = new Set<(entries: WeightEntry[]) => void>();
let entriesRefresh: Promise<WeightEntry[]> | null = null;

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function apiUrl(path: string): string {
  return `${configuredBaseUrl}${path}`;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  });
  const body = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

async function fetchEntries(): Promise<WeightEntry[]> {
  if (!entriesRefresh) {
    entriesRefresh = api<WeightEntry[]>('/api/entries').finally(() => {
      entriesRefresh = null;
    });
  }
  return entriesRefresh;
}

async function refreshEntries(): Promise<void> {
  const entries = await fetchEntries();
  for (const subscriber of entrySubscribers) subscriber(entries);
}

export function onAuthStateChanged(callback: (user: CloudflareUser | null) => void): () => void {
  let active = true;
  const refresh = async () => {
    try {
      const { user } = await api<{ user: CloudflareUser | null }>('/api/auth/me');
      if (active) callback(user);
    } catch (error) {
      console.error('Unable to restore the Cloudflare session', error);
      if (active) callback(null);
    }
  };
  void refresh();
  window.addEventListener('focus', refresh);
  return () => {
    active = false;
    window.removeEventListener('focus', refresh);
  };
}

export function signInWithGoogle(): void {
  window.location.assign(apiUrl('/api/auth/google'));
}

export async function signOut(): Promise<void> {
  await api<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  window.location.reload();
}

export const cloudflareService = {
  getUserProfile: async (_userId: string): Promise<Partial<AppState> | null> => {
    try {
      return await api<Partial<AppState>>('/api/profile');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  saveUserProfile: async (_userId: string, data: Partial<AppState>): Promise<void> => {
    await api('/api/profile', { method: 'PATCH', body: JSON.stringify(data) });
  },

  subscribeToEntries: (_userId: string, callback: (entries: WeightEntry[]) => void): (() => void) => {
    entrySubscribers.add(callback);
    void refreshEntries().catch((error) => console.error('Unable to load entries', error));
    const interval = window.setInterval(() => {
      void refreshEntries().catch((error) => console.error('Unable to refresh entries', error));
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      entrySubscribers.delete(callback);
    };
  },

  addEntry: async (_userId: string, entry: WeightEntry): Promise<void> => {
    await api('/api/entries', { method: 'PUT', body: JSON.stringify(entry) });
    await refreshEntries();
  },

  deleteEntry: async (_userId: string, entryId: string): Promise<void> => {
    await api(`/api/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
    await refreshEntries();
  },

  importEntries: async (_userId: string, entries: WeightEntry[]): Promise<void> => {
    await api('/api/entries/import', { method: 'POST', body: JSON.stringify({ entries }) });
    await refreshEntries();
  },

  getVapidPublicKey: async (): Promise<string | null> => {
    const { publicKey } = await api<{ publicKey: string | null }>('/api/vapid-public-key');
    return publicKey;
  },

  saveReminderSubscription: async (
    _userId: string,
    payload: { subscription: PushSubscriptionJSON; time: string; timezone: string; remindersEnabled: boolean },
  ): Promise<void> => {
    await api('/api/reminder-subscription', { method: 'PUT', body: JSON.stringify(payload) });
  },

  deleteReminderSubscription: async (_userId: string): Promise<void> => {
    await api('/api/reminder-subscription', { method: 'DELETE' });
  },
};
