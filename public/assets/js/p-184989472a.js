(function(){
  var items = ["مشخصات کامل موجر و مستأجر ثبت شده است.","مبلغ اجاره و نحوه پرداخت (ماهانه یا سالانه) مشخص است.","مدت قرارداد اجاره مشخص شده است.","شرایط تمدید یا فسخ قرارداد ذکر شده است.","وضعیت ملک هنگام تحویل ثبت شده است (توضیح یا عکس).","مسئولیت تعمیرات مشخص شده است.","مبلغ ودیعه یا پیش‌پرداخت و شرایط بازگشت آن مشخص است.","قرارداد به امضای هر دو طرف رسیده است."];
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
    var text = 'چک‌لیست اجاره\n\n' + lines.join('\n');
    var blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'چک‌لیست-اجاره.txt';
    a.click();
  });
})();
