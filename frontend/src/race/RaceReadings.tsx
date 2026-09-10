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
      <summary>View {live ? 'live' : 'sample'} readings</summary>
      {!classic && (
        <div className="index-explanation">
          {(mode === 'biceps' || score) && (
            <p>Biceps index = 100 × circumference / height (both in cm).</p>
          )}
          {(mode === 'bmi' || score) && (
            <p>
              BMI index = 100 at BMI 18.5–25; below 18.5: 100 × BMI / 18.5; above 25: 100 × 25 /
              BMI.
            </p>
          )}
          {score && (
            <>
              <p>
                Score = biceps index × BMI index / 100. Both measurements and height are required.
              </p>
              <p>
                Each measurement day uses the latest available daily averages of weight and biceps.
                The dates below show when each component was measured. Completed weeks average these
                daily scores.
              </p>
            </>
          )}
          <p>
            Higher indices score better. Shared game rules, not a validated health score. The biceps
            index adjusts for height, not sex. Blood pressure is not included.
          </p>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <caption>
            {live ? 'Live' : 'Sample'} summary in {classic ? 'kilograms' : 'index points'} ·{' '}
            {score
              ? 'Current score uses the latest available daily averages (UTC)'
              : 'Current value uses the latest daily average (UTC)'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Participant</th>
              <th scope="col">Start</th>
              <th scope="col">Current</th>
              <th scope="col">{classic ? 'To go' : 'Change'}</th>
              {raw && <th scope="col">{mode === 'bmi' ? 'Current BMI' : 'Current cm'}</th>}
              {score && (
                <>
                  <th scope="col">Biceps index (cm)</th>
                  <th scope="col">Biceps date (UTC)</th>
                  <th scope="col">BMI index (BMI)</th>
                  <th scope="col">Weight date (UTC)</th>
                </>
              )}
              {live && <th scope="col">Last reading (UTC)</th>}
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
                  <td>{person.startValue?.toFixed(1) ?? '—'}</td>
                  <td>{last?.value.toFixed(1) ?? '—'}</td>
                  <td>
                    {!last
                      ? '—'
                      : classic
                        ? Math.max(0, last.value - 75).toFixed(1)
                        : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}
                  </td>
                  {raw && <td>{person.rawLatest?.toFixed(1) ?? '—'}</td>}
                  {score && (
                    <>
                      <td>
                        {components
                          ? `${components.bicepsIndex.toFixed(1)} (${components.biceps.value.toFixed(1)} cm)`
                          : '—'}
                      </td>
                      <td>{components?.biceps.date ?? '—'}</td>
                      <td>
                        {components
                          ? `${components.bmiIndex.toFixed(1)} (BMI ${components.bmi.toFixed(1)})`
                          : '—'}
                      </td>
                      <td>{components?.weight.date ?? '—'}</td>
                    </>
                  )}
                  {live && <td>{last?.date ?? '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}
