#!/usr/bin/env python3
"""Checks every internal link/asset in public/ (run before publishing: python3 scripts/check-links.py)."""
import re, sys, glob, pathlib, collections
root = pathlib.Path(__file__).resolve().parent.parent / 'public'
pages = {}
for f in root.rglob('*.html'):
    rel = f.relative_to(root).as_posix()
    pages[('/' if rel == 'index.html' else '/' + rel[:-10]) if rel.endswith('index.html') else '/' + rel] = f
ids_cache = {}
def ids(f):
    if f not in ids_cache: ids_cache[f] = set(re.findall(r'\bid="([^"]+)"', f.read_text(encoding='utf8')))
    return ids_cache[f]
bad = collections.defaultdict(list)
for url, f in pages.items():
    t = f.read_text(encoding='utf8')
    for attr, u in re.findall(r'\b(href|src)="([^"]*)"', t):
        if re.match(r'(https?:|mailto:|tel:|data:|javascript:|__SITE_URL__)', u) or u == '': continue
        path, _, frag = u.partition('#'); path = path.split('?')[0]
        target = None
        if path == '': target = f
        elif path in pages: target = pages[path]
        else:
            p = root / path.lstrip('/')
            if p.is_file(): target = p
            elif path.endswith('/') and path in pages: target = pages[path]
            else: bad[(url, u)].append(attr); continue
        if frag and target.suffix == '.html' and frag not in ids(target) and not frag.startswith('i-'):
            bad[(url, u)].append('missing anchor')
        if frag.startswith('i-') and path == '' and frag not in ids(f): bad[(url, u)].append('missing icon')
if bad:
    for (url, u), why in sorted(bad.items())[:60]: print('BROKEN', url, '->', u, why)
    print(len(bad), 'broken links'); sys.exit(1)
print('OK: no broken internal links in', len(pages), 'pages')
