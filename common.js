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
     7. ヒーロー背景：ノードネットワーク＋アパーチャー
        rev:2026-09-10
        ・ポインタ追従を追加。座標本体(x,y)は書き換えず、描画用の
          オフセット(dx,dy)だけを動かす。静止画（animate=false）の
          再現性を保つため
        ・近接ノード間を渡る信号パルスを追加（1.5秒間隔で1本）
        ・アパーチャーに呼吸（±3.5%）とスクロールドリフトを追加
        rev:2026-09-11 モバイルのスクロール負荷対策
        ・リンク判定の距離比較を二乗化（Math.hypot / sqrt の削減）。
          総当たり最大 72*71/2 = 2,556 組ぶんの平方根が毎フレーム
          走っていたため
        ・狭い画面では DPR 上限とノード数を引き下げる
     ------------------------------------------------------------ */
  (function initHeroCanvas() {
    const cv = document.getElementById("heroCv");
    const hero = document.querySelector(".hero");
    if (!cv || !hero || typeof cv.getContext !== "function") return;

    const g = cv.getContext("2d", { alpha: true });
    if (!g) return;

    const TAU = Math.PI * 2;
    let W = 0, H = 0, DPR = 1, nodes = [], raf = null, visible = true, rzTimer = null;

    /* ▼ ポインタ追従（マウス環境のみ。タッチでは追従させない） */
    const HOVER = matchMedia("(hover:hover) and (pointer:fine)");
    const pt = { x: 0, y: 0, on: false };
    let pulses = [], lastSpawn = 0;

    if (HOVER.matches) {
      hero.addEventListener(
        "pointermove",
        function (e) {
          const r = cv.getBoundingClientRect();
          pt.x = e.clientX - r.left;
          pt.y = e.clientY - r.top;
          pt.on = true;
        },
        { passive: true }
      );
      hero.addEventListener("pointerleave", function () { pt.on = false; });
    }

    /* 再現性のある擬似乱数（線形合同法） */
    function seeded(seed) {
      let v = seed % 2147483647;
      if (v <= 0) v += 2147483646;
      return () => {
        v = (v * 16807) % 2147483647;
        return (v - 1) / 2147483646;
      };
    }

    function build() {
      const rnd = seeded(20160202);
      /* 画面が小さいほどノードを減らしてモバイルの負荷を抑える。
         リンク描画は O(n^2) なので、ここの上限が効き幅として最も大きい */
      const narrow = W < 768;
      const cap = narrow ? 40 : 72;
      const div = narrow ? 30000 : 22000;
      const n = Math.round(Math.min(cap, Math.max(18, (W * H) / div)));
      nodes = Array.from({ length: n }, () => ({
        x: rnd() * W,
        y: rnd() * H,
        dx: 0,                          /* 描画用オフセット（追従分） */
        dy: 0,
        vx: (rnd() - 0.5) * 0.22,
        vy: (rnd() - 0.5) * 0.22,
        r: 0.9 + rnd() * 1.9,
        c: rnd() > 0.62 ? "0,194,168" : "15,107,224",
      }));
      pulses = [];
    }

    function resize() {
      /* 狭い画面は DPR を 1.5 で頭打ちにする（塗り面積が約44%減る） */
      DPR = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
      const r = cv.getBoundingClientRect();
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
      const grd = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      grd.addColorStop(0, "rgba(15,107,224," + alpha + ")");
      grd.addColorStop(1, "rgba(0,194,168," + alpha + ")");
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.strokeStyle = grd;
      g.lineWidth = R * 0.2;
      g.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const s = (i * TAU) / 3;
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
      const narrow = W < 768;
      const cx = narrow ? W * 0.5 : W * 0.74;
      const cy = narrow ? H * 0.3 : H * 0.46;
      const R0 = Math.min(W, H) * (narrow ? 0.16 : 0.22);

      const LINK = Math.min(150, Math.max(80, W * 0.11));
      const LINK2 = LINK * LINK;          /* 二乗比較用 */

      /* 追加演出（追従・パルス・呼吸）を出してよい状態か */
      const live = animate !== false && !rm.matches;

      /* 静止描画では座標を進めない（毎回同じ絵になる） */
      if (animate !== false) {
        for (const p of nodes) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        }
      }

      /* ▼ カーソルへの引き寄せ。表示位置(dx,dy)だけを補間で動かし、
           離脱時は 0 へ緩やかに戻す */
      const PR = 190, PR2 = PR * PR;
      for (const p of nodes) {
        let tx = 0, ty = 0;
        if (live && pt.on) {
          const ax = pt.x - p.x, ay = pt.y - p.y, d2 = ax * ax + ay * ay;
          if (d2 < PR2) {
            const f = (1 - d2 / PR2) * 0.18;
            tx = ax * f;
            ty = ay * f;
          }
        }
        p.dx += (tx - p.dx) * 0.12;
        p.dy += (ty - p.dy) * 0.12;
      }

      /* ノード間の接続線
         ※ 距離は二乗で判定し、閾値内の組だけ平方根を取る。
           Math.hypot を総当たりで呼ばないこと */
      g.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const ax = a.x + a.dx, ay = a.y + a.dy;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const bx = b.x + b.dx, by = b.y + b.dy;
          const ux = ax - bx, uy = ay - by;
          const d2 = ux * ux + uy * uy;
          if (d2 > LINK2) continue;
          const d = Math.sqrt(d2);
          g.strokeStyle = "rgba(0,194,168," + (0.16 * (1 - d / LINK)).toFixed(3) + ")";
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
        }
      }

      /* カーソルから近傍ノードへの線 */
      if (live && pt.on) {
        const CR = 150, CR2 = CR * CR;
        for (const p of nodes) {
          const px = p.x + p.dx, py = p.y + p.dy;
          const ux = pt.x - px, uy = pt.y - py;
          const d2 = ux * ux + uy * uy;
          if (d2 > CR2) continue;
          const d = Math.sqrt(d2);
          g.strokeStyle = "rgba(15,107,224," + (0.3 * (1 - d / CR)).toFixed(3) + ")";
          g.beginPath();
          g.moveTo(pt.x, pt.y);
          g.lineTo(px, py);
          g.stroke();
        }
      }

      /* ノード本体 */
      for (const p of nodes) {
        g.fillStyle = "rgba(" + p.c + ",0.55)";
        g.beginPath();
        g.arc(p.x + p.dx, p.y + p.dy, p.r, 0, TAU);
        g.fill();
      }

      /* ▼ 信号パルス：ランダムな1点から最近傍へ光を走らせる
           （1.5秒に1回のみの探索なので二乗比較のままでよい） */
      if (live && t - lastSpawn > 1500 && nodes.length > 2) {
        lastSpawn = t;
        const i = Math.floor(Math.random() * nodes.length);
        const a = nodes[i];
        let best = -1, bd2 = Infinity;
        for (let j = 0; j < nodes.length; j++) {
          if (j === i) continue;
          const ux = a.x - nodes[j].x, uy = a.y - nodes[j].y;
          const d2 = ux * ux + uy * uy;
          if (d2 < bd2 && d2 > 576) { bd2 = d2; best = j; }   /* 576 = 24^2 */
        }
        const lim = LINK * 1.3;
        if (best >= 0 && bd2 < lim * lim) pulses.push({ a: a, b: nodes[best], t0: t });
      }
      if (!live) pulses = [];
      for (let k = pulses.length - 1; k >= 0; k--) {
        const q = pulses[k];
        const pr = (t - q.t0) / 1200;
        if (pr >= 1) { pulses.splice(k, 1); continue; }
        const e = pr * pr * (3 - 2 * pr);                 /* smoothstep */
        const ax = q.a.x + q.a.dx, ay = q.a.y + q.a.dy;
        const x = ax + (q.b.x + q.b.dx - ax) * e;
        const y = ay + (q.b.y + q.b.dy - ay) * e;
        const al = Math.sin(pr * Math.PI);                /* 出て消える */
        g.strokeStyle = "rgba(0,194,168," + (0.28 * al).toFixed(3) + ")";
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(x, y);
        g.stroke();
        g.fillStyle = "rgba(0,194,168," + (0.9 * al).toFixed(3) + ")";
        g.beginPath();
        g.arc(x, y, 2.2, 0, TAU);
        g.fill();
      }

      /* 背面グロー */
      const halo = g.createRadialGradient(cx, cy, R0 * 0.2, cx, cy, R0 * 1.9);
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
      const R = R0 * (live ? 1 + Math.sin(t / 3800) * 0.035 : 1);
      const sy = live ? Math.min(window.scrollY || 0, H) * 0.06 : 0;
      const rot = (t / 26000) * TAU;
      aperture(cx, cy + sy, R * 1.42, -rot * 0.55, 0.16);
      aperture(cx, cy + sy, R, rot, 0.5);

      /* ▼ 旧版はここが無条件だったため、動きを減らす設定でも
           アニメーションが止まらなかった（2026-08 改訂の主眼） */
      if (animate === false || rm.matches) {
        raf = null;
        return;
      }
      raf = requestAnimationFrame(draw);
    }

    function still() {
      stop();
      draw(0, false);
    }
    function start() {
      if (!raf && visible && !rm.matches) raf = requestAnimationFrame(draw);
    }
    function stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }
    function render() {
      rm.matches ? still() : start();
    }

    resize();

    /* モバイルのアドレスバー開閉による微小リサイズを間引く */
    addEventListener(
      "resize",
      () => {
        clearTimeout(rzTimer);
        rzTimer = setTimeout(() => {
          stop();
          resize();
          render();
        }, 180);
      },
      { passive: true }
    );

    addEventListener("orientationchange", () => {
      stop();
      resize();
      render();
    });

    document.addEventListener("visibilitychange", () => {
      document.hidden ? stop() : render();
    });

    /* 動きを減らす設定が実行中に切り替わった場合も追従 */
    onMQ(rm, render);

    /* ヒーローが画面外なら停止（省電力） */
    if (HAS_IO) {
      new IntersectionObserver((es) => {
          visible = es[0].isIntersecting;
          visible ? render() : stop();
        }, { threshold: 0 })
        .observe(hero);
    }

    /* 初期描画（動きを減らす設定では静止画1枚） */
    render();
  })();
})();
