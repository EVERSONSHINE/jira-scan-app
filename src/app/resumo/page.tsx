import { redirect } from 'next/navigation';

/**
 * O antigo Resumo virou duas telas: o painel da produção (TV) e os
 * indicadores da diretoria. Links e favoritos antigos continuam funcionando.
 */
export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  redirect((await searchParams).tv === '1' ? '/painel' : '/indicadores');
}
