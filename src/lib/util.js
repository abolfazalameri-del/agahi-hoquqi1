// Shared helpers: HTTP responses, cookies, crypto, validation.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || String(status);
  }
}

export const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...API_HEADERS, ...extra } });
}

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export async function readJson(request, maxBytes = 65536) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'حجم درخواست بیش از حد مجاز است.', 'too_large');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'حجم درخواست بیش از حد مجاز است.', 'too_large');
  try {
    const v = JSON.parse(text || '{}');
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad');
    return v;
  } catch {
    throw new HttpError(400, 'اطلاعات ارسال‌شده معتبر نیست.', 'bad_json');
  }
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

// ---------- crypto ----------
const enc = new TextEncoder();

export function toB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
export function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const toB64Url = (b) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomToken(bytes = 32) {
  return toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

// Format: pbkdf2$sha256$<iterations>$<salt b64>$<hash b64>   (iterations are stored, so they can be raised later)
export async function hashPassword(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const p = String(stored).split('$');
  if (p.length !== 5 || p[0] !== 'pbkdf2') return false;
  const iterations = Number(p[2]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1000000) return false;
  const hash = await pbkdf2(password, fromB64(p[3]), iterations);
  return timingSafeEqual(toB64(hash), p[4]);
}

// ---------- validation ----------
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
export function normalizeDigits(s) {
  return String(s).replace(/[۰-۹٠-٩]/g, (c) => {
    const i = FA.indexOf(c);
    return String(i >= 0 ? i : AR.indexOf(c));
  });
}

// Accepts 0XXXXXXXXX (existing site rule), 93XXXXXXXXX / +93XXXXXXXXX / 0093XXXXXXXXX (normalised to 0XXXXXXXXX),
// or any other international number written as +<10-15 digits>.
export function normalizePhone(input) {
  let s = normalizeDigits(input).replace(/[\s\-().]/g, '');
  if (s.startsWith('0093')) s = '+93' + s.slice(4);
  if (/^\+93\d{9}$/.test(s)) return '0' + s.slice(3);
  if (/^93\d{9}$/.test(s)) return '0' + s.slice(2);
  if (/^0\d{9}$/.test(s)) return s;
  if (/^\+\d{10,15}$/.test(s)) return s;
  return null;
}

export function cleanText(v, { min = 0, max = 2000, field = 'متن', multiline = false } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `${field} معتبر نیست.`, 'invalid');
  let s = v.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.trim();
  if (s.length < min) throw new HttpError(400, `${field} باید حداقل ${min} نویسه باشد.`, 'invalid');
  if (s.length > max) throw new HttpError(400, `${field} نباید بیشتر از ${max} نویسه باشد.`, 'invalid');
  return s;
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'رمز عبور باید حداقل ۸ نویسه باشد.', 'weak_password');
  if (pw.length > 128) throw new HttpError(400, 'رمز عبور بیش از حد طولانی است.', 'invalid');
  if (!/\d/.test(pw) || !/\D/.test(pw)) throw new HttpError(400, 'رمز عبور باید ترکیبی از حروف و عدد باشد.', 'weak_password');
  return pw;
}

export function intParam(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export const STATUSES = ['new', 'reviewing', 'needs_info', 'completed', 'cancelled'];
export const STATUS_LABELS = {
  new: 'جدید',
  reviewing: 'در حال بررسی',
  needs_info: 'نیازمند اطلاعات بیشتر',
  completed: 'تکمیل شده',
  cancelled: 'لغو شده',
};

// SQLite datetime('now') → ISO string with Z for the browser
export function isoNow(offsetSeconds = 0) {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
}
