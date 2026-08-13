/**
 * exam-quiz.js — interactive on-site quiz mode (fork-local, enhanced build only).
 *
 * Turns the current Exam Cart into a self-check quiz that is graded in the
 * browser, then surfaces the `on_correct` / `on_incorrect` feedback that the
 * banks already carry for Canvas QTI but that nothing else in this app reads
 * (bank-source.js keeps only `feedback.general`).
 *
 * Deliberate limits, accepted by the owner:
 *   - The bank zip — answers included — is embedded in the page. This is a
 *     practice tool, NOT an assessment of record.
 *   - Nothing is persisted or collected. A refresh discards the attempt.
 *
 * Grades every question type the live corpus actually contains: numerical (331),
 * multiple_choice (162), multiple_answers (112) and categorization (83), which
 * is all 688 questions across the 32 ready/deployed banks. Any other type still
 * renders, marked as not scored, so it is visibly excluded rather than silently
 * dropped.
 *
 * There is no upstream counterpart to this file, so it never conflicts on an
 * upstream merge. Everything it needs is already exported by bank-source.js
 * and exam-export.js.
 */
(function (global) {
  'use strict';

  /* ── Physics Tutor Gem ──────────────────────────────────────────────────────
     Public share URL of the Gemini Gem students are sent to. PASTE IT HERE.
     While this is empty the "Get help" button is not rendered at all, so the
     page never ships a button that goes nowhere.

     Gemini has no supported URL parameter for pre-filling the prompt box, and
     gemini.google.com sends x-frame-options: DENY so it cannot be embedded
     either. Copying to the clipboard and letting the student paste is the only
     approach that needs no browser extension. */
  const TUTOR_URL = 'https://gemini.google.com/gem/3916ac7e53b6';

  /* Folder name → what the student should see in the prompt. Anything not
     listed falls back to the folder name as written. */
  const COURSE_LABELS = {
    'HS Physics': 'high school Physics',
    'AP Physics 1': 'AP Physics 1',
    'AP Physics 2': 'AP Physics 2',
    'PHY I Mechanics': 'PHY I Mechanics',
  };

  const GRADABLE = new Set([
    'multiple_choice', 'multiple_answers', 'numerical', 'categorization',
  ]);

  /* Longest category description allowed in a <select> option before it is
     truncated. The full text is always available in the legend above the items.
     Category descriptions run to 143 characters and contain no math, so plain
     truncated text in an option is safe. */
  const OPTION_MAX = 70;

  /* Applied when a numerical answer declares no tolerance (42 of 498 do not).
     Relative, so it scales with magnitude the way significant figures do. */
  const DEFAULT_REL_TOL = 0.01;
  /* Absolute fallback when the expected value is exactly 0 and a relative
     tolerance would collapse to nothing. */
  const ZERO_ABS_TOL = 1e-9;

  let Q = null;   // active attempt: { items, version, title, graded }
  let opts = {};  // { renderMath, toast }

  /* ── selection ─────────────────────────────────────────────────────────────
     Mirrors buildExamHtml() in exam-export.js so "Quiz v2" contains exactly the
     questions, in the same order with the same shuffled options, as "Exam v2".
     Two details must stay in lockstep with that file:
       - the window start ((version-1)*qn) % n
       - the shuffle seed, which uses qNum BEFORE it is incremented
     seedFor() is not exported, so it is reproduced here. */
  function seedFor(version, qNum) {
    return BigInt(version) * 10000n + BigInt(qNum);
  }

  /* Which questions a cart item contributes at a given version, and where each
     came from. Single source of truth for the windowing, so the "new set"
     preview count cannot drift from what the new set actually contains. */
  function windowFor(item, version) {
    const questions = (item.rawData || {}).questions || [];
    if (!questions.length) return [];
    const qn = Math.max(1, Number(item.qn) || 1);
    const n = questions.length;
    const start = (((Number(version) - 1) * qn) % n);
    const out = [];
    for (let i = 0; i < qn; i++) {
      const idx = (start + i) % n;
      out.push({ q: questions[idx], idx });
    }
    return out;
  }

  /* Stable identity for "the student has already seen this one". */
  function keyOf(item, idx) { return `${item.path}#${idx}`; }

  function selectionKeys(cart, version) {
    const keys = [];
    for (const item of cart || []) {
      for (const w of windowFor(item, version)) keys.push(keyOf(item, w.idx));
    }
    return keys;
  }

  async function collectQuestions(cart, version, bankSource) {
    const BS = global.EstelaBankSource;
    const EX = global.EstelaExamExport;
    const items = [];
    let qNum = 0;

    for (const item of cart) {
      const slots = windowFor(item, version);
      if (!slots.length) continue;
      const bankRef = item.bankRef || { path: item.path, handle: { path: item.path } };

      for (const slot of slots) {
        const q = slot.q;
        const qtype = BS.getQtype(q);
        const qdata = q[qtype] || {};

        let figUrl = '';
        if (bankSource && bankSource.resolveFigure) {
          try { figUrl = await bankSource.resolveFigure(bankRef, qdata, bankRef) || ''; }
          catch (_e) { figUrl = ''; }
        }

        const fb = qdata.feedback || {};
        const entry = {
          num: qNum + 1,
          key: keyOf(item, slot.idx),
          type: qtype,
          typeLabel: BS.typeLabel(qtype),
          bankId: (item.meta || {}).bank_id || '',
          course: courseLabelFor(item.path),
          rawText: qdata.text || '',   // untouched source, for the tutor prompt
          body: BS.latexToHtml(qdata.text || ''),
          figUrl,
          feedback: {
            general: BS.latexToHtml(fb.general || ''),
            onCorrect: BS.latexToHtml(fb.on_correct || ''),
            onIncorrect: BS.latexToHtml(fb.on_incorrect || ''),
          },
          options: null,
          numeric: null,
          scored: false,
          response: null,
        };

        if (qtype === 'multiple_choice' || qtype === 'multiple_answers') {
          const rawAnswers = qdata.answers || [];
          const list = EX.extractMcAnswers(rawAnswers).map(([j, text, correct]) => [j, text, correct]);
          if (!EX.answersHaveLock(rawAnswers)) {
            EX.seededShuffle(list, seedFor(version, qNum));
          }
          entry.options = list.map(([, text, correct]) => ({
            text: BS.latexToHtml(text),
            correct: !!correct,
          }));
          // A question with no correct option cannot be scored either way.
          entry.scored = entry.options.some(o => o.correct);
        } else if (qtype === 'numerical') {
          entry.numeric = numericSpec(qdata.answer || {});
          entry.scored = !!entry.numeric;
        } else if (qtype === 'categorization') {
          /* Canvas models this as buckets holding items, and buildCategorizationGroups
             flattens it that way: real categories carry correct:true, and the optional
             distractor bucket carries correct:false. The quiz inverts it — one dropdown
             per item asking which category it belongs to. That is the only orientation
             that generalises, since a category may hold several items (26 hold two,
             36 hold three, 12 hold four) and a per-category dropdown could not express
             that. No item text repeats across categories, so each item has exactly one
             right answer. */
          const groups = global.EstelaBankSource.buildCategorizationGroups(qdata);
          const cats = groups.filter(g => g.correct !== false);
          const dump = groups.find(g => g.correct === false);

          const cells = [];
          cats.forEach((g, ci) => (g.items || []).forEach(t => cells.push({ text: t, cat: ci })));
          if (dump) (dump.items || []).forEach(t => cells.push({ text: t, cat: -1 }));
          EX.seededShuffle(cells, seedFor(version, qNum));

          entry.categories = cats.map(g => g.title);
          entry.cells = cells;
          entry.hasNone = !!dump;
          entry.scored = cats.length > 0 && cells.length > 0;
        }

        qNum += 1;
        items.push(entry);
      }
    }
    return items;
  }

  /* ── numerical grading ─────────────────────────────────────────────────── */

  function numericSpec(ans) {
    const value = Number(ans.value);
    if (ans.value == null || ans.value === 'null' || !isFinite(value)) return null;

    const rawTol = Number(ans.tolerance);
    const isPercent = String(ans.margin_type || '').toLowerCase() === 'percent';
    let tol;
    if (isFinite(rawTol) && rawTol > 0) {
      tol = isPercent ? Math.abs(value) * (rawTol / 100) : rawTol;
    } else {
      tol = Math.abs(value) * DEFAULT_REL_TOL;
    }
    if (!(tol > 0)) tol = ZERO_ABS_TOL;
    return { value, tol, declared: isFinite(rawTol) && rawTol > 0, rawTol, isPercent };
  }

  /* Forgiving parse: takes the leading number and ignores anything after it, so
     "9.8", "9.8 m/s^2" and "1.2e3" all work. Units live outside <latex> in the
     banks, so a student typing them is expected, not an error. */
  function parseNumber(input) {
    const cleaned = String(input == null ? '' : input).trim().replace(/,/g, '');
    if (!cleaned) return NaN;
    const m = cleaned.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function gradeItem(item) {
    if (!item.scored) return { state: 'skipped' };

    if (item.type === 'numerical') {
      const given = parseNumber(item.response);
      if (!isFinite(given)) return { state: 'blank' };
      const ok = Math.abs(given - item.numeric.value) <= item.numeric.tol;
      return { state: ok ? 'correct' : 'incorrect', given };
    }

    if (item.type === 'categorization') {
      // All-or-nothing, matching multiple_answers. Every item must be placed.
      const resp = (item.response && typeof item.response === 'object') ? item.response : {};
      const answered = item.cells.filter((_c, i) => resp[i] !== undefined && resp[i] !== '');
      if (!answered.length) return { state: 'blank' };
      const ok = item.cells.every((cell, i) => {
        const v = resp[i];
        if (v === undefined || v === '') return false;
        return v === 'none' ? cell.cat === -1 : Number(v) === cell.cat;
      });
      return { state: ok ? 'correct' : 'incorrect' };
    }

    const picked = item.response instanceof Set ? item.response : new Set();
    if (!picked.size) return { state: 'blank' };

    if (item.type === 'multiple_choice') {
      const idx = [...picked][0];
      return { state: item.options[idx] && item.options[idx].correct ? 'correct' : 'incorrect' };
    }

    // multiple_answers — exact set match; partial credit is not modelled.
    const correct = new Set(item.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0));
    const same = picked.size === correct.size && [...picked].every(i => correct.has(i));
    return { state: same ? 'correct' : 'incorrect' };
  }

  /* ── rendering ─────────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── "Get help" prompt ─────────────────────────────────────────────────── */

  /* The path's first segment is the course folder (bank-source.js:740 derives it
     the same way), but a local-folder source can hand back an absolute path, so
     match any known course name anywhere in the path before falling back. */
  function courseLabelFor(path) {
    const parts = String(path || '').split('/');
    for (const p of parts) {
      if (COURSE_LABELS[p]) return COURSE_LABELS[p];
    }
    return parts.find(Boolean) || 'Physics';
  }

  /* Raw bank text → LaTeX the tutor can parse. Inline <latex>v_f</latex> becomes
     $v_f$ and a block tag becomes $$…$$. The $$ is deliberate here: the single-$
     rule in CLAUDE.md exists for the Google Docs Auto-LaTeX add-on, and this text
     goes to a chat box instead, where $$ is the reliable display-math delimiter.
     Markdown bold is left as ** ** rather than converted to HTML. */
  function toPlainLatex(raw) {
    return String(raw || '')
      .replace(/<latex>\s*\n([\s\S]*?)\n\s*<\/latex>/g, '$$$$\n$1\n$$$$')
      .replace(/<latex>([\s\S]*?)<\/latex>/g, '$$$1$')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  function helpPrompt(item) {
    const body = toPlainLatex(item.rawText);
    // Avoid ".?" when the question already ends in its own punctuation.
    const tail = /[.?!]$/.test(body) ? '' : '.';
    return `I need help with this Physics problem from ${item.course}. `
      + `The question is ${body}${tail}`;
  }

  /* Must run inside the click handler with nothing awaited first, or iOS Safari
     rejects the write. Falls back to execCommand for non-secure contexts. */
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_e) {
      return false;
    }
  }

  /* <option> text is plain text, so tags are stripped rather than rendered.
     Category descriptions carry no math, so nothing is lost here; the legend
     above the rows shows the full description as HTML. */
  function shorten(html, max) {
    const plain = String(html == null ? '' : html).replace(/<[^>]*>/g, '').trim();
    return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
  }

  function expectedText(spec) {
    const tolTxt = spec.declared
      ? ` ± ${spec.rawTol}${spec.isPercent ? '%' : ''}`
      : ` ± ${(DEFAULT_REL_TOL * 100).toFixed(0)}% (assumed)`;
    return `${spec.value}${tolTxt}`;
  }

  function itemHTML(item, result) {
    const graded = !!result;
    const stateCls = graded ? `qz-${result.state}` : '';

    /* Nothing that gives the answer away is emitted unless the student got it
       right: not the worked solution, not the correct-option marker, not the
       expected value. A wrong or blank answer keeps "Try again" honest.
       Per-option marks are suppressed wholesale rather than hidden only on the
       correct option, because on multiple_answers, marking just the student's
       wrong picks would identify their right ones by elimination. Their own
       selections stay visible in the disabled inputs. */
    const reveal = graded && result.state === 'correct';

    let inputs = '';
    if (item.options) {
      const kind = item.type === 'multiple_choice' ? 'radio' : 'checkbox';
      inputs = item.options.map((o, i) => {
        const checked = item.response instanceof Set && item.response.has(i);
        const mark = reveal && o.correct
          ? '<span class="qz-mark qz-mark-ok">correct</span>' : '';
        return `<label class="qz-opt${reveal && o.correct ? ' qz-opt-ok' : ''}">
          <input type="${kind}" name="qz-${item.num}" value="${i}"
                 ${checked ? 'checked' : ''} ${graded ? 'disabled' : ''}
                 onchange="EstelaExamQuiz.onPick(${item.num},${i},'${kind}')">
          <span class="qz-opt-body"><b>${String.fromCharCode(65 + i)}.</b> ${o.text}${mark}</span>
        </label>`;
      }).join('');
    } else if (item.numeric) {
      const val = item.response == null ? '' : esc(item.response);
      inputs = `<div class="qz-num">
        <input type="text" inputmode="decimal" class="inp qz-num-inp" value="${val}"
               placeholder="Your answer…" ${graded ? 'disabled' : ''}
               oninput="EstelaExamQuiz.onType(${item.num},this.value)">
        ${reveal ? `<span class="qz-expected">Expected ${esc(expectedText(item.numeric))}</span>` : ''}
      </div>`;
    } else if (item.cells) {
      const resp = (item.response && typeof item.response === 'object') ? item.response : {};
      const legend = item.categories.map((title, i) =>
        `<li><span class="qz-cat-key">${i + 1}</span><span>${title}</span></li>`).join('');
      // Build the option list per row so the chosen value is marked directly,
      // rather than by patching a shared string.
      const optionsFor = (sel) => {
        const opt = (value, label) =>
          `<option value="${value}"${String(value) === sel ? ' selected' : ''}>${label}</option>`;
        return opt('', 'Choose…')
          + item.categories.map((title, i) =>
              opt(i, `${i + 1}. ${esc(shorten(title, OPTION_MAX))}`)).join('')
          + (item.hasNone ? opt('none', 'None of these') : '');
      };

      const rows = item.cells.map((cell, i) => {
        const sel = resp[i] === undefined ? '' : String(resp[i]);
        return `<div class="qz-cat-row">
          <span class="qz-cat-item">${cell.text}</span>
          <select class="sel qz-cat-sel" ${graded ? 'disabled' : ''}
                  onchange="EstelaExamQuiz.onCategorize(${item.num},${i},this.value)">
            ${optionsFor(sel)}
          </select>
        </div>`;
      }).join('');

      inputs = `<div class="qz-cats">
        <div class="qz-cats-lbl">Categories</div>
        <ol class="qz-cat-legend">${legend}</ol>
      </div>
      <div class="qz-cat-rows">${rows}</div>`;
    } else {
      inputs = `<div class="qz-unscored">${esc(item.typeLabel)} questions are not
        interactive yet — this one is shown for reference and left out of the score.</div>`;
    }

    /* A wrong answer gets its on_incorrect hint only. Withholding the worked
       solution keeps "Try again" meaningful, since handing over the answer on a
       first miss turns the retry into copying. The solution is released once the
       student has earned it by answering correctly. A blank counts as not
       correct, so it is treated the same way. */
    let fb = '';
    if (graded && result.state !== 'skipped') {
      const parts = [];
      if (result.state === 'correct') {
        if (item.feedback.onCorrect) {
          parts.push(`<div class="qz-fb qz-fb-ok">${item.feedback.onCorrect}</div>`);
        }
        if (item.feedback.general) {
          parts.push(`<div class="qz-fb"><b>Solution.</b> ${item.feedback.general}</div>`);
        }
      } else if (item.feedback.onIncorrect) {
        parts.push(`<div class="qz-fb qz-fb-no">${item.feedback.onIncorrect}</div>`);
      }
      fb = parts.join('');
    }

    const badge = graded && result.state !== 'skipped'
      ? `<span class="qz-badge qz-badge-${result.state}">${
          result.state === 'correct' ? '✓ Correct'
          : result.state === 'blank' ? '— Blank' : '✕ Incorrect'}</span>`
      : '';

    const help = TUTOR_URL
      ? `<button class="btn btn-xs qz-help" onclick="EstelaExamQuiz.getHelp(${item.num})">Get help</button>`
      : '';

    return `<div class="qz-item ${stateCls}">
      <div class="qz-head">
        <span class="qz-num">Question ${item.num}</span>
        <span class="qz-type">${esc(item.typeLabel)}</span>
        ${help}
        ${badge}
      </div>
      <div class="qz-body">${item.body}</div>
      ${item.figUrl ? `<div class="qz-fig"><img src="${item.figUrl}" alt="" decoding="async" loading="lazy"></div>` : ''}
      <div class="qz-inputs">${inputs}</div>
      ${fb}
    </div>`;
  }

  function render() {
    const body = document.getElementById('qz-body');
    const foot = document.getElementById('qz-foot');
    if (!body || !Q) return;

    const results = Q.graded ? Q.items.map(gradeItem) : Q.items.map(() => null);
    body.innerHTML = Q.items.map((it, i) => itemHTML(it, results[i])).join('');

    const scorable = Q.items.filter(i => i.scored).length;
    if (Q.graded) {
      const right = results.filter(r => r && r.state === 'correct').length;
      const pct = scorable ? Math.round((right / scorable) * 100) : 0;
      const skipped = Q.items.length - scorable;
      document.getElementById('qz-score').innerHTML =
        `<b>${right} / ${scorable}</b> &nbsp;(${pct}%)` +
        (skipped ? ` <span class="qz-note">· ${skipped} not scored</span>` : '');
      foot.innerHTML =
        `<button class="btn btn-p" onclick="EstelaExamQuiz.retry()">↻ Try again</button>
         <button class="btn" onclick="EstelaExamQuiz.close()">Close</button>`;
    } else {
      document.getElementById('qz-score').innerHTML =
        `${scorable} scored question${scorable === 1 ? '' : 's'}`;
      foot.innerHTML =
        `<button class="btn btn-p" onclick="EstelaExamQuiz.submit()">Submit answers</button>
         <button class="btn" onclick="EstelaExamQuiz.close()">Cancel</button>`;
    }

    renderMathChunked(body);
  }

  /* KaTeX one question at a time, yielding between frames. A typical quiz holds
     about 24 math spans, but a heavy one reaches ~180, and a single synchronous
     pass over all of them blocks the main thread — which on a phone means the
     modal is visible but will not scroll until it finishes. */
  function renderMathChunked(root) {
    if (!opts.renderMath || !root) return;
    const items = [...root.querySelectorAll('.qz-item')];
    if (!items.length) { opts.renderMath(root); return; }
    let i = 0;
    const step = () => {
      const deadline = (performance.now ? performance.now() : Date.now()) + 12;
      while (i < items.length
             && (performance.now ? performance.now() : Date.now()) < deadline) {
        opts.renderMath(items[i++]);
      }
      if (i < items.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── input handlers (called from inline onchange/oninput) ───────────────── */

  function onPick(num, idx, kind) {
    const item = Q && Q.items.find(i => i.num === num);
    if (!item) return;
    if (!(item.response instanceof Set)) item.response = new Set();
    if (kind === 'radio') { item.response.clear(); item.response.add(idx); }
    else if (item.response.has(idx)) item.response.delete(idx);
    else item.response.add(idx);
  }

  function onType(num, value) {
    const item = Q && Q.items.find(i => i.num === num);
    if (item) item.response = value;
  }

  /* ── Get help ──────────────────────────────────────────────────────────── */

  function getHelp(num) {
    const item = Q && Q.items.find(i => i.num === num);
    if (!item) return;
    const text = helpPrompt(item);
    const copied = copyText(text);

    const msg = document.getElementById('qz-help-msg');
    const fb = document.getElementById('qz-help-fallback');
    if (copied) {
      msg.textContent = 'Question copied to clipboard. Paste it on the next page.';
      fb.style.display = 'none';
      fb.value = '';
    } else {
      // Clipboard refused. Show the text so it can still be copied by hand.
      msg.textContent = 'Copy the text below, then open the tutor.';
      fb.style.display = 'block';
      fb.value = text;
      fb.select();
    }
    document.getElementById('qz-help-modal').classList.add('open');
  }

  function openTutor() {
    window.open(TUTOR_URL, '_blank', 'noopener');
    closeHelp();
  }

  function closeHelp() {
    const m = document.getElementById('qz-help-modal');
    if (m) m.classList.remove('open');
  }

  function onCategorize(num, cellIdx, value) {
    const item = Q && Q.items.find(i => i.num === num);
    if (!item) return;
    if (!item.response || typeof item.response !== 'object') item.response = {};
    item.response[cellIdx] = value;
  }

  /* ── lifecycle ─────────────────────────────────────────────────────────── */

  function submit() {
    if (!Q) return;
    Q.graded = true;
    render();
    document.getElementById('qz-scroll').scrollTop = 0;
  }

  /* "Try again" asks first, because the useful answer depends on how many fresh
     isomorphs the selected banks can still supply. Advancing the version shifts
     every bank's window by its own qn, which walks each bank through its
     questions in order and wraps at the end. Banks run out at different points,
     so the count is computed from what the student has actually seen this
     session rather than assumed. */
  function retry() {
    if (!Q) return;
    const keys = selectionKeys(Q.cart, Q.version + 1);
    const total = keys.length;
    const fresh = keys.filter(k => !Q.seen.has(k)).length;

    /* Only block "New set" when it would hand back exactly what is on screen,
       which happens when every bank is taking its whole supply (qn === n).
       Once the banks have merely been exhausted, cycling back to the start is
       still worth offering, as long as the message says so. */
    const current = Q.items.map(i => i.key).join('|');
    const identical = keys.join('|') === current;

    let msg;
    if (fresh === total) {
      msg = `All ${total} question${total === 1 ? '' : 's'} have a different version available.`;
    } else if (fresh > 0) {
      msg = `${fresh} of ${total} questions have a different version available. `
          + `The other ${total - fresh} would repeat.`;
    } else if (identical) {
      msg = `These banks have no other versions to draw from, so a new set would be `
          + `identical to this one.`;
    } else {
      msg = `Every version in these banks has been used. A new set would cycle back to `
          + `questions you have already seen.`;
    }
    document.getElementById('qz-retry-msg').innerHTML =
      `${msg}<div class="qz-retry-q">Try again with a new set, or the same questions?</div>`;

    const btn = document.getElementById('qz-retry-new');
    btn.disabled = identical;
    btn.style.opacity = identical ? '.45' : '';
    btn.style.cursor = identical ? 'not-allowed' : '';

    document.getElementById('qz-retry-modal').classList.add('open');
  }

  function closeRetry() {
    const m = document.getElementById('qz-retry-modal');
    if (m) m.classList.remove('open');
  }

  function retrySame() {
    closeRetry();
    if (!Q) return;
    Q.graded = false;
    for (const it of Q.items) it.response = null;
    render();
    document.getElementById('qz-scroll').scrollTop = 0;
  }

  async function retryNew() {
    closeRetry();
    if (!Q) return;
    const next = Q.version + 1;
    let items;
    try {
      items = await collectQuestions(Q.cart, next, Q.bankSource);
    } catch (e) {
      if (opts.toast) opts.toast('Could not load a new set: ' + e);
      return;
    }
    if (!items.length) {
      if (opts.toast) opts.toast('No questions available for a new set');
      return;
    }
    Q.items = items;
    Q.version = next;
    Q.graded = false;
    items.forEach(i => Q.seen.add(i.key));
    setTitle();
    render();
    document.getElementById('qz-scroll').scrollTop = 0;
  }

  function setTitle() {
    document.getElementById('qz-title').textContent =
      `${Q.title} — Quiz ${global.EstelaExamExport.versionLabel(Q.version)}`;
  }

  function close() {
    const m = document.getElementById('quiz-modal');
    if (m) m.classList.remove('open');
    Q = null;
  }

  async function open(config) {
    const { cart, version, title, bankSource } = config;
    opts = { renderMath: config.renderMath, toast: config.toast };
    if (!cart || !cart.length) {
      if (opts.toast) opts.toast('Add banks to the cart first');
      return;
    }
    ensureModal();
    const items = await collectQuestions(cart, version, bankSource);
    if (!items.length) {
      if (opts.toast) opts.toast('No questions in the selected banks');
      return;
    }
    // cart and bankSource are kept so "New set" can re-collect at a later
    // version; seen accumulates across rounds so the count stays honest.
    Q = {
      items, version, title, graded: false,
      cart, bankSource,
      seen: new Set(items.map(i => i.key)),
    };
    setTitle();
    document.getElementById('quiz-modal').classList.add('open');
    document.getElementById('qz-scroll').scrollTop = 0;
    render();
  }

  /* ── DOM + styles (self-contained so enhanced.html stays a thin diff) ───── */

  function ensureModal() {
    if (document.getElementById('quiz-modal')) return;

    const style = document.createElement('style');
    style.textContent = `
/* Above the mobile sidebar (z-index 1200) and its overlay (1100). The Take Quiz
   buttons sit inside the sidebar, so on a phone the drawer is necessarily open
   when the quiz launches; at a lower z-index the drawer covers the whole quiz. */
#quiz-modal{position:fixed;inset:0;background:rgba(26,25,22,.45);display:none;align-items:center;justify-content:center;z-index:1300;padding:1.5rem;}
#quiz-modal.open{display:flex;}
.qz-panel{background:var(--bg);border:1px solid var(--border);border-radius:var(--r2);box-shadow:var(--sh2);width:min(880px,100%);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;}
.qz-top{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;padding:.85rem 1.1rem .6rem;border-bottom:1px solid var(--border);}
#qz-title{font-family:var(--font-d);font-size:1.1rem;color:var(--ink);margin-right:auto;}
#qz-score{font-family:var(--font-m);font-size:.92rem;color:var(--ink3);}
.qz-note{color:var(--ink4);}
/* min-height:0 is load-bearing. A flex item defaults to min-height:auto in a
   column container, which floors this at its content height, so flex:1 cannot
   shrink it and it never develops the overflow it needs to scroll. The panel
   overflows instead and .qz-panel's overflow:hidden clips it. Safari showed this
   as "no scrolling for a few seconds, then fine", because a later relayout
   (images decoding, KaTeX substituting spans) happened to resize it correctly.
   Same trap as .tr-t needing min-width:0 in the topic rule.
   overscroll-behavior stops a scroll at the end of the quiz from chaining into
   #content behind the modal. */
#qz-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:.9rem 1.1rem;}
#qz-foot{display:flex;gap:.4rem;justify-content:flex-end;padding:.7rem 1.1rem;border-top:1px solid var(--border);background:var(--surface);}
.qz-item{border:1px solid var(--border);border-radius:var(--r);padding:.8rem .9rem;margin-bottom:.8rem;background:var(--surface);}
.qz-item.qz-correct{border-color:rgba(46,140,90,.5);}
.qz-item.qz-incorrect{border-color:rgba(200,64,48,.5);}
.qz-head{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.45rem;}
.qz-num{font-family:var(--font-m);font-size:.86rem;font-weight:600;color:var(--ink);}
.qz-type{font-family:var(--font-m);font-size:.76rem;color:var(--ink4);text-transform:uppercase;letter-spacing:.06em;}
.qz-badge{margin-left:auto;font-family:var(--font-m);font-size:.8rem;padding:.1rem .45rem;border-radius:var(--r);white-space:nowrap;}
.qz-badge-correct{color:#2e8c5a;background:rgba(46,140,90,.12);}
.qz-badge-incorrect{color:#c84030;background:rgba(200,64,48,.12);}
.qz-badge-blank{color:var(--ink4);background:var(--bg3);}
.qz-help{flex-shrink:0;}
/* sits above the quiz modal (1300), which is itself above the mobile sidebar */
#qz-help-modal,#qz-retry-modal{position:fixed;inset:0;background:rgba(26,25,22,.5);display:none;align-items:center;justify-content:center;z-index:1400;padding:1.5rem;}
#qz-help-modal.open,#qz-retry-modal.open{display:flex;}
#qz-retry-msg{color:var(--ink2);line-height:1.55;}
.qz-retry-q{margin-top:.5rem;margin-bottom:.8rem;color:var(--ink);}
.qz-help-panel{background:var(--bg);border:1px solid var(--border);border-radius:var(--r2);box-shadow:var(--sh2);width:min(420px,100%);padding:1.1rem 1.2rem;}
#qz-help-msg{color:var(--ink2);line-height:1.55;margin-bottom:.8rem;}
#qz-help-fallback{width:100%;font-family:var(--font-m);font-size:.85rem;margin-bottom:.8rem;padding:.4rem .5rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface);color:var(--ink2);resize:vertical;}
.qz-help-note{font-family:var(--font-m);font-size:.78rem;color:var(--ink4);line-height:1.5;margin-bottom:.8rem;}
.qz-help-btns{display:flex;gap:.4rem;justify-content:flex-end;flex-wrap:wrap;}
.qz-body{color:var(--ink2);line-height:1.55;overflow-x:auto;}
.qz-fig img{max-width:100%;margin:.5rem 0;border-radius:var(--r);}
.qz-inputs{margin-top:.55rem;}
.qz-opt{display:flex;align-items:flex-start;gap:.5rem;padding:.32rem .4rem;border-radius:var(--r);cursor:pointer;}
.qz-opt:hover{background:var(--bg3);}
.qz-opt input{margin-top:.28rem;flex-shrink:0;}
.qz-opt-body{flex:1;min-width:0;color:var(--ink2);}
.qz-opt-ok{background:rgba(46,140,90,.09);}
.qz-mark{font-family:var(--font-m);font-size:.74rem;margin-left:.4rem;padding:.02rem .3rem;border-radius:var(--r);vertical-align:middle;}
.qz-mark-ok{color:#2e8c5a;background:rgba(46,140,90,.14);}
.qz-num-inp{max-width:15rem;}
.qz-cats{background:var(--bg3);border-radius:var(--r);padding:.5rem .7rem;margin-bottom:.6rem;}
.qz-cats-lbl{font-family:var(--font-m);font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink4);margin-bottom:.3rem;}
.qz-cat-legend{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.28rem;}
.qz-cat-legend li{display:flex;gap:.5rem;align-items:flex-start;color:var(--ink2);font-size:.92rem;line-height:1.45;}
.qz-cat-key{font-family:var(--font-m);font-size:.78rem;font-weight:600;color:var(--ink);background:var(--surface);border:1px solid var(--border);border-radius:var(--r);min-width:1.35rem;text-align:center;flex-shrink:0;}
.qz-cat-row{display:flex;align-items:center;gap:.6rem;padding:.3rem 0;border-bottom:1px solid var(--border);}
.qz-cat-row:last-child{border-bottom:none;}
.qz-cat-item{flex:1;min-width:0;color:var(--ink2);line-height:1.45;overflow-wrap:anywhere;}
.qz-cat-sel{flex:0 0 auto;max-width:15rem;}
.qz-expected{font-family:var(--font-m);font-size:.82rem;color:var(--ink4);margin-left:.5rem;}
.qz-unscored{font-family:var(--font-m);font-size:.82rem;color:var(--ink4);line-height:1.5;}
.qz-fb{margin-top:.5rem;padding:.5rem .6rem;border-radius:var(--r);background:var(--bg3);color:var(--ink2);font-size:.94rem;line-height:1.55;}
.qz-fb-ok{background:rgba(46,140,90,.1);}
.qz-fb-no{background:rgba(200,64,48,.1);}
@media (max-width:820px){
  #quiz-modal{padding:0;}
  .qz-panel{width:100%;height:100%;max-height:100%;border-radius:0;}
  .qz-num-inp{max-width:100%;}
  /* item above its dropdown, both full width — a side-by-side select would be
     squeezed to a few characters on a phone */
  .qz-cat-row{flex-direction:column;align-items:stretch;gap:.3rem;padding:.45rem 0;}
  .qz-cat-sel{max-width:100%;width:100%;}
}`;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.innerHTML = `
      <div class="qz-panel">
        <div class="qz-top">
          <span id="qz-title"></span>
          <span id="qz-score"></span>
        </div>
        <div id="qz-scroll"><div id="qz-body"></div></div>
        <div id="qz-foot"></div>
      </div>`;
    document.body.appendChild(modal);

    const help = document.createElement('div');
    help.id = 'qz-help-modal';
    help.addEventListener('click', e => { if (e.target === help) closeHelp(); });
    help.innerHTML = `
      <div class="qz-help-panel">
        <div id="qz-help-msg"></div>
        <textarea id="qz-help-fallback" readonly rows="4" style="display:none"></textarea>
        <div class="qz-help-note">(Note: you must be logged in to access the Tutor Gem.)</div>
        <div class="qz-help-btns">
          <button class="btn btn-p" onclick="EstelaExamQuiz.openTutor()">Open Physics Tutor Gem</button>
          <button class="btn" onclick="EstelaExamQuiz.closeHelp()">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(help);

    const again = document.createElement('div');
    again.id = 'qz-retry-modal';
    again.addEventListener('click', e => { if (e.target === again) closeRetry(); });
    again.innerHTML = `
      <div class="qz-help-panel">
        <div id="qz-retry-msg"></div>
        <div class="qz-help-btns">
          <button class="btn btn-p" id="qz-retry-new" onclick="EstelaExamQuiz.retryNew()">New set</button>
          <button class="btn" onclick="EstelaExamQuiz.retrySame()">Same questions</button>
        </div>
      </div>`;
    document.body.appendChild(again);
  }

  global.EstelaExamQuiz = {
    open, close, submit, retry, retrySame, retryNew, closeRetry,
    onPick, onType, onCategorize,
    getHelp, openTutor, closeHelp,
  };
})(typeof window !== 'undefined' ? window : globalThis);
