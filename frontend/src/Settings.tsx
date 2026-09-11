import { Link, useSearchParams } from 'react-router'

import { UserManagement } from './admin/UserManagement'
import { useUser } from './hooks/useUser'
import { parseRaceMode } from './race/raceModes'
import { BicepsSettings } from './settings/BicepsSettings'
import { BloodPressureSettings } from './settings/BloodPressureSettings'
import { EufySettings } from './settings/EufySettings'
import { RaceProfileSettings } from './settings/RaceProfileSettings'
import { WithingsSettings } from './settings/WithingsSettings'

export const Settings = () => {
  const { user } = useUser()
  const [params] = useSearchParams()
  const isAdmin = user?.role === 'admin'
  const mode = parseRaceMode(params.get('mode'))

  return (
    <main className={`settings-page${isAdmin ? ' settings-page--admin' : ''}`}>
      <Link className="text-button" to={`/?mode=${mode}`}>
        ← Takaisin kisaan
      </Link>
      <header>
        <p className="eyebrow">Kisa 75 kiloon</p>
        <h1>Asetukset</h1>
        <p className="settings-name">{user?.display_name}</p>
        <p className="auth-description">{user?.email}</p>
      </header>
      <RaceProfileSettings />
      <BicepsSettings />
      <BloodPressureSettings />
      <WithingsSettings />
      <EufySettings />
      {isAdmin && <UserManagement />}
    </main>
  )
}
