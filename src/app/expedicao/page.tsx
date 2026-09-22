'use client';
import ExpedicaoClient from './ExpedicaoClient';
import { useExpedicao } from './useExpedicao';

export default function ExpedicaoPage() {
  return <ExpedicaoClient {...useExpedicao()} />;
}
