import { formatDate, formatNumber } from '../format'
import { BloodPressureIndexExplanation } from './BloodPressureIndexExplanation'
import { DotsExplanation } from './DotsExplanation'
import { dotsLevel, hasDotsSex } from './dots'
import { formatRaceReading } from './raceFormatting'
import type { RaceMode, RaceViewParticipant } from './raceModes'
import { defaultScoreComponents, type ScoreComponent } from './scoreSettings'

export const RaceReadings = ({
  participants,
  mode,
  live,
  scoreComponents = defaultScoreComponents
}: {
  participants: RaceViewParticipant[]
  mode: RaceMode
  live: boolean
  scoreComponents?: readonly ScoreComponent[]
}) => {
  const classic = mode === 'classic'
  const score = mode === 'score'
  const enabled = (key: ScoreComponent) => scoreComponents.includes(key)
  const terms = (
    [
      ['biceps', 'hauiksen osapisteet'],
      ['bmi', 'BMI-indeksi'],
      ['blood-pressure', 'verenpaineindeksi'],
      ['dots', 'DOTS-osapisteet']
    ] as const
  )
    .filter(([key]) => enabled(key))
    .map(([, label]) => label)
  const raw = mode === 'bmi' || mode === 'biceps' || mode === 'dots'
  return (
    <details className={`race-data${score ? ' race-data--score' : ''}`}>
      <summary>{live ? 'Näytä mittaukset' : 'Näytä esimerkkimittaukset'}</summary>
      {!classic && (
        <div className="index-explanation">
          {(mode === 'biceps' || (score && enabled('biceps'))) && (
            <p>Hauisindeksi = 100 × ympärys / pituus (molemmat senttimetreinä).</p>
          )}
          {(mode === 'bmi' || (score && enabled('bmi'))) && (
            <p>
              BMI-indeksi = 100, kun BMI on 18,5–25. Alle 18,5: 100 × BMI / 18,5. Yli 25: 100 × 25 /
              BMI.
            </p>
          )}
          {score && (
            <>
              <p>
                Ihmisarvo = ({terms.join(' + ')}) / {scoreComponents.length}. Jokaisen valitun
                mittarin painoarvo on {formatNumber(100 / scoreComponents.length)} %. Perustaso on
                100 kp; se on kisan kiinteä vertailutaso, ei ryhmän tilastollinen keskiarvo.
                Laskentaan tarvitaan kaikkien valittujen mittarien tiedot.
              </p>
              {enabled('biceps') && (
                <p>
                  Hauiksen osapisteet = 5 × hauisindeksi, eli 100 kp, kun ympärys on 20 %
                  pituudesta.
                </p>
              )}
              <p>
                Jokaiselle valitun mittarin mittauspäivälle käytetään viimeisimpiä saatavilla olevia
                valittujen mittarien päiväkeskiarvoja. Alla näkyvät laskennassa käytettyjen
                mittausten päivämäärät. Päättyneiltä viikoilta näytetään näiden kansalaispisteiden
                keskiarvo.
              </p>
              {enabled('blood-pressure') && <BloodPressureIndexExplanation />}
            </>
          )}
          {(mode === 'dots' || (score && enabled('dots'))) && <DotsExplanation />}
          {mode !== 'dots' && (
            <p>
              Suurempi indeksi antaa paremman tuloksen. Pisteet on tarkoitettu yhteiseen kisaan.
              Niitä ei ole validoitu terveysmittariksi. Hauisindeksi huomioi pituuden, mutta ei
              sukupuolieroja.
            </p>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <caption>
            {live ? 'Mittausten yhteenveto' : 'Esimerkkimittausten yhteenveto'}{' '}
            {classic
              ? 'kilogrammoina'
              : score
                ? 'kansalaispisteinä'
                : mode === 'dots'
                  ? 'DOTS-pisteinä (kp suluissa)'
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
              <th scope="col">{classic ? 'Jäljellä' : 'Muutos'}</th>
              {mode === 'dots' && <th scope="col">Taso</th>}
              {score && (
                <>
                  {enabled('biceps') && (
                    <>
                      <th scope="col">Hauis (kp)</th>
                      <th scope="col">Hauiksen mittauspäivä (UTC)</th>
                    </>
                  )}
                  {enabled('bmi') && (
                    <>
                      <th scope="col">BMI (kp)</th>
                      <th scope="col">Punnituspäivä (UTC)</th>
                    </>
                  )}
                  {enabled('blood-pressure') && (
                    <>
                      <th scope="col">Verenpaine (kp)</th>
                      <th scope="col">Verenpaineen mittauspäivä (UTC)</th>
                    </>
                  )}
                  {enabled('dots') && (
                    <>
                      <th scope="col">DOTS (kp)</th>
                      <th scope="col">SBD-tulospäivä (UTC)</th>
                    </>
                  )}
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
                        ? formatRaceReading(
                            mode,
                            person.startValue,
                            person.heightCm,
                            undefined,
                            person.sex
                          )
                        : formatNumber(person.startValue)}
                  </td>
                  <td>
                    {last
                      ? raw
                        ? formatRaceReading(
                            mode,
                            last.value,
                            person.heightCm,
                            undefined,
                            person.sex
                          )
                        : formatNumber(last.value)
                      : '—'}
                  </td>
                  <td>
                    {!last
                      ? '—'
                      : classic
                        ? formatNumber(Math.max(0, last.value - 75))
                        : `${change > 0 ? '+' : ''}${formatNumber(change)}`}
                  </td>
                  {mode === 'dots' && (
                    <td>
                      {last && hasDotsSex(person.sex) ? dotsLevel(last.value, person.sex) : '—'}
                    </td>
                  )}
                  {score && (
                    <>
                      {enabled('biceps') && (
                        <>
                          <td>
                            {components?.biceps && components.bicepsPoints !== undefined
                              ? `${formatNumber(components.biceps.value)} cm (${formatNumber(components.bicepsPoints)} kp)`
                              : '—'}
                          </td>
                          <td>{components?.biceps ? formatDate(components.biceps.date) : '—'}</td>
                        </>
                      )}
                      {enabled('bmi') && (
                        <>
                          <td>
                            {components?.bmi !== undefined
                              ? formatRaceReading('bmi', components.bmi)
                              : '—'}
                          </td>
                          <td>{components?.weight ? formatDate(components.weight.date) : '—'}</td>
                        </>
                      )}
                      {enabled('blood-pressure') && (
                        <>
                          <td>
                            {components?.bloodPressure
                              ? formatRaceReading(
                                  'blood-pressure',
                                  components.bloodPressure.systolic,
                                  undefined,
                                  components.bloodPressure.diastolic
                                )
                              : '—'}
                          </td>
                          <td>
                            {components?.bloodPressure
                              ? formatDate(components.bloodPressure.date)
                              : '—'}
                          </td>
                        </>
                      )}
                      {enabled('dots') && (
                        <>
                          <td>
                            {components?.dots && components.dotsIndex !== undefined
                              ? `${formatNumber(components.dots.value)} DOTS (${formatNumber(components.dotsIndex)} kp)`
                              : '—'}
                          </td>
                          <td>{components?.dots ? formatDate(components.dots.date) : '—'}</td>
                        </>
                      )}
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
