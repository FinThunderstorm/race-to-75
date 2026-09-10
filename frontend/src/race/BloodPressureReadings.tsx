import { formatDate, formatNumber } from '../format'
import { BloodPressureIndexExplanation } from './BloodPressureIndexExplanation'
import { formatRaceReading } from './raceFormatting'
import type { RaceViewParticipant } from './raceModes'

const pair = (upper: number | null | undefined, lower: number | null | undefined) =>
  upper == null || lower == null
    ? '—'
    : formatRaceReading('blood-pressure', upper, undefined, lower)
const change = (value: number) => `${value > 0 ? '+' : ''}${formatNumber(value)}`

export const BloodPressureReadings = ({
  participants,
  live
}: {
  participants: RaceViewParticipant[]
  live: boolean
}) => (
  <details className="race-data">
    <summary>{live ? 'Näytä mittaukset' : 'Näytä esimerkkimittaukset'}</summary>
    <p className="index-explanation">
      Yläpaine näkyy yhtenäisenä viivana, alapaine katkoviivana. Päättyneiltä viikoilta näytetään
      kaikkien mittausten keskiarvot ja kuluvalta viikolta päiväkeskiarvot.
    </p>
    <div className="index-explanation">
      <BloodPressureIndexExplanation />
      <p>Ihmisarvo kerrotaan verenpaineindeksillä / 100.</p>
    </div>
    <div className="table-scroll">
      <table>
        <caption>
          {live ? 'Mittausten yhteenveto' : 'Esimerkkimittausten yhteenveto'}: yläpaine / alapaine
          (mmHg) · Nykyarvo perustuu viimeisimpään päiväkeskiarvoon (UTC)
        </caption>
        <thead>
          <tr>
            <th scope="col">Osallistuja</th>
            <th scope="col">Alku</th>
            <th scope="col">Nykyarvo</th>
            <th scope="col">Muutos</th>
            <th scope="col">Viimeisin mittaus (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((person) => (
            <tr key={person.id}>
              <th scope="row">{person.name}</th>
              <td>{pair(person.startValue, person.diastolic?.startValue)}</td>
              <td>{pair(person.latest?.value, person.diastolic?.latest?.value)}</td>
              <td>
                {person.latest && person.diastolic?.latest
                  ? `${change(person.change)} / ${change(person.diastolic.change)}`
                  : '—'}
              </td>
              <td>{person.latest ? formatDate(person.latest.date) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
)
