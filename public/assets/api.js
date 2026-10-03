// Small shared helpers for the pages that talk to the backend. All text is inserted with textContent (never innerHTML).
(function () {
  function fail(message, code, status) {
    var e = new Error(message);
    e.code = code; e.status = status;
    return e;
  }

  async function call(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'agahi' } };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res;
    try { res = await fetch(path, opts); }
    catch (e) { throw fail('اتصال به اینترنت برقرار نیست. اتصال را بررسی و دوباره تلاش کنید.', 'network', 0); }
    var data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      var msg = data && data.error && data.error.message;
      if (!msg) msg = res.status === 404 ? 'مورد درخواستی پیدا نشد.' : res.status >= 500 ? 'خطایی در سرور رخ داد. کمی بعد دوباره تلاش کنید.' : 'درخواست انجام نشد.';
      throw fail(msg, data && data.error && data.error.code, res.status);
    }
    return data;
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  // Server times are UTC "YYYY-MM-DD HH:MM:SS"; show them in the Solar Hijri calendar used in Afghanistan/Iran.
  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(String(s).replace(' ', 'T') + 'Z');
    if (isNaN(d)) return '';
    try { return d.toLocaleString('fa-AF-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return d.toLocaleString('fa'); }
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' بایت';
    if (n < 1048576) return Math.round(n / 1024) + ' کیلوبایت';
    return (n / 1048576).toFixed(1) + ' مگابایت';
  }

  function badge(status, label) {
    return el('span', { class: 'status-badge st-' + status, text: label || status });
  }

  function msg(box, text, kind) {
    if (!box) return;
    box.textContent = text || '';
    box.className = 'form-msg' + (text ? ' show ' + (kind || 'error') : '');
  }

  function busy(btn, on) {
    if (!btn) return;
    btn.classList.toggle('loading', on);
    btn.disabled = !!on;
  }

  function digits(s) {
    return String(s).replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); })
      .replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); });
  }

  window.Api = {
    get: function (p) { return call('GET', p); },
    post: function (p, b) { return call('POST', p, b === undefined ? {} : b); },
    patch: function (p, b) { return call('PATCH', p, b); },
    put: function (p, b) { return call('PUT', p, b); },
    del: function (p) { return call('DELETE', p); },
    upload: function (p, file) { var f = new FormData(); f.append('file', file); return call('POST', p, f); },
    el: el, fmtDate: fmtDate, fmtSize: fmtSize, badge: badge, msg: msg, busy: busy, digits: digits
  };
})();
