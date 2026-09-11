import { dotsLevels } from './dots'

export const DotsExplanation = () => (
  <div className="index-explanation">
    <p>
      DOTS = (kyykky + penkkipunnerrus + maastaveto) × kehonpainon ja sukupuolen DOTS-kerroin. Paino
      tallennetaan tuloksen yhteyteen. Päivän ja viikon arvo on erikseen laskettujen DOTS-tulosten
      keskiarvo.
    </p>
    <p>
      DOTS-osapisteet = 100 × DOTS / Novice-raja. Novice antaa 100 kp; sen alapuoli laskee ja
      yläpuoli nostaa Ihmisarvoa. Tasot ovat kisan suuntaa antavia vertailurajoja.
    </p>
    <div className="table-scroll">
      <table>
        <caption>DOTS-tasorajat</caption>
        <thead>
          <tr>
            <th scope="col">Taso</th>
            <th scope="col">Mies</th>
            <th scope="col">Nainen</th>
          </tr>
        </thead>
        <tbody>
          {dotsLevels.map((level) => (
            <tr key={level.label}>
              <th scope="row">{level.label}</th>
              <td>{level.male}+</td>
              <td>{level.female}+</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)
