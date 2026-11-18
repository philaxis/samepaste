// Visit statistics (GA4). Emitted only when site/config.mjs has a measurement ID; the inline script
// in <head> (build.mjs gaHead) decides the region and defines __spStats.load(), which sets the
// consent defaults and loads gtag.
//  - Where consent comes first (EEA/UK/CH, EU overseas regions, or a time zone that doesn't tell:
//    empty, UTC, Etc/*): nothing from Google is loaded until "allow"; the banner asks (not when framed).
//  - Everywhere: the footer button turns statistics off (remembered in localStorage) and back on.
//  - Events: cta_click, download_click, scene_view, scene_leave, scene_pick, lang_switch, scroll at
//    90%, and LCP / INP / CLS on leaving. Values are fixed words only (scene ids, buckets, places).
//  - Every event waits until statistics count: in the ask regions that is after "allow".
(function () {
  var S = window.__spStats;
  if (!S) return;
  var ls = {};
  try {
    ls = window.localStorage || {};
  } catch (e) {}
  var get = function (k) {
    try {
      return ls.getItem ? ls.getItem(k) : null;
    } catch (e) {
      return null;
    }
  };
  var put = function (k, v) {
    try {
      if (!ls.setItem) return;
      if (v === null) ls.removeItem(k);
      else ls.setItem(k, v);
    } catch (e) {}
  };
  // gtag exists only once __spStats.load() has run; until then there is nothing to tell
  var gtag = function () {
    if (window.gtag) window.gtag.apply(null, arguments);
  };

  function counting() {
    if (get("sp-stats") === "off") return false;
    var c = get("sp-consent");
    return S.eu ? c === "granted" : c !== "denied";
  }

  function dropCookies() {
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!/^_ga/.test(name)) return;
      var host = location.hostname.split(".");
      for (var i = 0; i < host.length; i++) {
        var d = host.slice(i).join(".");
        document.cookie = name + "=; Max-Age=0; path=/; domain=" + d;
      }
      document.cookie = name + "=; Max-Age=0; path=/";
    });
  }

  // footer: "statistics are on/off" and the button that flips it
  var ctl = document.querySelector(".stats-ctl");
  var btn = ctl && ctl.querySelector("[data-stats-toggle]");
  function paint() {
    if (!ctl) return;
    var on = counting();
    ctl.hidden = false;
    ctl.querySelector("[data-on]").hidden = !on;
    ctl.querySelector("[data-off]").hidden = on;
    btn.textContent = on ? btn.dataset.labelOff : btn.dataset.labelOn;
  }
  if (btn) {
    btn.addEventListener("click", function () {
      if (counting()) {
        put("sp-stats", "off");
        put("sp-consent", "denied");
        gtag("consent", "update", { analytics_storage: "denied" });
        window["ga-disable-" + S.id] = true;
        dropCookies();
      } else {
        put("sp-stats", null);
        put("sp-consent", "granted");
        window["ga-disable-" + S.id] = false;
        if (S.loaded) gtag("consent", "update", { analytics_storage: "granted" });
        else S.load();
      }
      hideBanner();
      paint();
    });
  }

  // banner: only where consent comes first, only until a choice is made, and never inside a frame
  // (a page that frames this one could otherwise lead a click onto "allow")
  var banner = document.querySelector(".consent");
  function hideBanner() {
    if (banner) banner.hidden = true;
  }
  var framed = true;
  try {
    framed = window.top !== window.self;
  } catch (e) {}
  if (banner && S.eu && !framed && get("sp-stats") !== "off" && !get("sp-consent")) {
    banner.hidden = false;
    banner.querySelectorAll("[data-consent]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.consent;
        put("sp-consent", v);
        if (v === "granted") {
          if (S.loaded) gtag("consent", "update", { analytics_storage: "granted" });
          else S.load();
        } else {
          gtag("consent", "update", { analytics_storage: "denied" });
          dropCookies();
        }
        hideBanner();
        paint();
      });
    });
  }
  paint();

  if (get("sp-stats") === "off") return;
  // Every event waits for consent (counting): before "allow", after "don't allow" or "turn off", none.
  var send = function (name, params) {
    if (!counting()) return;
    params = params || {};
    if (window.spFirstScene) params.first_scene = window.spFirstScene;
    params.transport_type = "beacon";
    gtag("event", name, params);
  };

  // Scene ids as data-scene-view (lecture, address, search, otp on the home page; otp, link,
  // photo_ai, tablet_note on the use pages). lastScene feeds download_click.
  var lastScene = "none";
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-cta], a[data-lang]");
    if (!a) return;
    if (a.dataset.cta) {
      send("cta_click", { store: a.dataset.cta, place: a.dataset.place || "" });
      if (a.dataset.cta !== "notify") send("download_click", { store: a.dataset.cta, last_scene: lastScene });
    } else if (!a.hasAttribute("aria-current")) send("lang_switch", { to: a.dataset.lang });
  });

  // A scene counts once it sits at least half inside the middle half of the screen for over a second
  // (in the home carousel: and is the card in front): scene_view once per scene, then scene_leave
  // once with how long it stayed when it first leaves.
  var bucket = function (ms) {
    return ms < 3000 ? "<3s" : ms < 10000 ? "3–10s" : ms < 30000 ? "10–30s" : "30s+";
  };
  var scenes = {};
  function leave(id, now) {
    var s = scenes[id];
    if (!s || !s.since) return;
    clearTimeout(s.timer);
    s.timer = 0;
    if (s.viewed && !s.left) {
      s.left = true;
      send("scene_leave", { scene: id, dwell: bucket(now - s.since) });
    }
    s.since = 0;
  }
  function judge(el) {
    var id = el.dataset.sceneView;
    var s = (scenes[id] = scenes[id] || {});
    // stacked (no carousel script, or reduced motion) every scene counts like on a read page
    var carousel = el.closest("[data-carousel]") && document.documentElement.classList.contains("js");
    var inside = s.band && (!carousel || el.classList.contains("on"));
    if (inside && !s.since) {
      s.since = Date.now();
      s.timer = setTimeout(function () {
        s.timer = 0;
        lastScene = id;
        if (s.viewed) return;
        s.viewed = true;
        send("scene_view", { scene: id });
      }, 1000);
    } else if (!inside && s.since) leave(id, Date.now());
  }
  var sceneEls = document.querySelectorAll("[data-scene-view]");
  if ("IntersectionObserver" in window) {
    var mid = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          var id = en.target.dataset.sceneView;
          var s = (scenes[id] = scenes[id] || {});
          var band = en.rootBounds ? en.rootBounds.height : innerHeight / 2;
          s.band = en.isIntersecting && en.intersectionRect.height >= Math.min(en.boundingClientRect.height, band) * 0.5;
          judge(en.target);
        });
      },
      { rootMargin: "-25% 0px -25% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    sceneEls.forEach(function (el) {
      mid.observe(el);
    });
    // the carousel says when the card in front changes
    document.addEventListener("sp:scene", function () {
      sceneEls.forEach(judge);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden")
        Object.keys(scenes).forEach(function (id) {
          leave(id, Date.now());
        });
    });
  }

  // The home carousel calls spScenePick(id, "bar"|"arrow"|"swipe") when the visitor picks a scene,
  // having set window.spFirstScene (its random first scene for this visit) before anything is sent.
  var HOW = { bar: 1, arrow: 1, swipe: 1 };
  window.spScenePick = function (id, how) {
    if (document.querySelector('[data-carousel] [data-scene-view="' + id + '"]') && HOW[how]) send("scene_pick", { scene: id, how: how });
  };
  var scrolled = false;
  function onScroll() {
    var d = document.documentElement;
    if (scrolled || (window.scrollY + window.innerHeight) / d.scrollHeight < 0.9) return;
    scrolled = true;
    window.removeEventListener("scroll", onScroll);
    send("scroll", { percent_scrolled: 90 });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // Web vitals, the small version: LCP, CLS (largest 5 s session window) and INP (slowest interaction).
  if (!("PerformanceObserver" in window)) return;
  var lcp = 0;
  var cls = 0;
  var win = 0;
  var winStart = 0;
  var winLast = 0;
  var inp = 0;
  function watch(type, fn, opts) {
    try {
      new PerformanceObserver(function (l) {
        l.getEntries().forEach(fn);
      }).observe(Object.assign({ type: type, buffered: true }, opts || {}));
    } catch (e) {}
  }
  watch("largest-contentful-paint", function (e) {
    lcp = e.startTime;
  });
  watch("layout-shift", function (e) {
    if (e.hadRecentInput) return;
    if (win && e.startTime - winLast < 1000 && e.startTime - winStart < 5000) win += e.value;
    else {
      win = e.value;
      winStart = e.startTime;
    }
    winLast = e.startTime;
    if (win > cls) cls = win;
  });
  watch(
    "event",
    function (e) {
      if (e.interactionId && e.duration > inp) inp = e.duration;
    },
    { durationThreshold: 40 },
  );
  var rate = function (v, good, poor) {
    return v <= good ? "good" : v <= poor ? "needs-improvement" : "poor";
  };
  var sent = false;
  document.addEventListener("visibilitychange", function () {
    if (sent || document.visibilityState !== "hidden") return;
    sent = true;
    if (lcp) send("LCP", { value: Math.round(lcp), metric_value: lcp, metric_rating: rate(lcp, 2500, 4000), non_interaction: true });
    send("CLS", { value: Math.round(cls * 1000), metric_value: cls, metric_rating: rate(cls, 0.1, 0.25), non_interaction: true });
    if (inp) send("INP", { value: Math.round(inp), metric_value: inp, metric_rating: rate(inp, 200, 500), non_interaction: true });
  });
})();
