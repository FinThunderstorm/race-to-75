import { AccountLayout } from './account/AccountLayout'
import { ScoreSettings } from './admin/ScoreSettings'
import { UserManagement } from './admin/UserManagement'

export const Admin = () => (
  <AccountLayout
    admin
    title="Ylläpito"
    description="Hallitse kisan osallistujia, käyttöoikeuksia ja yhteisiä pisteasetuksia."
  >
    <nav className="section-navigation" aria-label="Ylläpidon osiot">
      <a href="#users">Käyttäjähallinta</a>
      <a href="#scoring">Pisteasetukset</a>
    </nav>
    <div className="account-section" id="users">
      <p className="eyebrow">01 / Osallistujat ja käyttöoikeudet</p>
      <UserManagement />
    </div>
    <section className="account-section" id="scoring" aria-labelledby="scoring-heading">
      <header className="settings-section-header">
        <p className="eyebrow">02 / Koko ryhmän asetukset</p>
        <h2 id="scoring-heading">Pisteasetukset</h2>
        <p className="auth-description">
          Nämä valinnat vaikuttavat kaikkien osallistujien Ihmisarvo-pisteisiin.
        </p>
      </header>
      <ScoreSettings />
    </section>
  </AccountLayout>
)
