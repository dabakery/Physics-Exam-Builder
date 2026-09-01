#!/bin/sh
# Static checks for the browser-side JavaScript.
#
# Catches the class of bug `node --check` cannot: syntactically valid code that
# only fails once it runs, because it assumes a Node environment. The page's
# inline script is not a module and has no `global` binding, so a `global.x`
# copied out of one of the IIFE modules parses fine and throws on execution.
# That took down the bank list on 2026-09-01.
#
# Exits 1 on any finding, so it drops into a pre-commit hook unchanged.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
fail=0

MODULES="bank-source.js exam-export.js exam-export-plus.js exam-quiz.js exam-auth.js"
PAGES="enhanced index"

# Node-isms that are wrong in a browser no matter where they appear.
NODEISM='\b(require\(|module\.exports|process\.(env|argv|exit)|__dirname|__filename)'

echo "syntax"
for m in $MODULES; do
  f="$ROOT/frontend/$m"
  [ -f "$f" ] || continue
  if node --check "$f" 2>"$TMP/err"; then
    printf '  ok    frontend/%s\n' "$m"
  else
    printf '  FAIL  frontend/%s\n' "$m"; sed 's/^/        /' "$TMP/err"; fail=1
  fi
done

# The page's own inline <script> block. Tags carrying a src attribute do not
# match ^<script>$, so this extracts exactly the one inline block.
for p in $PAGES; do
  f="$ROOT/frontend/$p.html"
  [ -f "$f" ] || continue
  awk '/^<script>$/{on=1;next} /^<\/script>$/{on=0} on' "$f" > "$TMP/$p.js"
  if node --check "$TMP/$p.js" 2>"$TMP/err"; then
    printf '  ok    frontend/%s.html inline (%s lines)\n' "$p" "$(wc -l < "$TMP/$p.js" | tr -d ' ')"
  else
    printf '  FAIL  frontend/%s.html inline\n' "$p"; sed 's/^/        /' "$TMP/err"; fail=1
  fi
done

echo "environment"
# In the inline scripts `global` is never bound. In the modules it is the IIFE
# parameter, so it is only a finding there if the file does not declare it.
for p in $PAGES; do
  [ -f "$TMP/$p.js" ] || continue
  if grep -nE '\bglobal\.' "$TMP/$p.js" > "$TMP/hit" 2>/dev/null; then
    printf '  FAIL  frontend/%s.html inline uses `global.` - use `window.`\n' "$p"
    sed 's/^/        /' "$TMP/hit"; fail=1
  else
    printf '  ok    frontend/%s.html inline has no `global.`\n' "$p"
  fi
done

for m in $MODULES; do
  f="$ROOT/frontend/$m"
  [ -f "$f" ] || continue
  if grep -q '^(function (global)' "$f"; then
    printf '  ok    frontend/%s binds `global` as an IIFE parameter\n' "$m"
  elif grep -qE '\bglobal\.' "$f"; then
    printf '  FAIL  frontend/%s uses `global.` without binding it\n' "$m"; fail=1
  fi
done

echo "node-isms"
found=0
for m in $MODULES; do
  f="$ROOT/frontend/$m"
  [ -f "$f" ] || continue
  if grep -nE "$NODEISM" "$f" > "$TMP/hit" 2>/dev/null; then
    printf '  FAIL  frontend/%s\n' "$m"; sed 's/^/        /' "$TMP/hit"; fail=1; found=1
  fi
done
for p in $PAGES; do
  [ -f "$TMP/$p.js" ] || continue
  if grep -nE "$NODEISM" "$TMP/$p.js" > "$TMP/hit" 2>/dev/null; then
    printf '  FAIL  frontend/%s.html inline\n' "$p"; sed 's/^/        /' "$TMP/hit"; fail=1; found=1
  fi
done
[ "$found" -eq 0 ] && echo "  ok    none found"

echo
if [ "$fail" -eq 0 ]; then echo "browser JS checks passed"; else echo "browser JS checks FAILED" >&2; fi
exit "$fail"
