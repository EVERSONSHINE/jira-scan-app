'use client';
import { useEffect, useRef, useState } from 'react';
import Icone from './Icone';

interface Props {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
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

        const scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (text: string) => {
            onScan(text);
          },
          () => { /* ignore scan errors */ },
        );
      } catch (e) {
        if (mountedRef.current) setError(String(e));
      }
    }

    start();

    return () => {
      mountedRef.current = false;
      scannerRef.current?.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-label="Ler etiqueta">
      <div className="flex items-center justify-between px-4 h-16 text-white shrink-0">
        <span className="font-titulo font-bold text-lg">Aponte para o QR da etiqueta</span>
        <button onClick={onClose} className="grid place-items-center w-12 h-12 -mr-2 rounded-full active:bg-white/10" aria-label="Fechar câmera">
          <Icone nome="x" className="w-7 h-7" />
        </button>
      </div>
      <div className="flex-1 grid place-items-center px-4 pb-8">
        {error ? (
          <div className="max-w-sm rounded-xl bg-white p-5 text-sm text-red-700">
            <p className="font-semibold mb-1">Não foi possível abrir a câmera</p>
            <p className="text-red-600/80 break-words">{error}</p>
          </div>
        ) : (
          <div id="qr-reader" className="w-full max-w-md overflow-hidden rounded-xl" />
        )}
      </div>
    </div>
  );
}
