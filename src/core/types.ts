export type NlScanApi = Record<string, unknown>;

export interface BarcodeScanEvent {
  barcode: string;
  source: string | null;
  symbology: string | number | null;
  symbologyName: string | null;
  status: string | number | null;
  raw: readonly unknown[];
}

export interface NfcEvent {
  data: string;
  type: string | null;
  status: string | number | null;
  raw: readonly unknown[];
}

export interface DeviceInfo {
  model: string | null;
  serialNumber: string | null;
  buildNumber: string | null;
  deviceName: string | null;
}

export interface DeviceInfoState extends DeviceInfo {
  isSupported: boolean;
}

export const EMPTY_DEVICE_INFO: DeviceInfoState = {
  model: null,
  serialNumber: null,
  buildNumber: null,
  deviceName: null,
  isSupported: false,
};

declare global {
  interface Window {
    nlScan?: NlScanApi;
    nlBarcode?: (...args: unknown[]) => void;
    nlNFC?: (...args: unknown[]) => void;
    nlNHubResult?: (...args: unknown[]) => void;
    // Documented typo in the Web Kiosk guide; supported for completeness.
    nlNHubRestult?: (...args: unknown[]) => void;
  }
}
