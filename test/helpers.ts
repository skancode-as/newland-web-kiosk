/**
 * Calls the global `nlBarcode` callback exactly as the kiosk would.
 * Tests are expected to wrap this in `act()` when a React tree is mounted.
 */
export function fireBarcode(...args: unknown[]): void {
  const handler = window.nlBarcode;
  if (typeof handler !== 'function') {
    throw new Error('window.nlBarcode is not installed');
  }
  handler(...args);
}

/**
 * Calls the global `nlNFC` callback exactly as the kiosk would.
 */
export function fireNfc(...args: unknown[]): void {
  const handler = window.nlNFC;
  if (typeof handler !== 'function') {
    throw new Error('window.nlNFC is not installed');
  }
  handler(...args);
}

/** Removes any kiosk globals left behind by a previous test. */
export function clearKioskGlobals(): void {
  delete window.nlScan;
  delete window.nlBarcode;
  delete window.nlNFC;
}
