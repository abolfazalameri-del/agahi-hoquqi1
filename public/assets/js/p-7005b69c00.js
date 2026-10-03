(function(){
  var contactGroup = document.getElementById('contactChoice');
  var contactMethod = '';
  contactGroup.querySelectorAll('.choice-card').forEach(function(card){
    card.addEventListener('click', function(){
      contactGroup.querySelectorAll('.choice-card').forEach(function(c){ c.classList.remove('selected'); });
      card.classList.add('selected');
      contactMethod = card.dataset.value;
    });
  });

  document.getElementById('sendBtn').addEventListener('click', function(){
    var name = document.getElementById('f_name').value.trim();
    var phone = document.getElementById('f_phone').value.trim();
    var desc = document.getElementById('f_desc').value.trim();
    
    
    var fileEl = document.getElementById('f_file');
    var hasFile = fileEl.files && fileEl.files.length > 0;

    var lines = [];
    lines.push('درخواست: بررسی اولیه سند');
    if(name) lines.push('نام: ' + name);
    if(phone) lines.push('شماره تماس: ' + phone);
    
    if(desc) lines.push('توضیحات: ' + desc);
    
    if(contactMethod) lines.push('روش تماس ترجیحی: ' + contactMethod);
    if(hasFile) lines.push('توجه: یک فایل هم برای ارسال انتخاب شده؛ لطفاً آن را در همین گفتگوی واتساپ پیوست کنید.');

    var text = lines.join('\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  });
})();
