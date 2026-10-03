import { HttpError, parseCookies, randomToken, sha256Hex, isoNow, clientIp } from './util.js';
import { SCHEMA_STATEMENTS } from '../schema.js';

export const COOKIE = '__Host-sid';
const SESSION_SECONDS = 14 * 24 * 3600;

// ---------- schema bootstrap (first request creates the tables if they do not exist) ----------
const readyDbs = new WeakSet();
export async function ensureSchema(env) {
  if (readyDbs.has(env.DB)) return;
  const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
  if (!row) await env.DB.batch(SCHEMA_STATEMENTS.map((s) => env.DB.prepare(s)));
  readyDbs.add(env.DB);
}

// ---------- CSRF: same-origin check + custom header (cookie is also SameSite=Strict) ----------
export function checkCsrf(request) {
  const m = request.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
  const origin = request.headers.get('origin');
  const host = new URL(request.url).origin;
  if (origin && origin !== host) throw new HttpError(403, 'درخواست از مبدأ نامعتبر ارسال شده است.', 'csrf');
  if (request.headers.get('x-requested-with') !== 'agahi') throw new HttpError(403, 'درخواست نامعتبر است.', 'csrf');
}

// ---------- rate limiting (fixed window in D1) ----------
export async function rateLimit(env, request, bucket, limit, windowSeconds, extraKey = '') {
  const key = `${bucket}:${clientIp(request)}${extraKey ? ':' + extraKey : ''}`;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || now - row.window_start >= windowSeconds) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start'
    ).bind(key, now).run();
    return;
  }
  if (row.count >= limit) {
    const wait = windowSeconds - (now - row.window_start);
    throw new HttpError(429, `تعداد تلاش‌ها زیاد بود. لطفاً ${Math.ceil(wait / 60)} دقیقه دیگر دوباره تلاش کنید.`, 'rate_limited');
  }
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
}

// ---------- sessions ----------
export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function createSession(env, request, userId) {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const ua = (request.headers.get('user-agent') || '').slice(0, 200);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)')
    .bind(id, userId, isoNow(SESSION_SECONDS), ua).run();
  return sessionCookie(token, SESSION_SECONDS);
}

export async function destroySession(env, request) {
  const token = parseCookies(request.headers.get('cookie'))[COOKIE];
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  return sessionCookie('', 0);
}

export async function getUser(env, request) {
  const token = parseCookies(request.headers.get('cookie'))[COOKIE];
  if (!token || token.length < 20 || token.length > 100) return null;
  const id = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.phone, u.role, u.is_active, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
  ).bind(id).first();
  if (!row) return null;
  if (row.expires_at <= isoNow() || !row.is_active) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  return { id: row.id, name: row.name, phone: row.phone, role: row.role, created_at: row.created_at };
}

export async function requireUser(env, request) {
  const u = await getUser(env, request);
  if (!u) throw new HttpError(401, 'برای ادامه باید وارد حساب کاربری شوید.', 'unauthorized');
  return u;
}

export async function requireAdmin(env, request) {
  const u = await requireUser(env, request);
  if (u.role !== 'admin') throw new HttpError(403, 'شما اجازهٔ دسترسی به این بخش را ندارید.', 'forbidden');
  return u;
}

// ---------- audit ----------
export async function audit(env, actorId, action, targetType, targetId, meta) {
  await env.DB.prepare('INSERT INTO audit_logs (actor_id, action, target_type, target_id, meta) VALUES (?, ?, ?, ?, ?)')
    .bind(actorId, action, targetType || null, targetId == null ? null : String(targetId), meta ? JSON.stringify(meta).slice(0, 1000) : null)
    .run();
}

// Housekeeping: runs occasionally, deletes expired sessions and stale rate-limit rows.
export async function maybeCleanup(env) {
  if (Math.random() > 0.02) return;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(isoNow()),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(Date.now() / 1000) - 86400),
  ]);
}
