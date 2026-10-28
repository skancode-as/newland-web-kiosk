import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BarcodeScanEvent, NfcEvent } from "../core/types";
import { invoke } from "../core/bridge";
import { isKiosk } from "../core/environment";
import {
  resetRegistryForTests,
  subscribeBarcode,
  subscribeNfc,
} from "../core/registry";
import { installMockNlScan } from "./index";
import { clearKioskGlobals } from "../../test/helpers";

beforeEach(() => {
  resetRegistryForTests();
  clearKioskGlobals();
});

describe("installMockNlScan", () => {
  it("installs a bridge with default device properties", () => {
    const controller = installMockNlScan();

    expect(window.nlScan).toBe(controller.nlScan);
    expect(isKiosk()).toBe(true);
    expect(controller.nlScan.DeviceModel).toBe("Mock NQuire 1000");
    expect(controller.nlScan.SerialNumber).toBe("MOCK-0001");
    expect(controller.nlScan.BuildNumber).toBe("2.21-mock");
    expect(controller.nlScan.DeviceName).toBe("Desktop Kiosk");

    controller.uninstall();
  });

  it("merges partial device info overrides with the defaults", () => {
    const controller = installMockNlScan({
      deviceInfo: { model: "Custom reader", deviceName: "Front desk" },
    });

    expect(controller.nlScan.DeviceModel).toBe("Custom reader");
    expect(controller.nlScan.DeviceName).toBe("Front desk");
    expect(controller.nlScan.SerialNumber).toBe("MOCK-0001");
    expect(controller.nlScan.BuildNumber).toBe("2.21-mock");

    controller.uninstall();
  });

  it("records method calls with a deterministic clock", () => {
    let tick = 0;
    const controller = installMockNlScan({
      now: () => {
        tick += 1;
        return 1000 + tick;
      },
    });

    expect(invoke("initialize")).toBe(true);
    expect(invoke("power", true)).toBe(true);
    expect(invoke("triggerMode", 7)).toBe(true);

    expect(controller.calls).toEqual([
      { method: "Initialize", args: [], at: 1001 },
      { method: "Power", args: [true], at: 1002 },
      { method: "TriggerMode", args: [7], at: 1003 },
    ]);

    controller.uninstall();
  });

  it("clears calls in place", () => {
    const controller = installMockNlScan();

    invoke("initialize");

    const calls = controller.calls;
    expect(calls).toHaveLength(1);

    controller.resetCalls();

    expect(controller.calls).toBe(calls);
    expect(calls).toEqual([]);

    controller.uninstall();
  });

  it("reaches a barcode subscriber with four and five arguments", () => {
    const controller = installMockNlScan();
    const listener = vi.fn((_event: BarcodeScanEvent) => {});

    const unsubscribe = subscribeBarcode(listener);

    expect(controller.simulateBarcodeScan("0123456789012")).toBe(true);

    const fourArgEvent = listener.mock.calls[0]?.[0];
    expect(fourArgEvent).toMatchObject({
      barcode: "0123456789012",
      source: null,
      symbology: "",
      symbologyName: "",
      status: "ok",
    });
    expect(fourArgEvent?.raw).toHaveLength(4);

    expect(
      controller.simulateBarcodeScan({
        barcode: "999",
        source: "internal",
        symbology: 12,
        symbologyName: "EAN-13",
        status: 0,
      }),
    ).toBe(true);

    const fiveArgEvent = listener.mock.calls[1]?.[0];
    expect(fiveArgEvent).toMatchObject({
      barcode: "999",
      source: "internal",
      symbology: 12,
      symbologyName: "EAN-13",
      status: 0,
    });
    expect(fiveArgEvent?.raw).toHaveLength(5);

    unsubscribe();
    controller.uninstall();
  });

  it("returns false when no barcode handler is installed", () => {
    const controller = installMockNlScan();

    expect(controller.simulateBarcodeScan("0123456789012")).toBe(false);

    controller.uninstall();
  });

  it("returns false when the barcode handler throws", () => {
    const controller = installMockNlScan();
    window.nlBarcode = () => {
      throw new Error("boom");
    };

    expect(controller.simulateBarcodeScan("0123456789012")).toBe(false);

    controller.uninstall();
  });

  it("returns false before an NFC subscriber and delivers once subscribed", () => {
    const controller = installMockNlScan();
    const listener = vi.fn((_event: NfcEvent) => {});

    expect(controller.simulateNfcScan("04A2B3C4D5")).toBe(false);

    const unsubscribe = subscribeNfc(listener);

    expect(controller.simulateNfcScan("04A2B3C4D5")).toBe(true);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      data: "04A2B3C4D5",
      type: "",
      status: "ok",
    });

    expect(
      controller.simulateNfcScan({ data: "04A2", type: "NDEF", status: 0 }),
    ).toBe(true);
    expect(listener.mock.calls[1]?.[0]).toMatchObject({
      data: "04A2",
      type: "NDEF",
      status: 0,
    });

    unsubscribe();
    controller.uninstall();
  });

  it("restores a previous nlScan on uninstall", () => {
    const previous = { Trigger: vi.fn() };
    window.nlScan = previous;

    const controller = installMockNlScan();

    expect(window.nlScan).toBe(controller.nlScan);

    controller.uninstall();

    expect(window.nlScan).toBe(previous);
  });

  it("deletes nlScan on uninstall when there was none before", () => {
    const controller = installMockNlScan();

    controller.uninstall();

    expect("nlScan" in window).toBe(false);
  });

  it("does not clobber a newer nlScan installed by someone else", () => {
    const controller = installMockNlScan();
    const newer = { Trigger: vi.fn() };

    window.nlScan = newer;

    controller.uninstall();

    expect(window.nlScan).toBe(newer);
  });
});
