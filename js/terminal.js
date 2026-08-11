/**
 * rustam.os — terminal
 *
 * A small shell for the portfolio. Every command reads its answer out of the
 * live page rather than from a copy kept here: `projects` walks the project
 * cards, `skills` walks the tag list, `contact` walks the link buttons. That
 * means the terminal can never fall out of sync with the site, it needs no
 * translation of its own, and it cannot state anything the page does not.
 *
 * Loaded after js/main.js, which provides window.RustamOS.
 */
(function () {
  'use strict';

  var OS = window.RustamOS || {};
  var Sound = OS.sound || { key: function () {}, open: function () {},
                            close: function () {}, blip: function () {} };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Pad a label so the two-column listings line up. */
  function pad(text, width) {
    text = String(text);
    return text + new Array(Math.max(1, width - text.length + 1)).join(' ');
  }

  // ==========================================================================
  // The page, read as data
  // ==========================================================================

  var page = {
    lang: function () { return (document.documentElement.lang || 'de').toLowerCase(); },

    name: function () {
      var h1 = $('h1.title');
      return h1 ? h1.textContent.trim() : 'Rustam';
    },

    /** Just the given name — the heading reads "Hi, ich bin Rustam." */
    user: function () {
      var name = page.name()
        .replace(/^\s*(hi|hallo|hey)\s*[,!]?\s*/i, '')
        .replace(/^(ich bin|i'm|i am|my name is)\s+/i, '')
        .replace(/[.!]+\s*$/, '')
        .trim();
      return name || 'rustam';
    },

    about: function () {
      return $$('.about-text p').map(function (p) {
        return p.textContent.replace(/\s+/g, ' ').trim();
      });
    },

    eyebrow: function () {
      var el = $('.about-grid .eyebrow');
      return el ? el.textContent.trim() : '';
    },

    skills: function () {
      return $$('.tags .tag').map(function (el) { return el.textContent.trim(); });
    },

    projects: function () {
      return $$('.proj-card').map(function (card) {
        return {
          name: ($('h3', card) || {}).textContent.trim(),
          desc: ($$('p', card)[0] || {}).textContent.replace(/\s+/g, ' ').trim(),
          stack: ($('.stack', card) || {}).textContent.trim(),
          url: card.href
        };
      });
    },

    demos: function () {
      return $$('[data-preview]').map(function (card) {
        var bar = $('[data-preview-toggle]', card);
        var label = bar ? bar.textContent.replace(/\s+/g, ' ').trim() : '';
        return {
          // The title bar reads "onlineide klicken" — the first token is the id.
          id: label.split(' ')[0],
          card: card
        };
      });
    },

    info: function () {
      return $$('.info-row').map(function (row) {
        return {
          key: ($('.k', row) || {}).textContent.trim(),
          value: ($('.v', row) || {}).textContent.trim()
        };
      });
    },

    links: function () {
      return $$('.links .link-btn').map(function (a) {
        return { label: a.textContent.replace(/^▣\s*/, '').trim(), url: a.href };
      });
    }
  };

  // ==========================================================================
  // Commands
  // ==========================================================================

  var CAT_ART = [
    '   /\\_/\\  ',
    '  ( o.o ) ',
    '   > ^ <  '
  ];

  var commands = {};

  function define(name, summary, run, hidden) {
    commands[name] = { name: name, summary: summary, run: run, hidden: hidden };
  }

  define('help', 'this list', function () {
    var rows = Object.keys(commands)
      .filter(function (k) { return !commands[k].hidden; })
      .map(function (k) {
        return '  <span class="t-key">' + pad(k, 11) + '</span><span class="t-dim">' +
               esc(commands[k].summary) + '</span>';
      });
    return ['available commands', ''].concat(rows).concat([
      '', '<span class="t-dim">tab completes · ↑ ↓ history · Esc closes</span>'
    ]).join('\n');
  });

  define('whoami', 'who is behind this', function () {
    var out = ['<span class="t-key">' + esc(page.name()) + '</span>'];
    var eyebrow = page.eyebrow();
    if (eyebrow) out.push('<span class="t-dim">' + esc(eyebrow) + '</span>');
    out.push('');
    page.about().forEach(function (p) { out.push(esc(p)); out.push(''); });
    return out.join('\n').replace(/\n+$/, '');
  });

  define('skills', 'languages and focus', function () {
    var skills = page.skills();
    return 'loaded modules (' + skills.length + ')\n\n' +
      skills.map(function (s) { return '  <span class="t-ok">▪</span> ' + esc(s); }).join('\n');
  });

  define('projects', 'list the repositories', function () {
    var list = page.projects();
    return list.map(function (p, i) {
      return '<span class="t-key">' + pad(String(i + 1) + '.', 4) + esc(p.name) + '</span>\n' +
             '    <span class="t-dim">' + esc(p.desc) + '</span>\n' +
             '    <span class="t-dim">stack:</span> ' + esc(p.stack);
    }).join('\n\n') + '\n\n<span class="t-dim">open &lt;name|number&gt; to visit a repo</span>';
  });

  define('open', 'open a project on GitHub', function (args) {
    var list = page.projects();
    var query = (args[0] || '').toLowerCase();
    if (!query) return '<span class="t-warn">usage:</span> open &lt;name|number&gt;';

    var hit = /^\d+$/.test(query)
      ? list[+query - 1]
      : list.filter(function (p) { return p.name.toLowerCase().indexOf(query) === 0; })[0] ||
        list.filter(function (p) { return p.name.toLowerCase().indexOf(query) > -1; })[0];

    if (!hit) return '<span class="t-warn">not found:</span> ' + esc(query);
    window.open(hit.url, '_blank', 'noopener');
    return 'opening <span class="t-key">' + esc(hit.name) + '</span> …';
  });

  define('demo', 'run a project in the page', function (args) {
    var demos = page.demos();
    var query = (args[0] || '').toLowerCase();
    if (!query) {
      return 'runnable demos\n\n' + demos.map(function (d) {
        return '  <span class="t-key">' + esc(d.id) + '</span>';
      }).join('\n') + '\n\n<span class="t-dim">demo &lt;name&gt; to launch one</span>';
    }
    var hit = demos.filter(function (d) { return d.id.toLowerCase().indexOf(query) > -1; })[0];
    if (!hit) return '<span class="t-warn">no such demo:</span> ' + esc(query);

    var toggle = $('[data-preview-toggle]', hit.card);
    if (toggle && !hit.card.classList.contains('is-expanded')) toggle.click();
    hit.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return 'launching <span class="t-key">' + esc(hit.id) + '</span> …';
  });

  define('contact', 'how to reach me', function () {
    return page.links().map(function (l) {
      return '  <span class="t-key">' + pad(l.label, 11) + '</span>' +
             '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
             esc(l.url.replace(/^mailto:/, '')) + '</a>';
    }).join('\n');
  });

  define('cv', 'download the CV', function () {
    var link = page.links().filter(function (l) { return /lebenslauf|resume|cv/i.test(l.url); })[0];
    if (!link) return '<span class="t-warn">not available</span>';
    window.open(link.url, '_blank', 'noopener');
    return 'downloading <span class="t-key">' + esc(link.label) + '</span> …';
  });

  define('neofetch', 'system information', function () {
    var rows = [['user', page.user()]];
    page.info().forEach(function (r) { rows.push([r.key.toLowerCase(), r.value.replace(/^●\s*/, '')]); });
    rows.push(['skills', page.skills().length + ' loaded']);
    rows.push(['repos', page.projects().length + ' public']);
    rows.push(['shell', 'rustam.os']);

    var body = rows.map(function (r) {
      return '<span class="t-key">' + pad(r[0], 10) + '</span><span class="t-dim">·</span> ' + esc(r[1]);
    });
    var art = CAT_ART.concat(['', '']);
    var lines = [];
    for (var i = 0; i < Math.max(art.length, body.length); i++) {
      lines.push('<span class="t-art">' + esc(pad(art[i] || '', 11)) + '</span>' + (body[i] || ''));
    }
    return lines.join('\n');
  });

  define('cat', 'pet the cat', function (args) {
    if (args.length && !/lizzie/i.test(args[0])) {
      return '<span class="t-warn">cat:</span> ' + esc(args[0]) + ': No such file or directory';
    }
    var sprite = $('[data-mascot-sprite]');
    if (sprite) {
      sprite.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
      window.setTimeout(function () {
        sprite.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
      }, 2600);
    }
    return CAT_ART.map(function (l) { return '<span class="t-art">' + esc(l) + '</span>'; }).join('\n') +
           '\n\n<span class="t-dim">Lizzie is purring.</span>';
  });

  define('lang', 'switch language', function () {
    var other = $('.lang-switch');
    if (!other) return '<span class="t-warn">not available</span>';
    window.location.href = other.getAttribute('href');
    return 'switching …';
  });

  define('sudo', '', function (args) {
    if (!args.length) return '<span class="t-warn">usage:</span> sudo &lt;command&gt;';
    return '<span class="t-warn">' + esc(page.user().toLowerCase()) +
           ' is not in the sudoers file.</span>\n' +
           '<span class="t-dim">This incident has been reported to the cat.</span>';
  }, true);

  define('clear', 'clear the screen', function () {
    out.innerHTML = '';
    return '';
  });

  define('exit', '', function () {
    return '<span class="t-dim">There is no exit. This terminal is the page.</span>';
  }, true);

  // ==========================================================================
  // Shell
  // ==========================================================================

  var root, win, out, input, bar;
  var history = [];
  var historyIndex = -1;

  function write(html, className) {
    var block = document.createElement('div');
    block.className = 't-block' + (className ? ' ' + className : '');
    block.innerHTML = html;
    out.appendChild(block);
    scrollToEnd();
  }

  function scrollToEnd() {
    var body = $('[data-term-body]', root);
    if (body) body.scrollTop = body.scrollHeight;
  }

  function echo(line) {
    write('<span class="t-ok">$</span> <span class="t-cmd">' + esc(line) + '</span>', 't-echo');
  }

  function run(line) {
    var parts = line.trim().split(/\s+/);
    var name = (parts.shift() || '').toLowerCase();
    if (!name) return;

    echo(line.trim());
    history.unshift(line.trim());
    historyIndex = -1;

    var command = commands[name];
    if (!command) {
      write('<span class="t-warn">command not found:</span> ' + esc(name) +
            '\n<span class="t-dim">type <span class="t-key">help</span> for the list</span>');
      return;
    }
    var result = command.run(parts);
    if (result) write(result);
  }

  /**
   * Bring the terminal into view and put the caret in it.
   *
   * Never called on load: focusing an input at page load steals the caret,
   * scrolls the page and takes the space bar away from the reader.
   */
  function focusTerminal() {
    root.scrollIntoView({
      behavior: (OS.prefersReducedMotion && OS.prefersReducedMotion.matches) ? 'auto' : 'smooth',
      block: 'center'
    });
    input.focus({ preventScroll: true });
    Sound.open();
  }

  // ---- self-running intro -------------------------------------------------
  // The terminal is live from page load, but nothing about a prompt says
  // "type in me". So the first time it scrolls into view it runs one command
  // by itself, typing it out, and then hands over. Any real interaction
  // cancels it — nobody should have to fight a demo for their own caret.

  function playIntro() {
    var DEMO = 'whoami';
    var cancelled = false;

    function cancel() { cancelled = true; }
    input.addEventListener('keydown', cancel, { once: true });
    input.addEventListener('focus', cancel, { once: true });

    if (OS.prefersReducedMotion && OS.prefersReducedMotion.matches) {
      run(DEMO);
      return;
    }

    var i = 0;
    (function type() {
      if (cancelled) { input.value = ''; return; }
      if (i < DEMO.length) {
        input.value = DEMO.slice(0, ++i);
        Sound.key();
        window.setTimeout(type, 90 + Math.random() * 60);
        return;
      }
      window.setTimeout(function () {
        if (cancelled) { input.value = ''; return; }
        input.value = '';
        run(DEMO);
      }, 420);
    }());
  }

  function inView() {
    var rect = root.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
  }

  function initIntro() {
    var started = false;
    function begin() {
      if (started) return;
      started = true;
      window.setTimeout(playIntro, 700);
    }

    // The terminal sits in the About section, so on a normal load it is
    // already on screen. Measure rather than wait for an observer callback:
    // IntersectionObserver delivery is tied to rendering, which a backgrounded
    // tab suspends, and the intro would then never start.
    if (inView()) { begin(); return; }

    var onScroll = function () {
      if (!inView()) return;
      window.removeEventListener('scroll', onScroll);
      begin();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ==========================================================================

  function init() {
    root = $('[data-terminal]');
    if (!root) return;
    win = $('.term__window', root);
    out = $('[data-term-out]', root);
    input = $('[data-term-input]', root);
    if (!win || !out || !input) return;

    // Greeting is written now, not on first focus: the terminal is part of the
    // page, so it should never look like an empty box.
    write('<span class="t-dim">rustam.os shell — reads this page live. ' +
          'Type <span class="t-key">help</span>.</span>');

    $$('[data-open-terminal]').forEach(function (b) {
      b.addEventListener('click', function (event) {
        event.preventDefault();
        focusTerminal();
      });
    });

    // main.js owns the keyboard map and asks for the terminal through an event.
    window.addEventListener('rustamos:terminal', focusTerminal);

    $('[data-term-form]', root).addEventListener('submit', function (event) {
      event.preventDefault();
      var value = input.value;
      input.value = '';
      run(value);
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { input.blur(); return; }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (!history.length) return;
        event.preventDefault();
        historyIndex += event.key === 'ArrowUp' ? 1 : -1;
        historyIndex = Math.min(Math.max(historyIndex, -1), history.length - 1);
        input.value = historyIndex < 0 ? '' : history[historyIndex];
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        var typed = input.value.trim().toLowerCase();
        if (!typed) return;
        var match = Object.keys(commands).filter(function (k) {
          return !commands[k].hidden && k.indexOf(typed) === 0;
        });
        if (match.length === 1) input.value = match[0] + ' ';
        else if (match.length > 1) write('<span class="t-dim">' + match.join('  ') + '</span>');
        return;
      }

      if (event.key.length === 1) Sound.key();
    });

    // Clicking anywhere in the window puts the caret back where it belongs.
    win.addEventListener('click', function (event) {
      if (event.target.closest('a, button')) return;
      if (window.getSelection && String(window.getSelection())) return;
      input.focus({ preventScroll: true });
    });

    initIntro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
