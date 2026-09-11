import type { RaceHistoryParticipant, SbdMeasurement, Sex } from '../api/raceApi'
import { prepareMeasurementHistory } from './prepareRace'

export const dotsLevels = [
  { label: 'Novice', male: 200, female: 150 },
  { label: 'Intermediate', male: 300, female: 250 },
  { label: 'Advanced', male: 400, female: 325 },
  { label: 'Elite / National Level', male: 500, female: 400 }
] as const

export const hasDotsSex = (sex?: string | null): sex is Sex => sex === 'male' || sex === 'female'
export const dotsBodyweight = (weight: number, sex: Sex) =>
  Math.min(sex === 'male' ? 210 : 150, Math.max(40, weight))

// Published DOTS polynomial, also used by OpenPowerlifting:
// https://gitlab.com/openpowerlifting/opl-data/blob/main/crates/coefficients/src/dots.rs
export function calculateDots(totalKg: number, bodyweightKg: number, sex?: Sex | null) {
  if (
    !hasDotsSex(sex) ||
    !Number.isFinite(totalKg) ||
    totalKg <= 0 ||
    !Number.isFinite(bodyweightKg) ||
    bodyweightKg <= 0
  ) {
    return null
  }
  const w = dotsBodyweight(bodyweightKg, sex)
  const denominator =
    sex === 'male'
      ? -307.75076 +
        24.0900756 * w -
        0.1918759221 * w ** 2 +
        0.0007391293 * w ** 3 -
        0.000001093 * w ** 4
      : -57.96288 +
        13.6175032 * w -
        0.1126655495 * w ** 2 +
        0.0005158568 * w ** 3 -
        0.0000010706 * w ** 4
  return (totalKg * 500) / denominator
}

export const sbdTotal = (reading: Pick<SbdMeasurement, 'squatKg' | 'benchKg' | 'deadliftKg'>) =>
  reading.squatKg + reading.benchKg + reading.deadliftKg

export const dotsIndex = (dots: number, sex: Sex) => (100 * dots) / dotsLevels[0][sex]
export const dotsLevel = (dots: number, sex: Sex) =>
  dotsLevels.filter((level) => dots >= level[sex]).at(-1)?.label ?? 'Alle Novice-tason'

export function prepareDotsHistory(
  person: Pick<RaceHistoryParticipant, 'sex' | 'sbdMeasurements'>,
  now: Date
) {
  return prepareMeasurementHistory(
    (person.sbdMeasurements ?? []).flatMap((reading) => {
      const value = calculateDots(sbdTotal(reading), reading.bodyweightKg, person.sex)
      return value === null ? [] : [{ measuredAt: reading.measuredAt, value }]
    }),
    now
  )
}
