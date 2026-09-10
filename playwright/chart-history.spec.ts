import { expect, test } from '@playwright/test'

import { prepareMeasurementHistory, prepareRace } from '../frontend/src/race/prepareRace'
import { createRaceView, raceViewBounds } from '../frontend/src/race/raceModes'

const now = new Date('2026-09-10T12:00:00Z')

test('old history keeps only the latest preceding daily average and its real date', () => {
  const history = prepareMeasurementHistory(
    [
      { measuredAt: '2025-02-06T12:00:00Z', value: 38 },
      { measuredAt: '2024-09-18', value: 30 },
      { measuredAt: '2025-02-06T08:00:00Z', value: 37 },
      { measuredAt: '2026-09-11', value: 90 }
    ],
    now
  )
  expect(history.points).toEqual([{ date: '2025-02-06', value: 37.5, period: 'day' }])
  expect(history.latest).toEqual({ date: '2025-02-06', value: 37.5 })
  expect(history.daily).toHaveLength(2)
  expect(history.startValue).toBe(30)
  expect(history.change).toBe(7.5)
})

test('a preceding reading anchors recent history without entering weekly averages', () => {
  const history = prepareMeasurementHistory(
    [
      { measuredAt: '2025-02-06', value: 37.5 },
      { measuredAt: '2026-08-31', value: 38 },
      { measuredAt: '2026-09-02', value: 40 }
    ],
    now
  )
  expect(history.points).toEqual([
    { date: '2025-02-06', value: 37.5, period: 'day' },
    { date: '2026-08-31', value: 39, period: 'week' }
  ])
  expect(history.latest).toEqual({ date: '2026-09-02', value: 40 })
  expect(history.change).toBe(2)
})

test('a first-week bucket at the left boundary supersedes the preceding reading', () => {
  const history = prepareMeasurementHistory(
    [
      { measuredAt: '2026-06-09', value: 90 },
      { measuredAt: '2026-06-12', value: 38 }
    ],
    now
  )
  expect(history.points).toEqual([{ date: '2026-06-10', value: 38, period: 'week' }])
  expect(prepareMeasurementHistory([], now).points).toEqual([])
  expect(prepareMeasurementHistory([{ measuredAt: '2026-09-11', value: 90 }], now).points).toEqual(
    []
  )
})

test('old biceps and weight readings remain plottable with appropriate chart bounds', () => {
  const prepared = prepareRace(
    [
      {
        id: 'jykke',
        name: 'Jykke',
        heightCm: 200,
        measurements: [{ measuredAt: '2025-02-06', weightKg: 150 }],
        bicepsMeasurements: [{ measuredAt: '2025-02-06', circumferenceCm: 37.5 }]
      }
    ],
    now
  )
  for (const mode of ['classic', 'bmi', 'biceps'] as const) {
    const view = createRaceView(prepared, mode, now)
    expect(view[0].points).toHaveLength(1)
    expect(view[0].points[0].date).toBe('2025-02-06')
    const bounds = raceViewBounds(view, mode, now)
    expect(bounds.bottom).toBeLessThan(view[0].points[0].value)
    expect(bounds.top).toBeGreaterThan(view[0].points[0].value)
    expect(bounds.start).toBe(Date.parse('2026-06-10'))
  }
})
