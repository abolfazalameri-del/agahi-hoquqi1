(function(){
  var state = { gender:'', spouse:'', father:'', mother:'', other:'خیر' };

  function setupChoice(groupId, key, onChange){
    var group = document.getElementById(groupId);
    group.querySelectorAll('.choice-card').forEach(function(card){
      card.addEventListener('click', function(){
        group.querySelectorAll('.choice-card').forEach(function(c){ c.classList.remove('selected'); });
        card.classList.add('selected');
        group.querySelectorAll('.choice-card').forEach(function(c){ c.setAttribute('aria-pressed', c === card ? 'true' : 'false'); });
        state[key] = card.dataset.value;
        if(onChange) onChange();
      });
    });
  }
  setupChoice('genderChoice','gender', function(){
    document.getElementById('wivesWrap').style.display = (state.gender==='مرد' && state.spouse==='بلی') ? 'flex' : 'none';
  });
  setupChoice('spouseChoice','spouse', function(){
    document.getElementById('wivesWrap').style.display = (state.gender==='مرد' && state.spouse==='بلی') ? 'flex' : 'none';
  });
  setupChoice('fatherChoice','father');
  setupChoice('motherChoice','mother');
  setupChoice('otherChoice','other');

  function pct(x){ return (x*100).toLocaleString('fa-IR', {maximumFractionDigits:1}); }
  function fmtMoney(x){ return Math.round(x).toLocaleString('fa-IR'); }

  function calculate(){
    var sons = Math.min(50, Math.max(0, parseInt(document.getElementById('sons').value,10) || 0));
    var daughters = Math.min(50, Math.max(0, parseInt(document.getElementById('daughters').value,10) || 0));
    var siblings = Math.min(50, Math.max(0, parseInt(document.getElementById('siblings').value,10) || 0));
    var spouseAlive = state.spouse === 'بلی';
    var fatherAlive = state.father === 'بلی';
    var motherAlive = state.mother === 'بلی';
    var hasChildren = sons>0 || daughters>0;
    var otherHeirs = state.other === 'بلی';

    if(!state.gender){ alert('لطفاً جنسیت متوفی را انتخاب کنید.'); return null; }

    var shares = []; // {name, value}
    var remaining = 1;
    var notes = [];

    // spouse
    var spouseShare = 0;
    if(spouseAlive){
      if(state.gender === 'مرد'){
        spouseShare = hasChildren ? 1/8 : 1/4;
        var wives = Math.min(4, Math.max(1, parseInt(document.getElementById('wivesCount').value,10) || 1));
        if(wives > 1){
          shares.push({name:'همسران (مجموع '+wives+' نفر)', value: spouseShare});
          notes.push('سهم همسران به‌طور مساوی بین '+wives+' نفر تقسیم می‌شود.');
        } else {
          shares.push({name:'همسر', value: spouseShare});
        }
      } else {
        spouseShare = hasChildren ? 1/4 : 1/2;
        shares.push({name:'شوهر', value: spouseShare});
      }
      remaining -= spouseShare;
    }

    // mother
    var motherShare = 0;
    if(motherAlive){
      if(hasChildren || siblings >= 2){
        motherShare = 1/6;
      } else if(spouseAlive && fatherAlive){
        motherShare = (1/3) * remaining; // gharrawayn case: 1/3 of remainder after spouse
      } else {
        motherShare = 1/3;
      }
      shares.push({name:'مادر', value: motherShare});
      remaining -= motherShare;
    }

    // father
    var fatherFixed = 0, fatherResiduePending = false;
    if(fatherAlive){
      if(hasChildren){
        fatherFixed = 1/6;
        remaining -= fatherFixed;
        if(sons === 0){ fatherResiduePending = true; }
        else { shares.push({name:'پدر', value: fatherFixed}); }
      } else {
        fatherFixed = remaining; // residuary, takes all that's left
        shares.push({name:'پدر', value: fatherFixed});
        remaining = 0;
      }
    }

    // children
    if(hasChildren){
      if(sons > 0){
        var units = sons*2 + daughters*1;
        var unitVal = units > 0 ? remaining/units : 0;
        shares.push({name:'پسران (هرکدام '+pct(unitVal*2)+'%، مجموع '+sons+' نفر)', value: unitVal*2*sons});
        if(daughters > 0){
          shares.push({name:'دختران (هرکدام '+pct(unitVal)+'%، مجموع '+daughters+' نفر)', value: unitVal*daughters});
        }
        remaining = 0;
      } else {
        var dShare = daughters === 1 ? 1/2 : 2/3;
        if(dShare > remaining){ dShare = remaining; notes.push('به دلیل وجود سهم‌های ثابت دیگر، سهم دختران در این محاسبه به میزان باقی‌مانده تعدیل شده است؛ بررسی دقیق‌تر توصیه می‌شود.'); }
        shares.push({name: daughters===1 ? 'دختر' : 'دختران (مجموع '+daughters+' نفر)', value: dShare});
        remaining -= dShare;
        if(fatherResiduePending){
          fatherFixed += remaining;
          remaining = 0;
        }
        shares.push({name:'پدر', value: fatherFixed});
      }
    } else if(fatherResiduePending){
      // shouldn't happen (fatherResiduePending only set when hasChildren), safety no-op
    }

    if(siblings > 0 || otherHeirs){
      notes.push('شما وارثان دیگری (خواهر/برادر یا سایر بستگان) را مشخص کرده‌اید. این ابزار سهم دقیق آنان را محاسبه نمی‌کند؛ بررسی کامل وضعیت همه وراث توصیه می‌شود.');
    }
    if(remaining > 0.001){
      notes.push('بخشی از میراث (تقریباً '+pct(remaining)+'٪) بر اساس اطلاعات وارد شده، به‌طور قطعی به وارث مشخصی تخصیص داده نشد — معمولاً به دلیل وجود وارثان دیگر (مانند خواهر/برادر، جد یا جده) است.');
    }
    if(shares.length === 0){
      notes.push('هیچ واراثی مشخص نشد. لطفاً حداقل یک وارث زنده را انتخاب کنید.');
    }

    return {shares: shares, notes: notes};
  }

  document.getElementById('calcBtn').addEventListener('click', function(){
    var result = calculate();
    if(!result) return;
    var totalValue = parseFloat(document.getElementById('totalValue').value) || 0;
    var currency = document.getElementById('valueCurrency').value;

    var listEl = document.getElementById('heirList');
    listEl.innerHTML = '';
    result.shares.forEach(function(s){
      var row = document.createElement('div');
      row.className = 'heir-row';
      var amtHtml = totalValue > 0 ? ('<div class="heir-amt">تقریباً '+fmtMoney(s.value*totalValue)+' '+currency+'</div>') : '';
      row.innerHTML = '<div><div class="heir-name">'+s.name+'</div>'+amtHtml+'</div><div class="heir-pct">'+pct(s.value)+'٪</div>';
      listEl.appendChild(row);
    });

    var noteBox = document.getElementById('noteBox');
    if(result.notes.length){
      noteBox.style.display = 'block';
      noteBox.innerHTML = result.notes.map(function(n){ return '<div>• '+n+'</div>'; }).join('');
    } else {
      noteBox.style.display = 'none';
    }

    document.getElementById('resultWrap').style.display = 'block';
    document.getElementById('resultWrap').scrollIntoView({behavior:'smooth', block:'start'});
  });

  document.getElementById('recalcBtn').addEventListener('click', function(){
    document.getElementById('resultWrap').style.display = 'none';
    window.scrollTo({top:0, behavior:'smooth'});
  });
})();
