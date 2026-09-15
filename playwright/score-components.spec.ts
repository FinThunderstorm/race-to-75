import { expect, test } from '@playwright/test'
import { prepareRace } from '../frontend/src/race/prepareRace'
import { createRaceView } from '../frontend/src/race/raceModes'

const now = new Date('2026-09-15T12:00:00Z')
const participant = {
  id: 'one',
  name: 'One',
  heightCm: 200,
  sex: 'male' as const,
  measurements: [{ measuredAt: '2026-09-14', weightKg: 100 }],
  bicepsMeasurements: [{ measuredAt: '2026-09-15', circumferenceCm: 20 }],
  bloodPressureMeasurements: [{ measuredAt: '2026-09-14', systolic: 120, diastolic: 80 }]
}

test('selected components are averaged and disabled readings are not required', () => {
  const [view] = createRaceView(prepareRace([participant], now), 'score', now, ['bmi', 'biceps'])
  expect(view.latest?.value).toBeCloseTo(75)
  expect(view.scoreComponents?.dots).toBeUndefined()
  expect(view.scoreComponents?.bloodPressure).toBeUndefined()
})

test('pressure alone needs neither height nor sex nor weight history', () => {
  const [view] = createRaceView(
    prepareRace(
      [
        {
          ...participant,
          heightCm: null,
          sex: null,
          measurements: [],
          bicepsMeasurements: []
        }
      ],
      now
    ),
    'score',
    now,
    ['blood-pressure']
  )
  expect(view).toMatchObject({ needsHeight: false, needsSex: false })
  expect(view.latest?.value).toBe(100)
})

test('only selected components require profile data and measurements', () => {
  const people = prepareRace([{ ...participant, heightCm: null, sex: null }], now)
  expect(createRaceView(people, 'score', now, ['bmi'])[0].needsHeight).toBe(true)
  expect(createRaceView(people, 'score', now, ['dots'])[0].needsSex).toBe(true)
  expect(
    createRaceView(prepareRace([participant], now), 'score', now, ['dots'])[0].latest
  ).toBeNull()
  expect(createRaceView(people, 'score', now, [])[0].latest).toBeNull()
})

test('disabled measurements do not add score observation dates or change weekly averages', () => {
  const people = prepareRace(
    [
      {
        ...participant,
        measurements: [
          { measuredAt: '2026-09-07', weightKg: 100 },
          { measuredAt: '2026-09-11', weightKg: 200 }
        ],
        bicepsMeasurements: [
          { measuredAt: '2026-09-08', circumferenceCm: 20 },
          { measuredAt: '2026-09-09', circumferenceCm: 30 },
          { measuredAt: '2026-09-15', circumferenceCm: 40 }
        ]
      }
    ],
    now
  )
  const [view] = createRaceView(people, 'score', now, ['bmi'])
  expect(view.points).toEqual([{ date: '2026-09-07', value: 75, period: 'week' }])
  expect(view.latest).toEqual({ date: '2026-09-11', value: 50 })
})
