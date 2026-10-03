// Service request forms (/services/*) → real backend: create request, upload files, show tracking code.
(function () {
  var A = window.Api;
  var form = document.getElementById('reqForm');
  if (!form) return;
  var service = form.dataset.service;
  var msgBox = document.getElementById('reqMsg');
  var sendBtn = document.getElementById('sendBtn');
  var contactMethod = '';
  var DRAFT = 'agahi_draft_' + service;
  var MAX_FILES = 3, MAX_BYTES = 2 * 1024 * 1024;
  var ok = /\.(pdf|jpe?g|png)$/i;

  form.addEventListener('submit', function (e) { e.preventDefault(); });

  var group = document.getElementById('contactChoice');
  if (group) group.querySelectorAll('.choice-card').forEach(function (card) {
    card.addEventListener('click', function () {
      group.querySelectorAll('.choice-card').forEach(function (c) { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
      card.classList.add('selected'); card.setAttribute('aria-pressed', 'true');
      contactMethod = card.dataset.value;
    });
  });

  // restore a draft saved just before sending the person to the login page
  try {
    var d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
    if (d) {
      ['f_desc', 'f_type', 'f_amount'].forEach(function (id) { var n = document.getElementById(id); if (n && d[id]) n.value = d[id]; });
      if (d.contact && group) { var c = group.querySelector('[data-value="' + d.contact + '"]'); if (c) c.click(); }
      sessionStorage.removeItem(DRAFT);
    }
  } catch (e) { /* ignore */ }

  var who = document.getElementById('reqWho');
  var user = null;
  A.get('/api/auth/me').then(function (r) {
    user = r.user;
    if (who) who.textContent = 'درخواست با حساب «' + user.name + '» (' + user.phone + ') ثبت می‌شود.';
  }).catch(function () {
    if (who) { who.textContent = ''; who.appendChild(document.createTextNode('برای ثبت درخواست باید وارد حساب کاربری شوید. ')); who.appendChild(A.el('a', { href: '/account/?next=' + encodeURIComponent(location.pathname), text: 'ورود یا ثبت‌نام' })); }
  });

  function val(id) { var n = document.getElementById(id); return n ? n.value.trim() : ''; }

  sendBtn.addEventListener('click', async function () {
    A.msg(msgBox, '');
    var desc = val('f_desc');
    if (desc.length < 10) { A.msg(msgBox, 'توضیحات را کامل‌تر بنویسید (حداقل ۱۰ نویسه).', 'error'); document.getElementById('f_desc').focus(); return; }
    var fileInput = document.getElementById('f_file');
    var files = fileInput && fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
    if (files.length > MAX_FILES) { A.msg(msgBox, 'حداکثر ' + MAX_FILES + ' فایل می‌توانید بفرستید.', 'error'); return; }
    for (var i = 0; i < files.length; i++) {
      if (!ok.test(files[i].name)) { A.msg(msgBox, 'فقط فایل PDF، JPG یا PNG پذیرفته می‌شود.', 'error'); return; }
      if (files[i].size > MAX_BYTES) { A.msg(msgBox, 'حجم هر فایل باید کمتر از ۲ مگابایت باشد.', 'error'); return; }
    }
    if (!user) {
      try { sessionStorage.setItem(DRAFT, JSON.stringify({ f_desc: desc, f_type: val('f_type'), f_amount: val('f_amount'), contact: contactMethod })); } catch (e) { /* ignore */ }
      location.href = '/account/?next=' + encodeURIComponent(location.pathname);
      return;
    }
    var fields = { desc: desc };
    if (document.getElementById('f_type')) fields.type = val('f_type');
    if (document.getElementById('f_amount')) fields.amount = val('f_amount');
    if (contactMethod) fields.contact = contactMethod;

    A.busy(sendBtn, true);
    var created;
    try { created = await A.post('/api/requests', { service_type: service, fields: fields }); }
    catch (e) {
      A.busy(sendBtn, false);
      if (e.status === 401) { location.href = '/account/?next=' + encodeURIComponent(location.pathname); return; }
      A.msg(msgBox, e.message, 'error'); return;
    }
    var failed = [];
    for (var j = 0; j < files.length; j++) {
      try { await A.upload('/api/requests/' + created.id + '/files', files[j]); }
      catch (e2) { failed.push(files[j].name + ' — ' + e2.message); }
    }
    var box = A.el('div', { class: 'fieldset', role: 'status' }, [
      A.el('h3', { text: 'درخواست شما ثبت شد' }),
      A.el('p', { text: 'شمارهٔ پیگیری:' }),
      A.el('p', { class: 'tracking-code', style: 'font-size:22px;font-weight:800;letter-spacing:1px;direction:ltr;text-align:center;margin:6px 0 12px;', text: created.tracking_code }),
      A.el('p', { text: 'وضعیت: ' + created.status_label + '. این شماره را نگه دارید؛ پیشرفت درخواست را در پنل کاربری می‌بینید.' })
    ]);
    if (failed.length) box.appendChild(A.el('div', { class: 'form-msg show error', text: 'درخواست ثبت شد، اما این فایل‌ها ارسال نشد: ' + failed.join(' | ') + ' — می‌توانید بعداً از پنل کاربری دوباره بفرستید.' }));
    box.appendChild(A.el('a', { class: 'btn btn-primary', href: '/account/dashboard/#d-requests', text: 'مشاهده درخواست‌های من', style: 'margin-top:14px;' }));
    form.replaceWith(box);
    box.setAttribute('tabindex', '-1'); box.focus();
  });
})();
