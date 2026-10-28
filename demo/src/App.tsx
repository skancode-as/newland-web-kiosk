import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  isKiosk,
  useBarcodeScan,
  useDeviceInfo,
  useNfc,
  useScanner,
  type BarcodeScanEvent,
  type NfcEvent,
} from 'newland-web-kiosk';
import { installMockNlScan } from 'newland-web-kiosk/mock';

type MockController = ReturnType<typeof installMockNlScan>;

interface AppProps {
  mock: MockController | null;
}

const LOG_LIMIT = 50;
const CALL_LIMIT = 30;

interface BarcodeLogEntry extends BarcodeScanEvent {
  key: number;
  at: string;
}

interface NfcLogEntry extends NfcEvent {
  key: number;
  at: string;
}

interface Hint {
  ok: boolean;
  text: string;
}

function formatTime(date: Date): string {
  return `${date.toLocaleTimeString([], { hour12: false })}.${String(
    date.getMilliseconds(),
  ).padStart(3, '0')}`;
}

function display(value: string | number | null): string {
  return value === null || value === '' ? '—' : String(value);
}

function previewArgs(args: readonly unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return JSON.stringify(arg);
      }
      if (arg === null || typeof arg === 'number' || typeof arg === 'boolean') {
        return String(arg);
      }
      if (typeof arg === 'undefined') {
        return 'undefined';
      }
      try {
        return JSON.stringify(arg) ?? String(arg);
      } catch {
        return String(arg);
      }
    })
    .join(', ');
}

export default function App({ mock }: AppProps) {
  const scanner = useScanner();
  const device = useDeviceInfo();

  const [kioskDetected, setKioskDetected] = useState(() => isKiosk());

  useEffect(() => {
    setKioskDetected(isKiosk());
  }, []);

  const environment = mock
    ? {
        label: 'Desktop mock',
        tone: 'mock',
        detail: 'Mock nlScan installed before React mounted',
      }
    : kioskDetected
      ? {
          label: 'Web Kiosk device',
          tone: 'kiosk',
          detail: 'Native window.nlScan bridge detected',
        }
      : {
          label: 'Bridge missing',
          tone: 'missing',
          detail: 'No window.nlScan in this browser',
        };

  const barcodeId = useRef(0);
  const nfcId = useRef(0);

  const [barcodes, setBarcodes] = useState<BarcodeLogEntry[]>([]);
  const [nfcEvents, setNfcEvents] = useState<NfcLogEntry[]>([]);

  useBarcodeScan(
    useCallback((event: BarcodeScanEvent) => {
      barcodeId.current += 1;
      const entry: BarcodeLogEntry = {
        ...event,
        key: barcodeId.current,
        at: formatTime(new Date()),
      };
      setBarcodes((current) => [entry, ...current].slice(0, LOG_LIMIT));
    }, []),
  );

  useNfc(
    useCallback((event: NfcEvent) => {
      nfcId.current += 1;
      const entry: NfcLogEntry = {
        ...event,
        key: nfcId.current,
        at: formatTime(new Date()),
      };
      setNfcEvents((current) => [entry, ...current].slice(0, LOG_LIMIT));
    }, []),
  );

  const [triggerMode, setTriggerMode] = useState('0');
  const [timeoutMs, setTimeoutMs] = useState('2000');
  const [scannerMessage, setScannerMessage] = useState<Hint | null>(null);

  const runScannerAction = useCallback((label: string, action: () => boolean) => {
    try {
      const ok = action();
      setScannerMessage({
        ok,
        text: ok ? `${label} sent to the scanner.` : `${label} is not available on this device.`,
      });
    } catch (error) {
      setScannerMessage({
        ok: false,
        text: `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, []);

  const applyTimeout = useCallback(() => {
    const value = Number(timeoutMs);
    if (!Number.isFinite(value) || value <= 0) {
      setScannerMessage({ ok: false, text: 'Enter a positive timeout in milliseconds.' });
      return;
    }
    const rounded = Math.round(value);
    runScannerAction(`Timeout(${rounded})`, () => scanner.setTimeout(rounded));
  }, [runScannerAction, scanner, timeoutMs]);

  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const refreshDevice = useCallback(() => {
    device.refresh();
    setRefreshedAt(formatTime(new Date()));
  }, [device]);

  const [barcodeValue, setBarcodeValue] = useState('');
  const [barcodeSource, setBarcodeSource] = useState('');
  const [barcodeSymbology, setBarcodeSymbology] = useState('');
  const [barcodeSymbologyName, setBarcodeSymbologyName] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState('');
  const [barcodeHint, setBarcodeHint] = useState<Hint | null>(null);

  const [nfcData, setNfcData] = useState('');
  const [nfcType, setNfcType] = useState('');
  const [nfcStatus, setNfcStatus] = useState('');
  const [nfcHint, setNfcHint] = useState<Hint | null>(null);

  const randomBarcode = useCallback(() => {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    setBarcodeValue(`DEMO-${suffix}`);
  }, []);

  const simulateBarcode = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!mock) {
        return;
      }

      const barcode = barcodeValue.trim();
      if (!barcode) {
        setBarcodeHint({ ok: false, text: 'Enter a barcode value first.' });
        return;
      }

      const delivered = mock.simulateBarcodeScan({
        barcode,
        ...(barcodeSource.trim() ? { source: barcodeSource.trim() } : {}),
        ...(barcodeSymbology.trim() ? { symbology: barcodeSymbology.trim() } : {}),
        ...(barcodeSymbologyName.trim()
          ? { symbologyName: barcodeSymbologyName.trim() }
          : {}),
        ...(barcodeStatus.trim() ? { status: barcodeStatus.trim() } : {}),
      });

      setBarcodeHint({
        ok: delivered,
        text: delivered
          ? 'Delivered to the active useBarcodeScan subscriber.'
          : 'No barcode subscriber is active. Check that the demo is mounted.',
      });
    },
    [
      barcodeSource,
      barcodeStatus,
      barcodeSymbology,
      barcodeSymbologyName,
      barcodeValue,
      mock,
    ],
  );

  const simulateNfc = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!mock) {
        return;
      }

      const data = nfcData.trim();
      if (!data) {
        setNfcHint({ ok: false, text: 'Enter tag data first.' });
        return;
      }

      const delivered = mock.simulateNfcScan({
        data,
        ...(nfcType.trim() ? { type: nfcType.trim() } : {}),
        ...(nfcStatus.trim() ? { status: nfcStatus.trim() } : {}),
      });

      setNfcHint({
        ok: delivered,
        text: delivered
          ? 'Delivered to the active useNfc subscriber.'
          : 'No NFC subscriber is active. Check that the demo is mounted.',
      });
    },
    [mock, nfcData, nfcStatus, nfcType],
  );

  const recentCalls = mock ? mock.calls.slice(-CALL_LIMIT).reverse() : [];

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">newland-web-kiosk</p>
          <h1>Web Kiosk hardware harness</h1>
          <p className="hero__copy">
            Live scanner, NFC and device controls for the Newland Web Kiosk bridge. On a desktop
            browser the page runs against an in-memory mock.
          </p>
        </div>
        <div className={`environment environment--${environment.tone}`}>
          <span className="environment__label">{environment.label}</span>
          <span className="environment__detail">{environment.detail}</span>
        </div>
      </header>

      <div className="layout">
        <section className="panel" aria-labelledby="device-heading">
          <div className="panel__head">
            <div>
              <h2 id="device-heading">Device</h2>
              <p className="panel__hint">
                {device.isSupported ? 'Read from the nlScan surface.' : 'Device info unavailable.'}
              </p>
            </div>
            <button
              className="button button--ghost"
              type="button"
              onClick={refreshDevice}
              disabled={!device.isSupported}
            >
              Refresh
            </button>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Model</dt>
              <dd>{display(device.model)}</dd>
            </div>
            <div>
              <dt>Serial number</dt>
              <dd className="mono">{display(device.serialNumber)}</dd>
            </div>
            <div>
              <dt>Build</dt>
              <dd className="mono">{display(device.buildNumber)}</dd>
            </div>
            <div>
              <dt>Device name</dt>
              <dd>{display(device.deviceName)}</dd>
            </div>
          </dl>

          {refreshedAt ? (
            <p className="panel__footnote">Refreshed at {refreshedAt}</p>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="scanner-heading">
          <div className="panel__head">
            <div>
              <h2 id="scanner-heading">Scanner controls</h2>
              <p className="panel__hint">
                {scanner.isSupported
                  ? 'Commands are forwarded to window.nlScan.'
                  : 'No bridge detected; controls are inert.'}
              </p>
            </div>
            <span className={`pill ${scanner.isSupported ? 'pill--ok' : 'pill--off'}`}>
              {scanner.isSupported ? 'Ready' : 'Unsupported'}
            </span>
          </div>

          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('Power(true)', () => scanner.power(true))}
            >
              Power on
            </button>
            <button
              className="button"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('Power(false)', () => scanner.power(false))}
            >
              Power off
            </button>
            <button
              className="button"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('Trigger()', () => scanner.trigger())}
            >
              Trigger
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('Stop()', () => scanner.stop())}
            >
              Stop
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('Initialize()', () => scanner.initialize())}
            >
              Initialize
            </button>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="trigger-mode">Trigger mode</label>
              <select
                id="trigger-mode"
                value={triggerMode}
                disabled={!scanner.isSupported}
                onChange={(event) => setTriggerMode(event.target.value)}
              >
                <option value="0">Mode 0</option>
                <option value="1">Mode 1</option>
                <option value="2">Mode 2</option>
                <option value="3">Mode 3</option>
              </select>
            </div>
            <div className="field field--action">
              <button
                className="button button--ghost"
                type="button"
                disabled={!scanner.isSupported}
                onClick={() =>
                  runScannerAction(`TriggerMode(${triggerMode})`, () =>
                    scanner.setTriggerMode(Number(triggerMode)),
                  )
                }
              >
                Apply mode
              </button>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="timeout">Timeout (ms)</label>
              <input
                id="timeout"
                type="number"
                min={1}
                step={100}
                value={timeoutMs}
                disabled={!scanner.isSupported}
                onChange={(event) => setTimeoutMs(event.target.value)}
              />
            </div>
            <div className="field field--action">
              <button
                className="button button--ghost"
                type="button"
                disabled={!scanner.isSupported}
                onClick={applyTimeout}
              >
                Apply timeout
              </button>
            </div>
          </div>

          <div className="button-row">
            <button
              className="button button--ghost"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('Beep()', () => scanner.beep())}
            >
              Beep
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('LED(true)', () => scanner.led(true))}
            >
              LED on
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={!scanner.isSupported}
              onClick={() => runScannerAction('LED(false)', () => scanner.led(false))}
            >
              LED off
            </button>
          </div>

          {scannerMessage ? (
            <p
              className={`message ${scannerMessage.ok ? 'message--ok' : 'message--warn'}`}
              role="status"
            >
              {scannerMessage.text}
            </p>
          ) : null}
        </section>

        <section className="panel panel--wide" aria-labelledby="barcode-log-heading">
          <div className="panel__head">
            <div>
              <h2 id="barcode-log-heading">Barcode events</h2>
              <p className="panel__hint">
                Newest first, capped at {LOG_LIMIT} entries. Values come from the normalized event.
              </p>
            </div>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setBarcodes([])}
              disabled={barcodes.length === 0}
            >
              Clear
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Barcode</th>
                  <th scope="col">Source</th>
                  <th scope="col">Symbology</th>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {barcodes.length === 0 ? (
                  <tr>
                    <td className="empty-cell" colSpan={6}>
                      No barcode events yet. Scan a code or use the simulator.
                    </td>
                  </tr>
                ) : (
                  barcodes.map((entry) => (
                    <tr key={entry.key}>
                      <td className="mono muted">{entry.at}</td>
                      <td className="mono strong">{entry.barcode}</td>
                      <td className="mono">{display(entry.source)}</td>
                      <td className="mono">{display(entry.symbology)}</td>
                      <td>{display(entry.symbologyName)}</td>
                      <td className="mono">{display(entry.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel panel--wide" aria-labelledby="nfc-log-heading">
          <div className="panel__head">
            <div>
              <h2 id="nfc-log-heading">NFC events</h2>
              <p className="panel__hint">
                Newest first, capped at {LOG_LIMIT} entries. useNfc installs nlNFC while mounted.
              </p>
            </div>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setNfcEvents([])}
              disabled={nfcEvents.length === 0}
            >
              Clear
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Data</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {nfcEvents.length === 0 ? (
                  <tr>
                    <td className="empty-cell" colSpan={4}>
                      No NFC events yet. Tap a tag or use the simulator.
                    </td>
                  </tr>
                ) : (
                  nfcEvents.map((entry) => (
                    <tr key={entry.key}>
                      <td className="mono muted">{entry.at}</td>
                      <td className="mono strong">{entry.data}</td>
                      <td>{display(entry.type)}</td>
                      <td className="mono">{display(entry.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {mock ? (
          <section className="panel panel--wide" aria-labelledby="mock-heading">
            <div className="panel__head">
              <div>
                <h2 id="mock-heading">Desktop simulator</h2>
                <p className="panel__hint">
                  Feeds synthetic callbacks into the live subscriptions installed by the hooks.
                </p>
              </div>
            </div>

            <div className="sim-grid">
              <form className="sim-card" onSubmit={simulateBarcode}>
                <h3>Simulate barcode</h3>
                <div className="field">
                  <label htmlFor="sim-barcode">Barcode</label>
                  <input
                    id="sim-barcode"
                    value={barcodeValue}
                    placeholder="e.g. 0123456789012"
                    onChange={(event) => setBarcodeValue(event.target.value)}
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="sim-source">Source (optional)</label>
                    <input
                      id="sim-source"
                      value={barcodeSource}
                      placeholder="internal or MAC"
                      onChange={(event) => setBarcodeSource(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sim-symbology">Symbology (optional)</label>
                    <input
                      id="sim-symbology"
                      value={barcodeSymbology}
                      placeholder="e.g. 12"
                      onChange={(event) => setBarcodeSymbology(event.target.value)}
                    />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="sim-symbology-name">Name (optional)</label>
                    <input
                      id="sim-symbology-name"
                      value={barcodeSymbologyName}
                      placeholder="e.g. EAN-13"
                      onChange={(event) => setBarcodeSymbologyName(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sim-status">Status (optional)</label>
                    <input
                      id="sim-status"
                      value={barcodeStatus}
                      placeholder="e.g. 0"
                      onChange={(event) => setBarcodeStatus(event.target.value)}
                    />
                  </div>
                </div>
                <div className="button-row">
                  <button className="button" type="submit">
                    Simulate scan
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={randomBarcode}
                  >
                    Random barcode
                  </button>
                </div>
                {barcodeHint ? (
                  <p
                    className={`message ${barcodeHint.ok ? 'message--ok' : 'message--warn'}`}
                    role="status"
                  >
                    {barcodeHint.text}
                  </p>
                ) : null}
              </form>

              <form className="sim-card" onSubmit={simulateNfc}>
                <h3>Simulate NFC</h3>
                <div className="field">
                  <label htmlFor="sim-nfc-data">Tag data</label>
                  <input
                    id="sim-nfc-data"
                    value={nfcData}
                    placeholder="e.g. 04A2B3C4D5"
                    onChange={(event) => setNfcData(event.target.value)}
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="sim-nfc-type">Type (optional)</label>
                    <input
                      id="sim-nfc-type"
                      value={nfcType}
                      placeholder="e.g. NDEF"
                      onChange={(event) => setNfcType(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sim-nfc-status">Status (optional)</label>
                    <input
                      id="sim-nfc-status"
                      value={nfcStatus}
                      placeholder="e.g. 0"
                      onChange={(event) => setNfcStatus(event.target.value)}
                    />
                  </div>
                </div>
                <div className="button-row">
                  <button className="button" type="submit">
                    Simulate tag
                  </button>
                </div>
                {nfcHint ? (
                  <p
                    className={`message ${nfcHint.ok ? 'message--ok' : 'message--warn'}`}
                    role="status"
                  >
                    {nfcHint.text}
                  </p>
                ) : null}
              </form>
            </div>

            <details className="calls">
              <summary>Mock method calls ({mock.calls.length})</summary>
              {recentCalls.length === 0 ? (
                <p className="panel__footnote">No calls recorded yet.</p>
              ) : (
                <ol className="call-list">
                  {recentCalls.map((call, index) => (
                    <li key={`${call.at}-${call.method}-${index}`}>
                      <span className="mono muted">{formatTime(new Date(call.at))}</span>
                      <span className="mono strong">{call.method}</span>
                      <code>({previewArgs(call.args)})</code>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </section>
        ) : null}
      </div>
    </div>
  );
}
