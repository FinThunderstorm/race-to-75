import { useId, useState } from 'react'

export const UserDetailsForm = ({
  label,
  initialName = '',
  initialEmail = '',
  busy,
  submitLabel,
  onSubmit,
  onCancel
}: {
  label: string
  initialName?: string
  initialEmail?: string
  busy: boolean
  submitLabel: string
  onSubmit: (details: { email: string; display_name: string }) => Promise<boolean>
  onCancel?: () => void
}) => {
  const id = useId()
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  return (
    <form
      aria-label={label}
      className="admin-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (await onSubmit({ email: email.trim(), display_name: name.trim() })) {
          setName('')
          setEmail('')
        }
      }}
    >
      <div className="admin-fields">
        <label htmlFor={`${id}-name`}>
          Näyttönimi
          <input
            id={`${id}-name`}
            required
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label htmlFor={`${id}-email`}>
          Sähköposti
          <input
            id={`${id}-email`}
            type="email"
            required
            maxLength={254}
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="admin-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={busy || !name.trim() || !email.trim()}
        >
          {busy ? 'Tallennetaan…' : submitLabel}
        </button>
        {onCancel && (
          <button className="text-button" type="button" disabled={busy} onClick={onCancel}>
            Peruuta
          </button>
        )}
      </div>
    </form>
  )
}
