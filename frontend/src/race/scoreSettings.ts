export const defaultScoreComponents = ['bmi', 'biceps', 'blood-pressure', 'dots'] as const
export type ScoreComponent = (typeof defaultScoreComponents)[number]
export type ScoreSettings = { components: ScoreComponent[] }
export const scoreComponentLabels: Record<ScoreComponent, string> = {
  bmi: 'BMI',
  biceps: 'Hauis',
  'blood-pressure': 'Verenpaine',
  dots: 'DOTS (SBD-tulokset)'
}
