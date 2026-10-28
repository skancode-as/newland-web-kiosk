"use client";

import { useCallback, useEffect, useState } from 'react';
import { readDeviceInfo } from '../core/deviceInfo';
import { EMPTY_DEVICE_INFO } from '../core/types';
import type { DeviceInfoState } from '../core/types';

export interface UseDeviceInfoResult extends DeviceInfoState {
  refresh(): void;
}

export function useDeviceInfo(): UseDeviceInfoResult {
  const [info, setInfo] = useState<DeviceInfoState>(EMPTY_DEVICE_INFO);

  const refresh = useCallback(() => {
    setInfo(readDeviceInfo());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...info, refresh };
}
