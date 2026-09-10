import { expect, test } from '@playwright/test'

import { prepareRace } from '../frontend/src/race/prepareRace'
import { createRaceView, parseRaceMode, raceViewBounds } from '../frontend/src/race/raceModes'

test('blood pressure uses paired daily and weekly averages without height or weight', () => {
  const now = new Date('2026-09-10T12:00:00Z')
  const prepared = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        measurements: [],
        bloodPressureMeasurements: [
          { measuredAt: '2026-09-01', systolic: 150, diastolic: 90 },
          { measuredAt: '2026-09-01', systolic: 120, diastolic: 80 },
          { measuredAt: '2026-09-02', systolic: 120, diastolic: 70 },
          { measuredAt: '2026-09-07', systolic: 130, diastolic: 80 },
          { measuredAt: '2026-09-09', systolic: 120, diastolic: 70 },
          { measuredAt: '2026-09-09', systolic: 124, diastolic: 74 },
          { measuredAt: '2026-09-11', systolic: 200, diastolic: 100 }
        ]
      },
      { id: 'empty', name: 'Empty', measurements: [] }
    ],
    now
  )
  const view = createRaceView(prepared, 'blood-pressure', now)
  expect(parseRaceMode('blood-pressure')).toBe('blood-pressure')
  expect(view[0]).toMatchObject({
    latest: { date: '2026-09-09', value: 122 },
    needsHeight: false,
    color: prepared[0].color,
    streak: 0,
    personalLow: false,
    diastolic: { latest: { date: '2026-09-09', value: 72 }, change: -8 },
    change: -8
  })
  expect(view[0].points).toEqual([
    { date: '2026-08-31', value: 130, period: 'week' },
    { date: '2026-09-07', value: 130, period: 'day' },
    { date: '2026-09-09', value: 122, period: 'day' }
  ])
  expect(view[0].diastolic?.points[0].value).toBe(80)
  expect(view[1].latest).toBeNull()
  expect(view[1].needsHeight).toBe(false)
  const bounds = raceViewBounds(view, 'blood-pressure', now)
  expect(bounds.bottom).toBeLessThan(72)
  expect(bounds.top).toBeGreaterThan(130)
  expect(createRaceView(prepared, 'score', now)[0].latest).toBeNull()
})
