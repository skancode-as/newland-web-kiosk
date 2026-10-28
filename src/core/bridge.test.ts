import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NlScanApi } from "./types";
import { caseVariants, invoke, resolveMethod } from "./bridge";
import { clearKioskGlobals } from "../../test/helpers";

beforeEach(() => {
  clearKioskGlobals();
});

describe("caseVariants", () => {
  it("covers the documented TriggerMode spellings", () => {
    const variants = caseVariants("TriggerMode");

    expect(variants).toContain("TriggerMode");
    expect(variants).toContain("Triggermode");
    expect(variants).toContain("triggerMode");
    expect(variants).toContain("triggermode");
    expect(variants).toContain("TRIGGERMODE");
  });

  it("covers the documented LED spellings", () => {
    const variants = caseVariants("LED");

    expect(variants).toContain("LED");
    expect(variants).toContain("Led");
  });
});

describe("resolveMethod", () => {
  it("finds Triggermode when only that casing exists", () => {
    const api: NlScanApi = { Triggermode: vi.fn() };

    expect(resolveMethod(api, "TriggerMode")).toBe("Triggermode");
  });

  it("does not resolve a method inherited from a prototype", () => {
    const api: NlScanApi = Object.create({ Trigger: () => true });

    expect(resolveMethod(api, "Trigger")).toBeUndefined();
  });

  it("does not resolve inherited Object methods", () => {
    expect(resolveMethod({}, "toString")).toBeUndefined();
  });
});

describe("invoke", () => {
  it("calls the resolved method with the bridge as this and the exact arguments", () => {
    const api: NlScanApi = {};
    let receivedThis: unknown;
    let receivedArgs: unknown[] | undefined;

    api.Trigger = function (this: unknown, ...args: unknown[]): boolean {
      receivedThis = this;
      receivedArgs = args;
      return true;
    };
    window.nlScan = api;

    expect(invoke("trigger", 1, "two")).toBe(true);
    expect(receivedThis).toBe(api);
    expect(receivedArgs).toEqual([1, "two"]);
  });

  it("returns false without an nlScan bridge", () => {
    delete window.nlScan;

    expect(invoke("trigger")).toBe(false);
  });

  it("returns false when the method does not exist", () => {
    window.nlScan = { Power: vi.fn() };

    expect(invoke("trigger")).toBe(false);
  });

  it("returns false and logs when the method throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    window.nlScan = {
      Trigger: () => {
        throw new Error("boom");
      },
    };

    try {
      expect(invoke("trigger")).toBe(false);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain("Trigger");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("resolves BarcodeConfig for the canonical symbology method", () => {
    const handler = vi.fn(() => true);
    window.nlScan = { BarcodeConfig: handler };

    expect(invoke("symbology", 1, 2)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1, 2);
  });

  it("resolves ScannerPower for the canonical power method", () => {
    const handler = vi.fn(() => true);
    window.nlScan = { ScannerPower: handler };

    expect(invoke("power", true)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(true);
  });

  it("resolves arbitrary raw method names through the same casing rules", () => {
    const handler = vi.fn(() => true);
    window.nlScan = { specialAction: handler };

    expect(invoke("SpecialAction")).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns false for every method when there is no bridge", () => {
    delete window.nlScan;

    expect(invoke("trigger")).toBe(false);
    expect(invoke("anythingAtAll")).toBe(false);
  });

  it("returns false without throwing when a method accessor throws", () => {
    const api: NlScanApi = {};
    Object.defineProperty(api, "Trigger", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("accessor boom");
      },
    });
    window.nlScan = api;

    expect(() => invoke("trigger")).not.toThrow();
    expect(invoke("trigger")).toBe(false);
  });

  it("returns false for an inherited Object method", () => {
    const api: NlScanApi = {};
    window.nlScan = api;

    expect(invoke("toString")).toBe(false);
  });

  it("does not invoke a method that only exists on the prototype", () => {
    const api: NlScanApi = Object.create({ Trigger: () => true });
    window.nlScan = api;

    expect(invoke("trigger")).toBe(false);
  });
});
