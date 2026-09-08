import { Link } from 'react-router'

import { UserManagement } from './admin/UserManagement'
import { useUser } from './hooks/useUser'
import { EufySettings } from './settings/EufySettings'
import { WithingsSettings } from './settings/WithingsSettings'

export const Settings = () => {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'

  return (
    <main className={`settings-page${isAdmin ? ' settings-page--admin' : ''}`}>
      <Link className="text-button" to="/">
        ← Back to the race
      </Link>
      <header>
        <p className="eyebrow">Race to 75</p>
        <h1>Settings</h1>
        <p className="settings-name">{user?.display_name}</p>
        <p className="auth-description">{user?.email}</p>
      </header>
      <WithingsSettings />
      <EufySettings />
      {isAdmin && <UserManagement />}
    </main>
  )
}
