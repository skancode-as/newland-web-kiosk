---
name: newland-web-kiosk-integration
description: Integrate @skancode/newland-web-kiosk into a React app running inside Newland Web Kiosk (MT90 and similar). Use when adding barcode or NFC scanning, wiring KioskProvider and the useScanner, useBarcodeScan, useNfc, and useDeviceInfo hooks, installing the desktop mock, or debugging missing callbacks, NFC wedge regressions, and "Method not found" bridge errors.
---

# Newland Web Kiosk Integration

## When to use

Use this skill in a **consumer** app that imports `@skancode/newland-web-kiosk`:

- adding barcode or NFC scanning, or wiring `KioskProvider` and the scanner, barcode, NFC, or device-info hooks;
- moving a desktop-mocked app onto the MT90;
- debugging missing callbacks, `Method not found`, or a broken NFC wedge.

For exhaustive API tables, point to the package README instead of duplicating it.

## Install and compatibility

- React `>=18` is the peer dependency; the host app provides react-dom. Install with
  `npm install @skancode/newland-web-kiosk`.
- The bridge (`window.nlScan`) exists only inside Newland Web Kiosk (`com.nls.nlbrowser` on the
  tested build); a plain browser needs the mock.
- Real events require a device, a kiosk-hosted page, and the `newlandhttp` or `newlandhttps` scheme.

## Minimal wiring

- Mount `KioskProvider` once, as high as possible. Commands run once in a mount effect, only when
  `enabled` and `isKiosk()` are true; later props are ignored.
- Pass `power={1}` (or `true`) to power the scanner on; omit it to leave power untouched.
- Hooks do not read context, so one provider is a mount point; still call hooks unconditionally at
  the top level and never guard them with `isKiosk()`.

```tsx
import { createRoot } from "react-dom/client";
import {
  KioskProvider,
  useBarcodeScan,
  useNfc,
  useScanner,
} from "@skancode/newland-web-kiosk";

createRoot(document.getElementById("root")!).render(
  <KioskProvider power={1}>
    <App />
  </KioskProvider>,
);

function App() {
  const scanner = useScanner();
  useBarcodeScan((e) => console.log(e.barcode, e.symbologyName));
  useNfc((e) => console.log(e.data)); // tag UID, not NDEF
  return (
    <button onClick={() => scanner.trigger()} disabled={!scanner.isSupported}>
      Scan
    </button>
  );
}
```

## Reading events

- `useBarcodeScan` yields `{ barcode, source, symbology, symbologyName, status, raw }`.
- Web Kiosk 2.21 sends five arguments, source first: `(source, barcode, symbologyId, symbologyName, status)`.
  The library also normalizes 1–4 argument builds and a single object payload; read the named fields
  and use `raw` only when firmware changes shape.
- `barcode` / `data` are always strings (missing becomes `""`); `symbology` and `status` keep their
  original type.
- `useNfc` yields `{ data, type, status, raw }`. On 2.21 `data` is the tag UID in uppercase hex and
  `type` is the literal `"NFC"`; it is not an NDEF payload.
- Multiple components may subscribe; one global callback fans out and isolates listener errors.
  Handlers live in refs, so re-renders do not resubscribe — wrap expensive ones in `useCallback`.

## Scanner control (`useScanner`)

- `power(true)` sends `Power(1)`, `power(false)` sends `Power(0)`; `stop()`, `beep(value = 1)`, and
  `led(value = 1)`. On/off booleans are mapped to ints.
- `trigger(timeout?)` already calls `Stop()` then `Trigger(timeout ?? 0)`; do not call `stop()` first.
- `configureSymbology(codeId, property, value)` sends `BarcodeConfig(String, String, String)`. Pass
  exactly three strings with decimal values (`"1"`, `"0"`, `"5"`); empty strings are rejected. Use the
  exported `BARCODE_*` constants and confirm the engine's table — the tested MT90 (CM60L) is Table A.
- `isSupported` means "a bridge exists", not "this method exists", and is sampled at mount; use it for
  UI only.
- `useDeviceInfo()` returns `{ model, serialNumber, buildNumber, deviceName, isSupported, refresh }`;
  call `refresh()` after a late bridge or mock install.

## Stay on the hooks

- Do not assign `window.nlBarcode` / `window.nlNFC` or call `window.nlScan` directly; the registry
  chains existing globals, so a manual handler would also receive the same events.
- Do not gate hooks on `isKiosk()`. Without a bridge, commands no-op and subscriptions stay inert,
  which keeps late bridge injection working.
- Reserve `invoke()` for bridge methods the wrapper does not cover.

## NFC wedge rule

- The kiosk types the tag into the focused input (wedge) whenever `window.nlNFC` is undefined; the
  registry defines `nlNFC` only while at least one `useNfc` subscriber is mounted and removes it when
  the last one unmounts.
- If the app relies on wedge input, do not keep `useNfc` mounted globally; mount it only on screens
  that want callback mode.
- `nlBarcode` follows the same lifecycle without the wedge tradeoff.

## Desktop mock and tests

- Import from `@skancode/newland-web-kiosk/mock`; never install it on a device.
- Install before React mounts so `KioskProvider` sees a bridge and `useDeviceInfo()` reads mock values
  on first mount.

```ts
import { isKiosk } from "@skancode/newland-web-kiosk";
import { installMockNlScan } from "@skancode/newland-web-kiosk/mock";

export const mock = isKiosk() ? null : installMockNlScan();
```

- Emit barcodes with `mock.simulateBarcodeScan("5740700982972")` or
  `mock.simulateBarcodeScan({ barcode, source, symbology, symbologyName, status })`; including
  `source` sends the five-argument shape.
- Emit NFC with the Web Kiosk shape:

  ```ts
  mock.simulateNfcScan({ data: "NFC", type: "04A2B3C4D5", status: "" });
  ```

  This mirrors `window.nlNFC("NFC", uid)`. A plain string is only a generic fallback and yields
  `type: ""`, not the real kiosk shape.

- Both return `false` when `window.nlBarcode` / `window.nlNFC` is not a function — usually because the
  hook's component has not mounted yet.
- `mock.calls` records every bridge call; `resetCalls()` clears it, and `uninstall()` restores the
  previous `window.nlScan` for `afterEach`. In React tests, wrap simulations in `act(...)`.

## Critical bridge rules

- Exact arity is mandatory: `Trigger(int)`, `Stop()`, `Beep(int)`, `LED(int)`, `Initialize(int)`,
  `Power(int)`, `TriggerMode(int)`, `Scanmode(int)`, `Timeout(long)`, `Interval(long)`,
  `RepeatInterval(long)`. Zero-arg `Trigger`, `Beep`, `LED`, or `Stop(arg)` throw `Method not found`.
- `BarcodeConfig` takes exactly three strings; `NHubSend` takes two.
- Use numeric `1` / `0` for int on/off parameters. The WebView coerces `true` to `0`, so raw
  `Power(true)` does nothing; `scanner.power(true)` works.
- On 2.21, device info comes from zero-arg `NGetModel()`, `NGetSerial()`, `NGetBuild()`, and
  `NGetDeviceName()`, not properties.
- Resolution is case-tolerant and own-property only; never rely on inherited names.

## SSR / Next.js

- Treat the library as client-only (it ships a `"use client"` banner); use it from client components.
  Calling its hooks in a server component is invalid.
- Do not read `window` at module top level or install the mock during render or in a server-only module.
  Install the mock in the client entry module before `createRoot`/render; a mount-effect install is too
  late for `KioskProvider` and `useDeviceInfo`'s first mount.
- For a client-only widget, use `dynamic(() => import("./Scanner"), { ssr: false })`.

## Device verification

1. Build or start the app and serve it over HTTP.
2. `adb -s YOUR_DEVICE_SERIAL reverse tcp:5173 tcp:5173` (use your port).
3. Open `newlandhttp://localhost:5173/`. Add a unique query string (`?v=<timestamp>`) each time so the
   WebView fetches fresh HTML.
4. Confirm `isKiosk()` is true and a physical scan produces one event.
5. `adb logcat | grep -i nlwebkiosk` shows bridge calls and native rejections.
6. WebView DevTools is disabled on the tested MT90; rely on logcat and screenshots.

Checklist: provider mounted once with the intended `power`; one scan produces one handler call; one NFC
tap produces one `useNfc` event (or wedge input when unmounted); no `Method not found`; mock is `null`
on the device.

## Troubleshooting

| Symptom                                | Likely cause                                                                 | Action                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Method not found`                     | Wrong argument count, including `invoke()`                                   | Use hooks; match the signatures above; never call zero-arg `Trigger`, `Beep`, or `LED`    |
| No barcode events                      | Hook not mounted; page not hosted by the kiosk; handler gated on `isKiosk()` | Mount `useBarcodeScan` unconditionally, check `isKiosk()`, reopen with a new query string |
| `Power(true)` has no effect            | Raw bridge coerced `true` to `0`                                             | Use `scanner.power(true)` or raw `Power(1)`                                               |
| NFC wedge stopped working              | A mounted `useNfc` defines `window.nlNFC`                                    | Unmount `useNfc` where wedge input is needed                                              |
| `window is not defined`                | Package or mock executed during SSR                                          | Move usage into a client component; install the mock before render                        |
| Provider props not applied later       | Commands run once, in the mount effect                                       | Pass initial values or call `scanner.setTimeout(...)` explicitly                          |
| Duplicate scan handling                | Two subscribers, or a hand-installed global the registry chains              | Keep one handler per concern; remove manual global assignment                             |
| `isKiosk()` false in a desktop browser | No `window.nlScan`                                                           | Install the mock before React mounts; false is expected in a browser                      |
