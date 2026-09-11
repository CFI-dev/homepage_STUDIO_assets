"use strict";

/* ============================================================
   CFI コーポレートサイト メインスクリプト
   ・ハンバーガー切替点 960px（MQ_DESK）は common.css §16 と必ず一致させること
   ・rev:2026-09-10 MOTION 対応
       (1) initNav      … 項目に --i を付与し nav.mo-ready を立てる
       (2) initScroll   … 旧 initHeaderShadow を統合。--p / --hp / .hd-up
       (3) initReveal   … data-mo-stagger の展開。段差遅延をCSS(--i)へ移管
       (4) initFaq      … 新設。details の高さアニメーション
       (5) initHeroCanvas … ポインタ追従・信号パルス・アパーチャーの呼吸
   ・rev:2026-09-11 スクロール性能対策（common.css §20-9 / §20-15 と対）
       (a) initScroll     … 読み書きの分離／計測のキャッシュ化／
                            --hp 廃止（.hero .wrap へ直接書込）／
                            .hd-up にヒステリシス（±10px）
       (b) initHeroCanvas … 距離比較を二乗化、モバイルのDPR・ノード数を抑制
   ・CSS側は common.css §20 が対（片方だけ更新しないこと）
   ============================================================ */

(function () {
  /* ------------------------------------------------------------
     0. 二重読み込みガード
     ------------------------------------------------------------ */
  if (window.__cfiCommonLoaded) return;
  window.__cfiCommonLoaded = true;

  var MQ_DESK = matchMedia("(min-width:961px)");
  var rm = matchMedia("(prefers-reduced-motion: reduce)");

  /* matchMedia の change 購読（Safari 13以下は addListener のみ） */
  function onMQ(mq, fn) {
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", fn);
    else if (typeof mq.addListener === "function") mq.addListener(fn);
  }

  var HAS_IO = typeof IntersectionObserver === "function";

  /* 公開API置き場。initScroll / initReveal の両方から書き込む */
  var CFI = (window.CFI = window.CFI || {});

  /* ------------------------------------------------------------
     1. モバイルメニュー
        rev:2026-09-10 項目の段差表示用に --i を付与し、
        nav.mo-ready を立てる。CSS(§20-6)は mo-ready が無ければ
        何もしないため、JSが落ちた場合は従来どおり即表示になる
     ------------------------------------------------------------ */
  (function initNav() {
    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");
    if (!burger || !nav) return;

    const closeNav = () => {
      burger.classList.remove("on");
      nav.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
      burger.setAttribute("aria-label", "メニューを開く");
    };

    burger.addEventListener("click", () => {
      const open = burger.classList.toggle("on");
      nav.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    });

    /* 段差表示用インデックス（CSS側で 45ms 刻みの遅延に変換される） */
    Array.prototype.forEach.call(nav.querySelectorAll("ul > li"), (li, i) => {
      li.style.setProperty("--i", i);
    });
    nav.classList.add("mo-ready");

    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeNav));

    /* PC幅に戻したら閉じる */
    onMQ(MQ_DESK, (e) => {
      if (e.matches) closeNav();
    });

    addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });
  })();

  /* ------------------------------------------------------------
     2. スクロール連動（影 / 格納 / 進捗バー / ヒーローのパララックス）
        rev:2026-09-10 旧 initHeaderShadow を統合。
        rev:2026-09-11 カクつき対策。以下3点が設計の要。
          ・frame() 内でレイアウトを伴う読み取り（scrollHeight /
            offsetHeight）を行わない。クラス書き込みの直後に読むと
            強制同期レイアウトが毎フレーム発生する。計測は measure()
            に隔離し、resize / load / DOM変化時のみ実行する
          ・パララックスは --hp ではなく .hero .wrap へ直接書く。
            カスタムプロパティは継承するため、.hero に載せると
            配下すべてのスタイル再計算が毎フレーム走る
          ・.hd-up は ±10px のヒステリシスを持たせる。2px しきい値だと
            慣性スクロールの微振動で往復し、backdrop-filter 付きの
            fixed ヘッダーの再合成を繰り返す
        ・scroll の購読は全体でこの1本のみ。rAF で1フレーム1回に間引く
     ------------------------------------------------------------ */
  (function initScroll() {
    const hd = document.getElementById("hd");
    const prog = document.querySelector(".hd-prog");
    const nav = document.getElementById("nav");
    const hero = document.querySelector(".hero");
    const heroWrap = hero && hero.querySelector(".wrap");
    const hint = document.querySelector(".scroll-hint");
    if (!hd && !prog && !hero) return;

    let last = 0;
    let ticking = false;
    let soft = rm.matches;      /* 動きを減らす設定では格納とパララックスを止める */
    let maxScroll = 0;
    let heroH = 1;
    let up = false;             /* .hd-up の現在状態。無駄な class 書換を避ける */

    /* ▼ レイアウトを伴う読み取りはこの関数に隔離する。
         スクロール中は絶対に呼ばないこと */
    function measure() {
      maxScroll = document.documentElement.scrollHeight - innerHeight;
      heroH = (hero && hero.offsetHeight) || 1;
    }

    function frame() {
      ticking = false;
      const y = window.scrollY || window.pageYOffset || 0;  /* 読み取りはここだけ */

      /* --- 以降は書き込みのみ。読み取りを混ぜないこと --- */

      /* 2-1 ヘッダー影 */
      if (hd) hd.classList.toggle("scr", y > 40);

      /* 2-2 読了進捗バー（maxScroll は measure() のキャッシュ値） */
      if (prog) {
        prog.style.setProperty(
          "--p",
          maxScroll > 0 ? Math.min(y / maxScroll, 1).toFixed(4) : "0"
        );
      }

      /* 2-3 下方向スクロールでヘッダーを格納。
             メニュー展開中は隠さない（操作不能になるため） */
      if (hd && !soft) {
        const open = nav && nav.classList.contains("open");
        const d = y - last;
        /* しきい値未満の揺れでは last を更新せず、移動量を累積させる */
        if (Math.abs(d) >= 10 || y <= 240) {
          const next = d > 0 && y > 240 && !open;
          if (next !== up) {
            up = next;
            hd.classList.toggle("hd-up", up);
          }
          last = y;
        }
      } else {
        last = y;
      }

      /* 2-4 ヒーローのパララックス（合成可能プロパティへ直接書込） */
      if (heroWrap && !soft) {
        const p = Math.min(y / heroH, 1);
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
    addEventListener(
      "resize",
      function () {
        measure();
        onScroll();
      },
      { passive: true }
    );

    /* ▼ 文書高の変化に追随させる。
         画像の遅延読込確定や FAQ の開閉で高さが変わるため、
         これが無いと進捗バーの値が一時的にずれる */
    addEventListener("load", function () {
      measure();
      onScroll();
    });
    if (typeof ResizeObserver === "function" && document.body) {
      new ResizeObserver(function () {
        measure();
        onScroll();
      }).observe(document.body);
    }

    /* 後から生成されるDOM（STUDIOフォーム等）用の手動再計測フック */
    CFI.remeasure = function () {
      measure();
      onScroll();
    };

    /* 設定が実行中に切り替わった場合も追従（残った状態を戻す） */
    onMQ(rm, (e) => {
      soft = e.matches;
      if (!soft) {
        onScroll();
        return;
      }
      if (hd) {
        hd.classList.remove("hd-up");
        up = false;
      }
      if (heroWrap) {
        heroWrap.style.translate = "";
        heroWrap.style.opacity = "";
      }
      if (hint) hint.style.opacity = "";
    });

    measure();
    frame(); /* リロード位置が途中の場合に備えて初期反映 */
  })();

  /* ------------------------------------------------------------
     3. ティッカー複製（シームレスループ用）
        ※ 二重複製を防ぐためフラグで一度だけ実行
     ------------------------------------------------------------ */
  (function initTicker() {
    const tk = document.getElementById("tk");
    if (!tk || tk.dataset.cfiDuped === "1") return;
    tk.innerHTML += tk.innerHTML;
    tk.dataset.cfiDuped = "1";
  })();

  /* ------------------------------------------------------------
     4. 出現アニメーション（.rv → .on）
        rev:2026-08-28
        (a) 起動クローク（html.cfi-boot）が引き始めるまで監視を開始しない。
            幕の裏で演出が完了し「動かないページ」に見えるのを防ぐ。
        (b) 後から生成されるDOM（STUDIOフォーム等）を
            window.CFI.reveal(target) で追加登録できるようにする。
        rev:2026-09-10
        (c) [data-mo-stagger] の直下要素を個別リビールへ展開する。
        (d) 段差の遅延を setTimeout から CSS の --i（§20-1）へ移管。
            JSでずらすと transition の途中で class が付き、
            要素ごとに速度が不揃いに見えるため。
     ------------------------------------------------------------ */
  (function initReveal() {
    var html = document.documentElement;

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
         属性値は方向指定（"" | "l" | "r" | "s" | "f"）。
         親は .rv-hold を足して「.on を受け取るだけの器」に変える。
         §20-7（アイコン描画）や §20-9（接続線）が親の .on を
         参照しているため、親からクラスを外してはいけない。
         ※ .v-scroll 配下の子は §19-4 が transform を打ち消すため、
           横スクロール時はフェードのみになる（縦ラッチ防止） */
    function expandStagger() {
      var SKIP = { SCRIPT: 1, STYLE: 1, LINK: 1, TEMPLATE: 1, NOSCRIPT: 1 };
      Array.prototype.forEach.call(
        document.querySelectorAll("[data-mo-stagger]"),
        function (box) {
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
        }
      );
    }

    CFI.reveal = observe;
    CFI.stagger = expandStagger;   /* 後から生成されるDOM用 */

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
     5. カウントアップ
     ------------------------------------------------------------ */
  (function initCounter() {
    const targets = document.querySelectorAll("[data-count]");
    if (!targets.length) return;

    /* 数値として解釈できるものだけを対象にする */
    const list = Array.prototype.filter.call(targets, (el) => isFinite(+el.dataset.count));
    if (!list.length) return;

    const settle = (el) => {
      el.textContent = +el.dataset.count + (el.dataset.suffix || "");
    };

    /* 非対応環境／動きを減らす設定では即時確定値 */
    if (!HAS_IO || rm.matches) {
      list.forEach(settle);
      return;
    }

    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target;
          const goal = +el.dataset.count;
          const sfx = el.dataset.suffix || "";

          if (rm.matches) {
            settle(el);
            cio.unobserve(el);
            return;
          }

          const t0 = performance.now();
          const D = 1400;
          (function step(t) {
            const p = Math.min((t - t0) / D, 1);
            const v = Math.round(goal * (1 - Math.pow(1 - p, 3)));
            el.textContent = v + sfx;
            if (p < 1) requestAnimationFrame(step);
          })(t0);

          cio.unobserve(el);
        });
      },
      { threshold: 0.6 }
    );

    list.forEach((el) => cio.observe(el));
  })();

  /* ------------------------------------------------------------
     6. FAQ：開閉の高さアニメーション（rev:2026-09-10 新設）
        ・details/summary の意味論は保持（open 属性を自分で操作する）
        ・height:auto の補間は Safari／Firefox 未対応（interpolate-size）
          のため、実測値をJSから与える方式を採る
        ・JS無効時・動きを減らす設定では素の開閉に戻る
        ・キーボードの Enter / Space も click として届くため同経路
        ・開閉による文書高の変化は initScroll の ResizeObserver が拾う
     ------------------------------------------------------------ */
  (function initFaq() {
    const items = document.querySelectorAll(".faq details");
    if (!items.length) return;

    Array.prototype.forEach.call(items, function (d) {
      const sum = d.querySelector("summary");
      const body = d.querySelector(".a");
      if (!sum || !body) return;

      let busy = false;

      sum.addEventListener("click", function (e) {
        if (rm.matches) return;                  /* 既定動作にまかせる */
        if (busy) { e.preventDefault(); return; }
        e.preventDefault();
        busy = true;

        const closing = d.open;
        if (!closing) d.open = true;             /* 開く前に高さを測るため */

        /* 下パディングはブレークポイントで変わるので毎回実測する */
        const pb = getComputedStyle(body).paddingBottom;
        const h = body.scrollHeight;

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

        let done = false;
        function finish() {
          if (done) return;
          done = true;
          body.removeEventListener("transitionend", onEnd);
          body.classList.remove("mo-a");
          body.style.height = "";
          body.style.paddingBottom = "";
          if (closing) d.open = false;
          busy = false;
          if (CFI && typeof CFI.remeasure === "function") CFI.remeasure();
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
     7. ヒーロー背景：SILK（絹の帯）
        rev:2026-09-11 旧「ノードネットワーク＋アパーチャー」を全面置換。
        ・対象は #heroCv のまま。home / contact 双方のHTMLは変更不要
        ・帯は二次ベジェ。加算合成(lighter)で交差した部分だけが発光する
        ・配色は common.css の --accent / --accent-2 を実行時に読む。
          取得できない場合のみ既定値へフォールバックする
        ・canvas は透明のまま。.hero の背景グラデと ::after のスクリムは
          従来どおり効く（見出しのコントラスト条件を変えない）
        ・上下端のフェードは common.css §3 の mask-image が担当。
          JS側ではマスクしない（二重にかけないこと）
        ・形状の乱数は seeded。リサイズで帯の形が変わらず、
          動きを減らす設定での静止画も毎回同じ絵になる
     ------------------------------------------------------------ */
  (function initHeroSilk() {
    const cv = document.getElementById("heroCv");
    if (!cv || typeof cv.getContext !== "function") return;
    const hero = (cv.closest && cv.closest(".hero")) || cv.parentNode;
    const g = cv.getContext("2d", { alpha: true });
    if (!g || !hero) return;

    /* ▼▼ 大胆さの調整ダイヤル ▼▼
       AMP   振幅（画面高に対する比）。0.24 まで上げると相当に暴れる
       RATE  時間の進み。1.6 あたりから「速い」と感じ始める
       GLOW  交差部の発光量。上げすぎると白飛びして品が落ちる
       BANDS 帯の本数（PC）。増やすほど塗り面積が線形に増える        */
    const AMP = 0.18, RATE = 1.0, GLOW = 0.13, BANDS = 6;
    const SEG = 18;                     /* 1本あたりの頂点数 */
    const HOVER = matchMedia("(hover:hover) and (pointer:fine)");

    let W = 0, H = 0, DPR = 1, rb = [], raf = null, vis = true, rzT = null;
    let halo = null, hx = -1, hy = -1, glow = GLOW;
    const pt = { x: .5, y: .5, tx: .5, ty: .5, on: false };

    /* ▼ ブランド色をトークンから取得。#rrggbb / rgb() の両方を受ける。
         common.css より先に実行された場合だけ既定値に落ちる */
    function brand() {
      const cs = getComputedStyle(document.documentElement);
      function rgb(v, fb) {
        v = (v || "").trim();
        let m = /^#([0-9a-f]{6})$/i.exec(v);
        if (m) {
          const n = parseInt(m[1], 16);
          return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
        }
        m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
        if (m) return Math.round(+m[1]) + "," + Math.round(+m[2]) + "," + Math.round(+m[3]);
        return fb;
      }
      return {
        a: rgb(cs.getPropertyValue("--accent"),   "15,107,224"),
        b: rgb(cs.getPropertyValue("--accent-2"), "0,194,168")
      };
    }
    let C = brand();

    /* 再現性のある擬似乱数（線形合同法。旧実装と同じ手法） */
    function seeded(seed) {
      let v = seed % 2147483647;
      if (v <= 0) v += 2147483646;
      return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; };
    }

    if (HOVER.matches) {
      hero.addEventListener("pointermove", function (e) {
        const r = cv.getBoundingClientRect();
        pt.tx = (e.clientX - r.left) / (r.width  || 1);
        pt.ty = (e.clientY - r.top ) / (r.height || 1);
        pt.on = true;
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { pt.on = false; });
    }

    function build() {
      const rnd = seeded(20160202);
      const narrow = W < 768;
      const n = narrow ? 4 : BANDS;
      /* 狭い画面は全面 fillRect が効くので発光を控える。0 にすると塗り自体が消える */
      glow = narrow ? GLOW * 0.55 : GLOW;
      halo = null; hx = -1; hy = -1;
      C = brand();

      rb = [];
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) : .5;
        const a = 0.10 + 0.05 * (1 - u);
        const grd = g.createLinearGradient(0, 0, W, H);
        grd.addColorStop(0,   "rgba(" + C.a + "," + a.toFixed(3) + ")");
        grd.addColorStop(0.5, "rgba(" + C.b + "," + (a * 1.35).toFixed(3) + ")");
        grd.addColorStop(1,   "rgba(" + C.a + ",0)");
        rb.push({
          base: H * (0.16 + u * 0.62),
          a1: H * AMP * (0.55 + 0.45 * rnd()),
          a2: H * AMP * 0.34,
          k1: 1.1 + u * 0.9,               /* 横方向の波数 */
          k2: 2.4 + u * 1.6,
          s1: (0.06 + u * 0.05) * RATE,    /* 位相速度。小さいほど優雅 */
          s2: (0.09 - u * 0.03) * RATE,
          ph: u * 4.1,
          th: H * (0.05 + 0.055 * (1 - u)),/* 帯の厚み */
          tilt: (u - 0.5) * H * 0.22,      /* 傾き。平行を避けて動きを出す */
          grad: grd,
          /* ▼ 頂点バッファは使い回す。毎フレーム配列を作るとGCが走る */
          top: new Float32Array((SEG + 1) * 2),
          bot: new Float32Array((SEG + 1) * 2)
        });
      }
    }

    function resize() {
      DPR = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
      const r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;              /* 非表示時の 0 サイズを回避 */
      cv.width  = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    /* 点列を二次ベジェで結ぶ（中点をアンカーにする定番手法）。
       18点でも目視では完全な曲線になる */
    function curveFwd(p, n) {
      g.moveTo(p[0], p[1]);
      for (let i = 1; i < n - 1; i++) {
        const x = p[i * 2], y = p[i * 2 + 1];
        g.quadraticCurveTo(x, y, (x + p[(i + 1) * 2]) * .5, (y + p[(i + 1) * 2 + 1]) * .5);
      }
      g.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
    }
    function curveBack(p, n) {
      g.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);   /* 右端で折り返す */
      for (let i = n - 2; i > 0; i--) {
        const x = p[i * 2], y = p[i * 2 + 1];
        g.quadraticCurveTo(x, y, (x + p[(i - 1) * 2]) * .5, (y + p[(i - 1) * 2 + 1]) * .5);
      }
      g.lineTo(p[0], p[1]);
    }

    function band(r, T, warp) {
      const x0 = -W * 0.12, span = W * 1.24, n = SEG + 1;
      for (let i = 0; i < n; i++) {
        const u = i / SEG, x = x0 + span * u;
        const y = r.base
                + r.tilt * (u - .5) * 2
                + r.a1 * Math.sin(u * Math.PI * 2 * r.k1 + T * r.s1 + r.ph)
                + r.a2 * Math.sin(u * Math.PI * 2 * r.k2 - T * r.s2)
                + warp * Math.sin(u * Math.PI * 2 + r.ph);     /* ポインタ由来の歪み */
        const th = r.th * (0.55 + 0.45 * Math.sin(u * Math.PI * 2 * 1.7 + T * r.s2 * 1.3 + r.ph));
        r.top[i * 2] = x; r.top[i * 2 + 1] = y;
        r.bot[i * 2] = x; r.bot[i * 2 + 1] = y + th;
      }
      g.beginPath();
      curveFwd(r.top, n);
      curveBack(r.bot, n);
      g.closePath();
      g.fillStyle = r.grad;
      g.fill();
    }

    function draw(t) {
      const live = !rm.matches;
      const T = live ? t / 1000 : 0;

      /* 追従は慣性付き。値を直に入れると帯が痙攣する */
      pt.x += ((pt.on ? pt.tx : .5) - pt.x) * 0.045;
      pt.y += ((pt.on ? pt.ty : .5) - pt.y) * 0.045;
      const warp = live ? (pt.y - .5) * H * 0.20 : 0;

      g.clearRect(0, 0, W, H);

      /* 加算合成。帯が重なった部分だけが光る＝交差が主役になる */
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 1;
      for (let i = 0; i < rb.length; i++) band(rb[i], T, warp);

      /* 交差の輝きを底上げする薄いベール。
         グラデーションは中心が動いたときだけ作り直す */
      if (glow > 0) {
        const cx = W * (0.30 + pt.x * 0.40), cy = H * (0.30 + pt.y * 0.30);
        if (!halo || Math.abs(cx - hx) > 2 || Math.abs(cy - hy) > 2) {
          hx = cx; hy = cy;
          halo = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
          halo.addColorStop(0,   "rgba(" + C.b + "," + glow.toFixed(3) + ")");
          halo.addColorStop(0.6, "rgba(" + C.a + "," + (glow * 0.4).toFixed(3) + ")");
          halo.addColorStop(1,   "rgba(" + C.a + ",0)");
        }
        g.fillStyle = halo;
        g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = "source-over";

      if (!live) { raf = null; return; }   /* 動きを減らす設定＝静止1枚 */
      raf = requestAnimationFrame(draw);
    }

    function stop()  { if (raf) { cancelAnimationFrame(raf); raf = null; } }
    function start() { if (!raf && vis && !rm.matches) raf = requestAnimationFrame(draw); }
    function render(){ if (rm.matches) { stop(); draw(0); } else start(); }

    resize();

    /* モバイルのアドレスバー開閉による微小リサイズを間引く */
    addEventListener("resize", function () {
      clearTimeout(rzT);
      rzT = setTimeout(function () { stop(); resize(); render(); }, 180);
    }, { passive: true });

    addEventListener("orientationchange", function () { stop(); resize(); render(); });
    document.addEventListener("visibilitychange", function () {
      document.hidden ? stop() : render();
    });

    /* ヒーローが画面外なら停止（省電力） */
    if (HAS_IO) {
      new IntersectionObserver(function (es) {
        vis = es[0].isIntersecting;
        vis ? render() : stop();
      }, { threshold: 0 }).observe(hero);
    }

    onMQ(rm, render);
    render();
  })();
