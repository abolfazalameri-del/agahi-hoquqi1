  const drawer = document.getElementById('drawer');
  const openBtn = document.getElementById('openMenu');
  function setDrawer(open){
    drawer.classList.toggle('open', open);
    openBtn.setAttribute('aria-expanded', String(open));
    if(open){ const c = document.getElementById('closeMenu'); if(c) c.focus(); } else if(drawer.dataset.wasOpen){ openBtn.focus(); }
    drawer.dataset.wasOpen = open ? '1' : '';
  }
  openBtn.addEventListener('click', ()=> setDrawer(true));
  document.getElementById('closeMenu').addEventListener('click', ()=> setDrawer(false));
  drawer.addEventListener('click', (e)=>{ if(e.target === drawer) setDrawer(false); });
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', ()=> { drawer.classList.remove('open'); openBtn.setAttribute('aria-expanded','false'); drawer.dataset.wasOpen=''; }));
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && drawer.classList.contains('open')) setDrawer(false); });

  // keyboard support for div[role=button] controls (Enter / Space)
  document.addEventListener('keydown', (e)=>{
    if((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]')){ e.preventDefault(); e.target.click(); }
  });

  // tabs (scoped per .tabs group) + sliding active indicator
  document.querySelectorAll('.tabs').forEach(group=>{
    const buttons = Array.from(group.querySelectorAll('.tab-btn'));
    if(!buttons.length) return;
    const indicator = document.createElement('span');
    indicator.className = 'tab-indicator';
    group.appendChild(indicator);

    function moveIndicator(btn){
      if(!btn) return;
      indicator.style.display = 'block';
      indicator.style.width = btn.offsetWidth + 'px';
      indicator.style.left = btn.offsetLeft + 'px';
    }

    buttons.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        buttons.forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(btn.dataset.tab);
        if(panel) panel.classList.add('active');
        moveIndicator(btn);
        btn.scrollIntoView({ inline:'center', block:'nearest', behavior: document.documentElement.dataset.reduceMotion ? 'auto' : 'smooth' });
        if(group.id === 'dashTabs' && btn.dataset.tab) history.replaceState(null, '', '#' + btn.dataset.tab);
      });
    });

    window.addEventListener('resize', ()=> moveIndicator(group.querySelector('.tab-btn.active')));
    requestAnimationFrame(()=> moveIndicator(group.querySelector('.tab-btn.active') || buttons[0]));
  });

  // faq accordion
  document.querySelectorAll('.faq-item').forEach(item=>{
    const q = item.querySelector('.faq-q');
    q.setAttribute('aria-expanded', String(item.classList.contains('open')));
    q.addEventListener('click', ()=>{
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i=>{ i.classList.remove('open'); const x=i.querySelector('.faq-q'); if(x) x.setAttribute('aria-expanded','false'); });
      if(!isOpen){ item.classList.add('open'); q.setAttribute('aria-expanded','true'); }
    });
  });

  /* =====================================================
     ارتقای همه‌جانبه — تم تاریک/روشن، انیمیشن، ریسپانسیو
     ===================================================== */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1) THEME (dark/light) ---------- */
  (function initTheme(){
    let stored = null; try { stored = localStorage.getItem('theme'); } catch(e) {}
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (systemDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    syncThemeColorMeta(theme);

    function syncThemeColorMeta(t){
      let meta = document.querySelector('meta[name="theme-color"]');
      if(!meta){ meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
      meta.content = t === 'dark' ? '#0A0F1F' : '#EEF2FB';
    }

    const sunMoonSVG =
      '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>' +
      '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.3"/><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>';

    document.querySelectorAll('.nav-row').forEach(row=>{
      const menuBtn = row.querySelector('.menu-btn');
      const actions = document.createElement('div');
      actions.className = 'nav-actions';
      const toggle = document.createElement('button');
      toggle.className = 'theme-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label','تغییر پوسته روشن/تاریک');
      toggle.innerHTML = sunMoonSVG;
      toggle.addEventListener('click', ()=>{
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch(e) {}
        syncThemeColorMeta(next);
      });
      if(menuBtn){
        menuBtn.parentNode.insertBefore(actions, menuBtn);
        actions.appendChild(toggle);
        actions.appendChild(menuBtn);
      } else {
        row.appendChild(actions);
        actions.appendChild(toggle);
      }
    });
  })();

  /* ---------- 2) BACK TO TOP ---------- */
  const topBtn = document.createElement('button');
  topBtn.className = 'to-top';
  topBtn.type = 'button';
  topBtn.setAttribute('aria-label','بازگشت به بالای صفحه');
  topBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>';
  topBtn.addEventListener('click', ()=> window.scrollTo({ top:0, behavior: reduceMotion ? 'auto' : 'smooth' }));
  document.body.appendChild(topBtn);
  function toggleTopBtn(show){ topBtn.classList.toggle('show', show); }

  /* ---------- 3) SCROLL: nav shadow + reading progress bar ---------- */
  (function initScrollFx(){
    const nav = document.querySelector('.nav');
    let ticking = false;
    function onScroll(){
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
      document.documentElement.style.setProperty('--scroll', progress.toFixed(4));
      if(nav) nav.classList.toggle('scrolled', scrollTop > 8);
      toggleTopBtn(scrollTop > 420);
      ticking = false;
    }
    document.addEventListener('scroll', ()=>{
      if(!ticking){ requestAnimationFrame(onScroll); ticking = true; }
    }, { passive:true });
    onScroll();
  })();

  /* ---------- 4) REVEAL-ON-SCROLL ---------- */
  (function initReveal(){
    const selector = '.problem-card,.tool-card,.doc-card,.art-card,.trust-tile,.hub-card,' +
      '.faq-item,.service-row,.issue-row,.law-row,.crime-row,.contact-chip,.foot-col';
    const items = Array.from(document.querySelectorAll(selector));
    if(!items.length) return;
    if(reduceMotion){ items.forEach(el=>el.classList.add('reveal','in-view')); return; }

    items.forEach((el,i)=>{
      el.classList.add('reveal');
      el.style.transitionDelay = (Math.min(i % 6, 6) * 0.05) + 's';
    });

    const io = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold:0.12, rootMargin:'0px 0px -40px 0px' });
    items.forEach(el=> io.observe(el));

    // safety net for items inside initially-hidden tabs/steps/panels
    window.addEventListener('load', ()=> setTimeout(()=>{
      items.forEach(el=>{ if(el.offsetParent !== null) el.classList.add('in-view'); });
    }, 1200));
  })();

  /* ---------- 5) BUTTON RIPPLE ---------- */
  document.addEventListener('click', (e)=>{
    if(reduceMotion) return;
    const btn = e.target.closest('.btn');
    if(!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', ()=> ripple.remove());
  });

  /* ---------- 6) TOAST (utility for page-level scripts) ---------- */
  window.showToast = function(message, duration){
    let wrap = document.querySelector('.toast-wrap');
    if(!wrap){ wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    wrap.appendChild(toast);
    requestAnimationFrame(()=> toast.classList.add('show'));
    setTimeout(()=>{
      toast.classList.remove('show');
      setTimeout(()=> toast.remove(), 300);
    }, duration || 2200);
  };


  if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {})); }
