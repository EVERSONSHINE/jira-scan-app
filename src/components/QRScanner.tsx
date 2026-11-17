'use client';
import { useEffect, useRef, useState } from 'react';
import { CameraOff, ScanLine, X } from 'lucide-react';

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escanear QR code"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand/90 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-slate-200 py-2 pl-4 pr-2">
          <span className="flex items-center gap-2 font-semibold text-slate-900">
            <ScanLine className="h-5 w-5 text-brand" strokeWidth={2} /> Escanear QR code
          </span>
          <button
            onClick={onClose}
            aria-label="Fechar câmera"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        {error ? (
          <div className="flex gap-3 p-5 text-sm text-red-800">
            <CameraOff className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <div>
              <p className="font-semibold">Não foi possível abrir a câmera.</p>
              <p className="mt-1 text-slate-600">Confira se o navegador tem permissão para usar a câmera e tente de novo.</p>
              <p className="mt-2 break-words font-mono text-xs text-slate-500">{error}</p>
            </div>
          </div>
        ) : (
          <div id="qr-reader" className="w-full bg-slate-900" />
        )}
        <p className="px-4 py-3 text-center text-sm text-slate-600">Centralize o QR code da etiqueta no quadro.</p>
      </div>
    </div>
  );
}
