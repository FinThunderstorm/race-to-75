const messages: Record<string, string> = {
  Unauthorized: 'Kirjaudu sisään uudelleen.',
  'Admin access required': 'Toiminto vaatii ylläpitäjän oikeudet.',
  'Request origin is not allowed': 'Pyyntöä ei sallita tästä osoitteesta.',
  'Enter a valid email, name, and account settings':
    'Anna kelvollinen sähköpostiosoite, nimi ja tilin asetukset.',
  'Invalid request': 'Virheellinen pyyntö.',
  'Could not manage users. Please try again.': 'Käyttäjien hallinta epäonnistui. Yritä uudelleen.',
  'User not found': 'Käyttäjää ei löytynyt.',
  'An account with this email already exists': 'Tällä sähköpostiosoitteella on jo tili.',
  'Enable this account before issuing an enrollment link':
    'Ota tili käyttöön ennen rekisteröitymislinkin luomista.',
  'Another admin must disable or demote your account':
    'Toisen ylläpitäjän on poistettava tilisi käytöstä tai muutettava rooliasi.',
  'At least one enabled admin must remain': 'Vähintään yhden ylläpitäjätilin on pysyttävä käytössä.'
}

export function adminErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      if (Object.hasOwn(messages, data.error)) {
        return messages[data.error]
      }
    }
  }
  return 'Muutoksen tallentaminen epäonnistui. Yritä uudelleen.'
}
