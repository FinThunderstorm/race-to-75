import { Link, useSearchParams } from 'react-router'

import { UserManagement } from './admin/UserManagement'
import { useUser } from './hooks/useUser'
import { EufySettings } from './settings/EufySettings'
import { RaceProfileSettings } from './settings/RaceProfileSettings'
import { WithingsSettings } from './settings/WithingsSettings'

export const Settings = () => {
  const { user } = useUser()
  const [params] = useSearchParams()
  const isAdmin = user?.role === 'admin'

  return (
    <main className={`settings-page${isAdmin ? ' settings-page--admin' : ''}`}>
      <Link className="text-button" to={params.get('mode') === 'bmi' ? '/?mode=bmi' : '/'}>
        ← Back to the race
      </Link>
      <header>
        <p className="eyebrow">Race to 75</p>
        <h1>Settings</h1>
        <p className="settings-name">{user?.display_name}</p>
        <p className="auth-description">{user?.email}</p>
      </header>
      <RaceProfileSettings />
      <WithingsSettings />
      <EufySettings />
      {isAdmin && <UserManagement />}
    </main>
  )
}
