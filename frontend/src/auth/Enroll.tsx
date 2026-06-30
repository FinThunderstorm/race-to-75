import { startRegistration } from '@simplewebauthn/browser'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useEnrollOptionsMutation, useEnrollVerifyMutation } from '../api/authApi'

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
    <main>
      <h1>Set up your passkey</h1>
      <button type="button" onClick={enroll} disabled={status === 'working'}>
        Create passkey
      </button>
      {status === 'error' && <p role="alert">Enrollment link is invalid or expired.</p>}
    </main>
  )
}
