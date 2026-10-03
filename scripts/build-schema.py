#!/usr/bin/env python3
"""Regenerates src/schema.js from migrations/0001_init.sql (the worker creates tables on first run)."""
import re, json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
sql = (root / 'migrations' / '0001_init.sql').read_text(encoding='utf8')
sql = re.sub(r'--[^\n]*', '', sql)
stmts = [re.sub(r'\s+', ' ', s).strip() for s in sql.split(';')]
stmts = [s for s in stmts if s and not s.upper().startswith('PRAGMA')]
out = '// AUTO-GENERATED from migrations/0001_init.sql by scripts/build-schema.py — do not edit by hand.\n'
out += 'export const SCHEMA_STATEMENTS = ' + json.dumps(stmts, indent=2) + ';\n'
(root / 'src' / 'schema.js').write_text(out, encoding='utf8')
print(len(stmts), 'statements')
