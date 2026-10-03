(function(){
  var items = ["مبلغ قرض به‌صورت دقیق و کتبی مشخص شده است.","مشخصات کامل طرفین (نام، نام پدر، آدرس، شماره تماس) ثبت شده است.","تاریخ پرداخت و بازپرداخت مشخص است.","روش بازپرداخت (یکجا یا اقساط) توافق شده است.","شاهد یا امضای هر دو طرف روی سند وجود دارد.","در صورت تأخیر در بازپرداخت، توافق مشخصی وجود دارد.","یک نسخه از سند نزد هر دو طرف نگهداری می‌شود.","در صورت وجود ضامن یا وثیقه، مشخصات آن ثبت شده است."];
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
    var text = 'چک‌لیست قرض\n\n' + lines.join('\n');
    var blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'چک‌لیست-قرض.txt';
    a.click();
  });
})();
