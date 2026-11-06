// Loads each generated page with all of its scripts in jsdom and pokes at it.
// Needs jsdom (npm install). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import { loadData, ROOT } from '../tools/build.mjs';

const data = loadData();
const pages = data.langs.map((lang) => ({ lang, file: data.site.languages[lang].file }));

// Only local files are loaded; fonts, iframes to github.io etc. are skipped.
class LocalOnly extends ResourceLoader {
  fetch(url, options) {
    if (options.element?.localName === 'iframe') return null; // demos are separate apps
    return url.startsWith('file:') ? super.fetch(url, options) : null;
  }
}

async function open(file) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (e) => errors.push(String(e)));
  const dom = await JSDOM.fromFile(path.join(ROOT, file), {
    runScripts: 'dangerously', resources: new LocalOnly(), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
      w.open = () => null; // terminal `open`/`cv` would open a tab
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  await new Promise((r) => dom.window.addEventListener('load', r));
  await new Promise((r) => setTimeout(r, 50));
  return { w: dom.window, d: dom.window.document, errors, close: () => dom.window.close() };
}

/** Tag/id/class skeleton of the static markup (no scripts) — identical for every language by design. */
async function skeleton(file) {
  const d = (await JSDOM.fromFile(path.join(ROOT, file))).window.document;
  return [...d.body.querySelectorAll('*')].map((el) => `${el.tagName}#${el.id}.${el.className.baseVal ?? el.className}`).join('\n');
}

const loaded = {};
const skeletons = {};
for (const { lang, file } of pages) {
  loaded[lang] = await open(file);
  skeletons[lang] = await skeleton(file);
}

for (const { lang, file } of pages) {
  const { w, d, errors } = loaded[lang];
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  test(`${file}: no JavaScript errors on load`, () => assert.deepEqual(errors, []));

  test(`${file}: <html lang> and language switch`, () => {
    assert.equal(d.documentElement.lang, lang);
    const other = pages.find((p) => p.lang !== lang);
    assert.equal(d.querySelector('.lang-switch').getAttribute('href'), other.file);
  });

  test(`${file}: no duplicate ids, every #link has a target`, () => {
    const ids = [...d.querySelectorAll('[id]')].map((e) => e.id);
    assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), []);
    const targets = [...d.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1));
    assert.deepEqual(targets.filter((t) => !d.getElementById(t)), []);
  });

  test(`${file}: every local src/href/data-src exists on disk`, () => {
    const refs = [...d.querySelectorAll('[src], [href], [data-src]')]
      .flatMap((el) => ['src', 'href', 'data-src'].map((a) => el.getAttribute(a)))
      .filter((v) => v && !/^(https?:|mailto:|#|data:)/.test(v));
    assert.deepEqual(refs.filter((r) => !existsSync(path.join(ROOT, r.split(/[?#]/)[0]))), []);
  });

  test(`${file}: one card per entry in src/projects.json and src/demos.json`, () => {
    assert.equal(d.querySelectorAll('.proj-card').length, data.strings.projects.length);
    assert.equal(d.querySelectorAll('[data-preview]').length, data.strings.demos.length);
  });

  test(`${file}: terminal answers from the page`, () => {
    const input = d.querySelector('[data-term-input]');
    const form = d.querySelector('[data-term-form]');
    const run = (cmd) => { input.value = cmd; form.dispatchEvent(new w.Event('submit', { cancelable: true })); };
    run('projects');
    const out = d.querySelector('[data-term-out]').textContent;
    for (const name of [...d.querySelectorAll('.proj-card h3')].map((h) => h.textContent)) {
      assert.ok(out.includes(name), `"projects" output lacks ${name}`);
    }
    for (const cmd of ['help', 'whoami', 'skills', 'contact', 'neofetch', 'demo', 'cv', 'nonsense']) run(cmd);
    assert.deepEqual(errors, []);
  });

  test(`${file}: every app in the side rail opens a window`, () => {
    const layer = d.querySelector('[data-wins]');
    for (const button of d.querySelectorAll('[data-app]')) {
      const before = layer.children.length;
      click(button);
      assert.ok(layer.children.length > before, `app ${button.dataset.app} opened no window`);
    }
    assert.deepEqual(errors, []);
  });

  test(`${file}: menus, preview cards and shortcut sheet run without errors`, () => {
    d.querySelectorAll('[data-menu-toggle], [data-preview-toggle], [data-open-shortcuts], [data-shortcuts-close]').forEach(click);
    assert.deepEqual(errors, []);
  });
}

test('all language pages share the same markup skeleton', () => {
  const [first, ...rest] = data.langs;
  for (const lang of rest) assert.equal(skeletons[lang], skeletons[first], `${lang} differs from ${first}`);
});

test.after(() => Object.values(loaded).forEach((p) => p.close()));
