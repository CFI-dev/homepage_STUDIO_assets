document.documentElement.classList.add('js');
(function(){"use strict";
var SITE="";
var rm=matchMedia('(prefers-reduced-motion: reduce)');
function ready(f){document.readyState!=='loading'?f():document.addEventListener('DOMContentLoaded',f)}
ready(function(){
  document.querySelectorAll('a[href^="mailto:"],a[href^="tel:"]').forEach(function(a){a.target='_top'});
  document.querySelectorAll('a[href^="http"]').forEach(function(a){a.target='_blank';a.rel='noopener'});
  if(window.self!==window.top&&SITE){
    document.querySelectorAll('a[href^="#"]').forEach(function(a){
      var h=a.getAttribute('href'); if(h==='#')return;
      a.setAttribute('href',SITE.replace(/\/+$/,'')+'/'+h); a.target='_top'})}

  var items=[].slice.call(document.querySelectorAll('.rv'));
  var counters=[].slice.call(document.querySelectorAll('[data-count]'));
  function show(el){el.classList.add('on')}
  function count(el){
    if(el.dataset.done)return; el.dataset.done=1;
    var goal=+el.dataset.count, sfx=el.dataset.suffix||'';
    if(rm.matches){el.textContent=goal+sfx;return}
    var t0=performance.now(),D=1400;
    (function step(t){var p=Math.min((t-t0)/D,1);
      el.textContent=Math.round(goal*(1-Math.pow(1-p,3)))+sfx;
      if(p<1)requestAnimationFrame(step)})(t0)}

  /* ★フェイルセーフ：3秒後は無条件で表示（iframe高さ0・IO不発でも消えない） */
  setTimeout(function(){items.forEach(show);counters.forEach(count)},3000);

  if(!('IntersectionObserver' in window)){items.forEach(show);counters.forEach(count);return}
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){ if(!e.isIntersecting)return;
      var el=e.target; io.unobserve(el);
      el.classList.contains('rv')?show(el):count(el)})},
    {threshold:0,rootMargin:'0px 0px -5%'});
  items.forEach(function(el){io.observe(el)});
  counters.forEach(function(el){io.observe(el)});
});})();
