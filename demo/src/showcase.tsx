import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, Ref } from 'react';
import { createRoot } from 'react-dom/client';
import {
  KioskProvider,
  isKiosk,
  useBarcodeScan,
  useDeviceInfo,
  useNfc,
  useScanner,
  type BarcodeScanEvent,
  type NfcEvent,
} from '@scancode-as/newland-web-kiosk';
import { installMockNlScan } from '@scancode-as/newland-web-kiosk/mock';
import type { MockNlScanController } from '@scancode-as/newland-web-kiosk/mock';
import './showcase.css';

/* -------------------------------------------------------------------------- */
/* Editable demo data                                                         */
/* -------------------------------------------------------------------------- */

interface CatalogItem {
  name: string;
}

interface BadgeRecord {
  name: string;
  role: string;
}

// Keys are the exact decoded barcode strings. In this flow the scanned code is
// the SKU shown on the recount sheet.
const PRODUCT_CATALOG: Readonly<Record<string, CatalogItem>> = {
  '5740700982972': { name: 'Coca-Cola Zero Sugar' },
  '9799234564211': { name: 'Field Operations Handbook' },
  '9778322613451': { name: 'Quarterly Logistics Review' },
  '2112345678917': { name: 'MT90 Spare Battery Pack' },
  '24561239': { name: 'Handheld Trigger Grip' },
};

// Keys are normalized (uppercase, whitespace-free) NFC tag UIDs.
const BADGES: Readonly<Record<string, BadgeRecord>> = {
  A63F0A84: { name: 'Andreas V', role: 'Product Engineer' },
};

const KNOWN_BADGE_UID = 'A63F0A84';
const UNKNOWN_BADGE_UID = 'DEADBEEF';
const KNOWN_BARCODE = '5740700982972';
const UNKNOWN_BARCODE = '0000000000000';
const UNCATALOGUED_LABEL = 'Uncatalogued SKU';

/* -------------------------------------------------------------------------- */
/* Types and helpers                                                          */
/* -------------------------------------------------------------------------- */

interface ShowcaseProps {
  mock: MockNlScanController | null;
}

type Phase = 'locked' | 'counting' | 'complete';
type FeedbackTone = 'info' | 'success' | 'warning' | 'error';
type StatusTone = 'ready' | 'preview' | 'offline';

interface Employee {
  name: string;
  role: string;
  badgeUid: string;
}

interface CountLine {
  id: number;
  sku: string;
  name: string;
  known: boolean;
  quantity: number;
}

interface Feedback {
  message: string;
  tone: FeedbackTone;
}

interface RecountState {
  phase: Phase;
  employee: Employee | null;
  counts: readonly CountLine[];
  sku: string;
  quantity: string;
  feedback: Feedback | null;
  barcodeFlash: number;
  focusToken: number;
  nextId: number;
  completedAt: Date | null;
  lastCountAt: Date | null;
}

function createInitialState(): RecountState {
  return {
    phase: 'locked',
    employee: null,
    counts: [],
    sku: '',
    quantity: '',
    feedback: null,
    barcodeFlash: 0,
    focusToken: 0,
    nextId: 1,
    completedAt: null,
    lastCountAt: null,
  };
}

function lookupProduct(sku: string): CatalogItem | null {
  return Object.prototype.hasOwnProperty.call(PRODUCT_CATALOG, sku)
    ? PRODUCT_CATALOG[sku]
    : null;
}

function lookupBadge(uid: string): BadgeRecord | null {
  return Object.prototype.hasOwnProperty.call(BADGES, uid)
    ? BADGES[uid]
    : null;
}

function normalizeBadgeUid(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function withFeedback(
  current: RecountState,
  message: string,
  tone: FeedbackTone,
): RecountState {
  return {
    ...current,
    feedback: { message, tone },
  };
}

function totalUnits(counts: readonly CountLine[]): number {
  return counts.reduce((sum, line) => sum + line.quantity, 0);
}

function unitsLabel(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
}

function summaryLabel(lines: number, units: number): string {
  return `${lines} ${lines === 1 ? 'line' : 'lines'} · ${units} ${
    units === 1 ? 'unit' : 'units'
  }`;
}

/**
 * Adds a counted quantity to a SKU, merging into an existing line.
 *
 * Shared by the manual form and single-scan mode so both paths use the same
 * catalog lookup, duplicate merge and feedback rules. The returned state
 * clears the pending SKU/quantity and advances the focus token; callers that
 * must not focus the quantity input keep their own mode check in the effect.
 */
function applyCount(
  current: RecountState,
  sku: string,
  quantity: number,
  at: Date,
): RecountState {
  if (current.phase !== 'counting') {
    return current;
  }

  const product = lookupProduct(sku);
  const known = product !== null;
  const name = product?.name ?? UNCATALOGUED_LABEL;
  const label = known ? name : `${name} ${sku}`;
  const tone: FeedbackTone = known ? 'success' : 'warning';
  const existing = current.counts.find((line) => line.sku === sku);

  if (existing !== undefined) {
    const updatedQuantity = existing.quantity + quantity;
    const counts = current.counts.map((line) =>
      line.sku === sku ? { ...line, quantity: updatedQuantity } : line,
    );

    return withFeedback(
      {
        ...current,
        counts,
        sku: '',
        quantity: '',
        focusToken: current.focusToken + 1,
        lastCountAt: at,
      },
      `Added ${label} · ${unitsLabel(quantity)} (total ${updatedQuantity}).`,
      tone,
    );
  }

  const id = current.nextId;
  const line: CountLine = {
    id,
    sku,
    name,
    known,
    quantity,
  };

  return withFeedback(
    {
      ...current,
      counts: [...current.counts, line],
      sku: '',
      quantity: '',
      nextId: id + 1,
      focusToken: current.focusToken + 1,
      lastCountAt: at,
    },
    `Added ${label} · ${unitsLabel(quantity)} (total ${quantity}).`,
    tone,
  );
}

function formatClock(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

interface IconProps {
  size?: number;
}

function NfcIcon({ size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <path d="M9 9.4a4.2 4.2 0 0 1 0 5.2" />
      <path d="M12.4 7a8.2 8.2 0 0 1 0 10" />
      <path d="M15.8 4.6a12.2 12.2 0 0 1 0 14.8" />
    </svg>
  );
}

function CheckIcon({ size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

function RemoveIcon({ size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 7h16" />
      <path d="M9.5 7V5h5v2" />
      <path d="m6.5 7 1 12h9l1-12" />
      <path d="M10.5 11v4" />
      <path d="M13.5 11v4" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Presentation pieces                                                        */
/* -------------------------------------------------------------------------- */

function FeedbackLine({
  feedback,
  center = false,
}: {
  feedback: Feedback | null;
  center?: boolean;
}) {
  return (
    <p
      className={`feedback feedback--${feedback?.tone ?? 'idle'}${
        center ? ' feedback--center' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {feedback?.message ?? ''}
    </p>
  );
}

function CompletionBlock({
  counts,
  completedAt,
  onStartNew,
  startButtonRef,
}: {
  counts: readonly CountLine[];
  completedAt: Date | null;
  onStartNew: () => void;
  startButtonRef: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="complete">
      <div
        className="complete__summary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="complete__icon" aria-hidden="true">
          <CheckIcon size={20} />
        </span>
        <h2 className="complete__title">Recount complete</h2>
        <p className="complete__totals">
          {summaryLabel(counts.length, totalUnits(counts))}
        </p>
        <p className="complete__time">
          {completedAt === null
            ? ''
            : `Completed at ${formatClock(completedAt)}`}
        </p>
      </div>
      <button
        ref={startButtonRef}
        type="button"
        className="button button--primary button--block"
        onClick={onStartNew}
      >
        Start new recount
      </button>
    </div>
  );
}

function Presenter({
  open,
  onClose,
  onKnownBadge,
  onUnknownBadge,
  onKnownSku,
  onUnknownSku,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  onKnownBadge: () => void;
  onUnknownBadge: () => void;
  onKnownSku: () => void;
  onUnknownSku: () => void;
  onReset: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside
      id="presenter-panel"
      className="presenter"
      aria-label="Desktop preview controls"
    >
      <div className="presenter__head">
        <h2>Desktop preview</h2>
        <button
          type="button"
          className="presenter__close"
          onClick={onClose}
          aria-label="Close preview controls"
        >
          ×
        </button>
      </div>
      <div className="presenter__list">
        <button type="button" className="presenter__item" onClick={onKnownBadge}>
          <span className="presenter__label">Known badge</span>
          <code className="presenter__code">{KNOWN_BADGE_UID}</code>
          <kbd>B</kbd>
        </button>
        <button
          type="button"
          className="presenter__item"
          onClick={onUnknownBadge}
        >
          <span className="presenter__label">Unknown badge</span>
          <code className="presenter__code">{UNKNOWN_BADGE_UID}</code>
        </button>
        <button type="button" className="presenter__item" onClick={onKnownSku}>
          <span className="presenter__label">Known SKU</span>
          <code className="presenter__code">{KNOWN_BARCODE}</code>
          <kbd>S</kbd>
        </button>
        <button type="button" className="presenter__item" onClick={onUnknownSku}>
          <span className="presenter__label">Unknown SKU</span>
          <code className="presenter__code">{UNKNOWN_BARCODE}</code>
        </button>
        <button
          type="button"
          className="presenter__item presenter__item--reset"
          onClick={onReset}
        >
          <span className="presenter__label">Start new recount</span>
          <kbd>R</kbd>
        </button>
      </div>
      <p className="presenter__hint">
        Shortcuts work while this panel is open.
      </p>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Showcase                                                                   */
/* -------------------------------------------------------------------------- */

export function Showcase({ mock }: ShowcaseProps) {
  const scanner = useScanner();
  const device = useDeviceInfo();
  const [state, setState] = useState<RecountState>(createInitialState);
  const [singleScan, setSingleScan] = useState(false);
  const [presenterOpen, setPresenterOpen] = useState(false);
  const skuRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const startNewRef = useRef<HTMLButtonElement>(null);

  useBarcodeScan(
    useCallback(
      (event: BarcodeScanEvent) => {
        const sku = event.barcode.trim();
        if (sku === '') {
          return;
        }

        const at = new Date();

        setState((current) => {
          if (current.phase === 'complete') {
            return withFeedback(
              current,
              'Start a new recount before scanning.',
              'warning',
            );
          }

          if (current.phase !== 'counting') {
            return withFeedback(
              current,
              'Tap an employee badge before scanning.',
              'warning',
            );
          }

          if (singleScan) {
            return {
              ...applyCount(current, sku, 1, at),
              barcodeFlash: current.barcodeFlash + 1,
            };
          }

          const product = lookupProduct(sku);
          const next: RecountState = {
            ...current,
            barcodeFlash: current.barcodeFlash + 1,
            sku,
            quantity: '',
            focusToken: current.focusToken + 1,
          };

          if (current.quantity.trim() !== '') {
            return withFeedback(
              next,
              product
                ? `Scanned ${product.name}. Previous unsubmitted quantity was cleared.`
                : `Scanned uncatalogued SKU ${sku}. Previous unsubmitted quantity was cleared.`,
              'warning',
            );
          }

          if (product !== null) {
            return withFeedback(
              next,
              `Scanned ${product.name}. Enter the counted quantity.`,
              'success',
            );
          }

          return withFeedback(
            next,
            `${UNCATALOGUED_LABEL}: ${sku}. It will be counted and labelled.`,
            'warning',
          );
        });
      },
      [singleScan],
    ),
  );

  useNfc(
    useCallback((event: NfcEvent) => {
      const uid = normalizeBadgeUid(event.data);
      if (uid === '') {
        return;
      }

      setState((current) => {
        if (current.phase === 'counting') {
          return withFeedback(
            current,
            `Already signed in as ${current.employee?.name ?? 'the current employee'}.`,
            'warning',
          );
        }

        if (current.phase === 'complete') {
          return withFeedback(
            current,
            'Start a new recount before tapping a badge.',
            'warning',
          );
        }

        const badge = lookupBadge(uid);
        if (badge === null) {
          return withFeedback(current, 'Badge not recognized.', 'error');
        }

        return withFeedback(
          {
            ...current,
            phase: 'counting',
            employee: {
              name: badge.name,
              role: badge.role,
              badgeUid: uid,
            },
            sku: '',
            quantity: '',
          },
          `Welcome, ${badge.name}. Scan a SKU.`,
          'success',
        );
      });
    }, []),
  );

  const handleQuantityChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setState((current) =>
        current.phase === 'counting'
          ? { ...current, quantity: value }
          : current,
      );
    },
    [],
  );

  const handleSingleScanChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const enabled = event.target.checked;
      setSingleScan(enabled);
      setState((current) =>
        current.phase === 'counting'
          ? { ...current, quantity: '' }
          : current,
      );
    },
    [],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const at = new Date();

      setState((current) => {
        if (current.phase !== 'counting' || singleScan) {
          return current;
        }

        const sku = current.sku.trim();
        const rawQuantity = current.quantity.trim();

        if (sku === '') {
          return withFeedback(
            current,
            'Scan a SKU before adding a count.',
            'warning',
          );
        }

        if (rawQuantity === '') {
          return withFeedback(
            current,
            'Enter a quantity before adding to the recount.',
            'error',
          );
        }

        const quantity = Number(rawQuantity);
        if (!Number.isInteger(quantity) || quantity < 0) {
          return withFeedback(
            current,
            'Quantity must be a whole number of 0 or more.',
            'error',
          );
        }

        return applyCount(current, sku, quantity, at);
      });
    },
    [singleScan],
  );

  const handleRemove = useCallback((id: number) => {
    setState((current) => {
      if (current.phase !== 'counting') {
        return current;
      }

      const line = current.counts.find((entry) => entry.id === id);
      if (line === undefined) {
        return current;
      }

      return withFeedback(
        {
          ...current,
          counts: current.counts.filter((entry) => entry.id !== id),
        },
        `Removed ${line.sku} from the recount.`,
        'info',
      );
    });
  }, []);

  const handleFinish = useCallback(() => {
    setState((current) => {
      if (current.phase !== 'counting' || current.counts.length === 0) {
        return current;
      }

      return {
        ...current,
        phase: 'complete',
        completedAt: new Date(),
        sku: '',
        quantity: '',
        feedback: null,
        focusToken: 0,
      };
    });
  }, []);

  const handleStartNew = useCallback(() => {
    setState(createInitialState());
  }, []);

  useEffect(() => {
    if (state.phase === 'counting' && state.focusToken > 0 && !singleScan) {
      quantityRef.current?.focus();
    }
  }, [state.phase, state.focusToken, singleScan]);

  useEffect(() => {
    if (state.phase === 'complete') {
      startNewRef.current?.focus();
    }
  }, [state.phase]);

  useEffect(() => {
    const input = skuRef.current;
    if (state.barcodeFlash === 0 || input === null) {
      return;
    }

    input.classList.remove('is-flash');
    void input.offsetWidth;
    input.classList.add('is-flash');
    const timer = window.setTimeout(() => {
      input.classList.remove('is-flash');
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state.barcodeFlash]);

  const simulateKnownBadge = useCallback(() => {
    mock?.simulateNfcScan({
      data: 'NFC',
      type: KNOWN_BADGE_UID,
      status: '',
    });
  }, [mock]);

  const simulateUnknownBadge = useCallback(() => {
    mock?.simulateNfcScan({
      data: 'NFC',
      type: UNKNOWN_BADGE_UID,
      status: '',
    });
  }, [mock]);

  const simulateKnownSku = useCallback(() => {
    mock?.simulateBarcodeScan({
      barcode: KNOWN_BARCODE,
      symbology: 8,
      symbologyName: 'EAN13',
      status: 'ok',
    });
  }, [mock]);

  const simulateUnknownSku = useCallback(() => {
    mock?.simulateBarcodeScan({
      barcode: UNKNOWN_BARCODE,
      symbology: 8,
      symbologyName: 'EAN13',
      status: 'ok',
    });
  }, [mock]);

  useEffect(() => {
    if (!presenterOpen || mock === null) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          simulateKnownBadge();
          break;
        case 's':
          event.preventDefault();
          simulateKnownSku();
          break;
        case 'r':
          event.preventDefault();
          handleStartNew();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mock,
    presenterOpen,
    handleStartNew,
    simulateKnownBadge,
    simulateKnownSku,
  ]);

  const desktopPreview = mock !== null;
  const scannerReady = scanner.isSupported || device.isSupported;
  const statusTone: StatusTone = desktopPreview
    ? 'preview'
    : scannerReady
      ? 'ready'
      : 'offline';
  const statusLabel = desktopPreview
    ? 'Desktop preview'
    : scannerReady
      ? 'Scanner ready'
      : 'Scanner unavailable';
  const deviceLabel = [device.model, device.serialNumber]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  const lines = state.counts.length;
  const units = totalUnits(state.counts);
  const formLocked = state.phase === 'locked';
  const isCounting = state.phase === 'counting';
  const employee = state.employee;
  const scannedProduct = state.sku === '' ? null : lookupProduct(state.sku);
  const skuHint =
    state.sku === ''
      ? ''
      : scannedProduct !== null
        ? scannedProduct.name
        : UNCATALOGUED_LABEL;

  return (
    <div className="showcase">
      <header className="topbar">
        <div className="topbar__inner">
          <div>
            <p className="brand">Newland</p>
            <h1>Stock Recount</h1>
            <p className="topbar__instruction">
              Tap a badge, scan a SKU, then enter the counted quantity.
            </p>
          </div>
          <div className="topbar__meta">
            <span className={`status status--${statusTone}`}>
              <span className="status__dot" aria-hidden="true" />
              {statusLabel}
            </span>
            {employee !== null && (
              <span className="employee-chip">
                <span className="avatar" aria-hidden="true">
                  {initials(employee.name)}
                </span>
                <span className="employee-chip__name">{employee.name}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="showcase__main">
        <div className="layout">
          <section className="card" aria-label="Count entry">
            <div
              className={`card__body${
                formLocked ? ' card__body--prompt' : ''
              }`}
            >
              {formLocked && (
                <>
                  <div className="locked">
                    <span className="locked__icon" aria-hidden="true">
                      <NfcIcon size={24} />
                    </span>
                    <h2 className="locked__title">Recount locked</h2>
                    <p className="locked__text">
                      Tap an employee badge to begin.
                    </p>
                  </div>
                  <FeedbackLine feedback={state.feedback} center />
                </>
              )}

              {state.phase === 'counting' && (
                <>
                  {employee !== null && (
                    <div className="employee-row">
                      <span className="avatar avatar--lg" aria-hidden="true">
                        {initials(employee.name)}
                      </span>
                      <div>
                        <p className="employee-row__name">{employee.name}</p>
                        <p className="employee-row__role">{employee.role}</p>
                      </div>
                    </div>
                  )}

                  <div className="mode-row">
                    <div className="mode-row__text">
                      <label className="mode-row__label" htmlFor="single-scan">
                        Single scan
                      </label>
                      <p className="mode-row__hint" id="single-scan-hint">
                        Quantity 1 · auto-adds after each scan
                      </p>
                    </div>
                    <input
                      id="single-scan"
                      className="switch"
                      type="checkbox"
                      role="switch"
                      checked={singleScan}
                      aria-checked={singleScan}
                      aria-describedby="single-scan-hint"
                      onChange={handleSingleScanChange}
                    />
                  </div>

                  <form className="form" onSubmit={handleSubmit} noValidate>
                    <div className="field">
                      <label className="field__label" htmlFor="sku-input">
                        SKU
                      </label>
                      <input
                        ref={skuRef}
                        id="sku-input"
                        className="input input--sku"
                        type="text"
                        value={state.sku}
                        readOnly
                        placeholder="Scan barcode"
                        aria-describedby="sku-hint"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <p
                        id="sku-hint"
                        className={`field__hint${
                          state.sku !== '' && scannedProduct === null
                            ? ' field__hint--warning'
                            : ''
                        }`}
                      >
                        {skuHint}
                      </p>
                    </div>

                    <div className="field">
                      <label className="field__label" htmlFor="quantity-input">
                        Quantity
                      </label>
                      <input
                        ref={quantityRef}
                        id="quantity-input"
                        className="input input--qty"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={singleScan ? '1' : state.quantity}
                        onChange={handleQuantityChange}
                        disabled={singleScan}
                        placeholder="0"
                        autoComplete="off"
                        aria-describedby={
                          singleScan ? 'quantity-hint' : undefined
                        }
                      />
                      {singleScan && (
                        <p id="quantity-hint" className="field__hint">
                          Fixed at 1 in single-scan mode.
                        </p>
                      )}
                    </div>

                    {!singleScan && (
                      <button
                        type="submit"
                        className="button button--primary button--block"
                        disabled={state.sku === ''}
                      >
                        Add count
                      </button>
                    )}
                  </form>

                  <FeedbackLine feedback={state.feedback} />
                </>
              )}

              {state.phase === 'complete' && (
                <>
                  <CompletionBlock
                    counts={state.counts}
                    completedAt={state.completedAt}
                    onStartNew={handleStartNew}
                    startButtonRef={startNewRef}
                  />
                  <FeedbackLine feedback={state.feedback} center />
                </>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="sheet-title">
            <header className="card__head">
              <h2 id="sheet-title">Recount sheet</h2>
              <p className="sheet-totals">{summaryLabel(lines, units)}</p>
            </header>

            {state.counts.length === 0 ? (
              <p className="empty">No items counted yet.</p>
            ) : (
              <div className="sheet-scroll">
                <table className="table">
                  <caption className="sr-only">
                    Recount sheet: SKU, item, quantity and remove action.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">SKU</th>
                      <th scope="col">Item</th>
                      <th scope="col" className="table__qty">
                        Qty
                      </th>
                      {isCounting && (
                        <th scope="col" className="table__remove">
                          <span className="sr-only">Remove</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {state.counts.map((line) => (
                      <tr key={line.id}>
                        <td className="table__sku">{line.sku}</td>
                        <td
                          className={
                            line.known ? undefined : 'table__unknown'
                          }
                        >
                          {line.name}
                        </td>
                        <td className="table__qty">{line.quantity}</td>
                        {isCounting && (
                          <td className="table__remove">
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => handleRemove(line.id)}
                              aria-label={`Remove ${line.sku} from the recount`}
                            >
                              <RemoveIcon size={17} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {state.phase !== 'complete' && (
              <div className="card__foot">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleFinish}
                  disabled={!isCounting || lines === 0}
                >
                  Finish recount
                </button>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <p className="footer__device">
            {deviceLabel === '' ? 'Device info unavailable' : deviceLabel}
          </p>
          {desktopPreview && (
            <button
              type="button"
              className="footer__preview"
              onClick={() => setPresenterOpen((open) => !open)}
              aria-expanded={presenterOpen}
              aria-controls={presenterOpen ? 'presenter-panel' : undefined}
            >
              Preview
            </button>
          )}
        </div>
      </footer>

      {mock !== null && (
        <Presenter
          open={presenterOpen}
          onClose={() => setPresenterOpen(false)}
          onKnownBadge={simulateKnownBadge}
          onUnknownBadge={simulateUnknownBadge}
          onKnownSku={simulateKnownSku}
          onUnknownSku={simulateUnknownSku}
          onReset={handleStartNew}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                      */
/* -------------------------------------------------------------------------- */

const mock = isKiosk()
  ? null
  : installMockNlScan({
      deviceInfo: {
        model: 'NLS-MT90 (desktop mock)',
        serialNumber: 'MOCK-0001',
        buildNumber: '2.21-mock',
        deviceName: 'Showcase Preview',
      },
    });

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element "#root" was not found.');
}

createRoot(container).render(
  <StrictMode>
    <KioskProvider power={true}>
      <Showcase mock={mock} />
    </KioskProvider>
  </StrictMode>,
);
