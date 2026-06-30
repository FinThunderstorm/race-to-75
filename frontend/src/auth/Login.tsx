import { startAuthentication } from '@simplewebauthn/browser'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'

import { useLoginOptionsMutation, useLoginVerifyMutation } from '../api/authApi'
import { useUser } from '../hooks/useUser'

export const Login = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useUser()
  const [loginOptions] = useLoginOptionsMutation()
  const [loginVerify] = useLoginVerifyMutation()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const login = async () => {
    setStatus('working')
    try {
      const options = await loginOptions().unwrap()
      const response = await startAuthentication({ optionsJSON: options })
      await loginVerify({ response }).unwrap()
      navigate('/')
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
