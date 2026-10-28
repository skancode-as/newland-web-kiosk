"use client";

import { useEffect, useRef } from 'react';
import type { NfcEvent } from '../core/types';
import { subscribeNfc } from '../core/registry';

export function useNfc(handler: (event: NfcEvent) => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    return subscribeNfc((event) => {
      handlerRef.current(event);
    });
  }, []);
}
