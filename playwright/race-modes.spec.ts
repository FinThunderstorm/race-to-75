import { expect, test } from '@playwright/test'

import { chartBounds, prepareRace } from '../frontend/src/race/prepareRace'
import { createRaceView, raceViewBounds } from '../frontend/src/race/raceModes'

const now = new Date('2026-09-10T12:00:00Z')
const people = [
  {
    id: 'one',
    name: 'One',
    heightCm: 180,
    measurements: [
      { measuredAt: '2026-09-07T08:00:00Z', weightKg: 84.24 },
      { measuredAt: '2026-09-09T08:00:00Z', weightKg: 81 }
    ]
  },
  {
    id: 'missing',
    name: 'Missing',
    measurements: [{ measuredAt: '2026-09-09T08:00:00Z', weightKg: 80 }]
  }
]

test('BMI plots raw values and changes without changing colors or source data', () => {
  const prepared = prepareRace(people, now)
  const view = createRaceView(prepared, 'bmi', now)
  expect(view[0].latest?.value).toBeCloseTo(25)
  expect(view[0].startValue).toBeCloseTo(26)
  expect(view[0].change).toBeCloseTo(-1)
  expect(view[0].points).toHaveLength(2)
  expect(view[0].points[0].value).toBeCloseTo(26)
  expect(view[0].points[1].value).toBeCloseTo(25)
  expect(view[0].personalLow).toBe(false)
  expect(view[0].streak).toBe(0)
  expect(view.map((person) => person.color)).toEqual(prepared.map((person) => person.color))
  expect(prepared[0].latest?.weight).toBe(81)
  expect(view[1]).toMatchObject({ needsHeight: true, points: [], latest: null, startValue: null })
})

test('Classic keeps existing values and bounds', () => {
  const prepared = prepareRace(people, now)
  const view = createRaceView(prepared, 'classic')
  expect(view[0].latest?.value).toBe(81)
  expect(view[1].latest?.value).toBe(80)
  expect(raceViewBounds(view, 'classic', now)).toEqual(chartBounds(prepared, now))
})

test('Classic scales around low historical and current weights with proportional padding', () => {
  for (const [earlier, current, bottom, top] of [
    [68, 74, 38.25, 76.75],
    [80, 67, 38, 82]
  ]) {
    const prepared = prepareRace(
      [
        {
          id: 'low',
          name: 'Low',
          measurements: [
            { measuredAt: '2026-09-07T08:00:00Z', weightKg: earlier },
            { measuredAt: '2026-09-09T08:00:00Z', weightKg: current }
          ]
        },
        {
          id: 'stale',
          name: 'Stale',
          measurements: [{ measuredAt: '2020-01-01T08:00:00Z', weightKg: 40 }]
        }
      ],
      now
    )
    const bounds = raceViewBounds(createRaceView(prepared, 'classic'), 'classic', now)
    expect(bounds.bottom).toBe(bottom)
    expect(bounds.top).toBe(top)
    expect(bounds.top).toBeGreaterThan(75)
    expect(bounds).toEqual(chartBounds(prepared, now))
  }
})

test('BMI bounds include values below reference and handle missing or invalid heights', () => {
  const prepared = prepareRace(
    [
      { ...people[0], heightCm: 210 },
      ...[null, 0, -180, Number.NaN, Number.POSITIVE_INFINITY].map((heightCm, i) => ({
        ...people[0],
        id: String(i),
        heightCm
      }))
    ],
    now
  )
  const view = createRaceView(prepared, 'bmi', now)
  const bounds = raceViewBounds(view, 'bmi', now)
  expect(bounds.bottom).toBeLessThan(view[0].latest!.value)
  expect(bounds.top).toBeGreaterThan(25)
  expect(bounds.bottom).toBeLessThan(18.5)
  expect(view.slice(1).every((person) => person.needsHeight && person.points.length === 0)).toBe(
    true
  )
  const empty = raceViewBounds(view.slice(1), 'bmi', now)
  expect(Number.isFinite(empty.top)).toBe(true)
  expect(empty.bottom).toBeLessThan(empty.top)
})
