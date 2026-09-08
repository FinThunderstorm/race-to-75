# Admin user management

## Purpose

Let the bootstrapped admin onboard and manage other participants from the app,
including promoting members to admin. Reuse the existing passkey enrollment flow.

## Approach

Build an admin page and authenticated backend endpoints in the existing app.
Copyable invitation links reuse the current enrollment tokens and require no
email provider. Automated email invitations would add delivery configuration;
a command-line management tool would not meet the requested admin-view workflow.

## User experience

- Add an admin-only **Manage users** link to the dashboard and profile.
- At `/admin`, show users with name, email, role, and account status.
  Status distinguishes disabled accounts, accounts awaiting passkey enrollment,
  and enrolled accounts. Match the existing profile styling and support mobile.
- **Invite user** accepts email and display name and creates a member account.
  Show a copyable enrollment URL and its expiry; the admin shares it manually.
- Allow editing names and email addresses with clear validation errors.
- Allow issuing a fresh enrollment link for an enabled account. Invalidate prior
  unused links. Existing passkeys remain usable; this action adds a way to enroll
  a new device, rather than revoking existing credentials.
- Allow promoting members to admin and demoting admins to member, with confirmation.
- Allow disabling and re-enabling accounts, with confirmation for disabling.
  Preserve their readings and passkeys. Permanent deletion is outside this scope.
- Disallow disabling or demoting the current admin's own account. Additionally,
  enforce that at least one enabled admin remains, including concurrent requests.
- Show loading, empty, error, and success states. Disable duplicate submissions.
  Make invitation text selectable if clipboard access fails.

## Backend and data

Add a focused admin route module and query module. Use `/api/admin/users` for
listing and creation, `/api/admin/users/:id` for editing details, role, or enabled
state, and `/api/admin/users/:id/enrollment` for issuing a new link.

Add a migration for nullable `users.disabled_at`; existing accounts stay enabled.
Validate UUIDs, role values, nonblank names, and email addresses. Reject duplicate
email addresses case-insensitively without silently merging existing accounts.
Serialize account-management writes so duplicate checks and the enabled-admin
invariant remain correct under concurrent requests.

Generate cryptographically random invitation tokens and store only their hashes.
Use the configured enrollment TTL and WebAuthn origin for absolute links. Return
the raw link only on creation or reissue, never in user lists or application logs.
Creating a user and its token must be atomic; reissuing must atomically invalidate
old unused tokens and create the replacement. Disablement invalidates outstanding
enrollment tokens. Disabled accounts cannot receive new enrollment links.

## Access control

Check account existence and enabled state when validating authenticated requests.
Admin endpoints must authorize against the current database role, not a role
copied into a previously issued JWT. Recheck authorization inside management
transactions to avoid concurrent demotion races.

Disabled users cannot enroll, log in, or use an existing session. Re-enabling
restores access through existing passkeys; an unexpired previous session may also
become usable again. The UI must refresh current-user information after relevant
mutations and discard cached admin data on logout or lost admin access.

Disablement controls access to the app. Existing measurement history remains
visible and existing Withings synchronization continues. Integration lifecycle
management is outside this account-management change.

Protect write endpoints from cross-origin browser requests. Return 401 for
missing or disabled sessions, 403 for enabled non-admins, 404 for unknown target
users, 400 for invalid inputs, and 409 for duplicates or protected role changes.

## Verification

Exercise actual API authorization for anonymous users, members, admins, and
previously issued sessions after role changes or disablement. Cover concurrent
admin changes and duplicate invitations with database-backed tests.

Use the existing Playwright virtual authenticator to verify an admin inviting a
member, that member enrolling, promotion granting management access without a new
login, demotion revoking it, and disablement blocking sessions and passkeys.
Verify expired, consumed, and superseded invitation links are rejected, input
validation works, and management controls are unavailable to members.

Check the page at desktop and mobile sizes, run backend tests and both builds,
and run the repository's formatting, lint, and relevant end-to-end checks.
Update the README and bootstrap refusal message to describe the implemented flow
and the required migration for existing deployments.
