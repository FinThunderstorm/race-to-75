import { startRegistration } from '@simplewebauthn/browser'
import { useState } from 'react'

import { authApi } from '../api'

export function Enroll({ token, onEnrolled }: { token: string; onEnrolled: () => void }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  async function enroll() {
    setStatus('working')
    try {
      const options = await authApi.enrollOptions(token)
      const response = await startRegistration({ optionsJSON: options })
      await authApi.enrollVerify(token, response)
      onEnrolled()
    } catch {
      setStatus('error')
    }
  }

  return (
    <main>
      <h1>Set up your passkey</h1>
      <button type="button" onClick={enroll} disabled={status === 'working'}>
        Create passkey
      </button>
      {status === 'error' && <p role="alert">Enrollment link is invalid or expired.</p>}
    </main>
  )
}
