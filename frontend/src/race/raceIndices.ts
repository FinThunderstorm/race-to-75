import { dotsIndex, hasDotsSex, prepareDotsHistory } from './dots'
import { prepareMeasurementHistory, type RaceParticipant } from './prepareRace'

export const bicepsIndex = (circumferenceCm: number, heightCm: number) =>
  (100 * circumferenceCm) / heightCm

export const bmiRange = { min: 18.5, max: 25 } as const
export const bloodPressureRanges = {
  systolic: { min: 90, max: 120 },
  diastolic: { min: 60, max: 80 }
} as const

// Shared game rules, not a clinically validated health score.
export const bmiIndex = (bmi: number) => 100 * Math.min(1, bmi / bmiRange.min, bmiRange.max / bmi)

export const bloodPressureIndex = (systolic: number, diastolic: number) =>
  100 *
  Math.min(
    1,
    systolic / bloodPressureRanges.systolic.min,
    bloodPressureRanges.systolic.max / systolic,
    diastolic / bloodPressureRanges.diastolic.min,
    bloodPressureRanges.diastolic.max / diastolic
  )

type DailyBloodPressure = { date: string; systolic: number; diastolic: number }
type DailyValue = { date: string; value: number }
export type ScoreComponents = {
  weight: DailyValue
  biceps: DailyValue
  bmi: number
  bmiIndex: number
  bicepsIndex: number
  bicepsPoints: number
  dots: DailyValue
  dotsIndex: number
  bloodPressure: DailyBloodPressure
  bloodPressureIndex: number
}

export function prepareScoreHistory(person: RaceParticipant, heightCm: number, now: Date) {
  if (!hasDotsSex(person.sex)) {
    return { ...prepareMeasurementHistory([], now), scoreComponents: null }
  }
  const dotsDaily = prepareDotsHistory(person, now).daily
  const bicepsDaily = prepareMeasurementHistory(
    (person.bicepsMeasurements ?? []).map(({ measuredAt, circumferenceCm }) => ({
      measuredAt,
      value: circumferenceCm
    })),
    now
  ).daily
  const pressureReadings = person.bloodPressureMeasurements ?? []
  const systolicDaily = prepareMeasurementHistory(
    pressureReadings.map(({ measuredAt, systolic }) => ({ measuredAt, value: systolic })),
    now
  ).daily
  const diastolicDaily = prepareMeasurementHistory(
    pressureReadings.map(({ measuredAt, diastolic }) => ({ measuredAt, value: diastolic })),
    now
  ).daily
  const days = new Map<
    string,
    {
      weight?: DailyValue
      biceps?: DailyValue
      bloodPressure?: DailyBloodPressure
      dots?: DailyValue
    }
  >()
  for (const reading of dotsDaily) {
    days.set(reading.date, { dots: reading })
  }
  for (const { date, weight } of person.dailyWeights) {
    days.set(date, { ...days.get(date), weight: { date, value: weight } })
  }
  for (const reading of bicepsDaily) {
    days.set(reading.date, { ...days.get(reading.date), biceps: reading })
  }
  // Both pressures come from the same paired readings, so daily dates align.
  for (const [index, reading] of systolicDaily.entries()) {
    days.set(reading.date, {
      ...days.get(reading.date),
      bloodPressure: {
        date: reading.date,
        systolic: reading.value,
        diastolic: diastolicDaily[index].value
      }
    })
  }
  let dots: DailyValue | undefined
  let bloodPressure: DailyBloodPressure | undefined
  let weight: DailyValue | undefined
  let biceps: DailyValue | undefined
  let scoreComponents: ScoreComponents | null = null
  const measurements = []
  for (const [date, day] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    dots = day.dots ?? dots
    weight = day.weight ?? weight
    biceps = day.biceps ?? biceps
    bloodPressure = day.bloodPressure ?? bloodPressure
    if (!weight || !biceps || !bloodPressure || !dots) {
      continue
    }
    const bmi = weight.value / (heightCm / 100) ** 2
    scoreComponents = {
      weight,
      biceps,
      bmi,
      bmiIndex: bmiIndex(bmi),
      bicepsIndex: bicepsIndex(biceps.value, heightCm),
      bicepsPoints: 5 * bicepsIndex(biceps.value, heightCm),
      dots,
      dotsIndex: dotsIndex(dots.value, person.sex),
      bloodPressure,
      bloodPressureIndex: bloodPressureIndex(bloodPressure.systolic, bloodPressure.diastolic)
    }
    measurements.push({
      measuredAt: date,
      value:
        (scoreComponents.bicepsPoints +
          scoreComponents.bmiIndex +
          scoreComponents.bloodPressureIndex +
          scoreComponents.dotsIndex) /
        4
    })
  }
  return { ...prepareMeasurementHistory(measurements, now), scoreComponents }
}
