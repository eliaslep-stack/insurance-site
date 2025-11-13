window.Site = {
  setLang(l){ localStorage.setItem('site_lang', l); location.href = '/' + l + '/'; },
  consent(){ localStorage.setItem('cookie_ok','1'); document.querySelector('.cookie')?.classList.remove('show'); }
};
window.addEventListener('load', ()=>{
  if(!localStorage.getItem('cookie_ok')) document.querySelector('.cookie')?.classList.add('show');
});
// Make the logo clickable: go to Greek homepage
window.addEventListener('DOMContentLoaded', function () {
  var logos = document.querySelectorAll('.logo');
  logos.forEach(function (logo) {
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', function () {
      window.location.href = '/el/index.html';
    });
  });
});
