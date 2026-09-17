"use strict";

/* ============================================================
   CFI メインスクリプト（home / contact 共用）
   ────────────────────────────────────────────────────────────
   ■ 触る前に必ず読むこと
   ・ハンバーガー切替点 960px（MQ_DESK）は common.css §23 と必ず一致させること
   ・common.css と対になっている。片方だけ更新しないこと
     §4  → html.cfi-boot / #cfi-boot-ui（common.css §3）
     §6  → .hd-prog の --p / header.hd-up / .hero .wrap の translate
     §8  → .rv に .on ／ nav.mo-ready ／ 各要素の --i
     §9  → .faq .mo-a の実測 height
     §14 → .cs-rail の .cs-ready ／ .case の .is-cs-active（common.css §15-2）
   ・window スクロールの購読は §6 の1本のみ。他所で
     addEventListener('scroll') を増やさないこと（rAF の間引きが効かなくなる）
   ・ページ側HTMLに必要なのは window.CFI_CONFIG の宣言のみ。
     リンク解決・DOM配置・クローク解除はすべてここが担う
   ・起動クロークのタイマー序列は §4 冒頭の一覧が唯一の正。
     数値を変える場合はページHEADの保険（4000）まで含めて同時に見直すこと
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
        ※ #cfi-boot-ui（§4 が生成する進捗UI）は body 直下に居るため、
          伏せる対象から必ず除外すること。外すと幕の上のバーが消える
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
      if (el !== root && el.id !== "cfi-boot-ui" && !SKIP[el.tagName]) {
        el.style.display = "none";
      }
    });
  })();

  /* ------------------------------------------------------------
     4. 起動クローク（最低表示1秒＋進捗バー／％）／リビールのフォールバック
        ■ 触る前に必ず読むこと
        ・幕・バー・％の見た目は common.css §3 が唯一の正。ここは値と解除だけ
        ・MIN_MS の起点は navigation start（performance.now() の 0 点）。
          CSSの幕が出る初回ペイントとのずれは数十msに収まるため無視する
        ・進捗は「実測（サブリソースの完了件数ほか）」と「経過時間による
          下限」の大きい方。単調増加（値を戻さない）／準備完了までは
          CAP を超えさせない
        ・ループは setInterval。requestAnimationFrame は背面タブで停止するため
          戻さないこと（タブを離れている間に幕が上がらなくなる）
        ・タイマーの序列を崩さないこと。数値を変える場合は全部を同時に見直す
            HARD_MS 3000 → 完全解除 約3520
            ページHEADの保険 4000（home_head / contact_head）
            §8 リビール保険 4700 ／ §14 複製オープン保険 5100
            §13 フォーム強制表示 5500
     ------------------------------------------------------------ */
  (function initBoot() {
    /* ▼▼ 調整ダイヤル ▼▼
       MIN_MS   … 幕の最低表示時間
       HOLD_MS  … 100%を見せてから幕を引き始めるまで
       HARD_MS  … 最終保険（強制的に100%→解除）
       OUT_MS   … 幕のフェード。common.css §3 の .28s と対
       CAP      … 準備完了までの上限（100%で足踏みさせないため）
       FAST_NAV … true にすると再読込／戻る進むのときだけ MIN_MS を短縮する
                  （MIN_MS=1000 では差が出ないため既定 false） */
    var MIN_MS   = 1000;
    var HOLD_MS  = 220;
    var HARD_MS  = 3000;
    var OUT_MS   = 300;
    var CAP      = 0.92;
    var FAST_NAV = false;
    /* ▲▲ 調整はここまで ▲▲ */

    var T0 = Date.now();
    function now() {
      return (window.performance && performance.now) ? performance.now() : Date.now() - T0;
    }

    if (FAST_NAV && window.performance && performance.getEntriesByType) {
      var e0 = performance.getEntriesByType("navigation")[0];
      if (e0 && (e0.type === "reload" || e0.type === "back_forward")) MIN_MS = 900;
    }

    var box = null, fill = null, pctEl = null;
    var p = 0, shown = -1, aria = -1;
    var fontsDone = false, loaded = false;
    var studioOK = (PAGE !== "contact");   /* contact はSTUDIOマウントを待つ */
    var readyAt = 0, done = false, loop = null;

    function build() {
      if (box || !document.body) return;
      box = document.createElement("div");
      box.id = "cfi-boot-ui";
      box.setAttribute("role", "progressbar");
      box.setAttribute("aria-label", "読み込み中");
      box.setAttribute("aria-valuemin", "0");
      box.setAttribute("aria-valuemax", "100");
      box.setAttribute("aria-valuenow", "0");
      /* 文言は common.css §3 の --cfi-boot-label が唯一の正。
         .lbl は空要素で、::before がテキストを流し込む（JSに文言を持たせない）。
         .meter でバーと％を包むのは、親の gap（文言用）と分けるため */
      box.innerHTML =
        '<span class="lbl" aria-hidden="true"></span>' +
        '<span class="meter"><span class="bar"><i></i></span>' +
        '<span class="pct">0%</span></span>';
      document.body.appendChild(box);
      fill = box.querySelector("i");
      pctEl = box.querySelector(".pct");
      /* フェイルセーフ側の文言（body::after）を伏せる。
         この1行と drop() の remove は必ず対で扱うこと（外すと文言が二重になる） */
      html.classList.add("cfi-boot-ui");
    }
    function drop() {
      if (box && box.parentNode) box.parentNode.removeChild(box);
      box = fill = pctEl = null;
      html.classList.remove("cfi-boot-ui");
    }

    /* ---- 実測：サブリソースの完了件数で進捗を作る ----
       ■ 触る前に必ず読むこと
       ・バイト数では数えない。transferSize / encodedBodySize は
         cross-origin では 0 を返す（Timing-Allow-Origin が必要）。
         assets は cfi-dev.github.io 配信で、GitHub Pages は
         レスポンスヘッダを追加できないため恒久的に 0 になる
       ・Resource Timing に載るのは「完了した分」だけ。未完了は列挙されない
         ため、分母は expected() がDOMから推定する
       ・分母にフォントを入れないこと。Google Fonts の Noto Sans JP は
         unicode-range で数十個の @font-face に分割されており、
         document.fonts.size を足すと分母が跳ねて％が張り付く。
         フォントは fonts.ready の重み（score() の add(15,…)）だけで見る
       ・遅延読込（loading="lazy"）は画面外＝完了しないため両側で数えない */
    var resN = 0, po = null;

    if (typeof PerformanceObserver === "function") {
      try {
        po = new PerformanceObserver(function (list) {
          resN += list.getEntries().length;
        });
        /* buffered:true で監視開始より前に完了した分も拾う */
        po.observe({ type: "resource", buffered: true });
      } catch (err) { po = null; }
    }
    function unhook() {
      if (po) { po.disconnect(); po = null; }
    }
    function resDone() {
      if (po) return resN;
      /* 非対応環境の代替。バッファ上限で頭打ちになるが単調増加は保たれる */
      if (!window.performance || !performance.getEntriesByType) return 0;
      return performance.getEntriesByType("resource").length;
    }

    /* 分母。DOMに現れた分だけを数えるので、パース進行に伴って増える。
       増加時に％が戻らないのは paint() の単調増加ガードが担保する */
    function expected() {
      var n = document.querySelectorAll('link[rel="stylesheet"],script[src]').length;
      var list = document.images, i;
      for (i = 0; i < list.length; i++) if (list[i].loading !== "lazy") n++;
      return n < 1 ? 1 : n;
    }

    function imgRatio() {
      var list = document.images, n = 0, ok = 0, i;
      for (i = 0; i < list.length; i++) {
        if (list[i].loading === "lazy") continue;
        n++;
        if (list[i].complete) ok++;
      }
      return n ? ok / n : 1;
    }

    /* 加重和。重みは体感の調整値であり、実際の転送量とは一致しない。
       ・res は「把握できている件数のうち何件終わったか」。
         完了数が分母を超える場合（STUDIOのXHR等）は 1 で飽和させる
       ・load と studio の重み（計35〜40）は最後まで 0 のままなので、
         取りこぼしがあっても score が先に 1 へ到達することはない */
    function score() {
      var s = 0, t = 0;
      function add(w, v) { t += w; s += w * (v < 0 ? 0 : (v > 1 ? 1 : v)); }
      var d = resDone();
      add(35, d / Math.max(expected(), d || 1));
      add(10, document.readyState === "loading" ? 0
            : (document.readyState === "interactive" ? 0.6 : 1));
      add(15, fontsDone ? 1 : 0);
      add(20, imgRatio());
      add(20, loaded ? 1 : 0);
      if (PAGE === "contact") add(15, studioOK ? 1 : 0);
      return t ? s / t : 0;
    }
    function ready() { return loaded && studioOK; }

    function paint(v) {
      if (v > 1) v = 1;
      if (v < p) v = p;                 /* 単調増加。戻さないこと */
      p = v;
      if (!box) build();
      if (!box) return;
      var n = Math.round(p * 100);
      if (n === shown) return;
      shown = n;
      fill.style.setProperty("--cfi-boot-p", p.toFixed(4));
      pctEl.textContent = n + "%";
      /* 読み上げの過剰通知を避けて5%刻みで更新する */
      var a = Math.round(n / 5) * 5;
      if (a !== aria) { aria = a; box.setAttribute("aria-valuenow", String(a)); }
    }

    function close() {
      if (done) return;
      done = true;
      if (loop) { clearInterval(loop); loop = null; }
      unhook();
      paint(1);
      setTimeout(function () {
        html.classList.add("cfi-boot-out");
        setTimeout(function () {
          html.classList.remove("cfi-boot", "cfi-boot-out");
          drop();
        }, OUT_MS);
      }, HOLD_MS);
    }

    function tick() {
      if (done) return;
      /* 幕が外（HEADの保険など）から外された場合はUIだけ片付けて降りる */
      if (!html.classList.contains("cfi-boot")) {
        done = true;
        if (loop) { clearInterval(loop); loop = null; }
        unhook();
        drop();
        return;
      }
      var e = now();
      /* ▼ 下限は「止まらないための保険」であって主役ではない。
           score() が実測値を出すので、ここを高く設定すると実測が下限に
           埋もれて「読み込み状況に応じた％」に見えなくなる。
           MIN_MS で 55%、HARD_MS で CAP へ這わせる二段構成。
           一段（MIN_MSで90%）にすると、読み込みが遅い環境で MIN_MS 直後から
           HARD_MS まで CAP のまま静止し「固まった」ように見える。
           MIN_MS / HARD_MS を変えたらこの式も必ず見直すこと */
      var floor = e <= MIN_MS
        ? (e / MIN_MS) * 0.55
        : 0.55 + ((e - MIN_MS) / Math.max(1, HARD_MS - MIN_MS)) * (CAP - 0.55);
      paint(Math.min(Math.max(score(), floor), CAP));
      if (!readyAt && ready()) readyAt = e;
      if (readyAt && e >= MIN_MS) close();
    }

    /* ---- シグナルの配線 ---- */
    if (document.readyState === "complete") loaded = true;
    addEventListener("load", function () { loaded = true; });

    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(
        function () { fontsDone = true; },
        function () { fontsDone = true; }
      );
    } else {
      fontsDone = true;                 /* 非対応環境では待たない */
    }

    if (PAGE === "contact") {
      var waited = 0;
      var poll = setInterval(function () {
        waited += 50;
        var canvas = document.querySelector("#__nuxt .StudioCanvas, #__nuxt .sd");
        if (canvas || waited >= 2000) {
          clearInterval(poll);
          /* STUDIO側の .3s〜.4s transition が終わり切るまで待つ */
          setTimeout(function () { studioOK = true; }, 480);
        }
      }, 50);
    }

    build();
    if (!box) document.addEventListener("DOMContentLoaded", build);
    paint(0.03);                        /* 0%で固まって見えないよう少しだけ進める */
    loop = setInterval(tick, 50);
    setTimeout(close, HARD_MS);         /* 最終保険 */

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
        ※ 末尾の保険（4700ms）は §4 のタイマー序列の一部。
          HEADの保険（4000）より後であることが条件。単独で変えないこと
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
      /* 保険：HEAD側の4秒解除より後に必ず開始（§4 のタイマー序列） */
      setTimeout(function () { mo.disconnect(); start(); }, 4700);
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
  10. ヒーロー背景：SHEAR（上下端から出る斜線／home・contact 共通）
      ■ 触る前に必ず読むこと
      ・ヒーロー用 canvas は #heroCv の1枚のみ。旧 #heroFx（SILK）は
        parking.js へ退避した。2枚置かないこと（rAF が二重に走る）
      ・グラデーションは resize 時に1本だけ作る。毎フレーム
        createLinearGradient を呼ぶとGCが跳ねる。濃度は globalAlpha で作る
      ・setTransform(DPR,…) を掛けているため lineWidth の単位はCSSピクセル。
        W_BASE の数値がそのまま見た目の太さになる（Retinaでも同じ）
      ・交差判定は「上側×下側」のみ。交差点は NODE_MAX で打ち切る
      ・経過時間は acc へ積む（rAF のタイムスタンプを直接使わない）。
        背面タブからの復帰やリサイズで絵が飛ぶのを防ぐため dt は 50ms で
        頭打ちにしている。ts を直接 /1000 する形に戻さないこと
      ・prefers-reduced-motion では1フレームだけ描いて静止させる。
        frame() 末尾の分岐を無条件にしないこと
      ■ 画の意味
        上端から出た線は右下へ、下端から出た線は右上へ流れる。どちらも
        右向きなのでせん断しながら一方向へ進む（＝推進力）。上下の線が
        交差した瞬間だけ点が光る（＝線＝形が出会って点＝価値が生まれる）
  ------------------------------------------------------------ */
  (function initHeroCanvas() {
    var cv = document.getElementById("heroCv");
    if (!cv || typeof cv.getContext !== "function") return;
    var hero = (cv.closest && cv.closest(".hero")) || cv.parentNode;
    var g = cv.getContext("2d", { alpha: true });
    if (!g || !hero) return;

    var TAU = Math.PI * 2;

    /* ▼▼ 調整ダイヤル ▼▼
       TILT   … 斜線の傾き(rad)。0.42≒24°。0 で垂直、0.6 で寝すぎる
       LINES  … 片側の本数（PC）。狭幅では自動で 9 本へ落ちる
       LEN    … 線の長さ（画面高比）
       SPD    … 進み。0.055 で1本が約18秒かけて通過する
       W_BASE … 線の最小太さ(px)   W_VAR … 個体差の上乗せ幅(px)
                  控えめ 1.2 / 1.4   既定（中太）2.0 / 1.4
                  太い   3.0 / 1.8   極太     4.0 / 2.4
         ※ 太くすると見た目の明度が上がる。W_BASE を上げたら A_LINE を下げて
           釣り合わせること（片方だけ動かすと見出しの可読性が崩れる）
           目安 … 1.2→0.30 ／ 2.0→0.24 ／ 3.0→0.19 ／ 4.0→0.15
       A_LINE … 線の基準濃度      A_NODE … 交差点の濃度
       NODE_MAX … 1フレームに描く交差点の上限 */
    var TILT     = 0.42;
    var LINES    = 16;
    var LEN      = 0.46;
    var SPD      = 0.055;
    var W_BASE   = 2.0;
    var W_VAR    = 1.4;
    var A_LINE   = 0.24;
    var A_NODE   = 0.85;
    var NODE_MAX = 40;
    /* ▲▲ 調整はここまで ▲▲ */

    var sinT = Math.sin(TILT), cosT = Math.cos(TILT);
    var W = 0, H = 0, DPR = 1, raf = null, vis = true, rzT = null;
    var acc = 0, prev = 0;                  /* 経過時間の積算／直前のタイムスタンプ */
    var upper = [], lower = [], grad = null;
    var pa = [], pb = [], nodes = [];

    /* 再現性のある擬似乱数（線形合同法）。静止画を毎回同じ絵にするため */
    function seeded(seed) {
      var v = seed % 2147483647;
      if (v <= 0) v += 2147483646;
      return function () { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; };
    }

    function build() {
      var n = W < 768 ? 9 : LINES;          /* 狭幅は本数だけ落とす（太さは維持） */
      var r = seeded(20260917);
      function mk(side, shift) {
        var a = [], i, u;
        for (i = 0; i < n; i++) {
          u = (i + shift) / n;
          a.push({
            side: side,
            x0: (-0.45 + 1.75 * u) * W + (r() - 0.5) * W * 0.05,  /* 端の助走ぶん余裕を持たせる */
            len: H * LEN * (0.60 + r() * 0.85),
            spd: SPD * (0.72 + r() * 0.62),
            off: r(),
            w: W_BASE + r() * W_VAR
          });
        }
        return a;
      }
      upper = mk(0, 0);                     /* 上端から出て右下へ */
      lower = mk(1, 0.5);                   /* 下端から出て右上へ（半ピッチずらす） */

      /* 色は左=accent → 右=accent-2。--grad の 115deg と進行方向を揃える。
         中間シアンを挟むのは blue→teal の継ぎ目が濁るのを避けるため */
      grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0.00, "rgba(210,215,220,1)");  /* プラチナ */
      grad.addColorStop(0.55, "rgba(226,209,170,1)");  /* シャンパン（継ぎ目の濁り回避） */
      grad.addColorStop(1.00, "rgba(201,162,39,1)");   /* ゴールド */
    }

    function resize() {
      /* 狭い画面は DPR を 1.5 で頭打ちにする（塗り面積が約44%減る） */
      DPR = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
      var r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;                 /* 非表示時の 0 サイズを回避 */
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    /* 1本ぶんの端点と濃度を求める。M は画面外の助走ぶん */
    function solve(L, t, out) {
      var M = H * 0.34;
      var S = (H + M * 2) / cosT + L.len;   /* 1周期で進む距離 */
      var p = (t * L.spd + L.off) % 1;
      var s = p * S;
      var oy = L.side ? H + M : -M;         /* 出発点（下端の外／上端の外） */
      var vy = L.side ? -cosT : cosT;       /* 上側は下へ、下側は上へ */
      out.bx = L.x0 + sinT * s;             /* 先端。x はどちらも右へ進む */
      out.by = oy + vy * s;
      out.ax = L.x0 + sinT * (s - L.len);   /* 後端 */
      out.ay = oy + vy * (s - L.len);
      /* 出入りのフェード。端で線が唐突に切れて見えないようにする */
      out.a = Math.min(1, p / 0.10) * Math.min(1, (1 - p) / 0.18);
      out.w = L.w;
      return out;
    }

    function strokeSeg(o, alpha) {
      g.globalAlpha = alpha;
      g.lineWidth = o.w;
      g.beginPath();
      g.moveTo(o.ax, o.ay);
      g.lineTo(o.bx, o.by);
      g.stroke();
    }

    /* 上側×下側の交差点。線分同士の交点をそのまま解く */
    function intersect(P, Q, out) {
      var r1x = P.bx - P.ax, r1y = P.by - P.ay;
      var r2x = Q.bx - Q.ax, r2y = Q.by - Q.ay;
      var den = r1x * r2y - r1y * r2x;
      if (den > -1e-6 && den < 1e-6) return false;   /* 平行 */
      var sx = Q.ax - P.ax, sy = Q.ay - P.ay;
      var u = (sx * r2y - sy * r2x) / den;
      if (u < 0 || u > 1) return false;
      var v = (sx * r1y - sy * r1x) / den;
      if (v < 0 || v > 1) return false;
      out.x = P.ax + r1x * u;
      out.y = P.ay + r1y * u;
      out.a = Math.min(P.a, Q.a);
      return true;
    }

    function frame(ts) {
      var live = !rm.matches;
      if (!grad || !W || !H) {              /* 幅が測れない間は次フレームへ送る */
        raf = live ? requestAnimationFrame(frame) : null;
        return;
      }
      var now = ts || 0;
      if (!prev) prev = now;
      var dt = (now - prev) / 1000;
      prev = now;
      if (dt > 0.05) dt = 0.05;             /* 復帰時の大ジャンプを抑える */
      if (live) acc += dt;
      var t = live ? acc : 6.2;             /* 静止時は見栄えのする時刻で固定 */

      g.clearRect(0, 0, W, H);
      g.strokeStyle = grad; g.fillStyle = grad; g.lineCap = "round";
      /* lineCap を 'butt' にすると切り口が平らになり格子と馴染むが、
         出入りのフェード中に端が硬く見える。実機で比較して決めること */

      var i, j, k;
      for (i = 0; i < upper.length; i++) pa[i] = solve(upper[i], t, pa[i] || {});
      for (i = 0; i < lower.length; i++) pb[i] = solve(lower[i], t, pb[i] || {});

      for (i = 0; i < pa.length; i++) strokeSeg(pa[i], A_LINE * pa[i].a);
      for (i = 0; i < pb.length; i++) strokeSeg(pb[i], A_LINE * pb[i].a * 0.92);

      /* 交差点（線と線が出会って点になる＝形→価値） */
      var m = 0, o = {};
      for (i = 0; i < pa.length && m < NODE_MAX; i++) {
        for (j = 0; j < pb.length && m < NODE_MAX; j++) {
          if (!intersect(pa[i], pb[j], o)) continue;
          nodes[m] = nodes[m] || {};
          nodes[m].x = o.x; nodes[m].y = o.y; nodes[m].a = o.a; m++;
        }
      }
      /* 半径は線幅に連動させる。固定値にすると W_BASE を上げた時に
         点が線に埋もれて「点」に見えなくなる */
      var r0 = (W_BASE + W_VAR * 0.5) * 1.15;
      for (k = 0; k < m; k++) {
        g.globalAlpha = A_NODE * nodes[k].a;
        g.beginPath();
        g.arc(nodes[k].x, nodes[k].y, r0, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      /* ▼ この分岐を無条件にしないこと（動きを減らす設定で止まらなくなる） */
      if (!live) { raf = null; return; }
      raf = requestAnimationFrame(frame);
    }

    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
    function start() { if (!raf && vis && !rm.matches) { prev = 0; raf = requestAnimationFrame(frame); } }
    function render() { if (rm.matches) { stop(); prev = 0; frame(0); } else start(); }

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

    /* 動きを減らす設定が実行中に切り替わった場合も追従 */
    onMQ(rm, render);

    /* ヒーローが画面外なら停止（省電力） */
    if (HAS_IO) {
      new IntersectionObserver(function (es) {
        vis = es[0].isIntersecting;
        vis ? render() : stop();
      }, { threshold: 0 }).observe(hero);
    }
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
         ※ 末尾の強制表示（5500ms）は §4 のタイマー序列の最後尾。
           §14 の複製オープン保険（5100）より後であること
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

    /* 最終保険：5.5秒経っても .on が付かない要素は強制表示 */
    setTimeout(function () {
      var nuxt = document.getElementById("__nuxt");
      if (!nuxt) return;
      each(nuxt.querySelectorAll(".rv"), function (el) { el.classList.add("on"); });
    }, 5500);
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
        アニメーション中に走らせるとカードが中途半端な位置で止まる。
        この門（700ms）は scroll ハンドラと idle() の両方に必要。
        片方だけに置くと、もう一方の経路から巻き戻しが漏れて同じ症状が出る
      ・ホイール／キー操作は慣性が無いため、区間を越えた時点で即時に巻き戻す
      ・data-cs-loop="0" の場合は複製せず、従来どおりの端止めになる
      ・複製は §8 の監視外。実カードと同時に出すため、セクションが画面に
        入った時点で .on を付ける（生成時に付けると減光側だけが先に出る）
      ・末尾の保険（5100ms）は §4 のタイマー序列の一部。§8 の 4700 より後

      ■ 左右カードのクリック送り
      ・送り量は「クリックされたDOM番号 − いま中央のDOM番号」。coff を
        再計算しないため、複製カードを押しても正しい向きに動く
      ・操作要素の除外判定は必ず「カード内（card.contains）」に限定すること。
        .cs-rail 自身が tabindex="0"（キーボード送りの入口）を持つため、
        card を特定する前に [tabindex] を祖先方向へ遡って判定すると
        すべてのクリックが除外され、クリック送りが一切作動しない
      ・押下時の scrollLeft と比較し、動いていたらクリックとして扱わない
        （ドラッグ直後に click が飛ぶ環境があるためこの判定を外さないこと）。
        ただし押下時にスムーススクロールが走っていた場合は位置差で判定できない
        ため、座標移動（dragged）だけを見る
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
         DRAG_PX          … この距離を越えて動いたらドラッグと判定(px)
         ANIM_MS          … スムーススクロールの想定所要時間(ms)。
                             巻き戻しの抑止とクリック判定の両方が参照する */
      var INTERVAL = Math.max(2500, parseInt(box.getAttribute("data-cs-interval"), 10) || 5000);
      var LOOP = box.getAttribute("data-cs-loop") !== "0";
      var STOP_ON_INTERACT = true;
      var START_AT = 0;
      var START_CENTERED = true;
      var CLICK_TO_CENTER = true;
      var DRAG_PX = 8;
      var ANIM_MS = 700;
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
      var downAnim = false;    /* 押下時にスムーススクロールが走っていた */

      /* スムーススクロール進行中かどうか（巻き戻し抑止とクリック判定で共用） */
      function animating() { return !!animAt && Date.now() - animAt < ANIM_MS; }

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
          /* ▼ スムーススクロール中は巻き戻さない。scrollLeft への代入は
               スムーススクロールを打ち切るため、ここで走らせると
               クリック送り／ボタン送りのカードが中途半端な位置で止まる。
               終了を待って再試行する（scroll ハンドラ側と同じ門） */
          if (animating()) { idle(); return; }
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
        downAnim = animating();
        if (STOP_ON_INTERACT) kill();
      }, { passive: true });

      /* Pointer Events 非対応環境（旧iOS Safari等）でもクリック送りを成立させる。
         対応環境では pointerdown が正なので、ここで値を上書きしないこと */
      rail.addEventListener("touchstart", function (e) {
        down = true; touched = true;
        if (!window.PointerEvent) {
          var t0 = e.touches && e.touches[0];
          dragged = false;
          downX = t0 ? t0.clientX : 0;
          downSL = rail.scrollLeft;
          downAnim = animating();
        }
        if (STOP_ON_INTERACT) kill();
      }, { passive: true });

      /* 横に動いた時点でドラッグと確定する。
         touch でスクロールが始まると pointercancel が飛ぶ環境があるため両方拾う */
      rail.addEventListener("pointermove", function (e) {
        if (!down || dragged) return;
        if (Math.abs(e.clientX - downX) > DRAG_PX) dragged = true;
      }, { passive: true });
      rail.addEventListener("pointercancel", function () { dragged = true; });

      /* 同環境向けのドラッグ判定（pointermove と同じしきい値を使う） */
      rail.addEventListener("touchmove", function (e) {
        if (!down || dragged || window.PointerEvent) return;
        var t0 = e.touches && e.touches[0];
        if (t0 && Math.abs(t0.clientX - downX) > DRAG_PX) dragged = true;
      }, { passive: true });

      each(["pointerup", "touchend", "touchcancel"], function (ev) {
        addEventListener(ev, function () { down = false; idle(); }, { passive: true });
      });
      rail.addEventListener("wheel", function () {
        if (STOP_ON_INTERACT) kill();
      }, { passive: true });

      /* ▼ 左右のカードをクリックして中央へ送る
           ・カード内の操作要素（将来リンクを足した場合）は対象外。
             除外リストは common.css §15-2 のコメントと揃えること
           ・除外は card.contains で「カード内」に限定する。rail 自身が
             tabindex="0" を持つため、先に祖先方向へ [tabindex] を探すと
             全クリックが除外されてこの機能が死ぬ（冒頭の注意書き参照） */
      if (CLICK_TO_CENTER) {
        rail.addEventListener("click", function (e) {
          if (dragged) return;
          /* 押下時にアニメーション中だった場合、位置差ではドラッグを判定できない */
          if (!downAnim && Math.abs(rail.scrollLeft - downSL) > 4) return;

          var t = e.target;
          if (!t || typeof t.closest !== "function") return;

          var card = t.closest(".case");
          if (!card || card.parentNode !== rail) return;

          var intr = t.closest("a,button,input,select,textarea,summary,[tabindex]");
          if (intr && card.contains(intr)) return;

          var g = geo();
          var c = center(g);
          var i = Array.prototype.indexOf.call(rail.children, card);
          if (i < 0 || i === c) return;         /* 中央のカードは動かさない */

          /* idx はスクロール中に1フレーム遅れることがあるため実測値へ揃える */
          idx = Math.round(rail.scrollLeft / g.st);

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
          if (sets && !touched && !animating()) normalize();
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
      /* 保険：§8 のフォールバック（4.7秒）より後に必ず複製を開く */
      setTimeout(openClones, 5100);
    });
  })();
})();
