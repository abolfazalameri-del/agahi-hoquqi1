(function(){
  var steps = Array.from(document.querySelectorAll('.step-panel'));
  var stepNames = ['نوع قرارداد','مشخصات طرفین','مبلغ قرض','نحوه پرداخت','زمان بازپرداخت','شرایط و تعهدات','سایر موارد','پیش‌نمایش','خروجی قرارداد'];
  var current = 1;
  var total = steps.length;
  var state = { type:'', paymentMethod:'', repayType:'', penalty:'' };

  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');

  function todayISO(){ var d=new Date(); return d.toISOString().slice(0,10); }
  document.getElementById('contractDate').value = todayISO();

  function setupChoice(groupId, stateKey){
    var group = document.getElementById(groupId);
    if(!group) return;
    group.querySelectorAll('.choice-card').forEach(function(card){
      card.addEventListener('click', function(){
        group.querySelectorAll('.choice-card').forEach(function(c){ c.classList.remove('selected'); });
        card.classList.add('selected');
        state[stateKey] = card.dataset.value;
        if(stateKey === 'repayType'){
          document.getElementById('installWrap').style.display = (state.repayType === 'اقساط') ? 'flex' : 'none';
        }
      });
    });
  }
  setupChoice('typeChoice','type');
  setupChoice('paymentChoice','paymentMethod');
  setupChoice('repayChoice','repayType');
  setupChoice('penaltyChoice','penalty');

  function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function orDash(v){ return v ? v : '—'; }

  function faDate(iso){
    if(!iso) return '—';
    var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0];
  }

  function buildContract(){
    var amountLine = orDash(val('amount')) + ' ' + orDash(val('currency'));
    var amountWords = val('amountWords');
    var repayLine = state.repayType === 'اقساط'
      ? ('به‌صورت اقساطی در ' + orDash(val('installCount')) + ' قسط، با سررسید نهایی ' + faDate(val('repayDate')))
      : ('به‌صورت یکجا، تا تاریخ ' + faDate(val('repayDate')));
    var penaltyLine = state.penalty === 'دارد'
      ? 'در صورت تأخیر در بازپرداخت، طرفین توافق جریمه دارند.'
      : 'در صورت تأخیر در بازپرداخت، توافق جریمه‌ای میان طرفین وجود ندارد و موضوع با تفاهم حل می‌شود.';

    var html = '';
    html += '<h3>قرارداد قرض</h3>';
    html += '<div class="doc-sub">تنظیم‌شده در تاریخ ' + faDate(val('contractDate')) + '</div>';

    html += '<div class="article"><b>ماده ۱ — طرفین قرارداد</b>این قرارداد میان «' + orDash(val('lenderName')) + '» فرزند «' + orDash(val('lenderFather')) + '» به شماره تماس «' + orDash(val('lenderPhone')) + '» به آدرس «' + orDash(val('lenderAddress')) + '» (قرض‌دهنده)، و «' + orDash(val('borrowerName')) + '» فرزند «' + orDash(val('borrowerFather')) + '» به شماره تماس «' + orDash(val('borrowerPhone')) + '» به آدرس «' + orDash(val('borrowerAddress')) + '» (قرض‌گیرنده)، منعقد می‌گردد.</div>';

    html += '<div class="article"><b>ماده ۲ — موضوع و مبلغ قرض</b>نوع قرض: ' + orDash(state.type) + '. مبلغ/ارزش قرض: ' + amountLine + (amountWords ? (' (' + amountWords + ')') : '') + '.</div>';

    html += '<div class="article"><b>ماده ۳ — نحوه پرداخت</b>مبلغ فوق به روش «' + orDash(state.paymentMethod) + '»' + (val('paymentLocation') ? (' در محل «' + val('paymentLocation') + '»') : '') + ' پرداخت شده یا پرداخت می‌گردد.</div>';

    html += '<div class="article"><b>ماده ۴ — زمان و نحوه بازپرداخت</b>بازپرداخت مبلغ فوق ' + repayLine + ' صورت می‌گیرد.</div>';

    html += '<div class="article"><b>ماده ۵ — شرایط و تعهدات</b>' + penaltyLine + (val('conditions') ? ('<br>' + val('conditions')) : '') + '</div>';

    html += '<div class="article"><b>ماده ۶ — سایر موارد</b>' + (val('notes') ? val('notes') : 'موردی ذکر نشده است.') + '</div>';

    html += '<div class="article"><b>ماده ۷ — شهود</b>شاهد اول: ' + orDash(val('witness1')) + ' — شاهد دوم: ' + orDash(val('witness2')) + '</div>';

    html += '<div class="sign-row"><div>امضای قرض‌دهنده</div><div>امضای قرض‌گیرنده</div></div>';

    return html;
  }

  function plainText(){
    var tmp = document.createElement('div');
    tmp.innerHTML = buildContract();
    return tmp.innerText.replace(/\n{3,}/g,'\n\n');
  }

  function render(){
    steps.forEach(function(s){
      s.classList.toggle('active', parseInt(s.dataset.step,10) === current);
    });
    document.getElementById('progFill').style.width = Math.round((current/total)*100) + '%';
    var faNums = ['۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    document.getElementById('stepNum').textContent = faNums[current-1];
    document.getElementById('stepName').textContent = stepNames[current-1];
    prevBtn.style.visibility = current === 1 ? 'hidden' : 'visible';
    nextBtn.textContent = current === total ? 'پایان' : (current === 9 ? 'پایان' : 'مرحله بعد');
    if(current === total){ nextBtn.style.display = 'none'; } else { nextBtn.style.display = 'flex'; }

    if(current === 8){ document.getElementById('previewBox').innerHTML = buildContract(); }
    if(current === 9){ document.getElementById('finalBox').innerHTML = buildContract(); }

    window.scrollTo({top:0, behavior:'smooth'});
  }

  nextBtn.addEventListener('click', function(){
    if(current < total){ current++; render(); }
  });
  prevBtn.addEventListener('click', function(){
    if(current > 1){ current--; render(); }
  });

  document.getElementById('printBtn').addEventListener('click', function(){ window.print(); });
  document.getElementById('restartBtn').addEventListener('click', function(){
    document.getElementById('wizardForm').reset();
    state = { type:'', paymentMethod:'', repayType:'', penalty:'' };
    document.querySelectorAll('.choice-card.selected').forEach(function(c){ c.classList.remove('selected'); });
    document.getElementById('contractDate').value = todayISO();
    current = 1; render();
  });
  document.getElementById('downloadBtn').addEventListener('click', function(){
    var blob = new Blob([plainText()], {type:'text/plain;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'قرارداد-قرض.txt';
    a.click();
  });

  render();
})();
