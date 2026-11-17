import { redirect } from 'next/navigation';

/**
 * O antigo Resumo virou duas telas: Indicadores (diretoria) e Painel (TV).
 * Endereço mantido para favoritos e para TV que ainda abra /resumo?tv=1.
 */
export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  redirect((await searchParams).tv === '1' ? '/painel' : '/indicadores');
}
