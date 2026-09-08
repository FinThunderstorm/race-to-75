# Radiator IP access

## Requested behavior and design

Anonymous visitors whose resolved client address matches `RADIATOR_ALLOWED_IP`
can view the live race at `/`. This is read-only access to a separate radiator
endpoint, never a user session. Authenticated visitors keep the existing dashboard,
settings and logout. `/login` and enrollment remain available from every network.

The radiator hides the entire footer and sample-data toggle, but keeps the Full
screen control in its header. Its chart grows with
the viewport without the normal maximum height; narrow screens and large standings
remain readable. Live data continues refreshing every 30 seconds.

The IP override defaults off and accepts one IPv4 or IPv6 address. `TRUST_PROXY`
optionally lists trusted proxy IPs/CIDRs; forwarded addresses are otherwise ignored.
The deployment must use the office's public egress address when accessing through
the public host, or its private address when that is actually visible to the server.

A small bottom-right indicator reports `IP allowed` or `IP not allowed` on every
screen, independently of the user's session. It polls a data-free status endpoint
using the same IP predicate every 30 seconds and reports unavailable checks without
retaining a stale allowed state.

## Implementation plan

- [x] Add failing Fastify injection tests for allowed/denied addresses, mapped IPv4,
  trusted versus untrusted forwarding, disabled override, read-only scope and login.
- [x] Add failing browser tests for anonymous full-height mode, resizing, denied
  access, polling/revocation, settings protection and normal login on the network.
- [x] Add validated environment options and an IP-protected radiator endpoint sharing
  the existing race query. Configure Fastify's trusted proxies explicitly.
- [x] Add dashboard-only IP fallback and live radiator presentation. Preserve all
  account route guards and session behavior.
- [x] Document environment/deployment setup; run unit, browser, build, lint and
  unused-code checks; review the final diff.

## Verification

47 Playwright tests and 17 backend tests pass. Both production builds, Biome,
Markdown lint, knip and diff checks pass. The tests cover actual passkey enrollment,
logout and login on an allowed network, protected account endpoints, proxy spoofing,
address validation, automatic refresh/revocation, desktop resizing and small screens.
Indicator tests verify bottom-right placement, signed-in and login states, polling,
failure recovery, and status checks through trusted versus untrusted proxies.

Review identified labels escaping above the page in short desktop windows. A
regression test reproduced it; the shared chart/standings row now keeps enough
height for every label and allows scrolling when needed. Integration tests also
caught cached session data redirecting logout back to the radiator; logout now
clears the authentication cache before opening login.

Deployment values remain unset. Configure the actual allowed address and trusted
proxy addresses in the deployment environment, then redeploy to enable IP access.
