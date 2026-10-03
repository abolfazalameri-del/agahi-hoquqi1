// Runs automatically before every deploy (see wrangler.jsonc → build.command).
// Replaces the placeholder __SITE_URL__ in the static pages with the real site address.
// Set SITE_URL (e.g. https://agahi-hoquqi.yourname.workers.dev) under Build variables in Cloudflare.
// If it is not set, the tags keep working with relative addresses; add it later for best SEO / link previews.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const url = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
if (url && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) { console.error('SITE_URL must look like https://example.workers.dev'); process.exit(1); }

let n = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (extname(p) !== '.html') continue;
    const t = readFileSync(p, 'utf8');
    if (!t.includes('__SITE_URL__')) continue;
    writeFileSync(p, t.replaceAll('__SITE_URL__', url)); n++;
  }
})('public');
console.log(`set-site-url: ${n} page(s) updated${url ? ' → ' + url : ' (no SITE_URL, using relative addresses)'}`);
