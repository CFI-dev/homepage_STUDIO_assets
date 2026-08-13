/* ================= CFI COMMON JS v1.0 / 2026-08-13 ================= */
(function(){"use strict";

/* ▼ 公開後の本番URLをここに1回だけ記入（例 "https://cfi-holding.com"）
   空のままだとページ内アンカーは親ページへ飛びません */
var SITE="";

var rm=matchMedia('(prefers-reduced-motion: reduce)');
function ready(fn){document.readyState!=='loading'?fn():document.addEventListener('DOMContentLoaded',fn)}

ready(function(){

 /* --- 1. iframe内リンク対策 --- */
 document.querySelectorAll('a[href^="mailto:"],a[href^="tel:"]').forEach(function(a){a.target='_top'});
 document.querySelectorAll('a[href^="http"]').forEach(function(a){a.target='_blank';a.rel='noopener'});
 if(window.self!==window.top&&SITE){
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
   var h=a.getAttribute('href');if(h==='#')return;
   a.setAttribute('href',SITE.replace(/\/+$/,'')+'/'+h);a.target='_top'})}

 /* --- 2. 出現トリガ（iframeでスクロールが無い場合は時間差再生） --- */
 var scrollable=document.documentElement.scrollHeight>window.innerHeight+48;
 function onView(el,cb,delay){
  if(!scrollable){setTimeout(cb,delay);return}
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
   if(e.isIntersecting){cb();io.unobserve(e.target)}})},{threshold:.14,rootMargin:'0px 0px -8%'});
  io.observe(el)}

 document.querySelectorAll('.rv').forEach(function(el,i){
  onView(el,function(){el.classList.add('on')},120+i*90)});

 document.querySelectorAll('[data-count]').forEach(function(el,i){onView(el,function(){
  var goal=+el.dataset.count,sfx=el.dataset.suffix||'';
  if(rm.matches){el.textContent=goal+sfx;return}
  var t0=performance.now(),D=1400;
  (function step(t){var p=Math.min((t-t0)/D,1),v=Math.round(goal*(1-Math.pow(1-p,3)));
   el.textContent=v+sfx;if(p<1)requestAnimationFrame(step)})(t0)},300+i*120)});

 /* --- 3. ハンバーガー（B0のみ） --- */
 var b=document.getElementById('burger'),n=document.getElementById('nav');
 if(b&&n){
  b.addEventListener('click',function(){var o=b.classList.toggle('on');
   n.classList.toggle('open',o);b.setAttribute('aria-expanded',String(o));
   b.setAttribute('aria-label',o?'メニューを閉じる':'メニューを開く')});
  n.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){
   b.classList.remove('on');n.classList.remove('open');
   b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','メニューを開く')})})}

 /* --- 4. ティッカー複製（B2のみ） --- */
 var tk=document.getElementById('tk');
 if(tk&&!tk.dataset.dup){tk.dataset.dup='1';tk.innerHTML+=tk.innerHTML}

 /* --- 5. ヒーロー背景キャンバス（B1のみ） --- */
 var cv=document.getElementById('heroCv'),hero=document.querySelector('.hero');
 if(!cv||!hero)return;
 var g=cv.getContext('2d',{alpha:true}),TAU=Math.PI*2;
 var W=0,H=0,DPR=1,nodes=[],raf=null,visible=true;
 function seeded(s){var v=s%2147483647;if(v<=0)v+=2147483646;
  return function(){v=v*16807%2147483647;return(v-1)/2147483646}}
 function build(){var rnd=seeded(20160202);
  var cap=W<430?26:(W<700?38:72);
  var cnt=Math.round(Math.min(cap,Math.max(14,(W*H)/22000)));
  nodes=[];for(var i=0;i<cnt;i++){nodes.push({x:rnd()*W,y:rnd()*H,
   vx:(rnd()-.5)*.22,vy:(rnd()-.5)*.22,r:.9+rnd()*1.9,
   c:rnd()>.62?'0,194,168':'15,107,224'})}}
 function resize(){DPR=Math.min(devicePixelRatio||1,2);
  var r=cv.getBoundingClientRect();W=r.width;H=r.height;
  if(W<1||H<1)return false;
  cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);build();return true}
 function aperture(cx,cy,R,rot,al){
  var gr=g.createLinearGradient(cx-R,cy-R,cx+R,cy+R);
  gr.addColorStop(0,'rgba(15,107,224,'+al+')');gr.addColorStop(1,'rgba(0,194,168,'+al+')');
  g.save();g.translate(cx,cy);g.rotate(rot);
  g.strokeStyle=gr;g.lineWidth=R*.2;g.lineCap='round';
  for(var i=0;i<3;i++){var s=i*TAU/3;g.beginPath();g.arc(0,0,R,s,s+1.38);g.stroke()}
  g.restore();g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R*.09,0,TAU);g.fill()}
 function draw(t){
  if(W<1||H<1){raf=requestAnimationFrame(draw);return}
  g.clearRect(0,0,W,H);
  var narrow=W<700,cx=narrow?W*.5:W*.74,cy=narrow?H*.34:H*.46;
  var R=Math.min(W,H)*(narrow?.17:.22),LINK=Math.min(150,Math.max(70,W*.11)),i,j;
  for(i=0;i<nodes.length;i++){var p=nodes[i];p.x+=p.vx;p.y+=p.vy;
   if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1}
  g.lineWidth=1;
  for(i=0;i<nodes.length;i++){for(j=i+1;j<nodes.length;j++){
   var a=nodes[i],b2=nodes[j],dx=a.x-b2.x,dy=a.y-b2.y,d=Math.hypot(dx,dy);
   if(d>LINK)continue;
   g.strokeStyle='rgba(0,194,168,'+(0.16*(1-d/LINK)).toFixed(3)+')';
   g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b2.x,b2.y);g.stroke()}}
  for(i=0;i<nodes.length;i++){var q=nodes[i];
   g.fillStyle='rgba('+q.c+',0.55)';g.beginPath();g.arc(q.x,q.y,q.r,0,TAU);g.fill()}
  var halo=g.createRadialGradient(cx,cy,R*.2,cx,cy,R*1.9);
  halo.addColorStop(0,'rgba(0,194,168,0.11)');
  halo.addColorStop(.55,'rgba(15,107,224,0.07)');
  halo.addColorStop(1,'rgba(15,107,224,0)');
  g.fillStyle=halo;g.beginPath();g.arc(cx,cy,R*1.9,0,TAU);g.fill();
  var rot=(t/26000)*TAU;
  aperture(cx,cy,R*1.42,-rot*.55,.16);aperture(cx,cy,R,rot,.5);
  raf=requestAnimationFrame(draw)}
 function start(){if(!raf&&visible&&!rm.matches)raf=requestAnimationFrame(draw)}
 function stop(){if(raf){cancelAnimationFrame(raf);raf=null}}
 resize();
 if('ResizeObserver' in window){new ResizeObserver(function(){
  stop();if(resize()){rm.matches?draw(0):start()}}).observe(hero)}
 addEventListener('resize',function(){stop();if(resize()){rm.matches?draw(0):start()}},{passive:true});
 document.addEventListener('visibilitychange',function(){document.hidden?stop():start()});
 new IntersectionObserver(function(es){visible=es[0].isIntersecting;visible?start():stop()},{threshold:0}).observe(hero);
 rm.matches?draw(0):start();
});})();
