'use client';
import { useEffect, useRef, useState } from 'react';
import Icone from './Icone';

interface Props {
  onScan: (result: string) => void;
  onClose: () => void;
  /** Saída para quem não consegue usar a câmera */
  onDigitar: () => void;
}

/** Traduz o erro do navegador para o que a pessoa precisa fazer */
function mensagemCamera(e: unknown): string {
  const t = String((e as { name?: string })?.name ?? '') + ' ' + String(e);
  if (/NotAllowed|Permission/i.test(t)) {
    return 'O aplicativo não tem permissão para usar a câmera. Toque no cadeado ao lado do endereço do site e libere a câmera.';
  }
  if (/NotFound|Requested device not found/i.test(t)) {
    return 'Este aparelho não tem câmera disponível.';
  }
  if (/NotReadable|in use|Could not start/i.test(t)) {
    return 'A câmera está ocupada por outro aplicativo. Feche o outro aplicativo e tente de novo.';
  }
  if (/secure|https/i.test(t)) {
    return 'A câmera só funciona com o endereço seguro (https).';
  }
  return 'Não foi possível abrir a câmera.';
}

/**
 * Leitor em tela cheia. Fundo preto, instrução grande no topo e botões largos
 * embaixo, onde o polegar alcança.
 */
export default function QRScanner({ onScan, onClose, onDigitar }: Props) {
  const [error, setError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function start() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mountedRef.current) return;

        const scanner = new Html5Qrcode('qr-reader', /* verbose */ false);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            // Área de leitura proporcional à tela, não fixa em 260px
            qrbox: (w: number, h: number) => {
              const lado = Math.floor(Math.min(w, h) * 0.72);
              return { width: lado, height: lado };
            },
          },
          (text: string) => onScan(text),
          () => { /* quadro sem código: normal enquanto a pessoa mira */ },
        );
      } catch (e) {
        if (mountedRef.current) setError(mensagemCamera(e));
      }
    }

    start();

    return () => {
      mountedRef.current = false;
      scannerRef.current?.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black text-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Leitor de etiqueta"
    >
      <p className="px-5 pt-6 pb-4 text-2xl font-bold text-center">
        {error ? 'Câmera indisponível' : 'Aponte para o código da etiqueta'}
      </p>

      <div className="flex-1 flex items-center justify-center px-4 min-h-0">
        {error ? (
          <p className="max-w-md text-xl leading-relaxed text-center">{error}</p>
        ) : (
          <div id="qr-reader" className="w-full max-w-lg overflow-hidden rounded-2xl" />
        )}
      </div>

      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] grid gap-3">
        {error && (
          <button
            onClick={onDigitar}
            className="h-16 rounded-2xl bg-white text-marca text-xl font-bold flex items-center justify-center gap-3"
          >
            <Icone nome="numero" className="w-7 h-7" />
            Digitar o número
          </button>
        )}
        <button
          onClick={onClose}
          className="h-16 rounded-2xl border-2 border-white text-xl font-bold flex items-center justify-center gap-3 active:bg-white/15"
        >
          <Icone nome="fechar" className="w-7 h-7" />
          Fechar
        </button>
      </div>
    </div>
  );
}
