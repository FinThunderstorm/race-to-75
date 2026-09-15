# Separate profile and administration

## Design

Use separate `/profile` and `/admin` pages with a shared account navigation and
page shell. Direct links keep the two destinations easy to find; a dropdown
would hide them and tabs on the old settings page would keep unrelated work
in one view.

The top-right navigation shows login to guests, profile to members, and profile
plus administration to admins. Signed-in users can also log out there. Radiator
mode hides all account navigation. Existing anonymous access restrictions remain.

Profile leads with manual biceps, blood pressure, and SBD measurements. Quick
section links make each form reachable. Personal details (height and sex) and
Withings/Eufy connections follow in separate sections. Keep existing validation,
history, deletion, integration feedback, and form anchors.

Admin contains participant invitations and account management, followed by shared
score settings. Give both sections direct navigation and explain that scoring
changes affect the group. Use the existing dark palette, clear spacing, bounded
form widths, and responsive grids.

Protect profile with authentication and admin with the current admin role. A
member opening admin returns to profile without fetching admin data. Old
`/settings` URLs redirect to profile, preserving query parameters and anchors,
including integration callbacks. Preserve race mode when navigating back.

## Verification

Cover role-specific links, their header position, anonymous login, radiator
suppression, page separation, direct-route guards, role revocation, legacy
redirects, mobile overflow, and existing measurement/integration workflows.
Run frontend build, formatting/lint checks, and relevant Playwright tests.
