// The home page carousel (home.mjs, home.css). Runs only with the .js class (the boot script leaves
// it off for reduced motion); without it the scenes stand stacked at their last frame.
//  - one row of scene cards; the one in front plays its own timeline, then the row moves on
//  - every hand-off goes through the pile: what is copied or shot rises onto it as the new top sheet,
//    and pasting takes a copy of the top sheet down to the other device. There is one pile for the
//    whole row, so it keeps what earlier scenes put on it; three sheets show, only the top one's content
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
  var ease = function (x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  // the devices of a scene come up to at most 1.3x their drawn size, as large as the card lets them
  var SPOT = 1.3;
  // timelines are written at a calm pace and played a little faster; each scene lingers 2s on its finished state
  var SPEED = 0.8;
  // hand-offs are written as [copied, pasted]; viaPile stretches each into rise, rest on the pile, fall
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
  var LEG = { up: 700, rest: 500, down: 700 };
  // a hand-off becomes [leaves, lands on the pile, leaves the pile, pasted]; what comes after it moves later
  function viaPile(raw) {
    var len = LEG.up + LEG.rest + LEG.down;
    var later = function (t) {
      return raw.flights.reduce(function (s, f) {
        return s + (f[1] <= t ? len - (f[1] - f[0]) : 0);
      }, 0);
    };
    return {
      marks: raw.marks.map(function (m) {
        return m + later(m);
      }),
      flights: raw.flights.map(function (f) {
        var a = f[0] + later(f[0]);
        return [a, a + LEG.up, a + LEG.up + LEG.rest, a + len];
      }),
    };
  }
  var PLANS = {};
  Object.keys(RAW).forEach(function (k) {
    var r = viaPile(RAW[k]);
    var marks = r.marks.map(function (m) {
      return m * SPEED;
    });
    var flights = r.flights.map(function (f) {
      return f.map(function (t) {
        return t * SPEED;
      });
    });
    var hold = Math.max.apply(null, marks.concat([].concat.apply([], flights))) + 2000;
    PLANS[k] = { marks: marks, flights: flights, hold: hold, cycle: hold + 350 };
  });

  // where the pile sits: right of the headline, level with it, at one place for every card (right of the
  // widest headline). Phones, and wide screens where that does not fit, put it just under the headline.
  var SIDE_GAP = 44;
  function sideX() {
    var half = Math.max.apply(
      null,
      parts.map(function (p) {
        return p.copy.querySelector("h2").offsetWidth / 2;
      }),
    );
    return story.clientWidth / 2 + half + SIDE_GAP + pileEl.offsetWidth / 2;
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

  // the pile: sheets newest first; the top one shows what will be pasted, the two behind are plain
  var pile = (function () {
    var sheets = [];
    var placed = false;
    var make = function (inner) {
      var s = document.createElement("div");
      s.className = "sheet";
      s.innerHTML = '<div class="in"></div><i class="clip"></i>';
      if (inner) s.firstChild.appendChild(inner);
      return s;
    };
    // a text item is written on the sheet; a photo is shown whole, scaled to fit
    var content = function (fly) {
      var item = fly.firstElementChild;
      if (item.classList.contains("pill")) {
        var t = document.createElement("p");
        t.className = "t";
        t.textContent = item.textContent;
        return t;
      }
      var w = item.offsetWidth;
      var h = item.offsetHeight;
      var k = Math.min((pileEl.offsetWidth - 18) / w, (pileEl.offsetHeight - 18) / h);
      var box = document.createElement("div");
      box.className = "fit";
      box.style.width = w + "px";
      box.style.height = h + "px";
      box.style.transform = "translate(-50%, -50%) scale(" + k.toFixed(3) + ")";
      box.appendChild(item.cloneNode(true));
      return box;
    };
    var lay = function () {
      sheets.forEach(function (s, d) {
        s.dataset.d = d;
      });
      while (sheets.length > 3) {
        var old = sheets.pop();
        old.dataset.d = 3;
        setTimeout(old.remove.bind(old), 600);
      }
    };
    // before anything is copied the pile is the icon: a glass sheet in front of a graphite one
    [make(), make()].forEach(function (s) {
      pileEl.appendChild(s);
      sheets.push(s);
    });
    lay();
    return {
      push: function (fly) {
        var s = make(content(fly));
        s.classList.add("enter");
        pileEl.appendChild(s);
        sheets.unshift(s);
        void s.offsetWidth;
        s.classList.remove("enter");
        lay();
      },
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
      return pile.at(sideX(), y0 + p.copy.offsetTop + h.offsetTop + h.offsetHeight / 2);
    }
    var lift = parseFloat(getComputedStyle(story).getPropertyValue("--pile-lift")) || 0;
    pile.at(story.clientWidth / 2, y0 + p.copy.offsetTop + p.copy.offsetHeight + lift + pileEl.offsetHeight / 2);
  }

  function fly(fl, from, to, f, leg) {
    var a = from.getBoundingClientRect();
    var b = to.getBoundingClientRect();
    var fw = fl.offsetWidth;
    var fh = fl.offsetHeight;
    var e = ease(f);
    var ax = a.left + a.width / 2;
    var ay = a.top + a.height / 2;
    var bx = b.left + b.width / 2;
    var by = b.top + b.height / 2;
    var arc = Math.abs(bx - ax) / (Math.abs(bx - ax) + Math.abs(by - ay) + 1);
    var x = ax + (bx - ax) * e - fw / 2;
    var y = ay + (by - ay) * e - fh / 2 - Math.sin(Math.PI * e) * Math.min(70, innerHeight * 0.08) * arc;
    // it shrinks a little as it settles on the pile and grows back on the way down
    var s = leg === 1 ? 1 - 0.25 * e : 0.75 + 0.25 * e;
    fl.style.transform = "translate(" + x + "px," + y + "px) scale(" + (s + Math.sin(Math.PI * e) * 0.12).toFixed(3) + ")";
    fl.style.opacity = leg === 1 ? clamp(f / 0.12) * clamp((1 - f) / 0.1) : clamp(f / 0.15);
  }
  function hideFlyers(p) {
    p.flights.forEach(function (fl) {
      fl.fly.style.opacity = 0;
      fl.src.classList.remove("lit");
      fl.dst.classList.remove("lit");
    });
    pileEl.classList.remove("lit");
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
    var legs = p.flights.map(function () {
      return 0;
    });
    var landed = p.flights.map(function () {
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
      // each hand-off: [leaves, lands on the pile, leaves the pile, pasted]
      p.flights.forEach(function (fl, k) {
        var f = plan.flights[k];
        if (c < f[0]) landed[k] = false;
        var leg = c >= f[0] && c < f[1] ? 1 : c >= f[2] && c < f[3] ? 2 : 0;
        if (leg === 1) fly(fl.fly, fl.src, pileEl, (c - f[0]) / (f[1] - f[0]), 1);
        else if (leg === 2) fly(fl.fly, pileEl, fl.dst, (c - f[2]) / (f[3] - f[2]), 2);
        else if (legs[k]) fl.fly.style.opacity = 0;
        legs[k] = leg;
        if (c >= f[1] && !landed[k]) {
          landed[k] = true;
          pile.push(fl.fly);
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
      // where it leaves lights up as it rises, the pile while it holds it, where it lands as it comes down
      var on = function (a, b) {
        return step > 0 && c >= a && c < b;
      };
      var ends = plan.flights.map(function (f) {
        return [on(f[0] - 250, f[1] + 150), on(f[2] - 100, f[3] + 300)];
      });
      var held = plan.flights.some(function (f) {
        return on(f[1], f[3]);
      });
      var ek = ends.join() + held;
      if (ek !== endKey) {
        endKey = ek;
        p.flights.forEach(function (fl, k) {
          fl.src.classList.toggle("lit", ends[k][0]);
          fl.dst.classList.toggle("lit", ends[k][1]);
        });
        pileEl.classList.toggle("lit", held);
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
