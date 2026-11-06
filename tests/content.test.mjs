// Checks the source data in src/ without a browser: translations, data fields, asset paths.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildAll, ROOT } from '../tools/build.mjs';

const { used, data } = buildAll();
const { strings, langs } = data;
const exists = (p) => existsSync(path.join(ROOT, p.split(/[?#]/)[0]));
const isLocal = (p) => !/^(https?:|mailto:|#)/.test(p);
const isLangObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

test('every string has every language and none is empty', () => {
  const problems = [];
  for (const [key, value] of Object.entries(strings)) {
    if (key === 'projects' || key === 'demos' || !isLangObject(value)) continue;
    for (const lang of langs) {
      if (typeof value[lang] !== 'string' || !value[lang].trim()) problems.push(`${key}.${lang}`);
    }
  }
  assert.deepEqual(problems, [], 'missing or empty translations');
});

test('every string in src/strings.json is used by a template', () => {
  const unused = Object.keys(strings).filter((k) => !used.has(k));
  assert.deepEqual(unused, [], 'remove these from src/strings.json or use them in src/');
});

test('projects: required fields, unique names, translated descriptions', () => {
  const required = ['name', 'repo', 'thumb', 'emoji', 'stack', 'desc'];
  for (const p of strings.projects) {
    for (const field of required) assert.ok(p[field], `project ${p.name ?? '?'} is missing "${field}"`);
    for (const lang of langs) assert.ok(p.desc[lang], `project ${p.name}: desc.${lang} missing`);
    assert.match(p.repo, /^https:\/\/github\.com\//, `project ${p.name}: repo must be a GitHub URL`);
  }
  const names = strings.projects.map((p) => p.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, 'duplicate project name');
});

test('demos: required fields, and either newTab or caption', () => {
  for (const d of strings.demos) {
    for (const field of ['file', 'title', 'thumb', 'emoji', 'src', 'sandbox']) {
      assert.ok(d[field], `demo ${d.title ?? '?'} is missing "${field}"`);
    }
    assert.equal(typeof d.wasm, 'boolean', `demo ${d.title}: "wasm" must be true or false`);
    assert.ok(d.newTab || d.caption, `demo ${d.title}: needs "newTab" (URL) or "caption"`);
  }
});

test('all local files referenced in src/ data exist', () => {
  const paths = [
    ...strings.projects.map((p) => p.thumb),
    ...strings.demos.flatMap((d) => [d.thumb, d.src]).filter(isLocal),
    ...langs.map((l) => strings['cv.file'][l])
  ];
  assert.deepEqual(paths.filter((p) => !exists(p)), []);
});

test('every mascot frame in js/mascot-manifest.js exists', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(path.join(ROOT, 'js/mascot-manifest.js'), 'utf8'), sandbox);
  const m = sandbox.window.MASCOT_MANIFEST;
  const files = Object.values(m.states).flatMap((s) => s.frames.map((f) => m.basePath + f));
  assert.ok(files.length > 0);
  assert.deepEqual(files.filter((f) => !exists(f)), []);
});
