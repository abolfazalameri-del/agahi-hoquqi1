import {
  HttpError, json, readJson, cleanText, normalizePhone, timingSafeEqual, STATUSES, STATUS_LABELS, intParam,
} from '../lib/util.js';
import { requireUser, requireAdmin, rateLimit, audit } from '../lib/core.js';
import { shapeRequest, readFileResponse } from './requests.js';

const PAGE = 20;
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// ---------- first admin ----------
// The owner registers a normal account, opens /admin/, and enters the ADMIN_SETUP_CODE secret.
// Works only while no admin exists.
export async function bootstrapAdmin(env, request) {
  const u = await requireUser(env, request);
  await rateLimit(env, request, 'bootstrap', 5, 3600);
  if (!env.ADMIN_SETUP_CODE) throw new HttpError(503, 'کد راه‌اندازی مدیر هنوز در Cloudflare تنظیم نشده است.', 'not_configured');
  const b = await readJson(request);
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first();
  if (existing.n > 0) throw new HttpError(409, 'مدیر سایت قبلاً تعیین شده است.', 'admin_exists');
  if (typeof b.code !== 'string' || !timingSafeEqual(b.code, env.ADMIN_SETUP_CODE)) throw new HttpError(403, 'کد راه‌اندازی درست نیست.', 'bad_code');
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(u.id).run();
  await audit(env, u.id, 'admin.bootstrap', 'user', u.id);
  return json({ ok: true });
}

export async function stats(env, request) {
  await requireAdmin(env, request);
  const [users, reqs, byStatus] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM service_requests').first(),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM service_requests GROUP BY status').all(),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of byStatus.results) counts[r.status] = r.n;
  return json({ users: users.n, requests: reqs.n, by_status: counts });
}

// ---------- users ----------
export async function listUsers(env, request) {
  await requireAdmin(env, request);
  const sp = new URL(request.url).searchParams;
  const q = (sp.get('q') || '').trim().slice(0, 60);
  const page = intParam(sp.get('page'), 1, 1, 10000);
  const where = q ? "WHERE name LIKE ?1 ESCAPE '\\' OR phone LIKE ?1 ESCAPE '\\'" : '';
  const bind = q ? [`%${likeEscape(q)}%`] : [];
  const rows = await env.DB.prepare(
    `SELECT id, name, phone, role, is_active, created_at, last_login_at,
            (SELECT COUNT(*) FROM service_requests r WHERE r.user_id = users.id) AS request_count
       FROM users ${where} ORDER BY id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`
  ).bind(...bind).all();
  return json({ users: rows.results, page, page_size: PAGE });
}

export async function setUserActive(env, request, id) {
  const admin = await requireAdmin(env, request);
  const b = await readJson(request);
  if (typeof b.is_active !== 'boolean') throw new HttpError(400, 'مقدار نامعتبر است.', 'invalid');
  if (id === admin.id) throw new HttpError(409, 'نمی‌توانید حساب خودتان را غیرفعال کنید.', 'self');
  const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first();
  if (!target) throw new HttpError(404, 'کاربر پیدا نشد.', 'not_found');
  const stmts = [env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(b.is_active ? 1 : 0, id)];
  if (!b.is_active) stmts.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
  await env.DB.batch(stmts);
  await audit(env, admin.id, b.is_active ? 'user.activate' : 'user.deactivate', 'user', id);
  return json({ ok: true, is_active: b.is_active });
}

// ---------- requests ----------
export async function listRequestsAdmin(env, request) {
  await requireAdmin(env, request);
  const sp = new URL(request.url).searchParams;
  const status = sp.get('status') || '';
  const q = (sp.get('q') || '').trim().slice(0, 60);
  const page = intParam(sp.get('page'), 1, 1, 10000);
  const conds = [];
  const bind = [];
  if (status) {
    if (!STATUSES.includes(status)) throw new HttpError(400, 'وضعیت نامعتبر است.', 'invalid');
    conds.push('r.status = ?'); bind.push(status);
  }
  if (q) {
    const like = `%${likeEscape(q)}%`;
    conds.push("(r.tracking_code LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')");
    bind.push(like, like, like);
  }
  const rows = await env.DB.prepare(
    `SELECT r.*, u.name AS user_name, u.phone AS user_phone
       FROM service_requests r JOIN users u ON u.id = r.user_id
       ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
      ORDER BY r.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`
  ).bind(...bind).all();
  return json({ requests: rows.results.map(shapeRequest), page, page_size: PAGE });
}

export async function getRequestAdmin(env, request, id) {
  await requireAdmin(env, request);
  const r = await env.DB.prepare(
    'SELECT r.*, u.name AS user_name, u.phone AS user_phone FROM service_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?'
  ).bind(id).first();
  if (!r) throw new HttpError(404, 'درخواست پیدا نشد.', 'not_found');
  const [msgs, files] = await Promise.all([
    env.DB.prepare('SELECT id, author_role, body, created_at FROM request_messages WHERE request_id = ? ORDER BY id').bind(id).all(),
    env.DB.prepare('SELECT id, original_name, mime, size, created_at FROM request_files WHERE request_id = ? ORDER BY created_at').bind(id).all(),
  ]);
  return json({ request: shapeRequest(r), messages: msgs.results, files: files.results });
}

async function notifyUser(env, adminId, userId, title, body, link) {
  await env.DB.prepare('INSERT INTO notifications (user_id, title, body, link, created_by) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, title, body, link || null, adminId).run();
}

export async function setRequestStatus(env, request, id) {
  const admin = await requireAdmin(env, request);
  const b = await readJson(request);
  if (!STATUSES.includes(b.status)) throw new HttpError(400, 'وضعیت نامعتبر است.', 'invalid');
  const r = await env.DB.prepare('SELECT id, user_id, tracking_code, status FROM service_requests WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'درخواست پیدا نشد.', 'not_found');
  if (r.status === b.status) return json({ ok: true, status: r.status, status_label: STATUS_LABELS[r.status] });
  await env.DB.prepare("UPDATE service_requests SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(b.status, id).run();
  await notifyUser(env, admin.id, r.user_id, 'تغییر وضعیت درخواست',
    `وضعیت درخواست ${r.tracking_code} به «${STATUS_LABELS[b.status]}» تغییر کرد.`, '/account/dashboard/#d-requests');
  await audit(env, admin.id, 'request.status', 'request', id, { from: r.status, to: b.status });
  return json({ ok: true, status: b.status, status_label: STATUS_LABELS[b.status] });
}

export async function replyToRequest(env, request, id) {
  const admin = await requireAdmin(env, request);
  const b = await readJson(request);
  const body = cleanText(b.body, { min: 1, max: 3000, field: 'پاسخ', multiline: true });
  const r = await env.DB.prepare('SELECT id, user_id, tracking_code FROM service_requests WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'درخواست پیدا نشد.', 'not_found');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO request_messages (request_id, author_id, author_role, body) VALUES (?, ?, 'admin', ?)").bind(id, admin.id, body),
    env.DB.prepare("UPDATE service_requests SET updated_at = datetime('now') WHERE id = ?").bind(id),
  ]);
  await notifyUser(env, admin.id, r.user_id, 'پاسخ جدید', `برای درخواست ${r.tracking_code} پاسخ جدیدی ثبت شد.`, '/account/dashboard/#d-requests');
  await audit(env, admin.id, 'request.reply', 'request', id);
  return json({ ok: true }, 201);
}

// ---------- files ----------
export async function adminDownloadFile(env, request, fileId) {
  const admin = await requireAdmin(env, request);
  const f = await env.DB.prepare('SELECT * FROM request_files WHERE id = ?').bind(fileId).first();
  if (!f) throw new HttpError(404, 'فایل پیدا نشد.', 'not_found');
  await audit(env, admin.id, 'file.download', 'file', fileId, { request_id: f.request_id });
  return readFileResponse(env, f);
}

export async function adminDeleteFile(env, request, fileId) {
  const admin = await requireAdmin(env, request);
  const f = await env.DB.prepare('SELECT * FROM request_files WHERE id = ?').bind(fileId).first();
  if (!f) throw new HttpError(404, 'فایل پیدا نشد.', 'not_found');
  if (f.storage === 'r2' && env.FILES) await env.FILES.delete(f.id);
  await env.DB.prepare('DELETE FROM request_files WHERE id = ?').bind(fileId).run();
  await audit(env, admin.id, 'file.delete', 'file', fileId, { request_id: f.request_id, name: f.original_name });
  return json({ ok: true });
}

// ---------- notifications ----------
export async function sendNotification(env, request) {
  const admin = await requireAdmin(env, request);
  const b = await readJson(request);
  const title = cleanText(b.title, { min: 2, max: 120, field: 'عنوان' });
  const body = cleanText(b.body, { min: 2, max: 1000, field: 'متن اعلان', multiline: true });
  const aud = b.audience;
  if (aud === 'all') {
    await env.DB.prepare('INSERT INTO notifications (user_id, title, body, created_by) VALUES (NULL, ?, ?, ?)').bind(title, body, admin.id).run();
    await audit(env, admin.id, 'notification.broadcast', 'notification', null, { title });
    return json({ ok: true, recipients: 'all' }, 201);
  }
  if (Array.isArray(aud) && aud.length >= 1 && aud.length <= 100) {
    const phones = [...new Set(aud.map(normalizePhone))];
    if (phones.includes(null)) throw new HttpError(400, 'یکی از شماره‌ها معتبر نیست.', 'invalid_phone');
    const ph = phones.map(() => '?').join(',');
    const users = await env.DB.prepare(`SELECT id FROM users WHERE phone IN (${ph}) AND is_active = 1`).bind(...phones).all();
    if (!users.results.length) throw new HttpError(404, 'کاربری با این شماره‌ها پیدا نشد.', 'not_found');
    await env.DB.batch(users.results.map((u) =>
      env.DB.prepare('INSERT INTO notifications (user_id, title, body, created_by) VALUES (?, ?, ?, ?)').bind(u.id, title, body, admin.id)));
    await audit(env, admin.id, 'notification.send', 'notification', null, { title, recipients: users.results.length });
    return json({ ok: true, recipients: users.results.length }, 201);
  }
  throw new HttpError(400, 'گیرندهٔ اعلان مشخص نشده است.', 'invalid');
}

// ---------- audit log ----------
export async function listAudit(env, request) {
  await requireAdmin(env, request);
  const page = intParam(new URL(request.url).searchParams.get('page'), 1, 1, 10000);
  const rows = await env.DB.prepare(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.meta, a.created_at, u.name AS actor_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`
  ).all();
  return json({ logs: rows.results, page });
}

// ---------- content (FAQ / announcements) ----------
export async function listContentAdmin(env, request) {
  await requireAdmin(env, request);
  const rows = await env.DB.prepare('SELECT * FROM content ORDER BY kind, sort_order, id').all();
  return json({ items: rows.results });
}

function contentFields(b) {
  if (!['faq', 'announcement'].includes(b.kind)) throw new HttpError(400, 'نوع محتوا معتبر نیست.', 'invalid');
  return {
    kind: b.kind,
    title: cleanText(b.title, { min: 2, max: 200, field: 'عنوان' }),
    body: cleanText(b.body, { min: 2, max: 5000, field: 'متن', multiline: true }),
    published: b.published === false ? 0 : 1,
    sort_order: intParam(b.sort_order, 0, -1000, 1000),
  };
}

export async function createContent(env, request) {
  const admin = await requireAdmin(env, request);
  const c = contentFields(await readJson(request));
  const res = await env.DB.prepare('INSERT INTO content (kind, title, body, published, sort_order) VALUES (?, ?, ?, ?, ?)')
    .bind(c.kind, c.title, c.body, c.published, c.sort_order).run();
  await audit(env, admin.id, 'content.create', 'content', res.meta.last_row_id, { kind: c.kind });
  return json({ id: res.meta.last_row_id }, 201);
}

export async function updateContent(env, request, id) {
  const admin = await requireAdmin(env, request);
  const c = contentFields(await readJson(request));
  const res = await env.DB.prepare("UPDATE content SET kind=?, title=?, body=?, published=?, sort_order=?, updated_at=datetime('now') WHERE id=?")
    .bind(c.kind, c.title, c.body, c.published, c.sort_order, id).run();
  if (!res.meta.changes) throw new HttpError(404, 'مورد پیدا نشد.', 'not_found');
  await audit(env, admin.id, 'content.update', 'content', id);
  return json({ ok: true });
}

export async function deleteContent(env, request, id) {
  const admin = await requireAdmin(env, request);
  const res = await env.DB.prepare('DELETE FROM content WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, 'مورد پیدا نشد.', 'not_found');
  await audit(env, admin.id, 'content.delete', 'content', id);
  return json({ ok: true });
}

// ---------- settings (contact info shown on the public site) ----------
const SETTING_RULES = {
  whatsapp: { re: /^\d{8,15}$/, msg: 'شمارهٔ واتساپ را با کد کشور و بدون + بنویسید. نمونه: 93701234567' },
  telegram: { re: /^[A-Za-z][A-Za-z0-9_]{4,31}$/, msg: 'نام کاربری تلگرام را بدون @ بنویسید (۵ تا ۳۲ نویسه انگلیسی).' },
  phone: { re: /^\+?\d{8,15}$/, msg: 'شمارهٔ تماس معتبر نیست.' },
  email: { re: /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/, msg: 'ایمیل معتبر نیست.' },
  facebook: { re: /^https:\/\/(www\.)?facebook\.com\/[A-Za-z0-9_.\-\/?=&%]{1,150}$/, msg: 'نشانی فیس‌بوک باید با https://facebook.com/ شروع شود.' },
  instagram: { re: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.\-\/?=&%]{1,150}$/, msg: 'نشانی اینستاگرام باید با https://instagram.com/ شروع شود.' },
};

export async function getSettingsAdmin(env, request) {
  await requireAdmin(env, request);
  return json({ settings: await loadSettings(env) });
}

export async function putSettings(env, request) {
  const admin = await requireAdmin(env, request);
  const b = await readJson(request);
  const stmts = [];
  for (const [key, rule] of Object.entries(SETTING_RULES)) {
    if (!(key in b)) continue;
    const v = typeof b[key] === 'string' ? b[key].replace(/[\s]/g, '').trim() : '';
    if (!v) stmts.push(env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key));
    else {
      if (!rule.re.test(v)) throw new HttpError(400, rule.msg, 'invalid');
      stmts.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(key, v));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await audit(env, admin.id, 'settings.update', 'settings', null, { keys: Object.keys(b).filter((k) => k in SETTING_RULES) });
  return json({ ok: true, settings: await loadSettings(env) });
}

async function loadSettings(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows.results) if (SETTING_RULES[r.key]) out[r.key] = r.value;
  return out;
}

// ---------- public (no login) ----------
export async function publicSettings(env) {
  return json({ settings: await loadSettings(env) }, 200, { 'Cache-Control': 'public, max-age=300' });
}

export async function publicContent(env, request) {
  const kind = new URL(request.url).searchParams.get('kind');
  if (!['faq', 'announcement'].includes(kind)) throw new HttpError(400, 'نوع محتوا معتبر نیست.', 'invalid');
  const rows = await env.DB.prepare('SELECT id, title, body, updated_at FROM content WHERE kind = ? AND published = 1 ORDER BY sort_order, id LIMIT 50')
    .bind(kind).all();
  return json({ items: rows.results }, 200, { 'Cache-Control': 'public, max-age=120' });
}
