"use client";

import { useEffect, useMemo, useState } from "react";
import { invoke as invokeMethod } from "../core/bridge";
import { isKiosk } from "../core/environment";
import type { BarcodeCodeId, BarcodeProperty } from "../core/symbology";

/**
 * Boolean on/off values accepted by the int-typed bridge methods.
 *
 * The WebView bridge coerces `true` to `0`, so we always translate booleans to
 * explicit `1`/`0` before invoking a Java `int` parameter.
 */
export type SwitchValue = boolean | 0 | 1;

function toInt(value: SwitchValue): 0 | 1 {
  return value ? 1 : 0;
}

export interface UseScannerResult {
  isSupported: boolean;
  initialize(value?: SwitchValue): boolean;
  power(on: SwitchValue): boolean;
  trigger(timeout?: number): boolean;
  stop(): boolean;
  setTriggerMode(mode: number): boolean;
  setTimeout(ms: number): boolean;
  setInterval(ms: number): boolean;
  setRepeatInterval(ms: number): boolean;
  setScanMode(mode: number): boolean;
  configureSymbology(
    codeId: BarcodeCodeId,
    property: BarcodeProperty,
    value: string,
  ): boolean;
  beep(value?: SwitchValue): boolean;
  led(value?: SwitchValue): boolean;
  invoke(method: string, ...args: unknown[]): boolean;
}

export function useScanner(): UseScannerResult {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(isKiosk());
  }, []);

  return useMemo<UseScannerResult>(
    () => ({
      isSupported,
      initialize: (value: SwitchValue = 1) =>
        invokeMethod("initialize", toInt(value)),
      power: (on: SwitchValue) => invokeMethod("power", toInt(on)),
      // Trigger is a toggle on the device. Stop first so every call starts from
      // a known state, then send an explicit timeout (0 = scanner default).
      trigger: (timeout?: number) => {
        invokeMethod("stop");
        return invokeMethod("trigger", timeout ?? 0);
      },
      stop: () => invokeMethod("stop"),
      setTriggerMode: (mode: number) => invokeMethod("triggerMode", mode),
      setTimeout: (ms: number) => invokeMethod("timeout", ms),
      setInterval: (ms: number) => invokeMethod("interval", ms),
      setRepeatInterval: (ms: number) => invokeMethod("repeatInterval", ms),
      setScanMode: (mode: number) => invokeMethod("scanMode", mode),
      configureSymbology: (
        codeId: BarcodeCodeId,
        property: BarcodeProperty,
        value: string,
      ) => invokeMethod("symbology", codeId, property, value),
      beep: (value: SwitchValue = 1) => invokeMethod("beep", toInt(value)),
      led: (value: SwitchValue = 1) => invokeMethod("led", toInt(value)),
      invoke: (method: string, ...args: unknown[]) =>
        invokeMethod(method, ...args),
    }),
    [isSupported],
  );
}
