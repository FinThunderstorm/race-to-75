import { startRegistration } from '@simplewebauthn/browser'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useEnrollOptionsMutation, useEnrollVerifyMutation } from '../api/authApi'
import { AuthLayout } from './AuthLayout'

export const Enroll = () => {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [enrollOptions] = useEnrollOptionsMutation()
  const [enrollVerify] = useEnrollVerifyMutation()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  const enroll = async () => {
    setStatus('working')
    try {
      const options = await enrollOptions({ token }).unwrap()
      const response = await startRegistration({ optionsJSON: options })
      await enrollVerify({ token, response }).unwrap()
      navigate('/')
    } catch {
      setStatus('error')
    }
  }

  return (
    <AuthLayout>
      <p className="eyebrow">Join the race</p>
      <h1>Set up your passkey</h1>
      <p className="auth-description">One quick setup. Then you’re on the starting line.</p>
      <button
        className="primary-button"
        type="button"
        onClick={enroll}
        disabled={status === 'working' || !token}
      >
        {status === 'working' ? 'Creating passkey…' : 'Create passkey'}
      </button>
      {(status === 'error' || !token) && <p role="alert">Enrollment link is invalid or expired.</p>}
      <p className="auth-hint">
        Use your device’s fingerprint, face recognition, or security key to sign in.
      </p>
    </AuthLayout>
  )
}
