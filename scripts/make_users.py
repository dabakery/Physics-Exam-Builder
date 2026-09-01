#!/usr/bin/env python3
"""Seed student and admin accounts for the Physics Exam Builder.

Emits SQL for the D1 console. Nothing here talks to Cloudflare, and the pepper
is never written to disk: it is prompted for, held in memory, and discarded.

The hash must match functions/api/[[path]].js exactly - HMAC-SHA-256 with the
pepper, then PBKDF2-SHA-256 over that digest. If the two ever disagree, every
seeded password becomes unverifiable and the only symptom is that login always
fails. scripts/check_kdf_parity.sh proves they agree.

    # one account
    python3 scripts/make_users.py --pin ADMIN01 --first Michael --last Baker --admin

    # a roster: CSV with a pin,first_name,last_name header
    python3 scripts/make_users.py --csv roster.csv > seed.sql

    # forgotten password: new temporary one, every session dropped
    python3 scripts/make_users.py --reset --pin S1001 > reset.sql

SQL goes to stdout; the temporary passwords go to stderr, because they are the
one output that must reach paper and never reach a file you might commit.
"""
from __future__ import annotations

import argparse
import base64
import csv
import getpass
import hashlib
import hmac
import secrets
import sys

PBKDF2_ITER = 20000       # must equal PBKDF2_ITER in the router
SALT_BYTES = 16
DKLEN = 32

# No i/l/1 or o/0. These get read off a paper slip and typed on a Chromebook.
ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
GROUPS, GROUP_LEN = 3, 4


def temp_password() -> str:
    groups = ["".join(secrets.choice(ALPHABET) for _ in range(GROUP_LEN))
              for _ in range(GROUPS)]
    return "-".join(groups)


def derive(password: str, salt: bytes, iterations: int, pepper: str) -> bytes:
    """Mirror of derive() in the router. Order matters: pepper, then KDF."""
    peppered = hmac.new(pepper.encode("utf-8"),
                        password.encode("utf-8"),
                        hashlib.sha256).digest()
    return hashlib.pbkdf2_hmac("sha256", peppered, salt, iterations, dklen=DKLEN)


def sq(value: str) -> str:
    """Single-quoted SQL literal. Doubling is SQLite's only escape."""
    return "'" + str(value).replace("'", "''") + "'"


def reset_rows_for(pin: str, pepper: str):
    """New temporary password for an account that already exists.

    Written as INSERT ... ON CONFLICT rather than a bare UPDATE on purpose. An
    UPDATE against a pin that does not exist changes zero rows and reports
    nothing, so a teacher would hand out a password that can never work. This
    form hits the foreign key instead and fails loudly, and as a side effect it
    repairs a user whose credentials row went missing.
    """
    salt = secrets.token_bytes(SALT_BYTES)
    password = temp_password()
    digest = derive(password, salt, PBKDF2_ITER, pepper)

    sql = (
        f"INSERT INTO credentials (pin, pw_hash, pw_salt, pw_iter, must_change)\n"
        f"  VALUES ({sq(pin)}, {sq(base64.b64encode(digest).decode())}, "
        f"{sq(base64.b64encode(salt).decode())}, {PBKDF2_ITER}, 1)\n"
        f"  ON CONFLICT(pin) DO UPDATE SET\n"
        f"    pw_hash = excluded.pw_hash, pw_salt = excluded.pw_salt,\n"
        f"    pw_iter = excluded.pw_iter, must_change = 1,\n"
        f"    changed_at = unixepoch(), fail_count = 0, lock_until = 0;\n"
        # Every session, not just the current one. A reset exists partly to
        # evict whoever should not be there.
        f"DELETE FROM sessions WHERE pin = {sq(pin)};\n"
    )
    return sql, password


def rows_for(pin: str, first: str, last: str, is_admin: bool, pepper: str):
    salt = secrets.token_bytes(SALT_BYTES)
    password = temp_password()
    digest = derive(password, salt, PBKDF2_ITER, pepper)

    # Plain INSERT, not UPSERT: re-running against an existing pin should fail
    # loudly rather than silently overwrite somebody's password.
    sql = (
        f"INSERT INTO users (pin, first_name, last_name, is_admin)\n"
        f"  VALUES ({sq(pin)}, {sq(first)}, {sq(last)}, {1 if is_admin else 0});\n"
        f"INSERT INTO credentials (pin, pw_hash, pw_salt, pw_iter, must_change)\n"
        f"  VALUES ({sq(pin)}, {sq(base64.b64encode(digest).decode())}, "
        f"{sq(base64.b64encode(salt).decode())}, {PBKDF2_ITER}, 1);\n"
    )
    return sql, password


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate seed SQL for user accounts.")
    ap.add_argument("--pin")
    ap.add_argument("--first", default="")
    ap.add_argument("--last", default="")
    ap.add_argument("--admin", action="store_true",
                    help="set is_admin = 1 (single-account mode only)")
    ap.add_argument("--csv", help="roster file with a pin,first_name,last_name header")
    ap.add_argument("--reset", action="store_true",
                    help="reset existing accounts instead of creating them")
    args = ap.parse_args()

    if bool(args.pin) == bool(args.csv):
        ap.error("give exactly one of --pin or --csv")
    if args.reset and args.admin:
        ap.error("--admin sets a users column and means nothing on a reset")

    people: list[tuple[str, str, str, bool]] = []
    if args.pin:
        people.append((args.pin.strip(), args.first.strip(), args.last.strip(), args.admin))
    else:
        with open(args.csv, newline="", encoding="utf-8") as fh:
            for i, row in enumerate(csv.DictReader(fh), start=2):
                pin = (row.get("pin") or "").strip()
                if not pin:
                    print(f"{args.csv}:{i}: missing pin, skipped", file=sys.stderr)
                    continue
                people.append((pin, (row.get("first_name") or "").strip(),
                               (row.get("last_name") or "").strip(), False))

    if not people:
        print("nothing to do", file=sys.stderr)
        return 1

    seen: set[str] = set()
    for pin, *_ in people:
        if pin in seen:
            print(f"duplicate pin in input: {pin}", file=sys.stderr)
            return 1
        seen.add(pin)

    pepper = getpass.getpass("AUTH_PEPPER (input hidden): ").strip()
    if not pepper:
        print("empty pepper, aborting", file=sys.stderr)
        return 1

    verb = "Reset" if args.reset else "Created"
    print("-- Generated by scripts/make_users.py. Contains password hashes.")
    print("-- Do not commit. Delete once it has been applied to D1.")
    print(f"-- {verb}: {len(people)} account(s), pw_iter = {PBKDF2_ITER}\n")

    print("PIN                  TEMPORARY PASSWORD   NAME", file=sys.stderr)
    print("-" * 62, file=sys.stderr)
    for pin, first, last, is_admin in people:
        if args.reset:
            sql, password = reset_rows_for(pin, pepper)
            flag = ""
        else:
            sql, password = rows_for(pin, first, last, is_admin, pepper)
            flag = "  [admin]" if is_admin else ""
        print(sql)
        print(f"{pin:<20} {password:<20} {first} {last}{flag}", file=sys.stderr)

    # A reset touches rows that must already exist. Print a check the operator
    # can paste after, so a typo'd pin shows up as a missing line rather than as
    # a student who cannot log in next week.
    pins = ", ".join(sq(pin) for pin, *_ in people)
    print("-- Verify: every pin below should appear, must_change = 1.")
    print("SELECT pin, must_change, datetime(changed_at, 'unixepoch', 'localtime') AS changed")
    print(f"  FROM credentials WHERE pin IN ({pins});")

    print("-" * 62, file=sys.stderr)
    print("Each account must change its password on first login (must_change = 1).",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
