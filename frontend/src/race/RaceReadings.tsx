import { formatDate, formatNumber } from '../format'

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
  const classic = mode === 'classic'
  const score = mode === 'score'
  const raw = mode === 'bmi' || mode === 'biceps'
  return (
    <details className={`race-data${score ? ' race-data--score' : ''}`}>
      <summary>{live ? 'Näytä mittaukset' : 'Näytä esimerkkimittaukset'}</summary>
      {!classic && (
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
                Ihmisarvo = hauisindeksi × BMI-indeksi / 100. Yksikkö on kansalaispiste (kp).
                Laskentaan tarvitaan molemmat mittaukset ja pituus.
              </p>
              <p>
                Jokaiselle mittauspäivälle käytetään viimeisimpiä saatavilla olevia painon ja
                hauiksen päiväkeskiarvoja. Alla näkyvät kummankin mittauksen päivämäärät.
                Päättyneiltä viikoilta näytetään näiden kansalaispisteiden keskiarvo.
              </p>
            </>
          )}
          <p>
            Suurempi indeksi antaa paremman tuloksen. Pisteet on tarkoitettu yhteiseen kisaan. Niitä
            ei ole validoitu terveysmittariksi. Hauisindeksi huomioi pituuden, mutta ei
            sukupuolieroja. Verenpaine ei vielä sisälly laskentaan.
          </p>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <caption>
            {live ? 'Mittausten yhteenveto' : 'Esimerkkimittausten yhteenveto'}{' '}
            {classic ? 'kilogrammoina' : score ? 'kansalaispisteinä' : 'indeksipisteinä'} ·{' '}
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
              {raw && (
                <th scope="col">{mode === 'bmi' ? 'Nykyinen BMI' : 'Nykyinen ympärys (cm)'}</th>
              )}
              {score && (
                <>
                  <th scope="col">Hauisindeksi (cm)</th>
                  <th scope="col">Hauiksen mittauspäivä (UTC)</th>
                  <th scope="col">BMI-indeksi (BMI)</th>
                  <th scope="col">Punnituspäivä (UTC)</th>
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
                  <td>{person.startValue === null ? '—' : formatNumber(person.startValue)}</td>
                  <td>{last ? formatNumber(last.value) : '—'}</td>
                  <td>
                    {!last
                      ? '—'
                      : classic
                        ? formatNumber(Math.max(0, last.value - 75))
                        : `${change > 0 ? '+' : ''}${formatNumber(change)}`}
                  </td>
                  {raw && (
                    <td>{person.rawLatest === null ? '—' : formatNumber(person.rawLatest)}</td>
                  )}
                  {score && (
                    <>
                      <td>
                        {components
                          ? `${formatNumber(components.bicepsIndex)} (${formatNumber(components.biceps.value)} cm)`
                          : '—'}
                      </td>
                      <td>{components ? formatDate(components.biceps.date) : '—'}</td>
                      <td>
                        {components
                          ? `${formatNumber(components.bmiIndex)} (BMI ${formatNumber(components.bmi)})`
                          : '—'}
                      </td>
                      <td>{components ? formatDate(components.weight.date) : '—'}</td>
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
