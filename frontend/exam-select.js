/**
 * exam-select.js — which questions a cart item contributes (fork-local).
 *
 * Two selection modes behind one interface:
 *
 *   count      the historical behaviour. `item.qn` questions, windowed by
 *              version, so versions A..E walk the bank and a teacher gets
 *              genuinely parallel papers from one isomorphic set.
 *   explicit   the student picked questions by hand. `item.sel` holds the
 *              indices, every version draws the same ones, and the version
 *              letter moves only the option order.
 *
 * WHY THIS FILE EXISTS. That resolution had three independent implementations
 * before it — `exam-export.js`, `exam-export-plus.js` and `exam-quiz.js` — two
 * of them in upstream-maintained files, under the must-not-drift invariant
 * CLAUDE.md records: quiz vN has to keep matching exam vN. Adding a second mode
 * to three copies would have been three chances to disagree. Each caller is now
 * one line, and the logic sits in a file upstream does not have, so a merge
 * cannot conflict with it.
 *
 * THE DRAW IS MATERIALISED, NEVER LIVE. `drawSet()` is the only randomness in
 * the selection path, and its caller writes the result into `item.sel` before
 * anything reads it back. `slotsFor()` therefore stays a pure function of
 * (item, version), which is the whole reason the exporters and the quiz can
 * compute selection independently and still agree. A `Math.random()` called
 * from inside the read path would mean a student who pressed "new set" and then
 * exported got a different paper than the one on screen.
 */
(function (global) {
  'use strict';

  const TIER_UNSEEN = 0;   // never attempted
  const TIER_WRONG  = 1;   // attempted, not yet correct
  const TIER_RIGHT  = 2;   // answered correctly
  const TIER_COUNT  = 3;

  function questionsOf(item) {
    return ((item && item.rawData) || {}).questions || [];
  }

  /**
   * `item.sel` cleaned against the bank it belongs to: integers only, in range,
   * de-duplicated, ascending. Null when the item is not in explicit mode.
   *
   * Sorted rather than kept in click order so the printed paper, the quiz and
   * the card rail all read top to bottom in question order. Click order would
   * make q5-then-q2 print as 5, 2, which no one asked for and which the rail
   * cannot represent anyway.
   *
   * Cleaning here rather than at the click site is deliberate: `sel` round-trips
   * through localStorage, so it can come back stale after a bank is re-authored
   * with fewer questions.
   */
  function selOf(item) {
    if (!item || !Array.isArray(item.sel) || !item.sel.length) return null;
    const n = questionsOf(item).length;
    if (!n) return null;
    const seen = new Set();
    const out = [];
    for (const v of item.sel) {
      const i = Number(v);
      if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) continue;
      seen.add(i);
      out.push(i);
    }
    return out.length ? out.sort((a, b) => a - b) : null;
  }

  function isExplicit(item) { return selOf(item) !== null; }

  /** How many questions this item contributes, in either mode. */
  function sizeOf(item) {
    const sel = selOf(item);
    if (sel) return sel.length;
    return Math.max(1, Number(item && item.qn) || 1);
  }

  /**
   * The slots one cart item contributes at `version`, as [{q, idx}].
   *
   * The count branch reproduces the original windowing exactly, including the
   * absence of a clamp on `qn`: a `qn` larger than the bank still wraps and
   * repeats, which is what shipped and what the version-count hint assumes.
   */
  function slotsFor(item, version) {
    const questions = questionsOf(item);
    const n = questions.length;
    if (!n) return [];

    const sel = selOf(item);
    if (sel) return sel.map((idx) => ({ q: questions[idx], idx }));

    const qn = Math.max(1, Number(item.qn) || 1);
    const start = ((((Number(version) - 1) * qn) % n) + n) % n;
    const out = [];
    for (let i = 0; i < qn; i++) {
      const idx = (start + i) % n;
      out.push({ q: questions[idx], idx });
    }
    return out;
  }

  /* ── the draw ──────────────────────────────────────────────────────────── */

  function tierAt(rank, idx) {
    if (typeof rank !== 'function') return TIER_UNSEEN;
    const t = Number(rank(idx));
    return (Number.isInteger(t) && t >= 0 && t < TIER_COUNT) ? t : TIER_UNSEEN;
  }

  /** How the pool divides, for the wording of the "new set" prompt. */
  function tierCounts(item, rank) {
    const n = questionsOf(item).length;
    const c = [0, 0, 0];
    for (let i = 0; i < n; i++) c[tierAt(rank, i)]++;
    return { unseen: c[TIER_UNSEEN], wrong: c[TIER_WRONG], right: c[TIER_RIGHT], total: n };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i >= 1; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  /**
   * A fresh set of `size` question indices, preferring what the student has not
   * met. Returns ascending indices, ready to write straight into `item.sel`.
   *
   * Tier order is unseen, then attempted-and-wrong, then correct. The middle
   * tier is the point of the whole rule: a plain unseen-first sort drops a
   * question the student got WRONG in with one they aced, so on a 7 question
   * bank the one they actually need becomes a 1 in 7 shot once the bank is
   * exhausted. Ordering wrong ahead of right makes those resurface by
   * themselves the moment the unseen run out.
   *
   * `exclude` (normally the current selection) is honoured only while enough
   * candidates remain to fill the draw. Below that the student would get a
   * short set, and a "new set" that visibly returns fewer questions reads as a
   * bug rather than as running out of bank.
   */
  function drawSet(item, size, rank, exclude) {
    const n = questionsOf(item).length;
    if (!n) return [];
    const want = Math.max(1, Math.min(n, Number(size) || 1));

    const skip = new Set((Array.isArray(exclude) ? exclude : []).map(Number));
    const roomy = (n - skip.size) >= want;

    const tiers = [[], [], []];
    for (let i = 0; i < n; i++) {
      if (roomy && skip.has(i)) continue;
      tiers[tierAt(rank, i)].push(i);
    }

    const out = [];
    for (const tier of tiers) {
      if (out.length >= want) break;
      shuffle(tier);
      for (const idx of tier) {
        if (out.length >= want) break;
        out.push(idx);
      }
    }
    return out.sort((a, b) => a - b);
  }

  global.EstelaExamSelect = {
    slotsFor, selOf, isExplicit, sizeOf, drawSet, tierCounts,
    TIER_UNSEEN, TIER_WRONG, TIER_RIGHT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
