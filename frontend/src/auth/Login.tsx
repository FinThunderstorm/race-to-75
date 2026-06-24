import { startAuthentication } from '@simplewebauthn/browser'
import { useState } from 'react'

import { authApi } from '../api'

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  async function login() {
    setStatus('working')
    try {
      const options = await authApi.loginOptions()
      const response = await startAuthentication({ optionsJSON: options })
      await authApi.loginVerify(response)
      onLoggedIn()
    } catch {
      setStatus('error')
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      <button type="button" onClick={login} disabled={status === 'working'}>
        Log in with passkey
      </button>
      {status === 'error' && <p role="alert">Login failed.</p>}
    </main>
  )
}
