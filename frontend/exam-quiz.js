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
 * Phase 1 grades numerical, multiple_choice and multiple_answers (819 of the
 * corpus's 910 questions). Other types still render, marked as not scored, so
 * they are visibly excluded rather than silently dropped.
 *
 * There is no upstream counterpart to this file, so it never conflicts on an
 * upstream merge. Everything it needs is already exported by bank-source.js
 * and exam-export.js.
 */
(function (global) {
  'use strict';

  const GRADABLE = new Set(['multiple_choice', 'multiple_answers', 'numerical']);

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

  function expectedText(spec) {
    const tolTxt = spec.declared
      ? ` ± ${spec.rawTol}${spec.isPercent ? '%' : ''}`
      : ` ± ${(DEFAULT_REL_TOL * 100).toFixed(0)}% (assumed)`;
    return `${spec.value}${tolTxt}`;
  }

  function itemHTML(item, result) {
    const graded = !!result;
    const stateCls = graded ? `qz-${result.state}` : '';

    let inputs = '';
    if (item.options) {
      const kind = item.type === 'multiple_choice' ? 'radio' : 'checkbox';
      inputs = item.options.map((o, i) => {
        const checked = item.response instanceof Set && item.response.has(i);
        let mark = '';
        if (graded) {
          if (o.correct) mark = '<span class="qz-mark qz-mark-ok">correct</span>';
          else if (checked) mark = '<span class="qz-mark qz-mark-no">your answer</span>';
        }
        return `<label class="qz-opt${graded && o.correct ? ' qz-opt-ok' : ''}">
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
        ${graded ? `<span class="qz-expected">Expected ${esc(expectedText(item.numeric))}</span>` : ''}
      </div>`;
    } else {
      inputs = `<div class="qz-unscored">${esc(item.typeLabel)} questions are not
        interactive yet — this one is shown for reference and left out of the score.</div>`;
    }

    let fb = '';
    if (graded && result.state !== 'skipped') {
      const parts = [];
      if (result.state === 'correct' && item.feedback.onCorrect) {
        parts.push(`<div class="qz-fb qz-fb-ok">${item.feedback.onCorrect}</div>`);
      }
      if (result.state !== 'correct' && item.feedback.onIncorrect) {
        parts.push(`<div class="qz-fb qz-fb-no">${item.feedback.onIncorrect}</div>`);
      }
      if (item.feedback.general) {
        parts.push(`<div class="qz-fb"><b>Solution.</b> ${item.feedback.general}</div>`);
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
#quiz-modal{position:fixed;inset:0;background:rgba(26,25,22,.45);display:none;align-items:center;justify-content:center;z-index:1100;padding:1.5rem;}
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
.qz-mark-no{color:#c84030;background:rgba(200,64,48,.14);}
.qz-num-inp{max-width:15rem;}
.qz-expected{font-family:var(--font-m);font-size:.82rem;color:var(--ink4);margin-left:.5rem;}
.qz-unscored{font-family:var(--font-m);font-size:.82rem;color:var(--ink4);line-height:1.5;}
.qz-fb{margin-top:.5rem;padding:.5rem .6rem;border-radius:var(--r);background:var(--bg3);color:var(--ink2);font-size:.94rem;line-height:1.55;}
.qz-fb-ok{background:rgba(46,140,90,.1);}
.qz-fb-no{background:rgba(200,64,48,.1);}
@media (max-width:820px){
  #quiz-modal{padding:0;}
  .qz-panel{width:100%;height:100%;max-height:100%;border-radius:0;}
  .qz-num-inp{max-width:100%;}
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

  global.EstelaExamQuiz = { open, close, submit, retry, onPick, onType };
})(typeof window !== 'undefined' ? window : globalThis);
