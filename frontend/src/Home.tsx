import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useLogoutMutation } from './api/authApi'
import { useUser } from './hooks/useUser'
import { RaceChart } from './race/RaceChart'

export const Home = () => {
  const { user } = useUser()
  const [logout, { isLoading }] = useLogoutMutation()
  const [logoutError, setLogoutError] = useState(false)
  const navigate = useNavigate()

  return (
    <main className="dashboard">
      <header className="race-header">
        <div>
          <h1 className="wordmark">Race to 75</h1>
          <p className="subtitle">
            Weigh-in history <span>·</span> Goal 75.0 kg
          </p>
        </div>
        <span className="sample-indicator">
          <span /> Sample data
        </span>
      </header>
      <RaceChart />
      <footer className="dashboard-footer">
        <p>Signed in as {user?.display_name}</p>
        <p className="preview-note">Design preview · Select a racer to follow their progress.</p>
        <button
          className="text-button"
          type="button"
          disabled={isLoading}
          onClick={async () => {
            setLogoutError(false)
            try {
              await logout().unwrap()
              navigate('/login')
            } catch {
              setLogoutError(true)
            }
          }}
        >
          {isLoading ? 'Logging out…' : 'Log out'}
        </button>
      </footer>
      {logoutError && <p role="alert">Could not log out. Please try again.</p>}
    </main>
  )
}
