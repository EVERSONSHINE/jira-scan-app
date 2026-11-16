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
    return 'Sem permissão para usar a câmera. Libere a câmera nas configurações do navegador (cadeado ao lado do endereço).';
  }
  if (/NotFound|Requested device not found/i.test(t)) return 'Este aparelho não tem câmera disponível.';
  if (/NotReadable|in use|Could not start/i.test(t)) {
    return 'A câmera está sendo usada por outro aplicativo. Feche-o e tente de novo.';
  }
  if (/secure|https/i.test(t)) return 'A câmera só funciona no endereço seguro (https).';
  return 'Não foi possível abrir a câmera.';
}

/** Leitor numa janela sobre a tela, como os diálogos do CRM */
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
            // Área de leitura proporcional à janela, não fixa
            qrbox: (w: number, h: number) => {
              const lado = Math.floor(Math.min(w, h) * 0.7);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color:var(--overlay)]"
      role="dialog"
      aria-modal="true"
      aria-label="Ler etiqueta"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-lg2 bg-superficie border border-linha shadow-pop">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-linha">
          <h2 className="text-base">Ler etiqueta</h2>
          <button type="button" onClick={onClose} className="btn-icone -mr-2" aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
        {error ? (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-perigo">{error}</p>
            <button type="button" onClick={onDigitar} className="btn btn-secundario">
              <Icone nome="numero" /> Digitar o número
            </button>
          </div>
        ) : (
          <>
            <div id="qr-reader" className="w-full bg-black" />
            <p className="px-4 py-3 text-[13px] text-tinta-suave text-center">
              Aponte para o QR code da etiqueta.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
