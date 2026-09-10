import { expect, test } from '@playwright/test'
import { prepareRace } from '../frontend/src/race/prepareRace'
import { formatRaceReading } from '../frontend/src/race/raceFormatting'
import { createRaceView, raceViewBounds } from '../frontend/src/race/raceModes'

const now = new Date('2026-09-10T12:00:00Z')
const prepared = prepareRace(
  [
    {
      id: 'one',
      name: 'One',
      heightCm: 200,
      measurements: [{ measuredAt: '2026-09-09', weightKg: 120 }],
      bicepsMeasurements: [{ measuredAt: '2026-09-09', circumferenceCm: 40 }],
      bloodPressureMeasurements: [{ measuredAt: '2026-09-09', systolic: 160, diastolic: 100 }]
    }
  ],
  now
)

test('metric labels expose raw measurements with component citizen points and leave the total unchanged', () => {
  for (const [mode, value, label] of [
    ['bmi', 30, '30,0 BMI (83,3 kp)'],
    ['biceps', 40, '40,0 cm (20,0 kp)'],
    ['blood-pressure', 160, '160,0 / 100,0 mmHg (75,0 kp)']
  ] as const) {
    const [person] = createRaceView(prepared, mode, now)
    expect(person.latest?.value).toBe(value)
    expect(person.points[0].value).toBe(value)
    expect(formatRaceReading(mode, value, person.heightCm, person.diastolic?.latest?.value)).toBe(
      label
    )
  }
  expect(createRaceView(prepared, 'score', now)[0].latest?.value).toBeCloseTo(12.5)
})

test('chart bounds include whole reference bands for outlying and empty histories', () => {
  for (const source of [prepared, []]) {
    const bmi = raceViewBounds(createRaceView(source, 'bmi', now), 'bmi', now)
    expect(bmi.bottom).toBeLessThan(18.5)
    expect(bmi.top).toBeGreaterThan(25)
    const pressure = raceViewBounds(
      createRaceView(source, 'blood-pressure', now),
      'blood-pressure',
      now
    )
    expect(pressure.bottom).toBeLessThan(60)
    expect(pressure.top).toBeGreaterThan(120)
  }
})
