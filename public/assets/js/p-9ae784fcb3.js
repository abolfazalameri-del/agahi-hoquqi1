(function(){
  document.querySelectorAll('.auth-tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.auth-tab-btn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.auth-panel').forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  function isValidPhone(v){ return /^0\d{9}$/.test(v.trim()); }
  function isValidPass(v){ return v.length >= 6; }

  function setError(fieldId, on){
    const field = document.getElementById(fieldId);
    field.classList.toggle('has-error', on);
    if(on){
      field.classList.remove('shake');
      void field.offsetWidth; // restart animation
      field.classList.add('shake');
    }
  }

  // password show/hide toggles
  document.querySelectorAll('.pw-eye').forEach(function(btn){
    btn.addEventListener('click', function(){
      const input = document.getElementById(btn.dataset.target);
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.classList.toggle('show', !showing);
    });
  });

  function withLoading(btn, action){
    btn.classList.add('loading');
    setTimeout(function(){
      action();
      btn.classList.remove('loading');
    }, 550);
  }

  document.getElementById('loginBtn').addEventListener('click', function(){
    const phone = document.getElementById('loginPhone').value;
    const pass = document.getElementById('loginPass').value;
    const phoneOk = isValidPhone(phone), passOk = isValidPass(pass);
    setError('loginPhoneField', !phoneOk);
    setError('loginPassField', !passOk);
    if(!phoneOk || !passOk) return;

    withLoading(this, function(){
      const users = JSON.parse(localStorage.getItem('agahi_users') || '{}');
      const existing = users[phone];
      const session = { phone: phone, name: existing ? existing.name : 'کاربر' };
      localStorage.setItem('agahi_session', JSON.stringify(session));
      sessionStorage.setItem('agahi_just_logged_in', '1');
      window.location.href = '/account/dashboard/';
    });
  });

  document.getElementById('signupBtn').addEventListener('click', function(){
    const name = document.getElementById('signupName').value.trim();
    const phone = document.getElementById('signupPhone').value;
    const pass = document.getElementById('signupPass').value;
    const nameOk = name.length >= 2, phoneOk = isValidPhone(phone), passOk = isValidPass(pass);
    setError('signupNameField', !nameOk);
    setError('signupPhoneField', !phoneOk);
    setError('signupPassField', !passOk);
    if(!nameOk || !phoneOk || !passOk) return;

    withLoading(this, function(){
      const users = JSON.parse(localStorage.getItem('agahi_users') || '{}');
      users[phone] = { name: name };
      localStorage.setItem('agahi_users', JSON.stringify(users));
      localStorage.setItem('agahi_session', JSON.stringify({ phone: phone, name: name }));
      sessionStorage.setItem('agahi_just_logged_in', '1');
      window.location.href = '/account/dashboard/';
    });
  });

  document.querySelectorAll('.field input').forEach(function(input){
    input.addEventListener('input', function(){
      const field = input.closest('.field');
      if(field) field.classList.remove('has-error');
    });
  });
})();
