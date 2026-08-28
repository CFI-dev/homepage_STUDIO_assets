"use strict";

/* ============================================================
   CFI コーポレートサイト メインスクリプト   rev: 2026-08-28c
   ・STUDIO カスタムコード [BODY] の末尾から読み込む前提
   ・CSSのハンバーガー閾値（960px）と MQ_DESK を必ず一致させること
   ------------------------------------------------------------
   rev:2026-08-27r1 からの変更点
     [P0-2] カウントアップの 0 初期化を本ファイルへ移設。
            ページ側BODYの ④ ブロックは削除すること。
            common.js が読めなかった場合、HTML直書きの実値が
            そのまま残る（従来は「0」で固定される事故があった）
     [BUG]  ヒーローcanvas：画面外へ出たノードが毎フレーム
            速度反転し、境界に貼り付いて振動する不具合を修正
            （座標クランプ方式へ変更）
     [BUG]  リビール演出：stagger の係数に entries 配列の index を
            使っていたため、非交差要素が混じると間隔が飛んでいた
     [A11Y] 閉じたモバイルナビが transform で画面外に出るだけで
            Tabキーのフォーカスが到達していた。inert（非対応環境は
            tabindex/aria-hidden）で遮断
     [A11Y] Escape での閉鎖時にフォーカスをバーガーへ戻す
     [PERF] ノード間距離を二乗比較にし Math.hypot を除去
            （72ノード＝2,556組×60fps の平方根計算を削減）
     [PERF] ヘッダー影：状態が変わったフレームのみDOMへ書き込む
     [FIX]  リサイズ時にノードを再生成せず座標をスケール
     [FIX]  data-count が空文字のとき 0 と誤判定する条件を修正
     [FIX]  ティッカー複製を cloneNode 化（innerHTML 再パースを回避）
   ------------------------------------------------------------
   参照側の注意：CSS・JS・画像のクエリを ?v=20260828c に揃えること
   ============================================================ */

(function () {
  /* ------------------------------------------------------------
     0. 共通の前提
     ------------------------------------------------------------ */
  if (window.__cfiCommonLoaded) return;   /* SPA再実行での二重初期化を防ぐ */
  window.__cfiCommonLoaded = true;

  var MQ_DESK = matchMedia("(min-width:961px)");
  var rm = matchMedia("(prefers-reduced-motion: reduce)");
  var HAS_IO = typeof IntersectionObserver === "function";
  var HAS_INERT = "inert" in HTMLElement.prototype;

  /* matchMedia の change 購読（Safari 13以下は addListener のみ） */
  function onMQ(mq, fn) {
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", fn);
    else if (typeof mq.addListener === "function") mq.addListener(fn);
  }

  /* ------------------------------------------------------------
     1. モバイルメニュー
        開閉・フォーカス遮断・Escape・外側クリックを一括で扱う
     ------------------------------------------------------------ */
  (function initNav() {
    var burger = document.getElementById("burger");
    var nav = document.getElementById("nav");
    var hd = document.getElementById("hd");
    if (!burger || !nav) return;

    /* 閉じている間はナビをフォーカス不可・支援技術から不可視にする。
       ・inert 対応（Chrome102+ / Safari15.5+ / Firefox112+）は inert
       ・非対応環境は tabindex="-1" と aria-hidden で代替
       デスクトップ幅ではナビは常時表示なので必ず解除する。 */
    function seal(off) {
      if (HAS_INERT) {
        nav.inert = off;
        return;
      }
      if (off) nav.setAttribute("aria-hidden", "true");
      else nav.removeAttribute("aria-hidden");
      Array.prototype.forEach.call(nav.querySelectorAll("a,button"), function (el) {
        if (off) el.setAttribute("tabindex", "-1");
        else el.removeAttribute("tabindex");
      });
    }

    function syncSeal() {
      seal(!MQ_DESK.matches && !nav.classList.contains("open"));
    }

    function setOpen(open) {
      burger.classList.toggle("on", open);
      nav.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
      syncSeal();
    }

    var closeNav = function () { setOpen(false); };

    burger.addEventListener("click", function () {
      setOpen(!nav.classList.contains("open"));
    });

    /* ナビ内リンクを踏んだら閉じる（同一ページ内アンカー対策） */
    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      a.addEventListener("click", closeNav);
    });

    /* PC幅に戻したら開閉状態をリセットし、封鎖も解く */
    onMQ(MQ_DESK, function (e) {
      if (e.matches) closeNav();
      else syncSeal();
    });

    /* Escape：開いているときだけ反応し、フォーカスをバーガーへ返す */
    addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!nav.classList.contains("open")) return;
      closeNav();
      burger.focus();
    });

    /* ヘッダーの外側をタップしたら閉じる */
    document.addEventListener("pointerdown", function (e) {
      if (!nav.classList.contains("open")) return;
      if (hd && hd.contains(e.target)) return;
      closeNav();
    }, { passive: true });

    syncSeal();   /* 初期状態（モバイル幅で読み込まれた場合に封鎖） */
  })();

  /* ------------------------------------------------------------
     2. ヘッダー影
        scroll は高頻度で発火するため、状態が変わった時だけ
        classList を触る（不要なスタイル再計算を出さない）
     ------------------------------------------------------------ */
  (function initHeaderShadow() {
    var hd = document.getElementById("hd");
    if (!hd) return;

    var on = null;
    function apply() {
      var next = scrollY > 40;
      if (next === on) return;
      on = next;
      hd.classList.toggle("scr", next);
    }
    addEventListener("scroll", apply, { passive: true });
    apply();   /* リロード位置が途中の場合に備えて初期反映 */
  })();

  /* ------------------------------------------------------------
     3. ティッカー複製（シームレスループ用）
        CSSの translateX(-50%) は「中身がちょうど2倍」を前提にする
     ------------------------------------------------------------ */
  (function initTicker() {
    var tk = document.getElementById("tk");
    if (!tk || tk.dataset.cfiDuped === "1") return;

    /* innerHTML += は全ノードを破棄・再パースするため cloneNode を使う */
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(tk.children, function (li) {
      frag.appendChild(li.cloneNode(true));
    });
    tk.appendChild(frag);
    tk.dataset.cfiDuped = "1";
  })();

  /* ------------------------------------------------------------
     4. 出現アニメーション
     ------------------------------------------------------------ */
  (function initReveal() {
    var targets = document.querySelectorAll(".rv");
    if (!targets.length) return;

    function showAll() {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add("on"); });
    }

    /* 非対応環境／動きを減らす設定では即時表示 */
    if (!HAS_IO || rm.matches) { showAll(); return; }

    var io = new IntersectionObserver(function (entries) {
      /* 旧版は entries の index を係数にしていたため、非交差要素が
         混ざると 0,140,350ms のように間隔が飛んでいた。
         交差した要素だけを数え、上限を設けて総遅延を抑える。 */
      var shown = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var delay = Math.min(shown++, 6) * 70;
        var el = e.target;
        io.unobserve(el);
        if (delay === 0) el.classList.add("on");
        else setTimeout(function () { el.classList.add("on"); }, delay);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8%" });

    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });

    /* 実行中に「動きを減らす」へ切り替わったら全部出して監視を畳む */
    onMQ(rm, function (e) {
      if (!e.matches) return;
      io.disconnect();
      showAll();
    });
  })();

  /* ------------------------------------------------------------
     5. カウントアップ
        HTML側は実値を直書きしておく（このスクリプトが読み込め
        なかった場合に、そのまま実値が表示される＝P0-2の要点）。
        0 への初期化は、演出が確実に走ると決まったここで行う。
     ------------------------------------------------------------ */
  (function initCounter() {
    var nodes = document.querySelectorAll("[data-count]");
    if (!nodes.length) return;

    /* 空文字は +"" === 0 で isFinite を通ってしまうため明示的に弾く */
    var list = Array.prototype.filter.call(nodes, function (el) {
      var v = (el.dataset.count || "").trim();
      return v !== "" && isFinite(+v);
    });
    if (!list.length) return;

    function settle(el) {
      el.textContent = +el.dataset.count + (el.dataset.suffix || "");
    }

    /* 非対応環境／動きを減らす設定では実値のまま据え置く */
    if (!HAS_IO || rm.matches) { list.forEach(settle); return; }

    /* ここまで来た時点で演出は確実に走るので、はじめて 0 にする */
    list.forEach(function (el) { el.textContent = "0"; });

    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        cio.unobserve(el);

        if (rm.matches) { settle(el); return; }

        var goal = +el.dataset.count;
        var sfx = el.dataset.suffix || "";
        var t0 = performance.now();
        var D = 1400;

        (function step(t) {
          var p = Math.min((t - t0) / D, 1);
          el.textContent = Math.round(goal * (1 - Math.pow(1 - p, 3))) + sfx;
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      });
    }, { threshold: 0.6 });

    list.forEach(function (el) { cio.observe(el); });

    /* 途中で設定が変わったら即座に実値へ確定させる */
    onMQ(rm, function (e) {
      if (!e.matches) return;
      cio.disconnect();
      list.forEach(settle);
    });
  })();

  /* ------------------------------------------------------------
     6. ヒーロー背景：ノードネットワーク＋アパーチャー
     ------------------------------------------------------------ */
  (function initHeroCanvas() {
    var cv = document.getElementById("heroCv");
    var hero = document.querySelector(".hero");
    if (!cv || !hero || typeof cv.getContext !== "function") return;

    var g = cv.getContext("2d", { alpha: true });
    if (!g) return;

    var TAU = Math.PI * 2;
    var W = 0, H = 0, DPR = 1;
    var nodes = [];
    var raf = null, visible = true, rzTimer = null;

    /* 再現性のある擬似乱数（線形合同法） */
    function seeded(seed) {
      var v = seed % 2147483647;
      if (v <= 0) v += 2147483646;
      return function () {
        v = (v * 16807) % 2147483647;
        return (v - 1) / 2147483646;
      };
    }

    /* 画面が小さいほどノードを減らしてモバイルの負荷を抑える */
    function countFor(w, h) {
      return Math.round(Math.min(72, Math.max(18, (w * h) / 22000)));
    }

    function build(n) {
      var rnd = seeded(20160202);
      nodes = new Array(n);
      for (var i = 0; i < n; i++) {
        nodes[i] = {
          x: rnd() * W,
          y: rnd() * H,
          vx: (rnd() - 0.5) * 0.22,
          vy: (rnd() - 0.5) * 0.22,
          r: 0.9 + rnd() * 1.9,
          c: rnd() > 0.62 ? "0,194,168" : "15,107,224"
        };
      }
    }

    function resize() {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;   /* 非表示時の 0 サイズを回避 */

      var pw = W, ph = H;
      W = r.width;
      H = r.height;

      /* モバイルはDPR 1.5で打ち止め（2.0との差はほぼ視認できない一方、
         描画ピクセル数は1.8倍になる） */
      DPR = Math.min(devicePixelRatio || 1, W < 768 ? 1.5 : 2);
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);

      /* ノード数が変わらないなら座標をスケールして配置を維持する
         （アドレスバー開閉のたびに絵が作り直されるのを防ぐ） */
      var n = countFor(W, H);
      if (nodes.length === n && pw > 0 && ph > 0) {
        var sx = W / pw, sy = H / ph;
        for (var i = 0; i < n; i++) { nodes[i].x *= sx; nodes[i].y *= sy; }
      } else {
        build(n);
      }
      return true;
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
      if (!W || !H) { raf = null; return; }
      g.clearRect(0, 0, W, H);

      var narrow = W < 768;
      var cx = narrow ? W * 0.5 : W * 0.74;
      var cy = narrow ? H * 0.3 : H * 0.46;
      var R = Math.min(W, H) * (narrow ?
