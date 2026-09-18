'use client';
import { useEffect, useRef, useState } from 'react';
import type { ExpedicaoData } from '@/lib/expedicao';

const POLL_MS = 15_000;

export interface ExpedicaoState {
  data: ExpedicaoData | null;
  errorAt: string | null;
  updatedAt: string;
}

/** Polling de /api/expedicao. Compartilhado por /expedicao e /painel. */
export function useExpedicao(): ExpedicaoState {
  const [data, setData] = useState<ExpedicaoData | null>(null);
  const [errorAt, setErrorAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    const tick = async () => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const res = await fetch('/api/expedicao', { signal: controller.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setData(json);
        setErrorAt(null);
        setUpdatedAt(new Date().toLocaleTimeString('pt-BR'));
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          const msg = e instanceof Error ? e.message : String(e);
          setErrorAt(`${msg.slice(0, 60)} · ${new Date().toLocaleTimeString('pt-BR')}`);
        }
      } finally {
        inFlight.current = false;
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { clearInterval(id); controller.abort(); };
  }, []);

  return { data, errorAt, updatedAt };
}
