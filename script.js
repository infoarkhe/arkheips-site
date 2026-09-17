(function () {
  "use strict";

  var root = document.documentElement;
  var gate = document.querySelector(".gate");
  var reduceMotion = root.dataset.motion === "reduce";
  var search = window.location.search;

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ?static : animasyonlar bitmis halde donar (gorsel kontrol) */
  var isStatic = /[?&]static\b/.test(search);
  if (gate && isStatic) gate.classList.add("is-static");

  /* ?lite / ?full : hafif modu elle ac veya kapat */
  var forceLite = /[?&]lite\b/.test(search);
  var probing = /[?&]probe\b/.test(search);
  var forceFull = /[?&]full\b/.test(search) || (probing && !forceLite);

  /* ?no=glow,pulse,video,traces,grid,watermark,wave,tint,anim : katmanlari kapat (teshis) */
  var noMatch = search.match(/[?&]no=([a-z,]+)/);
  var off = noMatch ? noMatch[1].split(",") : [];
  if (gate) off.forEach(function (k) { gate.classList.add("no-" + k); });
  function isOff(k) { return off.indexOf(k) !== -1; }

  /* ?probe=1 : 4 saniye kare suresi olc, sonucu sayfaya yaz */
  if (probing) {
    var stamps = [];
    var probeStart = 0;
    function probeFrame(ts) {
      if (!probeStart) probeStart = ts;
      stamps.push(ts);
      if (ts - probeStart < 4000) { requestAnimationFrame(probeFrame); return; }
      var dts = [];
      for (var i = 1; i < stamps.length; i++) dts.push(stamps[i] - stamps[i - 1]);
      dts.sort(function (a, b) { return a - b; });
      var sum = dts.reduce(function (a, b) { return a + b; }, 0);
      var res = {
        frames: dts.length,
        avg: +(sum / dts.length).toFixed(1),
        p95: +dts[Math.floor(dts.length * 0.95)].toFixed(1),
        over33: dts.filter(function (d) { return d > 33; }).length
      };
      var el = document.createElement("div");
      el.id = "probe";
      el.textContent = JSON.stringify(res);
      document.body.appendChild(el);
      document.title = "PROBE " + el.textContent;
    }
    setTimeout(function () { requestAnimationFrame(probeFrame); }, 1500);
    var hold = new Image();
    hold.src = "__hold";
    hold.style.display = "none";
    document.body.appendChild(hold);
  }

  /* ---------- Hafif mod ---------- */
  var liteOn = false;
  function setLite(on) {
    if (!gate || liteOn === on) return;
    liteOn = on;
    gate.classList.toggle("is-lite", on);
    if (pcb) pcb.configure();
  }

  function pickInitialMode() {
    if (forceFull) return false;
    if (forceLite) return true;
    var nav = window.navigator || {};
    var cores = nav.hardwareConcurrency || 8;
    var mem = nav.deviceMemory || 8;
    var saveData = nav.connection && nav.connection.saveData;
    return cores <= 2 || mem <= 2 || !!saveData;
  }

  /* ---------- Arka plan videolari ---------- */
  var blocked = [];
  var videos = Array.prototype.slice.call(document.querySelectorAll(".bg-video[data-src]"));

  function play(video) {
    if (document.hidden) return;
    video.muted = true;
    var p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        if (blocked.indexOf(video) === -1) blocked.push(video);
      });
    }
  }

  function retryBlocked() {
    var pending = blocked.slice();
    blocked.length = 0;
    pending.forEach(function (v) { if (v.paused) play(v); });
  }

  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(function (evt) {
    window.addEventListener(evt, retryBlocked, { once: true, passive: true });
  });

  function loadVideo(video) {
    var url = video.getAttribute("data-src");
    if (!url) return;

    function ready() { video.classList.add("is-ready"); }
    video.addEventListener("playing", ready, { once: true });
    video.addEventListener("loadeddata", ready, { once: true });

    fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var typed = blob.type === "video/mp4" ? blob : blob.slice(0, blob.size, "video/mp4");
        video.src = URL.createObjectURL(typed);
        video.removeAttribute("data-src");
        play(video);
      })
      .catch(function () {
        video.src = url;
        play(video);
      });
  }

  function startVideos() {
    if (reduceMotion || isOff("video")) return;
    videos.forEach(loadVideo);
  }

  if (document.readyState === "complete" || probing) startVideos();
  else window.addEventListener("load", startVideos, { once: true });

  /* ---------- Canvas cizici: PCB izleri ve dalga ----------
     Neden canvas: SVG uzerindeki dash animasyonu her karede tum paneli
     yeniden rasterize ettiriyordu. Burada kare hizi ve cozunurluk bizde. */
  var pcb = (function () {
    var canvas = document.querySelector("canvas.pcb");
    var wave = document.querySelector("canvas.wave");
    var dataEl = document.getElementById("pcb-data");
    if (!canvas || !dataEl) return null;

    var VW = 800, VH = 1000, CYCLE = 11000;
    var COPPER = "226,180,90", COPPER2 = "240,207,138", BOARD = "6,9,12";
    var CYAN = "62,224,255", CYAN2 = "74,168,255";

    var raw = JSON.parse(dataEl.textContent);
    var traces = raw.map(function (pts, i) {
      var segs = [], total = 0;
      for (var k = 1; k < pts.length; k++) {
        var L = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        segs.push(L); total += L;
      }
      var thin = i % 3 === 0;
      return { pts: pts, segs: segs, total: total, delay: ((i * 0.37) % 11) * 1000, thin: thin, o: thin ? 0.6 : 0.85, via: pts.length >= 3 && i % 2 === 0 };
    });
    var pulses = [1, 5, 9, 13, 17, 21].map(function (ti, j) {
      return { tr: traces[ti], dur: (2.6 + j * 0.45) * 1000, begin: j * 700 };
    });
    var feet = [[70, 120, 0], [690, 150, 90], [90, 880, 90], [700, 860, 0], [120, 500, 90], [690, 520, 90]];

    var ctx = canvas.getContext("2d", { alpha: true });
    var wctx = wave ? wave.getContext("2d", { alpha: true }) : null;
    var cfg = { fps: 20, res: 0.75, glow: true, pulse: true };
    var running = false, timer = 0, stopped = false;
    var sprite = null;

    function configure() {
      var lite = gate && gate.classList.contains("is-lite");
      cfg.fps = lite ? 12 : 20;
      cfg.res = lite ? 0.6 : 0.75;
      cfg.glow = !lite && !isOff("glow");
      cfg.pulse = !lite && !isOff("pulse");
      sprite = null;
    }

    function fit(c) {
      var r = c.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2) * cfg.res;
      var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      return { w: w, h: h };
    }

    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

    function pointAt(tr, dist) {
      var pts = tr.pts, d = dist;
      for (var k = 0; k < tr.segs.length; k++) {
        if (d <= tr.segs[k] || k === tr.segs.length - 1) {
          var f = tr.segs[k] ? Math.max(0, Math.min(1, d / tr.segs[k])) : 0;
          return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
        }
        d -= tr.segs[k];
      }
      return pts[pts.length - 1];
    }

    function strokeTrace(tr, s, ox, oy, upto) {
      ctx.beginPath();
      var pts = tr.pts, left = upto;
      ctx.moveTo(ox + pts[0][0] * s, oy + pts[0][1] * s);
      for (var k = 0; k < tr.segs.length; k++) {
        if (left >= tr.segs[k]) {
          ctx.lineTo(ox + pts[k + 1][0] * s, oy + pts[k + 1][1] * s);
          left -= tr.segs[k];
        } else {
          var f = tr.segs[k] ? left / tr.segs[k] : 0;
          ctx.lineTo(ox + (pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f) * s, oy + (pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f) * s);
          break;
        }
      }
      ctx.stroke();
    }

    function phaseOf(delay, now) {
      return (((now - delay) % CYCLE) + CYCLE) % CYCLE / CYCLE;
    }

    /* Iz: 0-4% belirir, 0-28% cizilir, 78-92% soner */
    function traceState(tr, now) {
      if (isStatic || isOff("anim")) return { alpha: 1, prog: 1 };
      var ph = phaseOf(tr.delay, now), alpha, prog;
      if (ph < 0.04) alpha = ph / 0.04; else if (ph < 0.78) alpha = 1; else if (ph < 0.92) alpha = 1 - (ph - 0.78) / 0.14; else alpha = 0;
      if (ph < 0.28) prog = easeOut(ph / 0.28); else if (ph < 0.92) prog = 1; else prog = 0;
      return { alpha: alpha, prog: prog };
    }

    /* Pad: iz bittikten sonra belirir, buyuyup oturur, 72-86% soner */
    function padState(delay, now) {
      if (isStatic || isOff("anim")) return { alpha: 1, scale: 1 };
      var ph = phaseOf(delay, now);
      if (ph < 0.06) return { alpha: ph / 0.06, scale: 0.4 + 0.85 * (ph / 0.06) };
      if (ph < 0.10) return { alpha: 1, scale: 1.25 - 0.25 * ((ph - 0.06) / 0.04) };
      if (ph < 0.72) return { alpha: 1, scale: 1 };
      if (ph < 0.86) return { alpha: 1 - (ph - 0.72) / 0.14, scale: 1 };
      return { alpha: 0, scale: 1 };
    }

    function pad(x, y, r, st, s) {
      if (st.alpha <= 0.01) return;
      ctx.globalAlpha = st.alpha;
      ctx.beginPath(); ctx.arc(x, y, r * st.scale * s, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(" + BOARD + ")"; ctx.fill();
      ctx.lineWidth = 2 * s; ctx.strokeStyle = "rgb(" + COPPER2 + ")"; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.2 * st.scale * s, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(" + COPPER2 + ")"; ctx.fill();
    }

    function makeSprite(s) {
      var R = Math.max(6, Math.round(11 * s));
      var c = document.createElement("canvas"); c.width = c.height = R * 2;
      var g = c.getContext("2d");
      var grad = g.createRadialGradient(R, R, 0, R, R, R);
      grad.addColorStop(0, "rgba(255,247,230,1)");
      grad.addColorStop(0.35, "rgba(240,207,138,0.9)");
      grad.addColorStop(1, "rgba(226,180,90,0)");
      g.fillStyle = grad; g.fillRect(0, 0, R * 2, R * 2);
      return c;
    }

    function drawPcb(now) {
      var size = fit(canvas), w = size.w, h = size.h;
      var s = Math.max(w / VW, h / VH), ox = (w - VW * s) / 2, oy = (h - VH * s) / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round"; ctx.lineJoin = "round";

      var i, tr, st, upto;
      var passes = cfg.glow ? [[12, 0.07, COPPER2], [5.5, 0.17, COPPER2], [0, 1, COPPER]] : [[0, 1, COPPER]];
      for (var p = 0; p < passes.length; p++) {
        var wmul = passes[p][0], amul = passes[p][1], col = passes[p][2];
        for (i = 0; i < traces.length; i++) {
          tr = traces[i]; st = traceState(tr, now);
          if (st.alpha <= 0.01 || st.prog <= 0) continue;
          upto = tr.total * st.prog;
          ctx.globalAlpha = Math.min(1, st.alpha * (wmul ? amul : tr.o));
          ctx.lineWidth = (wmul ? wmul : (tr.thin ? 1.4 : 2.2)) * s;
          ctx.strokeStyle = "rgb(" + col + ")";
          strokeTrace(tr, s, ox, oy, upto);
        }
      }

      for (i = 0; i < traces.length; i++) {
        tr = traces[i];
        if (tr.via) { var v = tr.pts[1]; pad(ox + v[0] * s, oy + v[1] * s, 3.6, padState(tr.delay + 1200, now), s); }
        var e = tr.pts[tr.pts.length - 1];
        pad(ox + e[0] * s, oy + e[1] * s, 6.5, padState(tr.delay + 2600, now), s);
      }

      if (cfg.pulse && !isStatic) {
        if (!sprite) sprite = makeSprite(s);
        ctx.globalAlpha = 1;
        for (i = 0; i < pulses.length; i++) {
          var pu = pulses[i];
          var f = (((now - pu.begin) % pu.dur) + pu.dur) % pu.dur / pu.dur;
          var pt = pointAt(pu.tr, pu.tr.total * f);
          ctx.drawImage(sprite, ox + pt[0] * s - sprite.width / 2, oy + pt[1] * s - sprite.height / 2);
        }
      }

      /* bilesen ayak izleri */
      ctx.globalAlpha = 0.55;
      for (i = 0; i < feet.length; i++) {
        var fx = ox + feet[i][0] * s, fy = oy + feet[i][1] * s;
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(feet[i][2] * Math.PI / 180);
        ctx.fillStyle = "rgba(10,14,18,0.9)"; ctx.strokeStyle = "rgba(240,207,138,0.55)"; ctx.lineWidth = 1.5 * s;
        ctx.beginPath(); ctx.rect(-16 * s, -7 * s, 32 * s, 14 * s); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(226,180,90,0.75)";
        ctx.fillRect(-22 * s, -4 * s, 6 * s, 8 * s); ctx.fillRect(16 * s, -4 * s, 6 * s, 8 * s);
        ctx.restore();
      }

      /* kose etiketleri (dar ekranda gizli) */
      if (w / (window.devicePixelRatio || 1) / cfg.res > 880) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "rgb(" + COPPER2 + ")";
        ctx.font = Math.round(10 * s) + "px Consolas, 'Courier New', monospace";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("X R E V E R S E  ·  T R A C E", ox + 44 * s, oy + 60 * s);
        ctx.fillText("L A Y E R  1  ·  T O P", ox + 560 * s, oy + 972 * s);
      }
      ctx.globalAlpha = 1;
    }

    /* Dalga: iki sinüs, kayan kesik cizgi */
    var wavePts = null;
    function drawWave(now) {
      if (!wave || !wctx) return;
      var size = fit(wave), w = size.w, h = size.h;
      wctx.clearRect(0, 0, w, h);
      var sx = w / 800, sy = h / 140;
      var off1 = isStatic ? 0 : -((now / 1000) * 50) % 160;
      var off2 = isStatic ? 0 : -((now / 1000) * 34.8) % 160;
      function curve(yc, amp, phase, dash, offset, width, alpha, col) {
        wctx.beginPath();
        for (var x = 0; x <= 800; x += 10) {
          var y = yc + amp * Math.sin((x / 180) * Math.PI + phase);
          if (x === 0) wctx.moveTo(x * sx, y * sy); else wctx.lineTo(x * sx, y * sy);
        }
        wctx.setLineDash(dash.map(function (d) { return d * sx; }));
        wctx.lineDashOffset = offset * sx;
        wctx.lineWidth = width * Math.min(sx, 1.4);
        wctx.globalAlpha = alpha;
        wctx.strokeStyle = "rgb(" + col + ")";
        wctx.lineCap = "round";
        wctx.stroke();
      }
      if (cfg.glow) {
        curve(70, -50, 0, [6, 10], off1, 10, 0.09, CYAN);
        curve(70, -50, 0, [6, 10], off1, 4.5, 0.2, CYAN);
      }
      curve(70, -50, 0, [6, 10], off1, 1.6, 1, CYAN);
      curve(84, -44, 0.4, [2, 14], off2, 1.6, 0.45, CYAN2);
      wctx.globalAlpha = 1;
    }

    function frame() {
      var now = performance.now();
      if (!isOff("traces")) drawPcb(now);
      if (!isOff("wave")) drawWave(now);
    }

    function tick() {
      if (!running) return;
      timer = setTimeout(function () {
        requestAnimationFrame(function () { frame(); tick(); });
      }, 1000 / cfg.fps);
    }

    function start() {
      if (stopped || isStatic || isOff("anim") || reduceMotion) { frame(); return; }
      if (running) return;
      running = true; tick();
    }

    function stop() { running = false; clearTimeout(timer); }

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { sprite = null; frame(); }, 120);
    });

    configure();
    return { start: start, stop: stop, configure: configure, frame: frame };
  })();

  setLite(pickInitialMode());
  if (pcb) pcb.start();

  /* Ilk saniyelerde kare suresini olc; cok dusukse hafif moda gec */
  if (!forceFull && !liteOn && !reduceMotion && !isStatic) {
    var samples = 0, slow = 0, last = 0;
    function probe(ts) {
      if (last) {
        var dt = ts - last;
        if (dt > 0 && dt < 1000) { samples++; if (dt > 40) slow++; }
      }
      last = ts;
      if (samples < 90) requestAnimationFrame(probe);
      else if (slow / samples > 0.4) setLite(true);
    }
    setTimeout(function () { requestAnimationFrame(probe); }, 2000);
  }

  /* ---------- Sekme gizlenince her sey durur ---------- */
  function pauseAll() {
    if (gate) gate.classList.add("is-paused");
    videos.forEach(function (v) { if (!v.paused) v.pause(); });
    if (pcb) pcb.stop();
  }

  function resumeAll() {
    if (gate) gate.classList.remove("is-paused");
    videos.forEach(function (v) { if (v.src && v.paused) play(v); });
    if (pcb) pcb.start();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pauseAll(); else resumeAll();
  });
  window.addEventListener("pagehide", pauseAll);

  /* ---------- Canli kW degeri ---------- */
  var kwEl = document.getElementById("live-kw");
  if (kwEl && !reduceMotion) {
    var base = 68.4, current = base, target = base, tickN = 0;
    function pickTarget() { target = Math.max(52, Math.min(84, base + (Math.random() - 0.5) * 6.5)); }
    pickTarget();
    setInterval(function () {
      if (document.hidden) return;
      if (++tickN % 9 === 0) pickTarget();
      current += (target - current) * 0.18;
      kwEl.textContent = current.toFixed(2);
    }, 160);
  }

  /* ---------- Klavye ---------- */
  var panes = Array.prototype.slice.call(document.querySelectorAll(".pane"));
  document.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var idx = panes.indexOf(document.activeElement);
    var next = e.key === "ArrowRight" ? Math.min(panes.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (idx === -1) next = e.key === "ArrowRight" ? 1 : 0;
    if (panes[next]) panes[next].focus();
  });
})();
