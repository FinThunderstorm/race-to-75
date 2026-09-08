import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server'

import { config } from '../config.js'

export const buildRegistrationOptions = async (args: {
  userId: string
  email: string
  excludeCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[]
}) => {
  return generateRegistrationOptions({
    rpID: config.webauthnRpId,
    rpName: config.webauthnRpName,
    userID: new TextEncoder().encode(args.userId),
    userName: args.email,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: args.excludeCredentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports
    }))
  })
}

export const verifyRegistration = async (args: {
  response: RegistrationResponseJSON
  expectedChallenge: string
}) => {
  const verification = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: config.webauthnOrigin,
    expectedRPID: config.webauthnRpId,
    requireUserVerification: true
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed')
  }

  const { credential } = verification.registrationInfo

  return {
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: args.response.response.transports ?? []
  }
}

export const buildAuthenticationOptions = async () => {
  return generateAuthenticationOptions({
    rpID: config.webauthnRpId,
    userVerification: 'required',
    allowCredentials: []
  })
}

export const verifyAuthentication = async (args: {
  response: AuthenticationResponseJSON
  expectedChallenge: string
  credential: {
    id: string
    publicKey: Uint8Array<ArrayBuffer>
    counter: number
    transports: AuthenticatorTransportFuture[]
  }
}) => {
  const verification = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: config.webauthnOrigin,
    expectedRPID: config.webauthnRpId,
    requireUserVerification: true,
    credential: {
      id: args.credential.id,
      publicKey: args.credential.publicKey,
      counter: args.credential.counter,
      transports: args.credential.transports
    }
  })

  if (!verification.verified) {
    throw new Error('Authentication verification failed')
  }

  return { newCounter: verification.authenticationInfo.newCounter }
}
