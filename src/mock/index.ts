import { getWindow } from "../core/environment";
import type { DeviceInfo, NlScanApi } from "../core/types";

export interface MockCall {
  method: string;
  args: unknown[];
  at: number;
}

export interface MockOptions {
  deviceInfo?: Partial<DeviceInfo>;
  now?: () => number;
}

export interface SimulatedBarcodeScan {
  barcode: string;
  source?: string;
  symbology?: string | number;
  symbologyName?: string;
  status?: string | number;
}

export interface SimulatedNfcScan {
  data: string;
  type?: string;
  status?: string | number;
}

export interface MockNlScanController {
  nlScan: NlScanApi;
  calls: MockCall[];
  simulateBarcodeScan(input: string | SimulatedBarcodeScan): boolean;
  simulateNfcScan(input: string | SimulatedNfcScan): boolean;
  resetCalls(): void;
  uninstall(): void;
}

const METHOD_NAMES = [
  "Initialize",
  "Power",
  "Trigger",
  "Stop",
  "TriggerMode",
  "Timeout",
  "Interval",
  "RepeatInterval",
  "ScanMode",
  "Symbology",
  "Beep",
  "LED",
] as const;

const DEFAULT_DEVICE_INFO: DeviceInfo = {
  model: "Mock NQuire 1000",
  serialNumber: "MOCK-0001",
  buildNumber: "2.21-mock",
  deviceName: "Desktop Kiosk",
};

export function installMockNlScan(
  options: MockOptions = {},
): MockNlScanController {
  const win = getWindow();
  if (!win) {
    throw new Error(
      "[newland-web-kiosk] installMockNlScan() requires a browser environment with window.",
    );
  }

  const now = options.now ?? (() => Date.now());
  const calls: MockCall[] = [];

  const deviceInfo: DeviceInfo = {
    model: options.deviceInfo?.model ?? DEFAULT_DEVICE_INFO.model,
    serialNumber:
      options.deviceInfo?.serialNumber ?? DEFAULT_DEVICE_INFO.serialNumber,
    buildNumber:
      options.deviceInfo?.buildNumber ?? DEFAULT_DEVICE_INFO.buildNumber,
    deviceName:
      options.deviceInfo?.deviceName ?? DEFAULT_DEVICE_INFO.deviceName,
  };

  const nlScan: NlScanApi = {};

  for (const method of METHOD_NAMES) {
    nlScan[method] = (...args: unknown[]): boolean => {
      calls.push({ method, args, at: now() });
      return true;
    };
  }

  nlScan.DeviceModel = deviceInfo.model;
  nlScan.SerialNumber = deviceInfo.serialNumber;
  nlScan.BuildNumber = deviceInfo.buildNumber;
  nlScan.DeviceName = deviceInfo.deviceName;

  const simulateBarcodeScan = (
    input: string | SimulatedBarcodeScan,
  ): boolean => {
    const handler = win.nlBarcode;
    if (typeof handler !== "function") {
      return false;
    }

    const scan: SimulatedBarcodeScan =
      typeof input === "string" ? { barcode: input } : input;
    const symbology = scan.symbology ?? "";
    const symbologyName = scan.symbologyName ?? "";
    const status = scan.status ?? "ok";

    try {
      if (scan.source !== undefined && scan.source !== null) {
        handler(scan.source, scan.barcode, symbology, symbologyName, status);
      } else {
        handler(scan.barcode, symbology, symbologyName, status);
      }
      return true;
    } catch {
      return false;
    }
  };

  const simulateNfcScan = (input: string | SimulatedNfcScan): boolean => {
    const handler = win.nlNFC;
    if (typeof handler !== "function") {
      return false;
    }

    const scan: SimulatedNfcScan =
      typeof input === "string" ? { data: input } : input;
    const type = scan.type ?? "";
    const status = scan.status ?? "ok";

    try {
      handler(scan.data, type, status);
      return true;
    } catch {
      return false;
    }
  };

  const previous = win.nlScan;
  win.nlScan = nlScan;

  return {
    nlScan,
    calls,
    simulateBarcodeScan,
    simulateNfcScan,
    resetCalls: () => {
      calls.length = 0;
    },
    uninstall: () => {
      // Leave a newer bridge alone: someone else owns it now.
      if (win.nlScan !== nlScan) {
        return;
      }

      if (previous === undefined) {
        delete win.nlScan;
      } else {
        win.nlScan = previous;
      }
    },
  };
}
