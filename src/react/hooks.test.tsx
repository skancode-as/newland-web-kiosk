import { StrictMode } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BarcodeScanEvent, NfcEvent } from "../core/types";
import { resetRegistryForTests } from "../core/registry";
import { useBarcodeScan } from "./useBarcodeScan";
import { useNfc } from "./useNfc";
import { useScanner } from "./useScanner";
import { useDeviceInfo } from "./useDeviceInfo";
import { KioskProvider } from "./KioskProvider";
import { clearKioskGlobals, fireBarcode, fireNfc } from "../../test/helpers";

beforeEach(() => {
  resetRegistryForTests();
  clearKioskGlobals();
});

describe("useBarcodeScan", () => {
  it("receives a four-argument scan", () => {
    const handler = vi.fn((_event: BarcodeScanEvent) => {});

    renderHook(() => useBarcodeScan(handler));

    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      barcode: "0123456789012",
      source: null,
      symbology: 12,
      symbologyName: "EAN-13",
      status: "ok",
    });
  });

  it("uses a changed handler prop without resubscribing", () => {
    const first = vi.fn((_event: BarcodeScanEvent) => {});
    const second = vi.fn((_event: BarcodeScanEvent) => {});

    const { rerender } = renderHook(
      (props: { handler: (event: BarcodeScanEvent) => void }) =>
        useBarcodeScan(props.handler),
      { initialProps: { handler: first } },
    );

    const installed = window.nlBarcode;

    act(() => {
      fireBarcode("first", 12, "EAN-13", "ok");
    });

    expect(first).toHaveBeenCalledTimes(1);

    rerender({ handler: second });

    // The registry wrapper is not reinstalled when only the handler changes.
    expect(window.nlBarcode).toBe(installed);

    act(() => {
      fireBarcode("second", 12, "EAN-13", "ok");
    });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("delivers the same scan to two mounted hooks", () => {
    const first = vi.fn((_event: BarcodeScanEvent) => {});
    const second = vi.fn((_event: BarcodeScanEvent) => {});

    renderHook(() => useBarcodeScan(first));
    renderHook(() => useBarcodeScan(second));

    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0]?.[0]?.barcode).toBe("0123456789012");
    expect(second.mock.calls[0]?.[0]?.barcode).toBe("0123456789012");
  });

  it("invokes the handler exactly once under StrictMode", () => {
    const handler = vi.fn((_event: BarcodeScanEvent) => {});

    renderHook(() => useBarcodeScan(handler), { wrapper: StrictMode });

    act(() => {
      fireBarcode("0123456789012", 12, "EAN-13", "ok");
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removes window.nlBarcode when the last hook unmounts", () => {
    const firstUnmount = renderHook(() => useBarcodeScan(vi.fn())).unmount;
    const secondUnmount = renderHook(() => useBarcodeScan(vi.fn())).unmount;

    expect(window.nlBarcode).toBeTypeOf("function");

    firstUnmount();
    expect(window.nlBarcode).toBeTypeOf("function");

    secondUnmount();
    expect("nlBarcode" in window).toBe(false);
  });
});

describe("useNfc", () => {
  it("receives the confirmed live MT90 callback with the tag ID as data", () => {
    const handler = vi.fn((_event: NfcEvent) => {});

    const { unmount } = renderHook(() => useNfc(handler));

    act(() => {
      fireNfc("NFC", "A63F0A84");
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toEqual({
      data: "A63F0A84",
      type: "NFC",
      status: null,
      raw: ["NFC", "A63F0A84"],
    });

    unmount();

    expect("nlNFC" in window).toBe(false);
  });

  it("receives events and removes window.nlNFC on unmount", () => {
    const handler = vi.fn((_event: NfcEvent) => {});

    expect(window.nlNFC).toBeUndefined();

    const { unmount } = renderHook(() => useNfc(handler));

    expect(window.nlNFC).toBeTypeOf("function");

    act(() => {
      fireNfc("04A2B3C4D5", "NDEF", 0);
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      data: "04A2B3C4D5",
      type: "NDEF",
      status: 0,
    });

    unmount();

    expect("nlNFC" in window).toBe(false);
  });
});

describe("useScanner", () => {
  it("reports support and invokes the matching bridge methods", async () => {
    const Initialize = vi.fn((..._args: unknown[]) => true);
    const Power = vi.fn((..._args: unknown[]) => true);
    const Trigger = vi.fn((..._args: unknown[]) => true);
    const Stop = vi.fn((..._args: unknown[]) => true);
    const TriggerMode = vi.fn((..._args: unknown[]) => true);
    const Timeout = vi.fn((..._args: unknown[]) => true);
    const Interval = vi.fn((..._args: unknown[]) => true);
    const RepeatInterval = vi.fn((..._args: unknown[]) => true);
    const ScanMode = vi.fn((..._args: unknown[]) => true);
    const Symbology = vi.fn((..._args: unknown[]) => true);
    const Beep = vi.fn((..._args: unknown[]) => true);
    const LED = vi.fn((..._args: unknown[]) => true);
    const specialAction = vi.fn((..._args: unknown[]) => true);

    window.nlScan = {
      Initialize,
      Power,
      Trigger,
      Stop,
      TriggerMode,
      Timeout,
      Interval,
      RepeatInterval,
      ScanMode,
      Symbology,
      Beep,
      LED,
      specialAction,
    };

    const { result } = renderHook(() => useScanner());

    await waitFor(() => expect(result.current.isSupported).toBe(true));

    expect(result.current.initialize()).toBe(true);
    expect(result.current.power(true)).toBe(true);
    expect(result.current.trigger()).toBe(true);
    expect(result.current.stop()).toBe(true);
    expect(result.current.setTriggerMode(7)).toBe(true);
    expect(result.current.setTimeout(1500)).toBe(true);
    expect(result.current.setInterval(250)).toBe(true);
    expect(result.current.setRepeatInterval(500)).toBe(true);
    expect(result.current.setScanMode(3)).toBe(true);
    expect(result.current.configureSymbology("EAN13", "ENABLE", "1")).toBe(
      true,
    );
    expect(result.current.beep()).toBe(true);
    expect(result.current.beep(false)).toBe(true);
    expect(result.current.led()).toBe(true);
    expect(result.current.led(false)).toBe(true);
    expect(result.current.invoke("SpecialAction", 42)).toBe(true);

    expect(Initialize).toHaveBeenCalledTimes(1);
    expect(Initialize).toHaveBeenCalledWith(1);
    expect(Power).toHaveBeenCalledWith(1);
    expect(Trigger).toHaveBeenCalledTimes(1);
    expect(Trigger).toHaveBeenCalledWith(0);
    // trigger() calls Stop first; the explicit stop() adds a second call.
    expect(Stop).toHaveBeenCalledTimes(2);
    expect(Stop.mock.invocationCallOrder[0]).toBeLessThan(
      Trigger.mock.invocationCallOrder[0] ?? 0,
    );
    expect(TriggerMode).toHaveBeenCalledWith(7);
    expect(Timeout).toHaveBeenCalledWith(1500);
    expect(Interval).toHaveBeenCalledWith(250);
    expect(RepeatInterval).toHaveBeenCalledWith(500);
    expect(ScanMode).toHaveBeenCalledWith(3);
    expect(Symbology).toHaveBeenCalledWith("EAN13", "ENABLE", "1");
    expect(Beep.mock.calls).toEqual([[1], [0]]);
    expect(LED.mock.calls).toEqual([[1], [0]]);
    expect(specialAction).toHaveBeenCalledWith(42);
  });

  it("maps switch values to 1 and 0 for int-typed methods", async () => {
    const Initialize = vi.fn((..._args: unknown[]) => true);
    const Power = vi.fn((..._args: unknown[]) => true);
    const Beep = vi.fn((..._args: unknown[]) => true);
    const LED = vi.fn((..._args: unknown[]) => true);

    window.nlScan = { Initialize, Power, Beep, LED };

    const { result } = renderHook(() => useScanner());

    await waitFor(() => expect(result.current.isSupported).toBe(true));

    expect(result.current.initialize(false)).toBe(true);
    expect(result.current.initialize(0)).toBe(true);
    expect(result.current.power(false)).toBe(true);
    expect(result.current.power(1)).toBe(true);
    expect(result.current.beep(0)).toBe(true);
    expect(result.current.led(true)).toBe(true);

    expect(Initialize.mock.calls).toEqual([[0], [0]]);
    expect(Power.mock.calls).toEqual([[0], [1]]);
    expect(Beep).toHaveBeenCalledWith(0);
    expect(LED).toHaveBeenCalledWith(1);
  });

  it("forwards an explicit trigger timeout", async () => {
    const Trigger = vi.fn((..._args: unknown[]) => true);
    const Stop = vi.fn((..._args: unknown[]) => true);

    window.nlScan = { Trigger, Stop };

    const { result } = renderHook(() => useScanner());

    await waitFor(() => expect(result.current.isSupported).toBe(true));

    expect(result.current.trigger(250)).toBe(true);

    expect(Stop).toHaveBeenCalledTimes(1);
    expect(Trigger).toHaveBeenCalledWith(250);
  });

  it("is a no-op outside the kiosk", async () => {
    delete window.nlScan;

    const { result } = renderHook(() => useScanner());

    await waitFor(() => expect(result.current.isSupported).toBe(false));

    const actions = [
      () => result.current.initialize(),
      () => result.current.power(true),
      () => result.current.trigger(),
      () => result.current.stop(),
      () => result.current.setTriggerMode(7),
      () => result.current.setTimeout(1500),
      () => result.current.setInterval(250),
      () => result.current.setRepeatInterval(500),
      () => result.current.setScanMode(3),
      () => result.current.configureSymbology("EAN13", "ENABLE", "1"),
      () => result.current.beep(),
      () => result.current.led(),
      () => result.current.invoke("anything"),
    ];

    for (const action of actions) {
      expect(action()).toBe(false);
    }

    expect(result.current.isSupported).toBe(false);
  });
});

describe("useDeviceInfo", () => {
  it("starts empty and picks up changes on refresh", () => {
    delete window.nlScan;

    const { result } = renderHook(() => useDeviceInfo());

    expect(result.current).toMatchObject({
      model: null,
      serialNumber: null,
      buildNumber: null,
      deviceName: null,
      isSupported: false,
    });

    window.nlScan = {
      DeviceModel: "NQuire 1000",
      SerialNumber: "SN-123",
      BuildNumber: "2.21",
      DeviceName: "Front desk",
    };

    act(() => {
      result.current.refresh();
    });

    expect(result.current).toMatchObject({
      model: "NQuire 1000",
      serialNumber: "SN-123",
      buildNumber: "2.21",
      deviceName: "Front desk",
      isSupported: true,
    });
  });

  it("populates after mount when the bridge is present", async () => {
    window.nlScan = {
      DeviceModel: "NQuire 1000",
      SerialNumber: "SN-123",
      BuildNumber: "2.21",
      DeviceName: "Front desk",
    };

    const { result } = renderHook(() => useDeviceInfo());

    await waitFor(() => expect(result.current.isSupported).toBe(true));

    expect(result.current).toMatchObject({
      model: "NQuire 1000",
      serialNumber: "SN-123",
      buildNumber: "2.21",
      deviceName: "Front desk",
    });
  });
});

describe("KioskProvider", () => {
  it("initializes once under StrictMode and applies provided props", async () => {
    const Initialize = vi.fn((..._args: unknown[]) => true);
    const Power = vi.fn((..._args: unknown[]) => true);
    const TriggerMode = vi.fn((..._args: unknown[]) => true);
    const Timeout = vi.fn((..._args: unknown[]) => true);
    const Beep = vi.fn((..._args: unknown[]) => true);

    window.nlScan = { Initialize, Power, TriggerMode, Timeout, Beep };

    render(
      <StrictMode>
        <KioskProvider power triggerMode={7} timeout={1500} beep={true}>
          <div />
        </KioskProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(Initialize).toHaveBeenCalledTimes(1));

    expect(Initialize).toHaveBeenCalledWith(1);
    expect(Power).toHaveBeenCalledTimes(1);
    expect(Power).toHaveBeenCalledWith(1);
    expect(TriggerMode).toHaveBeenCalledTimes(1);
    expect(TriggerMode).toHaveBeenCalledWith(7);
    expect(Timeout).toHaveBeenCalledTimes(1);
    expect(Timeout).toHaveBeenCalledWith(1500);
    expect(Beep).toHaveBeenCalledTimes(1);
    expect(Beep).toHaveBeenCalledWith(1);

    // Give any remaining effects a chance to run; nothing else should fire.
    await act(async () => {});

    expect(Initialize).toHaveBeenCalledTimes(1);
    expect(Power).toHaveBeenCalledTimes(1);
    expect(TriggerMode).toHaveBeenCalledTimes(1);
    expect(Timeout).toHaveBeenCalledTimes(1);
    expect(Beep).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    const Initialize = vi.fn((..._args: unknown[]) => true);
    const Power = vi.fn((..._args: unknown[]) => true);

    window.nlScan = { Initialize, Power };

    render(
      <KioskProvider enabled={false} power>
        <div />
      </KioskProvider>,
    );

    await act(async () => {});

    expect(Initialize).not.toHaveBeenCalled();
    expect(Power).not.toHaveBeenCalled();
  });

  it("does nothing when there is no nlScan", async () => {
    delete window.nlScan;

    const { getByTestId } = render(
      <KioskProvider power triggerMode={7}>
        <div data-testid="child" />
      </KioskProvider>,
    );

    await act(async () => {});

    expect(getByTestId("child")).toBeTruthy();
    expect(window.nlScan).toBeUndefined();
  });
});
