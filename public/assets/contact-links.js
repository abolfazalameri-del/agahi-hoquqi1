// Turns every data-contact link (WhatsApp, Telegram, …) into a real link using, in order:
// the values saved in the admin panel, then /config/contact.js. If nothing is configured the link
// keeps pointing at /contact/ so it never breaks. No numbers are invented.
(function () {
  var base = window.AGAHI_CONTACT || {};
  var KEY = 'agahi_settings';
  function build(c, key, a) {
    var v = c[key]; if (!v) return null;
    if (key === 'whatsapp') { var t = a.getAttribute('data-wa-text'); return 'https://wa.me/' + v + (t ? '?text=' + t : ''); }
    if (key === 'telegram') return 'https://t.me/' + v;
    if (key === 'phone') return 'tel:' + v;
    if (key === 'email') return 'mailto:' + v;
    return v;
  }
  function apply(c) {
    var any = false;
    document.querySelectorAll('a[data-contact]').forEach(function (a) {
      var key = a.getAttribute('data-contact'), href = build(c, key, a);
      var onContactPage = !!document.getElementById('contactChips');
      if (href) {
        any = true; a.href = href; a.hidden = false;
        if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      } else if (onContactPage) a.hidden = true;
    });
    var empty = document.getElementById('contactEmpty');
    if (empty) empty.hidden = any;
  }
  var merged = {}; Object.keys(base).forEach(function (k) { if (base[k]) merged[k] = base[k]; });
  apply(merged);
  var cached = null; try { cached = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { /* ignore */ }
  if (cached) { apply(Object.assign({}, merged, cached)); return; }
  fetch('/api/public/settings').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.settings) return;
    try { sessionStorage.setItem(KEY, JSON.stringify(d.settings)); } catch (e) { /* ignore */ }
    apply(Object.assign({}, merged, d.settings));
  }).catch(function () { /* offline or API not ready: keep static values */ });
})();
