"use client";

import { useEffect, useRef } from 'react';
import type { BarcodeScanEvent } from '../core/types';
import { subscribeBarcode } from '../core/registry';

export function useBarcodeScan(handler: (event: BarcodeScanEvent) => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    return subscribeBarcode((event) => {
      handlerRef.current(event);
    });
  }, []);
}
