import { expect, test } from '@playwright/test'
import { prepareRace } from '../frontend/src/race/prepareRace'
import {
  createRaceView,
  raceBands,
  raceModeOrder,
  raceViewBounds
} from '../frontend/src/race/raceModes'

const now = new Date('2026-09-10T12:00:00Z')

for (const mode of raceModeOrder) {
  test(`${mode} leaves proportional space around every reading and reference`, () => {
    for (const values of [[160], [20, 350], [40, 40], [0], [0.001, 0.002]]) {
      const [person] = createRaceView(
        prepareRace(
          [
            {
              id: 'one',
              name: 'One',
              heightCm: 180,
              measurements: []
            }
          ],
          now
        ),
        mode,
        now
      )
      person.points = values.map((value, index) => ({
        date: `2026-09-0${index + 7}`,
        value,
        period: 'day'
      }))
      person.latest = person.points.at(-1)!
      if (mode === 'blood-pressure') {
        person.diastolic = {
          points: person.points.map((point) => ({ ...point, value: point.value / 2 })),
          latest: { ...person.latest, value: person.latest.value / 2 },
          startValue: values[0] / 2,
          change: 0,
          daily: []
        }
      }
      const included = [
        ...values,
        ...(person.diastolic?.points.map((point) => point.value) ?? []),
        ...raceBands[mode].flatMap((band) => [band.min, band.max])
      ]
      const bounds = raceViewBounds([person], mode, now)
      const range = bounds.top - bounds.bottom
      expect(Number.isFinite(range)).toBe(true)
      for (const value of included) {
        expect((bounds.top - value) / range).toBeGreaterThanOrEqual(0.045)
        expect((value - bounds.bottom) / range).toBeGreaterThanOrEqual(0.045)
      }
      expect(bounds.ticks.length).toBeGreaterThan(0)
      expect(bounds.ticks.length).toBeLessThan(10)
    }
    const empty = raceViewBounds([], mode, now)
    expect(Number.isFinite(empty.top - empty.bottom)).toBe(true)
    expect(empty.top).toBeGreaterThan(empty.bottom)
  })
}
