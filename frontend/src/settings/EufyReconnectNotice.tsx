import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { useUser } from '../hooks/useUser'

const Notice = () => {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    let mounted = true
    let latestRequest = 0
    const check = async () => {
      const request = ++latestRequest
      try {
        const response = await fetch('/api/integrations/eufy/status')
        if (!response.ok) {
          return
        }
        const connection = await response.json()
        if (mounted && request === latestRequest) {
          setExpired(connection.status === 'reconnect_required')
        }
      } catch {
        // Keep the last confirmed state during temporary network failures.
      }
    }
    void check()
    const timer = window.setInterval(check, 30_000)
    window.addEventListener('focus', check)
    window.addEventListener('eufy-connection-changed', check)
    return () => {
      mounted = false
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
      window.removeEventListener('eufy-connection-changed', check)
    }
  }, [])

  if (!expired) {
    return null
  }

  return (
    <aside className="eufy-reconnect-notice" role="alert" aria-labelledby="eufy-reconnect-title">
      <div>
        <h2 id="eufy-reconnect-title">Yhdistä Eufy Life uudelleen</h2>
        <p>
          Yhteytesi on vanhentunut tai hylätty. Uudet painomittaukset eivät synkronoidu ennen kuin
          kirjaudut Eufy Lifeen uudelleen.
        </p>
      </div>
      <Link className="primary-button" to="/settings?eufy=reconnect#eufy-heading">
        Yhdistä uudelleen nyt
      </Link>
    </aside>
  )
}

export const EufyReconnectNotice = () => {
  const { user, isAuthenticated } = useUser()
  return isAuthenticated && user ? <Notice key={user.id} /> : null
}
