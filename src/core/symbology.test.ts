import { describe, expect, it } from "vitest";
import {
  BARCODE_CODE_IDS_TABLE_A,
  BARCODE_CODE_IDS_TABLE_B,
  BARCODE_DISABLED,
  BARCODE_ENABLED,
  BARCODE_PROPERTIES,
} from "./symbology";

describe("BARCODE_CODE_IDS_TABLE_A", () => {
  it("contains the shared, exact code IDs", () => {
    expect(BARCODE_CODE_IDS_TABLE_A).toContain("EAN13");
    expect(BARCODE_CODE_IDS_TABLE_A).toContain("CODE128");
    expect(BARCODE_CODE_IDS_TABLE_A).toContain("QR");
    expect(BARCODE_CODE_IDS_TABLE_A).toContain("CODABAR");
  });

  it("does not use table B's Codabar spelling", () => {
    expect(BARCODE_CODE_IDS_TABLE_A).not.toContain("CODEBAR");
  });

  it("has 48 entries", () => {
    expect(BARCODE_CODE_IDS_TABLE_A).toHaveLength(48);
  });
});

describe("BARCODE_CODE_IDS_TABLE_B", () => {
  it("contains the shared, exact code IDs", () => {
    expect(BARCODE_CODE_IDS_TABLE_B).toContain("EAN13");
    expect(BARCODE_CODE_IDS_TABLE_B).toContain("CODE128");
    expect(BARCODE_CODE_IDS_TABLE_B).toContain("QR");
    expect(BARCODE_CODE_IDS_TABLE_B).toContain("CODEBAR");
  });

  it("does not use table A's Codabar spelling", () => {
    expect(BARCODE_CODE_IDS_TABLE_B).not.toContain("CODABAR");
  });

  it("has 50 entries", () => {
    expect(BARCODE_CODE_IDS_TABLE_B).toHaveLength(50);
  });
});

describe("code ID tables", () => {
  it("never expose QRCODE, which is only a result name", () => {
    expect(BARCODE_CODE_IDS_TABLE_A).not.toContain("QRCODE");
    expect(BARCODE_CODE_IDS_TABLE_B).not.toContain("QRCODE");
  });
});

describe("BARCODE_PROPERTIES", () => {
  it("contains the canonical properties", () => {
    expect(BARCODE_PROPERTIES).toContain("Enable");
    expect(BARCODE_PROPERTIES).toContain("Minlen");
    expect(BARCODE_PROPERTIES).toContain("Maxlen");
    expect(BARCODE_PROPERTIES).toContain("TrsmtChkChar");
    expect(BARCODE_PROPERTIES).toContain("TrsmtStasrtStop");
    expect(BARCODE_PROPERTIES).toContain("RectAngle");
  });

  it("keeps the table's misspellings", () => {
    expect(BARCODE_PROPERTIES).toContain("MsgtoEan13");
    expect(BARCODE_PROPERTIES).toContain("Micor");
  });
});

describe("barcode config values", () => {
  it("uses string values", () => {
    expect(BARCODE_ENABLED).toBe("1");
    expect(BARCODE_DISABLED).toBe("0");
  });
});
