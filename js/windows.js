/**
 * rustam.os — window manager and apps
 *
 * The side rail lists apps; clicking one opens a real floating window that can
 * be dragged, raised and closed. None of this is required to use the site:
 * the page still scrolls normally and the View menu still holds plain section
 * links, so anyone who does not want to play can ignore the whole thing.
 *
 * Like the terminal, every window builds its content from the live page —
 * finder walks the project cards, about clones the About copy — so nothing is
 * duplicated here and no window can state something the page does not.
 *
 * Loaded after js/main.js, which provides window.RustamOS.
 */
(function () {
  'use strict';

  var OS = window.RustamOS || {};
  var Sound = OS.sound || { open: function () {}, close: function () {}, blip: function () {} };
  var reduceMotion = OS.prefersReducedMotion || { matches: false };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  var layer, strings = {};
  var open = {};        // id -> { win, body }
  var topZ = 1;
  var cascade = 0;

  function str(key, fallback) { return strings[key] || fallback; }

  // ==========================================================================
  // Page data
  // ==========================================================================

  function projects() {
    return $$('.proj-card').map(function (card) {
      var img = $('.proj-thumb-img', card);
      return {
        name: ($('h3', card) || {}).textContent.trim(),
        stack: ($('.stack', card) || {}).textContent.trim(),
        url: card.href,
        thumb: img && img.getAttribute('src')
      };
    });
  }

  function demos() {
    return $$('[data-preview]').map(function (card) {
      var frame = $('iframe[data-src]', card);
      var bar = $('[data-preview-toggle]', card);
      var link = $('.tryout-caption a', card);
      var img = $('.tryout-thumb-img', card);
      var label = bar ? bar.textContent.replace(/\s+/g, ' ').trim().split(' ')[0] : '';
      return {
        id: label,
        src: frame && frame.getAttribute('data-src'),
        url: link && link.href,
        thumb: img && img.getAttribute('src'),
        caption: ($('.tryout-caption', card) || {}).textContent.replace(/\s+/g, ' ').trim()
      };
    }).filter(function (d) { return d.src; });
  }

  // ==========================================================================
  // App content builders. Each returns { body, width, height }.
  // ==========================================================================

  var apps = {};

  apps.finder = function () {
    var list = projects();
    var wrap = el('div', 'finder');

    var bar = el('div', 'finder__toolbar');
    bar.appendChild(el('span', 'finder__path', '/projects'));
    bar.appendChild(el('span', 'finder__count', list.length + ' ' + str('items', 'items')));
    wrap.appendChild(bar);

    var ul = el('ul', 'finder__list');
    list.forEach(function (p) {
      var li = el('li');
      var a = el('a', 'finder__row');
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';

      if (p.thumb) {
        var img = el('img', 'finder__thumb');
        img.src = p.thumb;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', function () { img.remove(); });
        a.appendChild(img);
      }
      a.appendChild(el('span', 'finder__name', p.name));
      a.appendChild(el('span', 'finder__meta', p.stack));
      a.appendChild(el('span', 'finder__go', '↗'));
      a.addEventListener('click', function () { Sound.blip(); });

      li.appendChild(a);
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    return { body: wrap, width: 560, height: 420 };
  };

  apps.preview = function () {
    var list = demos();
    var wrap = el('div', 'finder finder--split');

    var side = el('div', 'finder__side');
    var bar = el('div', 'finder__toolbar');
    bar.appendChild(el('span', 'finder__path', '/demos'));
    bar.appendChild(el('span', 'finder__count', String(list.length)));
    side.appendChild(bar);

    var ul = el('ul', 'finder__list');
    side.appendChild(ul);
    wrap.appendChild(side);

    var stage = el('div', 'finder__stage');
    var stageBar = el('div', 'finder__stagebar');
    var stageName = el('span', null, '—');
    var stageLink = el('a', null, str('newtab', 'open in new tab'));
    stageLink.target = '_blank';
    stageLink.rel = 'noopener';
    stageLink.hidden = true;
    stageBar.appendChild(stageName);
    stageBar.appendChild(stageLink);
    stage.appendChild(stageBar);

    var frameWrap = el('div', 'finder__frame');
    var empty = el('div', 'finder__empty', str('select', 'pick a project'));
    frameWrap.appendChild(empty);
    stage.appendChild(frameWrap);
    wrap.appendChild(stage);

    var iframe = null;

    list.forEach(function (d) {
      var li = el('li');
      var row = el('button', 'finder__row');
      row.type = 'button';

      if (d.thumb) {
        var img = el('img', 'finder__thumb');
        img.src = d.thumb;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', function () { img.remove(); });
        row.appendChild(img);
      }
      row.appendChild(el('span', 'finder__name', d.id));

      row.addEventListener('click', function () {
        $$('.finder__row', ul).forEach(function (r) { r.classList.remove('is-active'); });
        row.classList.add('is-active');
        Sound.open();

        if (!iframe) {
          iframe = el('iframe');
          iframe.setAttribute('loading', 'lazy');
          iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-pointer-lock');
          frameWrap.appendChild(iframe);
        }
        empty.textContent = str('loading', 'loading …');
        empty.hidden = false;
        iframe.addEventListener('load', function () { empty.hidden = true; }, { once: true });
        iframe.src = d.src;

        stageName.textContent = d.id;
        if (d.url) { stageLink.href = d.url; stageLink.hidden = false; }
        else { stageLink.hidden = true; }
      });

      li.appendChild(row);
      ul.appendChild(li);
    });

    return { body: wrap, width: 780, height: 500 };
  };

  apps.about = function () {
    var pad = el('div', 'win__pad');
    var photo = $('.photo-slot');
    var text = $('.about-text');
    var tags = $('.tags');
    if (photo) pad.appendChild(photo.cloneNode(true));
    if (text) pad.appendChild(text.cloneNode(true));
    if (tags) pad.appendChild(tags.cloneNode(true));
    return { body: pad, width: 460, height: 440 };
  };

  apps.contact = function () {
    var pad = el('div', 'win__pad');
    var links = $('.links');
    var info = $('.info-rows');
    if (links) pad.appendChild(links.cloneNode(true));
    if (info) {
      var spacer = el('div');
      spacer.style.height = 'var(--space-5)';
      pad.appendChild(spacer);
      pad.appendChild(info.cloneNode(true));
    }
    return { body: pad, width: 440, height: 380 };
  };

  // ==========================================================================
  // Window manager
  // ==========================================================================

  function raise(id) {
    var entry = open[id];
    if (!entry) return;
    topZ += 1;
    entry.win.style.zIndex = String(topZ);
    Object.keys(open).forEach(function (key) {
      open[key].win.classList.toggle('is-front', key === id);
    });
  }

  function place(win, width, height) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var w = Math.min(width, vw - 32);
    var h = Math.min(height, vh - 120);
    // Cascade so a second window never lands exactly on the first.
    var offset = (cascade % 5) * 26;
    cascade += 1;
    win.style.setProperty('--win-w', w + 'px');
    win.style.setProperty('--win-x', Math.max(12, Math.round((vw - w) / 2) - 60 + offset) + 'px');
    win.style.setProperty('--win-y', Math.max(52, Math.round((vh - h) / 2) - 30 + offset) + 'px');
    win.style.height = h + 'px';
  }

  function closeWindow(id) {
    var entry = open[id];
    if (!entry) return;
    var button = $('[data-app="' + id + '"]');
    if (button) button.setAttribute('aria-pressed', 'false');
    Sound.close();

    var done = function () {
      entry.win.remove();
      delete open[id];
    };
    if (reduceMotion.matches) { done(); return; }
    entry.win.classList.add('is-closing');
    window.setTimeout(done, 160);
  }

  function openWindow(id) {
    if (open[id]) { raise(id); return; }
    var build = apps[id];
    if (!build) return;

    var made = build();
    var win = el('div', 'win');
    win.setAttribute('data-win', id);
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', id + '.app');

    var bar = el('div', 'win__bar');
    var close = el('button', 'win__close');
    close.type = 'button';
    close.setAttribute('aria-label', str('close', 'Close window'));
    close.addEventListener('click', function (event) {
      event.stopPropagation();
      closeWindow(id);
    });
    bar.appendChild(close);
    bar.appendChild(el('span', 'win__title', id + '.app'));
    bar.appendChild(el('span', 'win__spacer'));

    var body = el('div', 'win__body');
    body.appendChild(made.body);

    win.appendChild(bar);
    win.appendChild(body);
    place(win, made.width, made.height);
    layer.appendChild(win);

    open[id] = { win: win, body: body };
    raise(id);
    Sound.open();

    var button = $('[data-app="' + id + '"]');
    if (button) button.setAttribute('aria-pressed', 'true');

    win.addEventListener('pointerdown', function () { raise(id); });
    initDrag(win, bar);
    close.focus({ preventScroll: true });
  }

  function toggleWindow(id) {
    if (open[id]) closeWindow(id); else openWindow(id);
  }

  // ---- dragging -----------------------------------------------------------
  // Windows are fixed-position, so nothing in the document flow can shift.

  function initDrag(win, bar) {
    var drag = null;

    bar.addEventListener('pointerdown', function (event) {
      if (event.target.closest('.win__close')) return;
      if (!window.matchMedia('(min-width: 901px)').matches) return;
      var rect = win.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      bar.setPointerCapture(event.pointerId);
    });

    bar.addEventListener('pointermove', function (event) {
      if (!drag) return;
      var w = win.offsetWidth;
      var h = win.offsetHeight;
      // Keep the title bar reachable: clamp so it can never leave the viewport.
      var x = Math.min(Math.max(event.clientX - drag.dx, 8 - w + 90), window.innerWidth - 90);
      var y = Math.min(Math.max(event.clientY - drag.dy, 40), window.innerHeight - 44);
      win.style.setProperty('--win-x', Math.round(x) + 'px');
      win.style.setProperty('--win-y', Math.round(y) + 'px');
    });

    var end = function (event) {
      if (!drag) return;
      drag = null;
      try { bar.releasePointerCapture(event.pointerId); } catch (error) {}
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  // ==========================================================================

  function init() {
    layer = $('[data-wins]');
    var rail = $('[data-apps]');
    if (!layer || !rail) return;

    // Translated chrome strings ride on the markup so this file stays neutral.
    ['select', 'items', 'close', 'run', 'newtab', 'loading'].forEach(function (key) {
      var value = rail.getAttribute('data-s-' + key);
      if (value) strings[key] = value;
    });

    $$('[data-app]', rail).forEach(function (button) {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () { toggleWindow(button.getAttribute('data-app')); });
    });

    // Escape closes the frontmost window.
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var ids = Object.keys(open);
      if (!ids.length) return;
      var front = ids.sort(function (a, b) {
        return (+open[b].win.style.zIndex || 0) - (+open[a].win.style.zIndex || 0);
      })[0];
      closeWindow(front);
    });

    // Keep windows on screen when the viewport shrinks.
    window.addEventListener('resize', function () {
      Object.keys(open).forEach(function (id) {
        var win = open[id].win;
        var rect = win.getBoundingClientRect();
        if (rect.left > window.innerWidth - 90) {
          win.style.setProperty('--win-x', Math.max(8, window.innerWidth - 200) + 'px');
        }
        if (rect.top > window.innerHeight - 44) {
          win.style.setProperty('--win-y', Math.max(40, window.innerHeight - 120) + 'px');
        }
      });
    });

    window.RustamOS.windows = { open: openWindow, close: closeWindow, toggle: toggleWindow };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
