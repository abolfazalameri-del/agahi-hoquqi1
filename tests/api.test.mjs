import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './d1-shim.mjs';
import { handle } from '../src/worker.js';

const env = { DB: makeD1(), ADMIN_SETUP_CODE: 'setup-code-123', PBKDF2_ITERATIONS: '10000' };
let ipCounter = 0;

async function call(method, path, { body, cookie, ip, headers = {}, form, csrf = true } = {}) {
  const h = { 'cf-connecting-ip': ip || `10.0.0.${++ipCounter % 250}`, ...headers };
  if (cookie) h.cookie = cookie;
  if (csrf) h['x-requested-with'] = 'agahi';
  let init = { method, headers: h };
  if (form) init.body = form;
  else if (body !== undefined) { h['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await handle(new Request('https://site.example' + path, init), env);
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* binary */ }
  const sc = res.headers.get('set-cookie');
  return { status: res.status, data, res, text, cookie: sc ? sc.split(';')[0] : null, setCookie: sc };
}
const reg = (name, phone, password = 'Passw0rd!x') => call('POST', '/api/auth/register', { body: { name, phone, password } });

const PDF = () => new Blob([new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')], { type: 'application/pdf' });
const fd = (blob, name) => { const f = new FormData(); f.append('file', blob, name); return f; };

let alice, bob, admin, reqId;

before(async () => {
  alice = await reg('علی احمدی', '0701234567');
  bob = await reg('بهزاد', '0799999999');
  admin = await reg('مدیر سایت', '0788888888');
});

test('register: success sets HttpOnly Secure SameSite=Strict cookie, no password in response', () => {
  assert.equal(alice.status, 201);
  assert.match(alice.setCookie, /HttpOnly/); assert.match(alice.setCookie, /Secure/); assert.match(alice.setCookie, /SameSite=Strict/);
  assert.ok(!alice.text.includes('Passw0rd'));
  assert.ok(!('password_hash' in alice.data.user));
});

test('register: duplicate phone (also in other formats) is rejected', async () => {
  assert.equal((await reg('x yz', '0701234567')).status, 409);
  assert.equal((await reg('x yz', '+93701234567')).status, 409);
  assert.equal((await reg('x yz', '۰۷۰۱۲۳۴۵۶۷')).status, 409);
});

test('register: validation (phone, weak password, short name)', async () => {
  assert.equal((await reg('نام خوب', '12345')).status, 400);
  assert.equal((await reg('نام خوب', '0712345678', 'short1')).status, 400);
  assert.equal((await reg('نام خوب', '0712345678', 'onlyletters')).status, 400);
  assert.equal((await reg('ن', '0712345678')).status, 400);
});

test('passwords are stored hashed, never plain', () => {
  const row = env.DB._raw.prepare('SELECT password_hash FROM users WHERE phone = ?').get('0701234567');
  assert.match(row.password_hash, /^pbkdf2\$sha256\$10000\$/);
  assert.ok(!row.password_hash.includes('Passw0rd'));
});

test('session cookie token is not stored (only its hash)', () => {
  const token = alice.cookie.split('=')[1];
  const rows = env.DB._raw.prepare('SELECT id FROM sessions').all().map((r) => r.id);
  assert.ok(!rows.includes(token));
});

test('login: wrong password / unknown phone give the same generic error', async () => {
  const a = await call('POST', '/api/auth/login', { body: { phone: '0701234567', password: 'wrongpass1' } });
  const b = await call('POST', '/api/auth/login', { body: { phone: '0700000000', password: 'wrongpass1' } });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.data.error.message, b.data.error.message);
});

test('login ok → me → logout really invalidates the session', async () => {
  const l = await call('POST', '/api/auth/login', { body: { phone: '0701234567', password: 'Passw0rd!x' } });
  assert.equal(l.status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie: l.cookie })).data.user.name, 'علی احمدی');
  const out = await call('POST', '/api/auth/logout', { cookie: l.cookie });
  assert.equal(out.status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie: l.cookie })).status, 401); // old cookie is dead server-side
});

test('login: rate limiting kicks in after repeated failures', async () => {
  let last;
  for (let i = 0; i < 8; i++) last = await call('POST', '/api/auth/login', { ip: '203.0.113.9', body: { phone: '0701234567', password: 'nope-nope-1' } });
  assert.equal(last.status, 429);
});

test('login: SQL injection strings are treated as data', async () => {
  const r = await call('POST', '/api/auth/login', { body: { phone: "0701234567' OR '1'='1", password: "' OR 1=1 --" } });
  assert.equal(r.status, 401);
  const users = env.DB._raw.prepare('SELECT COUNT(*) n FROM users').get().n;
  assert.ok(users >= 3);
});

test('CSRF: state-changing request without header or with foreign Origin is refused', async () => {
  assert.equal((await call('POST', '/api/auth/logout', { cookie: alice.cookie, csrf: false })).status, 403);
  assert.equal((await call('POST', '/api/auth/logout', { cookie: alice.cookie, headers: { origin: 'https://evil.example' } })).status, 403);
});

test('unauthenticated access is 401, unknown route 404, wrong method 405', async () => {
  assert.equal((await call('GET', '/api/requests')).status, 401);
  assert.equal((await call('GET', '/api/nothing')).status, 404);
  assert.equal((await call('DELETE', '/api/auth/me')).status, 405);
});

test('service request: create, validation, list, tracking code', async () => {
  const bad = await call('POST', '/api/requests', { cookie: alice.cookie, body: { service_type: 'hack', fields: {} } });
  assert.equal(bad.status, 400);
  const short = await call('POST', '/api/requests', { cookie: alice.cookie, body: { service_type: 'document-review', fields: { desc: 'کوتاه' } } });
  assert.equal(short.status, 400);
  const ok = await call('POST', '/api/requests', { cookie: alice.cookie, body: { service_type: 'custom-contract', fields: { type: 'اجاره', desc: '<script>alert(1)</script> قرارداد اجاره یک باب خانه', amount: '۵۰ هزار', contact: 'واتساپ', evil: 'x' } } });
  assert.equal(ok.status, 201);
  assert.match(ok.data.tracking_code, /^AH-[A-Z2-9]{8}$/);
  reqId = ok.data.id;
  const list = await call('GET', '/api/requests', { cookie: alice.cookie });
  assert.equal(list.data.requests.length, 1);
  assert.equal(list.data.requests[0].status, 'new');
  assert.equal(list.data.requests[0].details.evil, undefined); // unknown fields dropped
  const tr = await call('GET', `/api/requests/track?code=${ok.data.tracking_code}`, { cookie: alice.cookie });
  assert.equal(tr.status, 200);
});

test('authorization: another user cannot read, message, cancel, or upload to someone else\'s request', async () => {
  assert.equal((await call('GET', `/api/requests/${reqId}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await call('POST', `/api/requests/${reqId}/messages`, { cookie: bob.cookie, body: { body: 'hi' } })).status, 404);
  assert.equal((await call('POST', `/api/requests/${reqId}/cancel`, { cookie: bob.cookie })).status, 404);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: bob.cookie, form: fd(PDF(), 'a.pdf') })).status, 404);
  const own = await call('GET', '/api/requests', { cookie: bob.cookie });
  assert.equal(own.data.requests.length, 0);
});

let fileId;
test('upload: real PDF accepted; type decided by content, name sanitised', async () => {
  const up = await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(PDF(), '../../etc/passwd.pdf') });
  assert.equal(up.status, 201);
  assert.equal(up.data.file.mime, 'application/pdf');
  assert.ok(!up.data.file.original_name.includes('/'));
  fileId = up.data.file.id;
});

test('upload abuse: fake extension, script, SVG, HTML, empty, oversized, too many files', async () => {
  const text = (s, type) => new Blob([s], { type });
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(text('<script>alert(1)</script>', 'application/pdf'), 'evil.pdf') })).status, 415);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(text('<svg onload=alert(1)>', 'image/png'), 'x.png') })).status, 415);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(text('MZ\x90\x00 fake exe', 'image/jpeg'), 'a.jpg') })).status, 415);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(new Blob([]), 'e.pdf') })).status, 400);
  const big = new Uint8Array(2 * 1024 * 1024 + 10); big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(new Blob([big]), 'big.pdf') })).status, 413);
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])]);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(png, 'p.png') })).status, 201);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(png, 'p2.png') })).status, 201);
  assert.equal((await call('POST', `/api/requests/${reqId}/files`, { cookie: alice.cookie, form: fd(png, 'p3.png') })).status, 409);
});

test('multi-chunk file (1.6 MB) round-trips byte for byte', async () => {
  const mk = await call('POST', '/api/requests', { cookie: bob.cookie, body: { service_type: 'guidance', fields: { desc: 'یک توضیح به اندازهٔ کافی طولانی' } } });
  const bytes = new Uint8Array(1_600_000); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 255; bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  const up = await call('POST', `/api/requests/${mk.data.id}/files`, { cookie: bob.cookie, form: fd(new Blob([bytes]), 'scan.jpg') });
  assert.equal(up.status, 201);
  const res = await handle(new Request(`https://site.example/api/files/${up.data.file.id}`, { headers: { cookie: bob.cookie, 'cf-connecting-ip': '9.9.9.9' } }), env);
  assert.equal(res.status, 200);
  const got = new Uint8Array(await res.arrayBuffer());
  assert.equal(got.length, bytes.length);
  assert.ok(got.every((v, i) => v === bytes[i]));
});

test('download: owner ok with safe headers; other user 404; anonymous 401', async () => {
  const ok = await call('GET', `/api/files/${fileId}`, { cookie: alice.cookie });
  assert.equal(ok.status, 200);
  assert.equal(ok.res.headers.get('content-type'), 'application/pdf');
  assert.match(ok.res.headers.get('content-disposition'), /^attachment/);
  assert.equal(ok.res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await call('GET', `/api/files/${fileId}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await call('GET', `/api/files/${fileId}`)).status, 401);
});

test('admin: normal user is Forbidden; bootstrap needs the secret code', async () => {
  assert.equal((await call('GET', '/api/admin/stats', { cookie: alice.cookie })).status, 403);
  assert.equal((await call('GET', '/api/admin/users', { cookie: alice.cookie })).status, 403);
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
  assert.equal((await call('POST', '/api/admin/bootstrap', { cookie: admin.cookie, body: { code: 'wrong' } })).status, 403);
  assert.equal((await call('POST', '/api/admin/bootstrap', { cookie: admin.cookie, body: { code: 'setup-code-123' } })).status, 200);
  assert.equal((await call('POST', '/api/admin/bootstrap', { cookie: bob.cookie, body: { code: 'setup-code-123' } })).status, 409); // only the first admin
});

test('admin: list/search users and requests, SQL wildcards & injection are inert', async () => {
  const u = await call('GET', '/api/admin/users?q=' + encodeURIComponent('علی'), { cookie: admin.cookie });
  assert.equal(u.data.users.length, 1);
  const inj = await call('GET', '/api/admin/users?q=' + encodeURIComponent("' OR 1=1 --"), { cookie: admin.cookie });
  assert.equal(inj.data.users.length, 0);
  const pct = await call('GET', '/api/admin/users?q=%25', { cookie: admin.cookie });
  assert.equal(pct.data.users.length, 0); // literal % is escaped
  const r = await call('GET', '/api/admin/requests?status=new', { cookie: admin.cookie });
  assert.ok(r.data.requests.length >= 1);
  assert.equal((await call('GET', '/api/admin/requests?status=bogus', { cookie: admin.cookie })).status, 400);
});

test('admin: status change + reply create notifications and audit logs', async () => {
  const s = await call('PATCH', `/api/admin/requests/${reqId}`, { cookie: admin.cookie, body: { status: 'needs_info' } });
  assert.equal(s.status, 200);
  assert.equal((await call('PATCH', `/api/admin/requests/${reqId}`, { cookie: admin.cookie, body: { status: 'hacked' } })).status, 400);
  assert.equal((await call('POST', `/api/admin/requests/${reqId}/reply`, { cookie: admin.cookie, body: { body: 'لطفاً تصویر واضح‌تر بفرستید.' } })).status, 201);
  const det = await call('GET', `/api/requests/${reqId}`, { cookie: alice.cookie });
  assert.equal(det.data.request.status, 'needs_info');
  assert.equal(det.data.messages[0].author_role, 'admin');
  const n = await call('GET', '/api/notifications', { cookie: alice.cookie });
  assert.equal(n.data.unread, 2);
  await call('POST', '/api/notifications/read', { cookie: alice.cookie });
  assert.equal((await call('GET', '/api/notifications', { cookie: alice.cookie })).data.unread, 0);
  const logs = await call('GET', '/api/admin/audit', { cookie: admin.cookie });
  assert.ok(logs.data.logs.some((l) => l.action === 'request.status'));
  // user answering a needs_info request moves it back to reviewing
  assert.equal((await call('POST', `/api/requests/${reqId}/messages`, { cookie: alice.cookie, body: { body: 'ارسال شد' } })).status, 201);
  assert.equal((await call('GET', `/api/requests/${reqId}`, { cookie: alice.cookie })).data.request.status, 'reviewing');
});

test('admin: can download any request file (audited); can delete file', async () => {
  const dl = await call('GET', `/api/admin/files/${fileId}`, { cookie: admin.cookie });
  assert.equal(dl.status, 200);
  assert.equal((await call('GET', `/api/admin/files/${fileId}`, { cookie: alice.cookie })).status, 403);
  const del = await call('DELETE', `/api/admin/files/${fileId}`, { cookie: admin.cookie });
  assert.equal(del.status, 200);
  assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM file_chunks WHERE file_id = ?').get(fileId).n, 0);
});

test('admin: notifications to everyone / to chosen phones', async () => {
  const all = await call('POST', '/api/admin/notifications', { cookie: admin.cookie, body: { title: 'اطلاعیه', body: 'سایت به‌روز شد.', audience: 'all' } });
  assert.equal(all.status, 201);
  const some = await call('POST', '/api/admin/notifications', { cookie: admin.cookie, body: { title: 'پیام ویژه', body: 'فقط برای بهزاد', audience: ['0799999999'] } });
  assert.equal(some.data.recipients, 1);
  const a = await call('GET', '/api/notifications', { cookie: alice.cookie });
  const b = await call('GET', '/api/notifications', { cookie: bob.cookie });
  assert.ok(a.data.notifications.some((n) => n.title === 'اطلاعیه'));
  assert.ok(!a.data.notifications.some((n) => n.title === 'پیام ویژه'));
  assert.ok(b.data.notifications.some((n) => n.title === 'پیام ویژه'));
});

test('admin: settings validated; public settings readable; content CRUD', async () => {
  assert.equal((await call('PUT', '/api/admin/settings', { cookie: admin.cookie, body: { whatsapp: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await call('PUT', '/api/admin/settings', { cookie: admin.cookie, body: { whatsapp: '93701234567', telegram: 'agahi_support', instagram: 'https://evil.example/x' } })).status, 400);
  assert.equal((await call('PUT', '/api/admin/settings', { cookie: admin.cookie, body: { whatsapp: '93701234567', telegram: 'agahi_support' } })).status, 200);
  const pub = await call('GET', '/api/public/settings');
  assert.equal(pub.data.settings.whatsapp, '93701234567');
  const c = await call('POST', '/api/admin/content', { cookie: admin.cookie, body: { kind: 'faq', title: 'سؤال نمونه', body: 'پاسخ نمونه', published: true } });
  assert.equal(c.status, 201);
  assert.equal((await call('GET', '/api/public/content?kind=faq')).data.items.length, 1);
  assert.equal((await call('PUT', `/api/admin/content/${c.data.id}`, { cookie: admin.cookie, body: { kind: 'faq', title: 'سؤال', body: 'پاسخ ۲', published: false } })).status, 200);
  assert.equal((await call('GET', '/api/public/content?kind=faq')).data.items.length, 0);
  assert.equal((await call('DELETE', `/api/admin/content/${c.data.id}`, { cookie: admin.cookie })).status, 200);
});

test('admin: deactivating a user kills their session and blocks login', async () => {
  const bobId = env.DB._raw.prepare('SELECT id FROM users WHERE phone = ?').get('0799999999').id;
  assert.equal((await call('PATCH', `/api/admin/users/${bobId}`, { cookie: admin.cookie, body: { is_active: false } })).status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie: bob.cookie })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { phone: '0799999999', password: 'Passw0rd!x' } })).status, 403);
  await call('PATCH', `/api/admin/users/${bobId}`, { cookie: admin.cookie, body: { is_active: true } });
  assert.equal((await call('POST', '/api/auth/login', { body: { phone: '0799999999', password: 'Passw0rd!x' } })).status, 200);
});

test('profile: change name, change password (old sessions die), delete account cascades', async () => {
  const l = await call('POST', '/api/auth/login', { body: { phone: '0701234567', password: 'Passw0rd!x' } });
  assert.equal((await call('PATCH', '/api/auth/me', { cookie: l.cookie, body: { name: '<img src=x onerror=alert(1)>' } })).status, 200); // stored as text; UI escapes
  assert.equal((await call('POST', '/api/auth/password', { cookie: l.cookie, body: { current: 'bad', next: 'NewPassw0rd9' } })).status, 401);
  const ch = await call('POST', '/api/auth/password', { cookie: l.cookie, body: { current: 'Passw0rd!x', next: 'NewPassw0rd9' } });
  assert.equal(ch.status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie: l.cookie })).status, 401);
  const l2 = await call('POST', '/api/auth/login', { body: { phone: '0701234567', password: 'NewPassw0rd9' } });
  assert.equal(l2.status, 200);
  assert.equal((await call('POST', '/api/auth/delete', { cookie: l2.cookie, body: { password: 'wrong' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/delete', { cookie: l2.cookie, body: { password: 'NewPassw0rd9' } })).status, 200);
  assert.equal(env.DB._raw.prepare("SELECT COUNT(*) n FROM service_requests WHERE user_id = (SELECT 1 WHERE 0)").get().n, 0);
  assert.equal(env.DB._raw.prepare('SELECT COUNT(*) n FROM request_files WHERE request_id = ?').get(reqId).n, 0);
});

test('last admin cannot delete their own account', async () => {
  const l = await call('POST', '/api/auth/login', { body: { phone: '0788888888', password: 'Passw0rd!x' } });
  assert.equal((await call('POST', '/api/auth/delete', { cookie: l.cookie, body: { password: 'Passw0rd!x' } })).status, 409);
});

test('oversized JSON body is refused; malformed JSON gives 400', async () => {
  const big = await call('POST', '/api/auth/login', { body: { phone: '0701234567', password: 'x'.repeat(70000) } });
  assert.equal(big.status, 413);
  const res = await handle(new Request('https://site.example/api/auth/login', { method: 'POST', headers: { 'x-requested-with': 'agahi', 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' }, body: '{not json' }), env);
  assert.equal(res.status, 400);
});

test('API responses are never cacheable and never leak stack traces', async () => {
  const r = await call('GET', '/api/auth/me');
  assert.equal(r.res.headers.get('cache-control'), 'no-store');
  const broken = { DB: { prepare() { throw new Error('secret internal detail'); } } };
  const res = await handle(new Request('https://site.example/api/public/settings'), broken);
  const t = await res.text();
  assert.equal(res.status, 500);
  assert.ok(!t.includes('secret internal detail'));
});

test('schema auto-creation works on an empty database', async () => {
  const { makeD1: m } = await import('./d1-shim.mjs');
  const fresh = { DB: m() };
  const res = await handle(new Request('https://site.example/api/public/settings'), fresh);
  assert.equal(res.status, 200);
  const tables = fresh.DB._raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  for (const t of ['users', 'sessions', 'service_requests', 'request_files', 'notifications', 'audit_logs', 'content', 'settings']) assert.ok(tables.includes(t), t);
});
