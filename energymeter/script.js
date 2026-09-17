(function () {
  "use strict";

  const LIVE_DEMO_ENABLED = false;
  const LIVE_DEMO_URL = "https://vdo.ninja/?view=arkhesunum&room=azad&solo&cover&transparent&autostart&noaudio&bitrate=5000&codec=h264";

  var header = document.getElementById("site-header");
  var menuToggle = document.querySelector(".menu-toggle");
  var mobileMenu = document.getElementById("mobile-menu");
  var yearEl = document.getElementById("year");
  /* Hareket yalnizca sayfa acikca istediginde azaltilir,
     isletim sistemi ayari dikkate alinmaz. */
  var reduceMotion = document.documentElement.dataset.motion === "reduce";

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* Sticky navbar appearance */
  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-solid", window.scrollY > 12);
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile menu */
  function setMenu(open) {
    if (!menuToggle || !mobileMenu) return;
    mobileMenu.hidden = !open;
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    menuToggle.setAttribute("aria-label", open ? "Menüyü kapat" : "Menüyü aç");
  }

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", function () {
      setMenu(mobileMenu.hidden);
    });

    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setMenu(false);
      });
    });
  }

  /* Scroll reveal */
  var revealEls = document.querySelectorAll(".reveal");
  if (reduceMotion) {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  } else if ("IntersectionObserver" in window) {
    var revealObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) {
      revealObs.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /*
    Videolar dogrudan medya baglantisi olarak verilmez.
    Sayfa iceriden getirip blob olarak oynatir; boylece
    indirme yoneticileri (IDM vb.) akisi yakalayamaz.
  */
  function loadVideoSource(video) {
    var url = video.getAttribute("data-src");
    if (!url || video._srcLoading || video._srcReady) return video._srcPromise;

    video._srcLoading = true;
    video._srcPromise = fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var typed = blob.type === "video/mp4" ? blob : blob.slice(0, blob.size, "video/mp4");
        video.src = URL.createObjectURL(typed);
        video.removeAttribute("data-src");
        video._srcReady = true;
        video._srcLoading = false;
      })
      .catch(function () {
        /* Getirme basarisiz olursa dogrudan kaynaga dus, video kaybolmasin */
        video._srcLoading = false;
        if (!video._srcReady) {
          video.src = url;
          video._srcReady = true;
        }
      });

    return video._srcPromise;
  }

  /* Otomatik oynatma engellenirse ilk kullanici etkilesiminde tekrar dene */
  var blockedVideos = [];

  function retryBlocked() {
    var pending = blockedVideos.slice();
    blockedVideos.length = 0;
    pending.forEach(function (video) {
      if (video.paused) play(video);
    });
  }

  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(function (evt) {
    window.addEventListener(evt, retryBlocked, { once: true, passive: true });
  });

  function play(video) {
    video.muted = true;
    var p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        if (blockedVideos.indexOf(video) === -1) blockedVideos.push(video);
      });
    }
  }

  function attempt(video) {
    if (video._srcReady) {
      play(video);
      return;
    }
    var pending = loadVideoSource(video);
    if (pending) {
      pending.then(function () {
        play(video);
      });
    } else {
      play(video);
    }
  }

  document.querySelectorAll(".hero-product-video").forEach(function (video) {
    video.muted = true;
    video.setAttribute("playsinline", "");
    attempt(video);
  });

  /* Non-hero videos: play only when visible; never reset currentTime */
  var lazyVideos = document.querySelectorAll(".feature-video, .view-video, .co2-video");

  function isActiveTabVideo(video) {
    var pane = video.closest(".view-pane, .co2-pane");
    if (!pane) return true;
    return !pane.hidden;
  }

  function syncLazyVideo(video) {
    if (video.closest("[hidden]")) {
      video._inView = false;
    }
    var canPlay = !reduceMotion && video._inView && isActiveTabVideo(video);
    if (canPlay) {
      video.muted = true;
      attempt(video);
    } else {
      video.pause();
    }
  }

  function markInViewFromLayout(video) {
    if (video.closest("[hidden]")) {
      video._inView = false;
      return;
    }
    var rect = video.getBoundingClientRect();
    if (rect.height < 1) {
      video._inView = false;
      return;
    }
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    video._inView = visible / rect.height >= 0.25;
  }

  if ("IntersectionObserver" in window) {
    var videoObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var video = entry.target;
          video._inView = entry.isIntersecting && entry.intersectionRatio >= 0.25;
          syncLazyVideo(video);
        });
      },
      { threshold: 0.25 }
    );
    lazyVideos.forEach(function (video) {
      video._inView = false;
      videoObs.observe(video);
    });
  } else {
    lazyVideos.forEach(function (video) {
      video._inView = true;
      syncLazyVideo(video);
    });
  }

  /* Power view tabs */
  var tabButtons = document.querySelectorAll(".tab-btn");
  var panes = {
    kadran: document.getElementById("view-kadran"),
    dijital: document.getElementById("view-dijital"),
    osiloskop: document.getElementById("view-osiloskop"),
  };
  var viewVideos = document.querySelectorAll(".view-video");

  function playActiveVideo(name) {
    viewVideos.forEach(function (video) {
      var on = video.getAttribute("data-view") === name;
      if (!on) {
        video.pause();
        return;
      }
      markInViewFromLayout(video);
      syncLazyVideo(video);
    });
  }

  function showView(name) {
    tabButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-view") === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    Object.keys(panes).forEach(function (key) {
      var pane = panes[key];
      if (!pane) return;
      var on = key === name;
      pane.classList.toggle("is-active", on);
      pane.hidden = !on;
    });

    playActiveVideo(name);
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      showView(btn.getAttribute("data-view"));
    });
  });

  /* CO2 view tabs */
  var co2TabButtons = document.querySelectorAll(".co2-tab");
  var co2Panes = {
    kadran: document.getElementById("co2-pane-kadran"),
    dijital: document.getElementById("co2-pane-dijital"),
  };
  var co2Videos = document.querySelectorAll(".co2-video");

  function playActiveCo2Video(name) {
    co2Videos.forEach(function (video) {
      var on = video.getAttribute("data-co2-view") === name;
      if (!on) {
        video.pause();
        return;
      }
      markInViewFromLayout(video);
      syncLazyVideo(video);
    });
  }

  function showCo2View(name) {
    co2TabButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-co2-view") === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    Object.keys(co2Panes).forEach(function (key) {
      var pane = co2Panes[key];
      if (!pane) return;
      var on = key === name;
      pane.classList.toggle("is-active", on);
      pane.hidden = !on;
    });

    playActiveCo2Video(name);
  }

  co2TabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      showCo2View(btn.getAttribute("data-co2-view"));
    });
  });

  /* FAQ accordion */
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var trigger = item.querySelector(".faq-trigger");
    var panel = item.querySelector(".faq-panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", function () {
      var open = trigger.getAttribute("aria-expanded") === "true";
      document.querySelectorAll(".faq-item").forEach(function (other) {
        var t = other.querySelector(".faq-trigger");
        var p = other.querySelector(".faq-panel");
        other.classList.remove("is-open");
        if (t) t.setAttribute("aria-expanded", "false");
        if (p) p.hidden = true;
      });
      if (!open) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        panel.hidden = false;
      }
    });
  });

  /* Live demo: iframe and Telegram panel load only when LIVE_DEMO_ENABLED is true */
  var liveStage = document.getElementById("live-demo-stage");
  var liveOnair = document.getElementById("live-demo-onair");
  var liveStream = document.getElementById("live-demo-stream");
  if (LIVE_DEMO_ENABLED && liveOnair && liveStream) {
    if (liveStage) liveStage.hidden = true;
    liveOnair.hidden = false;
    var iframe = document.createElement("iframe");
    iframe.className = "live-demo-iframe";
    iframe.src = LIVE_DEMO_URL;
    iframe.title = "Canlı EnerjiMetre demosu";
    iframe.loading = "lazy";
    iframe.allow = "autoplay; encrypted-media; fullscreen";
    iframe.allowFullscreen = true;
    liveStream.appendChild(iframe);
  }

  /* Demo request via Formspree — visitor stays on the page */
  var form = document.getElementById("demo-form");
  var statusEl = document.getElementById("form-status");
  var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  var submitLabel = "2 Haftalık Ücretsiz Demo Talep Et";

  function setFormStatus(type, text) {
    if (!statusEl) return;
    statusEl.classList.remove("is-success", "is-error");
    if (type) statusEl.classList.add(type);
    statusEl.textContent = text;
  }

  function restoreSubmit() {
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.textContent = submitLabel;
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      setFormStatus("", "");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Gönderiliyor...";
      }

      fetch("https://formspree.io/f/mrpgoyre", {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          if (!res.ok) throw new Error("formspree");
          form.reset();
          setFormStatus("is-success", "Talebiniz alındı. En kısa sürede sizinle iletişime geçeceğiz.");
        })
        .catch(function () {
          setFormStatus("is-error", "Talep gönderilemedi. Lütfen tekrar deneyin.");
        })
        .then(restoreSubmit);
    });
  }
})();
