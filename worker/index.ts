import {
  buildPushPayload,
  type PushSubscription,
  type VapidKeys,
} from '@block65/webcrypto-web-push';

type WorkerEnv = Env & {
  GOOGLE_CLIENT_SECRET: string;
  VAPID_PRIVATE_KEY: string;
};

type SessionUserRow = {
  id: string;
  email: string;
  name: string;
  photo_url: string | null;
};

type ProfileRow = SessionUserRow & {
  onboarded: number;
  goal_json: string | null;
  settings_json: string;
};

type EntryRow = {
  id: string;
  date: string;
  weight: number;
  note: string | null;
  tags_json: string;
};

type ReminderRow = {
  user_id: string;
  subscription_json: string;
  time: string;
  timezone: string;
  last_sent_local_date: string | null;
};

type GoogleUser = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const DEFAULT_SETTINGS = {
  smoothingWindow: 10,
  hideRawNumbers: false,
  darkMode: false,
};

const encoder = new TextEncoder();

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

function cookie(
  name: string,
  value: string,
  options: { maxAge?: number; httpOnly?: boolean; secure?: boolean } = {},
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    options.httpOnly === false ? '' : 'HttpOnly',
    options.secure === false ? '' : 'Secure',
    options.maxAge === undefined ? '' : `Max-Age=${options.maxAge}`,
  ].filter(Boolean);
  return attributes.join('; ');
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function safeReturnTo(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 1_000_000) throw new HttpError(413, 'Request body is too large');
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
  if (!isRecord(value)) throw new HttpError(400, 'Expected a JSON object');
  return value;
}

function requireSameOrigin(request: Request, url: URL): void {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw new HttpError(403, 'Cross-origin write denied');
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function validateSettings(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new HttpError(400, 'Invalid settings');
  const smoothingWindow = value.smoothingWindow;
  if (!Number.isFinite(smoothingWindow) || Number(smoothingWindow) < 3 || Number(smoothingWindow) > 30) {
    throw new HttpError(400, 'smoothingWindow must be between 3 and 30');
  }
  if (typeof value.hideRawNumbers !== 'boolean' || typeof value.darkMode !== 'boolean') {
    throw new HttpError(400, 'Invalid settings flags');
  }
  return value;
}

function validateGoal(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new HttpError(400, 'Invalid goal');
  for (const field of ['targetWeight', 'startWeight', 'milestoneSize'] as const) {
    if (!Number.isFinite(value[field]) || Number(value[field]) <= 0) {
      throw new HttpError(400, `${field} must be positive`);
    }
  }
  if (typeof value.startDate !== 'string' || Number.isNaN(Date.parse(value.startDate))) {
    throw new HttpError(400, 'Invalid goal startDate');
  }
  if (value.unit !== 'lbs' && value.unit !== 'kg') throw new HttpError(400, 'Invalid weight unit');
  return value;
}

function validateEntry(value: unknown): {
  id: string;
  date: string;
  weight: number;
  note: string | null;
  tags: string[];
} {
  if (!isRecord(value)) throw new HttpError(400, 'Invalid weight entry');
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 100) {
    throw new HttpError(400, 'Invalid entry id');
  }
  if (typeof value.date !== 'string' || Number.isNaN(Date.parse(value.date))) {
    throw new HttpError(400, 'Invalid entry date');
  }
  if (!Number.isFinite(value.weight) || Number(value.weight) <= 0 || Number(value.weight) > 2_000) {
    throw new HttpError(400, 'Invalid entry weight');
  }
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 500)) {
    throw new HttpError(400, 'Invalid entry note');
  }
  if (!Array.isArray(value.tags) || value.tags.length > 20 || value.tags.some((tag) => typeof tag !== 'string' || tag.length > 60)) {
    throw new HttpError(400, 'Invalid entry tags');
  }
  return {
    id: value.id,
    date: value.date,
    weight: Number(value.weight),
    note: typeof value.note === 'string' ? value.note : null,
    tags: value.tags,
  };
}

function validateGoogleUser(value: unknown): GoogleUser {
  if (!isRecord(value) || typeof value.sub !== 'string' || typeof value.email !== 'string' || value.email_verified !== true) {
    throw new HttpError(401, 'Google did not return a verified account');
  }
  return {
    sub: value.sub,
    email: value.email,
    email_verified: true,
    name: typeof value.name === 'string' ? value.name.slice(0, 100) : undefined,
    picture: typeof value.picture === 'string' ? value.picture : undefined,
  };
}

async function getSessionUser(request: Request, env: WorkerEnv): Promise<SessionUserRow | null> {
  const token = parseCookies(request).get('pivot_session');
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(
    `SELECT users.id, users.email, users.name, users.photo_url
       FROM sessions
       JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  ).bind(tokenHash, new Date().toISOString()).first<SessionUserRow>();
}

async function requireUser(request: Request, env: WorkerEnv): Promise<SessionUserRow> {
  const user = await getSessionUser(request, env);
  if (!user) throw new HttpError(401, 'Authentication required');
  return user;
}

function publicUser(user: SessionUserRow) {
  return {
    uid: user.id,
    email: user.email,
    displayName: user.name,
    photoURL: user.photo_url,
  };
}

async function beginGoogleAuth(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'Google OAuth is not configured');
  const state = randomToken();
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  const redirectUri = `${url.origin}/api/auth/callback`;
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  const secure = url.protocol === 'https:';
  const headers = new Headers({ Location: authorizationUrl.toString() });
  headers.append('Set-Cookie', cookie('pivot_oauth_state', state, { maxAge: 600, secure }));
  headers.append('Set-Cookie', cookie('pivot_oauth_return', returnTo, { maxAge: 600, secure }));
  return new Response(null, { status: 302, headers });
}

async function completeGoogleAuth(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const cookies = parseCookies(request);
  const expectedState = cookies.get('pivot_oauth_state');
  if (!code || !returnedState || !expectedState || !(await constantTimeEqual(returnedState, expectedState))) {
    throw new HttpError(400, 'Invalid OAuth callback state');
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, 'Google OAuth is not configured');
  }

  const redirectUri = `${url.origin}/api/auth/callback`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenBody: unknown = await tokenResponse.json();
  if (!tokenResponse.ok || !isRecord(tokenBody) || typeof tokenBody.access_token !== 'string') {
    throw new HttpError(401, 'Google token exchange failed');
  }

  const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const googleUser = validateGoogleUser(await userResponse.json());
  const now = new Date();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, photo_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       photo_url = excluded.photo_url,
       updated_at = excluded.updated_at`,
  ).bind(
    googleUser.sub,
    googleUser.email,
    googleUser.name ?? '',
    googleUser.picture ?? null,
    now.toISOString(),
    now.toISOString(),
  ).run();

  const sessionToken = randomToken();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).bind(await sha256(sessionToken), googleUser.sub, expires.toISOString(), now.toISOString()).run();

  const returnTo = safeReturnTo(cookies.get('pivot_oauth_return') ?? null);
  const secure = url.protocol === 'https:';
  const headers = new Headers({ Location: returnTo });
  headers.append('Set-Cookie', cookie('pivot_session', sessionToken, { maxAge: 30 * 24 * 60 * 60, secure }));
  headers.append('Set-Cookie', cookie('pivot_oauth_state', '', { maxAge: 0, secure }));
  headers.append('Set-Cookie', cookie('pivot_oauth_return', '', { maxAge: 0, secure }));
  return new Response(null, { status: 302, headers });
}

async function logout(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  requireSameOrigin(request, url);
  const token = parseCookies(request).get('pivot_session');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', cookie('pivot_session', '', { maxAge: 0, secure: url.protocol === 'https:' }));
  return new Response(JSON.stringify({ success: true }), { headers });
}

async function getProfile(user: SessionUserRow, env: WorkerEnv): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT id, email, name, photo_url, onboarded, goal_json, settings_json FROM users WHERE id = ?',
  ).bind(user.id).first<ProfileRow>();
  if (!row) throw new HttpError(404, 'Profile not found');
  return json({
    uid: row.id,
    email: row.email,
    name: row.name,
    onboarded: row.onboarded === 1,
    goal: parseJson(row.goal_json, null),
    settings: parseJson(row.settings_json, DEFAULT_SETTINGS),
  });
}

async function updateProfile(request: Request, user: SessionUserRow, env: WorkerEnv, url: URL): Promise<Response> {
  requireSameOrigin(request, url);
  const body = await readJson(request);
  const current = await env.DB.prepare(
    'SELECT name, onboarded, goal_json, settings_json FROM users WHERE id = ?',
  ).bind(user.id).first<{ name: string; onboarded: number; goal_json: string | null; settings_json: string }>();
  if (!current) throw new HttpError(404, 'Profile not found');

  const name = body.name === undefined ? current.name : String(body.name).slice(0, 100);
  const onboarded = body.onboarded === undefined ? current.onboarded : body.onboarded === true ? 1 : 0;
  const goal = body.goal === undefined ? parseJson(current.goal_json, null) : validateGoal(body.goal);
  const settings = body.settings === undefined
    ? parseJson(current.settings_json, DEFAULT_SETTINGS)
    : validateSettings(body.settings);

  await env.DB.prepare(
    'UPDATE users SET name = ?, onboarded = ?, goal_json = ?, settings_json = ?, updated_at = ? WHERE id = ?',
  ).bind(name, onboarded, goal === null ? null : JSON.stringify(goal), JSON.stringify(settings), new Date().toISOString(), user.id).run();
  return json({ success: true });
}

async function listEntries(user: SessionUserRow, env: WorkerEnv): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT id, date, weight, note, tags_json FROM weight_entries WHERE user_id = ? ORDER BY date ASC',
  ).bind(user.id).all<EntryRow>();
  return json(results.map((entry) => ({
    id: entry.id,
    date: entry.date,
    weight: entry.weight,
    ...(entry.note ? { note: entry.note } : {}),
    tags: parseJson(entry.tags_json, [] as string[]),
  })));
}

async function upsertEntry(request: Request, user: SessionUserRow, env: WorkerEnv, url: URL): Promise<Response> {
  requireSameOrigin(request, url);
  const entry = validateEntry(await readJson(request));
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO weight_entries (id, user_id, date, weight, note, tags_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
       date = excluded.date,
       weight = excluded.weight,
       note = excluded.note,
       tags_json = excluded.tags_json,
       updated_at = excluded.updated_at`,
  ).bind(entry.id, user.id, entry.date, entry.weight, entry.note, JSON.stringify(entry.tags), now, now).run();
  return json({ success: true }, 201);
}

async function importEntries(request: Request, user: SessionUserRow, env: WorkerEnv, url: URL): Promise<Response> {
  requireSameOrigin(request, url);
  const body = await readJson(request);
  if (!Array.isArray(body.entries) || body.entries.length > 1_000) {
    throw new HttpError(400, 'entries must be an array of at most 1000 items');
  }
  const entries = body.entries.map(validateEntry);
  const now = new Date().toISOString();
  const statements = entries.map((entry) => env.DB.prepare(
    `INSERT INTO weight_entries (id, user_id, date, weight, note, tags_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
       date = excluded.date,
       weight = excluded.weight,
       note = excluded.note,
       tags_json = excluded.tags_json,
       updated_at = excluded.updated_at`,
  ).bind(entry.id, user.id, entry.date, entry.weight, entry.note, JSON.stringify(entry.tags), now, now));
  if (statements.length) await env.DB.batch(statements);
  return json({ success: true, imported: entries.length });
}

async function saveReminder(request: Request, user: SessionUserRow, env: WorkerEnv, url: URL): Promise<Response> {
  requireSameOrigin(request, url);
  const body = await readJson(request);
  if (!isRecord(body.subscription) || typeof body.subscription.endpoint !== 'string' || !isRecord(body.subscription.keys)) {
    throw new HttpError(400, 'Invalid push subscription');
  }
  if (typeof body.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) {
    throw new HttpError(400, 'Invalid reminder time');
  }
  if (typeof body.timezone !== 'string' || body.timezone.length > 100) {
    throw new HttpError(400, 'Invalid timezone');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: body.timezone }).format();
  } catch {
    throw new HttpError(400, 'Unknown timezone');
  }
  await env.DB.prepare(
    `INSERT INTO reminder_subscriptions
       (user_id, subscription_json, time, timezone, reminders_enabled, updated_at)
     VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       subscription_json = excluded.subscription_json,
       time = excluded.time,
       timezone = excluded.timezone,
       reminders_enabled = 1,
       updated_at = excluded.updated_at`,
  ).bind(user.id, JSON.stringify(body.subscription), body.time, body.timezone, new Date().toISOString()).run();
  return json({ success: true });
}

function localDateAndTime(timeZone: string, date: Date): { localDate: string; localTime: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    localDate: `${get('year')}-${get('month')}-${get('day')}`,
    localTime: `${get('hour')}:${get('minute')}`,
  };
}

function reminderIsDue(row: ReminderRow, now: Date): { due: boolean; localDate: string } {
  const { localDate, localTime } = localDateAndTime(row.timezone, now);
  const [targetHour, targetMinute] = row.time.split(':').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const target = targetHour * 60 + targetMinute;
  const current = hour * 60 + minute;
  return { due: current >= target && current < target + 5 && row.last_sent_local_date !== localDate, localDate };
}

function errorStatusCode(error: unknown): number | null {
  if (!isRecord(error)) return null;
  return typeof error.statusCode === 'number' ? error.statusCode : null;
}

async function dispatchReminders(env: WorkerEnv, now: Date): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    console.error(JSON.stringify({ message: 'reminder dispatch skipped', error: 'VAPID keys are not configured' }));
    return;
  }
  const { results } = await env.DB.prepare(
    `SELECT user_id, subscription_json, time, timezone, last_sent_local_date
       FROM reminder_subscriptions
      WHERE reminders_enabled = 1`,
  ).all<ReminderRow>();

  for (const row of results) {
    try {
      const { due, localDate } = reminderIsDue(row, now);
      if (!due) continue;
      const subscription = parseJson<PushSubscription | null>(row.subscription_json, null);
      if (!subscription) continue;
      const vapid: VapidKeys = {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      };
      const payload = await buildPushPayload({
        data: {
          title: 'Time to log your weight!',
          body: 'Keep your streak going. Tap here to log your weight for today.',
        },
        options: { ttl: 300 },
      }, subscription, vapid);
      const pushResponse = await fetch(subscription.endpoint, payload);
      if (!pushResponse.ok) throw new HttpError(pushResponse.status, 'Push service rejected the notification');
      await env.DB.prepare(
        'UPDATE reminder_subscriptions SET last_sent_local_date = ?, last_sent_at = ? WHERE user_id = ?',
      ).bind(localDate, now.toISOString(), row.user_id).run();
    } catch (error) {
      const statusCode = errorStatusCode(error);
      if (statusCode === 404 || statusCode === 410) {
        await env.DB.prepare('DELETE FROM reminder_subscriptions WHERE user_id = ?').bind(row.user_id).run();
      } else {
        console.error(JSON.stringify({
          message: 'reminder dispatch failed',
          userId: row.user_id,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  }
}

async function route(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/auth/google') return beginGoogleAuth(request, env, url);
  if (request.method === 'GET' && pathname === '/api/auth/callback') return completeGoogleAuth(request, env, url);
  if (request.method === 'GET' && pathname === '/api/auth/me') {
    const user = await getSessionUser(request, env);
    return json({ user: user ? publicUser(user) : null });
  }
  if (request.method === 'POST' && pathname === '/api/auth/logout') return logout(request, env, url);
  if (request.method === 'GET' && pathname === '/api/vapid-public-key') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY || null });
  }

  const user = await requireUser(request, env);
  if (request.method === 'GET' && pathname === '/api/profile') return getProfile(user, env);
  if (request.method === 'PATCH' && pathname === '/api/profile') return updateProfile(request, user, env, url);
  if (request.method === 'GET' && pathname === '/api/entries') return listEntries(user, env);
  if (request.method === 'PUT' && pathname === '/api/entries') return upsertEntry(request, user, env, url);
  if (request.method === 'POST' && pathname === '/api/entries/import') return importEntries(request, user, env, url);
  if (request.method === 'DELETE' && pathname.startsWith('/api/entries/')) {
    requireSameOrigin(request, url);
    const entryId = decodeURIComponent(pathname.slice('/api/entries/'.length));
    await env.DB.prepare('DELETE FROM weight_entries WHERE user_id = ? AND id = ?').bind(user.id, entryId).run();
    return json({ success: true });
  }
  if (request.method === 'PUT' && pathname === '/api/reminder-subscription') {
    return saveReminder(request, user, env, url);
  }
  if (request.method === 'DELETE' && pathname === '/api/reminder-subscription') {
    requireSameOrigin(request, url);
    await env.DB.prepare('DELETE FROM reminder_subscriptions WHERE user_id = ?').bind(user.id).run();
    return json({ success: true });
  }
  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'Internal server error';
      console.error(JSON.stringify({
        message: 'request failed',
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ error: message }, status);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(Promise.all([
      dispatchReminders(env, new Date(controller.scheduledTime)),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?')
        .bind(new Date(controller.scheduledTime).toISOString())
        .run(),
    ]).then(() => undefined));
  },
} satisfies ExportedHandler<WorkerEnv>;
