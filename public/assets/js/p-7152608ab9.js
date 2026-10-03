(function(){
  // ---- session guard: no session -> back to login (runs immediately, no need to wait for DOM) ----
  let session = null;
  try { session = JSON.parse(localStorage.getItem('agahi_session') || 'null'); } catch(e){ session = null; }
  if(!session || !session.phone){
    window.location.replace('/account/');
    return;
  }

  document.addEventListener('DOMContentLoaded', function(){
    // ---- populate profile card + form from session ----
    function paint(){
      session = JSON.parse(localStorage.getItem('agahi_session') || 'null');
      const name = (session.name || 'کاربر').trim();
      document.getElementById('dashAvatar').textContent = name.charAt(0) || 'ک';
      document.getElementById('dashName').textContent = name;
      document.getElementById('dashPhone').textContent = session.phone;
      document.getElementById('profileName').value = name;
      document.getElementById('profilePhone').value = session.phone;
    }
    paint();

    // ---- restore tab from URL hash, if present (app.js's tab listeners are already attached here) ----
    const hash = window.location.hash.replace('#','');
    if(hash){
      const btn = document.querySelector('#dashTabs .tab-btn[data-tab="' + hash + '"]');
      if(btn) btn.click();
    }

    // ---- welcome toast after fresh login ----
    if(sessionStorage.getItem('agahi_just_logged_in') === '1'){
      sessionStorage.removeItem('agahi_just_logged_in');
      setTimeout(function(){
        if(window.showToast) window.showToast('خوش آمدید، ' + (session.name || 'کاربر') + '!');
      }, 400);
    }

    // ---- save profile name ----
    document.getElementById('saveProfileBtn').addEventListener('click', function(){
      const btn = this;
      const newName = document.getElementById('profileName').value.trim();
      if(newName.length < 2){
        const field = document.getElementById('profileName').closest('.field');
        field.classList.add('has-error', 'shake');
        setTimeout(function(){ field.classList.remove('shake'); }, 400);
        return;
      }
      btn.classList.add('loading');
      setTimeout(function(){
        const s = JSON.parse(localStorage.getItem('agahi_session') || '{}');
        s.name = newName;
        localStorage.setItem('agahi_session', JSON.stringify(s));
        const users = JSON.parse(localStorage.getItem('agahi_users') || '{}');
        if(users[s.phone]) users[s.phone].name = newName;
        localStorage.setItem('agahi_users', JSON.stringify(users));
        paint();
        btn.classList.remove('loading');
        if(window.showToast) window.showToast('تغییرات پروفایل ذخیره شد.');
      }, 450);
    });

    // ---- notifications toggle (persisted) ----
    const notifToggle = document.getElementById('notifToggle');
    notifToggle.checked = localStorage.getItem('agahi_notify') !== 'off';
    notifToggle.addEventListener('change', function(){
      localStorage.setItem('agahi_notify', notifToggle.checked ? 'on' : 'off');
      if(window.showToast) window.showToast(notifToggle.checked ? 'اعلان‌ها فعال شد.' : 'اعلان‌ها غیرفعال شد.');
    });

    // ---- logout ----
    document.getElementById('logoutBtn').addEventListener('click', function(){
      if(!window.confirm('از حساب کاربری خارج می‌شوید؟')) return;
      localStorage.removeItem('agahi_session');
      window.location.href = '/account/';
    });

    // ---- delete account ----
    document.getElementById('deleteAccountBtn').addEventListener('click', function(){
      if(!window.confirm('حذف حساب کاربری قابل بازگشت نیست. آیا مطمئن هستید؟')) return;
      const s = JSON.parse(localStorage.getItem('agahi_session') || '{}');
      const users = JSON.parse(localStorage.getItem('agahi_users') || '{}');
      delete users[s.phone];
      localStorage.setItem('agahi_users', JSON.stringify(users));
      localStorage.removeItem('agahi_session');
      localStorage.removeItem('agahi_notify');
      window.location.href = '/account/';
    });
  });
})();
