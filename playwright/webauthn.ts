import type { Page } from '@playwright/test'

export async function addVirtualAuthenticator(page: Page) {
  await page.context().credentials.install()
}

export function createCredential(page: Page, optionsJSON: unknown) {
  return page.evaluate(async (options: any) => {
    const toBuf = (value: string) => {
      const pad = '='.repeat((4 - (value.length % 4)) % 4)
      const binary = atob((value + pad).replace(/-/g, '+').replace(/_/g, '/'))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes.buffer
    }
    const toB64url = (buffer: ArrayBuffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (const byte of bytes) {
        binary += String.fromCharCode(byte)
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    const publicKey = {
      ...options,
      challenge: toBuf(options.challenge),
      user: { ...options.user, id: toBuf(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map((c: any) => ({
        ...c,
        id: toBuf(c.id)
      }))
    }
    const credential: any = await navigator.credentials.create({ publicKey })

    return {
      id: credential.id,
      rawId: toB64url(credential.rawId),
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        attestationObject: toB64url(credential.response.attestationObject),
        clientDataJSON: toB64url(credential.response.clientDataJSON),
        transports: credential.response.getTransports?.() ?? []
      }
    }
  }, optionsJSON)
}

export function getAssertion(page: Page, optionsJSON: unknown) {
  return page.evaluate(async (options: any) => {
    const toBuf = (value: string) => {
      const pad = '='.repeat((4 - (value.length % 4)) % 4)
      const binary = atob((value + pad).replace(/-/g, '+').replace(/_/g, '/'))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes.buffer
    }
    const toB64url = (buffer: ArrayBuffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (const byte of bytes) {
        binary += String.fromCharCode(byte)
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    const publicKey = {
      ...options,
      challenge: toBuf(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((c: any) => ({
        ...c,
        id: toBuf(c.id)
      }))
    }
    const assertion: any = await navigator.credentials.get({ publicKey })

    return {
      id: assertion.id,
      rawId: toB64url(assertion.rawId),
      type: assertion.type,
      clientExtensionResults: assertion.getClientExtensionResults(),
      response: {
        authenticatorData: toB64url(assertion.response.authenticatorData),
        clientDataJSON: toB64url(assertion.response.clientDataJSON),
        signature: toB64url(assertion.response.signature),
        userHandle: assertion.response.userHandle ? toB64url(assertion.response.userHandle) : null
      }
    }
  }, optionsJSON)
}
