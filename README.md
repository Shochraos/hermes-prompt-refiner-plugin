# Prompt Refiner

## Summary

Prompt Refiner is an optional Hermes Desktop plugin for discussing and editing a prompt before sending it to the main agent. It opens a separate conversation only when you choose Refine. Ordinary Send is unchanged.

## Installation

> [!IMPORTANT]
> Apply the Desktop patch in [`patches/`](patches/) before building Desktop to enable the temporary model picker. Installing or building this plugin does not apply the patch to Hermes. Without the required Desktop capability, the picker remains disabled.

Build the payload with `nix build .#default`. The result contains a directory plugin under `share/hermes/plugins/prompt-refiner`; building it does not install or enable it. Installation and enabling require a compatible Hermes Desktop and backend, and use the host's plugin management workflow. This project targets Hermes source commit `081e8d9b75b2bedae297a89232b04ef9be7b26a0` for source compatibility, not a minimum release guarantee. Installed Desktop and gateway compatibility require separate verification.

Configure the independent `prompt_refinement` auxiliary provider and model in the serving profile's Models → Auxiliary controls. The refiner does not follow or change the main chat model. Image requests also require an operator-confirmed `image_route_attestation` matching the configured labels and compatibility baseline, after separately verifying a synthetic image turn on the intended installation. Reconfirm after a known backend or provider change even if the labels remain the same.

Temporary model selection requires the host's `plugins.entries.prompt-refiner.llm.allow_provider_override` and `allow_model_override` permissions; any host allowlists still apply. The Desktop patch provides a selection-only native catalog. It does not grant permissions or change saved model settings. Configure reasoning in Hermes Settings → Models → Auxiliary → Prompt refiner; the saved setting applies to the selected route subject to provider support. There is no temporary reasoning override.

For development on x86_64-linux, enter `nix develop` and run `bash scripts/check.sh` with `TMPDIR` or `XDG_CACHE_HOME` set to a writable scratch directory. The full offline checks require the plugin and tests to be present. `nix flake check` also runs the offline check. No provider call or plugin installation is part of these checks.

### Desktop patch

This source-only patch targets Hermes commit `081e8d9b75b2bedae297a89232b04ef9be7b26a0`:

- [`0001-hermes-desktop-selection-only.patch`](patches/0001-hermes-desktop-selection-only.patch) adds the Desktop SDK's selection-only model catalog and capability flag. Temporary picks do not write global custom-model, favorite, visibility or provider-folding preferences.

From a clean Hermes source checkout at that revision, set `refiner` to this plugin checkout's absolute path and apply the patch:

```bash
refiner=/absolute/path/to/hermes-prompt-refiner-plugin
git apply --check "$refiner/patches/0001-hermes-desktop-selection-only.patch"
git apply "$refiner/patches/0001-hermes-desktop-selection-only.patch"
```

Rebuild and install Desktop through its normal packaging workflow. Apply the patch to each Desktop client; the serving backend, including a Docker backend, does not need a Python patch. For a Nix-managed Desktop, apply the patch to the renderer source derivation before compilation, not only to the outer Electron wrapper. The patch omits upstream tests and documentation so it can also apply to build-filtered source trees.

Other Hermes revisions require a separate compatibility check. Do not force a failed patch application or apply a patch twice if its changes are already present. This patch does not resolve an unconfigured auxiliary route, grant image compatibility, or establish live provider acceptance.

## Usage

1. Choose Refine. The captured draft prefills the editable message input; for a fresh chat, type or paste the prompt yourself.
2. Use **+** to select source messages and local text/source files or PNG, JPEG and static WebP images. PDF, Office documents, archives, SVG and animated images are rejected. Folder access persists until revoked in Capabilities → Plugins → Folder access.
3. The model selector affects only this temporary refinement. It does not change the main chat or saved Auxiliary settings. **Use configured refiner** restores the saved refiner model. The saved Prompt refiner reasoning setting applies to every temporary model, subject to provider support.
4. Choose the Send arrow to open the review dialog, then Prepare preview to upload selected inputs to the captured Hermes backend for validation and text redaction. Inspect the preview before choosing Send to refiner, which sends it through Hermes model routing. Image pixels are not redacted. Hermes may use a vision model or fallback provider; requested labels do not lock the execution route.
5. Continue the discussion, edit the candidate and choose Copy prompt. Paste it yourself, reattach any needed original files and send it normally. Copy does not submit or modify the composer.

Discard clears the temporary refinement state; hiding the pane preserves it. Closing the sole plugin pane disables the plugin. Clearing state does not revoke folder access, erase copied text or remove provider or host logs, and does not guarantee cancellation of an in-flight request or billing.

## Architecture

A Desktop pane holds the temporary conversation and selected snapshots. An owner-routed backend validates and redacts prepared input and runs a bounded, tool-free auxiliary model job. The user reviews the result and controls the copy-only handoff.

## License

The project's code is released under the [Unlicense](UNLICENSE).
