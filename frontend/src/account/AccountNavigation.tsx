import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router'

import { adminApi } from '../api/adminApi'
import { authApi, useLogoutMutation } from '../api/authApi'
import { profileApi } from '../api/profileApi'
import { raceApi } from '../api/raceApi'
import { withingsApi } from '../api/withingsApi'
import { useUser } from '../hooks/useUser'
import { parseRaceMode } from '../race/raceModes'

export const AccountNavigation = () => {
  const { user, isAuthenticated, isLoading: loadingUser } = useUser()
  const [params] = useSearchParams()
  const mode = parseRaceMode(params.get('mode'))
  const [logout, { isLoading }] = useLogoutMutation()
  const [error, setError] = useState(false)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  return (
    <div className="account-navigation">
      <nav aria-label="Oma tili">
        {loadingUser ? (
          <span role="status">Ladataan tiliä…</span>
        ) : isAuthenticated ? (
          <>
            <span className="account-user">Kirjautuneena {user?.display_name}</span>
            <NavLink to={`/profile?mode=${mode}`}>Profiili</NavLink>
            {user?.role === 'admin' && <NavLink to={`/admin?mode=${mode}`}>Ylläpito</NavLink>}
            <button
              className="text-button"
              type="button"
              disabled={isLoading}
              onClick={async () => {
                setError(false)
                try {
                  await logout().unwrap()
                  dispatch(authApi.util.resetApiState())
                  dispatch(profileApi.util.resetApiState())
                  dispatch(raceApi.util.resetApiState())
                  dispatch(withingsApi.util.resetApiState())
                  dispatch(adminApi.util.resetApiState())
                  navigate('/login')
                } catch {
                  setError(true)
                }
              }}
            >
              {isLoading ? 'Kirjaudutaan ulos…' : 'Kirjaudu ulos'}
            </button>
          </>
        ) : (
          <Link to="/login">Kirjaudu sisään</Link>
        )}
      </nav>
      {error && <p role="alert">Uloskirjautuminen epäonnistui. Yritä uudelleen.</p>}
    </div>
  )
}
