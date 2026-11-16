import Link from 'next/link';
import CabecalhoGestao from '@/components/CabecalhoGestao';
import Icone, { type NomeIcone } from '@/components/Icone';

/**
 * Índice das telas. A Leitura (tela do operador) não mostra os menus de
 * gestão; quem precisa deles chega por aqui.
 */
const TELAS: Array<{ href: string; icone: NomeIcone; titulo: string; para: string; texto: string }> = [
  {
    href: '/',
    icone: 'camera',
    titulo: 'Leitura de etiquetas',
    para: 'Produção',
    texto: 'Ler a etiqueta da peça e mudar a situação ou o local.',
  },
  {
    href: '/quadros',
    icone: 'local',
    titulo: 'Localização das peças',
    para: 'PCP',
    texto: 'Onde está cada peça, por obra ou por local. Pronto para imprimir.',
  },
  {
    href: '/painel',
    icone: 'tv',
    titulo: 'Painel da produção',
    para: 'TV da fábrica',
    texto: 'Meta do mês e próximas entregas. Vira expedição sozinho quando começam a expedir.',
  },
  {
    href: '/expedicao',
    icone: 'caminhao',
    titulo: 'Expedição',
    para: 'TV da fábrica',
    texto: 'Só a tela de expedição, sem alternar.',
  },
  {
    href: '/indicadores',
    icone: 'grafico',
    titulo: 'Indicadores',
    para: 'Diretoria',
    texto: 'Meta, prazos de entrega, ritmo da produção e carteira.',
  },
];

export default function TelasPage() {
  return (
    <div className="min-h-screen">
      <CabecalhoGestao titulo="Telas" voltarPara="/" voltarTexto="Leitura" />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <ul className="divide-y divide-linha border-y border-linha bg-white">
          {TELAS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex items-center gap-4 px-4 py-5 hover:bg-marca-50 active:bg-marca-100"
              >
                <span className="grid place-items-center w-12 h-12 rounded-xl bg-marca-100 text-marca">
                  <Icone nome={t.icone} className="w-7 h-7" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xl font-bold">{t.titulo}</span>
                    <span className="text-base text-tinta-suave">{t.para}</span>
                  </span>
                  <span className="block text-base text-tinta-suave mt-0.5">{t.texto}</span>
                </span>
                <Icone nome="avancar" className="w-6 h-6 text-tinta-suave" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
