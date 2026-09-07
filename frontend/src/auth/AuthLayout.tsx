import type { ReactNode } from 'react'

import { Racer } from '../Racer'

export const AuthLayout = ({ children }: { children: ReactNode }) => (
  <main className="auth-page">
    <div className="auth-brand">
      <p className="wordmark">Race to 75</p>
      <p className="subtitle">One goal. Every day counts.</p>
    </div>
    <section className="auth-panel">
      <Racer />
      <div className="auth-content">{children}</div>
    </section>
    <p className="auth-goal">
      75.0 kg <span>— The finish line</span>
    </p>
  </main>
)
