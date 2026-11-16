import { redirect } from 'next/navigation';

/**
 * O antigo Resumo virou duas telas: a da TV (/painel) e os Indicadores da
 * diretoria. Endereços salvos continuam funcionando.
 */
export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  const tv = (await searchParams).tv === '1';
  redirect(tv ? '/painel' : '/indicadores');
}
