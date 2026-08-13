/* ================= CFI COMMON JS v2.0 / 2026-08-13 =================
   iframe(Embed)内で確実に動作するよう、出現トリガをIO＋フェイルセーフ化
   ================================================================== */
(function(){"use strict";

/* 公開後の本番URL。ページ内アンカーを親ページへ飛ばすために使用 */
var SITE="https://cfi-holding.com";

var rm=matchMedia('(prefers-reduced-motion: reduce)');
var inIframe=(window.self!==window.top);
function ready(fn){document.readyState!=='loading'?fn():document.addEventListener('DOMContentLoaded',fn)}

ready(function(){

 /* --- 1. iframe内リンク対策 --- */
 document.querySelectorAll('a[href^="mailto:"],a[href^="tel:"]').forEach(function(a){a.setAttribute('target','_top')});
 document.querySelectorAll('a[href^="http"]').forEach(function(a){
  a.setAttribute('target','_blank');a.setAttribute('rel','noopener')});
 if(inIframe&&SITE){
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
   var h=a.getAttribute('href');if(h==='#')return;
   a.setAttribute('href',SITE.replace(/\/+$/,'')+'/'+h);
   a.setAttribute('target','_top')})}

 /* --- 2. 出現アニメーション / カウントアップ 共通トリガ ---
    Embedは高さ自動調整のiframeのためスクロールが発生せず、
    IntersectionObserverが一度も発火しないケースがある。
    そのため一定時間後に無条件で再生するフェイルセーフを併用する。 */
 var _rv=[].slice.call(document.querySelectorAll('.rv'));
 var _cn=[].slice.call(document.querySelectorAll('[data-count]'));

 function show(el){el.classList.add('on')}

 function runCount(el){
  if(el.dataset.done)return; el.dataset.done='1';
  var goal=+el.dataset.count,sfx=el.dataset.suffix||'';
  if(rm.matches){el.textContent=goal+sfx;return}
  var t0=performance.now(),D=1400;
  (function step(t){
   var p=Math.min((t-t0)/D,1),v=Math.round(goal*(1-Math.pow(1-p,3)));
   el.textContent=v+sfx;
   if(p<1)requestAnimationFrame(step)})(t0)}

 function showAll(){
  _rv.forEach(function(el,i){setTimeout(function(){show(el)},i*90)});
  _cn.forEach(runCount)}

 if(!('IntersectionObserver' in window)){showAll()}
 else{
  var io=new IntersectionObserver(function(es){
   es.forEach(function(e){
    if(!e.isIntersecting)return;
    var el=e.target;io.unobserve(el);
    el.classList.contains('rv')?show(el):runCount(el)})},
   {threshold:0,rootMargin:'0px 0px -5%'});
  _rv.concat(_cn).forEach(function(el){io.observe(el)});
  setTimeout(showAll,1800);
  addEventListener('load',function(){setTimeout(showAll,600)});
 }

 /* --- 3. モバイルメニュー --- */
 var burger=document.getElementById('burger'),nav=document.getElementById('nav');
 if(burger&&nav){
  burger.addEventListener('click',function(){
   var open=burger.classList.toggle('on');
   nav.classList.toggle('open',open);
   burger.setAttribute('aria-expanded',String(open));
   burger.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く')});
  nav.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){
   burger.classList.remove('on');nav.classList.remove('open');
   burger.setAttribute('aria-expanded','false');
   burger.setAttribute('aria-label','メニューを開く')})})}

 /* --- 4. ティッカー複製（シームレスループ用・二重実行防止） --- */
 var tk=document.getElementById('tk');
 if(tk&&!tk.dataset.dup){tk.dataset.dup='1';tk.innerHTML+=tk.innerHTML}

 /* --- 5. ヒーロー背景：ノードネットワーク＋アパーチャー --- */
 var cv=document.getElementById('heroCv'),hero=document.querySelector('.hero');
 if(!cv||!hero)return;
 var g=cv.getContext('2d',{alpha:true}),TAU=Math.PI*2;
 var W=0,H=0,DPR=1,nodes=[],raf=null,visible=true;

 function seeded(s){var v=s%2147483647;if(v<=0)v+=2147483646;
  return function(){v=v*16807%2147483647;return(v-1)/2147483646}}

 function build(){
  var rnd=seeded(20160202);
  /* 幅に応じてノード数を抑制（424/320でも軽量に動作） */
  var cap=W<430?26:(W<700?38:72);
  var n=Math.round(Math.min(cap,Math.max(14,(W*H)/22000)));
  nodes=[];
  for(var i=0;i<n;i++){nodes.push({
   x:rnd()*W,y:rnd()*H,
   vx:(rnd()-.5)*.22,vy:(rnd()-.5)*.22,
   r:.9+rnd()*1.9,
   c:rnd()>.62?'0,194,168':'15,107,224'})}}

 function resize(){
  DPR=Math.min(devicePixelRatio||1,2);
  var r=cv.getBoundingClientRect();W=r.width;H=r.height;
  if(W<1||H<1)return false;
  cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
  g.setTransform(DPR,0,0,DPR,0,0);build();return true}

 function aperture(cx,cy,R,rot,al){
  var gr=g.createLinearGradient(cx-R,cy-R,cx+R,cy+R);
  gr.addColorStop(0,'rgba(15,107,224,'+al+')');
  gr.addColorStop(1,'rgba(0,194,168,'+al+')');
  g.save();g.translate(cx,cy);g.rotate(rot);
  g.strokeStyle=gr;g.lineWidth=R*.2;g.lineCap='round';
  for(var i=0;i<3;i++){var s=i*TAU/3;g.beginPath();g.arc(0,0,R,s,s+1.38);g.stroke()}
  g.restore();
  g.fillStyle=gr;g.beginPath();g.arc(cx,cy,R*.09,0,TAU);g.fill()}

 function draw(t){
  if(W<1||H<1){raf=requestAnimationFrame(draw);return}
  g.clearRect(0,0,W,H);
  /* 幅が狭いときはリングを中央寄せ・小さめに */
  var narrow=W<700,cx=narrow?W*.5:W*.74,cy=narrow?H*.34:H*.46;
  var R=Math.min(W,H)*(narrow?.17:.22);
  var LINK=Math.min(150,Math.max(70,W*.11)),i,j;
  for(i=0;i<nodes.length;i++){var p=nodes[i];p.x+=p.vx;p.y+=p.vy;
   if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1}
  g.lineWidth=1;
  for(i=0;i<nodes.length;i++){for(j=i+1;j<nodes.length;j++){
   var a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);
   if(d>LINK)continue;
   g.strokeStyle='rgba(0,194,168,'+(0.16*(1-d/LINK)).toFixed(3)+')';
   g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke()}}
  for(i=0;i<nodes.length;i++){var q=nodes[i];
   g.fillStyle='rgba('+q.c+',0.55)';
   g.beginPath();g.arc(q.x,q.y,q.r,0,TAU);g.fill()}
  var halo=g.createRadialGradient(cx,cy,R*.2,cx,cy,R*1.9);
  halo.addColorStop(0,'rgba(0,194,168,0.11)');
  halo.addColorStop(.55,'rgba(15,107,224,0.07)');
  halo.addColorStop(1,'rgba(15,107,224,0)');
  g.fillStyle=halo;g.beginPath();g.arc(cx,cy,R*1.9,0,TAU);g.fill();
  var rot=(t/26000)*TAU;
  aperture(cx,cy,R*1.42,-rot*.55,.16);
  aperture(cx,cy,R,rot,.5);
  raf=requestAnimationFrame(draw)}

 function start(){if(!raf&&visible&&!rm.matches)raf=requestAnimationFrame(draw)}
 function stop(){if(raf){cancelAnimationFrame(raf);raf=null}}

 resize();
 /* iframe幅の変化を確実に拾うためResizeObserverを併用 */
 if('ResizeObserver' in window){
  new ResizeObserver(function(){stop();if(resize()){rm.matches?draw(0):start()}}).observe(hero)}
 addEventListener('resize',function(){stop();if(resize()){rm.matches?draw(0):start()}},{passive:true});
 document.addEventListener('visibilitychange',function(){document.hidden?stop():start()});
 new IntersectionObserver(function(es){visible=es[0].isIntersecting;visible?start():stop()},{threshold:0}).observe(hero);
 rm.matches?draw(0):start();

});})();
