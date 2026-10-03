document.querySelectorAll('.faq-item').forEach(function(item){
  item.querySelector('.faq-q').addEventListener('click', function(){
    var isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function(i){ i.classList.remove('open'); });
    if(!isOpen) item.classList.add('open');
  });
});
