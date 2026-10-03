// Cloudflare Worker: serves the JSON API under /api/*.
// Static pages are served directly by Cloudflare (see wrangler.jsonc "assets") and never reach this code.
import { HttpError, json } from './lib/util.js';
import { ensureSchema, checkCsrf, maybeCleanup } from './lib/core.js';
import * as auth from './routes/auth.js';
import * as req from './routes/requests.js';
import * as admin from './routes/admin.js';

const ID = '(\\d{1,12})';
const FID = '([A-Za-z0-9_-]{10,60})';

// [method, path regex, handler, takes id param?]
const ROUTES = [
  ['POST', '/api/auth/register', auth.register],
  ['POST', '/api/auth/login', auth.login],
  ['POST', '/api/auth/logout', auth.logout],
  ['GET', '/api/auth/me', auth.me],
  ['PATCH', '/api/auth/me', auth.updateMe],
  ['POST', '/api/auth/password', auth.changePassword],
  ['POST', '/api/auth/delete', auth.deleteMe],

  ['POST', '/api/requests', req.createRequest],
  ['GET', '/api/requests', req.listRequests],
  ['GET', '/api/requests/track', req.trackRequest],
  ['GET', `/api/requests/${ID}`, req.getRequest],
  ['POST', `/api/requests/${ID}/messages`, req.addUserMessage],
  ['POST', `/api/requests/${ID}/cancel`, req.cancelRequest],
  ['POST', `/api/requests/${ID}/files`, req.uploadFile],
  ['GET', '/api/files', req.listAllMyFiles],
  ['GET', `/api/files/${FID}`, req.downloadFile],
  ['DELETE', `/api/files/${FID}`, req.deleteFile],
  ['GET', '/api/notifications', req.listNotifications],
  ['POST', '/api/notifications/read', req.markNotificationsRead],

  ['GET', '/api/public/settings', admin.publicSettings],
  ['GET', '/api/public/content', admin.publicContent],

  ['POST', '/api/admin/bootstrap', admin.bootstrapAdmin],
  ['GET', '/api/admin/stats', admin.stats],
  ['GET', '/api/admin/users', admin.listUsers],
  ['PATCH', `/api/admin/users/${ID}`, admin.setUserActive],
  ['GET', '/api/admin/requests', admin.listRequestsAdmin],
  ['GET', `/api/admin/requests/${ID}`, admin.getRequestAdmin],
  ['PATCH', `/api/admin/requests/${ID}`, admin.setRequestStatus],
  ['POST', `/api/admin/requests/${ID}/reply`, admin.replyToRequest],
  ['GET', `/api/admin/files/${FID}`, admin.adminDownloadFile],
  ['DELETE', `/api/admin/files/${FID}`, admin.adminDeleteFile],
  ['POST', '/api/admin/notifications', admin.sendNotification],
  ['GET', '/api/admin/audit', admin.listAudit],
  ['GET', '/api/admin/content', admin.listContentAdmin],
  ['POST', '/api/admin/content', admin.createContent],
  ['PUT', `/api/admin/content/${ID}`, admin.updateContent],
  ['DELETE', `/api/admin/content/${ID}`, admin.deleteContent],
  ['GET', '/api/admin/settings', admin.getSettingsAdmin],
  ['PUT', '/api/admin/settings', admin.putSettings],
].map(([m, p, h]) => [m, new RegExp(`^${p}/?$`), h]);

export async function handle(request, env) {
  const url = new URL(request.url);
  try {
    if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'صفحه پیدا نشد.', 'not_found');
    let pathMatched = false;
    for (const [method, re, handler] of ROUTES) {
      const m = re.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (method !== request.method) continue;
      checkCsrf(request);
      await ensureSchema(env);
      const id = m[1] && /^\d+$/.test(m[1]) ? Number(m[1]) : m[1];
      const res = await handler(env, request, id);
      return res;
    }
    throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'این روش برای این آدرس مجاز نیست.' : 'آدرس پیدا نشد.', pathMatched ? 'method' : 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
    console.error('Unhandled error', request.method, url.pathname, e && e.stack ? e.stack : e); // details stay in Cloudflare logs only
    return json({ error: { code: 'server', message: 'خطایی در سرور رخ داد. لطفاً کمی بعد دوباره تلاش کنید.' } }, 500);
  }
}

// robots.txt and sitemap.xml are generated from the real site address, so they are right on any *.workers.dev address
// or custom domain. The templates live in public/ and contain the placeholder __SITE_URL__.
async function templated(request, env, file, type) {
  const origin = (env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  const asset = await env.ASSETS.fetch(new Request(new URL(file, request.url)));
  if (!asset.ok) return new Response('Not found', { status: 404 });
  const body = (await asset.text()).replaceAll('__SITE_URL__', origin);
  return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' } });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/robots.txt') return templated(request, env, '/robots.template.txt', 'text/plain; charset=utf-8');
    if (pathname === '/sitemap.xml') return templated(request, env, '/sitemap.template.xml', 'application/xml; charset=utf-8');
    const res = await handle(request, env);
    if (env.DB) ctx.waitUntil(maybeCleanup(env).catch(() => {}));
    return res;
  },
};
