#!/bin/sh
# Proves scripts/make_users.py and functions/api/[[path]].js derive the same hash.
#
# They are two independent implementations of the same construction, in two
# languages, and a mismatch is silent: seeded passwords simply never verify.
# The JS half is sliced out of the router itself, not copied, so this cannot
# pass against a stale duplicate.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PEPPER='parity-check-pepper'
PASSWORD='correct horse battery staple'
SALT_B64='AAECAwQFBgcICQoLDA0ODw=='   # bytes 0..15
ITER=20000

# Slice the real helpers out of the router: everything from the encoder down to
# the responses section, which covers b64e/b64d and derive().
awk '/^const enc = new TextEncoder\(\);$/{on=1} /^\/\* .. responses/{exit} on' \
  "$ROOT/functions/api/[[path]].js" > "$TMP/kdf.mjs"

cat >> "$TMP/kdf.mjs" <<'JS'
const [pepper, password, salt, iter] = process.argv.slice(2);
console.log(await derive(password, salt, Number(iter), pepper));
JS

JS_OUT=$(node "$TMP/kdf.mjs" "$PEPPER" "$PASSWORD" "$SALT_B64" "$ITER")

PY_OUT=$(ROOT="$ROOT" PEPPER="$PEPPER" PASSWORD="$PASSWORD" SALT="$SALT_B64" ITER="$ITER" \
  python3 -c '
import base64, os, sys
sys.path.insert(0, os.path.join(os.environ["ROOT"], "scripts"))
from make_users import derive
print(base64.b64encode(derive(os.environ["PASSWORD"],
                              base64.b64decode(os.environ["SALT"]),
                              int(os.environ["ITER"]),
                              os.environ["PEPPER"])).decode())')

echo "  js: $JS_OUT"
echo "  py: $PY_OUT"
if [ "$JS_OUT" = "$PY_OUT" ]; then
  echo "KDF parity OK"
else
  echo "KDF PARITY FAILED - seeded passwords would never verify" >&2
  exit 1
fi
