# Prompt Refiner

## Summary

Prompt Refiner is an optional Hermes Desktop plugin for discussing and editing a prompt before sending it to the main agent. It opens a separate conversation only when you choose Refine. Ordinary Send is unchanged.

## Installation

Build the payload with `nix build .#default`. The result contains a directory plugin under `share/hermes/plugins/prompt-refiner`; building it does not install or enable it. Installation and enabling require a compatible Hermes Desktop and backend, and use the host's plugin management workflow. This project targets Hermes source commit `081e8d9b75b2bedae297a89232b04ef9be7b26a0` for source compatibility, not a minimum release guarantee. Installed Desktop and gateway compatibility require separate verification.

Configure the independent `prompt_refinement` auxiliary provider and model in the serving profile's Models → Auxiliary controls. The refiner does not follow or change the main chat model. Image requests also require an operator-confirmed `image_route_attestation` matching the configured labels and compatibility baseline, after separately verifying a synthetic image turn on the intended installation. Reconfirm after a known backend or provider change even if the labels remain the same.

For development on x86_64-linux, enter `nix develop` and run `bash scripts/check.sh` with `TMPDIR` or `XDG_CACHE_HOME` set to a writable scratch directory. The full offline checks require the plugin and tests to be present. `nix flake check` also runs the offline check. No provider call or plugin installation is part of these checks.

## Usage

1. Choose Refine. Inspect the captured stored-chat draft snapshot, or type or paste a prompt in a fresh chat.
2. Optionally select source messages and local text/source files or PNG, JPEG and static WebP images. PDF, Office documents, archives, SVG and animated images are rejected. Folder access persists until revoked in Capabilities → Plugins → Folder access.
3. Choose Prepare preview to upload selected inputs to the captured Hermes backend for validation and text redaction. Inspect the preview before choosing Send to refiner, which sends it through Hermes model routing. Image pixels are not redacted. Hermes may use a vision model or fallback provider; configured labels do not lock the execution route.
4. Continue the discussion, edit the candidate and choose Copy prompt. Paste it yourself, reattach any needed original files and send it normally. Copy does not submit or modify the composer.

Discard clears the temporary refinement state; hiding the pane preserves it. Closing the sole plugin pane disables the plugin. Clearing state does not revoke folder access, erase copied text or remove provider or host logs, and does not guarantee cancellation of an in-flight request or billing.

## Architecture

A Desktop pane holds the temporary conversation and selected snapshots. An owner-routed backend validates and redacts prepared input and runs a bounded, tool-free auxiliary model job. The user reviews the result and controls the copy-only handoff. The design and compatibility boundaries are documented in [the implementation plan](docs/designs/prompt-refiner.md).

## License

The project's original code is released under the [Unlicense](UNLICENSE). Preserved third-party source and evidence retain their own terms and are not included in the plugin payload.
