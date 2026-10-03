// Login / register page → real backend.
(function () {
  var A = window.Api;
  var next = new URLSearchParams(location.search).get('next');
  var dest = next && /^\/[A-Za-z0-9\-_\/]*$/.test(next) && next.indexOf('//') !== 0 ? next : '/account/dashboard/';

  // already signed in? go straight to the dashboard
  A.get('/api/auth/me').then(function () { location.replace(dest); }).catch(function () { /* not signed in */ });

  function activate(btn) {
    document.querySelectorAll('.auth-tab-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.auth-panel').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
    document.getElementById(btn.dataset.tab).classList.add('active');
  }
  document.querySelectorAll('.auth-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { activate(btn); });
  });
  if (location.hash === '#signup') activate(document.querySelector('[data-tab="signupPanel"]'));

  function validPhone(v) { var s = A.digits(v).replace(/[\s\-().]/g, ''); return /^(0\d{9}|0093\d{9}|\+?93\d{9}|\+\d{10,15})$/.test(s); }
  function validPass(v) { return v.length >= 8 && /\d/.test(v) && /\D/.test(v); }

  function setError(id, on) {
    var f = document.getElementById(id);
    f.classList.toggle('has-error', on);
    if (on) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
  }

  document.querySelectorAll('.pw-eye').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.dataset.target);
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.classList.toggle('show', !showing);
    });
  });
  document.querySelectorAll('.field input').forEach(function (i) {
    i.addEventListener('input', function () { var f = i.closest('.field'); if (f) f.classList.remove('has-error'); });
  });

  async function submit(btn, msgBox, run) {
    A.msg(msgBox, '');
    A.busy(btn, true);
    try { await run(); location.href = dest; }
    catch (e) { A.msg(msgBox, e.message, 'error'); A.busy(btn, false); }
  }

  var loginMsg = document.getElementById('loginMsg');
  var signupMsg = document.getElementById('signupMsg');

  document.getElementById('loginBtn').addEventListener('click', function () {
    var phone = document.getElementById('loginPhone').value;
    var pass = document.getElementById('loginPass').value;
    var pOk = validPhone(phone), wOk = pass.length > 0;
    setError('loginPhoneField', !pOk); setError('loginPassField', !wOk);
    if (!pOk || !wOk) return;
    submit(this, loginMsg, function () { return A.post('/api/auth/login', { phone: phone, password: pass }); });
  });

  document.getElementById('signupBtn').addEventListener('click', function () {
    var name = document.getElementById('signupName').value.trim();
    var phone = document.getElementById('signupPhone').value;
    var pass = document.getElementById('signupPass').value;
    var nOk = name.length >= 2, pOk = validPhone(phone), wOk = validPass(pass);
    setError('signupNameField', !nOk); setError('signupPhoneField', !pOk); setError('signupPassField', !wOk);
    if (!nOk || !pOk || !wOk) return;
    submit(this, signupMsg, function () { return A.post('/api/auth/register', { name: name, phone: phone, password: pass }); });
  });

  ['loginPass', 'loginPhone'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
  });
  ['signupName', 'signupPhone', 'signupPass'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('signupBtn').click(); });
  });
})();
