'use client';
import { CourtCounter } from '../CourtCounter';
import type { StepProps } from '../types';

export function Step6Courts({ draft, patch }: StepProps) {
  return <CourtCounter value={draft.numCourts} onChange={(n) => patch({ numCourts: n })} />;
}
