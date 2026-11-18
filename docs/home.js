// The home page carousel (home.mjs, home.css). Runs only with the .js class (the boot script leaves
// it off for reduced motion); without it the scenes stand stacked at their last frame.
//  - one row of scene cards; the one in front plays its own timeline, then the row moves on
//  - bars, side cards, arrow keys and swipes pick a scene (window.spScenePick: bar, arrow, swipe)
//  - each visit starts on a random scene (kept for the session), told to stats.js as window.spFirstScene
//  - stats.js hears "sp:scene" whenever the scene in front changes (scene_view / scene_leave)
(function () {
  var root = document.documentElement;
  var story = document.querySelector("[data-carousel]");
  if (!story || !root.classList.contains("js")) return;
  var stage = story.querySelector(".stage");
  var clamp = function (v, a, b) {
    return Math.min(b === undefined ? 1 : b, Math.max(a || 0, v));
  };
  var ease = function (x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  // zoom 'b': the devices in play come up to 1.3x, the others shrink to 0.8 and step aside
  var ZOOM = { spot: 1.3, back: 0.8, pull: 0.5, push: 0.12 };
  // timelines are written at a calm pace and played a little faster; each scene lingers 2s on its finished state
  var SPEED = 0.8;
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
    search: { marks: [600, 1300, 2100, 2700, 3500, 4100], flights: [[2700, 3500]] },
  };
  var PLANS = {};
  Object.keys(RAW).forEach(function (k) {
    var marks = RAW[k].marks.map(function (m) {
      return m * SPEED;
    });
    var flights = RAW[k].flights.map(function (f) {
      return [f[0] * SPEED, f[1] * SPEED];
    });
    var hold = Math.max.apply(null, marks.concat([].concat.apply([], flights))) + 2000;
    PLANS[k] = { marks: marks, flights: flights, hold: hold, cycle: hold + 350 };
  });

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

  // devices take whatever height the headline leaves free in the card
  function size() {
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
    root.style.setProperty("--s", s.toFixed(4));
    root.style.setProperty("--sw", sw.toFixed(4));
  }

  function fly(fl, f) {
    var a = fl.src.getBoundingClientRect();
    var b = fl.dst.getBoundingClientRect();
    var fw = fl.fly.offsetWidth;
    var fh = fl.fly.offsetHeight;
    var e = ease(f);
    var ax = a.left + a.width / 2;
    var ay = a.top + a.height / 2;
    var bx = b.left + b.width / 2;
    var by = b.top + b.height / 2;
    var arc = Math.abs(bx - ax) / (Math.abs(bx - ax) + Math.abs(by - ay) + 1);
    var x = ax + (bx - ax) * e - fw / 2;
    var y = ay + (by - ay) * e - fh / 2 - Math.sin(Math.PI * e) * Math.min(120, innerHeight * 0.12) * arc;
    fl.fly.style.transform = "translate(" + x + "px," + y + "px) scale(" + (0.85 + Math.sin(Math.PI * e) * 0.2) + ")";
    fl.fly.style.opacity = clamp(f / 0.12);
  }
  function hideFlyers(p) {
    p.flights.forEach(function (fl) {
      fl.fly.style.opacity = 0;
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

  // spotlight: the lit devices stand side by side at one shared size, centred; the rest shrink and
  // step aside. On narrow screens the devices are stacked, so they only grow a little in place.
  function setFocus(p, lit) {
    var rig = p.sc.querySelector(".rig");
    var rw = rig.offsetWidth;
    var rh = rig.offsetHeight;
    var k = rig.getBoundingClientRect().width / rw || 1;
    var room = Math.max(rw, (p.sc.clientWidth - 48) / k);
    var extra = (room - rw) / 2;
    var GAP = Math.round(room * 0.07);
    var center = function (d) {
      return d.offsetLeft + d.offsetWidth / 2;
    };
    var base = function (d) {
      return parseFloat(getComputedStyle(d).getPropertyValue("--pb")) || 1;
    };
    var set = function (d, ds, tx) {
      d.style.setProperty("--ds", (+ds).toFixed(3));
      d.style.setProperty("--tx", tx.toFixed(1) + "px");
    };
    p.devs.forEach(function (d) {
      d.classList.toggle("back", lit.length > 0 && lit.indexOf(d) < 0);
    });
    if (!lit.length) {
      p.devs.forEach(function (d) {
        d.style.removeProperty("--ds");
        d.style.removeProperty("--tx");
      });
      return;
    }
    if (innerWidth <= 700) {
      p.devs.forEach(function (d) {
        set(d, lit.indexOf(d) >= 0 ? 1.04 : 0.92, 0);
      });
      return;
    }
    var group = lit.slice().sort(function (a, b) {
      return center(a) - center(b);
    });
    var nat = group.map(function (d) {
      return d.offsetWidth * base(d);
    });
    var sum = nat.reduce(function (s, w) {
      return s + w;
    }, 0);
    var fitW = (room - GAP * (group.length - 1)) / sum;
    var fitH = Math.min.apply(
      null,
      group.map(function (d) {
        return (rh - (parseFloat(getComputedStyle(d).bottom) || 0)) / (d.offsetHeight * base(d));
      }),
    );
    var ds = Math.max(0.6, Math.min(ZOOM.spot, fitW, fitH));
    var widths = nat.map(function (w) {
      return w * ds;
    });
    var total = widths.reduce(function (s, w) {
      return s + w;
    }, 0) + GAP * (group.length - 1);
    var groupX =
      group.reduce(function (s, d) {
        return s + center(d);
      }, 0) / group.length;
    var mid = groupX + (rw / 2 - groupX) * ZOOM.pull;
    var start = Math.min(Math.max(mid - total / 2, -extra), Math.max(-extra, rw + extra - total));
    var x = start;
    group.forEach(function (d, i) {
      set(d, ds, x + widths[i] / 2 - center(d));
      x += widths[i] + GAP;
    });
    var end = start + total;
    p.devs
      .filter(function (d) {
        return lit.indexOf(d) < 0;
      })
      .forEach(function (d) {
        var w = d.offsetWidth * base(d) * ZOOM.back;
        var left = center(d) < groupX;
        var want = left ? Math.min(center(d), start - GAP - w / 2) : Math.max(center(d), end + GAP + w / 2);
        set(d, ZOOM.back, want - center(d) + (left ? -1 : 1) * rw * ZOOM.push * 0.3);
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
    var flying = p.flights.map(function () {
      return false;
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
      p.flights.forEach(function (fl, k) {
        var a = plan.flights[k][0];
        var b = plan.flights[k][1];
        if (c >= a && c < b) {
          flying[k] = true;
          fly(fl, (c - a) / (b - a));
        } else if (flying[k]) {
          flying[k] = false;
          fl.fly.style.opacity = 0;
        }
      });
      // framing: the pair of the current hand-off, held until a hand-off between another pair begins
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
        setFocus(p, lit);
      }
      // light both ends a moment before the hand-off starts until a moment after it lands
      var ends = plan.flights.map(function (f) {
        return step > 0 && c >= f[0] - 250 && c < f[1] + 300;
      });
      var ek = ends.join();
      if (ek !== endKey) {
        endKey = ek;
        p.flights.forEach(function (fl, k) {
          fl.src.classList.toggle("lit", ends[k]);
          fl.dst.classList.toggle("lit", ends[k]);
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
      setFocus(old, []);
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
      .indexOf(sessionStorage.getItem("sp-first-scene"));
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
  addEventListener("resize", function () {
    size();
    check();
  });
  size();
  stage.scrollLeft = target(first);
  check();
  if (document.fonts) document.fonts.ready.then(size);
})();
