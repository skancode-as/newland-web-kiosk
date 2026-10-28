# AGENTS.md

## Project

- React wrapper for the Newland Web Kiosk `window.nlScan` bridge plus the
  page-defined `nlBarcode` / `nlNFC` callbacks.
- Package: `@skancode/newland-web-kiosk`. GitHub org: `skancode-as`, repo
  `newland-web-kiosk`. License: MIT.
- npm publication is manual. The GitHub org and npm scope intentionally differ.
- React `>=18` is a peer dependency. Library at the repo root, demo workspace in
  `demo/`, mock as the `./mock` subpath.

## Commands

```bash
npm install              # install workspace dependencies
npm run dev              # Vite demo on http://localhost:5173
npm test                 # Vitest, single run
npm run test:watch       # Vitest watch mode
npm run typecheck        # tsc --noEmit for the library
npm run typecheck:demo   # tsc -p demo/tsconfig.json
npm run build            # tsup -> dist/
npm run demo:build       # demo typecheck + vite build
```

Completion criteria:

- Library change: `npm test`, `npm run typecheck`, `npm run build`.
- Demo change: also `npm run typecheck:demo` and `npm run demo:build`.
- Packaging change: also `npm pack --dry-run` and `npm publish --dry-run`.
- CI runs the same checks on Node 20 in `.github/workflows/ci.yml`.

## Layout

- `src/core/`: framework-agnostic bridge, registry, parser, device info, symbology.
- `src/react/`: hooks and `KioskProvider`.
- `src/mock/`: separate `./mock` entry; keep it out of the root entry.
- `demo/`: Vite app. `index.html` is the diagnostic harness, `showcase.html` the
  presentation demo, `table-probe.html` the symbology table probe.
- `spike/`: standalone device probes; `spike/auto.html` is used by the runtime probe.
- `scripts/`: read-only adb inspection and runtime probe.
- `test/`: shared setup only; tests live next to the code in `src/**/*.test.*`.

## Bridge invariants (non-negotiable)

- Web Kiosk 2.21 / MT90 matches exact method arity. Zero-arg `Trigger`, `Beep`,
  `LED`, `Power`, `Initialize`, `TriggerMode`, `Timeout`, `Interval`,
  `RepeatInterval`, `Scanmode` and `BarcodeConfig` all throw `Method not found`.
- Pass numeric `1` / `0` for int on/off parameters. The bridge coerces booleans
  to `0`, so `Power(true)` does not turn the scanner on.
- `Stop()` and `NGetModel()` / `NGetSerial()` / `NGetBuild()` /
  `NGetDeviceName()` are zero-arg.
- `Trigger(int)` is a toggle: call `Stop()` first, then `Trigger(timeout ?? 0)`.
  Keep this in `useScanner().trigger`.
- `BarcodeConfig(codeId, property, value)` takes exactly three strings. Values
  are decimal strings (`"1"`, `"0"`, `"5"`) and must never be empty.
- `nlBarcode` is five args with the source first:
  `(source, barcode, symbologyId, symbologyName, status)`. Keep the 4-arg
  compatibility fallback for other builds.
- `nlNFC` is `("NFC", tagUidHex)`. Event `data` is the tag UID, not an NDEF
  payload. Do not invent payload fields.
- `nlNHubResult` is `(result, status, deviceAddress)`. NHub and NQuire remain
  unimplemented.
- On 2.21, device info is exposed as zero-arg methods. Property candidates are
  compatibility fallbacks only.
- Ship both Table A and Table B symbology vocabularies. Do not hardcode the test
  device's Table A into the API. Exact spelling and case are part of the contract.
- Callback globals are page-defined: the kiosk calls them; it does not inject
  them.
- Keep method resolution case-tolerant (`TriggerMode` / `Triggermode`) and
  own-property-only. Never invoke inherited names such as `toString`.
- Keep `window` access SSR-safe. No top-level `window`, `document` or
  `navigator` reads.

## Registry invariants

- One module-level registry owns both `nlBarcode` and `nlNFC`. Install on the
  first subscriber; restore on the last.
- Install `nlNFC` only while at least one NFC subscriber exists. This preserves
  the kiosk's NFC wedge behaviour.
- Do not gate subscriptions on `isKiosk()`. Commands no-op without `nlScan`,
  while subscriptions stay inert. This supports late bridge injection and the mock.
- Chain and preserve existing globals; restore the exact prior value, or delete
  the global if it was absent. Never clobber a handler installed after ours.
- Isolate parse and listener errors so one bad payload cannot break fan-out.
- Keep handler refs in hooks so a re-render does not resubscribe.

## Demo

- `demo/showcase.html` is the presentation app: badge login, scanned SKU, manual
  quantity, recount sheet, single-scan auto-add.
- Demo values are intentional: barcode `5740700982972` maps to
  `Coca-Cola Zero Sugar`; badge `A63F0A84` maps to Andreas V.
- Install the desktop mock before React mounts. On a kiosk, `isKiosk()` is true
  and the mock must be `null`.
- Presenter / Preview controls are desktop-only. Never render them on the kiosk.
- Keep the showcase light and restrained B2B. The diagnostic demo may stay
  technical.
- Demo Vite aliases point at library source; no `dist/` rebuild is needed for
  `npm run dev`.

## Device work

- Device: Newland MT90, Web Kiosk `com.nls.nlbrowser` 2.21, Android 11.
- Do not commit real serials, credentials, or new decompiled vendor data.
- `scripts/adb-inspect.sh` and `scripts/adb-runtime-probe.py` are read-only. They
  may add `adb reverse` and open a URL, but must not force-stop, install, or
  reconfigure the kiosk.
- `artifacts/` is gitignored. Keep it that way.
- WebView DevTools is disabled on the tested build. Gather runtime evidence from
  the probe page's HTTP reports, screenshots, and logcat.
- `newlandhttp://localhost:<port>/...` works via `adb reverse`. Add a unique
  query string when reopening a probe so the WebView fetches a fresh page.
- Use `YOUR_DEVICE_SERIAL` in docs, never a real serial.

## Packaging and release

- `tsup` builds ESM, CJS, and types into `dist`. `files` is `["dist"]`;
  `package.json`, `README.md`, and `LICENSE` are included automatically.
- `prepare` builds for Git installs. `prepublishOnly` runs typecheck, tests, then
  build.
- Manual publish only: `npm login --auth-type=web`, `npm whoami`,
  `npm publish --access public`. Tag the released commit after success.
- Do not add `NPM_TOKEN`, a publish workflow, or a tag-triggered release. Do not
  publish or tag unless the owner asks.
- Keep `artifacts/`, the vendor PDF, `plan.md`, the demo, tests, and source out
  of the npm package.
- Do not rewrite history. The PDF and `plan.md` are intentionally in history per
  the owner's decision, even though both are gitignored.

## Docs map

- `README.md`: public API, confirmed device findings, adb workflow, release steps.
- `plan.md`: internal historical plan; never published.
- `artifacts/nlscan-js-interface.md`: local decompiled bridge evidence; never
  commit or publish.
- `demo/src/showcase.tsx`: editable catalog/badge maps and showcase flow.
- Prefer pointing to the README over duplicating API tables here.
