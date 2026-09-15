import { dotsIndex, hasDotsSex, prepareDotsHistory } from './dots'
import { prepareMeasurementHistory, type RaceParticipant } from './prepareRace'
import { defaultScoreComponents, type ScoreComponent } from './scoreSettings'

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
export type ScoreComponents = Partial<{
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
}>

export function prepareScoreHistory(
  person: RaceParticipant,
  heightCm: number | null | undefined,
  now: Date,
  selected: readonly ScoreComponent[] = defaultScoreComponents
) {
  const enabled = new Set(selected)
  if (
    !enabled.size ||
    (enabled.has('dots') && !hasDotsSex(person.sex)) ||
    ((enabled.has('bmi') || enabled.has('biceps')) &&
      (!heightCm || !Number.isFinite(heightCm) || heightCm < 50 || heightCm > 300))
  ) {
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
  for (const reading of enabled.has('dots') ? dotsDaily : []) {
    days.set(reading.date, { dots: reading })
  }
  for (const { date, weight } of enabled.has('bmi') ? person.dailyWeights : []) {
    days.set(date, { ...days.get(date), weight: { date, value: weight } })
  }
  for (const reading of enabled.has('biceps') ? bicepsDaily : []) {
    days.set(reading.date, { ...days.get(reading.date), biceps: reading })
  }
  // Both pressures come from the same paired readings, so daily dates align.
  for (const [index, reading] of (enabled.has('blood-pressure') ? systolicDaily : []).entries()) {
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
    const components: ScoreComponents = {}
    if (enabled.has('bmi')) {
      if (!weight) {
        continue
      }
      const bmi = weight.value / (heightCm! / 100) ** 2
      Object.assign(components, { weight, bmi, bmiIndex: bmiIndex(bmi) })
    }
    if (enabled.has('biceps')) {
      if (!biceps) {
        continue
      }
      const index = bicepsIndex(biceps.value, heightCm!)
      Object.assign(components, { biceps, bicepsIndex: index, bicepsPoints: 5 * index })
    }
    if (enabled.has('blood-pressure')) {
      if (!bloodPressure) {
        continue
      }
      Object.assign(components, {
        bloodPressure,
        bloodPressureIndex: bloodPressureIndex(bloodPressure.systolic, bloodPressure.diastolic)
      })
    }
    if (enabled.has('dots')) {
      if (!dots || !hasDotsSex(person.sex)) {
        continue
      }
      Object.assign(components, { dots, dotsIndex: dotsIndex(dots.value, person.sex) })
    }
    scoreComponents = components
    measurements.push({
      measuredAt: date,
      value:
        ((components.bicepsPoints ?? 0) +
          (components.bmiIndex ?? 0) +
          (components.bloodPressureIndex ?? 0) +
          (components.dotsIndex ?? 0)) /
        enabled.size
    })
  }
  return { ...prepareMeasurementHistory(measurements, now), scoreComponents }
}
