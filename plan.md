# Newland Web Kiosk React Library: Implementation Plan

Oct 27, 2026 · @Andreas V

Based on the Newland Web Kiosk User Guide v2.21.

## What the integration is

Web Kiosk is a full-screen Android wrapper around a web app. It exposes one global, `window.nlScan`, with methods the page calls. It calls back into the page through three global functions: `nlBarcode`, `nlNFC` and `nlNHubResult`.

The library's job is to turn that global-function bridge into something safe and idiomatic in React: a typed wrapper around `nlScan` and a subscription layer over the callbacks.

## Design decisions

1. **A single callback registry.** The kiosk can only call one global `nlBarcode`. The library installs it once and fans events out to any number of subscribers. This makes hooks work with several components, React StrictMode double-mounting, and route changes in an SPA.
2. **Only define `nlNFC` while someone is subscribed.** If the page has no `nlNFC`, the kiosk falls back to "wedge" behaviour: it types the tag into the focused field and optionally sends Tab or Enter (`:NFCTAB`, `:NFCENTER`). Always defining `nlNFC` would break apps that rely on the wedge, so it is added and removed with subscriptions.
3. **Environment detection and a mock.** Check `typeof window.nlScan !== 'undefined'`. Outside the kiosk the hooks become no-ops, and a mock `nlScan` plus a `simulateScan()` helper allows desktop development and testing.
4. **SSR safety.** Guard every `window` access so it works in Next.js, and add a `"use client"` banner to the build output.
5. **Layering.** A framework-agnostic core (types, bridge, registry) sits under a thin React layer, so the core is testable without React.

## Proposed public API (sketch)

- **v1:** `<KioskProvider>` (calls `Power`, `Initialize`, `Beep`, `LED` and similar once, from props; the guide recommends initializing once from the landing page).
- **v1:** `useBarcodeScan(handler)` for scans, including source (internal or Bluetooth MAC), symbology and status.
- **v1:** `useScanner()` with `power`, `trigger`, `stop`, `setTriggerMode`, `setTimeout`, `setInterval`, `setRepeatInterval`, `setScanMode`, `configureSymbology`.
- **v1:** `useDeviceInfo()` for model, serial, build and device name.
- **v2:** `useNfc(handler)`, the NFC equivalent of `useBarcodeScan`.
- **Later:** `useNHub()` wrapping `NHubSend` and the `nlNHubResult` callback for Bluetooth scanners.
- **Later:** `useNQuire()` for GPIO and logo LED control, a no-op on non-NQuire devices.
- **Not yet scheduled:** `buildKioskUrl(url, options)`, a helper for the `newland…:ALLOWZOOM:NOBUTTONS` shortcut format.

## Guide inconsistencies to verify on a device

The bridge is case-sensitive, so these need checking rather than guessing:

- **Method casing.** The guide documents `nlScan.Triggermode`, but its own sample calls `nlScan.TriggerMode`.
- **Callback arguments.** The `nlBarcode` signature shows four arguments, `(barcode, type, typename, status)`, but the parameter table also lists a `Source` first. Is source a fifth argument, or is the order different?
- **NHub callback name.** The signature heading spells it `nlNHubRestult`, while the text says `nlNHubResult`.
- **Version differences.** `:AUTOFOCUS` is new compared with v2.18, and options became case-insensitive from 2.18. There is no documented way to read the kiosk version from JS, so we would need to feature-detect.
- **Missing reference data.** Symbology IDs and names, and `BarcodeConfig` properties, live in separate Newland handbooks (the Android Mobile Computer API Handbook and the Symbologies Configuration Handbook). Until we have them, `typename` and the config arguments stay loosely typed as strings.

## Phases

**v1: barcode and device control**

1. **Device spike.** Load a throwaway page on a real handheld scanner, dump `Object.keys(window.nlScan)`, and log raw callback arguments to settle the inconsistencies above.
2. **Core.** Types, the safe `nlScan` wrapper with feature detection, and the callback registry.
3. **React layer.** Provider, `useBarcodeScan`, `useScanner` and `useDeviceInfo`.
4. **Mock and tests.** The mock `nlScan`, plus Vitest and React Testing Library tests for registry behaviour: multiple subscribers and unmount cleanup.
5. **Demo app.** A small Vite app, ideally a port of the guide's sample page, opened via a `newlandhttps://` shortcut. It doubles as documentation and as the real-device test harness.
6. **Private packaging.** `tsup` builds ESM and CJS with type declarations, `react` as a peer dependency (≥18), and a README. The package stays private for now.

**v2: NFC**

7. Add `useNfc` and the `nlNFC` add/remove logic so the kiosk's NFC wedge keeps working when nothing is subscribed. Extend the mock, tests and demo app to cover it.

**Later versions:** NHub (Bluetooth scanners) and NQuire (GPIO and logo LEDs). NQuire devices are available for testing but are not a priority.

## Scope and decisions

- **Devices:** several Newland scanners are available for testing, including NQuire devices (not a first priority), so the phase 1 spike can run on real hardware.
- **Scope:** v1 is barcode and device control, v2 is NFC, and NHub and NQuire come in later versions.
- **Distribution:** private for now, not published to public npm.

## Source

- Newland Web Kiosk User Guide v2.21 (see pdf in project folder)
