import type { BarcodeScanEvent, NfcEvent } from "./types";
import { parseBarcodeArgs, parseNfcArgs } from "./parse";
import { getWindow } from "./environment";

export type BarcodeListener = (event: BarcodeScanEvent) => void;

export type NfcListener = (event: NfcEvent) => void;

type GlobalHandler = (...args: unknown[]) => void;

interface ChannelState<TEvent> {
  listeners: Set<(event: TEvent) => void>;
  installed: boolean;
  wrapper: GlobalHandler | null;
  /** Raw pre-existing global value, which need not be a function. */
  original: unknown;
}

interface Channel<TEvent> {
  readonly label: string;
  readonly parse: (args: readonly unknown[]) => TEvent | null;
  readonly getGlobal: (win: Window) => unknown;
  readonly setGlobal: (win: Window, value: unknown) => void;
  readonly state: ChannelState<TEvent>;
}

const barcodeChannel: Channel<BarcodeScanEvent> = {
  label: "nlBarcode",
  parse: parseBarcodeArgs,
  getGlobal: (win) => win.nlBarcode,
  setGlobal: (win, value) => {
    if (value === undefined) {
      delete win.nlBarcode;
    } else {
      win.nlBarcode = value as Window["nlBarcode"];
    }
  },
  state: {
    listeners: new Set(),
    installed: false,
    wrapper: null,
    original: undefined,
  },
};

const nfcChannel: Channel<NfcEvent> = {
  label: "nlNFC",
  parse: parseNfcArgs,
  getGlobal: (win) => win.nlNFC,
  // `nlNFC` must only exist while someone is subscribed, otherwise the kiosk
  // falls back to its "wedge" behaviour of typing the tag into the page.
  setGlobal: (win, value) => {
    if (value === undefined) {
      delete win.nlNFC;
    } else {
      win.nlNFC = value as Window["nlNFC"];
    }
  },
  state: {
    listeners: new Set(),
    installed: false,
    wrapper: null,
    original: undefined,
  },
};

function install<TEvent>(channel: Channel<TEvent>, win: Window): void {
  const { state } = channel;
  const existing = channel.getGlobal(win);

  const wrapper: GlobalHandler = (...args: unknown[]) => {
    if (typeof existing === "function") {
      try {
        existing.apply(win, args);
      } catch (error) {
        console.error(
          `[newland-web-kiosk] Existing ${channel.label} handler threw`,
          error,
        );
      }
    }

    let event: TEvent | null;
    try {
      event = channel.parse(args);
    } catch (error) {
      console.error(
        `[newland-web-kiosk] Failed to parse ${channel.label} payload`,
        error,
      );
      return;
    }

    if (!event) {
      return;
    }

    for (const listener of [...state.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          `[newland-web-kiosk] ${channel.label} listener threw`,
          error,
        );
      }
    }
  };

  const previousOriginal = state.original;
  // Publish the original before installing so an accessor that fires during
  // assignment can still chain to it.
  state.original = existing;

  try {
    channel.setGlobal(win, wrapper);
  } catch (error) {
    state.original = previousOriginal;
    state.wrapper = null;
    state.installed = false;
    throw error;
  }

  state.wrapper = wrapper;
  state.installed = true;
}

function uninstall<TEvent>(channel: Channel<TEvent>, win: Window): void {
  const { state } = channel;
  const wrapper = state.wrapper;

  if (wrapper) {
    try {
      if (channel.getGlobal(win) === wrapper) {
        channel.setGlobal(win, state.original);
      }
    } catch (error) {
      console.error(
        `[newland-web-kiosk] Failed to restore ${channel.label}`,
        error,
      );
    }
  }

  state.wrapper = null;
  state.original = undefined;
  state.installed = false;
}

function subscribe<TEvent>(
  channel: Channel<TEvent>,
  listener: (event: TEvent) => void,
): () => void {
  const win = getWindow();
  if (!win) {
    return () => {};
  }

  const { state } = channel;

  if (!state.installed) {
    try {
      install(channel, win);
    } catch (error) {
      console.error(
        `[newland-web-kiosk] Failed to install ${channel.label}`,
        error,
      );
      return () => {};
    }
  }

  state.listeners.add(listener);

  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;

    state.listeners.delete(listener);
    if (state.listeners.size === 0) {
      uninstall(channel, win);
    }
  };
}

export function subscribeBarcode(listener: BarcodeListener): () => void {
  return subscribe(barcodeChannel, listener);
}

export function subscribeNfc(listener: NfcListener): () => void {
  return subscribe(nfcChannel, listener);
}

function resetChannel<TEvent>(
  channel: Channel<TEvent>,
  win: Window | undefined,
): void {
  const { state } = channel;

  if (win && state.wrapper) {
    try {
      if (channel.getGlobal(win) === state.wrapper) {
        channel.setGlobal(win, state.original);
      }
    } catch (error) {
      console.error(
        `[newland-web-kiosk] Failed to restore ${channel.label}`,
        error,
      );
    }
  }

  state.listeners.clear();
  state.wrapper = null;
  state.original = undefined;
  state.installed = false;
}

export function resetRegistryForTests(): void {
  const win = getWindow();
  resetChannel(barcodeChannel, win);
  resetChannel(nfcChannel, win);
}
