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

  async function collectQuestions(cart, version, bankSource) {
    const BS = global.EstelaBankSource;
    const EX = global.EstelaExamExport;
    const items = [];
    let qNum = 0;

    for (const item of cart) {
      const questions = (item.rawData || {}).questions || [];
      if (!questions.length) continue;

      const qn = Math.max(1, Number(item.qn) || 1);
      const n = questions.length;
      const start = (((Number(version) - 1) * qn) % n);
      const bankRef = item.bankRef || { path: item.path, handle: { path: item.path } };

      for (let i = 0; i < qn; i++) {
        const q = questions[(start + i) % n];
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
          type: qtype,
          typeLabel: BS.typeLabel(qtype),
          bankId: (item.meta || {}).bank_id || '',
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

    return `<div class="qz-item ${stateCls}">
      <div class="qz-head">
        <span class="qz-num">Question ${item.num}</span>
        <span class="qz-type">${esc(item.typeLabel)}</span>
        ${badge}
      </div>
      <div class="qz-body">${item.body}</div>
      ${item.figUrl ? `<div class="qz-fig"><img src="${item.figUrl}" alt=""></div>` : ''}
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

    if (opts.renderMath) opts.renderMath(body);
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

  function retry() {
    if (!Q) return;
    Q.graded = false;
    for (const it of Q.items) it.response = null;
    render();
    document.getElementById('qz-scroll').scrollTop = 0;
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
    Q = { items, version, title, graded: false };
    document.getElementById('qz-title').textContent =
      `${title} — Quiz ${global.EstelaExamExport.versionLabel(version)}`;
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
#qz-scroll{flex:1;overflow-y:auto;padding:.9rem 1.1rem;}
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
  }

  global.EstelaExamQuiz = { open, close, submit, retry, onPick, onType, onCategorize };
})(typeof window !== 'undefined' ? window : globalThis);
