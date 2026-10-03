// Tests for the existing inheritance calculator (public/assets/js/p-*.js for /tools/inheritance/).
// The calculator's rules are NOT changed; these tests pin down what it supports today.
// Displayed percentages are rounded to 1 decimal, so sums are checked with a 0.3 tolerance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../public/tools/inheritance/index.html', import.meta.url), 'utf8');
const scriptPath = page.match(/src="(\/assets\/js\/p-[0-9a-f]+\.js)"/)[1];
const code = readFileSync(new URL('../public' + scriptPath, import.meta.url), 'utf8');

const FA = '۰۱۲۳۴۵۶۷۸۹';
const num = (s) => Number(String(s).replace(/[۰-۹]/g, (c) => FA.indexOf(c)).replace(/[٫]/g, '.').replace(/[٪%\s]/g, '').replace(/٬/g, ''));

function calc(o) {
  const els = {}; let click;
  const mk = (id, extra = {}) => (els[id] = { id, value: '', style: {}, children: [], innerHTML: '', className: '', dataset: {}, classList: { add() {}, remove() {} },
    appendChild(c) { this.children.push(c); }, addEventListener(ev, fn) { if (id === 'calcBtn' && ev === 'click') click = fn; },
    scrollIntoView() {}, setAttribute() {}, querySelectorAll() { return []; }, ...extra });
  const groups = { genderChoice: ['مرد', 'زن'], spouseChoice: ['بلی', 'خیر'], fatherChoice: ['بلی', 'خیر'], motherChoice: ['بلی', 'خیر'], otherChoice: ['بلی', 'خیر'] };
  const handlers = {};
  for (const [g, vals] of Object.entries(groups)) {
    const cards = vals.map((v) => ({ dataset: { value: v }, classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener(ev, fn) { handlers[g + v] = fn; } }));
    mk(g, { querySelectorAll: () => cards });
  }
  for (const id of ['sons', 'daughters', 'siblings', 'wivesCount', 'totalValue', 'valueCurrency', 'heirList', 'noteBox', 'resultWrap', 'recalcBtn', 'calcBtn', 'wivesWrap']) mk(id);
  els.sons.value = String(o.sons ?? 0); els.daughters.value = String(o.daughters ?? 0); els.siblings.value = String(o.siblings ?? 0);
  els.wivesCount.value = String(o.wives ?? 1); els.totalValue.value = String(o.total ?? ''); els.valueCurrency.value = 'افغانی';
  const doc = { getElementById: (id) => els[id], createElement: () => ({ className: '', innerHTML: '', style: {} }) };
  let alerted = null;
  vm.runInNewContext(code, { document: doc, window: { scrollTo() {} }, alert: (m) => { alerted = m; }, parseInt, parseFloat, Math, String, Number });
  if (o.gender) handlers['genderChoice' + o.gender]();
  for (const [k, g] of [['spouse', 'spouseChoice'], ['father', 'fatherChoice'], ['mother', 'motherChoice'], ['other', 'otherChoice']]) if (o[k]) handlers[g + o[k]]();
  click();
  const rows = els.heirList.children.map((r) => {
    const name = r.innerHTML.match(/heir-name">([^<]*)</)?.[1];
    const pct = num(r.innerHTML.match(/heir-pct">([^<]*)</)?.[1]);
    return { name, pct };
  });
  return { rows, notes: els.noteBox.innerHTML, alerted, shown: els.resultWrap.style.display, total: rows.reduce((a, r) => a + r.pct, 0) };
}
const get = (res, re) => res.rows.find((r) => re.test(r.name))?.pct;
const close = (a, b, eps = 0.15) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('gender must be chosen first', () => {
  const r = calc({});
  assert.ok(r.alerted);
});

test('husband dies: wife + son → wife 1/8, son the rest', () => {
  const r = calc({ gender: 'مرد', spouse: 'بلی', sons: 1 });
  close(get(r, /همسر/), 12.5); close(get(r, /پسر/), 87.5); close(r.total, 100);
});

test('husband dies, no children: wife gets 1/4', () => {
  const r = calc({ gender: 'مرد', spouse: 'بلی', father: 'بلی' });
  close(get(r, /همسر/), 25); close(get(r, /پدر/), 75);
});

test('several wives: one combined line, split equally (note shown)', () => {
  const r = calc({ gender: 'مرد', spouse: 'بلی', wives: 3, sons: 1 });
  assert.match(r.rows[0].name, /مجموع [3۳] نفر/); close(r.rows[0].pct, 12.5); assert.match(r.notes, /مساوی/);
});

test('wife dies: husband gets 1/2 without children, 1/4 with children', () => {
  close(get(calc({ gender: 'زن', spouse: 'بلی', father: 'بلی' }), /شوهر/), 50);
  close(get(calc({ gender: 'زن', spouse: 'بلی', sons: 1 }), /شوهر/), 25);
});

test('mother: 1/3 alone; 1/6 with children or ≥2 siblings', () => {
  close(get(calc({ gender: 'مرد', mother: 'بلی', father: 'بلی' }), /مادر/), 33.3);
  close(get(calc({ gender: 'مرد', mother: 'بلی', sons: 1 }), /مادر/), 16.7);
  close(get(calc({ gender: 'مرد', mother: 'بلی', father: 'بلی', siblings: 2 }), /مادر/), 16.7);
});

test('Gharrawayn: spouse + both parents → mother gets 1/3 of what is left after the spouse', () => {
  const w = calc({ gender: 'زن', spouse: 'بلی', father: 'بلی', mother: 'بلی' });
  close(get(w, /شوهر/), 50); close(get(w, /مادر/), 16.7); close(get(w, /پدر/), 33.3); close(w.total, 100);
  const m = calc({ gender: 'مرد', spouse: 'بلی', father: 'بلی', mother: 'بلی' });
  close(get(m, /همسر/), 25); close(get(m, /مادر/), 25); close(get(m, /پدر/), 50); close(m.total, 100);
});

test('son + daughter with both parents: 2:1 split of the remainder', () => {
  const r = calc({ gender: 'مرد', father: 'بلی', mother: 'بلی', sons: 1, daughters: 1 });
  close(get(r, /مادر/), 16.7); close(get(r, /پدر/), 16.7); close(get(r, /پسر/), 44.4); close(get(r, /دختر/), 22.2); close(r.total, 100);
});

test('one daughter + father + mother: daughter 1/2, father 1/6 + remainder', () => {
  const r = calc({ gender: 'مرد', father: 'بلی', mother: 'بلی', daughters: 1 });
  close(get(r, /^دختر$/), 50); close(get(r, /مادر/), 16.7); close(get(r, /پدر/), 33.3); close(r.total, 100);
});

test('two or more daughters share 2/3', () => {
  const r = calc({ gender: 'مرد', mother: 'بلی', daughters: 3 });
  close(get(r, /دختران/), 66.7);
});

test('over-subscribed shares (husband + 2 daughters + parents) never exceed 100% and show a review note', () => {
  const r = calc({ gender: 'زن', spouse: 'بلی', father: 'بلی', mother: 'بلی', daughters: 2 });
  assert.ok(r.total <= 100.3, String(r.total)); assert.match(r.notes, /بررسی دقیق/);
});

test('other heirs / siblings → explicit "not calculated" note', () => {
  assert.match(calc({ gender: 'مرد', father: 'بلی', siblings: 1 }).notes, /محاسبه نمی/);
  assert.match(calc({ gender: 'مرد', mother: 'بلی', other: 'بلی' }).notes, /محاسبه نمی/);
});

test('mother only: unallocated remainder is reported, not hidden', () => {
  const r = calc({ gender: 'مرد', mother: 'بلی' });
  close(r.total, 33.3); assert.match(r.notes, /تخصیص داده نشد/);
});

test('no heirs → asks for at least one living heir', () => {
  assert.match(calc({ gender: 'مرد' }).notes, /حداقل یک وارث/);
});

test('amounts: invalid / huge counts are clamped, total never exceeds 100%', () => {
  const r = calc({ gender: 'مرد', sons: -5, daughters: 99999, father: 'بلی' });
  assert.ok(r.total <= 100.3);
});

test('property test: shares never exceed 100% for any combination', () => {
  const yn = ['بلی', 'خیر'];
  for (const gender of ['مرد', 'زن']) for (const spouse of yn) for (const father of yn) for (const mother of yn)
    for (const sons of [0, 1, 3]) for (const daughters of [0, 1, 2, 5]) for (const siblings of [0, 1, 2])
      assert.ok(calc({ gender, spouse, father, mother, sons, daughters, siblings }).total <= 100.3, JSON.stringify({ gender, spouse, father, mother, sons, daughters, siblings }));
});
