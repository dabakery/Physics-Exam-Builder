#!/usr/bin/env node
/**
 * Problem bank validator.
 *
 *   node scripts/validate_banks.js                      # all four course folders
 *   node scripts/validate_banks.js "AP Physics 2"       # one course, or unit, or bank folder
 *   node scripts/validate_banks.js --strict             # warnings become failures
 *   node scripts/validate_banks.js --quiet              # only banks with findings
 *
 * Exit code is 1 if any ERROR was found (or any WARN under --strict), so this
 * drops straight into a pre-commit hook or CI step.
 *
 * WHY js-yaml AND NOT PyYAML
 * --------------------------
 * Nothing parses YAML at build time. build_standalone_html.py embeds bank files
 * as raw text and injects js-yaml@4.1.0 from the CDN; the first and only parse
 * happens in the reader's browser. So the only parser whose opinion matters is
 * that one, and scripts/vendor/js-yaml.min.js is a byte-identical copy of it
 * (sha256 45dc3dd03dc07a06705a2c2989b8c7f709013f04bd5386e3279d4e447f07ebd7).
 * Vendored rather than fetched so validation works offline and cannot drift to a
 * newer release than the page actually loads. If the pin in
 * build_standalone_html.py ever moves, re-download to match and update the hash.
 *
 * js-yaml 4 is YAML 1.2; PyYAML is YAML 1.1. They disagree on inputs this repo
 * really uses: `yes`/`no` are booleans in 1.1 but plain strings in 1.2, `017` is
 * octal 15 vs decimal 17, `1:4` is sexagesimal 64 vs the string "1:4", and a
 * duplicate mapping key is silently overwritten vs thrown. Validating with the
 * wrong one issues a passing grade on a file the site will mangle.
 *
 * HOW THE CHECKS ARE CHOSEN
 * -------------------------
 * Each check mirrors a specific line of shipped code rather than a general idea
 * of good YAML, and the frontend line is cited beside it. The point is to fail
 * here for exactly the reasons the page would fail, so this file has to be
 * re-read whenever those lines change.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require(path.join(__dirname, 'vendor', 'js-yaml.min.js'));

const REPO = path.resolve(__dirname, '..');

/* Display paths repo-relative, but fall back to the absolute path for targets
   outside the repo (a scratch fixture), where "../../../private/tmp/..." is
   less readable than the real thing. */
const show = (p) => {
  const rel = path.relative(REPO, p);
  return rel.startsWith('..') ? p : rel;
};

/* Mirrors build_standalone_html.py SKIP_DIRS / SKIP_COURSES. Kept as literal
   copies rather than parsed out of the Python, because a silent divergence
   would make this validator check files that never ship, or skip files that do. */
const SKIP_DIRS = new Set([
  'Old', 'old', 'Archive', 'archive', 'Older versions', 'Older Versions',
  'Drafts', 'drafts', 'Temporary', 'temporary', 'venv', '__pycache__',
  '.git', 'Scripts', 'scripts', 'Figure Creation', 'figure_creation',
]);
const DEFAULT_COURSES = ['HS Physics', 'AP Physics 1', 'AP Physics 2', 'PHY I Mechanics'];

/* bank-source.js:671 and :854 gate on a BLACKLIST, not a whitelist:
     if (status === 'draft' || status === 'deprecated') continue;
   so a typo'd status is not a hidden bank, it is a LIVE bank. That is why an
   unrecognised status is an error here rather than a note. */
const HIDDEN_STATUS = new Set(['draft', 'deprecated']);
const KNOWN_STATUS = new Set(['draft', 'ready', 'deployed', 'deprecated']);

/* bank-source.js resolveFigure(): the raw path is tried first, then these
   subfolders against the bank directory. Same order, so "resolves here" means
   "resolves in the app". */
const FIG_DIRS = ['', 'Figures/', 'Figure/', 'figures/', 'figure/', 'Images/', 'images/'];

const QUESTION_KINDS = new Set([
  'numerical', 'multiple_choice', 'true_false', 'multiple_answers', 'categorization',
  'essay', 'file_upload', 'ordering', 'fill_in_blank', 'formula', 'hot_spot',
]);
const SINGLE_ANSWER = new Set(['multiple_choice', 'true_false']);

// ── reporting ───────────────────────────────────────────────────────────────

const findings = [];
const add = (level, bank, where, msg) => findings.push({ level, bank, where, msg });
const err = (bank, where, msg) => add('ERROR', bank, where, msg);
const warn = (bank, where, msg) => add('WARN', bank, where, msg);

// ── discovery ───────────────────────────────────────────────────────────────

function findBanks(root) {
  const out = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
      } else if (/\.ya?ml$/i.test(e.name)) {
        out.push(path.join(dir, e.name));
      }
    }
  })(root);
  return out.sort();
}

// ── prose / markup checks ───────────────────────────────────────────────────

/* CLAUDE.md's markup rules, each tied to a real downstream breakage:
     - a literal $ inverts every equation after it in the Google Docs import,
       because the Auto-LaTeX add-on pairs delimiters sequentially across the
       whole document (this is what exam-export-plus.js auditMathDelims() warns
       about at download time);
     - an unbalanced <latex> tag corrupts everything after it;
     - a bare single letter right after </latex> gets absorbed as a unit by
       unitTermToLatex(), so "<latex>x</latex> L away" becomes "$x\ \mathrm{L}$". */
function checkProse(bank, where, s) {
  if (typeof s !== 'string') return;

  const open = (s.match(/<latex>/g) || []).length;
  const close = (s.match(/<\/latex>/g) || []).length;
  if (open !== close) err(bank, where, `unbalanced latex tags (${open} open, ${close} close)`);

  const dollars = (s.match(/\$/g) || []).length;
  if (dollars) {
    const level = dollars % 2 ? 'ERROR' : 'WARN';
    add(level, bank, where,
      `${dollars} literal $ (${level === 'ERROR' ? 'ODD count, inverts all later math' : 'even count, still bypasses exporter escaping'}) - use <latex>...</latex>`);
  }

  /* The absorber only ever eats a letter that is in UNIT_BASE
     ([NJWAVCKTLmsg°] plus the multi-letter units), so a following "x" or "d" is
     inert prose and not worth reporting. The real trap is the ambiguous case
     CLAUDE.md documents: the tag holds a bare SYMBOL rather than a measured
     value, and the next token is a letter that happens to look like a unit, as
     in `<latex>x</latex> L away` becoming `$x\ \mathrm{L}$`. A payload with a
     digit in it is a quantity, and its trailing unit is correct authoring. */
  for (const m of s.matchAll(/<latex>([^<]*)<\/latex>[ \t]+([NJWAVCKTLmsg])(?![A-Za-z])/g)) {
    const payload = m[1].trim();
    if (!/[0-9]/.test(payload)) {
      warn(bank, where, `<latex>${payload}</latex> is followed by "${m[2]}" - the exporter cannot tell a unit from a variable here and will absorb it as ${m[2]}`);
    }
  }
}

// ── option semantics ────────────────────────────────────────────────────────

/* The 1.1-boolean landmine. The frontend reads these two fields with DIFFERENT
   strictness, so a `yes`/`no` breaks them in opposite directions:
     - correct: read as !!a.answer.correct (bank-source.js:296,
       exam-export-plus.js:97). The string "no" is truthy, so a distractor
       written `correct: no` grades as CORRECT.
     - lock: read as a?.answer?.lock === true (exam-export.js:30). The string
       "yes" fails ===, so `lock: yes` silently re-enables shuffling.
   Neither shows up as a parse error, which is exactly why it is checked. */
function checkBooleanField(bank, where, field, value, strictEquals) {
  if (value === undefined) return;
  if (typeof value === 'boolean') return;
  const shown = JSON.stringify(value);
  const consequence = strictEquals
    ? `read as \`=== true\`, so this is treated as NOT set`
    : `read as \`!!\`, so ${value ? 'this is treated as TRUE' : 'this is treated as false'}`;
  err(bank, where, `${field}: ${shown} is not a boolean (YAML 1.2 keeps yes/no/on/off as strings); ${consequence}`);
}

function checkQuestion(bank, q, kind, bankDir, seenIds) {
  const id = q.id || '(no id)';
  const at = (suffix) => `${id}${suffix}`;

  if (!q.id) err(bank, at(''), 'question has no id');
  else if (seenIds.has(q.id)) err(bank, at(''), `duplicate question id "${q.id}"`);
  else seenIds.add(q.id);

  checkProse(bank, at('.text'), q.text);
  for (const [k, v] of Object.entries(q.feedback || {})) checkProse(bank, at(`.${k}`), v);

  // Figure resolution, using bank-source.js's candidate order.
  if (q.figure) {
    const base = path.basename(String(q.figure).replace(/\\/g, '/'));
    const tried = FIG_DIRS.map((d) => (d === '' ? String(q.figure) : d + base));
    const hit = tried.find((rel) => fs.existsSync(path.join(bankDir, rel)));
    if (!hit) err(bank, at('.figure'), `"${q.figure}" not found (tried ${tried.join(', ')})`);
  }

  const answers = Array.isArray(q.answers) ? q.answers : null;
  if (!answers) {
    // Not every type carries answers (essay, file_upload), so this is only a
    // problem for the types that grade.
    if (SINGLE_ANSWER.has(kind) || kind === 'multiple_answers') {
      err(bank, at('.answers'), `${kind} has no answers list`);
    }
    return;
  }

  let nCorrect = 0, nLocked = 0;
  answers.forEach((wrapper, i) => {
    const a = (wrapper && wrapper.answer !== undefined) ? wrapper.answer : wrapper;
    if (a === null || typeof a !== 'object') return;
    const where = at(`.opt${i + 1}`);
    checkProse(bank, where, a.text);
    checkBooleanField(bank, where, 'correct', a.correct, false);
    checkBooleanField(bank, where, 'lock', a.lock, true);
    if (a.correct) nCorrect++;          // !! semantics, matching the frontend
    if (a.lock === true) nLocked++;     // === true semantics, matching the exporter
  });

  if (SINGLE_ANSWER.has(kind) && nCorrect !== 1) {
    err(bank, at(''), `${kind} needs exactly 1 correct option, found ${nCorrect}`);
  }
  if (kind === 'multiple_answers' && nCorrect === 0) {
    err(bank, at(''), 'multiple_answers has no correct option');
  }

  /* answersHaveLock() is `.some()`, so ONE locked option freezes the whole
     question. A partial lock therefore does nothing extra and usually means the
     author believed they were pinning a single row. */
  if (nLocked > 0 && nLocked < answers.length) {
    warn(bank, at(''), `${nLocked} of ${answers.length} options locked - one lock freezes the whole question, so the rest are redundant or the lock is a mistake`);
  }
  /* A figure alone means nothing: most figure questions have prose options that
     shuffle harmlessly. The breakage is specific to options that are BARE LABELS
     pointing into the figure ("Graph III", "B"), which only make sense in the
     order the panels are drawn. Detect that shape rather than the presence of an
     image. */
  const labelOnly = answers.every((wrapper) => {
    const a = (wrapper && wrapper.answer !== undefined) ? wrapper.answer : wrapper;
    const t = (a && typeof a.text === 'string') ? a.text.trim() : '';
    return /^(?:graph|figure|diagram|option|choice)?\s*(?:I{1,3}V?|IV|VI{0,3}|[A-H])\.?$/i.test(t);
  });
  if (q.figure && labelOnly && nLocked === 0 && answers.length > 1) {
    warn(bank, at(''), 'options are bare figure labels but none is locked - seededShuffle will reorder them out of step with the panels');
  }
}

// ── per-bank driver ─────────────────────────────────────────────────────────

function validateBank(file) {
  const bank = show(file);
  const bankDir = path.dirname(file);
  let doc;

  try {
    doc = yaml.load(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(bank, '(parse)', `js-yaml refused the file: ${e.message.split('\n')[0]}`);
    return { status: '(unparsed)', questions: 0 };
  }
  if (!doc || typeof doc !== 'object') {
    err(bank, '(parse)', 'file is empty or not a mapping');
    return { status: '(empty)', questions: 0 };
  }

  /* bank-source.js:230  isBank(data) => Array.isArray(data?.questions)
     Anything else is a stray YAML file living under a course folder (prompt
     logs, scratch metadata, figure data). The page skips those outright at
     :668, so reporting them as broken banks would be inventing a problem the
     site does not have. */
  if (!Array.isArray(doc.questions)) {
    return { status: '(not a bank)', questions: 0, notBank: true };
  }

  const info = doc.bank_info || {};
  const status = info.status === undefined ? '' : String(info.status);

  if (!info.bank_id) {
    warn(bank, 'bank_info.bank_id', 'missing');
  } else {
    const folder = path.basename(bankDir);
    const stem = path.basename(file).replace(/\.ya?ml$/i, '');
    /* Cosmetic, not fatal: findBankRef keys off the path, so a mismatched id
       only shows up in QTI download names. Warn so own content stays tidy
       without burying real breakage in upstream's inherited drift. */
    if (folder !== info.bank_id) warn(bank, 'bank_info.bank_id', `"${info.bank_id}" does not match folder "${folder}"`);
    if (stem !== info.bank_id) warn(bank, 'bank_info.bank_id', `"${info.bank_id}" does not match filename "${stem}"`);
  }

  if (!status) err(bank, 'bank_info.status', 'missing - bank-source.js only hides "draft"/"deprecated", so a bank with no status SHIPS');
  else if (!KNOWN_STATUS.has(status)) err(bank, 'bank_info.status', `"${status}" is not one of draft/ready/deployed/deprecated - unrecognised values are NOT hidden, so this bank SHIPS`);

  checkProse(bank, 'bank_info.description', info.description);

  const questions = Array.isArray(doc.questions) ? doc.questions : [];
  if (!questions.length) warn(bank, 'questions', 'no questions in this bank');

  const seenIds = new Set();
  for (const item of questions) {
    if (!item || typeof item !== 'object') { err(bank, 'questions', 'malformed question entry'); continue; }
    const kind = Object.keys(item)[0];
    const q = item[kind];
    if (!q || typeof q !== 'object') { err(bank, `questions.${kind}`, 'malformed question body'); continue; }
    if (!QUESTION_KINDS.has(kind)) warn(bank, q.id || kind, `unrecognised question type "${kind}"`);
    checkQuestion(bank, q, kind, bankDir, seenIds);
  }

  return { status: status || '(none)', questions: questions.length };
}

// ── main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const quiet = args.includes('--quiet');
  const targets = args.filter((a) => !a.startsWith('--'));

  const roots = (targets.length ? targets : DEFAULT_COURSES)
    .map((t) => (path.isAbsolute(t) ? t : path.join(REPO, t)));

  const files = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) { console.error(`no such path: ${r}`); process.exitCode = 1; continue; }
    if (fs.statSync(r).isDirectory()) files.push(...findBanks(r));
    else files.push(r);
  }

  console.log(`js-yaml 4.1.0 (vendored, byte-identical to the copy the page loads)`);
  console.log(`${files.length} bank file(s)\n`);

  const rows = [];
  for (const f of files) {
    const before = findings.length;
    const res = validateBank(f);
    rows.push({ file: show(f), status: res.status, questions: res.questions, notBank: !!res.notBank, found: findings.length - before });
  }

  const skipped = rows.filter((r) => r.notBank).length;
  if (skipped) console.log(`(${skipped} file(s) under a course folder have no \`questions:\` list; the page skips these, so they are not checked as banks)\n`);

  const width = Math.max(...rows.map((r) => r.file.length), 4);
  for (const r of rows) {
    if (quiet && (!r.found || r.notBank)) continue;
    const ships = r.status === '(not a bank)' ? '-' : (HIDDEN_STATUS.has(r.status) ? 'hidden' : 'LIVE');
    console.log(`${r.file.padEnd(width)}  ${String(r.questions).padStart(3)}q  ${r.status.padEnd(11)} ${ships.padEnd(6)} ${r.found ? r.found + ' finding(s)' : 'clean'}`);
  }

  const errors = findings.filter((f) => f.level === 'ERROR');
  const warns = findings.filter((f) => f.level === 'WARN');

  for (const group of [errors, warns]) {
    if (!group.length) continue;
    console.log(`\n${group[0].level}S (${group.length})`);
    let last = null;
    for (const f of group) {
      if (f.bank !== last) { console.log(`  ${f.bank}`); last = f.bank; }
      console.log(`    ${f.where}: ${f.msg}`);
    }
  }

  console.log(`\n${errors.length} error(s), ${warns.length} warning(s)`);
  if (errors.length || (strict && warns.length)) process.exitCode = 1;
}

main();
