#!/bin/sh
# Runs the engine tests with macOS JavaScriptCore (no Node required).
cd "$(dirname "$0")/.." || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
for f in tests/*.test.js; do
  echo "== $f"
  "$JSC" -m "$f" || exit 1
done
