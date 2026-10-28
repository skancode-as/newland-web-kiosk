import type { NlScanApi } from "./types";
import { getNlScan } from "./environment";

export const METHOD_NAMES = {
  initialize: ["Initialize"],
  power: ["Power", "ScannerPower"],
  trigger: ["Trigger"],
  stop: ["Stop"],
  triggerMode: ["TriggerMode"],
  timeout: ["Timeout", "SetTimeout"],
  interval: ["Interval", "SetInterval"],
  repeatInterval: ["RepeatInterval", "SetRepeatInterval"],
  scanMode: ["ScanMode", "SetScanMode"],
  symbology: ["BarcodeConfig", "Symbology", "ConfigureSymbology"],
  beep: ["Beep"],
  led: ["LED"],
} as const;

export type ScannerMethod = keyof typeof METHOD_NAMES;

export function caseVariants(name: string): string[] {
  const variants = [
    name,
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
    name.charAt(0).toLowerCase() + name.slice(1),
    name.toLowerCase(),
    name.toUpperCase(),
  ];

  return [...new Set(variants)];
}

const resolvedMethods = new WeakMap<NlScanApi, Map<string, string>>();

/**
 * Reads a property without letting a throwing getter or Proxy escape.
 * Any access failure is treated as "the property is missing".
 */
function readProperty(api: NlScanApi, name: string): unknown {
  try {
    return api[name];
  } catch {
    return undefined;
  }
}

/** `hasOwnProperty` can trigger a Proxy trap, so guard it as well. */
function hasOwnProperty(api: NlScanApi, name: string): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(api, name);
  } catch {
    return false;
  }
}

export function resolveMethod(
  api: NlScanApi,
  method: string,
): string | undefined {
  const cache = resolvedMethods.get(api);
  const cached = cache?.get(method);
  if (cached !== undefined) {
    return cached;
  }

  for (const candidate of caseVariants(method)) {
    // Only own properties are resolved. Inherited names such as `toString`
    // and `constructor` must never be invoked as scanner methods.
    if (!hasOwnProperty(api, candidate)) {
      continue;
    }

    if (typeof readProperty(api, candidate) === "function") {
      if (cache) {
        cache.set(method, candidate);
      } else {
        resolvedMethods.set(api, new Map([[method, candidate]]));
      }
      return candidate;
    }
  }

  // Misses are intentionally not cached: the bridge may be injected late.
  return undefined;
}

function methodCandidates(method: string): readonly string[] {
  if (Object.prototype.hasOwnProperty.call(METHOD_NAMES, method)) {
    return METHOD_NAMES[method as ScannerMethod];
  }
  return [method];
}

export function invoke(
  method: ScannerMethod | string,
  ...args: unknown[]
): boolean {
  const api = getNlScan();
  if (!api) {
    return false;
  }

  let resolved: string | undefined;
  for (const candidate of methodCandidates(method)) {
    resolved = resolveMethod(api, candidate);
    if (resolved !== undefined) {
      break;
    }
  }

  if (resolved === undefined) {
    return false;
  }

  const fn = readProperty(api, resolved);
  if (typeof fn !== "function") {
    return false;
  }

  try {
    (fn as (...invokeArgs: unknown[]) => unknown).apply(api, args);
    return true;
  } catch (error) {
    console.error(`[newland-web-kiosk] Failed to invoke "${resolved}"`, error);
    return false;
  }
}
