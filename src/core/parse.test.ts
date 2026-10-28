import { describe, expect, it } from "vitest";
import { parseBarcodeArgs, parseNfcArgs } from "./parse";

describe("parseBarcodeArgs", () => {
  it("maps four arguments without a source", () => {
    const event = parseBarcodeArgs(["0123456789012", 12, "EAN-13", "ok"]);

    expect(event).toEqual({
      barcode: "0123456789012",
      source: null,
      symbology: 12,
      symbologyName: "EAN-13",
      status: "ok",
      raw: ["0123456789012", 12, "EAN-13", "ok"],
    });
  });

  it("treats the first of five arguments as the source", () => {
    const event = parseBarcodeArgs([
      "internal",
      "0123456789012",
      12,
      "EAN-13",
      0,
    ]);

    expect(event).toEqual({
      barcode: "0123456789012",
      source: "internal",
      symbology: 12,
      symbologyName: "EAN-13",
      status: 0,
      raw: ["internal", "0123456789012", 12, "EAN-13", 0],
    });
  });

  it("parses the confirmed live MT90 payload with the source first", () => {
    const args: unknown[] = ["INTERNAL", "5740700982972", 8, "EAN13", "ok"];
    const event = parseBarcodeArgs(args);

    expect(event).not.toBeNull();
    expect(event?.source).toBe("INTERNAL");
    expect(event?.barcode).toBe("5740700982972");
    expect(event?.symbology).toBe(8);
    expect(typeof event?.symbology).toBe("number");
    expect(event?.symbologyName).toBe("EAN13");
    expect(event?.status).toBe("ok");
    expect(event?.raw).toBe(args);
  });

  it("produces a usable event with nulls from too few arguments", () => {
    const event = parseBarcodeArgs(["0123456789012"]);

    expect(event).toEqual({
      barcode: "0123456789012",
      source: null,
      symbology: null,
      symbologyName: null,
      status: null,
      raw: ["0123456789012"],
    });
  });

  it("parses a single object payload with case-insensitive keys and aliases", () => {
    const payload = {
      Barcode: "0123456789012",
      SCANNER: "internal",
      TYPE: 12,
      TypeName: "EAN-13",
      Status: "ok",
    };

    const event = parseBarcodeArgs([payload]);

    expect(event).toEqual({
      barcode: "0123456789012",
      source: "internal",
      symbology: 12,
      symbologyName: "EAN-13",
      status: "ok",
      raw: [payload],
    });
  });

  it("keeps numeric symbology and status values as numbers", () => {
    const event = parseBarcodeArgs(["0123456789012", 12, "EAN-13", 0]);

    expect(event?.symbology).toBe(12);
    expect(event?.status).toBe(0);
    expect(typeof event?.symbology).toBe("number");
    expect(typeof event?.status).toBe("number");
  });

  it("returns null when called with no arguments", () => {
    expect(parseBarcodeArgs([])).toBeNull();
  });

  it("preserves the raw argument array by identity", () => {
    const args: unknown[] = ["0123456789012", 12, "EAN-13", "ok"];

    expect(parseBarcodeArgs(args)?.raw).toBe(args);
  });

  it("preserves an object payload through raw", () => {
    const payload = { barcode: "0123456789012" };
    const event = parseBarcodeArgs([payload]);

    expect(event?.raw).toEqual([payload]);
    expect(event?.raw[0]).toBe(payload);
  });

  it("returns an empty barcode when the barcode accessor throws", () => {
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, "barcode", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("accessor boom");
      },
    });

    expect(() => parseBarcodeArgs([payload])).not.toThrow();
    const event = parseBarcodeArgs([payload]);
    expect(event).toMatchObject({
      barcode: "",
      source: null,
      symbology: null,
      symbologyName: null,
      status: null,
    });
    // `raw` keeps the original payload, whose throwing getter must not be
    // inspected; assert identity rather than deep equality.
    expect(event?.raw).toHaveLength(1);
    expect(event?.raw[0]).toBe(payload);
  });
});

describe("parseNfcArgs", () => {
  it("parses the confirmed live MT90 payload", () => {
    const args: unknown[] = ["NFC", "A63F0A84"];
    const event = parseNfcArgs(args);

    expect(event).toEqual({
      data: "A63F0A84",
      type: "NFC",
      status: null,
      raw: ["NFC", "A63F0A84"],
    });
    expect(event?.raw).toBe(args);
  });

  it("treats the leading technology tag case-insensitively", () => {
    const event = parseNfcArgs(["nfc", "04A2B3C4D5", 0]);

    expect(event).toMatchObject({
      data: "04A2B3C4D5",
      type: "nfc",
      status: 0,
    });
  });

  it("maps three positional arguments", () => {
    const event = parseNfcArgs(["04A2B3C4D5", "NDEF", 0]);

    expect(event).toEqual({
      data: "04A2B3C4D5",
      type: "NDEF",
      status: 0,
      raw: ["04A2B3C4D5", "NDEF", 0],
    });
  });

  it("parses a single object payload with case-insensitive keys and aliases", () => {
    const payload = {
      Data: "04A2B3C4D5",
      TECHNOLOGY: "NDEF",
      STATUS: 0,
    };

    const event = parseNfcArgs([payload]);

    expect(event).toEqual({
      data: "04A2B3C4D5",
      type: "NDEF",
      status: 0,
      raw: [payload],
    });
  });

  it("returns null when called with no arguments", () => {
    expect(parseNfcArgs([])).toBeNull();
  });

  it("preserves the raw argument array by identity", () => {
    const args: unknown[] = ["04A2B3C4D5", "NDEF", 0];

    expect(parseNfcArgs(args)?.raw).toBe(args);
  });

  it("returns empty data when the data accessor throws", () => {
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, "data", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("accessor boom");
      },
    });

    expect(() => parseNfcArgs([payload])).not.toThrow();
    const event = parseNfcArgs([payload]);
    expect(event).toMatchObject({
      data: "",
      type: null,
      status: null,
    });
    // `raw` keeps the original payload, whose throwing getter must not be
    // inspected; assert identity rather than deep equality.
    expect(event?.raw).toHaveLength(1);
    expect(event?.raw[0]).toBe(payload);
  });
});
