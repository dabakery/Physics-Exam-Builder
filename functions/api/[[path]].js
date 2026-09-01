/**
 * Physics Exam Builder - student accounts and progress API.
 *
 * One catch-all router rather than nine files: session validation and error
 * shaping are shared by every route, and splitting them costs more than it buys
 * at this size. See userplan.md sections 4 and 5.
 *
 * Bindings required on the Pages project:
 *   DB           D1 database  (physicsexambuilder)
 *   AUTH_PEPPER  secret       a long random string, NOT stored in the database
 *
 * The pepper is what makes a stolen D1 dump uncrackable. The work factor is low
 * by OWASP standards because Workers Free caps CPU at 10 ms per invocation; the
 * pepper is the primary defence and the iteration count is the second line.
 *
 * Never console.log a request body on any route in this file. Bodies here carry
 * plaintext passwords.
 */

const SESSION_TTL = 60 * 60 * 24 * 30;  // 30 days, seconds
const COOKIE      = 'sid';
const PBKDF2_ITER = 20000;              // ~6-7 ms CPU, measured on Workers Free
const LOCK_AFTER  = 3;                  // failures tolerated before locking
const NAME_MAX    = 60;
const BATCH_MAX   = 100;      // records accepted in one POST /api/attempts
const QID_MAX     = 200;      // characters in one question_id
const ROWS_MAX    = 10000;    // attempt rows one account may hold

// "<bank folder>_<question id>". Both halves are author-controlled strings from
// folder names and YAML ids, so this is a shape check, not a grammar: printable,
// bounded, no control characters, no path separators.
const QID_RE = /^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,198}$/;

// The only routes reachable while credentials.must_change is set.
const MUST_CHANGE_OK = new Set(['GET /api/me', 'POST /api/auth/password']);

// Fixed salt used only to burn the same CPU on an unknown PIN as on a real one.
// Its value is irrelevant; that it is constant and never stored is the point.
const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';

const enc = new TextEncoder();
const nowSec = () => Math.floor(Date.now() / 1000);

/* ── encoding ─────────────────────────────────────────────────────────────── */

function b64e(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64d(str) {
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

function b64url(bytes) {
  return b64e(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ── crypto ───────────────────────────────────────────────────────────────── */

/**
 * HMAC-SHA-256 with the pepper, then PBKDF2-SHA-256. Two steps, because they
 * defend against different things: the pepper defeats an offline attack on a
 * leaked database, the KDF makes each individual guess expensive.
 */
async function derive(password, saltB64, iterations, pepper) {
  const hk = await crypto.subtle.importKey(
    'raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const peppered = new Uint8Array(
    await crypto.subtle.sign('HMAC', hk, enc.encode(password)));

  const kk = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64d(saltB64), iterations }, kk, 256);
  return b64e(new Uint8Array(bits));
}

// Compares in time independent of where the first difference falls. A === on
// hashes leaks their prefix through timing.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function newSalt() {
  return b64e(crypto.getRandomValues(new Uint8Array(16)));
}

/* ── responses ────────────────────────────────────────────────────────────── */

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

const fail = (status, error) => json({ error }, { status });

async function readJson(request) {
  try {
    const v = await request.json();
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

/**
 * The only place a user row becomes JSON. D1 returns 0 and 1 for BOOLEAN
 * columns, not false and true, so frontend code testing === true fails silently
 * without this coercion. Credentials rows are never passed through here, or
 * anywhere else that reaches a response.
 */
function publicUser(row) {
  return {
    pin: row.pin,
    first_name: row.first_name,
    last_name: row.last_name,
    site_mode_dark: !!row.site_mode_dark,
    is_admin: !!row.is_admin,
  };
}

/* ── sessions ─────────────────────────────────────────────────────────────── */

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// HttpOnly keeps the id out of reach of any script on the page, so an XSS bug
// cannot become account theft. SameSite=Lax is the CSRF defence for the
// state-changing routes below.
const setCookie = (sid) =>
  `${COOKIE}=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;
const clearCookie = () =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

async function mintSession(env, pin) {
  const sid = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (id, pin, expires_at) VALUES (?, ?, ?)')
    .bind(sid, pin, nowSec() + SESSION_TTL).run();
  return sid;
}

// One indexed read per authenticated request. This is what buys a real logout:
// a session can be revoked server-side and it stops working on the next request.
async function currentUser(env, request) {
  const sid = readCookie(request, COOKIE);
  if (!sid) return null;
  const row = await env.DB.prepare(
    `SELECT u.pin, u.first_name, u.last_name, u.site_mode_dark, u.is_admin,
            c.must_change, s.expires_at
       FROM sessions s
       JOIN users u       ON u.pin = s.pin
       JOIN credentials c ON c.pin = s.pin
      WHERE s.id = ?`).bind(sid).first();
  if (!row) return null;
  if (row.expires_at <= nowSec()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
    return null;
  }
  row.sid = sid;
  return row;
}

/* ── routes ───────────────────────────────────────────────────────────────── */

/**
 * Every failure here returns the same 401 and burns the same CPU. Distinguishing
 * "no such PIN" from "wrong password" from "locked" hands an attacker the class
 * roster; distinguishing them by response time does the same thing more quietly.
 */
async function login(env, request) {
  const body = await readJson(request);
  const pin = body?.pin, password = body?.password;
  if (typeof pin !== 'string' || typeof password !== 'string' || !pin || !password) {
    return fail(400, 'invalid');
  }

  const cred = await env.DB.prepare('SELECT * FROM credentials WHERE pin = ?')
    .bind(pin).first();
  const now = nowSec();

  // Unknown PIN: hash against the dummy salt and throw the result away, so an
  // unknown PIN costs the same ~7 ms as a real one.
  if (!cred) {
    await derive(password, DUMMY_SALT, PBKDF2_ITER, env.AUTH_PEPPER);
    return fail(401, 'invalid');
  }

  const locked = cred.lock_until > now;
  const candidate = await derive(password, cred.pw_salt, cred.pw_iter, env.AUTH_PEPPER);
  const ok = timingSafeEqual(candidate, cred.pw_hash);

  if (locked || !ok) {
    // A locked account does not accumulate further penalty; otherwise an
    // attacker can extend someone else's lockout indefinitely.
    if (!locked) {
      const fails = cred.fail_count + 1;
      // Fourth failure costs a minute, seventh eight minutes, tenth about an hour.
      const until = fails > LOCK_AFTER ? now + 60 * 2 ** (fails - LOCK_AFTER - 1) : 0;
      await env.DB.prepare(
        'UPDATE credentials SET fail_count = ?, lock_until = ? WHERE pin = ?')
        .bind(fails, until, pin).run();
    }
    return fail(401, 'invalid');
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE pin = ?').bind(pin).first();
  if (!user) return fail(401, 'invalid');   // credentials without a profile

  await env.DB.prepare(
    'UPDATE credentials SET fail_count = 0, lock_until = 0 WHERE pin = ?').bind(pin).run();

  const sid = await mintSession(env, pin);
  return json(
    { user: publicUser(user), must_change: !!cred.must_change },
    { headers: { 'Set-Cookie': setCookie(sid) } });
}

async function logout(env, request) {
  const sid = readCookie(request, COOKIE);
  if (sid) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  return json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } });
}

async function patchMe(env, request, me) {
  const body = await readJson(request);
  if (!body) return fail(400, 'invalid');

  const sets = [], vals = [];
  for (const field of ['first_name', 'last_name']) {
    if (!(field in body)) continue;
    const v = body[field];
    if (typeof v !== 'string' || v.length > NAME_MAX) return fail(400, 'invalid');
    sets.push(`${field} = ?`); vals.push(v.trim());
  }
  if ('site_mode_dark' in body) {
    sets.push('site_mode_dark = ?'); vals.push(body.site_mode_dark ? 1 : 0);
  }
  if (!sets.length) return fail(400, 'invalid');

  vals.push(me.pin);
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE pin = ?`).bind(...vals).run();
  const row = await env.DB.prepare('SELECT * FROM users WHERE pin = ?').bind(me.pin).first();
  return json({ user: publicUser(row) });
}

/**
 * Two KDF runs in one request, so this is the one route that exceeds the 10 ms
 * budget on purpose (~13 ms). It is also genuinely rare - a student changes a
 * password once - which is exactly the "infrequently runs over" case Cloudflare's
 * isolate flexibility is documented to cover. Do not copy this shape onto a route
 * that runs often.
 *
 * The current password is required even on the forced first change. One code
 * path, no "fresh session" exemption: someone who has hijacked a session must
 * not be able to lock the owner out of their own account.
 */
async function changePassword(env, request, me) {
  const body = await readJson(request);
  const current = body?.current, next = body?.next;
  if (typeof current !== 'string' || typeof next !== 'string' || next.length < 8) {
    return fail(400, 'invalid');
  }

  const cred = await env.DB.prepare('SELECT * FROM credentials WHERE pin = ?')
    .bind(me.pin).first();
  if (!cred) return fail(401, 'invalid');

  const candidate = await derive(current, cred.pw_salt, cred.pw_iter, env.AUTH_PEPPER);
  if (!timingSafeEqual(candidate, cred.pw_hash)) return fail(401, 'invalid');

  const salt = newSalt();
  const hash = await derive(next, salt, PBKDF2_ITER, env.AUTH_PEPPER);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE credentials
          SET pw_hash = ?, pw_salt = ?, pw_iter = ?, must_change = 0,
              changed_at = unixepoch(), fail_count = 0, lock_until = 0
        WHERE pin = ?`).bind(hash, salt, PBKDF2_ITER, me.pin),
    // Every session, including this one. A password change that leaves an
    // intruder logged in has not evicted anybody.
    env.DB.prepare('DELETE FROM sessions WHERE pin = ?').bind(me.pin),
  ]);

  const sid = await mintSession(env, me.pin);
  return json({ ok: true }, { headers: { 'Set-Cookie': setCookie(sid) } });
}

/**
 * The student's whole attempt set, fetched once at login and held in memory.
 * A few thousand [id, 0|1] tuples even for the projected complete corpus, which
 * is what makes the filter-responsive progress readout a set intersection rather
 * than a query per filter change.
 */
async function getAttempts(env, me) {
  const rs = await env.DB.prepare(
    'SELECT question_id, correct FROM attempts WHERE pin = ? ORDER BY question_id')
    .bind(me.pin).all();
  return json({ attempts: (rs.results || []).map((r) => [r.question_id, r.correct ? 1 : 0]) });
}

/**
 * Batched on quiz submit, never per question render.
 *
 * These records are client-asserted and cannot be otherwise: grading happens in
 * the browser because the banks are embedded in the page. That is fine for a
 * progress tracker and unacceptable for a grade (userplan.md section 7). What
 * does need defending is the write budget - D1 free allows 100k row writes a day
 * across every user - so the caps below are the real point of this function.
 *
 * The Worker has no copy of the corpus, so it cannot reject a question_id that
 * does not exist. Shape, batch size and a per-account row ceiling bound the
 * damage, and the read-before-write below does the rest.
 *
 * Cloudflare's WAF rate limiting is not available here: rules are created for a
 * zone, and a *.pages.dev hostname is not one. Rather than depend on a custom
 * domain that does not exist yet, this reads first and writes only rows that
 * actually change. Replaying a batch then costs one indexed read of at most
 * BATCH_MAX rows instead of BATCH_MAX writes - and reads are the plentiful
 * budget (5M/day) while writes are the scarce one (100k/day). It also makes the
 * common case free: re-running a quiz over banks already seen writes nothing.
 */
async function postAttempts(env, request, me) {
  const body = await readJson(request);
  const records = body && Array.isArray(body.records) ? body.records : null;
  if (!records) return fail(400, 'invalid');
  if (records.length > BATCH_MAX) return fail(413, 'too_many');

  // Collapse duplicates in the batch. The primary key would merge them anyway,
  // but each one would still cost a write.
  const clean = new Map();
  for (const r of records) {
    const qid = r && typeof r.question_id === 'string' ? r.question_id.trim() : '';
    if (!qid || qid.length > QID_MAX || !QID_RE.test(qid)) continue;
    clean.set(qid, Math.max(clean.get(qid) || 0, r.correct ? 1 : 0));
  }
  if (!clean.size) return json({ written: 0 });

  // What is already stored? One indexed read over the primary key.
  const ids = [...clean.keys()];
  const existing = await env.DB.prepare(
    `SELECT question_id, correct FROM attempts
      WHERE pin = ? AND question_id IN (${ids.map(() => '?').join(',')})`)
    .bind(me.pin, ...ids).all();

  const stored = new Map((existing.results || []).map((r) => [r.question_id, r.correct ? 1 : 0]));

  // A row is worth writing only if it is new, or if it is being promoted from
  // seen to correct. Everything else is already what the client is asking for.
  const writes = [];
  for (const [qid, correct] of clean) {
    if (!stored.has(qid)) writes.push([qid, correct, true]);
    else if (correct === 1 && stored.get(qid) === 0) writes.push([qid, 1, false]);
  }
  if (!writes.length) return json({ written: 0 });

  const fresh = writes.filter((w) => w[2]).length;
  if (fresh) {
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM attempts WHERE pin = ?')
      .bind(me.pin).first();
    if ((row ? row.c : 0) + fresh > ROWS_MAX) return fail(413, 'too_many');
  }

  const now = nowSec();
  // MAX() is the latch: seeing a question again after getting it right never
  // demotes it. COALESCE pins correct_at to the first success, not the latest.
  // Both still matter - two devices can race the same question.
  await env.DB.batch(writes.map(([qid, correct]) => env.DB.prepare(
    `INSERT INTO attempts (pin, question_id, correct, seen_at, correct_at)
     VALUES (?1, ?2, ?3, unixepoch(), ?4)
     ON CONFLICT(pin, question_id) DO UPDATE SET
       correct    = MAX(correct, excluded.correct),
       correct_at = COALESCE(correct_at, excluded.correct_at)`)
    .bind(me.pin, qid, correct, correct ? now : null)));

  return json({ written: writes.length });
}

/* ── entry point ──────────────────────────────────────────────────────────── */

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB || !env.AUTH_PEPPER) return fail(500, 'server');

  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const route = `${request.method} ${path}`;

  try {
    if (route === 'POST /api/auth/login')  return await login(env, request);
    if (route === 'POST /api/auth/logout') return await logout(env, request);

    // Everything below requires a session.
    const me = await currentUser(env, request);
    if (!me) return fail(401, 'unauthenticated');

    // A temporary password is one the teacher generated and may still hold a
    // list of, so it must not stay usable all year. Reading your own profile and
    // setting a new password are the only things it can do; logout is handled
    // above, before this gate, so a stuck student can always get out.
    if (me.must_change && !MUST_CHANGE_OK.has(route)) return fail(403, 'must_change');

    if (route === 'GET /api/me') {
      return json({ user: publicUser(me), must_change: !!me.must_change });
    }
    if (route === 'PATCH /api/me')           return await patchMe(env, request, me);
    if (route === 'POST /api/auth/password') return await changePassword(env, request, me);
    if (route === 'GET /api/attempts')       return await getAttempts(env, me);
    if (route === 'POST /api/attempts')      return await postAttempts(env, request, me);

    return fail(404, 'not_found');
  } catch (err) {
    // Deliberately opaque. The message could quote a request body, and request
    // bodies on this router carry plaintext passwords.
    console.error('api error on', route, err?.name || 'Error');
    return fail(500, 'server');
  }
}
