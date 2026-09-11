import { expect, test } from '@playwright/test'

import type { RaceHistoryParticipant } from '../frontend/src/api/raceApi'
import { calculateDots, dotsIndex, dotsLevel, dotsLevels } from '../frontend/src/race/dots'
import { prepareRace } from '../frontend/src/race/prepareRace'
import { createRaceView, parseRaceMode } from '../frontend/src/race/raceModes'

const now = new Date('2026-09-11T12:00:00Z')
const reading = {
  measuredAt: '2026-09-09',
  squatKg: 180,
  benchKg: 120,
  deadliftKg: 200,
  bodyweightKg: 80
}
const person: RaceHistoryParticipant = {
  id: 'dots',
  name: 'Dots',
  sex: 'male',
  heightCm: 200,
  measurements: [{ measuredAt: '2026-09-01', weightKg: 100 }],
  bicepsMeasurements: [{ measuredAt: '2026-09-01', circumferenceCm: 40 }],
  bloodPressureMeasurements: [{ measuredAt: '2026-09-01', systolic: 120, diastolic: 80 }],
  sbdMeasurements: [reading]
}
const view = (input = person, mode: 'dots' | 'score' = 'dots') =>
  createRaceView(prepareRace([input], now), mode, now)[0]

test('DOTS is selectable and uses the saved bodyweight and sex without requiring height', () => {
  expect(parseRaceMode('dots')).toBe('dots')
  expect(view({ ...person, heightCm: null }).latest?.value).toBeCloseTo(344.773227, 2)
  expect(view({ ...person, sex: 'female' }).latest?.value).toBeCloseTo(471.124972, 2)
  expect(view({ ...person, measurements: [] }).latest?.value).toBeCloseTo(344.773227, 2)
  expect(view({ ...person, sex: null })).toMatchObject({ needsSex: true, latest: null, points: [] })
})

test('DOTS computes each record before averaging and ignores future readings', () => {
  const result = view({
    ...person,
    sbdMeasurements: [
      reading,
      { ...reading, bodyweightKg: 100 },
      { ...reading, measuredAt: '2026-09-12', squatKg: 900 }
    ]
  })
  expect(result.latest?.value).toBeCloseTo((344.773227 + 307.757882) / 2, 2)
  expect(result.latest?.date).toBe('2026-09-09')
})

test('Novice is neutral and each normalized component has equal weight', () => {
  // Reference polynomial at 80 kg gives a 290.045723264 kg total for DOTS 200.
  const noviceReading = { ...reading, squatKg: 100, benchKg: 50, deadliftKg: 140.045723264 }
  const baseline = { ...person, sbdMeasurements: [noviceReading] }
  const base = view(baseline, 'score')
  expect(base.latest?.value).toBeCloseTo(100, 3)
  const weakerArm = view(
    { ...baseline, bicepsMeasurements: [{ measuredAt: '2026-09-01', circumferenceCm: 32 }] },
    'score'
  )
  const weakerDots = view(
    {
      ...baseline,
      sbdMeasurements: [
        { ...noviceReading, squatKg: 80, benchKg: 40, deadliftKg: noviceReading.deadliftKg * 0.8 }
      ]
    },
    'score'
  )
  const weakerBmi = view(
    { ...baseline, measurements: [{ measuredAt: '2026-09-01', weightKg: 125 }] },
    'score'
  )
  const weakerPressure = view(
    {
      ...baseline,
      bloodPressureMeasurements: [{ measuredAt: '2026-09-01', systolic: 150, diastolic: 100 }]
    },
    'score'
  )
  for (const result of [weakerArm, weakerDots, weakerBmi, weakerPressure]) {
    expect(result.latest?.value).toBeCloseTo(95, 3)
  }
  expect(
    view(
      {
        ...baseline,
        sbdMeasurements: [
          { ...noviceReading, squatKg: 200, benchKg: 100, deadliftKg: noviceReading.deadliftKg * 2 }
        ]
      },
      'score'
    ).latest?.value
  ).toBeCloseTo(125, 3)
})

test('score waits for SBD and sex, carries only earlier DOTS and exposes its source date', () => {
  for (const input of [
    { ...person, sex: null },
    { ...person, sbdMeasurements: [] }
  ]) {
    expect(view(input, 'score')).toMatchObject({ latest: null, points: [], scoreComponents: null })
  }
  const result = view(
    {
      ...person,
      measurements: [...person.measurements, { measuredAt: '2026-09-10', weightKg: 125 }]
    },
    'score'
  )
  expect(result.points.map(({ date }) => date)).toEqual(['2026-09-09', '2026-09-10'])
  expect(result.scoreComponents?.dots.date).toBe('2026-09-09')
  expect(result.change).toBeCloseTo(-5)
})

test('level boundaries use unrounded DOTS and Novice normalizes to 100 for both sexes', () => {
  for (const sex of ['male', 'female'] as const) {
    expect(dotsIndex(dotsLevels[0][sex], sex)).toBe(100)
    expect(dotsLevel(dotsLevels[0][sex] - 0.001, sex)).toBe('Alle Novice-tason')
    for (const [index, level] of dotsLevels.entries()) {
      expect(dotsLevel(level[sex], sex)).toBe(level.label)
      expect(dotsLevel(level[sex] + 0.001, sex)).toBe(level.label)
      if (index > 0) {
        expect(dotsLevel(level[sex] - 0.001, sex)).toBe(dotsLevels[index - 1].label)
      }
    }
  }
})

test('formula clamps weight to the published bounds and rejects unavailable inputs', () => {
  for (const sex of ['male', 'female'] as const) {
    const max = sex === 'male' ? 210 : 150
    expect(calculateDots(500, 39, sex)).toBe(calculateDots(500, 40, sex))
    expect(calculateDots(500, 500, sex)).toBe(calculateDots(500, max, sex))
    for (const value of [0, -1, NaN, Infinity]) {
      expect(calculateDots(500, value, sex)).toBeNull()
      expect(calculateDots(value, 80, sex)).toBeNull()
    }
  }
  expect(calculateDots(500, 80, null)).toBeNull()
})
