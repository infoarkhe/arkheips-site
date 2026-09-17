(function () {
  "use strict";

  var root = document.documentElement;
  var gate = document.querySelector(".gate");
  var reduceMotion = root.dataset.motion === "reduce";
  var search = window.location.search;

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ?static : animasyonlar bitmis halde donar (gorsel kontrol) */
  if (gate && /[?&]static\b/.test(search)) gate.classList.add("is-static");

  /* ?lite / ?full : hafif modu elle ac veya kapat */
  var forceLite = /[?&]lite\b/.test(search);
  var forceFull = /[?&]full\b/.test(search);

  /* ---------- Hafif mod: zayif makinede parlama ve isiklar kapanir ---------- */
  var liteOn = false;
  function setLite(on) {
    if (!gate || liteOn === on) return;
    liteOn = on;
    gate.classList.toggle("is-lite", on);
  }

  function pickInitialMode() {
    if (forceFull) return false;
    if (forceLite) return true;
    var nav = window.navigator || {};
    var cores = nav.hardwareConcurrency || 8;
    var mem = nav.deviceMemory || 8;
    var saveData = nav.connection && nav.connection.saveData;
    return cores <= 4 || mem <= 4 || !!saveData;
  }
  setLite(pickInitialMode());

  /* Ilk saniyelerde kare suresini olc; 33 ms uzeri (30 fps alti) ise hafif moda gec */
  if (!forceFull && !liteOn && !reduceMotion) {
    var samples = 0, slow = 0, last = 0;
    function probe(ts) {
      if (last) {
        var dt = ts - last;
        if (dt > 0 && dt < 1000) {
          samples++;
          if (dt > 33) slow++;
        }
      }
      last = ts;
      if (samples < 90) {
        requestAnimationFrame(probe);
      } else if (slow / samples > 0.35) {
        setLite(true);
      }
    }
    setTimeout(function () { requestAnimationFrame(probe); }, 1500);
  }

  /* ---------- Arka plan videolari: blob olarak yukle ---------- */
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
    if (reduceMotion) return;
    videos.forEach(loadVideo);
  }

  if (document.readyState === "complete") startVideos();
  else window.addEventListener("load", startVideos, { once: true });

  /* ---------- Sekme gizlenince her seyi durdur, gorununce devam et ---------- */
  var svgs = Array.prototype.slice.call(document.querySelectorAll("svg.pcb, svg.wave"));

  function pauseAll() {
    if (gate) gate.classList.add("is-paused");
    videos.forEach(function (v) { if (!v.paused) v.pause(); });
    svgs.forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });
  }

  function resumeAll() {
    if (gate) gate.classList.remove("is-paused");
    svgs.forEach(function (s) { if (s.unpauseAnimations) s.unpauseAnimations(); });
    videos.forEach(function (v) { if (v.src && v.paused) play(v); });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pauseAll();
    else resumeAll();
  });

  window.addEventListener("pagehide", pauseAll);

  /* ---------- Canli kW degeri: saniyede 6 guncelleme yeterli ---------- */
  var kwEl = document.getElementById("live-kw");
  if (kwEl && !reduceMotion) {
    var base = 68.4, current = base, target = base, tick = 0;
    function pickTarget() {
      target = Math.max(52, Math.min(84, base + (Math.random() - 0.5) * 6.5));
    }
    pickTarget();
    setInterval(function () {
      if (document.hidden) return;
      if (++tick % 9 === 0) pickTarget();
      current += (target - current) * 0.18;
      kwEl.textContent = current.toFixed(2);
    }, 160);
  }

  /* ---------- Klavye: ok tuslariyla panel secimi ---------- */
  var panes = Array.prototype.slice.call(document.querySelectorAll(".pane"));
  document.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var idx = panes.indexOf(document.activeElement);
    var next = e.key === "ArrowRight" ? Math.min(panes.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (idx === -1) next = e.key === "ArrowRight" ? 1 : 0;
    if (panes[next]) panes[next].focus();
  });
})();
