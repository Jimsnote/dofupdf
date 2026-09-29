#!/usr/bin/env node
/**
 * Copy QA for the Japanese-only site text — the guard rail for rewriting copy.
 *
 *   node scripts/check-copy.mjs             # audit against the pinned baseline
 *   node scripts/check-copy.mjs --update    # re-pin the baseline (deliberate only)
 *   node scripts/check-copy.mjs --tells     # list every ratcheted tell with its key
 *
 * Why a baseline instead of standalone rules: rewriting copy cannot be checked by
 * the compiler. A missing `{size}` placeholder, a renamed key, a title that grew
 * past what a search result shows — all of them type-check fine and break in
 * production. The baseline (scripts/copy-baseline.json) is the copy as it was
 * before the humanisation pass, so drift is measured against a fixed point.
 *
 * Structural checks fail the run; style checks are reported but do not.
 * Exit code is the number of failures.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE = path.join(ROOT, 'scripts', 'copy-baseline.json');
const RATCHET = path.join(ROOT, 'scripts', 'copy-tells.json');
const UPDATE = process.argv.includes('--update');
const TELLS = process.argv.includes('--tells');

/** Files that hold user-facing Japanese copy. */
function copyFiles() {
  const files = ['src/i18n/locales/ja.ts', 'src/lib/tools.ts', 'src/lib/site.ts'];
  for (const dir of ['src/lib/guides', 'src/lib/compare']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith('.ts'))) {
      files.push(`${dir}/${f}`);
    }
  }
  return files;
}

/**
 * Extract every string literal with its exact key path, via the TypeScript AST.
 *
 * A line-based parser was tried first and quietly missed a third of the copy
 * (nested objects, double quotes, inline `{ ... }` entries) — a guard that
 * silently skips strings is worse than no guard. `typescript` is already a
 * devDependency, so the parse is exact and costs nothing.
 *
 * Copy files also hold identifiers that must not drift (slugs, i18nKey, status,
 * canonical URLs), and those are picked up here too: pinning them in the baseline
 * is a feature, since a rewrite pass that touches one gets reported.
 */
function extract(file) {
  const fullPath = path.join(ROOT, file);
  const source = ts.createSourceFile(fullPath, fs.readFileSync(fullPath, 'utf8'), ts.ScriptTarget.Latest, true);
  const out = new Map();

  const visit = (node, at) => {
    // `export const a, b` and `import { x }` leave holes here, and every
    // ts.is*Node() guard dereferences node.kind.
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (at) out.set(at, node.text);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const name = prop.name.getText().replace(/^['"]|['"]$/g, '');
        visit(prop.initializer, at ? `${at}.${name}` : name);
      }
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((el, i) => visit(el, `${at}[${i}]`));
      return;
    }
    // `export const ja = { ... }` parses as a VariableStatement whose only field is
    // `declarationList`; the `declarations` array lives one level down on that node.
    // Treating the two kinds as interchangeable yields "declarations is not
    // iterable" for every top-level statement.
    if (ts.isVariableStatement(node) || ts.isExportDeclaration(node)) {
      visit(node.declarationList ?? node.declaration, at);
      return;
    }
    if (ts.isVariableDeclarationList(node)) {
      for (const decl of node.declarations) visit(decl, at);
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      // Only the initialised value holds copy; the type annotation can contain
      // string literals ('live' | 'coming-soon') that are identifiers, not text.
      if (node.initializer) visit(node.initializer, node.name.getText());
      return;
    }
    if (ts.isExportAssignment(node)) {
      visit(node.expression, at);
    }
  };

  for (const statement of source.statements) visit(statement, '');
  return out;
}
const placeholders = (s) => (s.match(/\{[A-Za-z_]\w*\}/g) ?? []).slice().sort();

/** Last meaningful segment of a key path, indices stripped: `a.b[2].title` -> `title`. */
function lastSegment(key) {
  // Called `trail`: a local named `path` would shadow the imported module for the
  // whole file, and every path.join() would then read undefined.
  const trail = key.split('::')[1] ?? '';
  const clean = trail.replace(/\[\d+\]/g, '');
  return clean.split('.').filter(Boolean).pop() ?? '';
}

/** Characters that never appear in Japanese copy. `？` and `：` do, so they stay out. */
const BAD_CHARS = ['，', '；', '！', '“', '”', '‘', '’'];

/**
 * An em-dash right after a short comma-free run is a chip and its gloss
 * (`中央 — ページに1つ`, `JPG — ファイルサイズ小`), not an English-style aside.
 * The test is deliberately rough: the prose count is a trend, not a verdict.
 */
function isLabelHead(head) {
  return head.length <= 16 && !head.includes('。') && !head.includes('、');
}

/**
 * Opt-out marker for a single string, written as a trailing line comment whose
 * text is exactly this constant.
 * Copy that *quotes* what a user might type has to contain the wrong characters on
 * purpose — the split-page-range guide shows a full-width comma to prove the
 * parser accepts it. Comments are not part of the AST string values, so the marker
 * lives beside the text it excuses without polluting it.
 */
const ALLOW_CJK = 'copy-check: allow-cjk-punctuation';
const rawLines = new Map();
function lineAllows(key, ch) {
  if (!BAD_CHARS.includes(ch)) return false;
  const file = key.split('::')[0];
  if (!rawLines.has(file)) {
    rawLines.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/));
  }
  return rawLines.get(file).some((line) => line.includes(ALLOW_CJK) && line.includes(ch));
}

const files = copyFiles();
const current = new Map();
const emptyFiles = [];
for (const f of files) {
  const found = extract(f);
  if (found.size === 0) {
    emptyFiles.push(f);
    continue;
  }
  for (const [k, v] of found) current.set(`${f}::${k}`, v);
}
// A copy file with hundreds of strings yielding none means the AST walk broke. The
// index/type modules really are string-free, so the trigger is the aggregate, and
// refusing to run is better than pinning a blank baseline that nothing can violate.
if (current.size === 0) {
  console.error(`extract() yielded 0 strings across ${files.length} files — the AST walk is broken`);
  process.exit(1);
}

// ---------- collect ----------
const failures = [];
const notices = [];
const proseDash = [];
const labelDash = [];
const titleDash = [];
const userGenitive = [];
let changed = 0;
let charDelta = 0;

const baseline = new Map();
if (!UPDATE && fs.existsSync(BASELINE)) {
  const raw = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  for (const [k, v] of Object.entries(raw)) baseline.set(k, v);
}

if (!UPDATE && baseline.size === 0) {
  failures.push('no baseline found — run: node scripts/check-copy.mjs --update');
}

for (const [key, value] of current) {
  const name = lastSegment(key);
  const isJoinery = /(?:connector|separator|divider)$/i.test(name);

  // --- always-on, baseline-independent rules ---
  for (const ch of BAD_CHARS) {
    if (value.includes(ch) && !lineAllows(key, ch)) failures.push(`${key}: 中国語の読点「${ch}」が混入`);
  }
  const opens = (value.match(/「/g) ?? []).length;
  const closes = (value.match(/」/g) ?? []).length;
  if (opens !== closes) failures.push(`${key}: 「」 の数が合っていない (${opens}/${closes})`);
  const po = (value.match(/（/g) ?? []).length;
  const pc = (value.match(/）/g) ?? []).length;
  if (po !== pc) failures.push(`${key}: （） の数が合っていない (${po}/${pc})`);
  if (/\{\{|\}\}/.test(value)) failures.push(`${key}: 二重の中括弧は補間を壊す`);
  // Joinery like `totalConnector: ' / '` is spaced on purpose; trimming it would
  // glue 「1 / 12」 into 「1/12」 in the rendered page-number list.
  if (value !== value.trim() && !isJoinery) failures.push(`${key}: 先頭・末尾の空白`);

  if (/^\{\s*$/.test(value)) continue;
  if (name === 'title' && value.length > 60) notices.push(`${key}: title が ${value.length} 字（検索結果では約 60 字で切れる）`);
  if (name === 'description' && value.length > 160) notices.push(`${key}: description が ${value.length} 字（約 160 字で切れる）`);
  // ` — ` is the strongest translation-ese tell in this corpus, but it wears three
  // hats and only one of them is a defect:
  //   title  `PDF結合 — オンラインで無料 | DofuPDF`  — a normal search-result separator
  //   label  `中央 — ページに1つ`                       — a chip and its gloss
  //   prose  `23個のツール — 結合、分割 — すべて`        — an English aside, not Japanese
  // `——` (two em-dashes, no spaces) is always the prose hat: no title separator or
  // UI chip is ever written that way, so those strings count as prose unconditionally.
  // Only the prose tier is ratcheted; counting the raw character would push a
  // rewrite pass toward punctuation that is correct as it stands.
  const dashParts = value.split(' — ');
  if (value.includes('——') || value.includes('――')) {
    proseDash.push(key);
  } else if (dashParts.length > 1) {
    if (name === 'metaTitle' || name === 'ogTitle') titleDash.push(key);
    else if (dashParts.length === 2 && isLabelHead(dashParts[0])) labelDash.push(key);
    else proseDash.push(key);
  }
  if (value.includes('ユーザーの')) userGenitive.push(key);

  // --- baseline comparisons ---
  const base = baseline.get(key);
  if (!base) continue;
  if (base !== value) {
    changed += 1;
    charDelta += value.length - base.length;
    const bp = placeholders(base).join(',');
    const cp = placeholders(value).join(',');
    if (bp !== cp) failures.push(`${key}: 補間プレースホルダが変わりました [${bp}] -> [${cp}]`);
    if (base.length > 10 && value.length > base.length * 1.8) {
      notices.push(`${key}: ${base.length} 字 -> ${value.length} 字（1.8 倍超に膨らんでいる）`);
    }
    if (base.length > 30 && value.length < base.length * 0.35) {
      notices.push(`${key}: ${base.length} 字 -> ${value.length} 字（情報落ちの疑い）`);
    }
    if (value.trim().length === 0) failures.push(`${key}: 空文字になった`);
  }
}

if (baseline.size) {
  for (const key of baseline.keys()) if (!current.has(key)) failures.push(`${key}: ベースラインにあって今ないキー（削除・改名は不可）`);
  for (const key of current.keys()) if (!baseline.has(key)) failures.push(`${key}: 新しいキー（ベースラインに無いキーは追加しない）`);
}

// ---------- report ----------
if (UPDATE) {
  const obj = Object.fromEntries([...current.entries()].sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(BASELINE, JSON.stringify(obj, null, 1) + '\n', 'utf8');
  fs.writeFileSync(RATCHET, JSON.stringify({
    proseDash: proseDash.length,
    labelDash: labelDash.length,
    titleDash: titleDash.length,
    userGenitive: userGenitive.length,
  }, null, 1) + '\n', 'utf8');
  const skipped = emptyFiles.length ? ` (no strings in: ${emptyFiles.join(', ')})` : '';
  console.log(`baseline pinned: ${current.size} strings across ${files.length - emptyFiles.length} files -> scripts/copy-baseline.json${skipped}`);
  console.log(`tells pinned: dash prose ${proseDash.length} / label ${labelDash.length} / title ${titleDash.length}, ユーザーの ${userGenitive.length} -> scripts/copy-tells.json`);
  process.exit(0);
}

console.log(`\ncheck-copy: ${current.size} strings across ${files.length - emptyFiles.length} files`);
for (const f of emptyFiles) console.log(`  (no strings in ${f})`);
console.log(`  changed vs baseline: ${changed}  (net ${charDelta >= 0 ? '+' : ''}${charDelta} chars)`);

// Ratchet counters, compared with the pinned copy so a pass can be scored rather
// than merely described. Stored beside the copy because the baseline is rewritten
// only deliberately — see COPY-JA-STYLE.md.
if (fs.existsSync(RATCHET)) {
  const prev = JSON.parse(fs.readFileSync(RATCHET, 'utf8'));
  const row = (label, now, before, ratcheted) => {
    const delta = now < before ? `${before} -> ${now} 改善` : now > before ? `${before} -> ${now} 悪化` : `${now} (unchanged)`;
    console.log(`  TELL ${label.padEnd(24)} ${delta}${ratcheted ? '' : '  (参考値)'}`);
    if (ratcheted && now > before) notices.push(`${label} の数が増えている (${before} -> ${now})`);
  };
  row('「 — 」挿入句', proseDash.length, prev.proseDash ?? 0, true);
  row('ユーザーの', userGenitive.length, prev.userGenitive ?? 0, true);
  row('「 — 」ラベル', labelDash.length, prev.labelDash ?? 0, false);
  row('「 — 」タイトル区切り', titleDash.length, prev.titleDash ?? 0, false);
} else {
  console.log(`  TELL 「 — 」挿入句        ${proseDash.length} (first reading, no ratchet file yet)`);
  console.log(`  TELL ユーザーの            ${userGenitive.length}`);
  console.log(`  TELL 「 — 」ラベル        ${labelDash.length} (参考値)`);
  console.log(`  TELL 「 — 」タイトル区切り ${titleDash.length} (参考値)`);
}
for (const n of notices) console.log(`  NOTE ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);

// Where the tells actually are, so a rewrite pass can work down a list instead of
// grepping by hand. Keys are printed as `file::path` and the text is truncated:
// the point is the location, not another read of the whole paragraph.
if (TELLS) {
  const cut = (v) => (v.length > 90 ? `${v.slice(0, 90)}…` : v);
  const lines = [];
  const section = (label, keys) => {
    lines.push(`--- ${label}: ${keys.length} ---`);
    for (const k of keys) lines.push(`${k}\n    ${cut(current.get(k))}`);
  };
  section('prose dash', proseDash);
  section('ユーザーの', userGenitive);
  // Written with fs, not console: a shell redirect re-encodes the stream and a
  // PowerShell console turns the Japanese into mojibake.
  fs.writeFileSync(path.join(ROOT, 'tmp-tells.txt'), lines.join('\n') + '\n', 'utf8');
  console.log(`tells listed -> tmp-tells.txt (${proseDash.length} prose dash, ${userGenitive.length} ユーザーの)`);
}
console.log(`\n=== ${failures.length} failures, ${notices.length} notes ===`);
process.exit(Math.min(failures.length, 125));
