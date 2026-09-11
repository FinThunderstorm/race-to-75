import { expect, test } from '@playwright/test'

import { prepareRace } from '../frontend/src/race/prepareRace'
import { createRaceView, raceViewBounds } from '../frontend/src/race/raceModes'

test('biceps uses independent readings, retaining colors and neutral changes', () => {
  const now = new Date('2026-09-10T12:00:00Z')
  const prepared = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        heightCm: 200,
        measurements: [],
        bicepsMeasurements: [
          { measuredAt: '2026-09-07', circumferenceCm: 35 },
          { measuredAt: '2026-09-09', circumferenceCm: 36 },
          { measuredAt: '2026-09-09', circumferenceCm: 38 },
          { measuredAt: '2026-09-11', circumferenceCm: 90 }
        ]
      },
      {
        id: 'weight-only',
        name: 'Weight Only',
        heightCm: 180,
        measurements: [{ measuredAt: '2026-09-09', weightKg: 81 }]
      }
    ],
    now
  )
  const view = createRaceView(prepared, 'biceps', now)
  expect(view[0]).toMatchObject({
    latest: { date: '2026-09-09', value: 37 },
    startValue: 35,
    change: 2,
    needsHeight: false,
    personalLow: false,
    streak: 0,
    color: prepared[0].color
  })
  expect(view[0].points).toEqual([
    { date: '2026-09-07', value: 35, period: 'day' },
    { date: '2026-09-09', value: 37, period: 'day' }
  ])
  expect(view[1].latest).toBeNull()
  expect(createRaceView(prepared, 'bmi')[0].latest).toBeNull()
  const bounds = raceViewBounds(view, 'biceps', now)
  expect(bounds.bottom).toBeLessThan(35)
  expect(bounds.top).toBeGreaterThan(37)
  expect(bounds.top).toBeLessThan(40)
  const empty = raceViewBounds([], 'biceps', now)
  expect(Number.isFinite(empty.bottom)).toBe(true)
  expect(empty.top).toBeGreaterThan(empty.bottom)
})
