/**
 * rustam.os — portfolio behaviour
 *
 * Plain script, no build step, no modules: the site is meant to run both from
 * a static host and by opening index.html straight from disk, and ES modules
 * are blocked under file://.
 *
 * Each feature is a self-contained init function that no-ops when its markup
 * is absent, so the two language pages can drift without breaking anything.
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** @param {string} sel @param {ParentNode} [root] */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  /** @param {string} sel @param {ParentNode} [root] */
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  // ==========================================================================
  // Boot screen
  // ==========================================================================

  function initBoot() {
    var boot = $('#boot');
    if (!boot) return;
    var hide = function () { boot.classList.add('is-hidden'); };
    // Hide once the page is up; the timeout is a floor, not a dependency, so a
    // stalled asset can never leave the visitor staring at the splash.
    window.addEventListener('load', function () { window.setTimeout(hide, 900); });
    window.setTimeout(hide, 3000);
  }

  // ==========================================================================
  // Menu bar clock
  // ==========================================================================

  function initClock() {
    var clock = $('#clock');
    if (!clock) return;
    var locale = document.documentElement.lang === 'en' ? 'en-GB' : 'de-AT';
    var tick = function () {
      clock.textContent = new Date().toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    tick();
    window.setInterval(tick, 30000);
  }

  // ==========================================================================
  // Pull-down menus (File / View)
  // ==========================================================================

  function initMenus() {
    var menus = $$('[data-menu]');
    if (!menus.length) return;

    function close(menu) {
      menu.classList.remove('is-open');
      var button = $('[data-menu-toggle]', menu);
      if (button) button.setAttribute('aria-expanded', 'false');
    }

    function closeAll(except) {
      menus.forEach(function (menu) { if (menu !== except) close(menu); });
    }

    menus.forEach(function (menu) {
      var button = $('[data-menu-toggle]', menu);
      if (!button) return;
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var willOpen = !menu.classList.contains('is-open');
        closeAll(menu);
        menu.classList.toggle('is-open', willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
      });
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('[data-menu]')) closeAll();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAll();
    });
  }

  // ==========================================================================
  // Scroll progress, flow rail and background parallax
  // ==========================================================================

  function initScrollEffects() {
    var fill = $('#scrollbar-fill');
    var dot = $('#flow-dot');
    var column = $('.main-col');
    var backdrop = $('.pixel-icons');
    if (!fill && !dot && !backdrop) return;

    var ticking = false;

    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;

      if (fill) {
        var progress = max > 0 ? window.scrollY / max : 0;
        fill.style.width = (progress * 100).toFixed(2) + '%';
      }

      if (dot && column) {
        var rect = column.getBoundingClientRect();
        var railTop = rect.top + window.scrollY + 6;
        var railHeight = column.offsetHeight - 12;
        var centre = window.scrollY + window.innerHeight * 0.4;
        dot.style.top = Math.max(0, Math.min(railHeight, centre - railTop)) + 'px';
      }

      if (backdrop && !prefersReducedMotion.matches) {
        backdrop.style.transform = 'translateY(' + (-window.scrollY * 0.04) + 'px)';
      }
    }

    // Batch onto the next frame: scroll fires far more often than we can paint.
    function request() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    update();
  }

  // ==========================================================================
  // Reveal windows as they scroll into view
  // ==========================================================================

  function initReveal() {
    var windows = $$('.mac-window');
    if (!windows.length || !('IntersectionObserver' in window)) return;

    function revealAll() {
      windows.forEach(function (el) { el.classList.add('is-visible'); });
    }

    // Opt into the hidden starting state only now that we can undo it.
    document.documentElement.classList.add('js-reveal');

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target); // reveal is one-way
      });
    }, { threshold: 0.15 });

    windows.forEach(function (el) { observer.observe(el); });

    // Failsafe: if nothing has been revealed shortly after load, the observer
    // is not delivering, so show everything rather than leave a blank page.
    window.setTimeout(function () {
      if (!$('.mac-window.is-visible')) {
        observer.disconnect();
        revealAll();
      }
    }, 1500);
  }

  // ==========================================================================
  // Project thumbnails: fall back to the emoji when a screenshot is missing
  // ==========================================================================

  function initThumbnailFallbacks() {
    $$('[data-thumb]').forEach(function (img) {
      var hide = function () { img.hidden = true; };
      if (img.complete && img.naturalWidth === 0) hide();
      img.addEventListener('error', hide);
    });
  }

  // ==========================================================================
  // "Try it out" — expand a card into a live preview
  // ==========================================================================

  function initPreviews() {
    var cards = $$('[data-preview]');
    if (!cards.length) return;

    function collapse(card) {
      card.classList.remove('is-expanded');
      var toggle = $('[data-preview-toggle]', card);
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }

    cards.forEach(function (card) {
      var toggle = $('[data-preview-toggle]', card);
      if (!toggle) return;

      toggle.addEventListener('click', function () {
        var willExpand = !card.classList.contains('is-expanded');
        cards.forEach(collapse); // only ever one open at a time
        if (!willExpand) return;

        card.classList.add('is-expanded');
        toggle.setAttribute('aria-expanded', 'true');

        // Load the iframe on first open so four embeds do not load up front.
        var frame = $('iframe[data-src]', card);
        if (frame && !frame.src) frame.src = frame.getAttribute('data-src');

        card.scrollIntoView({
          behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
          block: 'nearest'
        });
      });
    });
  }

  // ==========================================================================
  // Rotating tagline under the title
  // ==========================================================================

  var TAGLINES = [
    'IT-Security Interessiert',
    'C++ · Java · JS Developer',
    'HTL Pinkafeld — Ausbildung',
    'Baut an: KI + MCP-Server',
    'Hostet gerne lokale LLMs'
  ];

  function initTagline() {
    var el = $('#tw-text');
    if (!el) return;

    var phrases = TAGLINES;
    if (prefersReducedMotion.matches) {
      el.textContent = phrases[0];
      return;
    }

    var phrase = 0;
    var chars = 0;
    var deleting = false;

    (function step() {
      var text = phrases[phrase];
      chars += deleting ? -1 : 1;
      el.textContent = text.slice(0, chars);

      var delay = deleting ? 28 : 55;
      if (!deleting && chars === text.length) {
        deleting = true;
        delay = 1600;
      } else if (deleting && chars === 0) {
        deleting = false;
        phrase = (phrase + 1) % phrases.length;
        delay = 300;
      }
      window.setTimeout(step, delay);
    }());
  }

  // ==========================================================================
  // Code window: types out short snippets on a loop
  // ==========================================================================

  var SNIPPETS = [
    '<span class="c-kw">class</span> Rustam {\n' +
    '<span class="c-kw">public</span>:\n' +
    '    <span class="c-kw">void</span> vibeCode();\n' +
    '    <span class="c-kw">bool</span> isAvailable = <span class="c-kw">true</span>;\n' +
    '};',

    '<span class="c-com">// HolyC-Style, for Terry</span>\n' +
    '<span class="c-kw">U8</span> j;\n' +
    '<span class="c-kw">for</span> (j = 0; j < 10; j++)\n' +
    '    PrintF(<span class="c-str">"Divine Intervention\\n"</span>);',

    '<span class="c-kw">def</span> ship_project(idea):\n' +
    '    <span class="c-kw">while</span> <span class="c-kw">not</span> idea.done:\n' +
    '        idea.iterate()\n' +
    '    <span class="c-kw">return</span> <span class="c-str">"deployed"</span>'
  ];

  function initCodeWindow() {
    var el = $('#code-body');
    if (!el) return;

    if (prefersReducedMotion.matches) {
      el.innerHTML = SNIPPETS[0];
      return;
    }

    var snippet = 0;

    function type() {
      // Treat tags as atomic so the markup is never cut mid-tag.
      var tokens = SNIPPETS[snippet].match(/<[^>]+>|[^<]/g) || [];
      var i = 0;
      el.innerHTML = '';

      (function step() {
        if (i < tokens.length) {
          el.innerHTML = tokens.slice(0, ++i).join('') + '<span class="c-cursor">▌</span>';
          window.setTimeout(step, 16);
        } else {
          window.setTimeout(function () {
            snippet = (snippet + 1) % SNIPPETS.length;
            type();
          }, 2600);
        }
      }());
    }

    type();
  }

  // ==========================================================================
  // Cat mascot
  //
  // Frames are swapped from here rather than from CSS keyframes. The old
  // version drove background-image through @keyframes with steps(), which
  // quantised an already-discrete property and dropped frames, and it put the
  // run translation and the hover scale on the same element so they clobbered
  // each other. A single rAF loop over a preloaded frame table is both simpler
  // and stable across devices.
  // ==========================================================================

  var CAT_PHRASES = [
    'miau~',
    'The name is Lizzie',
    'sudo pet me',
    'Your claude limit has been reached',
    'i will guard your code',
    'just a short break...',
    'purr.exe is running',
    'Senior dev here',
    'git commit -m "sleep"',
    'pet me (hover) 💜',
    'push on a Friday afternoon',
    'Bug found. It was me.',
    'compiling... zzz',
    'rm -rf /'
  ];

  function initMascot() {
    var root = $('[data-mascot]');
    var manifest = window.MASCOT_MANIFEST;
    if (!root || !manifest) return;

    var sprite = $('[data-mascot-sprite]', root);
    var runner = $('[data-mascot-runner]', root);
    var bubble = $('[data-mascot-bubble]', root);
    if (!sprite || !runner) return;

    // ---- frame preloading -------------------------------------------------
    // A state is never entered before all of its frames have decoded — showing
    // a half-loaded set was the other reason the cat looked broken on slow
    // connections. Idle loads first so the cat can appear and start breathing
    // straight away, and the other three states stream in behind it.
    var images = {};
    var loaded = {};
    var ready = false;

    function preload(name, onDone) {
      var frames = manifest.states[name].frames;
      var pending = frames.length;
      images[name] = frames.map(function (file) {
        var img = new Image();
        var done = function () {
          if (--pending > 0) return;
          loaded[name] = true;
          if (onDone) onDone();
        };
        img.addEventListener('load', done);
        img.addEventListener('error', done);
        img.src = manifest.basePath + file;
        return img;
      });
    }

    preload('idle', function () {
      start();
      Object.keys(manifest.states).forEach(function (name) {
        if (name !== 'idle') preload(name);
      });
    });

    // ---- state machine ----------------------------------------------------
    var state = 'idle';
    var frame = 0;
    var frameStart = 0;
    var facing = -1;       // -1 faces left (the art is drawn facing right)
    var hovering = false;
    var biting = false;
    var patrol = null;     // active run, or null when parked
    var nextPatrolAt = 0;
    var x = 0;
    var trackWidth = 0;

    function setState(next) {
      if (state === next || !loaded[next]) return;
      state = next;
      frame = 0;
      frameStart = 0;
      render();
      if (next === 'idle') startTalking(); else stopTalking();
    }

    function render() {
      var set = images[state];
      var img = set && set[frame];
      if (img) sprite.style.backgroundImage = 'url("' + img.src + '")';
      sprite.style.setProperty('--facing', String(facing));
      runner.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    }

    function measure() {
      trackWidth = Math.max(0, root.clientWidth - sprite.offsetWidth);
      x = Math.min(x, trackWidth);
      render();
    }

    // ---- patrol -----------------------------------------------------------
    var SPEED = 55; // px per second

    function beginPatrol(now) {
      var target = Math.random() * trackWidth;
      if (Math.abs(target - x) < 40) target = x > trackWidth / 2 ? 0 : trackWidth;
      patrol = { from: x, to: target, startedAt: now,
                 duration: (Math.abs(target - x) / SPEED) * 1000 };
      facing = target > x ? 1 : -1;
      setState('run');
    }

    function endPatrol(now) {
      patrol = null;
      nextPatrolAt = now + 4000 + Math.random() * 5000;
      setState(hovering && loaded.purr ? 'purr' : 'idle');
    }

    // ---- main loop --------------------------------------------------------
    var running = false;

    function loop(now) {
      if (!running) return;

      var spec = manifest.states[state];
      if (!frameStart) frameStart = now;

      if (now - frameStart >= spec.frameMs) {
        frameStart = now;
        if (frame + 1 < spec.frames.length) {
          frame++;
        } else if (spec.loop) {
          frame = 0;
        } else {
          onOneShotFinished();
        }
        render();
      }

      if (patrol) {
        var t = Math.min(1, (now - patrol.startedAt) / patrol.duration);
        x = patrol.from + (patrol.to - patrol.from) * t;
        runner.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
        if (t >= 1) endPatrol(now);
      } else if (loaded.run && state === 'idle' && !hovering && !biting && now >= nextPatrolAt) {
        beginPatrol(now);
      }

      window.requestAnimationFrame(loop);
    }

    function onOneShotFinished() {
      if (state !== 'bite') return;
      biting = false;
      frame = manifest.states.bite.frames.length - 1;
      setState(hovering && loaded.purr ? 'purr' : 'idle');
    }

    function start() {
      if (ready) return;
      ready = true;
      root.hidden = false;
      measure();

      // A cat that never sits still is a distraction, and reduced-motion users
      // asked for exactly that. Park it on the first idle frame instead.
      if (prefersReducedMotion.matches) {
        startTalking();
        return;
      }
      nextPatrolAt = performance.now() + 3000;
      running = true;
      window.requestAnimationFrame(loop);
      startTalking();
    }

    // Stop burning frames while the tab is in the background. Timers piling up
    // behind a hidden tab is what made the old version lurch on return.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else if (ready && !prefersReducedMotion.matches && !running) {
        running = true;
        frameStart = 0;
        if (patrol) patrol.startedAt = performance.now() - patrol.duration;
        window.requestAnimationFrame(loop);
      }
    });

    window.addEventListener('resize', measure);

    // ---- interaction ------------------------------------------------------
    // Pointer events cover mouse, touch and pen in one path. Hover-only states
    // are gated on a real mouse so a tap does not leave the cat stuck purring.
    sprite.addEventListener('pointerenter', function (event) {
      if (event.pointerType !== 'mouse') return;
      hovering = true;
      sprite.classList.add('is-petted');
      if (!biting && !patrol) {
        setState('purr');
        purrTone();
      }
    });

    sprite.addEventListener('pointerleave', function (event) {
      if (event.pointerType !== 'mouse') return;
      hovering = false;
      sprite.classList.remove('is-petted');
      if (!biting && !patrol) setState('idle');
    });

    sprite.addEventListener('pointerdown', function (event) {
      // Only suppress the mouse default (text selection / image drag). Doing it
      // for touch as well would swallow a scroll that starts on the cat.
      if (event.pointerType === 'mouse') event.preventDefault();
      purrTone();
      if (!loaded.bite) return;
      biting = true;
      patrol = null;
      setState('bite');
      if (!running && !prefersReducedMotion.matches) {
        running = true;
        window.requestAnimationFrame(loop);
      }
    });

    // ---- speech bubble ----------------------------------------------------
    var talkTimer = null;
    var hideTimer = null;
    var lastPhrase = -1;

    function say() {
      if (!bubble) return;
      var next;
      do {
        next = Math.floor(Math.random() * CAT_PHRASES.length);
      } while (next === lastPhrase && CAT_PHRASES.length > 1);
      lastPhrase = next;

      bubble.textContent = CAT_PHRASES[next];
      bubble.classList.add('is-visible');
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(function () {
        bubble.classList.remove('is-visible');
      }, 3200);
    }

    function startTalking() {
      if (talkTimer || !bubble) return;
      say();
      talkTimer = window.setInterval(function () {
        if (state === 'idle') say();
      }, 5000);
    }

    function stopTalking() {
      window.clearInterval(talkTimer);
      window.clearTimeout(hideTimer);
      talkTimer = null;
      if (bubble) bubble.classList.remove('is-visible');
    }

    // ---- audio ------------------------------------------------------------
    // One lazily created context, reused. The old code built a fresh
    // AudioContext on every hover and browsers cap those at around six.
    var audio = null;

    function purrTone() {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      try {
        if (!audio) audio = new Ctx();
        if (audio.state === 'suspended') audio.resume();
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, audio.currentTime);
        gain.gain.setValueAtTime(0.1, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.5);
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.5);
      } catch (error) {
        // Autoplay policy or no audio device — the cat works fine in silence.
      }
    }
  }

  // ==========================================================================

  function init() {
    initBoot();
    initClock();
    initMenus();
    initScrollEffects();
    initReveal();
    initThumbnailFallbacks();
    initPreviews();
    initTagline();
    initCodeWindow();
    initMascot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
