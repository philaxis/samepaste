// The home page carousel (home.mjs, home.css). Runs only with the .js class (the boot script leaves
// it off for reduced motion); without it the scenes stand stacked at their last frame.
//  - one row of scene cards; the one in front plays its own timeline, then the row moves on
//  - the pile is the shared clipboard: copying puts the item on it at once (nothing flies there); the
//    item copied gets a brief graphite ring and slides onto the clipboard's glass, one thing at a time.
//    Pasting drops a small copy of it from the clipboard into the field, which then gets the same ring
//  - bars, side cards, arrow keys and swipes pick a scene (window.spScenePick: bar, arrow, swipe)
//  - each visit starts on a random scene (kept for the session), told to stats.js as window.spFirstScene
//  - stats.js hears "sp:scene" whenever the scene in front changes (scene_view / scene_leave)
(function () {
  var root = document.documentElement;
  var story = document.querySelector("[data-carousel]");
  if (!story || !root.classList.contains("js")) return;
  var stage = story.querySelector(".stage");
  var pileEl = story.querySelector(".pile");
  var clamp = function (v, a, b) {
    return Math.min(b === undefined ? 1 : b, Math.max(a || 0, v));
  };
  // one motion language: every move uses this curve (home.css --motion) at 250–350 ms
  var MOTION = "cubic-bezier(0.16, 1, 0.3, 1)";
  // the devices of a scene come up to at most 1.3x their drawn size, as large as the card lets them
  var SPOT = 1.3;
  // timelines are written at a calm pace and played a little faster; each scene lingers 2s on its finished state
  var SPEED = 0.8;
  // hand-offs are written as [copied, pasted]
  var RAW = {
    basic: { marks: [600, 1200, 2200], flights: [[1200, 2200]] },
    map: { marks: [600, 1200, 2200, 2800, 3300], flights: [[1200, 2200]] },
    lecture: {
      marks: [600, 1200, 2100, 2900, 3700, 4600, 6600, 8800, 9400, 10300, 11100, 11700, 12600],
      flights: [
        [1200, 2100],
        [3700, 4600],
        [9400, 10300],
        [11700, 12600],
      ],
    },
    // the photo is in the message field the moment it is pasted (step 5)
    search: { marks: [600, 1300, 2100, 2700, 3500], flights: [[2700, 3500]] },
  };
  var PLANS = {};
  Object.keys(RAW).forEach(function (k) {
    var raw = RAW[k];
    var marks = raw.marks.map(function (m) {
      return m * SPEED;
    });
    // [copied, pasted], played
    var flights = raw.flights.map(function (f) {
      return f.map(function (t) {
        return t * SPEED;
      });
    });
    var hold = Math.max.apply(null, marks.concat([].concat.apply([], flights))) + 2000;
    PLANS[k] = { marks: marks, flights: flights, hold: hold, cycle: hold + 350 };
  });

  // where the pile sits: right of the headline, level with it, at one place for every card (right of the
  // widest headline). Phones, and wide screens where that does not fit, put it just under the headline.
  // The pile is the icon: the front sheet plus the sheet behind it, up and left by --off (home.css), so
  // it is placed by that whole shape and the front sheet's centre sits off/2 right of and below it.
  var SIDE_GAP = 44;
  function off() {
    return parseFloat(getComputedStyle(story).getPropertyValue("--off")) || 0;
  }
  function sideX() {
    var half = Math.max.apply(
      null,
      parts.map(function (p) {
        return p.copy.querySelector("h2").offsetWidth / 2;
      }),
    );
    return story.clientWidth / 2 + half + SIDE_GAP + off() + pileEl.offsetWidth / 2;
  }
  function setMode() {
    if (innerWidth <= 700) return (story.dataset.pile = "top");
    story.dataset.pile = "side";
    var edge = story.clientWidth / 2 + parts[0].sc.clientWidth / 2 - 24;
    if (sideX() + pileEl.offsetWidth / 2 > edge) story.dataset.pile = "top";
  }

  var parts = [].map.call(story.querySelectorAll(".scene"), function (sc) {
    var q = function (s) {
      return s && sc.querySelector(s);
    };
    var flights = ["", "2", "3", "4"]
      .filter(function (k) {
        return sc.dataset["src" + k];
      })
      .map(function (k) {
        var src = q(sc.dataset["src" + k]);
        var dst = q(sc.dataset["dst" + k]);
        src.classList.add("hend");
        dst.classList.add("hend");
        return { src: src, dst: dst, fly: document.querySelector(sc.dataset["fly" + k]), srcDev: src.closest(".dev"), dstDev: dst.closest(".dev") };
      });
    return {
      sc: sc,
      id: sc.dataset.sceneView,
      copy: sc.querySelector(".copy"),
      flights: flights,
      devs: [].slice.call(sc.querySelectorAll(".rig > .dev")),
      plan: PLANS[sc.dataset.plan || "basic"],
    };
  });
  function setStep(p, n) {
    for (var k = 1; k <= 13; k++) p.sc.classList.toggle("st" + k, n >= k);
  }
  parts.forEach(function (p) {
    setStep(p, 0);
    p.sc.classList.remove("on");
  });

  // devices take whatever height the headline (and, with the pile on top, the pile) leaves free in the card
  function size() {
    setMode();
    var mob = innerWidth <= 700;
    var rw = mob ? 700 : 960;
    var rh = mob ? 780 : 520;
    var sc = parts[0].sc;
    var cs = getComputedStyle(sc);
    var pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var text = Math.max.apply(
      null,
      parts.map(function (p) {
        return p.copy.offsetHeight + parseFloat(getComputedStyle(p.copy).marginBottom);
      }),
    );
    var bw = sc.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 28;
    var free = sc.clientHeight - pad - text - 16;
    var s = Math.max(0.2, Math.min((bw - 28) / rw, free / rh, 0.95));
    var sw = Math.max(0.2, Math.min((bw - 28) / 1420, free / 520, 0.95));
    // set on the story: body.home's own --s (home.css) would hide a value set on the root
    story.style.setProperty("--s", s.toFixed(4));
    story.style.setProperty("--sw", sw.toFixed(4));
  }

  // the pile is the icon and never changes: a glass front sheet with its clip and a graphite sheet behind.
  // What is copied sits straight on the glass, one thing at a time: a copy slides it down in from under
  // the clip while the thing before slides on down and out through the bottom edge. Nothing fades.
  var pile = (function () {
    var placed = false;
    var make = function (d) {
      var s = document.createElement("div");
      s.className = "sheet";
      s.dataset.d = d;
      s.innerHTML = '<div class="in"></div><i class="clip"></i>';
      return s;
    };
    // a text item is written on the glass; a photo is shown whole, scaled to fit
    var content = function (fly) {
      var item = fly.firstElementChild;
      var c = document.createElement("div");
      c.className = "c";
      if (item.classList.contains("pill")) {
        var t = document.createElement("p");
        t.className = "t";
        t.textContent = item.textContent.replace(/(\d)-(\d)/g, "$1\u2011$2"); // keep "41-1" on one line
        c.appendChild(t);
        return c;
      }
      var w = item.offsetWidth;
      var h = item.offsetHeight;
      var k = Math.min((pileEl.offsetWidth * 0.7) / w, (pileEl.offsetHeight * 0.6) / h);
      var box = document.createElement("div");
      box.className = "fit";
      box.style.width = w + "px";
      box.style.height = h + "px";
      box.style.transform = "translate(-50%, -50%) scale(" + k.toFixed(3) + ")";
      box.appendChild(item.cloneNode(true));
      c.appendChild(box);
      return c;
    };
    pileEl.appendChild(make(1));
    pileEl.appendChild(make(0));
    var tray = pileEl.querySelector('.sheet[data-d="0"] .in');
    var front = function () {
      return tray.querySelector('.note[data-n="0"]');
    };
    return {
      push: function (fly) {
        [].forEach.call(tray.querySelectorAll(".note"), function (n) {
          n.dataset.n = 1;
          setTimeout(n.remove.bind(n), 400);
        });
        var n = document.createElement("div");
        n.className = "note drop";
        n.dataset.n = 0;
        n.appendChild(content(fly));
        tray.appendChild(n);
        void n.offsetWidth;
        n.classList.remove("drop");
      },
      front: front,
      // x, y: the centre of the top sheet, in the story's own coordinates
      at: function (x, y) {
        var t = "translate(" + (x - pileEl.offsetWidth / 2).toFixed(1) + "px," + (y - pileEl.offsetHeight / 2).toFixed(1) + "px)";
        if (placed) {
          pileEl.style.transform = t;
          return;
        }
        pileEl.style.transition = "none";
        pileEl.style.transform = t;
        void pileEl.offsetWidth;
        pileEl.style.transition = "";
        pileEl.classList.add("placed");
        placed = true;
      },
    };
  })();

  // geometry from layout offsets, with the card where it settles (centred), so card transitions never skew it
  function cardBox(p) {
    var wrap = p.sc.querySelector(".rigwrap");
    var x0 = (story.clientWidth - p.sc.offsetWidth) / 2;
    var y0 = stage.offsetTop + p.sc.offsetTop;
    return { y0: y0, rigX: x0 + wrap.offsetLeft, rigY: y0 + wrap.offsetTop, k: wrap.offsetWidth / wrap.firstElementChild.offsetWidth || 1 };
  }
  // the pile's place in a card: right of the headline, or just under it in the room its margin keeps
  // for it (home.css --pile-lift). The same for every card.
  function placePile(p) {
    var y0 = cardBox(p).y0;
    if (story.dataset.pile === "side") {
      var h = p.copy.querySelector("h2");
      return pile.at(sideX(), y0 + p.copy.offsetTop + h.offsetTop + h.offsetHeight / 2 + off() / 2);
    }
    var lift = parseFloat(getComputedStyle(story).getPropertyValue("--pile-lift")) || 0;
    pile.at(story.clientWidth / 2 + off() / 2, y0 + p.copy.offsetTop + p.copy.offsetHeight + lift + pileEl.offsetHeight / 2);
  }

  // a paste: a copy of what is on the clipboard leaves it and drops into the field, shrinking to it on
  // the way; it starts exactly over the original, so it peels off rather than appearing
  var ghost = document.createElement("div");
  ghost.className = "pile pdrop";
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  function drop(to, ms) {
    var f = pile.front();
    if (!f) return;
    var a = f.getBoundingClientRect();
    var b = to.getBoundingClientRect();
    var k = clamp(Math.min(b.width / a.width, b.height / a.height), 0.25, 0.6);
    ghost.replaceChildren(f.cloneNode(true));
    ghost.style.setProperty("--pw", f.offsetWidth + "px");
    ghost.style.setProperty("--ph", f.offsetHeight + "px");
    ghost.animate(
      [
        { transform: "translate(" + a.left + "px," + a.top + "px) scale(1)", opacity: 1 },
        { transform: "translate(" + (b.left + b.width / 2 - (a.width * k) / 2) + "px," + (b.top + b.height / 2 - (a.height * k) / 2) + "px) scale(" + k + ")", opacity: 1 },
      ],
      { duration: ms, easing: MOTION },
    );
  }

  function hideFlyers(p) {
    ghost.getAnimations().forEach(function (a) {
      a.cancel();
    });
    p.flights.forEach(function (fl) {
      fl.src.classList.remove("lit");
      fl.dst.classList.remove("lit");
    });
  }

  var ENTER = 350;
  var raf = 0;
  var active = -1;
  var paused = false;
  var barBtns = [].slice.call(story.querySelectorAll(".rowctl .bar"));
  var barFills = barBtns.map(function (b) {
    return b.querySelector("b");
  });

  // the stand: on wide screens the devices stand still for the whole scene, side by side in the order
  // they are drawn, centred, at one size that fills the card. Phones keep the drawn places.
  function stand(p) {
    var clear = function (d) {
      d.style.removeProperty("--ds");
      d.style.removeProperty("--tx");
    };
    if (innerWidth <= 700) return p.devs.forEach(clear);
    var rig = p.sc.querySelector(".rig");
    var rw = rig.offsetWidth;
    var rh = rig.offsetHeight;
    var room = Math.max(rw, (p.sc.clientWidth - 48) / cardBox(p).k);
    var pad = Math.round(room * 0.04);
    var center = function (d) {
      return d.offsetLeft + d.offsetWidth / 2;
    };
    var base = function (d) {
      return parseFloat(getComputedStyle(d).getPropertyValue("--pb")) || 1;
    };
    var row = p.devs.slice().sort(function (a, b) {
      return center(a) - center(b);
    });
    var gaps = pad * (row.length - 1);
    var drawn = row.reduce(function (s, d) {
      return s + d.offsetWidth * base(d);
    }, 0);
    var fitH = Math.min.apply(
      null,
      row.map(function (d) {
        return (rh - (parseFloat(getComputedStyle(d).bottom) || 0)) / (d.offsetHeight * base(d));
      }),
    );
    var ds = Math.max(0.4, Math.min(SPOT, (room - gaps) / drawn, fitH));
    var x = rw / 2 - (drawn * ds + gaps) / 2;
    row.forEach(function (d) {
      var w = d.offsetWidth * base(d) * ds;
      d.style.setProperty("--ds", ds.toFixed(3));
      d.style.setProperty("--tx", (x + w / 2 - center(d)).toFixed(1) + "px");
      x += w + pad;
    });
  }
  // a hand-off only dims the devices that are not in it; nothing moves
  function focus(p, lit) {
    p.devs.forEach(function (d) {
      d.classList.toggle("back", lit.length > 0 && lit.indexOf(d) < 0);
    });
  }

  function play(p) {
    var plan = p.plan;
    var idx = parts.indexOf(p);
    var t0 = performance.now();
    var advanced = false;
    var shown = -1;
    var focusKey = "";
    var endKey = "";
    // each hand-off [copied, pasted] does its one-off things once per cycle
    var done = p.flights.map(function () {
      return { copied: false, dropped: false };
    });
    var loop = function (now) {
      var el = now - t0;
      var c = el < ENTER ? -1 : (el - ENTER) % plan.cycle;
      var step =
        c < 0 || c >= plan.hold
          ? 0
          : plan.marks.filter(function (m) {
              return c >= m;
            }).length;
      if (step !== shown) {
        shown = step;
        setStep(p, step);
      }
      // copied: it is on the clipboard at once. Pasted: a copy of it drops into the field just before
      p.flights.forEach(function (fl, k) {
        var f = plan.flights[k];
        var d = done[k];
        if (c < f[0]) d.copied = d.dropped = false;
        if (step > 0 && c >= f[0] && !d.copied) {
          d.copied = true;
          pile.push(fl.fly);
        }
        if (step > 0 && c >= f[1] - 250 && c < f[1] && !d.dropped) {
          d.dropped = true;
          drop(fl.dst, 250);
        }
      });
      // in play: the pair of the current hand-off, held until a hand-off between another pair begins
      var started =
        c < 0
          ? 0
          : plan.flights.filter(function (f) {
              return c >= f[0] - 350;
            }).length;
      var cur = p.flights[Math.max(0, started - 1)];
      var lit = cur.srcDev === cur.dstDev ? [cur.srcDev] : [cur.srcDev, cur.dstDev];
      var key = lit
        .map(function (d) {
          return p.devs.indexOf(d);
        })
        .sort()
        .join();
      if (key !== focusKey) {
        focusKey = key;
        focus(p, lit);
      }
      var on = function (a, b) {
        return step > 0 && c >= a && c < b;
      };
      // the same brief graphite ring where it is copied and where it is pasted
      var ends = plan.flights.map(function (f) {
        return [on(f[0], f[0] + 350), on(f[1], f[1] + 350)];
      });
      var ek = ends.join();
      if (ek !== endKey) {
        endKey = ek;
        p.flights.forEach(function (fl, k) {
          fl.src.classList.toggle("lit", ends[k][0]);
          fl.dst.classList.toggle("lit", ends[k][1]);
        });
      }
      var prog = paused ? 1 : clamp(el / (ENTER + plan.hold));
      barFills.forEach(function (f, k) {
        f.style.transform = "scaleX(" + (k < idx ? 1 : k === idx ? prog : 0) + ")";
      });
      if (!paused && !advanced && el >= ENTER + plan.hold + 150) {
        advanced = true;
        go(idx + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // what stats.js counts: the scene in front, and how the visitor got there
  var pendingPick = null;
  var userMoved = 0;
  function activate(i) {
    if (i === active) return;
    cancelAnimationFrame(raf);
    if (active >= 0) {
      var old = parts[active];
      old.sc.classList.remove("on");
      hideFlyers(old);
      focus(old, []);
      setStep(old, 0);
    }
    active = i;
    barBtns.forEach(function (b, k) {
      b.setAttribute("aria-current", k === i ? "true" : "false");
    });
    if (i >= 0) {
      var p = parts[i];
      setStep(p, 0);
      p.sc.classList.add("on");
      placePile(p);
      play(p);
      // a pick is told when its card arrives (cards passed on the way are not picks); auto-advance has no `how`
      if (pendingPick) {
        if (pendingPick.i === i) {
          if (pendingPick.how && window.spScenePick) window.spScenePick(p.id, pendingPick.how);
          pendingPick = null;
        }
      } else if (performance.now() - userMoved < 1500 && window.spScenePick) window.spScenePick(p.id, "swipe");
    }
    document.dispatchEvent(new CustomEvent("sp:scene"));
  }

  function nearest() {
    var mid = stage.scrollLeft + stage.clientWidth / 2;
    var best = 0;
    var dist = Infinity;
    parts.forEach(function (p, k) {
      var d = Math.abs(p.sc.offsetLeft + p.sc.offsetWidth / 2 - mid);
      if (d < dist) {
        dist = d;
        best = k;
      }
    });
    return best;
  }
  var target = function (i) {
    var s = parts[i].sc;
    return s.offsetLeft - (stage.clientWidth - s.offsetWidth) / 2;
  };
  // the browser's own smooth scroll runs on the compositor, so the slide stays smooth while scenes animate
  function go(i, how) {
    i = (i + parts.length) % parts.length;
    pendingPick = { i: i, how: how || null };
    userMoved = 0;
    stage.scrollTo({ left: target(i), behavior: "smooth" });
  }
  function check() {
    var r = story.getBoundingClientRect();
    var vh = innerHeight;
    activate(r.top < vh * 0.7 && r.bottom > vh * 0.3 ? nearest() : -1);
  }

  barBtns.forEach(function (b, k) {
    b.addEventListener("click", function () {
      if (k !== active) go(k, "bar");
    });
  });
  parts.forEach(function (p, k) {
    p.sc.addEventListener("click", function () {
      if (k !== active) go(k, "arrow");
    });
  });
  addEventListener("keydown", function (e) {
    if (active < 0 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if (e.target.closest && e.target.closest("input, textarea, select, details")) return;
    go(active + (e.key === "ArrowRight" ? 1 : -1), "arrow");
  });
  ["pointerdown", "touchstart", "wheel"].forEach(function (type) {
    stage.addEventListener(
      type,
      function (e) {
        if (type === "wheel" && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        pendingPick = null;
        userMoved = performance.now();
      },
      { passive: true },
    );
  });
  stage.addEventListener(
    "scroll",
    function () {
      if (userMoved) userMoved = performance.now();
    },
    { passive: true },
  );

  var pauseBtn = story.querySelector(".rowctl .pause");
  pauseBtn.addEventListener("click", function () {
    paused = !paused;
    pauseBtn.setAttribute("aria-label", paused ? pauseBtn.dataset.play : pauseBtn.dataset.pause);
    pauseBtn.classList.toggle("is-paused", paused);
    if (!paused && active >= 0) {
      cancelAnimationFrame(raf);
      play(parts[active]);
    }
  });

  // a random first scene per visit (kept for the session so going back home shows the same one)
  var first = -1;
  try {
    first = parts
      .map(function (p) {
        return p.id;
      })
      .indexOf((/[?&]scene=(\w+)/.exec(location.search) || [])[1] || sessionStorage.getItem("sp-first-scene"));
  } catch (e) {}
  if (first < 0) {
    first = Math.floor(Math.random() * parts.length);
    try {
      sessionStorage.setItem("sp-first-scene", parts[first].id);
    } catch (e) {}
  }
  window.spFirstScene = parts[first].id;

  var queued = false;
  var onScroll = function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      check();
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  stage.addEventListener("scroll", onScroll, { passive: true });
  // sizes change with the window and once the fonts are in: every card is stood up again in place
  // (without the devices' own transition), and the pile goes to the card in front
  function relayout() {
    story.classList.add("settling");
    size();
    parts.forEach(stand);
    placePile(parts[active >= 0 ? active : nearest()]);
    void story.offsetWidth;
    story.classList.remove("settling");
  }
  addEventListener("resize", function () {
    relayout();
    check();
  });
  relayout();
  stage.scrollLeft = target(first);
  placePile(parts[first]);
  check();
  if (document.fonts) document.fonts.ready.then(relayout);
})();
