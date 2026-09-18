'use client';
import ResumoClient from '../resumo/ResumoClient';
import ExpedicaoClient from '../expedicao/ExpedicaoClient';
import { useExpedicao } from '../expedicao/useExpedicao';
import { expedicaoAtiva } from '@/lib/expedicao';

/**
 * Painel da TV. Produção e expedição se alternam na fábrica — enquanto ninguém
 * está expedindo, a tela é o resumo produtivo; quando um quadro é marcado como
 * Expedido, vira a tela de expedição, e volta sozinha quando ela termina ou para.
 *
 * /api/expedicao é consultado sempre (é a fonte da decisão); o ResumoClient só
 * existe no modo produção, então o polling do /api/resumo — bem mais caro —
 * para junto quando ele desmonta. Os dois nunca rodam ao mesmo tempo.
 */
export default function PainelPage() {
  const state = useExpedicao();
  return expedicaoAtiva(state.data)
    ? <ExpedicaoClient {...state} />
    : <ResumoClient tv />;
}
