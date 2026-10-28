import { beforeEach, describe, expect, it } from "vitest";
import type { NlScanApi } from "./types";
import { EMPTY_DEVICE_INFO } from "./types";
import { readDeviceInfo } from "./deviceInfo";
import { clearKioskGlobals } from "../../test/helpers";

beforeEach(() => {
  clearKioskGlobals();
});

function defineThrowingAccessor(target: NlScanApi, key: string): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error("accessor boom");
    },
  });
}

describe("readDeviceInfo", () => {
  it("returns the shared empty state when there is no nlScan", () => {
    delete window.nlScan;

    expect(readDeviceInfo()).toBe(EMPTY_DEVICE_INFO);
  });

  it("reads device properties", () => {
    window.nlScan = {
      DeviceModel: "NQuire 1000",
      SerialNumber: "SN-123",
      BuildNumber: "2.21",
      DeviceName: "Front desk",
    };

    expect(readDeviceInfo()).toEqual({
      model: "NQuire 1000",
      serialNumber: "SN-123",
      buildNumber: "2.21",
      deviceName: "Front desk",
      isSupported: true,
    });
  });

  it("reads zero-argument getter methods", () => {
    window.nlScan = {
      GetDeviceModel: () => "NQuire 1000",
      GetSerialNumber: () => "SN-123",
      GetBuildNumber: () => "2.21",
      GetDeviceName: () => "Front desk",
    };

    expect(readDeviceInfo()).toEqual({
      model: "NQuire 1000",
      serialNumber: "SN-123",
      buildNumber: "2.21",
      deviceName: "Front desk",
      isSupported: true,
    });
  });

  it("reads all four confirmed MT90 NGet* getters", () => {
    window.nlScan = {
      NGetModel: () => "MT90",
      NGetSerial: () => "SN-456",
      NGetBuild: () => "2.21",
      NGetDeviceName: () => "Kiosk 1",
    };

    expect(readDeviceInfo()).toEqual({
      model: "MT90",
      serialNumber: "SN-456",
      buildNumber: "2.21",
      deviceName: "Kiosk 1",
      isSupported: true,
    });
  });

  it("prefers NGetModel over a DeviceModel fallback property", () => {
    window.nlScan = {
      NGetModel: () => "MT90",
      DeviceModel: "NQuire 1000",
    };

    expect(readDeviceInfo()).toMatchObject({
      model: "MT90",
      isSupported: true,
    });
  });

  it("falls back to alternate property names", () => {
    window.nlScan = {
      Model: "NQuire 1000",
      SN: "SN-123",
      Build: "2.21",
      Name: "Front desk",
    };

    expect(readDeviceInfo()).toEqual({
      model: "NQuire 1000",
      serialNumber: "SN-123",
      buildNumber: "2.21",
      deviceName: "Front desk",
      isSupported: true,
    });
  });

  it("mixes properties and getters", () => {
    window.nlScan = {
      DeviceModel: "NQuire 1000",
      GetSerialNumber: () => "SN-123",
      BuildNumber: "2.21",
      Name: "Front desk",
    };

    expect(readDeviceInfo()).toEqual({
      model: "NQuire 1000",
      serialNumber: "SN-123",
      buildNumber: "2.21",
      deviceName: "Front desk",
      isSupported: true,
    });
  });

  it("skips a throwing getter method and uses a fallback property", () => {
    const api: NlScanApi = {
      GetDeviceModel: () => {
        throw new Error("boom");
      },
      Model: "Fallback model",
    };
    window.nlScan = api;

    expect(() => readDeviceInfo()).not.toThrow();
    expect(readDeviceInfo()).toMatchObject({
      model: "Fallback model",
      isSupported: true,
    });
  });

  it("treats a throwing property accessor as missing", () => {
    const api: NlScanApi = {};
    defineThrowingAccessor(api, "DeviceModel");
    window.nlScan = api;

    expect(() => readDeviceInfo()).not.toThrow();
    expect(readDeviceInfo()).toMatchObject({
      model: null,
      isSupported: true,
    });
  });

  it("uses a later fallback when the property accessor throws", () => {
    const api: NlScanApi = { Model: "Fallback model" };
    defineThrowingAccessor(api, "DeviceModel");
    window.nlScan = api;

    expect(() => readDeviceInfo()).not.toThrow();
    expect(readDeviceInfo()).toMatchObject({
      model: "Fallback model",
      isSupported: true,
    });
  });
});
