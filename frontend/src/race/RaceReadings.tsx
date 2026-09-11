import { formatDate, formatNumber } from '../format'
import { BloodPressureIndexExplanation } from './BloodPressureIndexExplanation'
import { formatRaceReading } from './raceFormatting'
import type { RaceMode, RaceViewParticipant } from './raceModes'

export const RaceReadings = ({
  participants,
  mode,
  live
}: {
  participants: RaceViewParticipant[]
  mode: RaceMode
  live: boolean
}) => {
  const score = mode === 'score'
  const raw = mode === 'bmi' || mode === 'biceps'
  return (
    <details className={`race-data${score ? ' race-data--score' : ''}`}>
      <summary>{live ? 'Näytä mittaukset' : 'Näytä esimerkkimittaukset'}</summary>
      <div className="index-explanation">
        {(mode === 'biceps' || score) && (
          <p>Hauisindeksi = 100 × ympärys / pituus (molemmat senttimetreinä).</p>
        )}
        {(mode === 'bmi' || score) && (
          <p>
            BMI-indeksi = 100, kun BMI on 18,5–25. Alle 18,5: 100 × BMI / 18,5. Yli 25: 100 × 25 /
            BMI.
          </p>
        )}
        {score && (
          <>
            <p>
              Ihmisarvo = hauisindeksi × BMI-indeksi × verenpaineindeksi / 10 000. Yksikkö on
              kansalaispiste (kp). Laskentaan tarvitaan paino-, hauis- ja verenpainemittaus sekä
              pituus.
            </p>
            <p>
              Jokaiselle mittauspäivälle käytetään viimeisimpiä saatavilla olevia painon, hauiksen
              ja verenpaineen päiväkeskiarvoja. Alla näkyvät kaikkien mittausten päivämäärät.
              Päättyneiltä viikoilta näytetään näiden kansalaispisteiden keskiarvo.
            </p>
            <BloodPressureIndexExplanation />
          </>
        )}
        <p>
          Suurempi indeksi antaa paremman tuloksen. Pisteet on tarkoitettu yhteiseen kisaan. Niitä
          ei ole validoitu terveysmittariksi. Hauisindeksi huomioi pituuden, mutta ei
          sukupuolieroja.
        </p>
      </div>
      <div className="table-scroll">
        <table>
          <caption>
            {live ? 'Mittausten yhteenveto' : 'Esimerkkimittausten yhteenveto'}{' '}
            {score
              ? 'kansalaispisteinä'
              : mode === 'bmi'
                ? 'BMI-arvoina (kp suluissa)'
                : 'senttimetreinä (kp suluissa)'}{' '}
            ·{' '}
            {score
              ? 'Nykyinen ihmisarvo lasketaan viimeisimmistä päiväkeskiarvoista (UTC)'
              : 'Nykyarvo perustuu viimeisimpään päiväkeskiarvoon (UTC)'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Osallistuja</th>
              <th scope="col">Alku</th>
              <th scope="col">Nykyarvo</th>
              <th scope="col">Muutos</th>
              {score && (
                <>
                  <th scope="col">Hauis (kp)</th>
                  <th scope="col">Hauiksen mittauspäivä (UTC)</th>
                  <th scope="col">BMI (kp)</th>
                  <th scope="col">Punnituspäivä (UTC)</th>
                  <th scope="col">Verenpaine (kp)</th>
                  <th scope="col">Verenpaineen mittauspäivä (UTC)</th>
                </>
              )}
              {live && <th scope="col">Viimeisin mittaus (UTC)</th>}
            </tr>
          </thead>
          <tbody>
            {participants.map((person) => {
              const last = person.latest
              const change = Number(person.change.toFixed(1))
              const components = person.scoreComponents
              return (
                <tr key={person.id}>
                  <th scope="row">{person.name}</th>
                  <td>
                    {person.startValue === null
                      ? '—'
                      : raw
                        ? formatRaceReading(mode, person.startValue, person.heightCm)
                        : formatNumber(person.startValue)}
                  </td>
                  <td>
                    {last
                      ? raw
                        ? formatRaceReading(mode, last.value, person.heightCm)
                        : formatNumber(last.value)
                      : '—'}
                  </td>
                  <td>{!last ? '—' : `${change > 0 ? '+' : ''}${formatNumber(change)}`}</td>
                  {score && (
                    <>
                      <td>
                        {components
                          ? formatRaceReading('biceps', components.biceps.value, person.heightCm)
                          : '—'}
                      </td>
                      <td>{components ? formatDate(components.biceps.date) : '—'}</td>
                      <td>{components ? formatRaceReading('bmi', components.bmi) : '—'}</td>
                      <td>{components ? formatDate(components.weight.date) : '—'}</td>
                      <td>
                        {components
                          ? formatRaceReading(
                              'blood-pressure',
                              components.bloodPressure.systolic,
                              undefined,
                              components.bloodPressure.diastolic
                            )
                          : '—'}
                      </td>
                      <td>{components ? formatDate(components.bloodPressure.date) : '—'}</td>
                    </>
                  )}
                  {live && <td>{last ? formatDate(last.date) : '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}
