import ResumoClient from './ResumoClient';

export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  const tv = (await searchParams).tv === '1';
  return <ResumoClient tv={tv} />;
}
