CREATE TABLE eufy_setup (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  setup_id uuid NOT NULL,
  access_token text NOT NULL,
  account_id text NOT NULL,
  profiles jsonb NOT NULL,
  token_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);

CREATE TABLE eufy_sync (
  connection_id uuid PRIMARY KEY REFERENCES integration_connection(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  profile_id text NOT NULL,
  profile_name text NOT NULL,
  import_from timestamptz NOT NULL,
  last_synced_at timestamptz,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  last_error text
);
