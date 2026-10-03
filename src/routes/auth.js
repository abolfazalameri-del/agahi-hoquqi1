import {
  HttpError, json, readJson, cleanText, normalizePhone, validatePassword, hashPassword, verifyPassword,
} from '../lib/util.js';
import {
  rateLimit, createSession, destroySession, requireUser, getUser, sessionCookie,
} from '../lib/core.js';

const iterations = (env) => {
  const n = parseInt(env.PBKDF2_ITERATIONS, 10);
  return Number.isInteger(n) && n >= 10000 ? n : 100000;
};

export async function register(env, request) {
  await rateLimit(env, request, 'register', 5, 3600);
  const b = await readJson(request);
  const name = cleanText(b.name, { min: 2, max: 80, field: 'نام' });
  const phone = normalizePhone(b.phone);
  if (!phone) throw new HttpError(400, 'شمارهٔ تماس معتبر نیست. نمونه: 0701234567', 'invalid_phone');
  validatePassword(b.password);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first();
  if (exists) throw new HttpError(409, 'با این شماره قبلاً حساب ساخته شده است. وارد شوید.', 'phone_taken');

  const hash = await hashPassword(b.password, iterations(env));
  let res;
  try {
    res = await env.DB.prepare('INSERT INTO users (name, phone, password_hash) VALUES (?, ?, ?)').bind(name, phone, hash).run();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'با این شماره قبلاً حساب ساخته شده است. وارد شوید.', 'phone_taken');
    throw e;
  }
  const userId = res.meta.last_row_id;
  const cookie = await createSession(env, request, userId);
  return json({ user: { id: userId, name, phone, role: 'user' } }, 201, { 'Set-Cookie': cookie });
}

export async function login(env, request) {
  await rateLimit(env, request, 'login-ip', 20, 900);
  const b = await readJson(request);
  const phone = normalizePhone(b.phone);
  const bad = new HttpError(401, 'شماره یا رمز عبور درست نیست.', 'bad_credentials');
  if (!phone || typeof b.password !== 'string' || b.password.length > 128) throw bad;
  await rateLimit(env, request, 'login-phone', 6, 900, phone);

  const user = await env.DB.prepare('SELECT id, name, phone, role, is_active, password_hash FROM users WHERE phone = ?').bind(phone).first();
  if (!user) {
    // keep response time similar for unknown numbers
    await hashPassword(b.password, 10000);
    throw bad;
  }
  if (!(await verifyPassword(b.password, user.password_hash))) throw bad;
  if (!user.is_active) throw new HttpError(403, 'حساب شما غیرفعال شده است. با ما تماس بگیرید.', 'account_disabled');

  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();
  const cookie = await createSession(env, request, user.id);
  return json({ user: { id: user.id, name: user.name, phone: user.phone, role: user.role } }, 200, { 'Set-Cookie': cookie });
}

export async function logout(env, request) {
  const cookie = await destroySession(env, request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}

export async function me(env, request) {
  const u = await getUser(env, request);
  if (!u) throw new HttpError(401, 'وارد حساب کاربری نشده‌اید.', 'unauthorized');
  return json({ user: u });
}

export async function updateMe(env, request) {
  const u = await requireUser(env, request);
  const b = await readJson(request);
  const name = cleanText(b.name, { min: 2, max: 80, field: 'نام' });
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, u.id).run();
  return json({ user: { ...u, name } });
}

export async function changePassword(env, request) {
  const u = await requireUser(env, request);
  await rateLimit(env, request, 'chpw', 10, 900, String(u.id));
  const b = await readJson(request);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first();
  if (typeof b.current !== 'string' || !(await verifyPassword(b.current, row.password_hash))) {
    throw new HttpError(401, 'رمز عبور فعلی درست نیست.', 'bad_credentials');
  }
  validatePassword(b.next);
  const hash = await hashPassword(b.next, iterations(env));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, u.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id), // sign out everywhere
  ]);
  const cookie = await createSession(env, request, u.id);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}

export async function deleteMe(env, request) {
  const u = await requireUser(env, request);
  await rateLimit(env, request, 'delacct', 5, 900, String(u.id));
  const b = await readJson(request);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first();
  if (typeof b.password !== 'string' || !(await verifyPassword(b.password, row.password_hash))) {
    throw new HttpError(401, 'رمز عبور درست نیست.', 'bad_credentials');
  }
  if (u.role === 'admin') {
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND is_active=1").first();
    if (c.n <= 1) throw new HttpError(409, 'آخرین مدیر سایت نمی‌تواند حساب خود را حذف کند.', 'last_admin');
  }
  // R2 objects (if R2 is enabled) are removed first; D1 rows cascade.
  if (env.FILES) {
    const files = await env.DB.prepare("SELECT id FROM request_files WHERE user_id = ? AND storage = 'r2'").bind(u.id).all();
    for (const f of files.results) await env.FILES.delete(f.id);
  }
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
