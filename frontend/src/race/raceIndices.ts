import { prepareMeasurementHistory, type RaceParticipant } from './prepareRace'

export const bicepsIndex = (circumferenceCm: number, heightCm: number) =>
  (100 * circumferenceCm) / heightCm

// Shared game rules, not a clinically validated health score.
export const bmiIndex = (bmi: number) => 100 * Math.min(1, bmi / 18.5, 25 / bmi)

type DailyValue = { date: string; value: number }
export type ScoreComponents = {
  weight: DailyValue
  biceps: DailyValue
  bmi: number
  bmiIndex: number
  bicepsIndex: number
}

export function prepareScoreHistory(person: RaceParticipant, heightCm: number, now: Date) {
  const bicepsDaily = prepareMeasurementHistory(
    (person.bicepsMeasurements ?? []).map(({ measuredAt, circumferenceCm }) => ({
      measuredAt,
      value: circumferenceCm
    })),
    now
  ).daily
  const days = new Map<string, { weight?: DailyValue; biceps?: DailyValue }>()
  for (const { date, weight } of person.dailyWeights) {
    days.set(date, { weight: { date, value: weight } })
  }
  for (const reading of bicepsDaily) {
    days.set(reading.date, { ...days.get(reading.date), biceps: reading })
  }
  let weight: DailyValue | undefined
  let biceps: DailyValue | undefined
  let scoreComponents: ScoreComponents | null = null
  const measurements = []
  for (const [date, day] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    weight = day.weight ?? weight
    biceps = day.biceps ?? biceps
    if (!weight || !biceps) {
      continue
    }
    const bmi = weight.value / (heightCm / 100) ** 2
    scoreComponents = {
      weight,
      biceps,
      bmi,
      bmiIndex: bmiIndex(bmi),
      bicepsIndex: bicepsIndex(biceps.value, heightCm)
    }
    measurements.push({
      measuredAt: date,
      value: (scoreComponents.bicepsIndex * scoreComponents.bmiIndex) / 100
    })
  }
  return { ...prepareMeasurementHistory(measurements, now), scoreComponents }
}
