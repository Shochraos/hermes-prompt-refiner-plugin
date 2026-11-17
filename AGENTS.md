# Contributor guidance

## Scope and structure

Read `IDEA.md` in full if present. It is local context and must remain ignored.

The directory plugin contains `plugin.yaml`, `__init__.py`, `refiner.py` and `desktop/plugin.js`. Backend tests use standard-library unittest; Desktop tests use Node's built-in runner.

## Environment and verification

Edit this checkout at `/opt/data/projects/hermes-prompt-refiner`. Build only as `agent` through SSH alias `nix-workspace`, using the shared path `/projects/hermes-prompt-refiner`; verify hostname, user and checkout first. Use `nix develop --command bash scripts/check.sh`, `nix flake check` and `nix build .#default`. Keep temporary checks and caches in scratch. Do not install/enable the plugin, access personal profiles, call a provider or deploy as a test side effect.

## Implementation rules

Use the public Hermes SDK and pinned source baseline. Ordinary chat Send is untouched. Only Send in the refiner pane uploads the message, refinement history and selected context for validation and model use. Keep the refiner tool-free, temporary and copy-only: never write a composer, paste or submit. Fail closed on ambiguous owners, unsupported types, missing APIs and unconfirmed image routes. Do not persist content or capabilities, read secrets, log raw errors or reclaim shared folder grants.

Prefer simple Python and uncompiled ESM; operational scripts are Bash. Add no dependencies or framework outside the approved design. Do not add code comments except mandatory directives; use clear names and contract docstrings where necessary.

## Git and collaboration

Verify repository root, branch and HEAD before edits. Preserve unrelated work and staging. Workers own only their assigned files and do not commit or push. The coordinator inspects exact staged diffs and makes focused commits at verified checkpoints; final independent review covers the integrated change series. No push, merge or history rewriting without explicit scope.

Keep internal workflow state, design drafts, review reports and source snapshots outside this repository. Delete them when their workflow is finished. Never stage, commit or push them. Only public documentation and contributor guidance belong in the source tree.
