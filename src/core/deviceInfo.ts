import { caseVariants } from "./bridge";
import { EMPTY_DEVICE_INFO } from "./types";
import type { DeviceInfoState, NlScanApi } from "./types";
import { getNlScan } from "./environment";

const READ_FAILED = Symbol("read-failed");

// Confirmed MT90 / Web Kiosk 2.21 getters come first, then documented fallbacks.
const FIELD_CANDIDATES = {
  model: ["NGetModel", "DeviceModel", "GetDeviceModel", "Model", "GetModel"],
  serialNumber: [
    "NGetSerial",
    "serialNumber",
    "SerialNumber",
    "GetSerialNumber",
    "Serial",
    "SN",
    "GetSN",
  ],
  buildNumber: [
    "NGetBuild",
    "BuildNumber",
    "GetBuildNumber",
    "Build",
    "Version",
    "GetVersion",
  ],
  deviceName: [
    "NGetDeviceName",
    "DeviceName",
    "GetDeviceName",
    "Name",
    "GetName",
  ],
} as const;

/** A property read that treats a throwing accessor as a missing value. */
function readProperty(
  api: NlScanApi,
  name: string,
): unknown | typeof READ_FAILED {
  try {
    return api[name];
  } catch {
    return READ_FAILED;
  }
}

function readField(
  api: NlScanApi,
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    const values = caseVariants(candidate).map((variant) =>
      readProperty(api, variant),
    );

    for (const value of values) {
      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }
    }

    for (const value of values) {
      if (typeof value === "function") {
        try {
          const result = (value as (...args: unknown[]) => unknown).apply(api);
          if (typeof result === "string" || typeof result === "number") {
            return String(result);
          }
        } catch {
          // Ignore a failing candidate and keep looking.
        }
      }
    }
  }

  return null;
}

export function readDeviceInfo(): DeviceInfoState {
  const api = getNlScan();
  if (!api) {
    return EMPTY_DEVICE_INFO;
  }

  return {
    model: readField(api, FIELD_CANDIDATES.model),
    serialNumber: readField(api, FIELD_CANDIDATES.serialNumber),
    buildNumber: readField(api, FIELD_CANDIDATES.buildNumber),
    deviceName: readField(api, FIELD_CANDIDATES.deviceName),
    isSupported: true,
  };
}
