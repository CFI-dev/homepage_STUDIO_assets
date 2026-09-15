"use strict";

/* ============================================================
   CFI メインスクリプト（home / contact 共用）
   ────────────────────────────────────────────────────────────
   ■ 触る前に必ず読むこと
   ・ハンバーガー切替点 960px（MQ_DESK）は common.css §23 と必ず一致させること
   ・common.css と対になっている。片方だけ更新しないこと
     §5  → .hd-prog の --p / header.hd-up / .hero .wrap の translate
     §7  → .rv に .on ／ nav.mo-ready ／ 各要素の --i
     §8  → .faq .mo-a の実測 height
     §14 → .cs-rail の .cs-ready ／ .case の .is-cs-active（common.css §15-2）
   ・window スクロールの購読は §5 の1本のみ。他所で
     addEventListener('scroll') を増やさないこと（rAF の間引きが効かなくなる）
   ・ページ側HTMLに必要なのは window.CFI_CONFIG の宣言のみ。
     リンク解決・DOM配置・クローク解除はすべてここが担う
   ・未使用化した initRail / initCounter は parking.js へ退避してある。
     本番では読み込まないこと
   ・このファイルは DOM（#cfi-root / #cfi-top）より後に読み込むこと
   ============================================================ */

(function () {
  /* ------------------------------------------------------------
     1. 二重読み込みガード / 設定 / 共通ヘルパー
        CFI_CONFIG が無い場合は home 扱いで動く（最低限は壊れない）
     ------------------------------------------------------------ */
  if (window.__cfiCommonLoaded) return;
  window.__cfiCommonLoaded = true;

  var CFG      = window.CFI_CONFIG || {};
  var PAGE     = CFG.page === "contact" ? "contact" : "home";
  var HOME     = CFG.home || "/";
  var CONTACT  = CFG.contact || "/contact";

  var html   = document.documentElement;
  var MQ_DESK = matchMedia("(min-width:961px)");
  var rm      = matchMedia("(prefers-reduced-motion: reduce)");
  var HAS_IO  = typeof IntersectionObserver === "function";

  /* matchMedia の change 購読（Safari 13以下は addListener のみ） */
  function onMQ(mq, fn) {
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", fn);
    else if (typeof mq.addListener === "function") mq.addListener(fn);
  }

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* 公開API置き場。initScroll / initReveal の両方から書き込む */
  var CFI = (window.CFI = window.CFI || {});

  /* ------------------------------------------------------------
     2. リンク解決 / 未確定リンク
        ・data-cfi-nav="home" → HOME、"home#cases" → HOME + '#cases'、
          "contact" → CONTACT。ページ間でパスを書き分けないための仕組み
        ・data-cfi-todo は href が未設定のものだけを無効化する。
          URLが決まったら属性を外すだけで通常リンクに戻る
     ------------------------------------------------------------ */
  (function initLinks() {
    each(document.querySelectorAll("[data-cfi-nav]"), function (a) {
      var v = a.getAttribute("data-cfi-nav") || "";
      var href = null;
      if (v === "contact") href = CONTACT;
      else if (v.indexOf("home") === 0) href = HOME + v.slice(4);
      if (href) a.setAttribute("href", href.replace("//", "/"));
    });

    each(document.querySelectorAll("a[data-cfi-todo]"), function (a) {
      var h = a.getAttribute("href");
      if (h && h !== "#") return;
      a.classList.add("is-todo");
      a.setAttribute("aria-disabled", "true");
      a.setAttribute("tabindex", "-1");
      a.removeAttribute("href");
      a.addEventListener("click", function (e) { e.preventDefault(); });
    });
  })();

  /* ------------------------------------------------------------
     3. DOM配置
        home    … #cfi-root を body 直下へ移し、STUDIO既存DOMを伏せる
                  （#__nuxt は common.css §3 が display:none で伏せる。
                    ここでの display 指定はその他の兄弟要素向け）
        contact … ヘッダー＋ヒーロー(#cfi-top)を #__nuxt の直前へ移す。
                  フッター(#cfi-bottom)はフォームの後ろに残す
     ------------------------------------------------------------ */
  (function initPlacement() {
    var SKIP = { SCRIPT: 1, STYLE: 1, LINK: 1, NOSCRIPT: 1, TEMPLATE: 1 };

    if (PAGE === "contact") {
      var top = document.getElementById("cfi-top");
      if (!top) return;
      var nuxt = document.getElementById("__nuxt");
      if (nuxt && nuxt.parentNode) nuxt.parentNode.insertBefore(top, nuxt);
      else document.body.insertBefore(top, document.body.firstChild);
      return;
    }

    var root = document.getElementById("cfi-root");
    if (!root) {
      /* 器が無い＝表示できないので幕だけは必ず上げる */
      html.classList.remove("cfi-boot", "cfi-boot-out");
      return;
    }
    if (root.parentNode !== document.body) document.body.appendChild(root);
    Array.prototype.slice.call(document.body.children).forEach(function (el) {
      if (el !== root && !SKIP[el.tagName]) el.style.display = "none";
    });
  })();

  /* ------------------------------------------------------------
     4. 起動クローク解除 / リビールのフォールバック
        ・解除の演出（.28s / .3s）は common.css §3 と対。数値を変える場合は
          両方を揃えること
        ・contact はSTUDIOのキャンバス描画＋配色注入を待つ。
          home は待つ対象が無いので DOMContentLoaded 直後に上げる
        ・最終保険の3秒は、各ページHEADの3.5秒より必ず先に発火させること
     ------------------------------------------------------------ */
  (function initBoot() {
    function reveal() {
      if (!html.classList.contains("cfi-boot")) return;
      html.classList.add("cfi-boot-out");
      setTimeout(function () {
        html.classList.remove("cfi-boot", "cfi-boot-out");
      }, 300);
    }

    if (PAGE === "contact") {
      var waited = 0;
      var poll = setInterval(function () {
        waited += 50;
        var canvas = document.querySelector("#__nuxt .StudioCanvas, #__nuxt .sd");
        if (canvas || waited >= 2000) {
          clearInterval(poll);
          /* STUDIO側の .3s〜.4s transition が終わり切るまで待つ */
          setTimeout(reveal, 480);
        }
      }, 50);
      addEventListener("load", function () { setTimeout(reveal, 480); });
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        setTimeout(reveal, 120);
      });
      addEventListener("load", reveal);
    } else {
      setTimeout(reveal, 120);
      addEventListener("load", reveal);
    }

    setTimeout(reveal, 3000);   /* 最終保険 */

    /* リビールが発火しなかった場合の保険。
       クローク中は判定しない（幕の裏では監視が始まらないため） */
    var tries = 0;
    (function check() {
      if (html.classList.contains("cfi-boot") && ++tries < 12) {
        setTimeout(check, 500);
        return;
      }
      setTimeout(function () {
        var rv = document.querySelector("#cfi-root .rv, #cfi-top .rv, #cfi-bottom .rv");
        if (rv && !rv.classList.contains("on")) html.classList.add("cfi-fallback");
      }, 1200);
    })();
  })();

  /* ------------------------------------------------------------
     5. モバイルメニュー
        ・項目の段差表示用に --i を付与し、nav.mo-ready を立てる。
          CSS(§19-2)は mo-ready が無ければ何もしないため、
          JSが落ちた場合は従来どおり即表示になる
     ------------------------------------------------------------ */
  (function initNav() {
    var burger = document.getElementById("burger");
    var nav = document.getElementById("nav");
    if (!burger || !nav) return;

    function closeNav() {
      burger.classList.remove("on");
      nav.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
      burger.setAttribute("aria-label", "メニューを開く");
    }

    burger.addEventListener("click", function () {
      var open = burger.classList.toggle("on");
      nav.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    });

    /* 段差表示用インデックス（CSS側で 45ms 刻みの遅延に変換される） */
    each(nav.querySelectorAll("ul > li"), function (li, i) {
      li.style.setProperty("--i", i);
    });
    nav.classList.add("mo-ready");

    each(nav.querySelectorAll("a"), function (a) {
      a.addEventListener("click", closeNav);
    });

    /* PC幅に戻したら閉じる */
    onMQ(MQ_DESK, function (e) { if (e.matches) closeNav(); });

    addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });
  })();

  /* ------------------------------------------------------------
     6. スクロール連動（影 / 格納 / 進捗バー / ヒーローのパララックス）
        ▼ カクつき対策。以下3点が設計の要。崩さないこと
          ・frame() 内でレイアウトを伴う読み取り（scrollHeight /
            offsetHeight）を行わない。クラス書き込みの直後に読むと
            強制同期レイアウトが毎フレーム発生する。計測は measure()
            に隔離し、resize / load / DOM変化時のみ実行する
          ・パララックスはカスタムプロパティ経由にせず .hero .wrap へ
            直接書く。カスタムプロパティは継承するため、.hero に載せると
            配下すべて（canvas・見出し・リード文・CTA）の
            スタイル再計算が毎フレーム走る
          ・.hd-up は ±10px のヒステリシスを持たせる。2px しきい値だと
            慣性スクロールの微振動で往復し、backdrop-filter 付きの
            fixed ヘッダーの再合成を繰り返す
        ・window スクロールの購読は全体でこの1本のみ。rAF で1フレーム1回に間引く
     ------------------------------------------------------------ */
  (function initScroll() {
    var hd = document.getElementById("hd");
    var prog = document.querySelector(".hd-prog");
    var nav = document.getElementById("nav");
    var hero = document.querySelector(".hero");
    var heroWrap = hero && hero.querySelector(".wrap");
    var hint = document.querySelector(".scroll-hint");
    if (!hd && !prog && !hero) return;

    var last = 0;
    var ticking = false;
    var soft = rm.matches;      /* 動きを減らす設定では格納とパララックスを止める */
    var maxScroll = 0;
    var heroH = 1;
    var up = false;             /* .hd-up の現在状態。無駄な class 書換を避ける */

    /* ▼ レイアウトを伴う読み取りはこの関数に隔離する。
         スクロール中は絶対に呼ばないこと */
    function measure() {
      maxScroll = document.documentElement.scrollHeight - innerHeight;
      heroH = (hero && hero.offsetHeight) || 1;
    }

    function frame() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;  /* 読み取りはここだけ */

      /* --- 以降は書き込みのみ。読み取りを混ぜないこと --- */

      /* 6-1 ヘッダー影 */
      if (hd) hd.classList.toggle("scr", y > 40);

      /* 6-2 読了進捗バー（maxScroll は measure() のキャッシュ値） */
      if (prog) {
        prog.style.setProperty(
          "--p",
          maxScroll > 0 ? Math.min(y / maxScroll, 1).toFixed(4) : "0"
        );
      }

      /* 6-3 下方向スクロールでヘッダーを格納。
             メニュー展開中は隠さない（操作不能になるため） */
      if (hd && !soft) {
        var open = nav && nav.classList.contains("open");
        var d = y - last;
        /* しきい値未満の揺れでは last を更新せず、移動量を累積させる */
        if (Math.abs(d) >= 10 || y <= 240) {
          var next = d > 0 && y > 240 && !open;
          if (next !== up) {
            up = next;
            hd.classList.toggle("hd-up", up);
          }
          last = y;
        }
      } else {
        last = y;
      }

      /* 6-4 ヒーローのパララックス（合成可能プロパティへ直接書込） */
      if (heroWrap && !soft) {
        var p = Math.min(y / heroH, 1);
        heroWrap.style.translate = "0 " + (p * 46).toFixed(2) + "px";
        heroWrap.style.opacity = (1 - p * 0.9).toFixed(3);
        if (hint) hint.style.opacity = Math.max(0, 1 - p * 2.4).toFixed(3);
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(frame);
      }
    }

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", function () { measure(); onScroll(); }, { passive: true });

    /* ▼ 文書高の変化に追随させる。
         画像の遅延読込確定や FAQ の開閉で高さが変わるため、
         これが無いと進捗バーの値が一時的にずれる */
    addEventListener("load", function () { measure(); onScroll(); });
    if (typeof ResizeObserver === "function" && document.body) {
      new ResizeObserver(function () { measure(); onScroll(); }).observe(document.body);
    }

    /* 後から生成されるDOM（STUDIOフォーム等）用の手動再計測フック */
    CFI.remeasure = function () { measure(); onScroll(); };

    /* 設定が実行中に切り替わった場合も追従（残った状態を戻す） */
    onMQ(rm, function (e) {
      soft = e.matches;
      if (!soft) { onScroll(); return; }
      if (hd) { hd.classList.remove("hd-up"); up = false; }
      if (heroWrap) { heroWrap.style.translate = ""; heroWrap.style.opacity = ""; }
      if (hint) hint.style.opacity = "";
    });

    measure();
    frame(); /* リロード位置が途中の場合に備えて初期反映 */
  })();

  /* ------------------------------------------------------------
     7. ティッカー複製（シームレスループ用）
        ※ 二重複製を防ぐためフラグで一度だけ実行
     ------------------------------------------------------------ */
  (function initTicker() {
    var tk = document.getElementById("tk");
    if (!tk || tk.dataset.cfiDuped === "1") return;
    tk.innerHTML += tk.innerHTML;
    tk.dataset.cfiDuped = "1";
  })();

  /* ------------------------------------------------------------
     8. 出現アニメーション（.rv → .on）
        (a) 起動クローク（html.cfi-boot）が引き始めるまで監視を開始しない。
            幕の裏で演出が完了し「動かないページ」に見えるのを防ぐ。
        (b) 後から生成されるDOM（STUDIOフォーム等）を
            window.CFI.reveal(target) で追加登録できる。
        (c) [data-mo-stagger] の直下要素を個別リビールへ展開する。
            属性値は方向指定（"" | "s" | "f"）。CSS §19 の .rv-s / .rv-f と対
        (d) 段差の遅延は setTimeout ではなく CSS の --i（§19）が担う。
            JSでずらすと transition の途中で class が付き、
            要素ごとに速度が不揃いに見えるため。ここを戻さないこと
        ※ CASES の複製カード（§14 が生成）はこの監視の対象外。
          §14 が自前で .on を付ける
     ------------------------------------------------------------ */
  (function initReveal() {
    /* 非対応環境／動きを減らす設定では即時表示 */
    var INSTANT = !HAS_IO || rm.matches;

    var io = null;
    var queue = [];      /* 監視開始前に積まれた要素 */
    var started = false;

    /* ▼▼ 発火タイミングの調整ダイヤル ▼▼
       START_ON_FADE = true  : 幕が引き始めた瞬間（cfi-boot-out）に開始＝幕と重なる
       START_ON_FADE = false : 幕が完全に消えてから（cfi-boot 除去）開始
       LEAD                  : 追加ディレイ(ms)。もたつく／急ぐと感じたら 0〜200 で調整 */
    var START_ON_FADE = true;
    var LEAD = 0;
    /* ▲▲ 調整はここまで ▲▲ */

    function toList(t) {
      if (!t) return [];
      if (t.nodeType === 1) return [t];
      return Array.prototype.slice.call(t);
    }

    function getIO() {
      if (io) return io;
      io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            /* 段差はCSS(--i)が担当。ここでは即座に .on を付ける */
            e.target.classList.add("on");
            io.unobserve(e.target);
          });
        },
        { threshold: 0.14, rootMargin: "0px 0px -8%" }
      );
      return io;
    }

    /* 公開API：window.CFI.reveal(Element | NodeList | Array) */
    function observe(target) {
      var list = toList(target).filter(function (el) {
        return el && el.classList && !el.classList.contains("on");
      });
      if (!list.length) return;
      if (INSTANT) {
        list.forEach(function (el) { el.classList.add("on"); });
        return;
      }
      if (!started) { queue = queue.concat(list); return; }
      var o = getIO();
      list.forEach(function (el) { o.observe(el); });
    }

    function start() {
      if (started) return;
      started = true;
      var q = queue;
      queue = [];
      observe(q);
    }

    /* ▼ [data-mo-stagger] の展開
         親は .rv-hold を足して「.on を受け取るだけの器」に変える。
         §8（アイコン描画）や §11（接続線）が親の .on を参照しているため、
         親からクラスを外してはいけない。
         ※ .v-scroll 配下の子は CSS §19-3 が transform を打ち消すため、
           横スクロール時はフェードのみになる
           （縦ラッチ防止の overflow-y:hidden が必要なことによる） */
    function expandStagger() {
      var SKIP = { SCRIPT: 1, STYLE: 1, LINK: 1, TEMPLATE: 1, NOSCRIPT: 1 };
      each(document.querySelectorAll("[data-mo-stagger]"), function (box) {
        if (box.dataset.moDone === "1") return;
        box.dataset.moDone = "1";

        var v = box.getAttribute("data-mo-stagger");
        var kids = Array.prototype.filter.call(box.children, function (el) {
          return !SKIP[el.tagName];
        });
        if (!kids.length) return;

        box.classList.add("rv", "rv-hold");
        kids.forEach(function (el, i) {
          el.classList.add("rv");
          if (v) el.classList.add("rv-" + v);
          /* 6で折り返す。項目数が多い列で遅延が伸び続けるのを防ぐ */
          el.style.setProperty("--i", i % 6);
        });
        observe(kids);
      });
    }

    CFI.reveal = observe;

    /* 展開 → 初期分を登録（この時点では監視を始めない） */
    expandStagger();
    observe(document.querySelectorAll(".rv"));

    /* クローク解除の両経路（cfi-boot-out 経由 / cfi-boot 直接除去）を拾う */
    function ready() {
      if (!html.classList.contains("cfi-boot")) return true;
      return START_ON_FADE && html.classList.contains("cfi-boot-out");
    }

    if (INSTANT) {
      start();
    } else if (ready()) {
      setTimeout(start, LEAD);
    } else if (typeof MutationObserver === "function") {
      var mo = new MutationObserver(function () {
        if (!ready()) return;
        mo.disconnect();
        setTimeout(start, LEAD);
      });
      mo.observe(html, { attributes: true, attributeFilter: ["class"] });
      /* 保険：HEAD側の3.5秒解除より後に必ず開始 */
      setTimeout(function () { mo.disconnect(); start(); }, 4200);
    } else {
      setTimeout(start, 800);
    }
  })();

  /* ------------------------------------------------------------
     9. FAQ：開閉の高さアニメーション
        ・details/summary の意味論は保持（open 属性を自分で操作する）
        ・height:auto の補間は Safari／Firefox 未対応（interpolate-size）
          のため、実測値をJSから与える方式を採る
        ・JS無効時・動きを減らす設定では素の開閉に戻る
        ・キーボードの Enter / Space も click として届くため同経路
        ・開閉による文書高の変化は initScroll の ResizeObserver が拾う
     ------------------------------------------------------------ */
  (function initFaq() {
    var items = document.querySelectorAll(".faq details");
    if (!items.length) return;

    each(items, function (d) {
      var sum = d.querySelector("summary");
      var body = d.querySelector(".a");
      if (!sum || !body) return;

      var busy = false;

      sum.addEventListener("click", function (e) {
        if (rm.matches) return;                  /* 既定動作にまかせる */
        if (busy) { e.preventDefault(); return; }
        e.preventDefault();
        busy = true;

        var closing = d.open;
        if (!closing) d.open = true;             /* 開く前に高さを測るため */

        /* 下パディングはブレークポイントで変わるので毎回実測する */
        var pb = getComputedStyle(body).paddingBottom;
        var h = body.scrollHeight;

        body.classList.add("mo-a");
        body.style.height = closing ? h + "px" : "0px";
        body.style.paddingBottom = closing ? pb : "0px";

        /* 初期値を確定させてから目標値へ。2フレーム待つのは
           同一フレーム内の style 変更が結合されるのを避けるため */
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            body.style.height = closing ? "0px" : h + "px";
            body.style.paddingBottom = closing ? "0px" : pb;
          });
        });

        var done = false;
        function finish() {
          if (done) return;
          done = true;
          body.removeEventListener("transitionend", onEnd);
          body.classList.remove("mo-a");
          body.style.height = "";
          body.style.paddingBottom = "";
          if (closing) d.open = false;
          busy = false;
          if (typeof CFI.remeasure === "function") CFI.remeasure();
        }
        function onEnd(ev) {
          if (ev.target === body && ev.propertyName === "height") finish();
        }
        body.addEventListener("transitionend", onEnd);
        setTimeout(finish, 600);                 /* 保険 */
      });
    });
  })();

  /* ------------------------------------------------------------
     10. ヒーロー背景A：ノードネットワーク＋アパーチャー（#heroCv）
         ※ #heroFx（SILK＝§11）とは排他。同一ページに両方の canvas を
           置かないこと。置くと rAF が二重に走り、pointermove も二重登録される
         ▼ スクロール負荷対策。以下2点を戻さないこと
           ・リンク判定の距離比較は二乗のまま行う。総当たり最大
             72*71/2 = 2,556 組ぶんの平方根が毎フレーム走るため、
             Math.hypot を内側ループで呼ばない
           ・狭い画面では DPR 上限とノード数を引き下げる
     ------------------------------------------------------------ */
  (function initHeroCanvas() {
    var cv = document.getElementById("heroCv");
    var hero = document.querySelector(".hero");
    if (!cv || !hero || typeof cv.getContext !== "function") return;

    var g = cv.getContext("2d", { alpha: true });
    if (!g) return;

    var TAU = Math.PI * 2;
    var W = 0, H = 0, DPR = 1, nodes = [], raf = null, visible = true, rzTimer = null;

    /* ▼ ポインタ追従（マウス環境のみ。タッチでは追従させない） */
    var HOVER = matchMedia("(hover:hover) and (pointer:fine)");
    var pt = { x: 0, y: 0, on: false };
    var pulses = [], lastSpawn = 0;

    if (HOVER.matches) {
      hero.addEventListener("pointermove", function (e) {
        var r = cv.getBoundingClientRect();
        pt.x = e.clientX - r.left;
        pt.y = e.clientY - r.top;
        pt.on = true;
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { pt.on = false; });
    }

    /* 再現性のある擬似乱数（線形合同法）。静止画を毎回同じ絵にするため */
    function seeded(seed) {
      var v = seed % 2147483647;
      if (v <= 0) v += 2147483646;
      return function () {
        v = (v * 16807) % 2147483647;
        return (v - 1) / 2147483646;
      };
    }

    function build() {
      var rnd = seeded(20160202);
      /* 画面が小さいほどノードを減らしてモバイルの負荷を抑える。
         リンク描画は O(n^2) なので、ここの上限が効き幅として最も大きい */
      var narrow = W < 768;
      var cap = narrow ? 40 : 72;
      var div = narrow ? 30000 : 22000;
      var n = Math.round(Math.min(cap, Math.max(18, (W * H) / div)));
      nodes = Array.from({ length: n }, function () {
        return {
          x: rnd() * W,
          y: rnd() * H,
          dx: 0,                          /* 描画用オフセット（追従分） */
          dy: 0,
          vx: (rnd() - 0.5) * 0.22,
          vy: (rnd() - 0.5) * 0.22,
          r: 0.9 + rnd() * 1.9,
          c: rnd() > 0.62 ? "0,194,168" : "15,107,224"
        };
      });
      pulses = [];
    }

    function resize() {
      /* 狭い画面は DPR を 1.5 で頭打ちにする（塗り面積が約44%減る） */
      DPR = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
      var r = cv.getBoundingClientRect();
      W = r.width;
      H = r.height;
      if (!W || !H) return;               /* 非表示時の 0 サイズを回避 */
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    /* アパーチャーマーク（3分割リング） */
    function aperture(cx, cy, R, rot, alpha) {
      var grd = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      grd.addColorStop(0, "rgba(15,107,224," + alpha + ")");
      grd.addColorStop(1, "rgba(0,194,168," + alpha + ")");
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.strokeStyle = grd;
      g.lineWidth = R * 0.2;
      g.lineCap = "round";
      for (var i = 0; i < 3; i++) {
        var s = (i * TAU) / 3;
        g.beginPath();
        g.arc(0, 0, R, s, s + 1.38);
        g.stroke();
      }
      g.restore();
      g.fillStyle = grd;
      g.beginPath();
      g.arc(cx, cy, R * 0.09, 0, TAU);
      g.fill();
    }

    /* animate=false のときは1フレームだけ描いて終了（静止画） */
    function draw(t, animate) {
      g.clearRect(0, 0, W, H);

      /* 狭い画面ではアパーチャーを中央寄り・小さめに配置 */
      var narrow = W < 768;
      var cx = narrow ? W * 0.5 : W * 0.74;
      var cy = narrow ? H * 0.3 : H * 0.46;
      var R0 = Math.min(W, H) * (narrow ? 0.16 : 0.22);

      var LINK = Math.min(150, Math.max(80, W * 0.11));
      var LINK2 = LINK * LINK;          /* 二乗比較用 */

      /* 追加演出（追従・パルス・呼吸）を出してよい状態か */
      var live = animate !== false && !rm.matches;
      var i, j, p;

      /* 静止描画では座標を進めない（毎回同じ絵になる） */
      if (animate !== false) {
        for (i = 0; i < nodes.length; i++) {
          p = nodes[i];
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        }
      }

      /* ▼ カーソルへの引き寄せ。表示位置(dx,dy)だけを補間で動かし、
           離脱時は 0 へ緩やかに戻す。座標本体(x,y)は書き換えない */
      var PR = 190, PR2 = PR * PR;
      for (i = 0; i < nodes.length; i++) {
        p = nodes[i];
        var tx = 0, ty = 0;
        if (live && pt.on) {
          var ax0 = pt.x - p.x, ay0 = pt.y - p.y, d20 = ax0 * ax0 + ay0 * ay0;
          if (d20 < PR2) {
            var f = (1 - d20 / PR2) * 0.18;
            tx = ax0 * f;
            ty = ay0 * f;
          }
        }
        p.dx += (tx - p.dx) * 0.12;
        p.dy += (ty - p.dy) * 0.12;
      }

      /* ノード間の接続線
         ※ 距離は二乗で判定し、閾値内の組だけ平方根を取る。
           Math.hypot を総当たりで呼ばないこと */
      g.lineWidth = 1;
      for (i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        var ax = a.x + a.dx, ay = a.y + a.dy;
        for (j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var bx = b.x + b.dx, by = b.y + b.dy;
          var ux = ax - bx, uy = ay - by;
          var d2 = ux * ux + uy * uy;
          if (d2 > LINK2) continue;
          var d = Math.sqrt(d2);
          g.strokeStyle = "rgba(0,194,168," + (0.16 * (1 - d / LINK)).toFixed(3) + ")";
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
        }
      }

      /* カーソルから近傍ノードへの線 */
      if (live && pt.on) {
        var CR = 150, CR2 = CR * CR;
        for (i = 0; i < nodes.length; i++) {
          p = nodes[i];
          var px = p.x + p.dx, py = p.y + p.dy;
          var cux = pt.x - px, cuy = pt.y - py;
          var cd2 = cux * cux + cuy * cuy;
          if (cd2 > CR2) continue;
          var cd = Math.sqrt(cd2);
          g.strokeStyle = "rgba(15,107,224," + (0.3 * (1 - cd / CR)).toFixed(3) + ")";
          g.beginPath();
          g.moveTo(pt.x, pt.y);
          g.lineTo(px, py);
          g.stroke();
        }
      }

      /* ノード本体 */
      for (i = 0; i < nodes.length; i++) {
        p = nodes[i];
        g.fillStyle = "rgba(" + p.c + ",0.55)";
        g.beginPath();
        g.arc(p.x + p.dx, p.y + p.dy, p.r, 0, TAU);
        g.fill();
      }

      /* ▼ 信号パルス：ランダムな1点から最近傍へ光を走らせる
           （1.5秒に1回のみの探索なので二乗比較のままでよい） */
      if (live && t - lastSpawn > 1500 && nodes.length > 2) {
        lastSpawn = t;
        var si = Math.floor(Math.random() * nodes.length);
        var sa = nodes[si];
        var best = -1, bd2 = Infinity;
        for (j = 0; j < nodes.length; j++) {
          if (j === si) continue;
          var sux = sa.x - nodes[j].x, suy = sa.y - nodes[j].y;
          var sd2 = sux * sux + suy * suy;
          if (sd2 < bd2 && sd2 > 576) { bd2 = sd2; best = j; }   /* 576 = 24^2 */
        }
        var lim = LINK * 1.3;
        if (best >= 0 && bd2 < lim * lim) pulses.push({ a: sa, b: nodes[best], t0: t });
      }
      if (!live) pulses = [];
      for (var k = pulses.length - 1; k >= 0; k--) {
        var q = pulses[k];
        var pr = (t - q.t0) / 1200;
        if (pr >= 1) { pulses.splice(k, 1); continue; }
        var e = pr * pr * (3 - 2 * pr);                 /* smoothstep */
        var qax = q.a.x + q.a.dx, qay = q.a.y + q.a.dy;
        var x = qax + (q.b.x + q.b.dx - qax) * e;
        var y = qay + (q.b.y + q.b.dy - qay) * e;
        var al = Math.sin(pr * Math.PI);                /* 出て消える */
        g.strokeStyle = "rgba(0,194,168," + (0.28 * al).toFixed(3) + ")";
        g.beginPath();
        g.moveTo(qax, qay);
        g.lineTo(x, y);
        g.stroke();
        g.fillStyle = "rgba(0,194,168," + (0.9 * al).toFixed(3) + ")";
        g.beginPath();
        g.arc(x, y, 2.2, 0, TAU);
        g.fill();
      }

      /* 背面グロー */
      var halo = g.createRadialGradient(cx, cy, R0 * 0.2, cx, cy, R0 * 1.9);
      halo.addColorStop(0, "rgba(0,194,168,0.11)");
      halo.addColorStop(0.55, "rgba(15,107,224,0.07)");
      halo.addColorStop(1, "rgba(15,107,224,0)");
      g.fillStyle = halo;
      g.beginPath();
      g.arc(cx, cy, R0 * 1.9, 0, TAU);
      g.fill();

      /* 二重リング：外周はゆっくり逆回転。
         呼吸（±3.5%）とスクロールによる微小ドリフトを加える。
         ※ window.scrollY の読み取りはレイアウトを起こさない（合成済み値） */
      var R = R0 * (live ? 1 + Math.sin(t / 3800) * 0.035 : 1);
      var sy = live ? Math.min(window.scrollY || 0, H) * 0.06 : 0;
      var rot = (t / 26000) * TAU;
      aperture(cx, cy + sy, R * 1.42, -rot * 0.55, 0.16);
      aperture(cx, cy + sy, R, rot, 0.5);

      /* ▼ この分岐を無条件にしないこと。
           動きを減らす設定でもアニメーションが止まらなくなる */
      if (animate === false || rm.matches) {
        raf = null;
        return;
      }
      raf = requestAnimationFrame(draw);
    }

    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
    function still() { stop(); draw(0, false); }
    function start() { if (!raf && visible && !rm.matches) raf = requestAnimationFrame(draw); }
    function render() { rm.matches ? still() : start(); }

    resize();

    /* モバイルのアドレスバー開閉による微小リサイズを間引く */
    addEventListener("resize", function () {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(function () { stop(); resize(); render(); }, 180);
    }, { passive: true });

    addEventListener("orientationchange", function () { stop(); resize(); render(); });

    document.addEventListener("visibilitychange", function () {
      document.hidden ? stop() : render();
    });

    /* 動きを減らす設定が実行中に切り替わった場合も追従 */
    onMQ(rm, render);

    /* ヒーローが画面外なら停止（省電力） */
    if (HAS_IO) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        visible ? render() : stop();
      }, { threshold: 0 }).observe(hero);
    }

    /* 初期描画（動きを減らす設定では静止画1枚） */
    render();
  })();

  /* ------------------------------------------------------------
     11. ヒーロー背景B：SILK（#heroFx／contact が使用）
         ※ #heroCv（§10）とは排他。canvas は id で切り替える
         ※ マスクは common.css §5 の .hfx-cv が担当（セットで扱うこと）
         ・canvas は透明のまま。.hero の背景グラデ（§5）が常に透ける
         ・配色は5点の階調ランプから帯ごとに別位置をサンプリングする。
           ブランド2色を直接置くと色相差40度の段差が加算合成で濁る
     ------------------------------------------------------------ */
  (function initHeroSilk() {
    var cv = document.getElementById("heroFx");
    if (!cv || typeof cv.getContext !== "function") return;
    var hero = (cv.closest && cv.closest(".hero")) || cv.parentNode;
    var g = cv.getContext("2d", { alpha: true });
    if (!g || !hero) return;

    var HOVER = matchMedia("(hover:hover) and (pointer:fine)");

    /* ============================================================
       調整ダイヤル
       ============================================================ */
    /* PALETTE  'deep'（既定・重厚）/ 'brand'（ブランド2色に忠実）
                / 'aurora'（淡アクア強め・明るい） */
    var PALETTE = "deep";

    var AMP   = 0.18;   /* 振幅（画面高比）。0.24 まで上げると相当に暴れる   */
    var RATE  = 1.0;    /* 時間の進み。1.6 あたりから「速い」と感じ始める     */
    var BANDS = 6;      /* 帯の本数（PC）。塗り面積は本数にほぼ比例する       */
    var ALPHA = 0.115;  /* 帯の基準濃度。上げすぎると重なりが白飛びする       */
    var SHEEN = 0.09;   /* 上縁の艶。0 で無効                                 */
    var GLOW  = 0.10;   /* 交差部を底上げするベール。0 で無効                 */

    /* ▼ 配色ランプ
         ・端から端まで色相が単調に進むよう並べること。
           順序を入れ替えると帯の途中で色が折り返し、段差になる
         ・中間シアン（3点目）が blue→teal の継ぎ目を埋める要。
           これを抜くと濁りが再発する */
    var PALETTES = {
      deep: [                /* 深藍 → accent → 中間シアン → accent-2 → 淡アクア */
        [ 16,  58, 132],
        [ 15, 107, 224],
        [  0, 160, 220],
        [  0, 194, 168],
        [126, 236, 216]
      ],
      brand: [               /* ブランド2色に忠実。中間色は最小限 */
        [ 12,  74, 170],
        [ 15, 107, 224],
        [  6, 156, 200],
        [  0, 194, 168],
        [ 92, 216, 198]
      ],
      aurora: [              /* 明るめ。濃色ヒーロー以外へ流用する場合向け */
        [ 34,  92, 190],
        [ 28, 132, 236],
        [  0, 182, 226],
        [ 26, 214, 186],
        [162, 246, 228]
      ]
    };
    var RAMP = PALETTES[PALETTE] || PALETTES.deep;

    /* ランプ上の位置 p(0..1) から色を線形補間で取り出す */
    function ramp(p) {
      p = p < 0 ? 0 : (p > 1 ? 1 : p);
      var x = p * (RAMP.length - 1);
      var i = Math.min(Math.floor(x), RAMP.length - 2);
      var f = x - i, a = RAMP[i], b = RAMP[i + 1];
      return [ (a[0] + (b[0] - a[0]) * f) | 0,
               (a[1] + (b[1] - a[1]) * f) | 0,
               (a[2] + (b[2] - a[2]) * f) | 0 ];
    }
    function rgba(c, a) {
      return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")";
    }

    var SEG = 18;                                   /* 帯1本あたりの頂点数 */
    var W = 0, H = 0, DPR = 1, rb = [], raf = null, vis = true, rzT = null;
    var pt = { x: .5, y: .5, tx: .5, ty: .5, on: false };

    if (HOVER.matches) {
      hero.addEventListener("pointermove", function (e) {
        var r = cv.getBoundingClientRect();
        pt.tx = (e.clientX - r.left) / (r.width  || 1);
        pt.ty = (e.clientY - r.top ) / (r.height || 1);
        pt.on = true;
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { pt.on = false; });
    }

    /* ▼ 帯の生成。グラデーションと頂点バッファはここで一度だけ作る。
         毎フレーム createLinearGradient を呼ぶとGCが跳ねる */
    function build() {
      var narrow = W < 768;
      var n = narrow ? 4 : BANDS;
      var N = SEG + 1;
      rb = [];

      for (var i = 0; i < n; i++) {
        var u = n > 1 ? i / (n - 1) : .5;           /* 0=上 1=下 */

        /* ▼ 帯ごとにランプ上の位置をずらす。
             上の帯＝深藍寄り、下の帯＝ティール寄りになり、
             ヒーロー全体に縦方向の色相グラデーションが生まれる */
        var h  = 0.06 + u * 0.70;
        var cL = ramp(h - 0.14);                    /* 左端 */
        var cM = ramp(h + 0.04);                    /* 中央 */
        var cR = ramp(h + 0.22);                    /* 右端 */
        var a  = ALPHA * (0.80 + u * 0.35);

        /* 横方向にも色相を進める。左右で表情が変わり、平板にならない */
        var grd = g.createLinearGradient(-W * 0.12, 0, W * 1.12, 0);
        grd.addColorStop(0.00, rgba(cL, 0));
        grd.addColorStop(0.18, rgba(cL, a * 0.72));
        grd.addColorStop(0.50, rgba(cM, a));
        grd.addColorStop(0.82, rgba(cR, a * 0.58));
        grd.addColorStop(1.00, rgba(cR, 0));

        rb.push({
          base: H * (0.16 + u * 0.62),              /* 定位置 */
          a1: H * AMP * (0.55 + 0.45 * ((i * 0.37) % 1)),  /* 乱数を使わず再現性を持たせる */
          a2: H * AMP * 0.34,
          k1: 1.1 + u * 0.9,                        /* 横方向の波数 */
          k2: 2.4 + u * 1.6,
          s1: (0.06 + u * 0.05) * RATE,             /* 位相速度。小さいほど優雅 */
          s2: (0.09 - u * 0.03) * RATE,
          ph: u * 4.1,
          th: H * (0.05 + 0.055 * (1 - u)),         /* 帯の厚み */
          tilt: (u - 0.5) * H * 0.22,               /* 傾き。平行を避けて動きを出す */
          grad: grd,
          sheen: rgba(ramp(Math.min(h + 0.30, 1)), SHEEN * (0.55 + u * 0.45)),
          top: new Float32Array(N * 2),             /* 頂点バッファ（使い回す） */
          bot: new Float32Array(N * 2)
        });
      }
    }

    function resize() {
      DPR = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
      var r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;                         /* 非表示時の 0 サイズを回避 */
      cv.width  = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    /* ▼ 点列を二次ベジェで結ぶ（中点をアンカーにする定番手法）。
         上辺と下辺は必ず1本の連続パスとして繋ぐこと。
         下辺の描き始めに moveTo を使うと新しいサブパスが立ち、
         closePath が上下を閉じないまま塗りに回る
         rev  … true で配列を逆順に辿る（下辺の復路用）
         first… true なら moveTo、false なら lineTo で開始する */
    function curveArr(arr, n, first, rev) {
      var s = rev ? n - 1 : 0, d = rev ? -1 : 1, k, i0, i1, mx, my;
      i0 = s * 2;
      if (first) g.moveTo(arr[i0], arr[i0 + 1]);
      else       g.lineTo(arr[i0], arr[i0 + 1]);
      for (k = 1; k < n - 1; k++) {
        i0 = (s + d * k) * 2;
        i1 = (s + d * (k + 1)) * 2;
        mx = (arr[i0] + arr[i1]) * 0.5;
        my = (arr[i0 + 1] + arr[i1 + 1]) * 0.5;
        g.quadraticCurveTo(arr[i0], arr[i0 + 1], mx, my);
      }
      i0 = (s + d * (n - 1)) * 2;
      g.lineTo(arr[i0], arr[i0 + 1]);
    }

    function band(r, T, warp) {
      var N = SEG + 1, x0 = -W * 0.12, span = W * 1.24, i;
      for (i = 0; i < N; i++) {
        var u = i / SEG;
        var x = x0 + span * u;
        var y = r.base
              + r.tilt * (u - 0.5) * 2
              + r.a1 * Math.sin(u * 6.28318 * r.k1 + T * r.s1 + r.ph)
              + r.a2 * Math.sin(u * 6.28318 * r.k2 - T * r.s2)
              + warp * Math.sin(u * 6.28318 + r.ph);          /* ポインタによる歪み */
        var th = r.th * (0.55 + 0.45 * Math.sin(u * 6.28318 * 1.7 + T * r.s2 * 1.3 + r.ph));
        r.top[i * 2] = x; r.top[i * 2 + 1] = y;
        r.bot[i * 2] = x; r.bot[i * 2 + 1] = y + th;
      }

      /* 本体（上辺 → 下辺の復路 → 閉じる。単一サブパス） */
      g.beginPath();
      curveArr(r.top, N, true,  false);
      curveArr(r.bot, N, false, true);
      g.closePath();
      g.fillStyle = r.grad;
      g.fill();

      /* 上縁の艶。光が布の稜線を走る表現 */
      if (SHEEN > 0) {
        g.beginPath();
        curveArr(r.top, N, true, false);
        g.strokeStyle = r.sheen;
        g.lineWidth = 1;
        g.stroke();
      }
    }

    function draw(t) {
      var live = !rm.matches;
      var T = live ? t / 1000 : 0;

      /* ポインタ追従は慣性付き。値を直に入れると帯が痙攣する */
      pt.x += ((pt.on ? pt.tx : .5) - pt.x) * 0.045;
      pt.y += ((pt.on ? pt.ty : .5) - pt.y) * 0.045;
      var warp = live ? (pt.y - 0.5) * H * 0.20 : 0;

      g.clearRect(0, 0, W, H);

      /* 加算合成。帯が重なった部分だけが光る＝交差が主役になる */
      g.globalCompositeOperation = "lighter";
      g.lineCap  = "round";
      g.lineJoin = "round";
      for (var i = 0; i < rb.length; i++) band(rb[i], T, warp);

      /* 交差の輝きを底上げする薄いベール。色はランプ中央から取り、
         帯と同じ色系に収める（別色を置くと途端に安っぽくなる） */
      if (GLOW > 0) {
        var cx = W * (0.30 + pt.x * 0.40);
        var cy = H * (0.30 + pt.y * 0.30);
        var v  = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.62);
        v.addColorStop(0.0, rgba(ramp(0.64), GLOW));
        v.addColorStop(0.55, rgba(ramp(0.30), GLOW * 0.38));
        v.addColorStop(1.0, rgba(ramp(0.10), 0));
        g.fillStyle = v;
        g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = "source-over";

      if (!live) { raf = null; return; }             /* 動きを減らす設定＝静止1枚 */
      raf = requestAnimationFrame(draw);
    }

    function stop()   { if (raf) { cancelAnimationFrame(raf); raf = null; } }
    function start()  { if (!raf && vis) raf = requestAnimationFrame(draw); }
    function render() { if (rm.matches) { stop(); draw(0); } else start(); }

    resize(); render();

    /* モバイルのアドレスバー開閉による微小リサイズを間引く */
    addEventListener("resize", function () {
      clearTimeout(rzT);
      rzT = setTimeout(function () { stop(); resize(); render(); }, 180);
    }, { passive: true });

    addEventListener("orientationchange", function () { stop(); resize(); render(); });

    document.addEventListener("visibilitychange", function () {
      document.hidden ? stop() : render();
    });

    /* ヒーローが画面外なら停止（省電力。§10 と同じ方針） */
    if (HAS_IO) {
      new IntersectionObserver(function (es) {
        vis = es[0].isIntersecting; vis ? render() : stop();
      }, { threshold: 0 }).observe(hero);
    }

    /* 設定が実行中に切り替わった場合も追従 */
    onMQ(rm, render);
  })();

  /* ------------------------------------------------------------
     12. contact：STUDIOラッパーの縦余白を打ち消す（黒帯対策）
         ※ ここが唯一の正。common.css 側に first-child / last-child の
           margin 打ち消しを重ねて書かないこと（二重管理になる）
         ※ 間隔は common.css §22 の --cfi-gap-top / --cfi-gap-bottom で調整する
     ------------------------------------------------------------ */
  (function initStudioFrame() {
    if (PAGE !== "contact") return;

    function trim() {
      var nuxt = document.getElementById("__nuxt");
      if (!nuxt) return;
      var kids = nuxt.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        var cs = getComputedStyle(el);
        if (parseFloat(cs.paddingTop)    > 0) el.style.paddingTop    = "0px";
        if (parseFloat(cs.paddingBottom) > 0) el.style.paddingBottom = "0px";
        if (parseFloat(cs.marginTop)     > 0) el.style.marginTop     = "0px";
        if (parseFloat(cs.marginBottom)  > 0) el.style.marginBottom  = "0px";
        if (cs.minHeight !== "0px" && cs.minHeight !== "auto") el.style.minHeight = "0px";
      }
    }

    /* フォームは非同期マウントのため、最長6秒のあいだ様子を見る */
    var n = 0, t = setInterval(function () {
      trim();
      if (++n > 20) clearInterval(t);
    }, 300);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", trim);
    } else {
      trim();
    }
    addEventListener("load", trim);
  })();

  /* ------------------------------------------------------------
     13. contact：STUDIOフォームにリビール演出を付与
         ・STUDIOはラッパーを一枚ずつ入れ子にするため、
           「子が2つ以上に分岐した最初の階層」をリビール単位とみなす
         ・遅延はCSS(§19)が --i から算出するため、ここでは番号だけ渡す
         ・STUDIOの生成クラスには依存しない。構造が変わっても壊れない
     ------------------------------------------------------------ */
  (function initFormReveal() {
    if (PAGE !== "contact") return;
    if (rm.matches || !HAS_IO) return;   /* 動きを減らす設定では素の表示 */

    var SKIP = { SCRIPT: 1, STYLE: 1, LINK: 1, NOSCRIPT: 1, TEMPLATE: 1 };
    var MAX_UNITS = 8;   /* これを超える分割はまとめて1枚として出す */

    function pickTargets(root) {
      var node = root, guard = 0;
      while (node && guard++ < 10) {
        var kids = Array.prototype.filter.call(node.children, function (el) {
          return !SKIP[el.tagName] && el.getBoundingClientRect().height > 0;
        });
        if (!kids.length)            return node === root ? [] : [node];
        if (kids.length === 1)       { node = kids[0]; continue; }
        if (kids.length > MAX_UNITS) return [node];
        return kids;
      }
      return [node];
    }

    function apply() {
      var nuxt = document.getElementById("__nuxt");
      if (!nuxt || nuxt.dataset.cfiRv === "1") return false;
      var targets = pickTargets(nuxt);
      if (!targets.length) return false;

      nuxt.dataset.cfiRv = "1";
      targets.forEach(function (el, i) {
        el.classList.add("rv");
        el.style.setProperty("--i", i);
      });

      if (typeof CFI.reveal === "function") CFI.reveal(targets);
      else targets.forEach(function (el) { el.classList.add("on"); });
      return true;
    }

    /* フォームは非同期マウントのため最長2秒ポーリング */
    var n = 0, t = setInterval(function () {
      if (apply() || ++n > 40) clearInterval(t);
    }, 50);

    /* 最終保険：5秒経っても .on が付かない要素は強制表示 */
    setTimeout(function () {
      var nuxt = document.getElementById("__nuxt");
      if (!nuxt) return;
      each(nuxt.querySelectorAll(".rv"), function (el) { el.classList.add("on"); });
    }, 5000);
  })();

  /* ------------------------------------------------------------
  14. CASES スライダー（.cs-slider / .cs-rail）
      ・器・幅・強調の見た目は common.css §15-2 が唯一の正。JSは「送り幅」
        「中央のカード」「必要な複製数」を実測から求めるだけで、同時表示枚数
        （--cs-view）を知らない
      ・window スクロールは購読しない（§6 の1本のみという原則を守る）

      ■ 位置の数え方（ここを取り違えると主役が1枚ずれる）
      ・idx は「左端に来るカードのDOM番号」。主役（中央）は idx + coff。
        coff は左端から中央までの枚数差で、表示幅とカード幅の実測から出す
        （3枚表示なら1、2枚・1枚表示なら0）
      ・したがって「実カード r を主役にする」ときの idx は
        sets*N + r − coff。符号を逆にすると主役が隣のカードになる
      ・coff と center() は同じ ε で左へ倒す。2枚表示のようにちょうど .5 に
        なる配置で判定が振れるのを防ぐため、片方だけ丸め方を変えないこと

      ■ 無限ループの仕組み
      ・実カードの前後に同じ並びを複製し、1周期（実カード枚数ぶん）進んだら
        scrollLeft を瞬間的に巻き戻す。内容が周期的なので見た目は変化しない
      ・したがって複製カードは実カードと「完全に同一の見た目」でなければ
        ならない。common.css 側で :first-child / :last-child / :nth-child を
        使った装飾を .cs-rail > .case に足さないこと（巻き戻しの瞬間に絵が飛ぶ）
      ・巻き戻しはスムーススクロール中と指が触れている間は行わない。
        scrollLeft への代入はスムーススクロールを打ち切るため、
        アニメーション中に走らせるとカードが中途半端な位置で止まる
      ・ホイール／キー操作は慣性が無いため、区間を越えた時点で即時に巻き戻す
      ・data-cs-loop="0" の場合は複製せず、従来どおりの端止めになる
      ・複製は §8 の監視外。実カードと同時に出すため、セクションが画面に
        入った時点で .on を付ける（生成時に付けると減光側だけが先に出る）

      ■ 左右カードのクリック送り
      ・送り量は「クリックされたDOM番号 − いま中央のDOM番号」。idx や coff を
        再計算しないため、複製カードを押しても正しい向きに動く
      ・押下時の scrollLeft と比較し、動いていたらクリックとして扱わない。
        ドラッグ直後に click が飛ぶ環境があるためこの判定を外さないこと
      ・カードは tabindex を持たない。キーボード経路は rail の
        ArrowLeft / ArrowRight が担う（二重フォーカスを作らない）
  ------------------------------------------------------------ */
  (function initCarousel() {
    each(document.querySelectorAll(".cs-slider"), function (box) {
      var rail = box.querySelector(".cs-rail");
      if (!rail || rail.children.length < 2) return;

      var prev = box.querySelector("[data-cs-prev]");
      var next = box.querySelector("[data-cs-next]");

      /* ▼▼ 調整ダイヤル ▼▼
         INTERVAL         … 自動送り間隔(ms)。HTMLの data-cs-interval が優先
         LOOP             … 無限ループ。data-cs-loop="0" で端止め
         STOP_ON_INTERACT … 操作後に自動送りを恒久停止する（既定 true）
         START_AT         … 初期表示で主役にする実カード番号（0 = 1枚目）
         START_CENTERED   … true  : START_AT を中央に置く（＝1枚目が主役）
                             false : START_AT を左端に置く（3枚表示では
                                     中央に来る2枚目が主役になる）
         CLICK_TO_CENTER  … 左右のカードをクリックして中央へ送る
         DRAG_PX          … この距離を越えて動いたらドラッグと判定(px) */
      var INTERVAL = Math.max(2500, parseInt(box.getAttribute("data-cs-interval"), 10) || 5000);
      var LOOP = box.getAttribute("data-cs-loop") !== "0";
      var STOP_ON_INTERACT = true;
      var START_AT = 0;
      var START_CENTERED = true;
      var CLICK_TO_CENTER = true;
      var DRAG_PX = 8;
      /* ▲▲ 調整はここまで ▲▲ */

      var ACTIVE = "is-cs-active";
      var real = Array.prototype.slice.call(rail.children);  /* 実カード（複製前） */
      var N = real.length;

      var sets = 0;            /* 片側の複製セット数（0＝複製なし＝端止め動作） */
      var idx = 0;             /* 左端に来るカードのDOM番号（送りの意図） */
      var act = -1;            /* 現在強調しているDOM番号 */
      var timer = null, hold = false, vis = false, opened = false;
      var dead = rm.matches, ticking = false, rzT = null, idleT = null;
      var down = false;        /* 指が触れている */
      var touched = false;     /* 触って以降＝慣性が残る可能性がある */
      var animAt = 0;          /* スムーススクロール開始時刻 */
      var downX = 0;           /* クリック／ドラッグ判定用の押下座標 */
      var downSL = 0;          /* 同：押下時の scrollLeft */
      var dragged = false;     /* 押下後に動いた＝クリックとして扱わない */

      /* ---- 実測。送り幅は2枚目との左端差から取るため gap を参照しない ---- */
      function geo() {
        var a = rail.children[0], b = rail.children[1];
        if (!a) return { w: 1, st: 1 };
        var ra = a.getBoundingClientRect();
        var w = ra.width > 1 ? ra.width : 1;
        var st = w;
        if (b) {
          var d = b.getBoundingClientRect().left - ra.left;
          if (d > 1) st = d;
        }
        return { w: w, st: st };
      }
      function span() { return Math.max(0, rail.scrollWidth - rail.clientWidth); }
      function last(g) { return Math.max(0, Math.round(span() / (g || geo()).st)); }

      /* 左端から中央までの枚数差。center() と同じ ε で左へ倒すこと */
      function coff(g) {
        if (!START_CENTERED) return 0;
        return Math.floor((rail.clientWidth - g.w) / 2 / g.st + 0.5 - 1e-6);
      }
      /* 表示領域の中心にいちばん近いDOM番号（--cs-view を見ない） */
      function center(g) {
        var n = rail.children.length;
        var c = rail.scrollLeft + rail.clientWidth / 2;
        var i = Math.floor((c - g.w / 2) / g.st + 0.5 - 1e-6);
        return i < 0 ? 0 : (i > n - 1 ? n - 1 : i);
      }
      /* いま主役になっている実カード番号（0..N-1）。複製分を折り返して求める */
      function real0() {
        var i = center(geo()) - sets * N;
        return ((i % N) + N) % N;
      }

      /* ---- 複製（前後同数）。必要数は実測から出すので枚数変更に追従する ---- */
      function dup(el) {
        var c = el.cloneNode(true);
        c.dataset.csClone = "1";
        c.classList.remove(ACTIVE);
        c.removeAttribute("id");
        c.setAttribute("aria-hidden", "true");  /* 読み上げに二重で載せない */
        /* 将来カード内にリンク等を足した場合の保険（複製側を焦点から外す） */
        each(c.querySelectorAll("a,button,input,select,textarea,[tabindex]"),
          function (f) { f.setAttribute("tabindex", "-1"); });
        return c;
      }
      /* 複製を実カードと同じタイミングで開く（§8 の監視外のため自前で行う） */
      function openClones() {
        opened = true;
        each(rail.querySelectorAll("[data-cs-clone]"), function (el) {
          el.classList.add("on");
        });
      }
      function mount() {
        if (!LOOP || N < 2) return false;
        var g = geo();
        if (g.st <= 1) return false;            /* 幅が測れない（非表示中など） */
        /* 片側に「1画面＋1枚」以上を確保する。これがレール端に当たらない条件 */
        var need = Math.max(1, Math.ceil((rail.clientWidth + g.st) / (N * g.st)));
        if (need <= sets) return false;
        var head = document.createDocumentFragment();
        var tail = document.createDocumentFragment();
        for (var s = sets; s < need; s++) {
          real.forEach(function (el) {
            head.appendChild(dup(el));
            tail.appendChild(dup(el));
          });
        }
        rail.insertBefore(head, rail.firstChild);
        rail.appendChild(tail);
        sets = need;
        if (opened) openClones();               /* 後から足した分も開く */
        return true;
      }

      /* ---- 書き込み。付け替えは変化したときだけ ---- */
      function paint(i) {
        if (!rail.classList.contains("cs-ready")) rail.classList.add("cs-ready");
        if (i === act) return;
        act = i;
        each(rail.children, function (el, k) { el.classList.toggle(ACTIVE, k === i); });
      }
      function sync(g) {
        if (LOOP || !prev || !next) return;     /* ループ中は常に押せる */
        var mx = last(g);
        prev.disabled = idx <= 0;
        next.disabled = idx >= mx;
      }

      /* ---- 中央セットへの巻き戻し（1周期ぶん＝見た目は完全に同じ） ----
         idx を [base, base+N) に保つ。base を coff ぶんずらしておかないと
         初期位置がいきなり区間外になり、無用な巻き戻しが1回走る */
      function normalize() {
        if (!sets) return;
        var g = geo();
        var base = sets * N - coff(g);
        var k = Math.floor((idx - base) / N);
        if (!k) return;
        idx -= k * N;
        rail.scrollLeft = rail.scrollLeft - k * N * g.st;
      }
      /* 実カード r を主役にして即時アンカー（初期化・リサイズ・複製追加後）。
         複製が無い（data-cs-loop="0"）場合は端でクランプされるため、
         3枚表示では左端が0のまま＝2枚目が主役になる */
      function anchor(r) {
        var g = geo();
        r = ((r % N) + N) % N;
        idx = sets * N + r - coff(g);
        var mx = last(g);
        if (idx < 0) idx = 0;
        if (idx > mx) idx = mx;
        var left = Math.min(idx * g.st, span());
        try { rail.scrollTo({ left: left, behavior: "auto" }); }
        catch (e) { rail.scrollLeft = left; }
        sync(g);
        paint(center(geo()));
      }

      /* 読み取り → 書き込みの順を崩さないこと（強制同期レイアウト対策） */
      function update() {
        var g = geo();
        idx = Math.round(rail.scrollLeft / g.st);
        var i = center(g);
        sync(g);
        paint(i);
      }
      function idle() {
        clearTimeout(idleT);
        idleT = setTimeout(function () {
          if (down) return;                     /* 指が乗っている間は触らない */
          touched = false;
          normalize();
        }, 160);
      }

      function go(i, smooth) {
        var g = geo();
        if (sets) {
          var d = i - idx;                      /* 送り量を保ったまま中央へ戻す */
          normalize();
          i = idx + d;
        } else if (LOOP) {
          var mw = last(g);                     /* 複製に失敗した場合の保険 */
          i = i < 0 ? mw : (i > mw ? 0 : i);
        } else {
          var mx = last(g);
          i = i < 0 ? 0 : (i > mx ? mx : i);
        }
        idx = i;
        var left = Math.min(Math.max(i * g.st, 0), span());
        var mode = (smooth === false || rm.matches) ? "auto" : "smooth";
        animAt = mode === "smooth" ? Date.now() : 0;
        try { rail.scrollTo({ left: left, behavior: mode }); }
        catch (e) { rail.scrollLeft = left; }   /* 古いSafari等の保険 */
        sync(g);
        if (mode === "auto") paint(center(geo()));  /* scroll が1回しか出ない経路 */
      }

      function play() {
        if (timer || dead) return;
        timer = setInterval(function () {
          if (dead || hold || !vis || document.hidden) return;
          go(idx + 1);
        }, INTERVAL);
      }
      function halt() { if (timer) { clearInterval(timer); timer = null; } }
      function kill() { dead = true; halt(); }

      if (prev) prev.addEventListener("click", function () {
        if (STOP_ON_INTERACT) kill();
        go(idx - 1);
      });
      if (next) next.addEventListener("click", function () {
        if (STOP_ON_INTERACT) kill();
        go(idx + 1);
      });

      rail.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();                     /* 1枚単位に揃える */
        if (STOP_ON_INTERACT) kill();
        go(idx + (e.key === "ArrowRight" ? 1 : -1));
      });

      /* ▼ 押下時に座標と位置を控える。下の click 判定がこれを使う。
           pointerdown と touchstart を1つのループにまとめないこと
           （座標が要るのは pointerdown だけ。TouchEvent には clientX が
             直接無く、touches[0] を辿る必要があるため経路を分ける） */
      rail.addEventListener("pointerdown", function (e) {
        down = true; touched = true; dragged = false;
        downX = e.clientX;
        downSL = rail.scrollLeft;
        if (STOP_ON_INTERACT) kill();
      }, { passive: true });

      rail.addEventListener("touchstart", function () {
        down = true; touched = true;
        if (STOP_ON_INTERACT) kill();
      }, { passive: true });

      /* 横に動いた時点でドラッグと確定する。
         touch でスクロールが始まると pointercancel が飛ぶ環境があるため両方拾う */
      rail.addEventListener("pointermove", function (e) {
        if (!down || dragged) return;
        if (Math.abs(e.clientX - downX) > DRAG_PX) dragged = true;
      }, { passive: true });
      rail.addEventListener("pointercancel", function () { dragged = true; });

      each(["pointerup", "touchend", "touchcancel"], function (ev) {
        addEventListener(ev, function () { down = false; idle(); }, { passive: true });
      });
      rail.addEventListener("wheel", function () {
        if (STOP_ON_INTERACT) kill();
      }, { passive: true });

      /* ▼ 左右のカードをクリックして中央へ送る
           ・カード内の操作要素（将来リンクを足した場合）は対象外。
             除外リストは common.css §15-2 のコメントと揃えること */
      if (CLICK_TO_CENTER) {
        rail.addEventListener("click", function (e) {
          if (dragged) return;
          if (Math.abs(rail.scrollLeft - downSL) > 4) return;
          var t = e.target;
          if (!t || typeof t.closest !== "function") return;
          if (t.closest("a,button,input,select,textarea,summary,[tabindex]")) return;

          var card = t.closest(".case");
          if (!card || card.parentNode !== rail) return;

          var g = geo();
          var c = center(g);
          var i = Array.prototype.indexOf.call(rail.children, card);
          if (i < 0 || i === c) return;         /* 中央のカードは動かさない */

          if (STOP_ON_INTERACT) kill();
          go(idx + (i - c));
        });
      }

      /* 読んでいる間は送らない */
      box.addEventListener("mouseenter", function () { hold = true; });
      box.addEventListener("mouseleave", function () { hold = false; });
      box.addEventListener("focusin",  function () { hold = true; });
      box.addEventListener("focusout", function () { hold = false; });

      /* 手動スワイプ後の位置と強調を取り込む（rAF で1フレーム1回に間引く） */
      rail.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          update();
          /* 慣性もアニメーションも無い操作（ホイール／キー）だけ即時巻き戻す */
          if (sets && !touched && Date.now() - animAt > 700) normalize();
          idle();
        });
      }, { passive: true });

      /* 幅が変われば --cs-view も変わる。主役のカードを保って再整列する */
      addEventListener("resize", function () {
        clearTimeout(rzT);
        rzT = setTimeout(function () {
          if (!sets) { go(Math.min(idx, last()), false); return; }
          var cur = real0();
          mount();
          anchor(cur);
        }, 180);
      }, { passive: true });

      document.addEventListener("visibilitychange", function () {
        document.hidden ? halt() : play();
      });

      onMQ(rm, function (e) { if (e.matches) kill(); });

      /* 画面外では止める（省電力。§10 / §11 と同じ方針） */
      if (HAS_IO) {
        new IntersectionObserver(function (es) {
          vis = es[0].isIntersecting;
          if (vis) openClones();
          vis ? play() : halt();
        }, { threshold: 0.2 }).observe(box);
      } else {
        vis = true;
        openClones();
        play();
      }

      mount();
      anchor(START_AT);
      /* 初期化時に幅が測れなかった場合の再試行（複製が増えたときだけ再整列） */
      addEventListener("load", function () {
        var cur = sets ? real0() : START_AT;
        if (mount()) anchor(cur);
      });
      /* 保険：§8 のフォールバック（4.2秒）より後に必ず複製を開く */
      setTimeout(openClones, 4600);
    });
  })();
})();
