(function(){
  var items = ["سند مالکیت ملک بررسی و اصالت آن تأیید شده است.","ملک هیچ‌گونه بدهی، رهن یا اختلاف قبلی ندارد.","مشخصات دقیق ملک (موقعیت، مساحت، حدود اربعه) ثبت شده است.","قرارداد خرید و فروش به‌صورت کتبی تنظیم شده است.","مبلغ، نحوه و زمان پرداخت مشخص است.","هزینه‌های انتقال سند و مالیات مشخص شده است.","شاهد و امضای هر دو طرف روی قرارداد وجود دارد.","در صورت وجود واسطه، مشخصات و کارمزد او مشخص است."];
  var listEl = document.getElementById('checkList');
  items.forEach(function(text, i){
    var row = document.createElement('div');
    row.className = 'check-item';
    row.dataset.index = i;
    row.innerHTML = '<div class="check-box"><svg><use href="#i-check"/></svg></div><p>' + text + '</p>';
    row.addEventListener('click', function(){
      row.classList.toggle('done');
      updateProgress();
    });
    listEl.appendChild(row);
  });

  function updateProgress(){
    var total = items.length;
    var done = document.querySelectorAll('.check-item.done').length;
    document.getElementById('progFill').style.width = Math.round((done/total)*100) + '%';
    document.getElementById('doneCount').textContent = done.toLocaleString('fa-IR') + ' از ' + total.toLocaleString('fa-IR');
  }
  updateProgress();

  document.getElementById('printBtn').addEventListener('click', function(){ window.print(); });
  document.getElementById('resetBtn').addEventListener('click', function(){
    document.querySelectorAll('.check-item').forEach(function(el){ el.classList.remove('done'); });
    updateProgress();
  });
  document.getElementById('downloadBtn').addEventListener('click', function(){
    var lines = items.map(function(t, i){
      var done = document.querySelectorAll('.check-item')[i].classList.contains('done');
      return (done ? '[x] ' : '[ ] ') + t;
    });
    var text = 'چک‌لیست خرید خانه\n\n' + lines.join('\n');
    var blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'چک‌لیست-خرید-خانه.txt';
    a.click();
  });
})();
