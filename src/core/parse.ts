import type { BarcodeScanEvent, NfcEvent } from "./types";

const READ_FAILED = Symbol("read-failed");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function asScalar(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
}

/** A property read that cannot be derailed by a getter or Proxy. */
function readProperty(
  record: Record<string, unknown>,
  key: string,
): unknown | typeof READ_FAILED {
  try {
    return record[key];
  } catch {
    return READ_FAILED;
  }
}

function hasOwnProperty(record: Record<string, unknown>, key: string): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(record, key);
  } catch {
    return false;
  }
}

function ownKeys(record: Record<string, unknown>): string[] {
  try {
    return Object.keys(record);
  } catch {
    return [];
  }
}

function pick(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (hasOwnProperty(record, key)) {
      const value = readProperty(record, key);
      if (value !== READ_FAILED) {
        return value;
      }
    }

    const lowerKey = key.toLowerCase();
    for (const recordKey of ownKeys(record)) {
      if (recordKey.toLowerCase() === lowerKey) {
        const value = readProperty(record, recordKey);
        if (value !== READ_FAILED) {
          return value;
        }
      }
    }
  }

  return undefined;
}

export function parseBarcodeArgs(
  args: readonly unknown[],
): BarcodeScanEvent | null {
  if (args.length === 0) {
    return null;
  }

  if (args.length === 1 && isRecord(args[0])) {
    const record = args[0];
    return {
      barcode: asText(pick(record, ["barcode", "data", "code", "value"])) ?? "",
      source: asText(pick(record, ["source", "scanner", "mac"])),
      symbology: asScalar(pick(record, ["symbology", "type"])),
      symbologyName: asText(
        pick(record, ["symbologyName", "typename", "typeName", "name"]),
      ),
      status: asScalar(pick(record, ["status"])),
      raw: args,
    };
  }

  // Confirmed live shape on Web Kiosk 2.21 / MT90: source comes first, e.g.
  // window.nlBarcode("INTERNAL", "5740700982972", 8, "EAN13", "ok").
  if (args.length >= 5) {
    return {
      barcode: asText(args[1]) ?? "",
      source: asText(args[0]),
      symbology: asScalar(args[2]),
      symbologyName: asText(args[3]),
      status: asScalar(args[4]),
      raw: args,
    };
  }

  return {
    barcode: asText(args[0]) ?? "",
    source: null,
    symbology: asScalar(args[1]),
    symbologyName: asText(args[2]),
    status: asScalar(args[3]),
    raw: args,
  };
}

export function parseNfcArgs(args: readonly unknown[]): NfcEvent | null {
  if (args.length === 0) {
    return null;
  }

  if (args.length === 1 && isRecord(args[0])) {
    const record = args[0];
    return {
      data:
        asText(pick(record, ["data", "uid", "id", "tag", "ndef", "payload"])) ??
        "",
      type: asText(pick(record, ["type", "technology"])),
      status: asScalar(pick(record, ["status"])),
      raw: args,
    };
  }

  // Confirmed live shape on Web Kiosk 2.21: window.nlNFC('NFC', '<HEX>'),
  // where the first argument is the literal technology tag and the second is
  // the tag ID. The type is the literal "NFC" string, not the data.
  if (
    args.length >= 2 &&
    typeof args[0] === "string" &&
    args[0].toLowerCase() === "nfc"
  ) {
    return {
      data: asText(args[1]) ?? "",
      type: asText(args[0]),
      status: args.length >= 3 ? asScalar(args[2]) : null,
      raw: args,
    };
  }

  return {
    data: asText(args[0]) ?? "",
    type: asText(args[1]),
    status: asScalar(args[2]),
    raw: args,
  };
}
