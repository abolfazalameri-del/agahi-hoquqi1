// User dashboard → real backend (profile, requests, files, notifications, tracking, password, delete account).
(function () {
  var A = window.Api, el = A.el;
  var user = null;

  function toast(t) { if (window.showToast) window.showToast(t); }
  function loadingNote(box) { box.replaceChildren(el('div', { class: 'loading-note', text: 'در حال بارگذاری…' })); }
  function errorNote(box, e) { box.replaceChildren(el('div', { class: 'error-note', role: 'alert', text: e.message })); }
  function emptyNote(box, text) { box.replaceChildren(el('div', { class: 'loading-note', text: text })); }

  async function init() {
    try { user = (await A.get('/api/auth/me')).user; }
    catch (e) { if (e.status === 401) { location.replace('/account/?next=' + encodeURIComponent('/account/dashboard/')); return; } document.getElementById('dashName').textContent = e.message; return; }
    paint();
    var hash = location.hash.replace('#', '');
    if (hash) { var b = document.querySelector('#dashTabs .tab-btn[data-tab="' + hash + '"]'); if (b) b.click(); }
    loadRequests(); loadFiles(); loadNotifications();
    if (sessionStorage.getItem('agahi_just_logged_in')) { sessionStorage.removeItem('agahi_just_logged_in'); toast('خوش آمدید، ' + user.name + '!'); }
  }

  function paint() {
    document.getElementById('dashAvatar').textContent = (user.name || 'ک').charAt(0);
    document.getElementById('dashName').textContent = user.name;
    document.getElementById('dashPhone').textContent = user.phone;
    document.getElementById('profileName').value = user.name;
    document.getElementById('profilePhone').value = user.phone;
    var link = document.getElementById('adminLink');
    if (link && user.role === 'admin') link.hidden = false;
  }

  // ---------- profile ----------
  document.getElementById('saveProfileBtn').addEventListener('click', async function () {
    var box = document.getElementById('profileMsg'), btn = this;
    var name = document.getElementById('profileName').value.trim();
    if (name.length < 2) { A.msg(box, 'نام باید حداقل ۲ نویسه باشد.', 'error'); return; }
    A.busy(btn, true);
    try { user = (await A.patch('/api/auth/me', { name: name })).user; paint(); A.msg(box, 'تغییرات پروفایل ذخیره شد.', 'ok'); }
    catch (e) { A.msg(box, e.message, 'error'); }
    A.busy(btn, false);
  });

  document.getElementById('changePassBtn').addEventListener('click', async function () {
    var box = document.getElementById('pwMsg'), btn = this;
    var cur = document.getElementById('curPass').value, nxt = document.getElementById('newPass').value;
    if (!cur || !nxt) { A.msg(box, 'رمز فعلی و رمز جدید را وارد کنید.', 'error'); return; }
    A.busy(btn, true);
    try { await A.post('/api/auth/password', { current: cur, next: nxt }); A.msg(box, 'رمز عبور تغییر کرد. در سایر دستگاه‌ها از حساب خارج شدید.', 'ok'); document.getElementById('curPass').value = ''; document.getElementById('newPass').value = ''; }
    catch (e) { A.msg(box, e.message, 'error'); }
    A.busy(btn, false);
  });

  // ---------- requests ----------
  var reqBox = document.getElementById('reqList');
  async function loadRequests() {
    loadingNote(reqBox);
    try {
      var r = await A.get('/api/requests');
      if (!r.requests.length) {
        reqBox.replaceChildren(el('div', { class: 'empty-state' }, [
          el('b', { text: 'درخواست خدمتی ثبت نشده' }),
          el('p', { text: 'درخواست‌های تنظیم قرارداد، تنظیم سند یا بررسی سند اینجا نمایش داده می‌شود.' }),
          el('a', { class: 'btn btn-outline', href: '/services/', text: 'مشاهده خدمات' })]));
        return;
      }
      reqBox.replaceChildren.apply(reqBox, r.requests.map(requestCard));
    } catch (e) { errorNote(reqBox, e); }
  }

  function requestCard(r) {
    var wrap = el('div', { class: 'req-card' });
    var head = el('button', { type: 'button', class: 'link-btn', style: 'width:100%;text-align:right;text-decoration:none;color:inherit;', 'aria-expanded': 'false' }, [
      el('div', { class: 'req-head' }, [el('b', { text: r.title }), A.badge(r.status, r.status_label)]),
      el('div', { class: 'req-meta', text: 'شمارهٔ پیگیری: ' + r.tracking_code + ' — ' + A.fmtDate(r.created_at) + (r.file_count ? ' — ' + r.file_count + ' فایل' : '') })
    ]);
    var detail = el('div', { class: 'req-detail', hidden: '' });
    detail.hidden = true;
    head.addEventListener('click', async function () {
      var open = detail.hidden;
      detail.hidden = !open; head.setAttribute('aria-expanded', String(open));
      if (open) await renderDetail(detail, r.id);
    });
    wrap.appendChild(head); wrap.appendChild(detail);
    return wrap;
  }

  async function renderDetail(box, id) {
    loadingNote(box);
    try {
      var d = await A.get('/api/requests/' + id);
      var r = d.request, dl = el('dl');
      [['خدمت', r.service_label], ['نوع قرارداد', r.details.type], ['مبلغ یا موضوع', r.details.amount], ['روش تماس', r.details.contact], ['توضیحات', r.details.desc], ['آخرین تغییر', A.fmtDate(r.updated_at)]]
        .forEach(function (p) { if (p[1]) { dl.appendChild(el('dt', { text: p[0] })); dl.appendChild(el('dd', { text: p[1] })); } });
      var parts = [dl];

      var files = el('div', { class: 'file-list' });
      d.files.forEach(function (f) {
        var row = el('div', { class: 'file-row' }, [el('span', { class: 'fname', text: f.original_name + ' (' + A.fmtSize(f.size) + ')' })]);
        row.appendChild(el('a', { class: 'link-btn', href: '/api/files/' + f.id, text: 'دانلود' }));
        var del = el('button', { type: 'button', class: 'link-btn danger', text: 'حذف' });
        del.addEventListener('click', async function () {
          if (!confirm('این فایل حذف شود؟')) return;
          try { await A.del('/api/files/' + f.id); toast('فایل حذف شد.'); renderDetail(box, id); loadFiles(); } catch (e) { toast(e.message); }
        });
        row.appendChild(del); files.appendChild(row);
      });
      if (d.files.length) parts.push(files);

      var open = r.status !== 'cancelled' && r.status !== 'completed';
      if (d.messages.length) {
        var th = el('div', { class: 'thread' });
        d.messages.forEach(function (m) { th.appendChild(el('div', { class: 'msg ' + m.author_role }, [m.body, el('small', { text: (m.author_role === 'admin' ? 'پاسخ ما' : 'شما') + ' — ' + A.fmtDate(m.created_at) })])); });
        parts.push(th);
      }
      if (open) {
        var ta = el('textarea', { rows: '3', maxlength: '2000', 'aria-label': 'پیام شما', placeholder: r.status === 'needs_info' ? 'اطلاعات خواسته‌شده را اینجا بنویسید…' : 'پیام یا توضیح تازه…' });
        var send = el('button', { type: 'button', class: 'btn btn-primary', text: 'ارسال پیام' });
        var m = el('div', { class: 'form-msg', role: 'alert' });
        send.addEventListener('click', async function () {
          if (!ta.value.trim()) { A.msg(m, 'متن پیام را بنویسید.', 'error'); return; }
          A.busy(send, true);
          try { await A.post('/api/requests/' + id + '/messages', { body: ta.value }); toast('پیام ارسال شد.'); await renderDetail(box, id); loadRequests(); }
          catch (e) { A.msg(m, e.message, 'error'); A.busy(send, false); }
        });
        parts.push(el('div', { class: 'field' }, [ta]), m);
        var acts = el('div', { class: 'inline-actions' }, [send]);
        if (d.files.length < 3) {
          var fi = el('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png', 'aria-label': 'افزودن فایل' });
          fi.addEventListener('change', async function () {
            if (!fi.files[0]) return;
            if (fi.files[0].size > 2 * 1048576) { A.msg(m, 'حجم فایل باید کمتر از ۲ مگابایت باشد.', 'error'); return; }
            try { await A.upload('/api/requests/' + id + '/files', fi.files[0]); toast('فایل ارسال شد.'); await renderDetail(box, id); loadFiles(); loadRequests(); }
            catch (e) { A.msg(m, e.message, 'error'); }
          });
          acts.appendChild(fi);
        }
        var cancel = el('button', { type: 'button', class: 'btn btn-outline', text: 'لغو درخواست' });
        cancel.addEventListener('click', async function () {
          if (!confirm('درخواست لغو شود؟')) return;
          try { await A.post('/api/requests/' + id + '/cancel'); toast('درخواست لغو شد.'); loadRequests(); } catch (e) { A.msg(m, e.message, 'error'); }
        });
        acts.appendChild(cancel);
        parts.push(acts);
      }
      box.replaceChildren.apply(box, parts);
    } catch (e) { errorNote(box, e); }
  }

  // ---------- files ----------
  var fileBox = document.getElementById('fileList');
  async function loadFiles() {
    loadingNote(fileBox);
    try {
      var r = await A.get('/api/files');
      if (!r.files.length) { emptyNote(fileBox, 'فایلی ذخیره نشده. فایل‌هایی که همراه درخواست خدمت می‌فرستید اینجا نگهداری می‌شود.'); return; }
      fileBox.replaceChildren.apply(fileBox, r.files.map(function (f) {
        return el('div', { class: 'file-row' }, [
          el('span', { class: 'fname', text: f.original_name + ' (' + A.fmtSize(f.size) + ') — ' + f.tracking_code }),
          el('a', { class: 'link-btn', href: '/api/files/' + f.id, text: 'دانلود' })]);
      }));
    } catch (e) { errorNote(fileBox, e); }
  }

  // ---------- notifications ----------
  var nBox = document.getElementById('notifList');
  async function loadNotifications() {
    loadingNote(nBox);
    try {
      var r = await A.get('/api/notifications');
      var tab = document.querySelector('[data-tab="d-notifications"]');
      tab.textContent = 'اعلان‌ها';
      if (r.unread) tab.appendChild(el('span', { class: 'badge-dot', text: String(r.unread), 'aria-label': r.unread + ' اعلان خوانده‌نشده' }));
      if (!r.notifications.length) { emptyNote(nBox, 'اعلانی ندارید.'); return; }
      nBox.replaceChildren.apply(nBox, r.notifications.map(function (n) {
        var kids = [el('b', { text: n.title }), el('p', { text: n.body }), el('time', { text: A.fmtDate(n.created_at) })];
        return el('div', { class: 'notif-item' + (n.is_read ? '' : ' unread') }, kids);
      }));
    } catch (e) { errorNote(nBox, e); }
  }
  document.getElementById('markReadBtn').addEventListener('click', async function () {
    try { await A.post('/api/notifications/read'); loadNotifications(); } catch (e) { toast(e.message); }
  });

  // ---------- tracking ----------
  document.getElementById('trackBtn').addEventListener('click', async function () {
    var out = document.getElementById('trackResult'), code = document.getElementById('trackCode').value.trim();
    if (!code) { out.replaceChildren(el('div', { class: 'form-msg show error', role: 'alert', text: 'شمارهٔ پیگیری را وارد کنید.' })); return; }
    A.busy(this, true);
    try {
      var r = (await A.get('/api/requests/track?code=' + encodeURIComponent(A.digits(code)))).request;
      out.replaceChildren(el('div', { class: 'req-card' }, [
        el('div', { class: 'req-head' }, [el('b', { text: r.title }), A.badge(r.status, r.status_label)]),
        el('div', { class: 'req-meta', text: 'ثبت‌شده: ' + A.fmtDate(r.created_at) + ' — آخرین تغییر: ' + A.fmtDate(r.updated_at) })]));
    } catch (e) { out.replaceChildren(el('div', { class: 'form-msg show error', role: 'alert', text: e.message })); }
    A.busy(this, false);
  });

  // ---------- logout / delete ----------
  document.getElementById('logoutBtn').addEventListener('click', async function () {
    try { await A.post('/api/auth/logout'); } catch (e) { /* even if the call fails, leave the page */ }
    location.href = '/account/';
  });
  var delBox = document.getElementById('deleteBox');
  document.getElementById('deleteAccountBtn').addEventListener('click', function () { delBox.hidden = false; document.getElementById('delPass').focus(); });
  document.getElementById('delConfirmBtn').addEventListener('click', async function () {
    var m = document.getElementById('delMsg'), btn = this;
    A.busy(btn, true);
    try { await A.post('/api/auth/delete', { password: document.getElementById('delPass').value }); location.href = '/account/'; }
    catch (e) { A.msg(m, e.message, 'error'); A.busy(btn, false); }
  });

  init();
})();
