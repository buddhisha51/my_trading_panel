import type { ChecklistRule } from '../types/notes';

export type SetupGrade = 'A+' | 'A' | 'B' | 'C';

export interface GradeEvaluation {
  grade: SetupGrade;
  requiredMet: number;
  requiredTotal: number;
  optionalMet: number;
  optionalTotal: number;
  totalMet: number;
  total: number;
  scorePercent: number;
  missingRequiredNames: string[];
}

/**
 * Computes ICT setup execution grade (A+ / A / B / C) from Strategy Confluence Checklist items:
 * - A+: All required met AND 100% of total checklist items met (with at least 1 rule).
 * - A : All required met AND >= 75% of total checklist items met.
 * - B : All required met (< 75% optional checked).
 * - C : Any required rule unchecked (or empty checklist).
 */
export function evaluateSetupChecklist(
  checklist: ChecklistRule[],
  checkedIds: Set<string>,
): GradeEvaluation {
  if (checklist.length === 0) {
    return {
      grade: 'C',
      requiredMet: 0,
      requiredTotal: 0,
      optionalMet: 0,
      optionalTotal: 0,
      totalMet: 0,
      total: 0,
      scorePercent: 0,
      missingRequiredNames: [],
    };
  }

  const required = checklist.filter((c) => c.isRequired);
  const optional = checklist.filter((c) => !c.isRequired);

  const missingRequiredNames = required
    .filter((c) => !checkedIds.has(c.id))
    .map((c) => c.name);
  const requiredMet = required.length - missingRequiredNames.length;
  const optionalMet = optional.filter((c) => checkedIds.has(c.id)).length;
  const totalMet = requiredMet + optionalMet;
  const total = checklist.length;
  const scorePercent = Math.round((totalMet / total) * 100);

  let grade: SetupGrade = 'C';
  if (requiredMet === required.length) {
    if (totalMet === total) grade = 'A+';
    else if (totalMet / total >= 0.75) grade = 'A';
    else grade = 'B';
  }

  return {
    grade,
    requiredMet,
    requiredTotal: required.length,
    optionalMet,
    optionalTotal: optional.length,
    totalMet,
    total,
    scorePercent,
    missingRequiredNames,
  };
}

export function computeSetupGrade(
  checklist: ChecklistRule[],
  checkedIds: Set<string>,
): SetupGrade {
  return evaluateSetupChecklist(checklist, checkedIds).grade;
}

export function gradeColor(grade: SetupGrade): string {
  switch (grade) {
    case 'A+':
      return '#10B981';
    case 'A':
      return '#3B82F6';
    case 'B':
      return '#F59E0B';
    case 'C':
      return '#EF4444';
  }
}
