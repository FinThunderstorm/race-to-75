import { expect, test } from '@playwright/test'
import {
  chartBounds,
  chartWindow,
  prepareMeasurementHistory,
  prepareRace
} from '../frontend/src/race/prepareRace'
import { createRaceView, raceViewBounds } from '../frontend/src/race/raceModes'

test('daily averages use UTC and preserve the first recorded start weight', () => {
  const [person] = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        measurements: [
          { measuredAt: '2026-09-02T01:00:00.000Z', weightKg: 79 },
          { measuredAt: '2026-09-01T23:00:00.000Z', weightKg: 82 },
          { measuredAt: '2026-09-01T01:00:00.000Z', weightKg: 80 }
        ]
      }
    ],
    new Date('2026-09-03T12:00:00Z')
  )
  expect(person.points).toEqual([
    { date: '2026-09-01', weight: 81, period: 'day' },
    { date: '2026-09-02', weight: 79, period: 'day' }
  ])
  expect(person.startWeight).toBe(80)
  expect(person.change).toBe(-2)
  expect(person.personalLow).toBe(true)
})

test('streaks skip missing days and reset on a daily average above the goal', () => {
  const measurements = Array.from({ length: 7 }, (_, index) => ({
    measuredAt: new Date(Date.UTC(2026, 8, 1 + index * 2)).toISOString(),
    weightKg: 75
  }))
  const participant = { id: 'one', name: 'One', measurements }
  expect(prepareRace([participant], new Date('2026-09-15T12:00:00Z'))[0].streak).toBe(7)
  expect(
    prepareRace(
      [
        {
          ...participant,
          measurements: [...measurements, { measuredAt: '2026-09-14T00:00:00.000Z', weightKg: 76 }]
        }
      ],
      new Date('2026-09-15T12:00:00Z')
    )[0].streak
  ).toBe(0)
})

test('empty and single-reading participants do not invent changes or personal records', () => {
  const people = prepareRace(
    [
      { id: 'empty', name: 'Empty', measurements: [] },
      {
        id: 'single',
        name: 'Single',
        measurements: [{ measuredAt: '2026-09-01T00:00:00.000Z', weightKg: 145 }]
      }
    ],
    new Date('2026-09-10T12:00:00Z')
  )
  expect(people[0]).toMatchObject({
    startWeight: null,
    points: [],
    change: 0,
    streak: 0,
    personalLow: false
  })
  expect(people[1]).toMatchObject({ change: 0, personalLow: false })
  const bounds = chartBounds(people, new Date('2026-09-10T12:00:00Z'))
  expect(bounds.top).toBe(148.5)
  expect(bounds.bottom).toBe(71.5)
  expect(bounds.start).toBe(Date.parse('2026-06-10T00:00:00Z'))
  expect(bounds.end).toBe(Date.parse('2026-09-10T00:00:00Z'))
})

test('completed weeks average all weighings while the current week averages each logged day', () => {
  const [person] = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        measurements: [
          { measuredAt: '2026-08-31T08:00:00Z', weightKg: 90 },
          { measuredAt: '2026-08-31T12:00:00Z', weightKg: 100 },
          { measuredAt: '2026-08-31T20:00:00Z', weightKg: 110 },
          { measuredAt: '2026-09-01T08:00:00Z', weightKg: 70 },
          { measuredAt: '2026-09-07T08:00:00Z', weightKg: 90 },
          { measuredAt: '2026-09-07T12:00:00Z', weightKg: 80 },
          { measuredAt: '2026-09-09T08:00:00Z', weightKg: 82 }
        ]
      }
    ],
    new Date('2026-09-10T12:00:00Z')
  )
  expect(person.points).toEqual([
    { date: '2026-08-31', weight: 92.5, period: 'week' },
    { date: '2026-09-07', weight: 85, period: 'day' },
    { date: '2026-09-09', weight: 82, period: 'day' }
  ])
  expect(person.latest).toEqual({ date: '2026-09-09', weight: 82 })
  expect(person.change).toBe(-3)
})

test('the three-month window excludes older and future weighings and clips the first week', () => {
  const people = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        measurements: [
          { measuredAt: '2026-06-09T23:59:59Z', weightKg: 200 },
          { measuredAt: '2026-06-10T00:00:00Z', weightKg: 88 },
          { measuredAt: '2026-06-14T23:59:59Z', weightKg: 92 },
          { measuredAt: '2026-09-10T11:00:00Z', weightKg: 80 },
          { measuredAt: '2026-09-10T13:00:00Z', weightKg: 250 },
          { measuredAt: '2026-09-11T08:00:00Z', weightKg: 300 }
        ]
      }
    ],
    new Date('2026-09-10T12:00:00Z')
  )
  expect(people[0].points).toEqual([
    { date: '2026-06-10', weight: 90, period: 'week' },
    { date: '2026-09-10', weight: 80, period: 'day' }
  ])
  expect(people[0].startWeight).toBe(200)
  expect(chartBounds(people, new Date('2026-09-10T12:00:00Z')).top).toBeLessThan(200)
})

test('Sunday and Monday fall in different UTC weeks, including across a year boundary', () => {
  const participant = {
    id: 'one',
    name: 'One',
    measurements: [
      { measuredAt: '2027-01-03T23:59:59Z', weightKg: 82 },
      { measuredAt: '2027-01-04T00:00:00Z', weightKg: 80 }
    ]
  }
  expect(prepareRace([participant], new Date('2027-01-04T12:00:00Z'))[0].points).toEqual([
    { date: '2026-12-28', weight: 82, period: 'week' },
    { date: '2027-01-04', weight: 80, period: 'day' }
  ])
  expect(prepareRace([participant], new Date('2027-01-11T12:00:00Z'))[0].points).toEqual([
    { date: '2026-12-28', weight: 82, period: 'week' },
    { date: '2027-01-04', weight: 80, period: 'week' }
  ])
})

test('calendar-month boundaries clamp correctly and remain fixed for empty or stale histories', () => {
  expect(chartWindow(new Date('2026-05-31T12:00:00Z')).start).toBe(
    Date.parse('2026-02-28T00:00:00Z')
  )
  expect(chartWindow(new Date('2024-05-31T12:00:00Z')).start).toBe(
    Date.parse('2024-02-29T00:00:00Z')
  )
  expect(chartWindow(new Date('2027-01-31T12:00:00Z')).start).toBe(
    Date.parse('2026-10-31T00:00:00Z')
  )
  const now = new Date('2026-09-10T12:00:00Z')
  const [person] = prepareRace(
    [
      {
        id: 'old',
        name: 'Old',
        measurements: [{ measuredAt: '2020-01-01T00:00:00Z', weightKg: 150 }]
      }
    ],
    now
  )
  expect(person.points).toEqual([{ date: '2020-01-01', weight: 150, period: 'day' }])
  expect(person.latest).toEqual({ date: '2020-01-01', weight: 150 })
  const bounds = chartBounds([person], now)
  expect(bounds.start).toBe(Date.parse('2026-06-10T00:00:00Z'))
  expect(bounds.end).toBe(Date.parse('2026-09-10T00:00:00Z'))
  expect(bounds.top).toBeGreaterThan(150)
})

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
  for (const mode of ['bmi', 'biceps'] as const) {
    const view = createRaceView(prepared, mode, now)
    expect(view[0].points).toHaveLength(1)
    expect(view[0].points[0].date).toBe('2025-02-06')
    const bounds = raceViewBounds(view, mode, now)
    expect(bounds.bottom).toBeLessThan(view[0].points[0].value)
    expect(bounds.top).toBeGreaterThan(view[0].points[0].value)
    expect(bounds.start).toBe(Date.parse('2026-06-10'))
  }
})

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
