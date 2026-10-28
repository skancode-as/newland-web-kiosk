"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { isKiosk } from "../core/environment";
import { useScanner } from "./useScanner";
import type { SwitchValue } from "./useScanner";

export interface KioskProviderProps {
  children?: ReactNode;
  enabled?: boolean;
  initialize?: boolean;
  power?: SwitchValue;
  triggerMode?: number;
  timeout?: number;
  interval?: number;
  repeatInterval?: number;
  scanMode?: number;
  beep?: SwitchValue;
  led?: SwitchValue;
}

export function KioskProvider({
  children,
  enabled = true,
  initialize = true,
  power,
  triggerMode,
  timeout,
  interval,
  repeatInterval,
  scanMode,
  beep,
  led,
}: KioskProviderProps) {
  const scanner = useScanner();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled || initializedRef.current || !isKiosk()) {
      return;
    }

    initializedRef.current = true;

    if (initialize) {
      scanner.initialize(1);
    }
    if (power !== undefined) {
      scanner.power(power);
    }
    if (triggerMode !== undefined) {
      scanner.setTriggerMode(triggerMode);
    }
    if (timeout !== undefined) {
      scanner.setTimeout(timeout);
    }
    if (interval !== undefined) {
      scanner.setInterval(interval);
    }
    if (repeatInterval !== undefined) {
      scanner.setRepeatInterval(repeatInterval);
    }
    if (scanMode !== undefined) {
      scanner.setScanMode(scanMode);
    }
    if (beep !== undefined) {
      scanner.beep(beep);
    }
    if (led !== undefined) {
      scanner.led(led);
    }
  }, [
    enabled,
    initialize,
    power,
    triggerMode,
    timeout,
    interval,
    repeatInterval,
    scanMode,
    beep,
    led,
    scanner,
  ]);

  return <>{children}</>;
}
