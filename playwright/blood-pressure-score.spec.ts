import { expect, test } from '@playwright/test'

import type { RaceHistoryParticipant } from '../frontend/src/api/raceApi'
import { prepareRace } from '../frontend/src/race/prepareRace'
import { createRaceView } from '../frontend/src/race/raceModes'

const now = new Date('2026-09-10T12:00:00Z')
const participant: RaceHistoryParticipant = {
  id: 'one',
  name: 'One',
  heightCm: 200,
  sex: 'male',
  sbdMeasurements: [
    {
      measuredAt: '2026-08-01',
      squatKg: 100,
      benchKg: 50,
      deadliftKg: 140.045723264,
      bodyweightKg: 80
    }
  ],
  measurements: [{ measuredAt: '2026-09-01', weightKg: 100 }],
  bicepsMeasurements: [{ measuredAt: '2026-09-01', circumferenceCm: 40 }]
}
const view = (person: RaceHistoryParticipant) =>
  createRaceView(prepareRace([person], now), 'score', now)[0]

test('blood pressure contributes one quarter of score with a capped plateau and the weaker pressure ratio', () => {
  for (const [systolic, diastolic, index] of [
    [90, 60, 100],
    [120, 80, 100],
    [110, 70, 100],
    [135, 85, (100 * 120) / 135],
    [160, 100, 75],
    [110, 100, 80],
    [80, 70, (100 * 80) / 90],
    [110, 50, (100 * 50) / 60],
    [180, 40, (100 * 2) / 3]
  ]) {
    const result = view({
      ...participant,
      bloodPressureMeasurements: [{ measuredAt: '2026-09-01', systolic, diastolic }]
    })
    expect(result.latest?.value, `${systolic}/${diastolic}`).toBeCloseTo(
      (100 + 100 + index + 100) / 4
    )
    expect(result.scoreComponents?.bloodPressureIndex).toBeCloseTo(index)
  }
})

test('score waits for blood pressure and never fills earlier dates with later readings', () => {
  for (const bloodPressureMeasurements of [
    undefined,
    [],
    [{ measuredAt: '2026-09-11', systolic: 120, diastolic: 80 }]
  ]) {
    expect(view({ ...participant, bloodPressureMeasurements })).toMatchObject({
      points: [],
      latest: null,
      scoreComponents: null
    })
  }
  const result = view({
    ...participant,
    bloodPressureMeasurements: [{ measuredAt: '2026-09-09', systolic: 160, diastolic: 100 }]
  })
  expect(result.points).toEqual([{ date: '2026-09-09', value: 93.75, period: 'day' }])
  expect(result.scoreComponents?.bloodPressure).toEqual({
    date: '2026-09-09',
    systolic: 160,
    diastolic: 100
  })
})

test('pressure-only days update score, averaging paired pressures before indexing', () => {
  const result = view({
    ...participant,
    bloodPressureMeasurements: [
      { measuredAt: '2026-09-01', systolic: 100, diastolic: 70 },
      { measuredAt: '2026-09-01', systolic: 140, diastolic: 90 },
      { measuredAt: '2026-09-02', systolic: 160, diastolic: 100 },
      { measuredAt: '2026-09-09', systolic: 120, diastolic: 80 },
      { measuredAt: '2026-09-11', systolic: 200, diastolic: 120 }
    ]
  })
  expect(result.points).toEqual([
    { date: '2026-08-31', value: 96.875, period: 'week' },
    { date: '2026-09-09', value: 100, period: 'day' }
  ])
  expect(result.change).toBe(6.25)
  expect(result.scoreComponents).toMatchObject({
    bloodPressureIndex: 100,
    bloodPressure: { date: '2026-09-09', systolic: 120, diastolic: 80 },
    weight: { date: '2026-09-01', value: 100 }
  })
})

test('later weight readings carry preceding blood pressure and deleting the last pressure removes score', () => {
  const person = {
    ...participant,
    measurements: [...participant.measurements, { measuredAt: '2026-09-09', weightKg: 120 }],
    bloodPressureMeasurements: [{ measuredAt: '2026-09-01', systolic: 160, diastolic: 100 }]
  }
  const result = view(person)
  expect(result.latest?.value).toBeCloseTo((100 + (100 * 25) / 30 + 75 + 100) / 4)
  expect(result.scoreComponents?.bloodPressure.date).toBe('2026-09-01')
  expect(view({ ...person, bloodPressureMeasurements: [] }).latest).toBeNull()
})
