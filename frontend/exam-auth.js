/**
 * exam-auth.js — student accounts (fork-local, enhanced build only).
 *
 * Owns its own CSS and DOM, injected on first boot, so enhanced.html needs only
 * a <script src> — the same rule exam-quiz.js follows, and what keeps the
 * upstream diff small. There is no upstream counterpart, so it never conflicts
 * on a merge.
 *
 * Everything here is additive. Logged out, the page behaves exactly as it did
 * before this file existed, plus one button in the topbar. The exam builder is
 * the teacher-facing product and must never require a login.
 *
 * See userplan.md sections 4-6.
 */
(function (global) {
  'use strict';

  const A = {
    user: null, mustChange: false, locked: false, booted: false,
    attempts: null,     // Map(question_id -> 0|1), or null when logged out
  };

  const BATCH_MAX = 100;      // must not exceed BATCH_MAX in the router

  const $ = (id) => document.getElementById(id);

  /* The page declares its state as `const S = {...}` in a classic script, which
     creates a binding in the global LEXICAL environment - not a property on
     window. So global.S is undefined and must never be tested. An unqualified
     reference resolves across scripts; typeof throws while the binding is still
     in its temporal dead zone, which is why this is wrapped. */
  function pageState() {
    try { return typeof S !== 'undefined' ? S : null; } catch { return null; }
  }

  // The DOM is the authoritative current theme: applyTheme() writes it there.
  const currentTheme = () =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  /* ── api ──────────────────────────────────────────────────────────────── */

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { ok: false, status: 0, data: null };   // offline or blocked
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }

    // Any route can report that the temporary password is still in place. Catch
    // it centrally so no caller has to remember to.
    if (res.status === 403 && data && data.error === 'must_change') forceChange();
    return { ok: res.ok, status: res.status, data };
  }

  /* ── progress keys ─────────────────────────────────────────────────────────
     "<bank folder>_<question id>". The single definition of the persistent
     progress key; the quiz and the progress readout both call this.

     BundleSource - what the published page uses - sets a bank's `path` to the
     YAML file, not its directory (bank-source.js:856 recovers bankDir by
     trimming the filename). So the filename has to come off before the last
     segment is the folder, and the two genuinely differ: vector_problem_bank.yml
     lives in folder PHY1-LEO-08122026. FileSystemSource already reports the
     directory, hence the conditional trim.

     Chapter and topic subfolders are irrelevant: only the final segment is used,
     and bank folder names are unique across all four courses (audited
     2026-08-31 - 50 distinct, 0 collisions). Deriving from the folder rather
     than the YAML bank_id field is deliberate; 6 upstream banks disagree. */
  function questionId(bankPath, qid) {
    const parts = String(bankPath || '').split('/').filter(Boolean);
    if (parts.length && /\.ya?ml$/i.test(parts[parts.length - 1])) parts.pop();
    const folder = parts.length ? parts[parts.length - 1] : '';
    return folder && qid ? folder + '_' + qid : '';
  }

  /* ── attempts ─────────────────────────────────────────────────────────────
     Logged out these are no-ops, so nothing in the quiz has to know whether a
     student is signed in. */

  async function loadAttempts() {
    if (!A.user) { A.attempts = null; return null; }
    const r = await api('GET', '/api/attempts');
    if (!r.ok || !r.data || !Array.isArray(r.data.attempts)) return A.attempts;
    A.attempts = new Map(r.data.attempts);
    return A.attempts;
  }

  /**
   * records: [{question_id, correct}]. Applied to the local map immediately so
   * a progress readout updates without waiting on the round trip, then sent in
   * chunks the router will accept.
   */
  async function recordAttempts(records) {
    if (!A.user || !Array.isArray(records) || !records.length) return;
    const clean = records.filter((r) => r && r.question_id);
    if (!clean.length) return;

    if (A.attempts) {
      for (const r of clean) {
        const prev = A.attempts.get(r.question_id) || 0;
        A.attempts.set(r.question_id, Math.max(prev, r.correct ? 1 : 0));
      }
    }
    for (let i = 0; i < clean.length; i += BATCH_MAX) {
      await api('POST', '/api/attempts', { records: clean.slice(i, i + BATCH_MAX) });
    }
  }

  /* ── escaping ─────────────────────────────────────────────────────────────
     Names are user-supplied and reach the topbar and the profile panel. The
     page has its own esc(); this module carries one so it does not depend on
     load order. Covers ' as well as ", for handler-argument contexts. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const initials = (u) =>
    ((u.first_name || '').trim().charAt(0) + (u.last_name || '').trim().charAt(0))
      .toUpperCase() || '?';

  const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Account';

  /* ── local state that must not follow one student to the next ─────────────
     estela_cart and estela_path are global localStorage keys, so on a shared
     Chromebook the next student would inherit the previous one's cart. Clearing
     only when the pin actually changes means logging back in on your own machine
     keeps your work, which clearing on every login would throw away. */
  function resetLocalIfNewUser(pin) {
    try {
      const last = localStorage.getItem('estela_last_pin');
      if (last && last !== pin) {
        localStorage.removeItem('estela_cart');
        localStorage.removeItem('estela_path');
      }
      localStorage.setItem('estela_last_pin', pin);
    } catch { /* private mode, or storage disabled */ }
  }

  /* ── theme ────────────────────────────────────────────────────────────────
     localStorage paints the page before any API call returns; the database is
     the source of truth across devices. So: paint local, then reconcile. */
  function applyServerTheme(dark) {
    const want = dark ? 'dark' : 'light';
    if (currentTheme() === want) return;
    const st = pageState();
    if (st) st.theme = want;
    try { localStorage.setItem('theme', want); } catch {}
    if (typeof global.applyTheme === 'function') global.applyTheme(want);
  }

  // Wrap the page's toggleTheme so a click also persists. Wrapped at boot, not
  // at load: the inline script that defines it runs after this file.
  function hookThemeToggle() {
    const pageToggle = global.toggleTheme;
    if (typeof pageToggle !== 'function') return;
    global.toggleTheme = function () {
      pageToggle.apply(this, arguments);
      if (A.user) {
        // Fire and forget. A failed write costs the stored preference, not the
        // click the student just made.
        api('PATCH', '/api/me', { site_mode_dark: currentTheme() === 'dark' });
      }
    };
  }

  /* ── modal ────────────────────────────────────────────────────────────── */

  function close() {
    if (A.locked) return;              // forced password change has no exit
    $('auth-modal').classList.remove('open');
  }

  function openModal(view) {
    ensureDom();
    render(view);
    $('auth-modal').classList.add('open');
    const first = document.querySelector('#auth-modal input:not([type=hidden])');
    if (first) first.focus();
  }

  function forceChange() {
    A.mustChange = true;
    A.locked = true;
    openModal('change');
  }

  function say(msg, kind) {
    const el = $('au-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'au-msg' + (msg ? ' au-msg-' + (kind || 'err') : '');
  }

  function busy(on) {
    const b = $('au-submit');
    if (b) { b.disabled = on; b.textContent = on ? 'Working…' : b.dataset.label; }
  }

  /* ── views ────────────────────────────────────────────────────────────── */

  function render(view) {
    const body = $('au-body');
    if (view === 'change') {
      body.innerHTML = `
        <h2 class="au-h">${A.mustChange ? 'Choose your password' : 'Change password'}</h2>
        <p class="au-p">${A.mustChange
          ? 'This account is still using the temporary password you were given. Set your own before you carry on.'
          : 'You will be signed out on every other device.'}</p>
        <label class="au-lbl" for="au-cur">Current password</label>
        <input class="au-inp" id="au-cur" type="password" autocomplete="current-password">
        <label class="au-lbl" for="au-new">New password</label>
        <input class="au-inp" id="au-new" type="password" autocomplete="new-password">
        <label class="au-lbl" for="au-new2">New password again</label>
        <input class="au-inp" id="au-new2" type="password" autocomplete="new-password">
        <div class="au-msg" id="au-msg"></div>
        <button class="btn btn-p au-btn" id="au-submit" data-label="Save password"
                onclick="EstelaAuth.submitChange()">Save password</button>
        ${A.locked
          ? `<button class="btn au-btn au-quiet" onclick="EstelaAuth.logout()">Log out instead</button>`
          : `<button class="btn au-btn au-quiet" onclick="EstelaAuth.close()">Cancel</button>`}`;
    } else {
      body.innerHTML = `
        <h2 class="au-h">Log in</h2>
        <p class="au-p">Use the PIN and password from your teacher.</p>
        <label class="au-lbl" for="au-pin">PIN</label>
        <input class="au-inp" id="au-pin" type="text" autocomplete="username"
               autocapitalize="characters" spellcheck="false">
        <label class="au-lbl" for="au-pw">Password</label>
        <input class="au-inp" id="au-pw" type="password" autocomplete="current-password">
        <div class="au-msg" id="au-msg"></div>
        <button class="btn btn-p au-btn" id="au-submit" data-label="Log in"
                onclick="EstelaAuth.submitLogin()">Log in</button>`;
    }
    // Enter submits, from any field in the form.
    body.querySelectorAll('input').forEach((i) => {
      i.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $('au-submit').click(); }
      });
    });
  }

  /* ── actions ──────────────────────────────────────────────────────────── */

  async function submitLogin() {
    const pin = $('au-pin').value.trim();
    const password = $('au-pw').value;
    if (!pin || !password) { say('Enter your PIN and password.'); return; }

    busy(true);
    const r = await api('POST', '/api/auth/login', { pin, password });
    busy(false);

    if (!r.ok) {
      // The server returns one error for wrong password, unknown PIN and lockout
      // on purpose. Saying more here would undo that.
      say(r.status === 0
        ? 'Could not reach the server. Check your connection.'
        : 'That PIN and password did not match.');
      return;
    }

    resetLocalIfNewUser(r.data.user.pin);
    setUser(r.data.user);
    if (r.data.must_change) { forceChange(); say(''); return; }
    A.locked = false;
    close();
  }

  async function submitChange() {
    const current = $('au-cur').value;
    const next = $('au-new').value;
    const again = $('au-new2').value;

    if (next.length < 8) { say('Use at least 8 characters.'); return; }
    if (next !== again)  { say('The two new passwords do not match.'); return; }
    if (next === current) { say('Choose a password different from the current one.'); return; }

    busy(true);
    const r = await api('POST', '/api/auth/password', { current, next });
    busy(false);

    if (!r.ok) {
      say(r.status === 401
        ? 'That current password is not right.'
        : 'Could not save the password. Try again.');
      return;
    }

    A.mustChange = false;
    A.locked = false;
    close();
    await refresh();
    toast('Password changed');
  }

  async function logout() {
    await api('POST', '/api/auth/logout');
    try {
      localStorage.removeItem('estela_cart');
      localStorage.removeItem('estela_path');
      localStorage.removeItem('estela_last_pin');
    } catch {}
    A.locked = false;
    setUser(null);
    close();
    location.reload();     // drops any in-memory state belonging to that student
  }

  function toast(msg) {
    if (typeof global.toast === 'function') global.toast(msg);
  }

  /* ── profile button ───────────────────────────────────────────────────── */

  function setUser(user) {
    A.user = user;
    if (!user) A.attempts = null;
    const st = pageState();
    if (st) st.user = user;               // gate for page code
    const btn = $('auth-btn');
    if (!btn) return;
    if (user) {
      btn.innerHTML = `<span class="au-ini">${esc(initials(user))}</span>`;
      btn.title = fullName(user);
      btn.setAttribute('aria-label', 'Account: ' + fullName(user));
      if (user.site_mode_dark != null) applyServerTheme(user.site_mode_dark);
    } else {
      btn.innerHTML = PERSON_SVG;
      btn.title = 'Log in';
      btn.setAttribute('aria-label', 'Log in');
    }
    const panel = $('au-panel');
    if (panel) panel.classList.remove('open');
  }

  function onAuthBtn() {
    if (!A.user) { A.locked = false; openModal('login'); return; }
    const panel = $('au-panel');
    panel.innerHTML = `
      <div class="au-who">
        <div class="au-who-n">${esc(fullName(A.user))}</div>
      </div>
      <button class="au-item" onclick="EstelaAuth.openChange()">Change password</button>
      <button class="au-item" onclick="EstelaAuth.logout()">Log out</button>`;
    panel.classList.toggle('open');
  }

  function openChange() {
    $('au-panel').classList.remove('open');
    A.locked = false;
    openModal('change');
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */

  async function refresh() {
    const r = await api('GET', '/api/me');
    if (r.ok && r.data && r.data.user) {
      setUser(r.data.user);
      // Nothing is reachable but /api/me and the password change while the
      // temporary password stands, so there is no point asking for attempts.
      if (r.data.must_change) forceChange();
      else loadAttempts();
    } else {
      setUser(null);
    }
  }

  const PERSON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/></svg>';

  function ensureDom() {
    if (A.booted) return;
    A.booted = true;

    const style = document.createElement('style');
    style.textContent = `
#auth-modal{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:1rem;}
#auth-modal.open{display:flex;}
.au-panel-w{background:var(--bg);border:1px solid var(--border);border-radius:var(--r);width:min(94vw,26rem);padding:1.15rem 1.25rem 1.25rem;box-shadow:0 10px 40px rgba(0,0,0,.28);}
.au-h{margin:0 0 .3rem;font-size:1.15rem;color:var(--ink);}
.au-p{margin:0 0 .9rem;font-size:.92rem;line-height:1.5;color:var(--ink2);}
.au-lbl{display:block;font-size:.8rem;color:var(--ink4);margin:.55rem 0 .2rem;font-family:var(--font-m);}
.au-inp{width:100%;box-sizing:border-box;padding:.5rem .6rem;border:1px solid var(--border);border-radius:var(--r);background:var(--bg2);color:var(--ink);font-size:.95rem;}
.au-inp:focus{outline:2px solid var(--accent);outline-offset:1px;}
.au-btn{width:100%;margin-top:.85rem;}
.au-quiet{margin-top:.4rem;background:transparent;}
.au-msg{min-height:1.1rem;margin-top:.6rem;font-size:.86rem;line-height:1.4;}
.au-msg-err{color:var(--accent);}
.au-ini{font-family:var(--font-m);font-size:.78rem;font-weight:600;letter-spacing:.02em;}
#auth-wrap{position:relative;display:inline-flex;}
#auth-btn{flex-shrink:0;width:32px;height:32px;padding:0;border-radius:50%;color:var(--ink4);display:inline-flex;align-items:center;justify-content:center;}
#auth-btn:hover{color:var(--accent);}
#auth-btn svg{width:17px;height:17px;display:block;}
#au-panel{position:absolute;top:calc(100% + .4rem);right:0;z-index:110;display:none;min-width:12rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 8px 26px rgba(0,0,0,.22);padding:.35rem;}
#au-panel.open{display:block;}
.au-who{padding:.45rem .55rem .5rem;border-bottom:1px solid var(--border);margin-bottom:.3rem;}
.au-who-n{font-size:.92rem;color:var(--ink);}
.au-item{display:block;width:100%;text-align:left;padding:.45rem .55rem;border:0;border-radius:calc(var(--r) - 2px);background:transparent;color:var(--ink2);font:inherit;font-size:.9rem;cursor:pointer;}
.au-item:hover{background:var(--bg3);color:var(--ink);}`;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    // Clicking the backdrop closes, except while a password change is forced.
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.innerHTML = '<div class="au-panel-w"><div id="au-body"></div></div>';
    document.body.appendChild(modal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => {
      const wrap = $('auth-wrap');
      if (wrap && !wrap.contains(e.target)) {
        const p = $('au-panel');
        if (p) p.classList.remove('open');
      }
    });
  }

  function mountButton() {
    const right = document.querySelector('.tb-right');
    if (!right || $('auth-btn')) return;
    const wrap = document.createElement('div');
    wrap.id = 'auth-wrap';
    wrap.innerHTML =
      `<button id="auth-btn" class="btn btn-icon" title="Log in" aria-label="Log in"
               onclick="EstelaAuth.onAuthBtn()">${PERSON_SVG}</button>` +
      `<div id="au-panel"></div>`;
    right.appendChild(wrap);
  }

  function boot() {
    ensureDom();
    mountButton();
    hookThemeToggle();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.EstelaAuth = {
    onAuthBtn, openChange, submitLogin, submitChange, logout, close, refresh,
    questionId, recordAttempts, loadAttempts,
    get user() { return A.user; },
    get attempts() { return A.attempts; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
