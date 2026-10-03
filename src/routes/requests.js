import {
  HttpError, json, readJson, cleanText, randomToken, toB64, fromB64, STATUS_LABELS, intParam,
} from '../lib/util.js';
import { requireUser, rateLimit } from '../lib/core.js';

export const SERVICES = {
  'document-review': 'بررسی اولیه سند',
  'document-drafting': 'تنظیم سند',
  'custom-contract': 'تنظیم قرارداد سفارشی',
  guidance: 'راهنمایی حقوقی',
  other: 'سایر خدمات',
};

const ALLOWED_FIELDS = {
  'document-review': ['desc', 'contact'],
  'document-drafting': ['desc', 'contact'],
  'custom-contract': ['type', 'amount', 'desc', 'contact'],
  guidance: ['desc', 'contact'],
  other: ['desc', 'contact'],
};
const CONTRACT_TYPES = ['قرض', 'اجاره', 'شراکت', 'خرید و فروش', 'سایر'];
const CONTACT_METHODS = ['واتساپ', 'تلگرام', 'تماس تلفنی', 'پیامک'];

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function trackingCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return 'AH-' + [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

export const FILE_TYPES = {
  'application/pdf': (u) => u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46 && u[4] === 0x2d, // %PDF-
  'image/jpeg': (u) => u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff,
  'image/png': (u) => u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47 && u[4] === 0x0d && u[5] === 0x0a && u[6] === 0x1a && u[7] === 0x0a,
};
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const CHUNK = 700000; // raw bytes per D1 row (≈ 0.93 MB as base64, below D1's 2 MB row limit)

const maxFileBytes = (env) => {
  const n = parseInt(env.MAX_FILE_BYTES, 10);
  const def = env.FILES ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
  return Number.isInteger(n) && n > 0 ? n : def;
};
const MAX_FILES_PER_REQUEST = 3;

async function loadOwnRequest(env, user, id) {
  const r = await env.DB.prepare('SELECT * FROM service_requests WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!r) throw new HttpError(404, 'درخواست پیدا نشد.', 'not_found');
  return r;
}

export function shapeRequest(r) {
  let details = {};
  try { details = JSON.parse(r.details); } catch { /* ignore */ }
  return {
    id: r.id, tracking_code: r.tracking_code, service_type: r.service_type,
    service_label: SERVICES[r.service_type] || r.service_type, title: r.title, details,
    status: r.status, status_label: STATUS_LABELS[r.status], created_at: r.created_at, updated_at: r.updated_at,
    ...(r.user_name !== undefined ? { user_name: r.user_name, user_phone: r.user_phone } : {}),
  };
}

export async function createRequest(env, request) {
  const u = await requireUser(env, request);
  await rateLimit(env, request, 'newreq', 10, 3600, String(u.id));
  const b = await readJson(request);
  const type = typeof b.service_type === 'string' ? b.service_type : '';
  if (!SERVICES[type]) throw new HttpError(400, 'نوع خدمت معتبر نیست.', 'invalid');

  const f = b.fields && typeof b.fields === 'object' ? b.fields : {};
  const details = {};
  for (const key of ALLOWED_FIELDS[type]) {
    if (key === 'desc') details.desc = cleanText(f.desc, { min: 10, max: 3000, field: 'توضیحات', multiline: true });
    else if (key === 'amount') { const a = cleanText(f.amount, { max: 200, field: 'مبلغ یا موضوع' }); if (a) details.amount = a; }
    else if (key === 'type') {
      const t = cleanText(f.type, { max: 40, field: 'نوع قرارداد' });
      if (!CONTRACT_TYPES.includes(t)) throw new HttpError(400, 'نوع قرارداد معتبر نیست.', 'invalid');
      details.type = t;
    } else if (key === 'contact') {
      const c = cleanText(f.contact, { max: 40, field: 'روش تماس' });
      if (c && !CONTACT_METHODS.includes(c)) throw new HttpError(400, 'روش تماس معتبر نیست.', 'invalid');
      if (c) details.contact = c;
    }
  }
  const title = SERVICES[type] + (details.type ? ` — ${details.type}` : '');

  let code, id;
  for (let i = 0; i < 5; i++) {
    code = trackingCode();
    try {
      const res = await env.DB.prepare('INSERT INTO service_requests (tracking_code, user_id, service_type, title, details) VALUES (?, ?, ?, ?, ?)')
        .bind(code, u.id, type, title, JSON.stringify(details)).run();
      id = res.meta.last_row_id;
      break;
    } catch (e) {
      if (!String(e.message).includes('UNIQUE')) throw e;
    }
  }
  if (!id) throw new HttpError(500, 'ثبت درخواست انجام نشد. دوباره تلاش کنید.', 'server');
  return json({ id, tracking_code: code, status: 'new', status_label: STATUS_LABELS.new }, 201);
}

export async function listRequests(env, request) {
  const u = await requireUser(env, request);
  const rows = await env.DB.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM request_files f WHERE f.request_id = r.id) AS file_count
       FROM service_requests r WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 100`
  ).bind(u.id).all();
  return json({ requests: rows.results.map((r) => ({ ...shapeRequest(r), file_count: r.file_count })) });
}

export async function getRequest(env, request, id) {
  const u = await requireUser(env, request);
  const r = await loadOwnRequest(env, u, id);
  const [msgs, files] = await Promise.all([
    env.DB.prepare('SELECT id, author_role, body, created_at FROM request_messages WHERE request_id = ? ORDER BY id').bind(id).all(),
    env.DB.prepare('SELECT id, original_name, mime, size, created_at FROM request_files WHERE request_id = ? ORDER BY created_at').bind(id).all(),
  ]);
  return json({ request: shapeRequest(r), messages: msgs.results, files: files.results });
}

export async function trackRequest(env, request) {
  const u = await requireUser(env, request);
  const code = (new URL(request.url).searchParams.get('code') || '').trim().toUpperCase();
  if (!/^AH-[A-Z0-9]{8}$/.test(code)) throw new HttpError(400, 'شمارهٔ پیگیری معتبر نیست. نمونه: AH-XXXXXXXX', 'invalid');
  const r = await env.DB.prepare('SELECT * FROM service_requests WHERE tracking_code = ? AND user_id = ?').bind(code, u.id).first();
  if (!r) throw new HttpError(404, 'درخواستی با این شماره در حساب شما پیدا نشد.', 'not_found');
  return json({ request: shapeRequest(r) });
}

export async function addUserMessage(env, request, id) {
  const u = await requireUser(env, request);
  await rateLimit(env, request, 'msg', 30, 3600, String(u.id));
  const r = await loadOwnRequest(env, u, id);
  if (r.status === 'cancelled' || r.status === 'completed') throw new HttpError(409, 'این درخواست بسته شده و پیام جدید پذیرفته نمی‌شود.', 'closed');
  const b = await readJson(request);
  const body = cleanText(b.body, { min: 1, max: 2000, field: 'پیام', multiline: true });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO request_messages (request_id, author_id, author_role, body) VALUES (?, ?, 'user', ?)").bind(id, u.id, body),
    env.DB.prepare("UPDATE service_requests SET updated_at = datetime('now'), status = CASE WHEN status = 'needs_info' THEN 'reviewing' ELSE status END WHERE id = ?").bind(id),
  ]);
  return json({ ok: true }, 201);
}

export async function cancelRequest(env, request, id) {
  const u = await requireUser(env, request);
  const r = await loadOwnRequest(env, u, id);
  if (r.status === 'completed' || r.status === 'cancelled') throw new HttpError(409, 'این درخواست قابل لغو نیست.', 'closed');
  await env.DB.prepare("UPDATE service_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return json({ ok: true, status: 'cancelled', status_label: STATUS_LABELS.cancelled });
}

// ---------- files ----------
function safeName(name) {
  const n = String(name || 'file').normalize('NFC').replace(/[\u0000-\u001F\u007F\\/:*?"<>|\u202A-\u202E]/g, '_').trim();
  return n.slice(-120) || 'file';
}

export async function uploadFile(env, request, id) {
  const u = await requireUser(env, request);
  await rateLimit(env, request, 'upload', 15, 3600, String(u.id));
  const r = await loadOwnRequest(env, u, id);
  if (r.status === 'cancelled' || r.status === 'completed') throw new HttpError(409, 'این درخواست بسته شده است.', 'closed');

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM request_files WHERE request_id = ?').bind(id).first();
  if (count.n >= MAX_FILES_PER_REQUEST) throw new HttpError(409, `حداکثر ${MAX_FILES_PER_REQUEST} فایل برای هر درخواست مجاز است.`, 'too_many_files');

  const max = maxFileBytes(env);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > max + 4096) throw new HttpError(413, `حجم فایل نباید بیشتر از ${Math.floor(max / 1048576)} مگابایت باشد.`, 'too_large');

  let form;
  try { form = await request.formData(); } catch { throw new HttpError(400, 'فایل دریافت نشد.', 'bad_form'); }
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new HttpError(400, 'فایلی انتخاب نشده است.', 'invalid');
  if (file.size === 0) throw new HttpError(400, 'فایل خالی است.', 'invalid');
  if (file.size > max) throw new HttpError(413, `حجم فایل نباید بیشتر از ${Math.floor(max / 1048576)} مگابایت باشد.`, 'too_large');

  const bytes = new Uint8Array(await file.arrayBuffer());
  // The type is decided by the file's real content (magic bytes), never by the name or the browser-reported type.
  const mime = Object.keys(FILE_TYPES).find((m) => FILE_TYPES[m](bytes));
  if (!mime) throw new HttpError(415, 'فقط فایل‌های PDF، JPG و PNG پذیرفته می‌شود.', 'bad_type');

  const fileId = randomToken(18);
  const name = safeName(file.name);
  const useR2 = !!env.FILES;
  if (useR2) await env.FILES.put(fileId, bytes, { httpMetadata: { contentType: mime } });
  const stmts = [
    env.DB.prepare('INSERT INTO request_files (id, request_id, user_id, original_name, mime, size, storage) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(fileId, id, u.id, name, mime, bytes.length, useR2 ? 'r2' : 'd1'),
  ];
  if (!useR2) {
    for (let i = 0, idx = 0; i < bytes.length; i += CHUNK, idx++) {
      stmts.push(env.DB.prepare('INSERT INTO file_chunks (file_id, idx, data) VALUES (?, ?, ?)').bind(fileId, idx, toB64(bytes.subarray(i, i + CHUNK))));
    }
  }
  stmts.push(env.DB.prepare("UPDATE service_requests SET updated_at = datetime('now') WHERE id = ?").bind(id));
  await env.DB.batch(stmts);
  return json({ file: { id: fileId, original_name: name, mime, size: bytes.length } }, 201);
}

export async function readFileResponse(env, fileRow) {
  let body;
  if (fileRow.storage === 'r2') {
    const obj = env.FILES && (await env.FILES.get(fileRow.id));
    if (!obj) throw new HttpError(404, 'فایل پیدا نشد.', 'not_found');
    body = obj.body;
  } else {
    const chunks = await env.DB.prepare('SELECT data FROM file_chunks WHERE file_id = ? ORDER BY idx').bind(fileRow.id).all();
    if (!chunks.results.length) throw new HttpError(404, 'فایل پیدا نشد.', 'not_found');
    const parts = chunks.results.map((c) => fromB64(c.data));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    body = out;
  }
  const ext = EXT[fileRow.mime] || 'bin';
  const base = fileRow.original_name.replace(/\.[^.]*$/, '') || 'file';
  const fname = encodeURIComponent(`${base}.${ext}`);
  return new Response(body, {
    headers: {
      'Content-Type': fileRow.mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${fname}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

export async function downloadFile(env, request, fileId) {
  const u = await requireUser(env, request);
  const f = await env.DB.prepare('SELECT * FROM request_files WHERE id = ?').bind(fileId).first();
  // Owners and admins only. Other users get the same "not found" as for a missing file.
  if (!f || (f.user_id !== u.id && u.role !== 'admin')) throw new HttpError(404, 'فایل پیدا نشد.', 'not_found');
  return readFileResponse(env, f);
}

export async function listAllMyFiles(env, request) {
  const u = await requireUser(env, request);
  const rows = await env.DB.prepare(
    `SELECT f.id, f.original_name, f.mime, f.size, f.created_at, r.tracking_code
       FROM request_files f JOIN service_requests r ON r.id = f.request_id
      WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 100`
  ).bind(u.id).all();
  return json({ files: rows.results });
}

export async function deleteFile(env, request, fileId) {
  const u = await requireUser(env, request);
  const f = await env.DB.prepare('SELECT * FROM request_files WHERE id = ? AND user_id = ?').bind(fileId, u.id).first();
  if (!f) throw new HttpError(404, 'فایل پیدا نشد.', 'not_found');
  if (f.storage === 'r2' && env.FILES) await env.FILES.delete(f.id);
  await env.DB.prepare('DELETE FROM request_files WHERE id = ?').bind(fileId).run();
  return json({ ok: true });
}

// ---------- notifications ----------
export async function listNotifications(env, request) {
  const u = await requireUser(env, request);
  const limit = intParam(new URL(request.url).searchParams.get('limit'), 30, 1, 100);
  const rows = await env.DB.prepare(
    `SELECT n.id, n.title, n.body, n.link, n.created_at,
            (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = ?1) AS is_read
       FROM notifications n
      WHERE (n.user_id = ?1 OR n.user_id IS NULL) AND n.created_at >= ?2
      ORDER BY n.id DESC LIMIT ?3`
  ).bind(u.id, u.created_at, limit).all();
  const list = rows.results.map((n) => ({ ...n, is_read: !!n.is_read }));
  return json({ notifications: list, unread: list.filter((n) => !n.is_read).length });
}

export async function markNotificationsRead(env, request) {
  const u = await requireUser(env, request);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
       SELECT id, ?1 FROM notifications WHERE (user_id = ?1 OR user_id IS NULL) AND created_at >= ?2`
  ).bind(u.id, u.created_at).run();
  return json({ ok: true });
}
