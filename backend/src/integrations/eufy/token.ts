import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

function key(secret: string) {
  return Buffer.from(hkdfSync('sha256', secret, '', 'race-to-75/eufy-token/v1', 32))
}

export function encryptToken(token: string, userId: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  cipher.setAAD(Buffer.from(userId))
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function decryptToken(encrypted: string, userId: string, secret: string) {
  const bytes = Buffer.from(encrypted, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(userId))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
}
