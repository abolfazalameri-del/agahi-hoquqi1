// Minimal Cloudflare D1 stand-in on top of node:sqlite — used only by the tests.
import { DatabaseSync } from 'node:sqlite';

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const clean = (a) => a.map((v) => (v === undefined ? null : v));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { return db.prepare(sql).get(...clean(args)) ?? null; },
    async all() { return { results: db.prepare(sql).all(...clean(args)), success: true }; },
    async run() {
      const r = db.prepare(sql).run(...clean(args));
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
    _run() { return db.prepare(sql).run(...clean(args)); },
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) { const r = s._run(); out.push({ success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }); }
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    _raw: db,
  };
}
