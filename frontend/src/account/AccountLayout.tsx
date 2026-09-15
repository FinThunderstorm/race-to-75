import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { parseRaceMode } from '../race/raceModes'
import { AccountNavigation } from './AccountNavigation'

export const AccountLayout = ({
  title,
  description,
  children,
  admin = false
}: {
  title: string
  description: string
  children: ReactNode
  admin?: boolean
}) => {
  const [params] = useSearchParams()
  const mode = parseRaceMode(params.get('mode'))
  return (
    <main className={`settings-page account-page${admin ? ' settings-page--admin' : ''}`}>
      <div className="account-toolbar">
        <Link className="text-button" to={`/?mode=${mode}`}>
          ← Takaisin kisaan
        </Link>
        <AccountNavigation />
      </div>
      <header className="account-heading">
        <p className="eyebrow">Race to 75 {admin ? ' / Ylläpito' : ' / Oma tili'}</p>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
      </header>
      {children}
    </main>
  )
}
