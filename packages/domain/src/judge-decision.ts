export type JudgeDecisionCall = 'white' | 'red';

export function resolveJudgeMajority(
  eligibleJudges: number,
  calls: readonly JudgeDecisionCall[],
): 'good_lift' | 'no_lift' | 'pending' {
  if (eligibleJudges < 1) return 'pending';

  const white = calls.filter((call) => call === 'white').length;
  const red = calls.length - white;
  const majority = Math.floor(eligibleJudges / 2) + 1;

  if (white >= majority) return 'good_lift';
  if (red >= majority) return 'no_lift';
  return 'pending';
}
