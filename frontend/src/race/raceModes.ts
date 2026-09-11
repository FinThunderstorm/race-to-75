import type { Sex } from '../api/raceApi'
import { paddedChartRange } from './chartScale'
import { dotsIndex, hasDotsSex, prepareDotsHistory } from './dots'
import { chartWindow, prepareMeasurementHistory, type RaceParticipant } from './prepareRace'
import {
  bicepsIndex,
  bloodPressureIndex,
  bloodPressureRanges,
  bmiIndex,
  bmiRange,
  prepareScoreHistory,
  type ScoreComponents
} from './raceIndices'

export type RaceMode = 'classic' | 'bmi' | 'biceps' | 'score' | 'blood-pressure' | 'dots'
export const raceModeOrder: RaceMode[] = [
  'classic',
  'bmi',
  'biceps',
  'blood-pressure',
  'dots',
  'score'
]
export function parseRaceMode(value: string | null): RaceMode {
  return raceModeOrder.find((mode) => mode === value) ?? 'classic'
}

export const raceModes = {
  classic: {
    label: 'Paino',
    unit: 'kg',
    unitLabel: 'kilogrammaa',
    metric: 'paino',
    reference: 75,
    title: 'Kisa 75 kiloon',
    referenceLabel: '75,0 KG — TAVOITE'
  },
  bmi: {
    label: 'BMI',
    unit: 'BMI',
    unitLabel: 'BMI',
    metric: 'BMI',
    reference: null,
    title: 'Ryhmän BMI-historia',
    referenceLabel: null
  },
  biceps: {
    label: 'Hauis',
    unit: 'cm',
    unitLabel: 'cm',
    metric: 'hauiksen ympärysmitta',
    reference: null,
    title: 'Ryhmän hauismittausten historia',
    referenceLabel: null
  },
  'blood-pressure': {
    label: 'Verenpaine',
    unit: 'mmHg',
    unitLabel: 'mmHg',
    metric: 'verenpaine',
    reference: null,
    title: 'Ryhmän verenpainehistoria',
    referenceLabel: null
  },
  dots: {
    label: 'DOTS',
    unit: 'DOTS',
    unitLabel: 'DOTS-pistettä',
    metric: 'DOTS',
    reference: null,
    title: 'Ryhmän DOTS-historia',
    referenceLabel: null
  },
  score: {
    label: 'Ihmisarvo',
    unit: 'kp',
    unitLabel: 'kansalaispistettä',
    metric: 'ihmisarvo',
    reference: null,
    title: 'Ryhmän ihmisarvon historia',
    referenceLabel: null
  }
} as const

export type ReferenceBand = { min: number; max: number; label: string; color: string }
export const raceBands: Record<RaceMode, readonly ReferenceBand[]> = {
  classic: [],
  score: [],
  dots: [],
  biceps: [],
  bmi: [{ ...bmiRange, label: 'BMI', color: '#00eda0' }],
  'blood-pressure': [
    { ...bloodPressureRanges.systolic, label: 'Yläpaine', color: '#00eda0' },
    { ...bloodPressureRanges.diastolic, label: 'Alapaine', color: '#35dfff' }
  ]
}

export function raceCitizenPoints(
  mode: RaceMode,
  value: number,
  heightCm?: number | null,
  diastolic?: number,
  sex?: Sex | null
): number | null {
  if (mode === 'dots' && hasDotsSex(sex)) {
    return dotsIndex(value, sex)
  }
  if (mode === 'bmi') {
    return bmiIndex(value)
  }
  if (mode === 'biceps' && heightCm && heightCm >= 50 && heightCm <= 300) {
    return bicepsIndex(value, heightCm)
  }
  if (mode === 'blood-pressure' && diastolic !== undefined) {
    return bloodPressureIndex(value, diastolic)
  }
  return null
}

export type RaceViewParticipant = Omit<RaceParticipant, 'points' | 'latest' | 'startWeight'> & {
  points: { date: string; value: number; period: 'week' | 'day' }[]
  latest: { date: string; value: number } | null
  startValue: number | null
  needsHeight: boolean
  needsSex: boolean
  diastolic?: ReturnType<typeof prepareMeasurementHistory>
  scoreComponents: ScoreComponents | null
}

export function createRaceView(
  participants: RaceParticipant[],
  mode: RaceMode,
  now = new Date()
): RaceViewParticipant[] {
  return participants.map(({ points, latest, startWeight, ...person }) => {
    const height = person.heightCm
    const needsHeight =
      mode !== 'classic' &&
      mode !== 'blood-pressure' &&
      mode !== 'dots' &&
      (!height || !Number.isFinite(height) || height < 50 || height > 300)
    const needsSex = (mode === 'dots' || mode === 'score') && !hasDotsSex(person.sex)
    const base = {
      ...person,
      needsHeight,
      needsSex,
      scoreComponents: null,
      points: [],
      latest: null,
      startValue: null,
      change: 0,
      streak: 0,
      personalLow: false
    }
    if (needsHeight || needsSex) {
      return base
    }
    if (mode === 'dots') {
      const history = prepareDotsHistory(person, now)
      return {
        ...base,
        points: history.points,
        latest: history.latest,
        startValue: history.startValue,
        change: history.change
      }
    }
    if (mode === 'blood-pressure') {
      const readings = person.bloodPressureMeasurements ?? []
      const systolic = prepareMeasurementHistory(
        readings.map(({ measuredAt, systolic }) => ({ measuredAt, value: systolic })),
        now
      )
      const diastolic = prepareMeasurementHistory(
        readings.map(({ measuredAt, diastolic }) => ({ measuredAt, value: diastolic })),
        now
      )
      return {
        ...base,
        points: systolic.points,
        latest: systolic.latest,
        startValue: systolic.startValue,
        change: systolic.change,
        diastolic
      }
    }
    if (mode === 'score') {
      const history = prepareScoreHistory({ ...person, points, latest, startWeight }, height!, now)
      return {
        ...base,
        points: history.points,
        latest: history.latest,
        startValue: history.startValue,
        change: history.change,
        scoreComponents: history.scoreComponents
      }
    }
    if (mode === 'biceps') {
      const history = prepareMeasurementHistory(
        (person.bicepsMeasurements ?? []).map(({ measuredAt, circumferenceCm }) => ({
          measuredAt,
          value: circumferenceCm
        })),
        now
      )
      return {
        ...base,
        points: history.points,
        latest: history.latest,
        startValue: history.startValue,
        change: history.change
      }
    }
    const divisor = mode === 'bmi' ? (height! / 100) ** 2 : 1
    const convert = (weight: number) => weight / divisor
    const previous = person.dailyWeights.at(-2)
    return {
      ...base,
      points: points.map(({ weight, ...point }) => ({ ...point, value: convert(weight) })),
      latest: latest && { date: latest.date, value: convert(latest.weight) },
      startValue: startWeight === null ? null : convert(startWeight),
      change: latest && previous ? convert(latest.weight) - convert(previous.weight) : 0,
      streak: mode === 'classic' ? person.streak : 0,
      personalLow: mode === 'classic' && person.personalLow
    }
  })
}

export function raceViewBounds(
  participants: RaceViewParticipant[],
  mode: RaceMode,
  now = new Date()
) {
  const reference = raceModes[mode].reference
  let minValue: number = reference ?? Number.POSITIVE_INFINITY
  let maxValue: number = reference ?? Number.NEGATIVE_INFINITY
  for (const band of raceBands[mode]) {
    minValue = Math.min(minValue, band.min)
    maxValue = Math.max(maxValue, band.max)
  }
  for (const person of participants) {
    for (const point of [...person.points, ...(person.diastolic?.points ?? [])]) {
      minValue = Math.min(minValue, point.value)
      maxValue = Math.max(maxValue, point.value)
    }
    if (person.points.length && person.latest) {
      minValue = Math.min(
        minValue,
        person.latest.value,
        person.diastolic?.latest?.value ?? Infinity
      )
      maxValue = Math.max(maxValue, person.latest.value)
    }
  }
  if (!Number.isFinite(minValue)) {
    minValue = 15
    maxValue = 25
  }
  const { bottom, top } = paddedChartRange(minValue, maxValue)
  const targetStep = (top - bottom) / 6
  const magnitude = 10 ** Math.floor(Math.log10(targetStep))
  const step = [1, 2, 5, 10].find((value) => value * magnitude >= targetStep)! * magnitude
  const ticks = []
  for (let tick = Math.ceil(bottom / step) * step; tick < top; tick += step) {
    const value = Number(tick.toFixed(6))
    if (value !== reference) {
      ticks.push(value)
    }
  }
  return { bottom, top, ticks, ...chartWindow(now) }
}
