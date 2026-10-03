// Admin panel: requests, users, notifications, FAQ/announcements, settings, audit log.
(function () {
  var A = window.Api, el = A.el;
  var app = document.getElementById('adminApp');
  var ST = { new: 'جدید', reviewing: 'در حال بررسی', needs_info: 'نیازمند اطلاعات بیشتر', completed: 'تکمیل شده', cancelled: 'لغو شده' };
  var ACTIONS = { 'admin.bootstrap': 'تعیین مدیر', 'user.activate': 'فعال‌سازی کاربر', 'user.deactivate': 'غیرفعال‌سازی کاربر', 'request.status': 'تغییر وضعیت درخواست', 'request.reply': 'پاسخ به درخواست', 'file.download': 'دانلود فایل', 'file.delete': 'حذف فایل', 'notification.broadcast': 'اعلان همگانی', 'notification.send': 'اعلان به کاربران', 'content.create': 'افزودن محتوا', 'content.update': 'ویرایش محتوا', 'content.delete': 'حذف محتوا', 'settings.update': 'تغییر تنظیمات' };
  function toast(t) { if (window.showToast) window.showToast(t); }
  function note(text, cls) { return el('div', { class: cls || 'loading-note', text: text }); }
  function field(label, input) { var id = 'f' + Math.random().toString(36).slice(2, 8); input.id = id; return el('div', { class: 'field' }, [el('label', { for: id, text: label }), input]); }
  function table(heads, rows) {
    var thead = el('thead', null, [el('tr', null, heads.map(function (h) { return el('th', { scope: 'col', text: h }); }))]);
    var tbody = el('tbody', null, rows);
    return el('div', { class: 'table-scroll' }, [el('table', { class: 'admin-table' }, [thead, tbody])]);
  }
  function td(x) { return el('td', null, [x instanceof Node ? x : String(x == null ? '' : x)]); }

  async function init() {
    var me;
    try { me = (await A.get('/api/auth/me')).user; }
    catch (e) {
      if (e.status === 401) { app.replaceChildren(note('برای ورود به پنل مدیریت ابتدا وارد حساب خود شوید.'), el('a', { class: 'btn btn-primary', href: '/account/?next=/admin/', text: 'ورود به حساب' })); return; }
      app.replaceChildren(note(e.message, 'error-note')); return;
    }
    if (me.role !== 'admin') { showBootstrap(); return; }
    build();
  }

  function showBootstrap() {
    var code = el('input', { type: 'password', autocomplete: 'off', placeholder: 'کد راه‌اندازی مدیر' });
    var m = el('div', { class: 'form-msg', role: 'alert' });
    var btn = el('button', { type: 'button', class: 'btn btn-primary', text: 'تعیین من به‌عنوان مدیر' });
    btn.addEventListener('click', async function () {
      A.busy(btn, true);
      try { await A.post('/api/admin/bootstrap', { code: code.value }); location.reload(); }
      catch (e) { A.msg(m, e.message, 'error'); A.busy(btn, false); }
    });
    app.replaceChildren(
      el('div', { class: 'fieldset' }, [
        el('h2', { text: 'راه‌اندازی مدیر سایت' }),
        el('p', { text: 'حساب شما مدیر نیست. اگر صاحب سایت هستید و هنوز مدیری تعیین نشده، «کد راه‌اندازی» را که در Cloudflare ثبت کرده‌اید وارد کنید. این کار فقط یک بار و فقط وقتی هنوز مدیری وجود ندارد کار می‌کند.') ,
        field('کد راه‌اندازی', code), m, btn]));
  }

  var panels = {};
  function build() {
    var tabs = [['summary', 'خلاصه'], ['requests', 'درخواست‌ها'], ['users', 'کاربران'], ['notify', 'اعلان‌ها'], ['content', 'پرسش‌ها و اطلاعیه‌ها'], ['settings', 'تنظیمات تماس'], ['audit', 'گزارش رویدادها']];
    var bar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'بخش‌های مدیریت' });
    var body = el('div');
    tabs.forEach(function (t, i) {
      var b = el('button', { type: 'button', class: 'tab-btn' + (i ? '' : ' active'), role: 'tab', text: t[1] });
      var p = el('section', { class: 'admin-panel' + (i ? '' : ' active'), role: 'tabpanel', 'aria-label': t[1] });
      panels[t[0]] = p;
      b.addEventListener('click', function () {
        bar.querySelectorAll('.tab-btn').forEach(function (x) { x.classList.remove('active'); });
        Object.keys(panels).forEach(function (k) { panels[k].classList.remove('active'); });
        b.classList.add('active'); p.classList.add('active'); loaders[t[0]]();
      });
      bar.appendChild(b); body.appendChild(p);
    });
    app.replaceChildren(bar, body);
    loaders.summary();
  }

  var loaders = {
    // ---------- summary ----------
    summary: async function () {
      var p = panels.summary; p.replaceChildren(note('در حال بارگذاری…'));
      try {
        var s = await A.get('/api/admin/stats');
        var cards = [['کاربران', s.users], ['همهٔ درخواست‌ها', s.requests]];
        Object.keys(ST).forEach(function (k) { cards.push([ST[k], s.by_status[k]]); });
        p.replaceChildren(el('div', { class: 'admin-stats' }, cards.map(function (c) { return el('div', { class: 'admin-stat' }, [el('b', { text: String(c[1]) }), el('span', { text: c[0] })]); })));
      } catch (e) { p.replaceChildren(note(e.message, 'error-note')); }
    },

    // ---------- requests ----------
    requests: function () {
      var p = panels.requests, state = { page: 1 };
      var q = el('input', { type: 'search', placeholder: 'جستجو: شمارهٔ پیگیری، نام یا شماره', 'aria-label': 'جستجو' });
      var st = el('select', { 'aria-label': 'فیلتر وضعیت' }, [el('option', { value: '', text: 'همهٔ وضعیت‌ها' })].concat(Object.keys(ST).map(function (k) { return el('option', { value: k, text: ST[k] }); })));
      var list = el('div'), pager = el('div', { class: 'pager' });
      p.replaceChildren(el('div', { class: 'admin-toolbar' }, [q, st]), list, pager);
      async function load() {
        list.replaceChildren(note('در حال بارگذاری…'));
        try {
          var r = await A.get('/api/admin/requests?page=' + state.page + '&status=' + encodeURIComponent(st.value) + '&q=' + encodeURIComponent(q.value));
          if (!r.requests.length) list.replaceChildren(note('درخواستی پیدا نشد.'));
          else list.replaceChildren(table(['شماره', 'خدمت', 'کاربر', 'وضعیت', 'تاریخ', ''], r.requests.map(function (x) {
            var open = el('button', { type: 'button', class: 'link-btn', text: 'جزئیات' });
            open.addEventListener('click', function () { detail(x.id, p, function () { p.replaceChildren(el('div', { class: 'admin-toolbar' }, [q, st]), list, pager); load(); }); });
            return el('tr', null, [td(x.tracking_code), td(x.service_label), td(x.user_name + ' — ' + x.user_phone), td(A.badge(x.status, x.status_label)), td(A.fmtDate(x.created_at)), td(open)]);
          })));
          pager.replaceChildren(pg('قبلی', state.page > 1, function () { state.page--; load(); }), el('span', { text: 'صفحهٔ ' + state.page }), pg('بعدی', r.requests.length === r.page_size, function () { state.page++; load(); }));
        } catch (e) { list.replaceChildren(note(e.message, 'error-note')); }
      }
      var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.page = 1; load(); }, 350); });
      st.addEventListener('change', function () { state.page = 1; load(); });
      load();
    },

    // ---------- users ----------
    users: function () {
      var p = panels.users, state = { page: 1 };
      var q = el('input', { type: 'search', placeholder: 'جستجو: نام یا شماره', 'aria-label': 'جستجو' });
      var list = el('div'), pager = el('div', { class: 'pager' });
      p.replaceChildren(el('div', { class: 'admin-toolbar' }, [q]), list, pager);
      async function load() {
        list.replaceChildren(note('در حال بارگذاری…'));
        try {
          var r = await A.get('/api/admin/users?page=' + state.page + '&q=' + encodeURIComponent(q.value));
          if (!r.users.length) list.replaceChildren(note('کاربری پیدا نشد.'));
          else list.replaceChildren(table(['نام', 'شماره', 'نقش', 'درخواست‌ها', 'عضویت', 'وضعیت حساب'], r.users.map(function (u) {
            var b = el('button', { type: 'button', class: 'link-btn' + (u.is_active ? ' danger' : ''), text: u.is_active ? 'غیرفعال کردن' : 'فعال کردن' });
            b.addEventListener('click', async function () {
              if (u.is_active && !confirm('حساب «' + u.name + '» غیرفعال شود؟ از همهٔ دستگاه‌ها خارج می‌شود.')) return;
              try { await A.patch('/api/admin/users/' + u.id, { is_active: !u.is_active }); toast('انجام شد.'); load(); } catch (e) { toast(e.message); }
            });
            return el('tr', null, [td(u.name), td(u.phone), td(u.role === 'admin' ? 'مدیر' : 'کاربر'), td(u.request_count), td(A.fmtDate(u.created_at)), td(el('span', null, [u.is_active ? 'فعال ' : 'غیرفعال ', b]))]);
          })));
          pager.replaceChildren(pg('قبلی', state.page > 1, function () { state.page--; load(); }), el('span', { text: 'صفحهٔ ' + state.page }), pg('بعدی', r.users.length === r.page_size, function () { state.page++; load(); }));
        } catch (e) { list.replaceChildren(note(e.message, 'error-note')); }
      }
      var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.page = 1; load(); }, 350); });
      load();
    },

    // ---------- notifications ----------
    notify: function () {
      var p = panels.notify;
      var title = el('input', { type: 'text', maxlength: '120' });
      var body = el('textarea', { rows: '4', maxlength: '1000' });
      var aud = el('select', null, [el('option', { value: 'all', text: 'همهٔ کاربران' }), el('option', { value: 'phones', text: 'کاربران مشخص (با شماره)' })]);
      var phones = el('textarea', { rows: '3', placeholder: 'هر شماره در یک خط، حداکثر ۱۰۰ شماره', hidden: '' });
      var phonesF = field('شماره‌ها', phones); phonesF.hidden = true;
      aud.addEventListener('change', function () { phonesF.hidden = aud.value !== 'phones'; });
      var m = el('div', { class: 'form-msg', role: 'alert' });
      var btn = el('button', { type: 'button', class: 'btn btn-primary', text: 'ارسال اعلان' });
      btn.addEventListener('click', async function () {
        var audience = 'all';
        if (aud.value === 'phones') { audience = phones.value.split(/\n|,|،/).map(function (s) { return s.trim(); }).filter(Boolean); }
        A.busy(btn, true);
        try {
          var r = await A.post('/api/admin/notifications', { title: title.value, body: body.value, audience: audience });
          A.msg(m, r.recipients === 'all' ? 'اعلان برای همهٔ کاربران ثبت شد.' : 'اعلان برای ' + r.recipients + ' کاربر ارسال شد.', 'ok'); title.value = ''; body.value = '';
        } catch (e) { A.msg(m, e.message, 'error'); }
        A.busy(btn, false);
      });
      p.replaceChildren(el('div', { class: 'fieldset' }, [field('عنوان', title), field('متن اعلان', body), field('گیرنده', aud), phonesF, m, btn]));
    },

    // ---------- FAQ / announcements ----------
    content: async function () {
      var p = panels.content; p.replaceChildren(note('در حال بارگذاری…'));
      var kind = el('select', null, [el('option', { value: 'faq', text: 'پرسش و پاسخ' }), el('option', { value: 'announcement', text: 'اطلاعیه' })]);
      var title = el('input', { type: 'text', maxlength: '200' }), body = el('textarea', { rows: '4', maxlength: '5000' });
      var order = el('input', { type: 'number', value: '0' });
      var pub = el('input', { type: 'checkbox', checked: '' });
      var editing = null;
      var m = el('div', { class: 'form-msg', role: 'alert' });
      var save = el('button', { type: 'button', class: 'btn btn-primary', text: 'ذخیره' });
      var list = el('div');
      function reset() { editing = null; title.value = ''; body.value = ''; order.value = '0'; pub.checked = true; save.textContent = 'ذخیره'; }
      save.addEventListener('click', async function () {
        var payload = { kind: kind.value, title: title.value, body: body.value, published: pub.checked, sort_order: Number(order.value) || 0 };
        A.busy(save, true);
        try { if (editing) await A.put('/api/admin/content/' + editing, payload); else await A.post('/api/admin/content', payload); A.msg(m, 'ذخیره شد.', 'ok'); reset(); refresh(); }
        catch (e) { A.msg(m, e.message, 'error'); }
        A.busy(save, false);
      });
      async function refresh() {
        try {
          var r = await A.get('/api/admin/content');
          list.replaceChildren(r.items.length ? table(['نوع', 'عنوان', 'وضعیت', ''], r.items.map(function (it) {
            var ed = el('button', { type: 'button', class: 'link-btn', text: 'ویرایش' });
            ed.addEventListener('click', function () { editing = it.id; kind.value = it.kind; title.value = it.title; body.value = it.body; order.value = it.sort_order; pub.checked = !!it.published; save.textContent = 'ذخیرهٔ ویرایش'; title.focus(); });
            var dl = el('button', { type: 'button', class: 'link-btn danger', text: 'حذف' });
            dl.addEventListener('click', async function () { if (!confirm('حذف شود؟')) return; try { await A.del('/api/admin/content/' + it.id); refresh(); } catch (e) { toast(e.message); } });
            return el('tr', null, [td(it.kind === 'faq' ? 'پرسش' : 'اطلاعیه'), td(it.title), td(it.published ? 'منتشرشده' : 'پیش‌نویس'), td(el('span', null, [ed, dl]))]);
          })) : note('هنوز موردی ثبت نشده.'));
        } catch (e) { list.replaceChildren(note(e.message, 'error-note')); }
      }
      var pubL = el('label', null, [pub, ' منتشر شود']);
      p.replaceChildren(el('div', { class: 'fieldset' }, [el('p', { text: 'پرسش‌ها و اطلاعیه‌های ثبت‌شده در پایین صفحهٔ «پرسش و پاسخ» نمایش داده می‌شوند.' }), field('نوع', kind), field('عنوان / پرسش', title), field('متن / پاسخ', body), field('ترتیب نمایش (عدد کوچک‌تر بالاتر)', order), pubL, m, save]), list);
      refresh();
    },

    // ---------- settings ----------
    settings: async function () {
      var p = panels.settings; p.replaceChildren(note('در حال بارگذاری…'));
      try {
        var cur = (await A.get('/api/admin/settings')).settings;
        var defs = [['whatsapp', 'شمارهٔ واتساپ (با کد کشور، بدون + و بدون صفر اول)', '93701234567'], ['telegram', 'نام کاربری تلگرام (بدون @)', 'agahi_support'], ['phone', 'شمارهٔ تماس', '+93701234567'], ['email', 'ایمیل', 'info@example.com'], ['facebook', 'نشانی فیس‌بوک', 'https://facebook.com/...'], ['instagram', 'نشانی اینستاگرام', 'https://instagram.com/...']];
        var inputs = {}, kids = [el('p', { text: 'این اطلاعات در دکمه‌های واتساپ، تلگرام و صفحهٔ «تماس با ما» استفاده می‌شود. خالی گذاشتن یک مورد آن را حذف می‌کند.' })];
        defs.forEach(function (d) { var i = el('input', { type: 'text', dir: 'ltr', placeholder: d[2], value: cur[d[0]] || '' }); inputs[d[0]] = i; kids.push(field(d[1], i)); });
        var m = el('div', { class: 'form-msg', role: 'alert' });
        var btn = el('button', { type: 'button', class: 'btn btn-primary', text: 'ذخیرهٔ تنظیمات' });
        btn.addEventListener('click', async function () {
          var payload = {}; Object.keys(inputs).forEach(function (k) { payload[k] = inputs[k].value; });
          A.busy(btn, true);
          try { await A.put('/api/admin/settings', payload); A.msg(m, 'ذخیره شد. تغییرات تا چند دقیقهٔ دیگر در سایت دیده می‌شود.', 'ok'); try { localStorage.removeItem('agahi_settings'); } catch (e) { /* ignore */ } }
          catch (e) { A.msg(m, e.message, 'error'); }
          A.busy(btn, false);
        });
        kids.push(m, btn);
        p.replaceChildren(el('div', { class: 'fieldset' }, kids));
      } catch (e) { p.replaceChildren(note(e.message, 'error-note')); }
    },

    // ---------- audit ----------
    audit: async function () {
      var p = panels.audit; p.replaceChildren(note('در حال بارگذاری…'));
      try {
        var r = await A.get('/api/admin/audit');
        p.replaceChildren(r.logs.length ? table(['زمان', 'مدیر', 'رویداد', 'جزئیات'], r.logs.map(function (l) {
          return el('tr', null, [td(A.fmtDate(l.created_at)), td(l.actor_name || '—'), td(ACTIONS[l.action] || l.action), td((l.target_type ? l.target_type + ' ' + (l.target_id || '') : '') + (l.meta ? ' ' + l.meta : ''))]);
        })) : note('هنوز رویدادی ثبت نشده.'));
      } catch (e) { p.replaceChildren(note(e.message, 'error-note')); }
    }
  };

  function pg(label, enabled, fn) { var b = el('button', { type: 'button', class: 'btn btn-outline', text: label }); b.disabled = !enabled; b.addEventListener('click', fn); return b; }

  async function detail(id, panel, back) {
    panel.replaceChildren(note('در حال بارگذاری…'));
    try {
      var d = await A.get('/api/admin/requests/' + id), r = d.request;
      var backBtn = el('button', { type: 'button', class: 'btn btn-outline', text: 'بازگشت به فهرست' });
      backBtn.addEventListener('click', back);
      var dl = el('dl');
      [['شمارهٔ پیگیری', r.tracking_code], ['خدمت', r.service_label], ['کاربر', r.user_name + ' — ' + r.user_phone], ['نوع قرارداد', r.details.type], ['مبلغ یا موضوع', r.details.amount], ['روش تماس ترجیحی', r.details.contact], ['توضیحات', r.details.desc], ['ثبت', A.fmtDate(r.created_at)]]
        .forEach(function (x) { if (x[1]) { dl.appendChild(el('dt', { text: x[0] })); dl.appendChild(el('dd', { text: x[1] })); } });
      var sel = el('select', { 'aria-label': 'وضعیت' }, Object.keys(ST).map(function (k) { var o = el('option', { value: k, text: ST[k] }); if (k === r.status) o.selected = true; return o; }));
      var setBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'ثبت وضعیت' });
      setBtn.addEventListener('click', async function () { A.busy(setBtn, true); try { await A.patch('/api/admin/requests/' + id, { status: sel.value }); toast('وضعیت تغییر کرد و کاربر مطلع شد.'); } catch (e) { toast(e.message); } A.busy(setBtn, false); });
      var files = el('div', { class: 'file-list' });
      d.files.forEach(function (f) {
        var row = el('div', { class: 'file-row' }, [el('span', { class: 'fname', text: f.original_name + ' (' + A.fmtSize(f.size) + ')' }), el('a', { class: 'link-btn', href: '/api/admin/files/' + f.id, text: 'دانلود' })]);
        var del = el('button', { type: 'button', class: 'link-btn danger', text: 'حذف' });
        del.addEventListener('click', async function () { if (!confirm('فایل حذف شود؟')) return; try { await A.del('/api/admin/files/' + f.id); detail(id, panel, back); } catch (e) { toast(e.message); } });
        row.appendChild(del); files.appendChild(row);
      });
      var th = el('div', { class: 'thread' });
      d.messages.forEach(function (m) { th.appendChild(el('div', { class: 'msg ' + m.author_role }, [m.body, el('small', { text: (m.author_role === 'admin' ? 'مدیر' : 'کاربر') + ' — ' + A.fmtDate(m.created_at) })])); });
      var ta = el('textarea', { rows: '4', maxlength: '3000', placeholder: 'پاسخ برای کاربر…', 'aria-label': 'پاسخ' });
      var mm = el('div', { class: 'form-msg', role: 'alert' });
      var send = el('button', { type: 'button', class: 'btn btn-primary', text: 'ارسال پاسخ' });
      send.addEventListener('click', async function () { A.busy(send, true); try { await A.post('/api/admin/requests/' + id + '/reply', { body: ta.value }); detail(id, panel, back); } catch (e) { A.msg(mm, e.message, 'error'); A.busy(send, false); } });
      panel.replaceChildren(backBtn, el('div', { class: 'req-card', style: 'margin-top:12px' }, [el('div', { class: 'req-head' }, [el('b', { text: r.title }), A.badge(r.status, r.status_label)]), el('div', { class: 'req-detail' }, [dl, d.files.length ? files : null, el('div', { class: 'inline-actions' }, [sel, setBtn]), d.messages.length ? th : null, el('div', { class: 'field' }, [ta]), mm, send])]));
    } catch (e) { panel.replaceChildren(note(e.message, 'error-note')); }
  }

  init();
})();
