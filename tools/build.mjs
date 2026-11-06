#!/usr/bin/env node
/**
 * Builds index.html (German) and index_en.html (English) from src/.
 *
 *   node tools/build.mjs           write both pages
 *   node tools/build.mjs --check   exit 1 if a page is out of date (used by npm test)
 *
 * No dependencies. The output is committed, so the deployed site is still exactly
 * what is in the repository and the pages still open straight from disk.
 *
 * Template syntax (a small subset of Mustache), used in src/page.html and src/sections/*.html:
 *
 *   {{key}}             text, HTML-escaped (& < > ")
 *   {{{key}}}           raw HTML (only for strings that contain markup, e.g. about.text1)
 *   {{> name}}          include src/sections/name.html
 *   {{#key}}…{{/key}}   array: repeat per item · truthy value: render once · missing/false: skip
 *   {{^key}}…{{/key}}   render only if key is missing, false or an empty array
 *   {{.}}               the current item itself (for arrays of strings)
 *   {{! … }}            template comment, not written to the output
 *
 * A tag that stands alone on its line ({{#…}}, {{/…}}, {{^…}}, {{> …}}, {{! …}}) removes
 * that whole line, so loops do not leave blank lines behind.
 *
 * Key lookup, first hit wins:
 *   1. the current loop item(s), innermost first   (fields from src/projects.json, src/demos.json)
 *   2. src/strings.json                            (also the lists "projects" and "demos")
 *   3. @-variables from src/site.json: @lang @file @url @base @altLang @altFile @altUrl
 *      @ogLocale @ogLocaleAlt
 * A value of the form { "de": …, "en": … } is resolved to the current language.
 * An unknown {{key}} or a missing translation is a build error, never a blank.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const readJson = (file) => JSON.parse(readFileSync(path.join(SRC, file), 'utf8'));

export function loadData() {
  const site = readJson('site.json');
  const strings = readJson('strings.json');
  strings.projects = readJson('projects.json');
  strings.demos = readJson('demos.json');
  return { site, strings, langs: Object.keys(site.languages) };
}

// ---------------------------------------------------------------------------
// Template source: partials + standalone-line stripping
// ---------------------------------------------------------------------------

const STANDALONE = /^[ \t]*(\{\{[#^/>][^}]*\}\}|\{\{!(?:(?!\}\})[\s\S])*\}\})[ \t]*\r?\n/gm;

function loadTemplate(file, seen = []) {
  if (seen.includes(file)) throw new Error(`Partial cycle: ${[...seen, file].join(' → ')}`);
  const full = path.join(SRC, file);
  if (!existsSync(full)) throw new Error(`Missing template ${path.relative(ROOT, full)}${seen.length ? ` (included from ${seen.at(-1)})` : ''}`);
  return readFileSync(full, 'utf8')
    .replace(STANDALONE, '$1')
    .replace(/\{\{!(?:(?!\}\})[\s\S])*\}\}/g, '')
    .replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => loadTemplate(`sections/${name}.html`, [...seen, file]));
}

// ---------------------------------------------------------------------------
// Parser: flat tag stream -> tree
// ---------------------------------------------------------------------------

const TAG = /\{\{\{\s*([\w.@-]+)\s*\}\}\}|\{\{\s*([#^/]?)\s*([\w.@-]+|\.)\s*\}\}/g;

function parse(source) {
  const root = { children: [] };
  const stack = [root];
  let last = 0;
  for (const m of source.matchAll(TAG)) {
    const top = stack.at(-1);
    if (m.index > last) top.children.push({ type: 'text', value: source.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1]) { top.children.push({ type: 'raw', name: m[1] }); continue; }
    const [, , sigil, name] = m;
    if (sigil === '#' || sigil === '^') {
      const node = { type: sigil === '#' ? 'section' : 'inverted', name, children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (sigil === '/') {
      if (top.name !== name) throw new Error(`{{/${name}}} closes {{#${top.name ?? '(nothing)'}}}`);
      stack.pop();
    } else {
      top.children.push({ type: 'var', name });
    }
  }
  if (stack.length > 1) throw new Error(`Unclosed {{#${stack.at(-1).name}}}`);
  if (last < source.length) root.children.push({ type: 'text', value: source.slice(last) });
  const leftover = source.match(/\{\{[^}]*\}\}/g)?.filter((t) => !t.match(new RegExp(TAG.source)));
  if (leftover?.length) throw new Error(`Unrecognised template tag(s): ${leftover.join(' ')}`);
  return root;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function vars(site, lang) {
  const langs = Object.keys(site.languages);
  const alt = langs.find((l) => l !== lang) ?? lang;
  const cfg = site.languages[lang];
  const altCfg = site.languages[alt];
  return {
    '@lang': lang, '@file': cfg.file, '@url': site.base + cfg.file, '@base': site.base,
    '@altLang': alt, '@altFile': altCfg.file, '@altUrl': site.base + altCfg.file,
    '@ogLocale': cfg.ogLocale, '@ogLocaleAlt': altCfg.ogLocale
  };
}

function renderLang(tree, data, lang, used = new Set()) {
  const v = vars(data.site, lang);

  // { de, en } -> the current language; anything else is returned as is.
  function translate(value, name) {
    if (isPlainObject(value) && Object.keys(value).every((k) => data.langs.includes(k))) {
      if (!(lang in value)) throw new Error(`"${name}" has no "${lang}" translation`);
      return value[lang];
    }
    return value;
  }

  function lookup(name, ctx, optional) {
    if (name === '.') return translate(ctx.at(-1), '.');
    for (let i = ctx.length - 1; i >= 0; i--) {
      if (isPlainObject(ctx[i]) && Object.hasOwn(ctx[i], name)) return translate(ctx[i][name], name);
    }
    if (Object.hasOwn(data.strings, name)) { used.add(name); return translate(data.strings[name], name); }
    if (Object.hasOwn(v, name)) return v[name];
    if (optional) return undefined;
    throw new Error(`Unknown key {{${name}}} (lang ${lang}) — add it to src/strings.json or the data item`);
  }

  function walk(nodes, ctx) {
    let out = '';
    for (const n of nodes) {
      if (n.type === 'text') out += n.value;
      else if (n.type === 'var') out += esc(lookup(n.name, ctx));
      else if (n.type === 'raw') out += String(lookup(n.name, ctx));
      else {
        const value = lookup(n.name, ctx, true);
        const empty = !value || (Array.isArray(value) && value.length === 0);
        if (n.type === 'inverted') { if (empty) out += walk(n.children, ctx); }
        else if (Array.isArray(value)) value.forEach((item) => { out += walk(n.children, [...ctx, item]); });
        else if (!empty) out += walk(n.children, [...ctx, value]);
      }
    }
    return out;
  }

  return walk(tree.children, []);
}

/** @returns {{ pages: Record<string, string>, used: Set<string>, data: object }} */
export function buildAll() {
  const data = loadData();
  const tree = parse(loadTemplate('page.html'));
  const used = new Set(['projects', 'demos']);
  const pages = {};
  for (const lang of data.langs) pages[data.site.languages[lang].file] = renderLang(tree, data, lang, used);
  return { pages, used, data };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let pages;
  try {
    ({ pages } = buildAll());
  } catch (error) {
    console.error(`build failed: ${error.message}`);
    process.exit(1);
  }
  const stale = [];
  for (const [file, html] of Object.entries(pages)) {
    const target = path.join(ROOT, file);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === html) continue;
    if (check) stale.push(file);
    else { writeFileSync(target, html); console.log(`wrote ${file}`); }
  }
  if (check) {
    if (stale.length) {
      console.error(`out of date: ${stale.join(', ')} — someone edited the generated file or forgot \`npm run build\`.\n` +
                    'Edit src/ (never the generated pages), then run `npm run build`.');
      process.exit(1);
    }
    console.log('pages are up to date');
  }
}
