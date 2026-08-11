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

  /** Escape text that is about to be interpolated into innerHTML. */
  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ==========================================================================
  // Sound
  //
  // Off by default and remembered. A portfolio that starts beeping at a
  // recruiter is worse than a silent one, so this only ever makes noise after
  // someone has opted in. One AudioContext is shared by every caller.
  // ==========================================================================

  var Sound = (function () {
    var STORAGE_KEY = 'rustamos.sound';
    var enabled = false;
    var ctx = null;
    var listeners = [];

    try {
      enabled = window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch (error) {
      // Private mode or blocked storage — stay silent, stay working.
    }

    function context() {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!ctx) ctx = new Ctx();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    /**
     * @param {{from:number, to?:number, type?:string, dur?:number, gain?:number}} spec
     */
    function play(spec) {
      if (!enabled) return;
      var audio = context();
      if (!audio) return;
      try {
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        var dur = spec.dur || 0.08;
        osc.type = spec.type || 'square';
        osc.frequency.setValueAtTime(spec.from, audio.currentTime);
        if (spec.to) {
          osc.frequency.exponentialRampToValueAtTime(spec.to, audio.currentTime + dur);
        }
        gain.gain.setValueAtTime(spec.gain || 0.04, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + dur);
      } catch (error) {
        // Autoplay policy or no output device.
      }
    }

    return {
      get enabled() { return enabled; },
      toggle: function () {
        enabled = !enabled;
        try { window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch (error) {}
        listeners.forEach(function (fn) { fn(enabled); });
        if (enabled) play({ from: 660, to: 990, dur: 0.09 });
        return enabled;
      },
      onChange: function (fn) { listeners.push(fn); fn(enabled); },
      blip: function () { play({ from: 880, to: 1180, dur: 0.05, gain: 0.03 }); },
      key: function () { play({ from: 1500, dur: 0.018, gain: 0.018, type: 'square' }); },
      open: function () { play({ from: 420, to: 880, dur: 0.12, gain: 0.05 }); },
      close: function () { play({ from: 700, to: 300, dur: 0.11, gain: 0.045 }); },
      purr: function () { play({ from: 150, dur: 0.5, gain: 0.09, type: 'sine' }); },
      boot: function () { play({ from: 220, to: 660, dur: 0.35, gain: 0.05, type: 'triangle' }); }
    };
  }());

  function initSoundToggle() {
    var buttons = $$('[data-sound-toggle]');
    if (!buttons.length) return;
    Sound.onChange(function (on) {
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(on));
        var state = $('[data-sound-state]', button);
        if (state) state.textContent = on ? 'ON' : 'OFF';
      });
    });
    buttons.forEach(function (button) {
      button.addEventListener('click', function () { Sound.toggle(); });
    });
  }

  // ==========================================================================
  // Boot sequence
  //
  // A short POST log assembled from what is actually on the page, so it can
  // never claim something the portfolio does not say. Skippable, and only
  // shown once per session — a boot screen on every navigation is a toll.
  // ==========================================================================

  function bootLines() {
    var count = function (sel) { return $$(sel).length; };
    var skills = $$('.tags .tag').map(function (el) { return el.textContent.trim(); });
    var status = $('.info-row .v.on');
    var location = $('.info-row .v');

    var lines = [
      ['booting kernel', 'OK'],
      ['mounting /skills', skills.length + ' modules'],
      ['  ' + skills.join('  '), null],
      ['mounting /projects', count('.proj-card') + ' repos'],
      ['mounting /demos', count('[data-preview]') + ' live'],
      ['locale', (document.documentElement.lang || 'de').toUpperCase() +
                 (location ? ' · ' + location.textContent.trim() : '')],
      ['status', status ? status.textContent.replace(/^●\s*/, '') : 'ready']
    ];
    return lines;
  }

  function initBoot() {
    var boot = $('#boot');
    if (!boot) return;

    var log = $('[data-boot-log]', boot);
    var shell = $('.shell');
    var finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      boot.classList.add('is-hidden');
      document.removeEventListener('keydown', finish);
      boot.removeEventListener('pointerdown', finish);
      // CRT power-on, but only for people who want motion.
      if (shell && !prefersReducedMotion.matches) {
        shell.classList.add('crt-on');
        window.setTimeout(function () { shell.classList.remove('crt-on'); }, 600);
      }
    }

    var seen = false;
    try { seen = window.sessionStorage.getItem('rustamos.booted') === '1'; } catch (error) {}

    // Skip the animation when it would not be watched anyway: a repeat visit,
    // reduced motion, or a tab opened in the background. That last one matters
    // — background tabs clamp setTimeout to about a second, so the sequence
    // would crawl and the safety timeout would cut it off half-written.
    if (seen || prefersReducedMotion.matches || !log || document.hidden) {
      window.addEventListener('load', function () { window.setTimeout(finish, 320); });
      window.setTimeout(finish, 2000);
      return;
    }
    try { window.sessionStorage.setItem('rustamos.booted', '1'); } catch (error) {}

    document.addEventListener('keydown', finish);
    boot.addEventListener('pointerdown', finish);

    var lines = bootLines();
    var i = 0;

    (function step() {
      if (finished) return;
      if (i >= lines.length) {
        window.setTimeout(finish, 420);
        return;
      }
      var line = lines[i++];
      var row = document.createElement('div');
      if (line[1] === null) {
        row.className = 'dim';
        row.textContent = line[0];
      } else {
        row.innerHTML = '<span class="dim">&gt;</span> ' + esc(line[0]) +
                        ' <span class="dim">' + new Array(Math.max(2, 26 - line[0].length)).join('.') +
                        '</span> <span class="' + (line[1] === 'OK' ? 'ok' : 'val') + '">' +
                        esc(line[1]) + '</span>';
      }
      log.appendChild(row);
      Sound.key();
      window.setTimeout(step, 95 + Math.random() * 70);
    }());

    // Never strand anyone on the splash. Generous enough to clear the whole
    // sequence, since the throttled case is handled above.
    window.setTimeout(finish, 6000);
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
  // Windowshade — the title-bar dot rolls the window up, like classic Mac OS
  // ==========================================================================

  function initWindowShade() {
    $$('.mac-window > .titlebar').forEach(function (bar) {
      var win = bar.parentElement;
      var dot = $('.dot', bar);
      var body = $('.window-body', win);
      if (!dot || !body) return;

      // Promote the decorative div to a real control.
      var button = document.createElement('button');
      button.type = 'button';
      button.className = dot.className;
      button.setAttribute('aria-expanded', 'true');
      var name = $('.name', bar);
      button.setAttribute('aria-label',
        (name ? name.textContent.trim() + ' — ' : '') + 'collapse');
      dot.replaceWith(button);

      function setShaded(shaded) {
        // max-height needs a real number to animate from; measure on demand so
        // it survives reflows, font loading and window resizes.
        body.style.maxHeight = body.scrollHeight + 'px';
        window.requestAnimationFrame(function () {
          win.classList.toggle('is-shaded', shaded);
          button.setAttribute('aria-expanded', String(!shaded));
        });
        if (!shaded) {
          window.setTimeout(function () {
            if (!win.classList.contains('is-shaded')) body.style.maxHeight = '';
          }, 460);
        }
      }

      button.addEventListener('click', function () {
        var shaded = !win.classList.contains('is-shaded');
        setShaded(shaded);
        if (shaded) Sound.close(); else Sound.open();
      });
    });
  }

  // ==========================================================================
  // Pointer spotlight across the window chrome
  // ==========================================================================

  function initSpotlight() {
    if (prefersReducedMotion.matches) return;
    if (!window.matchMedia('(hover: hover)').matches) return;

    var windows = $$('.mac-window');
    if (!windows.length) return;
    var queued = false;
    var last = null;

    function paint() {
      queued = false;
      if (!last) return;
      var win = last.target.closest('.mac-window');
      if (!win) return;
      var rect = win.getBoundingClientRect();
      win.style.setProperty('--mx', ((last.x - rect.left) / rect.width * 100).toFixed(1) + '%');
      win.style.setProperty('--my', ((last.y - rect.top) / rect.height * 100).toFixed(1) + '%');
    }

    document.addEventListener('pointermove', function (event) {
      if (event.pointerType !== 'mouse') return;
      if (!event.target.closest || !event.target.closest('.mac-window')) return;
      last = { x: event.clientX, y: event.clientY, target: event.target };
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(paint);
    }, { passive: true });
  }

  // ==========================================================================
  // Keyboard shortcuts
  // ==========================================================================

  var SECTIONS = ['#about', '#projects', '#tryout', '#contact'];

  function initShortcuts() {
    var sheet = $('[data-shortcuts]');

    function openSheet() {
      if (!sheet) return;
      sheet.hidden = false;
      Sound.open();
      var close = $('[data-shortcuts-close]', sheet);
      if (close) close.focus();
    }

    function closeSheet() {
      if (!sheet || sheet.hidden) return;
      sheet.hidden = true;
      Sound.close();
    }

    if (sheet) {
      $$('[data-open-shortcuts]').forEach(function (b) {
        b.addEventListener('click', openSheet);
      });
      var closeBtn = $('[data-shortcuts-close]', sheet);
      if (closeBtn) closeBtn.addEventListener('click', closeSheet);
      sheet.addEventListener('click', function (event) {
        if (event.target === sheet) closeSheet();
      });
      // Show the right modifier for the platform.
      var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      $$('[data-mod]', sheet).forEach(function (k) { k.textContent = isMac ? '⌘' : 'Ctrl'; });
    }

    document.addEventListener('keydown', function (event) {
      var target = event.target;
      var typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                              target.isContentEditable);

      if (event.key === 'Escape') {
        closeSheet();
        return;
      }

      // Ctrl/Cmd+K reaches the terminal even from inside a text field.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('rustamos:terminal', { detail: { toggle: true } }));
        return;
      }

      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === '?') {
        event.preventDefault();
        sheet && sheet.hidden ? openSheet() : closeSheet();
      } else if (event.key.toLowerCase() === 'm') {
        Sound.toggle();
      } else if (/^[1-4]$/.test(event.key)) {
        var section = $(SECTIONS[+event.key - 1]);
        if (!section) return;
        event.preventDefault();
        section.scrollIntoView({
          behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
          block: 'start'
        });
        Sound.blip();
      }
    });
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

  // Keyed by <html lang> so the two pages share one script.
  var TAGLINES = {
    de: [
      'IT-Security Interessiert',
      'C++ · Java · JS Developer',
      'HTL Pinkafeld — Ausbildung',
      'Baut an: KI + MCP-Server',
      'Hostet gerne lokale LLMs'
    ],
    en: [
      'Interested in IT-Security',
      'C++ · Java · JS Developer',
      'HTL Pinkafeld — Education',
      'Building: AI + MCP servers',
      'Likes hosting local LLMs'
    ]
  };

  function initTagline() {
    var el = $('#tw-text');
    if (!el) return;

    var phrases = TAGLINES[document.documentElement.lang] || TAGLINES.de;
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
    // Paired with the `run` frame time in tools/normalize_mascot.py so the
    // stride length stays believable — see the note there.
    var SPEED = 38; // px per second

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
      nextPatrolAt = now + 6000 + Math.random() * 6000;
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
      nextPatrolAt = performance.now() + 4000;
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

    // The purr goes through the shared, opt-in audio channel like everything
    // else, so one mute switch covers the whole page.
    function purrTone() { Sound.purr(); }
  }

  // ==========================================================================

  // Shared services for js/terminal.js. Kept deliberately small: the terminal
  // needs the audio channel and the reduced-motion query, nothing else.
  window.RustamOS = {
    sound: Sound,
    prefersReducedMotion: prefersReducedMotion
  };

  function init() {
    initSoundToggle();
    initBoot();
    initClock();
    initMenus();
    initScrollEffects();
    initReveal();
    initWindowShade();
    initSpotlight();
    initShortcuts();
    initThumbnailFallbacks();
    initPreviews();
    initTagline();
    initMascot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
