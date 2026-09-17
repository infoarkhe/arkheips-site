(function () {
  "use strict";

  var reduceMotion = document.documentElement.dataset.motion === "reduce";

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ?static : animasyonlari bitmis halde dondurur (gorsel kontrol icin) */
  if (/[?&]static\b/.test(window.location.search)) {
    var gate = document.querySelector(".gate");
    if (gate) gate.classList.add("is-static");
  }

  /* ---------- Arka plan videolari: blob olarak yukle, IDM gormesin ---------- */
  var blocked = [];

  function play(video) {
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
    pending.forEach(function (v) {
      if (v.paused) play(v);
    });
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

  var videos = Array.prototype.slice.call(document.querySelectorAll(".bg-video[data-src]"));

  function startVideos() {
    if (reduceMotion) return;
    videos.forEach(loadVideo);
  }

  if (document.readyState === "complete") {
    startVideos();
  } else {
    window.addEventListener("load", startVideos, { once: true });
  }

  /* ---------- Canli kW degeri ---------- */
  var kwEl = document.getElementById("live-kw");
  if (kwEl && !reduceMotion) {
    var base = 68.4;
    var current = base;
    var target = base;
    var lastTick = 0;

    function pickTarget() {
      var drift = (Math.random() - 0.5) * 6.5;
      target = Math.max(52, Math.min(84, base + drift));
    }

    function frame(ts) {
      if (ts - lastTick > 1400) {
        pickTarget();
        lastTick = ts;
      }
      current += (target - current) * 0.035;
      kwEl.textContent = current.toFixed(2);
      requestAnimationFrame(frame);
    }

    pickTarget();
    requestAnimationFrame(frame);
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
