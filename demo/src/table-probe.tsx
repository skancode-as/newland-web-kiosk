import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useScanner } from "newland-web-kiosk";

/**
 * Standalone probe for the active native BarcodeConfig table.
 *
 * It deliberately does not use KioskProvider: only `useScanner` is needed, and
 * no extra initialization should run before the probe. `BarcodeConfig` is void
 * on the JS side, so the boolean below only says whether the bridge call was
 * dispatched. The native logcat line
 * `CommonScanAdapter: Set code params ... res:=<n>` is the real verdict.
 *
 * Both code IDs are written with their own table's default ("1", enabled), so
 * whichever table is active, the accepted call is a no-op and the test does not
 * change scanner configuration.
 */

const STEP_DELAY_MS = 1000;

const CODE_ID_TABLE_A = "CODABAR";
const CODE_ID_TABLE_B = "CODEBAR";
const PROPERTY = "Enable";
// `Enable` defaults to "1" in both tables (see
// artifacts/newland/barcode-config-tables.json).
const DEFAULT_VALUE = "1";

type StepState = "pending" | "running" | "done";

interface StepResult {
  id: string;
  label: string;
  detail: string;
  state: StepState;
  result?: boolean;
}

function initialSteps(): StepResult[] {
  return [
    {
      id: "power-on",
      label: "1. power(1)",
      detail: "Power the scan engine on before configuring it.",
      state: "pending",
    },
    {
      id: "table-a",
      label: `2. configureSymbology("${CODE_ID_TABLE_A}", "${PROPERTY}", "${DEFAULT_VALUE}")`,
      detail: "Table A (EngineSettingCodeEN) code ID for Codabar.",
      state: "pending",
    },
    {
      id: "table-b",
      label: `3. configureSymbology("${CODE_ID_TABLE_B}", "${PROPERTY}", "${DEFAULT_VALUE}")`,
      detail: "Table B (EngineSettingCode_Industry2EN) code ID for Codabar.",
      state: "pending",
    },
    {
      id: "power-off",
      label: "4. power(0)",
      detail: "Power the scan engine back off.",
      state: "pending",
    },
  ];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = {
  page: {
    margin: 0,
    padding: "24px",
    minHeight: "100vh",
    boxSizing: "border-box" as const,
    background: "#101418",
    color: "#e7edf3",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: "16px",
    lineHeight: 1.45,
  },
  card: {
    maxWidth: "760px",
    margin: "0 auto",
    background: "#171d24",
    border: "1px solid #2b3540",
    borderRadius: "12px",
    padding: "20px",
  },
  h1: { margin: "0 0 8px", fontSize: "22px" },
  note: {
    margin: "0 0 16px",
    padding: "12px 14px",
    background: "#232c36",
    borderLeft: "4px solid #f0b429",
    borderRadius: "6px",
    color: "#f3d99a",
    fontSize: "14px",
  },
  meta: { margin: "0 0 16px", fontSize: "13px", color: "#9aa8b6" },
  list: { listStyle: "none", margin: 0, padding: 0 },
  item: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    padding: "10px 0",
    borderBottom: "1px solid #232c36",
  },
  badge: {
    flex: "0 0 auto",
    minWidth: "72px",
    textAlign: "center" as const,
    padding: "3px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
  },
  label: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: "14px",
    wordBreak: "break-word" as const,
  },
  detail: { fontSize: "13px", color: "#9aa8b6" },
  button: {
    marginTop: "18px",
    padding: "10px 18px",
    fontSize: "15px",
    fontWeight: 600,
    color: "#101418",
    background: "#4cc38a",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  buttonDisabled: { opacity: 0.5, cursor: "not-allowed" },
  footer: { marginTop: "16px", fontSize: "12px", color: "#7c8b9a" },
} as const;

const badgeColor: Record<StepState, { background: string; color: string }> = {
  pending: { background: "#2b3540", color: "#c3ced9" },
  running: { background: "#3a4a5c", color: "#ffffff" },
  done: { background: "#1f4d3a", color: "#8ee0b3" },
};

function TableProbe() {
  const scanner = useScanner();
  const [steps, setSteps] = useState<StepResult[]>(initialSteps);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const hasAutoRun = useRef(false);
  const isRunning = useRef(false);

  const markStep = useCallback(
    (id: string, update: Partial<StepResult>) => {
      setSteps((current) =>
        current.map((step) => (step.id === id ? { ...step, ...update } : step)),
      );
    },
    [],
  );

  const run = useCallback(async () => {
    if (isRunning.current) {
      return;
    }
    isRunning.current = true;
    setRunning(true);
    setSteps(initialSteps());

    const sequence: Array<{
      id: string;
      call: () => boolean;
    }> = [
      { id: "power-on", call: () => scanner.power(1) },
      {
        id: "table-a",
        call: () =>
          scanner.configureSymbology(CODE_ID_TABLE_A, PROPERTY, DEFAULT_VALUE),
      },
      {
        id: "table-b",
        call: () =>
          scanner.configureSymbology(CODE_ID_TABLE_B, PROPERTY, DEFAULT_VALUE),
      },
      { id: "power-off", call: () => scanner.power(0) },
    ];

    for (const [index, step] of sequence.entries()) {
      if (index > 0) {
        await wait(STEP_DELAY_MS);
      }
      markStep(step.id, { state: "running" });
      let result = false;
      try {
        result = step.call();
      } catch (error) {
        console.error(`[table-probe] ${step.id} threw`, error);
      }
      markStep(step.id, { state: "done", result });
    }

    isRunning.current = false;
    setRunning(false);
  }, [markStep, scanner]);

  useEffect(() => {
    setSupported(scanner.isSupported);
  }, [scanner.isSupported]);

  useEffect(() => {
    if (hasAutoRun.current) {
      return;
    }
    hasAutoRun.current = true;
    void run();
  }, [run]);

  return (
    <div style={styles.page}>
      <main style={styles.card}>
        <h1 style={styles.h1}>BarcodeConfig table probe</h1>

        <p style={styles.note}>
          Native logcat decides which code ID is accepted; both library calls may
          return true because BarcodeConfig is void.
        </p>

        <p style={styles.meta}>
          Environment:{" "}
          {supported === null
            ? "checking…"
            : supported
              ? "kiosk bridge detected (window.nlScan)"
              : "no kiosk bridge (desktop)"}{" "}
          · values sent are each table&apos;s own <code>Enable</code> default (
          <code>&quot;{DEFAULT_VALUE}&quot;</code>), so the accepted call is a
          no-op.
        </p>

        <ul style={styles.list}>
          {steps.map((step) => (
            <li key={step.id} style={styles.item}>
              <span
                style={{
                  ...styles.badge,
                  ...badgeColor[step.state],
                }}
              >
                {step.state === "pending"
                  ? "pending"
                  : step.state === "running"
                    ? "running"
                    : step.result
                      ? "true"
                      : "false"}
              </span>
              <span>
                <span style={styles.label}>{step.label}</span>
                <br />
                <span style={styles.detail}>{step.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          style={{
            ...styles.button,
            ...(running ? styles.buttonDisabled : {}),
          }}
          disabled={running}
          onClick={() => void run()}
        >
          {running ? "Running…" : "Run again"}
        </button>

        <p style={styles.footer}>
          Boolean results only mean the bridge call was dispatched. Read the
          native line for the verdict: <code>res:=1</code> accepted,{" "}
          <code>res:=0</code>/<code>-1</code> rejected.
        </p>
      </main>
    </div>
  );
}

const container = document.getElementById("root");

if (!container) {
  throw new Error('Root element "#root" was not found.');
}

createRoot(container).render(<TableProbe />);
