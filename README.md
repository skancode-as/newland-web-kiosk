# newland-web-kiosk

A small, private React library for Newland Web Kiosk devices. It wraps the native
`window.nlScan` bridge in typed functions and turns the kiosk's global callback
functions into React subscriptions.

The package is intentionally narrow: barcode scanning, device information and
basic scanner control. NFC is supported; NHub (Bluetooth scanners) and NQuire
(GPIO and logo LED) are **not implemented yet**.

## What it wraps

Web Kiosk is a full-screen Android wrapper around a web app. It exposes one
global object and calls back into the page through global functions:

| Direction     | Global                | Purpose                                     |
| ------------- | --------------------- | ------------------------------------------- |
| Page → device | `window.nlScan`       | Scanner commands and device properties      |
| Device → page | `window.nlBarcode`    | Barcode scan results                        |
| Device → page | `window.nlNFC`        | NFC tag results                             |
| Device → page | `window.nlNHubResult` | Bluetooth scanner results (not implemented) |

The raw bridge is awkward for a React app: the kiosk can only call one global
`nlBarcode`, methods have inconsistent casing, and callback arguments vary
between kiosk versions. This library provides:

- a single callback registry that fans one global handler out to many subscribers;
- feature detection so scanner commands fail closed and device info reports
  `isSupported: false` when the bridge is missing;
- method resolution that tolerates casing differences;
- normalized event objects that keep the original arguments in `raw`;
- a mock bridge for desktop development.

Subscriptions are the exception to "no-op": `useBarcodeScan` and `useNfc` install
their global wrappers as soon as they subscribe, even outside the kiosk. With no
native bridge behind them, those wrappers simply never receive device events.

## Install and develop

The package is private and is not published to public npm.

```bash
npm install          # install workspace dependencies
npm test             # run the Vitest suite once
npm run test:watch   # run tests in watch mode
npm run build        # build dist/ with tsup
npm run typecheck    # tsc --noEmit
npm run dev          # start the Vite demo on http://localhost:5173
npm run demo:build   # production build of the demo
```

To consume the package from another project, build it first and install the
folder or a packed tarball:

```bash
npm run build
npm pack
# then in the consuming project:
npm install ../newland-web-kiosk-0.1.0.tgz
```

The package declares `react` as a peer dependency (`>=18`) and stays `private`
in `package.json`. Use the packed tarball flow above to consume it from another
project. Publishing it to a company registry would require removing
`"private": true`; it is not intended for the public npm registry.

## Quick start

Wrap the app once, as high as possible. Each provider instance issues its
initialization commands once, from a mount effect, and only when `enabled` is
true and `isKiosk()` is true at that moment.

```tsx
// main.tsx
import { createRoot } from "react-dom/client";
import { KioskProvider } from "newland-web-kiosk";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <KioskProvider power={1}>
    <App />
  </KioskProvider>,
);
```

`power={1}` issues `Power(1)` during that first mount effect. Omit the prop
if you do not want the provider to touch scanner power. On/off props accept a
`SwitchValue` (`boolean | 0 | 1`); the library maps `true` to `1` and `false` to
`0` before calling the bridge. Prefer explicit `1`/`0` when talking to the raw
bridge yourself, because the WebView coerces `true` to `0`. Props are read only
for that first run; later prop changes do not resend commands. The hooks do not
consume React context, so the provider is only a convenient mount point for
one-shot commands.

```tsx
// App.tsx
import {
  useBarcodeScan,
  useDeviceInfo,
  useNfc,
  useScanner,
} from "newland-web-kiosk";

export function App() {
  const device = useDeviceInfo();
  const scanner = useScanner();

  useBarcodeScan((event) => {
    console.log(event.barcode, event.source, event.symbologyName, event.status);
  });

  useNfc((event) => {
    // event.data is the tag ID (uppercase hex); event.type is "NFC".
    console.log(event.data, event.type, event.status);
  });

  return (
    <main>
      <p>
        {device.model} · {device.serialNumber}
      </p>
      <button onClick={() => scanner.trigger()}>Scan</button>
      <button onClick={() => scanner.stop()}>Stop</button>
      <button onClick={() => scanner.beep()}>Beep</button>
    </main>
  );
}
```

### API

```ts
import {
  KioskProvider,
  isKiosk,
  useBarcodeScan,
  useNfc,
  useScanner,
  useDeviceInfo,
  BARCODE_CODE_IDS_TABLE_A,
  BARCODE_CODE_IDS_TABLE_B,
  BARCODE_PROPERTIES,
  BARCODE_ENABLED,
  BARCODE_DISABLED,
  type BarcodeCodeId,
  type BarcodeCodeIdTableA,
  type BarcodeCodeIdTableB,
  type BarcodeProperty,
  type BarcodeScanEvent,
  type NfcEvent,
  type DeviceInfo,
  type DeviceInfoState,
  type KioskProviderProps,
  type ScannerMethod,
  type SwitchValue,
  type UseScannerResult,
  type UseDeviceInfoResult,
} from "newland-web-kiosk";
```

| Export                    | Description                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `KioskProvider`           | Calls provider-level commands once per provider instance, at mount, when enabled and supported |
| `isKiosk()`               | `true` when `window.nlScan` is a function or non-null object                                   |
| `useBarcodeScan(handler)` | Subscribes to normalized barcode events; installs `window.nlBarcode`                           |
| `useNfc(handler)`         | Subscribes to normalized NFC events; installs `window.nlNFC` only while subscribed             |
| `useScanner()`            | Scanner commands and `isSupported`, sampled when the hook mounts                               |
| `useDeviceInfo()`         | Model, serial, build, device name, `isSupported`, `refresh()`                                  |
| `BARCODE_*` constants     | Confirmed code IDs, property names and `"0"`/`"1"` values for `configureSymbology`             |

The root entry exports the items above (plus their types) and nothing from the
internal registry or test helpers. Mock helpers live at
`newland-web-kiosk/mock`.

`useScanner()` exposes:

```ts
type SwitchValue = boolean | 0 | 1;

{
  isSupported: boolean;
  initialize: (value?: SwitchValue) => boolean; // default 1
  power: (on: SwitchValue) => boolean;
  trigger: (timeout?: number) => boolean; // Stop() then Trigger(timeout ?? 0)
  stop: () => boolean;
  setTriggerMode: (mode: number) => boolean;
  setTimeout: (ms: number) => boolean;
  setInterval: (ms: number) => boolean;
  setRepeatInterval: (ms: number) => boolean;
  setScanMode: (mode: number) => boolean;
  configureSymbology: (
    codeId: BarcodeCodeId,
    property: BarcodeProperty,
    value: string,
  ) => boolean;
  beep: (value?: SwitchValue) => boolean; // default 1
  led: (value?: SwitchValue) => boolean; // default 1
  invoke: (method: string, ...args: unknown[]) => boolean;
}
```

Each action maps to one exact-arity Java method:

| Action                                    | Bridge call                             |
| ----------------------------------------- | --------------------------------------- |
| `initialize(value = 1)`                   | `Initialize(int)`                       |
| `power(on)`                               | `Power(int)`                            |
| `trigger(timeout = 0)`                    | `Stop()`, then `Trigger(int)`           |
| `stop()`                                  | `Stop()`                                |
| `setTriggerMode(mode)`                    | `TriggerMode(int)`                      |
| `setTimeout(ms)`                          | `Timeout(long)`                         |
| `setInterval(ms)`                         | `Interval(long)`                        |
| `setRepeatInterval(ms)`                   | `RepeatInterval(long)`                  |
| `setScanMode(mode)`                       | `Scanmode(int)`                         |
| `configureSymbology(codeId, prop, value)` | `BarcodeConfig(String, String, String)` |
| `beep(value = 1)`                         | `Beep(int)`                             |
| `led(value = 1)`                          | `LED(int)`                              |

`SwitchValue` booleans are converted to `1`/`0` before the call, so
`power(true)` invokes `Power(1)` and `power(false)` invokes `Power(0)`. Passing
the numbers `1`/`0` directly does the same thing. `initialize()` sends
`Initialize(1)`; `Initialize(int)` hardcodes scan mode `3` internally and uses
its argument only for `SEND_SCAN_FAIL_BROADCAST`.

`trigger(timeout?)` calls `Stop()` first and then `Trigger(timeout ?? 0)`.
`Trigger` is a toggle on the device, so stopping first makes every programmatic
trigger deterministic. Physical scans through the hardware key still work
independently.

Every action returns a boolean: `true` when the bridge owned a matching method
and the call did not throw, `false` when the bridge is missing, no matching
method exists, or the native call throws. The native return value is not
inspected, so `true` is an acknowledgement, not proof that the device acted.
`beep()` and `led()` default to `1`; pass `false` or `0` to send `0`.

`isSupported` means "a bridge object or function exists", not that the method
you are about to call exists. It is sampled when the hook mounts.

See [BarcodeConfig / symbology reference](#barcodeconfig--symbology-reference)
for the confirmed code IDs, property names and value formats.

Event shapes:

```ts
type BarcodeScanEvent = {
  barcode: string;
  source: string | null;
  symbology: string | number | null;
  symbologyName: string | null;
  status: string | number | null;
  raw: readonly unknown[];
};

type NfcEvent = {
  data: string;
  type: string | null;
  status: string | number | null;
  raw: readonly unknown[];
};
```

## Desktop mock

The mock implements only `window.nlScan`. The callback globals (`nlBarcode`,
`nlNFC`) are installed by the registry when the corresponding hook subscribes,
not by the mock. The mock is part of the same package and is consumed through
the `newland-web-kiosk/mock` subpath; no separate install is needed.

Install the mock **before React mounts** so `KioskProvider` sees a bridge when it
runs its mount effect and `useDeviceInfo()` reads the mock device info when it
first mounts. Subscriptions do not capture the bridge, so they still work if the
mock is installed later (see [Late bridge injection](#late-bridge-injection)).
`installMockNlScan()` requires a browser `window`, so call it from browser code,
not during server rendering.

```ts
import { installMockNlScan } from "newland-web-kiosk/mock";

const mock = installMockNlScan({
  deviceInfo: {
    model: "Mock NQuire 1000",
    serialNumber: "MOCK-0001",
    buildNumber: "2.21-mock",
    deviceName: "Desktop Demo",
  },
});
```

The returned controller exposes:

```ts
mock.calls; // Array<{ method: string; args: unknown[]; at: number }>
mock.simulateBarcodeScan("0123456789012");
mock.simulateBarcodeScan({
  barcode: "0123456789012",
  source: "internal",
  symbology: 12,
  symbologyName: "EAN-13",
  status: 0,
});
mock.simulateNfcScan({ data: "04A2B3C4D5", type: "NDEF", status: 0 });
mock.resetCalls();
mock.uninstall();
```

Both simulators return `false` when the corresponding global
(`window.nlBarcode` or `window.nlNFC`) is not a function, and `true` when they
called it without throwing. The check is on the global, not on a subscriber
count. In practice the registry installs those functions when a hook subscribes,
so a `false` result usually means the component using the hook is not mounted
yet—or that a handler threw. `simulateBarcodeScan("...")` sends the four-argument
shape; including `source` sends five arguments with the source first.
`mock.calls` records every bridge method call with its arguments and timestamp,
which makes scanner controls observable on a desktop.

`uninstall()` restores the previous `window.nlScan` (or deletes it if there was
none), but only if the mock still owns it; it does not touch `nlBarcode` or
`nlNFC`, which belong to the registry and are removed when their last subscriber
unsubscribes. It is mostly useful in tests; a long-lived demo can leave the mock
installed.

## Demo app

`demo/` is a Vite + React app that doubles as the hardware test harness. It
imports the library source directly through aliases, so `npm run dev` works
without building `dist/` first.

```bash
npm install
npm run dev
# http://localhost:5173
```

On a desktop browser the entry point calls `isKiosk()` before React renders,
installs the mock when there is no native bridge, and then mounts the app. The
demo shows:

- an environment badge (kiosk, desktop mock, or missing bridge);
- device information with a refresh action;
- power, trigger, stop, initialize, trigger mode, timeout, beep and LED controls;
- a newest-first barcode log with source, symbology, name and status;
- a newest-first NFC log;
- desktop-only barcode and NFC simulators, including a random barcode helper;
- collapsible mock method calls for verifying what the controls actually sent.

On a real device, build the demo and serve `demo/dist` over HTTP, then open it
through a `newlandhttps://` shortcut. The native bridge only exists inside Web
Kiosk; opening the same build in Chrome uses the mock.

## Hardware spike page

`spike/index.html` is a standalone, no-build page with inline CSS and JS. It is
designed to be served over HTTP and opened inside Web Kiosk.

```bash
npx serve spike
# or
python3 -m http.server 8080 --directory spike
```

Create a `newlandhttps://` shortcut pointing at the served URL. See the Web
Kiosk guide for the shortcut syntax and URL options. Do not open the file through
`file://`; the kiosk shortcut needs an HTTP(S) URL.

The page records:

- whether `window.nlScan` exists and a table of every key with its `typeof`;
- `navigator.userAgent` and the current page URL;
- raw `nlBarcode` callback arguments, installed automatically at load;
- raw NFC arguments, but only after you tick **Define nlNFC**;
- both `TriggerMode` and `Triggermode` existence checks plus explicit call
  buttons for each spelling;
- buttons for `Power(true)`, `Power(false)`, `Trigger()`, `Stop()`,
  `Initialize()`, `Beep()`, `LED(true)` and `LED(false)`, enabled only when the
  method is present. These zero-argument calls fail on Web Kiosk 2.21; use the
  explicit-argument field or the `useScanner` methods, which send the required
  `1`/`0` and timeout values;
- an arbitrary method call field with comma-separated arguments;
- clear and copy-log actions.

`nlNFC` is deliberately not defined by default. With no `nlNFC`, the kiosk falls
back to its wedge behavior: it types the tag into the focused field and may send
Tab or Enter. Tick the checkbox to replace the wedge with a logger, then untick
it to confirm the wedge comes back.

Record on the device:

1. **Barcode argument count and order.** Four arguments or five? Which position
   holds the source?
2. **Source values.** Internal scanner, Bluetooth MAC, `undefined`, `null`?
3. **Status values.** Success, cancel and failure values; string or number?
4. **Symbology values.** Numeric ID and display name for each code type.
5. **Device info shape.** Property or getter, and the exact key spelling.
6. **NFC wedge before and after `nlNFC`.** Does the field receive the tag? Does
   it tab or enter?
7. **NHub callback spelling.** `nlNHubResult` or `nlNHubRestult`?
8. **URL options and version.** Which of `:ALLOWZOOM`, `:NOBUTTONS` and
   `:AUTOFOCUS` are accepted? Can the kiosk version be inferred?
9. **Trigger mode casing.** Which spelling exists?

## Architecture

```text
src/
  core/
    types.ts        Public event/device types and window globals
    environment.ts  SSR-safe window access, getNlScan(), isKiosk()
    bridge.ts       Method aliases, casing resolution, invoke()
    parse.ts        Callback argument normalization
    deviceInfo.ts   Defensive property/getter probing
    registry.ts     Global callback installation, fan-out, restoration
  index.ts          Public React entry point
  react/
    KioskProvider.tsx
    useBarcodeScan.ts
    useNfc.ts
    useScanner.ts
    useDeviceInfo.ts
  mock/
    index.ts        installMockNlScan() and the mock bridge

demo/               Vite demo and hardware harness
spike/              No-build bridge inspection page
```

The **core** has no React dependency. It owns the bridge and the callback
registry, so registry behavior can be tested in a plain browser-like
environment. The **React layer** is thin: hooks subscribe to the core, expose
`isSupported` where relevant, and clean up on unmount; the provider issues its
one-shot commands. The **mock subpath** is a separate entry point
(`newland-web-kiosk/mock`) so production bundles do not pull in test helpers.

The callback registry is the important piece. The kiosk can only call one global
`nlBarcode`, so the registry installs one wrapper and fans each parsed event out
to a `Set` of listeners. The same install/uninstall cycle applies to `nlBarcode`
and `nlNFC`. Unsubscribing removes only that listener; the wrapper is removed
when the last listener leaves, and any pre-existing global handler is restored
(if another handler replaced the wrapper meanwhile, that handler is left alone).
This is what makes multiple components, StrictMode double-mounting and SPA route
changes safe.

## Feature detection and method resolution

`isKiosk()` returns `true` when `window.nlScan` is a function or a non-null
object; other values, including `null`, count as missing. Every window access
goes through a guard, so importing the package during server rendering does not
throw.

When the bridge is missing, scanner commands return `false` and device info
stays at `isSupported: false`. Subscription hooks still install their globals;
with no native bridge, those wrappers never receive device events.

`invoke()` resolves a logical method through `METHOD_NAMES`, which supplies
documented aliases such as `Timeout`/`SetTimeout` and `ScanMode`/`SetScanMode`,
then tries casing variants of each candidate in this order:

1. exact spelling, e.g. `TriggerMode`;
2. first letter uppercased and the rest lowercased, e.g. `Triggermode`;
3. first letter lowercased and the rest unchanged, e.g. `triggerMode`;
4. all lowercase, e.g. `triggermode`;
5. all uppercase, e.g. `TRIGGERMODE`.

Duplicate variants are skipped. Only own properties of the bridge are resolved,
so inherited names such as `toString` or `constructor` are never invoked. A
method not listed in `METHOD_NAMES` is used as the sole candidate. Successful
resolutions are cached per bridge object; misses are not cached, so a method that
appears later can still be found.

Device-info lookup is separate: for each candidate key it tries the casing
variants, uses a string or number value directly, and otherwise calls a
zero-argument function and uses its string or number return value.
`useDeviceInfo().isSupported` is `true` whenever the bridge exists, even if none
of the expected fields are found.

`TriggerMode` versus `Triggermode` was a hardware unknown: the guide documents
`Triggermode`, while its sample uses `TriggerMode`. A 2.21 MT90 exposes exactly
`TriggerMode`, and the resolver still generates `Triggermode` as the second
casing variant, so both builds work without configuration.

### Late bridge injection

Commands and subscriptions tolerate a bridge that appears after the page loads,
but mount-time reads do not:

- `invoke()` re-reads `window.nlScan` on every call and caches only successful
  resolutions, so scanner commands start working as soon as `nlScan` exists.
- `useBarcodeScan` and `useNfc` install their global wrappers as soon as they
  subscribe, independent of `nlScan`, so events are delivered if the bridge
  arrives later.
- `useScanner().isSupported` is sampled when the hook mounts and does not update
  by itself.
- `KioskProvider` runs its commands from a mount effect and only when it is
  enabled and `isKiosk()` is true at that moment; it does not retry.
- `useDeviceInfo()` reads at mount; call `refresh()` to re-read after a late
  install.

For full behavior, install the real bridge or the mock before React mounts.

## Callback argument normalization

The confirmed live shape on Web Kiosk 2.21 / MT90 is five arguments with the
source first:

```js
window.nlBarcode("INTERNAL", "5740700982972", 8, "EAN13", "ok");
// (source, barcode, symbologyId, symbologyName, status)
```

Here the source is `"INTERNAL"`, `symbologyId` is the numeric `8` (EAN13),
`symbologyName` is `"EAN13"`, and `status` is `"ok"`.

The parser handles this shape plus two compatibility forms:

- **Five or more arguments** — the first is treated as source:
  `(source, barcode, symbology, symbologyName, status)`. This is the confirmed
  Web Kiosk 2.21 / MT90 shape.
- **One to four arguments** — the first is treated as barcode and `source` is
  `null`: `(barcode, symbology, symbologyName, status)`. This branch remains as
  a compatibility fallback for other builds; it is not what 2.21 sends.
- **A single object** — own keys are matched case-insensitively. Barcode aliases
  are `barcode`/`data`/`code`/`value`, `source`/`scanner`/`mac`,
  `symbology`/`type`, `symbologyName`/`typename`/`typeName`/`name`, and
  `status`.

NFC has a confirmed special shape on Web Kiosk 2.21 / MT90:

```js
window.nlNFC("NFC", "A63F0A84");
// (literal "NFC", tagIdHex)
```

The first argument is the literal technology tag `"NFC"` (matched
case-insensitively) and the second argument is the tag UID/ID in uppercase hex.
The parser maps these to `{ data: "A63F0A84", type: "NFC", status: null }`, so
`useNfc` event `data` is the tag ID and `event.type` is the literal `"NFC"`. A
third argument, when present, becomes `status`. This callback exposes the tag
ID only: no NDEF record or payload was observed on the real device, and none is
reported by this library.

For other builds, NFC callbacks use `(data, type, status)`, or a single object
with `data`/`uid`/`id`/`tag`/`ndef`/`payload`, `type`/`technology`, and `status`.
Zero arguments produce no event.

Barcode `symbology`/`status` and NFC `status` keep their original
string-or-number type. `barcode` and `data` are always strings (a missing value
becomes `""`), while `source`, `symbologyName` and `type` are strings or `null`.
Values of other types are dropped during normalization. The unmodified arguments
are always available on `raw` as a readonly array, which is the escape hatch
when a new kiosk version changes the shape.

This normalization is deliberately tolerant, not authoritative. The spike page
is the source of truth for a given device and firmware.

## NFC wedge lifecycle

The kiosk treats an undefined `window.nlNFC` as permission to use its NFC wedge:
the tag value is typed into the focused input, optionally followed by Tab or
Enter (`:NFCTAB`, `:NFCENTER`). Defining `nlNFC` permanently would break
applications that rely on that behavior.

The registry therefore installs `window.nlNFC` only while at least one `useNfc`
subscriber exists. When the last subscriber unsubscribes, the wrapper is removed
and the previous handler is restored, or the global is deleted—provided the
wrapper is still the current value. `nlBarcode` follows the same lifecycle, but
without the wedge tradeoff. Multiple subscribers share one native callback, and
StrictMode's mount/unmount/mount cycle does not leave the global stuck in place.

The demo's `useNfc` keeps `nlNFC` defined while the page is open. Use the spike
page to compare wedge behavior with the callback installed and removed.

## Packaging and build outputs

`tsup` builds two entries from `src/index.ts` and `src/mock/index.ts`:

- ESM (`dist/index.js`, `dist/mock.js`);
- CommonJS (`dist/index.cjs`, `dist/mock.cjs`);
- type declarations (`dist/index.d.ts`, `dist/mock.d.ts`);
- source maps;
- a `"use client"` banner on every JavaScript output, including both formats of
  the mock entry.

`react`, `react-dom` and the JSX runtimes are external, and `react` is declared
as a peer dependency. The package exposes `.` and `./mock` through `exports`,
ships only `dist`, and remains `private: true`. CJS files use the `.cjs`
extension; ESM files use `.js`. The mock is a separate subpath
(`newland-web-kiosk/mock`), so importing the root entry does not pull it in.

The banner marks all exports, including the mock, as client code. Do not import
the package into a React Server Component if you need server-only execution.

The root `package.json` declares `demo` as a workspace; the demo aliases the
library source directly so local development does not require a rebuild.

## Raw bridge gotchas

The WebView bridge is stricter than a normal JavaScript object:

- **Exact arity is mandatory.** The bridge matches the argument count against
  the Java signature, so `Trigger()` and `Stop(1)` throw
  `Error invoking <Name>: Method not found`. Call `Trigger(0)` and `Stop()`.
- **Booleans are not usable for `int` parameters.** `Power(true)` arrives as
  `0` and does not switch the scanner on. Pass explicit `1`/`0` to the raw
  bridge for every int on/off parameter (`Power`, `Initialize`, `Beep`, `LED`,
  `TriggerMode`, `Scanmode`). `useScanner` and `KioskProvider` do this mapping
  for you.
- **String parameters are positional.** `BarcodeConfig` always takes exactly
  three strings: code id, property, value. `NHubSend` takes a key then a value.
- **`long` parameters** (`Timeout`, `Interval`, `RepeatInterval`) are not
  probed with booleans; pass integer-valued JS numbers.

## BarcodeConfig / symbology reference

`configureSymbology(codeId, property, value)` sends one
`BarcodeConfig(String, String, String)` call. The three strings are positional
and have no defaults:

```ts
scanner.configureSymbology("EAN13", "Enable", "1"); // BarcodeConfig("EAN13", "Enable", "1")
```

Values are always strings:

- **Toggles** use `"1"` (on) and `"0"` (off). `BARCODE_ENABLED` and
  `BARCODE_DISABLED` export those two values.
- **Numeric** fields such as `Minlen`, `Maxlen` and `CodeNum` take decimal
  strings (`"5"`), never JSON numbers.
- **Enums** use the index the engine defines, for example `VideoMode` `"0"`
  normal, `"1"` inverse, `"2"` both.
- **Empty string** is rejected by the receiver, so a setting cannot be cleared
  through this API.

Code IDs are exact and case-sensitive. The engine consults one of two native
tables, and the library ships the vocabulary of both:

| Meaning            | Table A `BARCODE_CODE_IDS_TABLE_A` | Table B `BARCODE_CODE_IDS_TABLE_B` |
| ------------------ | ---------------------------------- | ---------------------------------- |
| Codabar            | `CODABAR`                          | `CODEBAR`                          |
| Common 1D group    | `Common1D`                         | `_1D_COMMON`                       |
| OCR                | `OCR`, `OCR-AI`                    | _absent_                           |
| Setup 128          | _absent_                           | `SETUP128`                         |
| Illum / preprocess | folded into `OTHER`                | `ILLUM`, `PrePro`, `ExposureSet`   |
| QR micro option    | `Micor` (typo)                     | `Micro`                            |
| ECI option         | `CloseECI`                         | `EnECI`                            |
| UPC/EAN add-on     | `AddonRequired`                    | `Addon2Required`, `Addon5Required` |

Both tables share the common IDs used below (`EAN13`, `CODE128`, `QR`, `DM`,
`PDF417`, `AZTEC`, …). The QR config key is `QR`; `QRCODE` is only the result
name for barcode type `258` and is not accepted by `BarcodeConfig`.

```ts
scanner.configureSymbology("EAN13", "Enable", "1");
scanner.configureSymbology("CODE128", "Minlen", "5");
scanner.configureSymbology("QR", "Enable", "1");
scanner.configureSymbology("DM", "Maxlen", "300");
```

Property names are exact too. Some are misspelled in the native table and must
stay that way: `TrsmtChkChar`, `TrsmtStasrtStop`, `MsgtoEan13`, `Micor`,
`RectAngle`. `BARCODE_PROPERTIES` lists every key from both tables.

> **Warning:** the active table depends on the scanner engine. `CODABAR` vs
> `CODEBAR` and `Common1D` vs `_1D_COMMON` are not interchangeable, and neither
> `QRCODE` nor `CDB` is a native config key. Also note that `DM.RectAngle` has
> inverted values: table A maps `"0"` to enable, table B maps `"0"` to disable.
>
> The MT90 / CM60L used for testing resolves to **Table A**; see
> [Confirmed on MT90 / Web Kiosk 2.21](#confirmed-on-mt90--web-kiosk-221) for the
> logcat evidence. The library stays device-agnostic: it still exports both
> vocabularies and `configureSymbology` makes no assumption about the table.

This library ships only the code-ID and property vocabulary. The full
per-engine tables, including defaults, enums and the property subset for each
symbology, are proprietary and are not committed to this repository; the
machine-readable dump stays in `artifacts/newland/`.

## Known unknowns and device checklist

### Confirmed on MT90 / Web Kiosk 2.21

A read-only inspection of a real Newland MT90 running Web Kiosk 2.21 established
the following. These are now treated as facts for this version, not guesses:

- **Kiosk package:** `com.nls.nlbrowser`, version 2.21 (versionCode 48), running
  on Android 11 / SDK 30.
- **Bridge methods (`nlScan` keys):** `BarcodeConfig`, `Beep`, `Initialize`,
  `Interval`, `LED`, `NGetBuild`, `NGetDeviceName`, `NGetModel`, `NGetSerial`,
  `NHubSend`, `Power`, `RepeatInterval`, `Scanmode`, `Stop`, `Timeout`,
  `Trigger`, `TriggerMode`, `nqGPIO`, `nqLOGO`. `TriggerMode` has exactly that
  casing; there is no `Triggermode` in this build.
- **Method arity:** the bridge matches the exact argument count. The confirmed
  signatures are `BarcodeConfig(String, String, String)`, `Beep(int)`,
  `Initialize(int)`, `Interval(long)`, `LED(int)`, `NHubSend(String, String)`,
  `Power(int)`, `RepeatInterval(long)`, `Scanmode(int)`, `Stop()`, `Timeout(long)`,
  `Trigger(int)`, `TriggerMode(int)`. `Trigger()`, `Beep()`, `LED()`,
  `Initialize()`, `TriggerMode()`, `Timeout()`, `Interval()`, `RepeatInterval()`,
  `Scanmode()` and `BarcodeConfig()` all throw `Method not found`; `Stop(arg)`
  also fails.
- **Device info:** `NGetModel()` returns `NLS-MT90`, `NGetSerial()` and
  `NGetDeviceName()` return `MT9055W4EL00736`, and `NGetBuild()` returns
  `MT90-GL_V8.04.010_111010`. `Power(1)` and `Power(0)` work. `Power(true)` is
  coerced to `0` by the bridge, so it does **not** power the scanner on.
- **`nlBarcode` shape:** confirmed by a live scan, five arguments with the
  source first:

  ```js
  window.nlBarcode("INTERNAL", "5740700982972", 8, "EAN13", "ok");
  ```

  That is `(source, barcode, symbologyId, symbologyName, status)`, with source
  `"INTERNAL"`, numeric symbology id `8` (EAN13), and status `"ok"`.

- **`nlNFC` shape:** confirmed on hardware with four physical taps, each of
  which produced exactly one callback (four taps, four events):

  ```js
  window.nlNFC("NFC", "A63F0A84");
  ```

  The first argument is the literal `"NFC"`; the second is the tag UID/ID as
  uppercase hex. `useNfc` reports the tag ID as `event.data` and the literal
  `"NFC"` as `event.type`. This API exposes the tag ID, not full NDEF record
  contents: only the UID was observed, and no NDEF payload is delivered.

- **`nlNHubResult` shape:** `(result, statusNumber, deviceAddress)` for future
  NHub work. `nlNHubRestult` does not appear to be used by this build.
- **`Trigger` and `Stop`:** `Trigger(0|1)` works and `Trigger()` does not;
  `Stop()` works and `Stop(arg)` does not. The library calls `Stop()` before
  `Trigger(timeout)` because `Trigger` is a toggle. Physical scans also work.
- **Callbacks:** `nlBarcode`, `nlNFC`, `nlNHubResult`. `nlBarcode` and `nlNFC`
  are page-defined globals: our registry defines them when a hook subscribes and
  the kiosk calls them. The kiosk does not inject those callback globals. The
  presence of `nlNFC` is how the kiosk chooses between the callback and its NFC
  wedge.
- **URL schemes:** `newlandhttp`, `newlandhttps`, `newlandfile`.
- **Active symbology table:** **Table A (`EngineSettingCodeEN`)**. A probe on
  this MT90 (`persist.sys.scan.info = CM60L`, Web Kiosk 2.21) sent both Codabar
  spellings with the `Enable` default (`"1"`) while the scanner was powered on.
  The native adapter accepted `CODABAR` and rejected `CODEBAR`:

  ```text
  D NLWebKiosk: BarcodeConfig: CODABAR,Enable,1
  D CommonScanAdapter: Set code params, profile:=default, code_id:=CODABAR, property:=Enable, value:=1, res:=1
  D NLWebKiosk: BarcodeConfig: CODEBAR,Enable,1
  D CommonScanAdapter: Set code params, profile:=default, code_id:=CODEBAR, property:=Enable, value:=1, res:=0
  ```

  That means `CODABAR` is the working spelling on this device, and
  `Common1D`, `CloseECI` and Table A's `DM.RectAngle` values apply too. The
  `BarcodeConfig` bridge method is `void`, so the booleans returned by the probe
  only confirm that each call was dispatched; the `res:=` field is the verdict.
  The probe page lives at `demo/table-probe.html`
  (`demo/src/table-probe.tsx`); evidence is in
  `artifacts/table-probe-filtered.txt`, `artifacts/table-probe-logcat.txt` and
  `artifacts/table-probe.png`.

These are unresolved until verified on hardware:

- **Symbology table on other engines and firmware.** Table A is confirmed on
  the tested MT90 / CM60L (see above), but other Newland engines or firmware
  builds may consult Table B. Code IDs and property keys for both tables are
  exported (see
  [BarcodeConfig / symbology reference](#barcodeconfig--symbology-reference));
  the page cannot read which table is active, so device-specific spellings must
  still be chosen per engine.
- **Alias acceptance and case sensitivity.** `QRCODE` and `CDB` are not native
  config keys. Whether the driver tolerates them, or lower-case IDs, is
  untested (testing would require sending a config).
- **Engine support subset and length bounds.** The tables are a superset, so the
  firmware may reject symbols it does not implement (`OCR`, `GM`, `USERC`, …).
  `Minlen`/`Maxlen` hard limits come from the shipped UI JSON, not the native
  table.
- **Persistence / profiles.** `BarcodeConfig` accepts an optional `profile`
  extra that Web Kiosk never sets, so a change falls back to the current
  profile. Whether it survives reboot is untested.
- **`nlBarcode` numeric `type` values.** These are separate from config code
  IDs and still come from Newland's Android Mobile Computer API Handbook and
  the on-device `ScanSettings.java` map (e.g. `258 = QRCODE`, `8 = EAN13`).
- **NHub callback spelling.** Confirmed `nlNHubResult` on 2.21; the
  `nlNHubRestult` spelling remains supported for older builds.
- **`Triggermode` versus `TriggerMode`.** 2.21 exposes `TriggerMode`; the resolver
  still accepts `Triggermode` for other builds.
- **Version differences.** `:AUTOFOCUS` is new relative to v2.18, and URL options
  became case-insensitive in 2.18. There is no documented JavaScript API for
  reading the kiosk version.
- **Device information shape.** Confirmed `NGet*` getters on 2.21, with the
  documented property names retained as fallbacks.
- **Beep and LED semantics.** `Beep(int)` and `LED(int)` require an argument;
  `1` and `0` are accepted. The exact audible/visual behavior for each value is
  not documented.
- **NFC payload shape.** Only `nlNFC("NFC", <tagId>)` is confirmed. Whether an
  NDEF-formatted tag delivers a payload at all, and whether a third `status`
  argument ever appears, remain unverified.

## Not implemented

- **NHub** — `useNHub()`, `NHubSend` and the `nlNHubResult` callback are not
  implemented.
- **NQuire** — GPIO and logo LED control are not implemented and are planned to
  be a no-op on non-NQuire devices.

The Web Kiosk User Guide v2.21 used for this implementation is in
`newland-web-kiosk_user-guide_v221.pdf`.

## Inspecting the kiosk with adb

`scripts/adb-inspect.sh` discovers an attached Newland MT90, identifies the Web
Kiosk package, pulls its APKs, extracts text assets and greps DEX strings for
the bridge names the library currently guesses from `plan.md`. It is **read-only
on the device**: it only runs `getprop`, `dumpsys`, `pm list`, `pm path`,
`cat /proc/net/unix` and `adb pull`. It does not install, force-stop or change
any setting.

**Prerequisites**

- `adb` is installed and on `PATH` (Android platform-tools).
- USB debugging is enabled on the MT90 and this computer has been authorized.
- `adb devices -l` shows the device with status `device`, not `unauthorized`.

**Run it**

```bash
npm run adb:inspect
# or
bash scripts/adb-inspect.sh
```

With more than one device attached, select one by serial. The same variables
override the binary when `adb` is not on `PATH`:

```bash
ADB_SERIAL=ABC123456789 bash scripts/adb-inspect.sh
ADB=/opt/platform-tools/adb bash scripts/adb-inspect.sh
```

**What it produces**

- `artifacts/adb-report.txt` — the full report, also printed to the terminal.
- `artifacts/apk/` — every pulled APK, named `<package>__<apk-basename>`.
- `artifacts/apk/<pulled-apk-name-without-.apk>-extracted/` — `assets/*` and
  `res/raw/*` from each pulled APK that contains them.
- DEX string matches for `nlScan`, `nlBarcode`, `nlNFC`, `nlNHub`,
  `TriggerMode`/`Triggermode`, the `NGet*` device-info getters and the scanner
  methods.

`artifacts/` is git-ignored so proprietary APKs and extracted assets are never
committed.

**What to look for**

- The exact `nlScan` method casing, particularly `Triggermode` versus
  `TriggerMode`.
- The real device-information property or getter names (`DeviceModel`,
  `SerialNumber`, and any casing variants).
- Callback names and argument shapes (`nlBarcode`, `nlNFC`, `nlNHubResult`
  versus `nlNHubRestult`).
- Any JavaScript bridge shim in the APK assets that reveals the concrete native
  method and callback contract.

The package list, `dumpsys package` activity/intent-filter output and the
resolved `newlandhttps://example.com` intent also show how the kiosk is launched.

### Runtime probe on the device

For raw runtime values instead of static strings, run:

```bash
python3 scripts/adb-runtime-probe.py
# python3 scripts/adb-runtime-probe.py --serial <serial> --port 8765 --wait 60
```

It serves `spike/auto.html` from the repository on the host, adds a temporary
`adb reverse` mapping, opens the page in `com.nls.nlbrowser` through
`newlandhttp://localhost:<port>/spike/auto.html`, and appends every report to
`artifacts/runtime-probe.jsonl`. A device screenshot is saved to
`artifacts/runtime-probe.png`. The serial is auto-detected; pass `--serial` when
more than one device is attached.

While it runs, scan a barcode or tap **Trigger** on the probe page to capture the
raw `nlBarcode` arguments, and use **Power on/off** or **Beep** to test the other
`nlScan` methods. The page also posts its `nlScan` surface and device-info
results on load, and repeats a heartbeat report after one second.

It does not install or configure anything, and it removes the `adb reverse`
mapping when it exits. If no `hello` report arrives within 15 seconds it prints
activity, focus, logcat and WebView-socket diagnostics before the screenshot.

**Next step: Chrome DevTools**

Find the `webview_devtools_remote` socket in the report, then forward it and
open Chrome DevTools:

```bash
adb forward tcp:9222 localabstract:<socket-name>
# open chrome://inspect in desktop Chrome
```

Alternatively, load `spike/index.html` on the device once the launch URL and
activity are known, and inspect `Object.keys(window.nlScan)` live. Do not paste
or commit proprietary APK contents beyond the specific API names needed.
