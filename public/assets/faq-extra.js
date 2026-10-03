// Shows FAQ items and announcements the admin added (if any) on the FAQ page.
(function () {
  var list = document.getElementById('faqList'); if (!list) return;
  function add(it, isAnn) {
    var item = document.createElement('div'); item.className = 'faq-item';
    var q = document.createElement('div'); q.className = 'faq-q'; q.setAttribute('role', 'button'); q.tabIndex = 0; q.setAttribute('aria-expanded', 'false');
    var b = document.createElement('b'); b.textContent = (isAnn ? 'اطلاعیه: ' : '') + it.title; q.appendChild(b);
    var a = document.createElement('div'); a.className = 'faq-a'; var p = document.createElement('p'); p.style.whiteSpace = 'pre-wrap'; p.textContent = it.body; a.appendChild(p);
    q.addEventListener('click', function () { var open = item.classList.toggle('open'); q.setAttribute('aria-expanded', String(open)); });
    item.appendChild(q); item.appendChild(a); list.appendChild(item);
  }
  ['faq', 'announcement'].forEach(function (k) {
    fetch('/api/public/content?kind=' + k).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.items) d.items.forEach(function (it) { add(it, k === 'announcement'); }); }).catch(function () {});
  });
})();
