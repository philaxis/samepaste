// Page behaviour. Without this file the HTML already shows everything: headings in full, every
// demo at its last frame, the notify address as text. (The home carousel is home.js.)
//  - typed headings when they reach the 40% line
//  - the scene demos on the use pages (played once each time they come into view)
//  - "view in <your language>" line when the browser prefers another of our languages
//  - "copy address" next to the notify mail link
(function () {
  window.__motionReady = true;
  var root = document.documentElement;
  var motion = root.classList.contains("js");

  /** Marks [data-reveal] elements with data-in the first time they are reached. */
  function reveal() {
    var make = function (margin) {
      return new IntersectionObserver(
        function (entries, io) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            e.target.dataset.in = "";
            io.unobserve(e.target);
          });
        },
        { rootMargin: margin },
      );
    };
    // Everything above the 40% line counts, so a fast fling or a #link jump never skips a heading.
    var line = make("100000px 0px -60% 0px");
    var view = make("100000px 0px -12% 0px");
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      (el.dataset.reveal === "line" ? line : view).observe(el);
    });
  }

  function center(node, box) {
    var r = node.getBoundingClientRect();
    return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
  }

  /** Moves a demo's copy of the item along an arc between two elements; p in [0, 1], or null to hide it. */
  function flyer(el) {
    var item = el.querySelector(".sp-fly");
    return function (a, b, p) {
      if (p === null) {
        item.style.opacity = "0";
        return;
      }
      var box = el.getBoundingClientRect();
      var s = center(a, box);
      var e = center(b, box);
      var cx = (s[0] + e[0]) / 2;
      var cy = Math.min(s[1], e[1]) - Math.min(90, Math.hypot(e[0] - s[0], e[1] - s[1]) * 0.35);
      var q = 1 - Math.pow(1 - p, 3); // ease-out cubic
      var x = (1 - q) * (1 - q) * s[0] + 2 * (1 - q) * q * cx + q * q * e[0];
      var y = (1 - q) * (1 - q) * s[1] + 2 * (1 - q) * q * cy + q * q * e[1];
      var w = item.offsetWidth;
      // kept inside the panel, so a long address next to the phone's edge is never cut off
      var left = Math.max(8, Math.min(box.width - w - 8, x - w / 2));
      // fades in as it lifts off and out as the pasted copy appears under it
      item.style.opacity = String(Math.min(1, p / 0.12, (1 - p) / 0.2));
      item.style.transform =
        "translate(" + left + "px," + (y - item.offsetHeight / 2) + "px) scale(" + (0.92 + Math.sin(Math.PI * q) * 0.12) + ")";
    };
  }

  function set(el, name, on) {
    if (on) el.setAttribute("data-" + name, "");
    else el.removeAttribute("data-" + name);
  }

  // A scene, played once each time it comes into view: the thing is picked up on the first
  // device (selected, or the camera flashes), a copy of it flies across and is pasted on the second.
  // A one-phone scene swaps to its second app (data-swap) as the copy sets off.
  var S_PICK = 500;
  var S_FLY = [1100, 1900];
  var S_DONE = 1750;
  var S_END = 2600;

  function scene(el) {
    var fly = flyer(el);
    var src = el.querySelector(".sd-src");
    // lands on the pasted text itself when there is one (a field), else on the pasted picture
    var dst = el.querySelector(".sd-dst .sd-val") || el.querySelector(".sd-dst");
    var raf = 0;
    var start = 0;
    function frame(now) {
      var t = now - start;
      set(el, "pick", t >= S_PICK);
      set(el, "swap", t >= S_FLY[0]);
      set(el, "done", t >= S_DONE);
      if (t >= S_FLY[0] && t < S_FLY[1]) fly(src, dst, (t - S_FLY[0]) / (S_FLY[1] - S_FLY[0]));
      else fly(null, null, null);
      raf = t < S_END ? requestAnimationFrame(frame) : 0;
    }
    new IntersectionObserver(
      function (entries) {
        if (!entries[0].isIntersecting || raf) return;
        set(el, "done", false);
        set(el, "swap", false);
        set(el, "pick", false);
        start = performance.now();
        raf = requestAnimationFrame(frame);
      },
      { threshold: 0.6 },
    ).observe(el);
  }

  // One line at the very top when the browser prefers another of our languages. Never redirects.
  // Closing it, or picking a language in the menu, answers it for good in this browser.
  var OFFER = {
    en: ["View this page in English", "Close"],
    ko: ["한국어로 보기", "닫기"],
    ja: ["日本語で見る", "閉じる"],
    "zh-hans": ["查看简体中文版", "关闭"],
    "zh-hant": ["查看繁體中文版", "關閉"],
  };
  function preferred() {
    var list = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i]).toLowerCase();
      if (l.indexOf("zh") === 0) return /hant|-tw|-hk|-mo/.test(l) ? "zh-hant" : "zh-hans";
      var base = l.split("-")[0];
      if (OFFER[base]) return base;
    }
    return "";
  }
  function suggestLanguage() {
    var here = document.querySelector(".lang a[aria-current]");
    var want = preferred();
    if (!here || !want) return;
    var ls = {};
    try {
      ls = window.localStorage;
    } catch (e) {}
    var answer = function () {
      if (ls.setItem) ls.setItem("sp-lang-offer", want);
    };
    document.querySelectorAll(".lang a[data-lang]").forEach(function (a) {
      a.addEventListener("click", answer);
    });
    if (want === here.dataset.lang) return;
    if (ls.getItem && ls.getItem("sp-lang-offer") === want) return;
    var link = document.querySelector('.lang a[data-lang="' + want + '"]');
    if (!link) return;
    var bar = document.createElement("div");
    bar.className = "lang-offer";
    bar.setAttribute("lang", link.getAttribute("lang"));
    var a = document.createElement("a");
    a.href = link.getAttribute("href");
    a.textContent = OFFER[want][0];
    a.dataset.lang = want;
    var x = document.createElement("button");
    x.type = "button";
    x.className = "linkish";
    x.textContent = OFFER[want][1];
    x.addEventListener("click", function () {
      answer();
      bar.remove();
    });
    bar.appendChild(a);
    bar.appendChild(x);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function copyButtons() {
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      if (!navigator.clipboard) return;
      var label = b.textContent;
      b.hidden = false;
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(b.dataset.copy).then(function () {
          b.textContent = b.dataset.done;
          b.setAttribute("data-copied", "");
          setTimeout(function () {
            b.textContent = label;
            b.removeAttribute("data-copied");
          }, 2400);
        });
      });
    });
  }

  suggestLanguage();
  copyButtons();
  if (!motion) return;
  reveal();
  document.querySelectorAll(".sd").forEach(scene);
})();
