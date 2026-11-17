#!/usr/bin/env bash
set -euo pipefail

parent=${TMPDIR:-${XDG_CACHE_HOME:-}}
if [[ -z $parent || $parent != /* || $parent == / || ! -d $parent || ! -w $parent ]]; then
  printf '%s\n' 'A writable absolute scratch parent is required in TMPDIR or XDG_CACHE_HOME.' >&2
  exit 1
fi
scratch=$(mktemp -d "$parent/prompt-refiner-check.XXXXXXXX")
cleanup() {
  local status=$? attempt
  for attempt in 1 2 3 4 5; do
    if rm -rf -- "$scratch" 2>/dev/null; then
      return "$status"
    fi
    if ((attempt < 5)); then
      sleep 0.1
    fi
  done
  printf 'Could not remove check scratch directory: %s\n' "$scratch" >&2
  if ((status == 0)); then
    status=1
  fi
  return "$status"
}
trap cleanup EXIT
mkdir -p "$scratch/tmp" "$scratch/home" "$scratch/cache" "$scratch/hermes" "$scratch/pycache"
env -i \
  PATH="$PATH" \
  TMPDIR="$scratch/tmp" \
  HOME="$scratch/home" \
  XDG_CACHE_HOME="$scratch/cache" \
  HERMES_HOME="$scratch/hermes" \
  PYTHONPYCACHEPREFIX="$scratch/pycache" \
  PYTHONDONTWRITEBYTECODE=1 \
  LC_ALL=C.UTF-8 \
  bash -euo pipefail -c '
    python -m py_compile __init__.py refiner.py
    python -m unittest discover -s tests
    node --check desktop/plugin.js
    node --experimental-vm-modules --test tests/desktop.test.mjs
    nixfmt --check flake.nix
    shfmt -d -i 2 -ci scripts/check.sh .envrc
    shellcheck -s bash scripts/check.sh .envrc
    hermes plugins doctor . --ci
  '
