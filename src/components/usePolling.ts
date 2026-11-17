'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { marcarSucesso } from '@/lib/autoreload';

/**
 * Busca uma rota JSON e, se `intervaloMs` vier, repete enquanto a aba está
 * visível. Mantém os últimos dados quando uma busca falha (a TV não pode
 * apagar a tela por uma queda momentânea do Jira).
 */
export function usePolling<T>(url: string, intervaloMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emVoo = useRef(false);

  const load = useCallback(async () => {
    if (emVoo.current) return;
    emVoo.current = true;
    setLoading(true);
    try {
      const res = await fetch(url);
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json as T);
      setError(null);
      marcarSucesso();
    } catch (e) {
      setError(String(e).replace(/^(Error: )+/, ''));
    } finally {
      emVoo.current = false;
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    if (!intervaloMs) return;
    const id = setInterval(() => { if (!document.hidden) load(); }, intervaloMs);
    return () => clearInterval(id);
  }, [load, intervaloMs]);

  return { data, error, loading, reload: load };
}
