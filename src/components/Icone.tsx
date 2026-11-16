/**
 * Ícones de traço no mesmo desenho dos do Shine CRM (app/js/icones.js):
 * grade 24×24, traço 2, pontas arredondadas, cor do texto em volta.
 */
const DESENHOS = {
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  numero: (
    <>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </>
  ),
  check: <path d="M4 12.5 9.5 18 20 6" />,
  voltar: <path d="M19 12H5M11 18l-6-6 6-6" />,
  avancar: <path d="M9 18l6-6-6-6" />,
  fechar: <path d="M18 6 6 18M6 6l12 12" />,
  imprimir: (
    <>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </>
  ),
  alerta: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  local: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  caminhao: (
    <>
      <path d="M1 4h14v12H1zM15 9h4l3 3v4h-7z" />
      <circle cx="5.5" cy="18.5" r="2" />
      <circle cx="18.5" cy="18.5" r="2" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  grafico: <path d="M3 3v18h18M8 17v-5M13 17V7M18 17v-8" />,
  lista: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  etiqueta: (
    <>
      <path d="M3 3h7l11 11-7 7L3 10z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  refazer: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />,
  tema: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
} as const;

export type NomeIcone = keyof typeof DESENHOS;

export default function Icone({
  nome,
  className = 'w-[18px] h-[18px]',
  titulo,
}: {
  nome: NomeIcone;
  className?: string;
  /** Só quando o ícone é a única coisa que explica o botão */
  titulo?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      {DESENHOS[nome]}
    </svg>
  );
}
