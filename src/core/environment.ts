import type { NlScanApi } from "./types";

export function getWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

export function getNlScan(): NlScanApi | undefined {
  const win = getWindow();
  if (!win) {
    return undefined;
  }

  const value: unknown = win.nlScan;

  if (typeof value === "function") {
    return value as unknown as NlScanApi;
  }
  if (typeof value === "object" && value !== null) {
    return value as NlScanApi;
  }

  return undefined;
}

export function isKiosk(): boolean {
  return getNlScan() !== undefined;
}
