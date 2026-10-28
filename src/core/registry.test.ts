import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import type { BarcodeScanEvent, NfcEvent } from "./types";
import {
  resetRegistryForTests,
  subscribeBarcode,
  subscribeNfc,
} from "./registry";
import { clearKioskGlobals, fireBarcode, fireNfc } from "../../test/helpers";

beforeEach(() => {
  resetRegistryForTests();
  clearKioskGlobals();
});

describe("barcode registry", () => {
  it("delivers one event to two subscribers", () => {
    const first = vi.fn((_event: BarcodeScanEvent) => {});
    const second = vi.fn((_event: BarcodeScanEvent) => {});

    const unsubscribeFirst = subscribeBarcode(first);
    const unsubscribeSecond = subscribeBarcode(second);

    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0]?.[0]).toMatchObject({
      barcode: "0123456789012",
      source: null,
      symbology: 12,
      symbologyName: "EAN-13",
      status: "ok",
    });

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("keeps the remaining subscriber active", () => {
    const first = vi.fn((_event: BarcodeScanEvent) => {});
    const second = vi.fn((_event: BarcodeScanEvent) => {});

    const unsubscribeFirst = subscribeBarcode(first);
    const unsubscribeSecond = subscribeBarcode(second);

    unsubscribeFirst();
    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeSecond();
  });

  it("deletes window.nlBarcode after the last unsubscribe when there was no original", () => {
    const unsubscribe = subscribeBarcode(vi.fn());

    expect(window.nlBarcode).toBeTypeOf("function");

    unsubscribe();

    expect("nlBarcode" in window).toBe(false);
  });

  it("chains a pre-existing handler and restores it after the last unsubscribe", () => {
    const original = vi.fn();
    const listener = vi.fn((_event: BarcodeScanEvent) => {});
    window.nlBarcode = original;

    const unsubscribe = subscribeBarcode(listener);

    expect(window.nlBarcode).not.toBe(original);

    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(original).toHaveBeenCalledWith("0123456789012", 12, "EAN-13", "ok");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    expect(window.nlBarcode).toBe(original);
  });

  it("makes unsubscribe idempotent", () => {
    const listener = vi.fn((_event: BarcodeScanEvent) => {});
    const unsubscribe = subscribeBarcode(listener);

    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();

    // Re-subscribing after the double unsubscribe still works.
    const next = vi.fn((_event: BarcodeScanEvent) => {});
    const unsubscribeNext = subscribeBarcode(next);

    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(listener).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);

    unsubscribeNext();
  });

  it("keeps delivering when a listener throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing = vi.fn(() => {
      throw new Error("listener boom");
    });
    const listener = vi.fn((_event: BarcodeScanEvent) => {});

    const unsubscribeThrowing = subscribeBarcode(throwing);
    const unsubscribeListener = subscribeBarcode(listener);

    try {
      expect(() =>
        act(() => {
          fireBarcode("0123456789012", 12, "EAN-13", "ok");
        }),
      ).not.toThrow();

      expect(throwing).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribeThrowing();
      unsubscribeListener();
      errorSpy.mockRestore();
    }
  });

  it("does not throw or notify listeners when the payload cannot be parsed", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const listener = vi.fn((_event: BarcodeScanEvent) => {});
    const unsubscribe = subscribeBarcode(listener);

    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    try {
      expect(() =>
        act(() => {
          fireBarcode(proxy);
        }),
      ).not.toThrow();

      expect(listener).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain(
        "[newland-web-kiosk]",
      );
    } finally {
      unsubscribe();
      errorSpy.mockRestore();
    }
  });

  it("restores a pre-existing non-function global value exactly", () => {
    Object.defineProperty(window, "nlBarcode", {
      value: null,
      writable: true,
      configurable: true,
    });

    const listener = vi.fn((_event: BarcodeScanEvent) => {});
    const unsubscribe = subscribeBarcode(listener);

    try {
      expect(window.nlBarcode).toBeTypeOf("function");

      unsubscribe();

      expect(window.nlBarcode).toBeNull();
    } finally {
      unsubscribe();
      Reflect.deleteProperty(window, "nlBarcode");
    }

    expect("nlBarcode" in window).toBe(false);
  });
});

describe("nfc registry", () => {
  it("only defines window.nlNFC while a subscriber exists", () => {
    const listener = vi.fn((_event: NfcEvent) => {});

    expect(window.nlNFC).toBeUndefined();

    const unsubscribe = subscribeNfc(listener);

    expect(window.nlNFC).toBeTypeOf("function");

    act(() => {
      fireNfc("04A2B3C4D5", "NDEF", 0);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      data: "04A2B3C4D5",
      type: "NDEF",
      status: 0,
    });

    unsubscribe();

    expect("nlNFC" in window).toBe(false);
  });

  it("chains a pre-existing NFC handler and restores it", () => {
    const original = vi.fn();
    const listener = vi.fn((_event: NfcEvent) => {});
    window.nlNFC = original;

    const unsubscribe = subscribeNfc(listener);

    expect(window.nlNFC).not.toBe(original);

    act(() => {
      fireNfc("04A2B3C4D5", "NDEF", 0);
    });

    expect(original).toHaveBeenCalledWith("04A2B3C4D5", "NDEF", 0);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    expect(window.nlNFC).toBe(original);
  });
});

describe("resetRegistryForTests", () => {
  it("restores or removes globals and clears listeners", () => {
    const original = vi.fn();
    const stale = vi.fn((_event: BarcodeScanEvent) => {});
    const staleNfc = vi.fn((_event: NfcEvent) => {});
    window.nlBarcode = original;

    subscribeBarcode(stale);
    subscribeNfc(staleNfc);

    resetRegistryForTests();

    expect(window.nlBarcode).toBe(original);
    expect("nlNFC" in window).toBe(false);

    // Any listener that survived the reset must not receive new events.
    const next = vi.fn((_event: BarcodeScanEvent) => {});
    const unsubscribeNext = subscribeBarcode(next);

    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(stale).not.toHaveBeenCalled();
    expect(staleNfc).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);

    unsubscribeNext();
  });
});
