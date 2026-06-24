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

export const rpConfig = {
  rpID: config.webauthnRpId,
  rpName: config.webauthnRpName,
  origin: config.webauthnOrigin
}

export async function buildRegistrationOptions(args: {
  userId: string
  userName: string
  excludeCredentials: { id: string; transports?: string[] }[]
}) {
  return generateRegistrationOptions({
    rpID: rpConfig.rpID,
    rpName: rpConfig.rpName,
    userID: new TextEncoder().encode(args.userId),
    userName: args.userName,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: args.excludeCredentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports as AuthenticatorTransportFuture[]
    }))
  })
}

export async function verifyRegistration(args: {
  response: RegistrationResponseJSON
  expectedChallenge: string
}) {
  const verification = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: rpConfig.origin,
    expectedRPID: rpConfig.rpID,
    requireUserVerification: false
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed')
  }

  const { credential } = verification.registrationInfo

  return {
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: (args.response.response.transports ?? []) as string[]
  }
}

export async function buildAuthenticationOptions() {
  return generateAuthenticationOptions({
    rpID: rpConfig.rpID,
    userVerification: 'preferred',
    allowCredentials: []
  })
}

export async function verifyAuthentication(args: {
  response: AuthenticationResponseJSON
  expectedChallenge: string
  credential: { id: string; publicKey: Uint8Array; counter: number; transports: string[] }
}) {
  const verification = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: rpConfig.origin,
    expectedRPID: rpConfig.rpID,
    requireUserVerification: false,
    credential: {
      id: args.credential.id,
      publicKey: args.credential.publicKey as Uint8Array<ArrayBuffer>,
      counter: args.credential.counter,
      transports: args.credential.transports as AuthenticatorTransportFuture[]
    }
  })

  if (!verification.verified) {
    throw new Error('Authentication verification failed')
  }

  return { newCounter: verification.authenticationInfo.newCounter }
}
