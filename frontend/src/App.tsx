import { useEffect, useState } from 'react'

import { authApi, type CurrentUser, fetchMe } from './api'
import { Enroll } from './auth/Enroll'
import { Login } from './auth/Login'

export function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function refresh() {
    setUser(await fetchMe())
    setLoaded(true)
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!loaded) {
    return <p>Loading…</p>
  }

  const path = window.location.pathname

  if (path === '/enroll') {
    const token = new URLSearchParams(window.location.search).get('token') ?? ''

    return (
      <Enroll
        token={token}
        onEnrolled={() => {
          window.location.assign('/')
        }}
      />
    )
  }

  if (!user) {
    return <Login onLoggedIn={refresh} />
  }

  return (
    <main>
      <h1>race-to-75</h1>
      <p>Signed in as {user.display_name}</p>
      <button
        type="button"
        onClick={async () => {
          await authApi.logout()
          await refresh()
        }}
      >
        Log out
      </button>
    </main>
  )
}
