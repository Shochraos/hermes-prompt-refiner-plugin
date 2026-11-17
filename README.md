# Prompt Refiner

## Summary

Prompt Refiner is an optional Hermes Desktop plugin for discussing and editing a prompt before sending it to the main agent. It opens a separate conversation only when you choose Refine. Ordinary Send is unchanged.

## Installation

> [!IMPORTANT]
> Apply the Desktop selection-only patch before building Desktop to enable the temporary model picker. The standalone dashboard/serve backend also needs the plugin-RPC host patch. Building or installing this plugin applies neither patch. Without the Desktop capability, the picker remains disabled.

Build the payload with `nix build .#default`. The result contains a directory plugin under `share/hermes/plugins/prompt-refiner`; building it does not install or enable it. Installation and enabling require a compatible Hermes Desktop and backend, and use the host's plugin management workflow. This project targets Hermes source commit `081e8d9b75b2bedae297a89232b04ef9be7b26a0` for source compatibility, not a minimum release guarantee. Installed Desktop and gateway compatibility require separate verification.

Configure the independent `prompt_refinement` auxiliary provider and model in the serving profile's Models → Auxiliary controls. The refiner does not follow or change the main chat model. Image requests also require an operator-confirmed `image_route_attestation` matching the configured labels and compatibility baseline, after separately verifying a synthetic image turn on the intended installation. Reconfirm after a known backend or provider change even if the labels remain the same.

Temporary model selection requires the host's `plugins.entries.prompt-refiner.llm.allow_provider_override` and `allow_model_override` permissions; any host allowlists still apply. The Desktop patch provides a selection-only native catalog. It does not grant permissions or change saved model settings. Configure reasoning in Hermes Settings → Models → Auxiliary → Prompt refiner; the saved setting applies to the selected route subject to provider support. There is no temporary reasoning override.

For development on x86_64-linux, enter `nix develop` and run `bash scripts/check.sh` with `TMPDIR` or `XDG_CACHE_HOME` set to a writable scratch directory. The full offline checks require the plugin and tests to be present. `nix flake check` also runs the offline check. No provider call or plugin installation is part of these checks.

### Host patches

These source-only patches target Hermes commit `081e8d9b75b2bedae297a89232b04ef9be7b26a0`:

- [`0001-hermes-desktop-selection-only.patch`](patches/0001-hermes-desktop-selection-only.patch) adds the Desktop SDK's selection-only model catalog and capability flag. Temporary picks do not write global custom-model, favorite, visibility or provider-folding preferences.
- [`0002-hermes-standalone-plugin-rpc.patch`](patches/0002-hermes-standalone-plugin-rpc.patch) enables registered plugin RPC methods on the standalone dashboard/serve backend. [`0003-hermes-standalone-plugin-rpc-tests.patch`](patches/0003-hermes-standalone-plugin-rpc-tests.patch) separately adds upstream regression tests; it is not needed in a filtered runtime source tree.

From a clean Hermes source checkout at that revision, set `refiner` to this plugin checkout's absolute path and apply the patches needed by your build:

```bash
refiner=/absolute/path/to/hermes-prompt-refiner-plugin
git apply --check "$refiner/patches/0001-hermes-desktop-selection-only.patch"
git apply "$refiner/patches/0001-hermes-desktop-selection-only.patch"
git apply --check "$refiner/patches/0002-hermes-standalone-plugin-rpc.patch"
git apply "$refiner/patches/0002-hermes-standalone-plugin-rpc.patch"
```

Rebuild and install each Desktop client and the standalone serving backend through their normal packaging workflows; for Docker, patch the backend source used to build the image. For a Nix-managed Desktop, apply patch 0001 to the renderer source derivation before compilation, not only to the outer Electron wrapper. Apply patch 0002 to the backend source. No Python reasoning extension or proxy migration is required. The runtime patches omit upstream tests and documentation so they can apply to build-filtered source trees.

Other Hermes revisions require a separate compatibility check. Do not force a failed patch application or apply a patch twice if its changes are already present. These patches do not resolve an unconfigured auxiliary route, grant image compatibility, or establish live provider acceptance.

## Usage

1. Choose Refine. The captured draft prefills the editable message input; for a fresh chat, type or paste the prompt yourself.
2. Use **+** to select source messages and local text/source files or PNG, JPEG and static WebP images. PDF, Office documents, archives, SVG and animated images are rejected. Folder access persists until revoked in Capabilities → Plugins → Folder access.
3. The model selector affects only this temporary refinement. It does not change the main chat or saved Auxiliary settings. **Use configured refiner** restores the saved refiner model. The saved Prompt refiner reasoning setting applies to every temporary model, subject to provider support.
4. Press **Send** in the refiner pane. Hermes checks the message, refinement history and selected context, redacts sensitive text, and sends the request to the model without a second confirmation. Image pixels are not redacted. Hermes may use another provider or model, and the call may incur costs.
5. The refiner rewrites your question as a task instead of answering it. Ask for changes in the same pane, or say the wording is right. Once you approve it, use **Copy prompt** on the final version. Copying takes only the prompt text; it doesn't change or send your main chat draft. Reattach any files you need there.

Discard clears the temporary refinement state; hiding or closing and reopening the pane preserves temporary input. Clearing state does not revoke folder access, erase copied text or remove provider or host logs, and does not guarantee cancellation of an in-flight request or billing.

## Architecture

A Desktop pane holds the temporary conversation and selected snapshots. An owner-routed backend validates and redacts prepared input and runs a bounded, tool-free auxiliary model job. The user reviews the result and controls the copy-only handoff.

## License

The project's code is released under the [Unlicense](UNLICENSE).
