import { AccountLayout } from './account/AccountLayout'
import { useUser } from './hooks/useUser'
import { BicepsSettings } from './settings/BicepsSettings'
import { BloodPressureSettings } from './settings/BloodPressureSettings'
import { EufySettings } from './settings/EufySettings'
import { RaceProfileSettings } from './settings/RaceProfileSettings'
import { SbdSettings } from './settings/SbdSettings'
import { WithingsSettings } from './settings/WithingsSettings'

export const Profile = () => {
  const { user } = useUser()
  return (
    <AccountLayout
      title="Oma profiili"
      description="Lisää mittauksesi, päivitä kisaprofiilisi ja hallitse laiteyhteyksiäsi."
    >
      <nav className="section-navigation" aria-label="Profiilin osiot">
        <a href="#measurements">Omat mittaukset</a>
        <a href="#personal-details">Omat tiedot</a>
        <a href="#connections">Laiteyhteydet</a>
      </nav>
      <section className="account-section" id="measurements" aria-labelledby="measurements-heading">
        <header className="settings-section-header">
          <p className="eyebrow">01 / Kirjaa tulos</p>
          <h2 id="measurements-heading">Omat mittaukset</h2>
          <p className="auth-description">
            Lisää uusi tulos tai tarkista aiemmat mittauksesi. Tallennetut tulokset päivittyvät
            kisaan.
          </p>
          <nav className="measurement-shortcuts" aria-label="Lisää mittaus">
            <a href="#biceps">
              Hauis <span>cm ↗</span>
            </a>
            <a href="#blood-pressure">
              Verenpaine <span>mmHg ↗</span>
            </a>
            <a href="#sbd">
              SBD-tulos <span>kg ↗</span>
            </a>
          </nav>
        </header>
        <div className="measurement-grid">
          <BicepsSettings />
          <BloodPressureSettings />
          <SbdSettings />
        </div>
      </section>
      <section
        className="account-section"
        id="personal-details"
        aria-labelledby="personal-details-heading"
      >
        <header className="settings-section-header">
          <p className="eyebrow">02 / Kisaprofiili</p>
          <h2 id="personal-details-heading">Omat tiedot</h2>
          <p className="settings-name">{user?.display_name}</p>
          <p className="auth-description">{user?.email}</p>
        </header>
        <RaceProfileSettings />
      </section>
      <section className="account-section" id="connections" aria-labelledby="connections-heading">
        <header className="settings-section-header">
          <p className="eyebrow">03 / Automaattinen tuonti</p>
          <h2 id="connections-heading">Laiteyhteydet</h2>
          <p className="auth-description">
            Painomittaukset tuodaan yhdistetyiltä Withings- ja Eufy Life -tileiltäsi.
          </p>
        </header>
        <div className="connections-grid">
          <WithingsSettings />
          <EufySettings />
        </div>
      </section>
    </AccountLayout>
  )
}
