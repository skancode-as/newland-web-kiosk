export { KioskProvider } from "./react/KioskProvider";
export type { KioskProviderProps } from "./react/KioskProvider";
export { useBarcodeScan } from "./react/useBarcodeScan";
export { useNfc } from "./react/useNfc";
export { useScanner } from "./react/useScanner";
export type { SwitchValue, UseScannerResult } from "./react/useScanner";
export { useDeviceInfo } from "./react/useDeviceInfo";
export type { UseDeviceInfoResult } from "./react/useDeviceInfo";
export { isKiosk } from "./core/environment";
export {
  BARCODE_CODE_IDS_TABLE_A,
  BARCODE_CODE_IDS_TABLE_B,
  BARCODE_PROPERTIES,
  BARCODE_ENABLED,
  BARCODE_DISABLED,
} from "./core/symbology";
export type {
  BarcodeCodeIdTableA,
  BarcodeCodeIdTableB,
  BarcodeCodeId,
  BarcodeProperty,
} from "./core/symbology";
export type {
  BarcodeScanEvent,
  NfcEvent,
  DeviceInfo,
  DeviceInfoState,
} from "./core/types";
export type { ScannerMethod } from "./core/bridge";
