"use strict";

/* ============================================================
   CFI コーポレートサイト メインスクリプト   rev: 2026-08-27r1
   ・STUDIO カスタムコード [BODY] の末尾から読み込む前提
   ・CSSのハンバーガー閾値（960px）と MQ_DESK を必ず一致させること
   ------------------------------------------------------------
   旧版からの変更点
     1. 【バグ修正】prefers-reduced-motion 時にヒーローcanvasが
        静止せず永久にアニメーションしていた（draw末尾が無条件に
        requestAnimationFrame を呼んでいたため）
     2. 全体をIIFEで包み二重読み込みガードを追加
        （SPAで再実行された際の const 再宣言エラー／ティッカー
          二重複製を防止）
     3. IntersectionObserver 非対応環境のフォールバックを追加
        （例外で全スクリプトが停止し .rv が不可視化するのを防止）
     4. matchMedia の change 購読を addListener 互換に
     5. data-count が数値でない場合のガード
     6. 動きを減らす設定の実行中切り替えに追従
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

  /* ------------------------------------------------------------
     1. モバイルメニュー
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
     2. ヘッダー影
     ------------------------------------------------------------ */
  (function initHeaderShadow() {
    const hd = document.getElementById("hd");
    if (!hd) return;
    const apply = () => hd.classList.toggle("scr", scrollY > 40);
    addEventListener("scroll", apply, { passive: true });
    apply(); /* リロード位置が途中の場合に備えて初期反映 */
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
     4. 出現アニメーション
     ------------------------------------------------------------ */
  (function initReveal() {
    const targets = document.querySelectorAll(".rv");
    if (!targets.length) return;

    /* 非対応環境／動きを減らす設定では即時表示 */
    if (!HAS_IO || rm.matches) {
      targets.forEach((el) => el.classList.add("on"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (!e.isIntersecting) return;
          setTimeout(() => e.target.classList.add("on"), i * 70);
          io.unobserve(e.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8%" }
    );

    targets.forEach((el) => io.observe(el));
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
     6. ヒーロー背景：ノードネットワーク＋アパーチャー
     ------------------------------------------------------------ */
  (function initHeroCanvas() {
    const cv = document.getElementById("heroCv");
    const hero = document.querySelector(".hero");
    if (!cv || !hero || typeof cv.getContext !== "function") return;

    const g = cv.getContext("2d", { alpha: true });
    if (!g) return;

    const TAU = Math.PI * 2;
    let W = 0, H = 0, DPR = 1, nodes = [], raf = null, visible = true, rzTimer = null;

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
      /* 画面が小さいほどノードを減らしてモバイルの負荷を抑える */
      const n = Math.round(Math.min(72, Math.max(18, (W * H) / 22000)));
      nodes = Array.from({ length: n }, () => ({
        x: rnd() * W,
        y: rnd() * H,
        vx: (rnd() - 0.5) * 0.22,
        vy: (rnd() - 0.5) * 0.22,
        r: 0.9 + rnd() * 1.9,
        c: rnd() > 0.62 ? "0,194,168" : "15,107,224",
      }));
    }

    function resize() {
      DPR = Math.min(devicePixelRatio || 1, 2);
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
      const R = Math.min(W, H) * (narrow ? 0.16 : 0.22);

      const LINK = Math.min(150, Math.max(80, W * 0.11));

      /* 静止描画では座標を進めない（毎回同じ絵になる） */
      if (animate !== false) {
        for (const p of nodes) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        }
      }

      g.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > LINK) continue;
          g.strokeStyle = "rgba(0,194,168," + (0.16 * (1 - d / LINK)).toFixed(3) + ")";
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
        }
      }

      for (const p of nodes) {
        g.fillStyle = "rgba(" + p.c + ",0.55)";
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, TAU);
        g.fill();
      }

      /* 背面グロー */
      const halo = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.9);
      halo.addColorStop(0, "rgba(0,194,168,0.11)");
      halo.addColorStop(0.55, "rgba(15,107,224,0.07)");
      halo.addColorStop(1, "rgba(15,107,224,0)");
      g.fillStyle = halo;
      g.beginPath();
      g.arc(cx, cy, R * 1.9, 0, TAU);
      g.fill();

      /* 二重リング：外周はゆっくり逆回転 */
      const rot = (t / 26000) * TAU;
      aperture(cx, cy, R * 1.42, -rot * 0.55, 0.16);
      aperture(cx, cy, R, rot, 0.5);

      /* ▼ 旧版はここが無条件だったため、動きを減らす設定でも
           アニメーションが止まらなかった（本改訂の主眼） */
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
