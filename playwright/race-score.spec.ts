import { expect, test } from '@playwright/test'

import type { RaceHistoryParticipant } from '../frontend/src/api/raceApi'
import { prepareRace } from '../frontend/src/race/prepareRace'
import {
  createRaceView,
  parseRaceMode,
  raceModeOrder,
  raceViewBounds
} from '../frontend/src/race/raceModes'

const now = new Date('2026-09-10T12:00:00Z')
const participant: RaceHistoryParticipant = {
  id: 'one',
  name: 'One',
  heightCm: 200,
  measurements: [{ measuredAt: '2026-09-07', weightKg: 100 }],
  bloodPressureMeasurements: [{ measuredAt: '2026-08-01', systolic: 120, diastolic: 80 }],
  bicepsMeasurements: [{ measuredAt: '2026-09-09', circumferenceCm: 40 }]
}
const view = (person: RaceHistoryParticipant, mode: 'bmi' | 'biceps' | 'score' = 'score') =>
  createRaceView(prepareRace([person], now), mode, now)[0]

test('score is a selectable mode with finite empty chart bounds', () => {
  expect(parseRaceMode('score')).toBe('score')
  expect(raceModeOrder).toEqual(['classic', 'bmi', 'biceps', 'blood-pressure', 'score'])
  const bounds = raceViewBounds([], 'score', now)
  expect(Number.isFinite(bounds.bottom)).toBe(true)
  expect(bounds.top).toBeGreaterThan(bounds.bottom)
})

test('the same arm-to-height proportion gives the same biceps index', () => {
  for (const [heightCm, circumferenceCm] of [
    [160, 32],
    [170, 34],
    [190, 38]
  ]) {
    expect(
      view(
        {
          ...participant,
          heightCm,
          bicepsMeasurements: [{ measuredAt: '2026-09-09', circumferenceCm }]
        },
        'biceps'
      ).latest?.value
    ).toBeCloseTo(20)
  }
})

test('BMI index has a common plateau and falls for both high and low BMI', () => {
  for (const [bmi, expected] of [
    [18.5, 100],
    [22, 100],
    [25, 100],
    [30, (100 * 25) / 30],
    [16, (100 * 16) / 18.5]
  ]) {
    const person = {
      ...participant,
      measurements: [{ measuredAt: '2026-09-09', weightKg: bmi * 4 }]
    }
    expect(view(person, 'bmi').latest?.value).toBeCloseTo(expected)
    expect(view(person).latest?.value).toBeCloseTo((20 * expected) / 100)
  }
})

test('missing height or any component never produces a partial score', () => {
  for (const heightCm of [null, 0, -1, 49, 301, Number.NaN, Number.POSITIVE_INFINITY]) {
    for (const mode of ['bmi', 'biceps', 'score'] as const) {
      expect(view({ ...participant, heightCm }, mode)).toMatchObject({
        needsHeight: true,
        points: [],
        latest: null
      })
    }
  }
  for (const person of [
    { ...participant, bloodPressureMeasurements: [] },
    { ...participant, bloodPressureMeasurements: undefined },
    { ...participant, measurements: [] },
    { ...participant, bicepsMeasurements: [] },
    { ...participant, bicepsMeasurements: undefined }
  ]) {
    expect(view(person)).toMatchObject({ points: [], latest: null, scoreComponents: null })
  }
})

test('score averages each UTC day, carries only preceding data and exposes component dates', () => {
  const person = {
    ...participant,
    measurements: [
      { measuredAt: '2026-09-10T09:00:00Z', weightKg: 120 },
      { measuredAt: '2026-09-07T08:00:00Z', weightKg: 110 },
      { measuredAt: '2026-09-07T20:00:00Z', weightKg: 90 },
      { measuredAt: '2026-09-10T18:00:00Z', weightKg: 1 }
    ],
    bicepsMeasurements: [
      { measuredAt: '2026-09-09T08:00:00Z', circumferenceCm: 38 },
      { measuredAt: '2026-09-09T12:00:00Z', circumferenceCm: 42 },
      { measuredAt: '2026-09-11', circumferenceCm: 90 }
    ]
  }
  const result = view(person)
  expect(result.points.map((point) => point.date)).toEqual(['2026-09-09', '2026-09-10'])
  expect(result.points[0].value).toBeCloseTo(20)
  expect(result.latest?.value).toBeCloseTo((20 * 25) / 30)
  expect(result.startValue).toBeCloseTo(20)
  expect(result.change).toBeCloseTo((20 * 25) / 30 - 20)
  expect(result.scoreComponents).toMatchObject({
    bicepsIndex: 20,
    bmi: 30,
    weight: { date: '2026-09-10', value: 120 },
    biceps: { date: '2026-09-09', value: 40 }
  })
  expect(result.streak).toBe(0)
  expect(result.personalLow).toBe(false)
})

test('score can start on a later weight day and averages observed-day scores per week', () => {
  const result = view({
    ...participant,
    measurements: [
      { measuredAt: '2026-08-31', weightKg: 100 },
      { measuredAt: '2026-09-02', weightKg: 125 }
    ],
    bicepsMeasurements: [{ measuredAt: '2026-08-01', circumferenceCm: 40 }]
  })
  expect(result.points).toEqual([{ date: '2026-08-31', value: 18, period: 'week' }])
  expect(result.latest).toEqual({ date: '2026-09-02', value: 16 })
  expect(result.scoreComponents?.biceps.date).toBe('2026-08-01')
})

test('correcting height recalculates indices without mutating source readings', () => {
  const before = JSON.stringify(participant)
  const corrected = view({ ...participant, heightCm: 180 })
  expect(view(participant).latest?.value).toBeCloseTo(20)
  expect(corrected.latest?.value).toBeCloseTo(18)
  expect(JSON.stringify(participant)).toBe(before)
})

test('BMI changes use transformed daily averages and do not reward further loss below the plateau', () => {
  const result = view(
    {
      ...participant,
      measurements: [
        { measuredAt: '2026-09-07', weightKg: 74 },
        { measuredAt: '2026-09-09', weightKg: 64 }
      ]
    },
    'bmi'
  )
  expect(result.change).toBeCloseTo((100 * 16) / 18.5 - 100)
  expect(result.change).toBeLessThan(0)
})
