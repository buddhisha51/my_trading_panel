import { describe, expect, it } from 'vitest';
import type { ChecklistRule } from '../../types/notes';
import { computeSetupGrade, evaluateSetupChecklist } from '../strategyGrade';

const sampleChecklist: ChecklistRule[] = [
  { id: 'r1', name: 'HTF Bias', description: null, sortOrder: 0, isRequired: true },
  { id: 'r2', name: 'Liquidity Sweep', description: null, sortOrder: 1, isRequired: true },
  { id: 'r3', name: 'MSS + FVG', description: null, sortOrder: 2, isRequired: false },
  { id: 'r4', name: 'Killzone Timing', description: null, sortOrder: 3, isRequired: false },
];

describe('strategyGrade', () => {
  it('returns C when checklist is empty or a required condition is missing', () => {
    expect(computeSetupGrade([], new Set())).toBe('C');
    // Missing r2 (required), even with both optionals checked
    expect(computeSetupGrade(sampleChecklist, new Set(['r1', 'r3', 'r4']))).toBe('C');
  });

  it('computes B, A, and A+ tiers accurately from checked counts', () => {
    // 2/4 = 50% (all required met) -> B
    expect(computeSetupGrade(sampleChecklist, new Set(['r1', 'r2']))).toBe('B');
    // 3/4 = 75% (all required met) -> A
    expect(computeSetupGrade(sampleChecklist, new Set(['r1', 'r2', 'r3']))).toBe('A');
    // 4/4 = 100% -> A+
    const res = evaluateSetupChecklist(
      sampleChecklist,
      new Set(['r1', 'r2', 'r3', 'r4']),
    );
    expect(res.grade).toBe('A+');
    expect(res.scorePercent).toBe(100);
    expect(res.missingRequiredNames).toEqual([]);
  });
});
