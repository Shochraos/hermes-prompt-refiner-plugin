# Refiner pane sizing

The Refiner requests a quarter of the Desktop window’s width when docked beside the chat, or a quarter of its height when docked above or below it. You can still drag the divider. Without the sizing patch, the plugin uses the same native pane, but Desktop chooses its starting size.

To enable this behavior on the [supported Hermes source revision](../README.md#host-patches), apply [`0005-hermes-desktop-workspace-sizing.patch`](0005-hermes-desktop-workspace-sizing.patch) to the **Desktop renderer source** before building the client. From the Hermes source root, with `refiner` set to the absolute path to this plugin checkout:

```bash
git apply --check "$refiner/patches/0005-hermes-desktop-workspace-sizing.patch"
git apply "$refiner/patches/0005-hermes-desktop-workspace-sizing.patch"
```

If you also use the selection-only model picker, apply `0001` first. Rebuilding the plugin payload or the gateway does not update the Desktop renderer. Other Hermes revisions need their own compatibility check.
