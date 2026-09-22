'use client';
import { useEffect } from 'react';

/**
 * Segura a tela acesa enquanto o painel está aberto.
 *
 * Não substitui o "Keep Screen On" do quiosque, complementa: WebView antigo de
 * TV Box pode não ter `navigator.wakeLock`, e aí só resta a configuração do
 * Android. Aqui a ausência é tratada em silêncio, sem quebrar a página.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let cancelado = false;

    const pedir = async () => {
      // O lock é solto sozinho quando o documento fica oculto; pedir de novo
      // nesse estado só gera erro — o visibilitychange reencaminha depois.
      if (cancelado || document.hidden || lock) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        // Se a página foi desmontada durante o await, solta o que acabou de vir
        if (cancelado) { lock.release().catch(() => {}); lock = null; return; }
        lock.addEventListener('release', () => { lock = null; });
      } catch {
        // Negado (aba oculta, política do dispositivo, bateria) — o quiosque cobre
      }
    };

    const aoMudarVisibilidade = () => { if (!document.hidden) pedir(); };

    pedir();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      lock?.release().catch(() => {});
      lock = null;
    };
  }, []);
}
