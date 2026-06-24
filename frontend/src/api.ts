async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  return response.json()
}

export type CurrentUser = { id: string; email: string; display_name: string; role: string }

export async function fetchMe(): Promise<CurrentUser | null> {
  const response = await fetch('/auth/me')

  return response.ok ? response.json() : null
}

export const authApi = {
  enrollOptions: (token: string) => postJson('/auth/enroll/options', { token }),
  enrollVerify: (token: string, response: unknown, deviceName?: string) =>
    postJson('/auth/enroll/verify', { token, response, deviceName }),
  loginOptions: () => postJson('/auth/login/options'),
  loginVerify: (response: unknown) => postJson('/auth/login/verify', { response }),
  logout: () => postJson('/auth/logout')
}
