CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_not_blank CHECK (btrim(email) <> ''),
  CONSTRAINT users_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT users_role_valid CHECK (role IN ('admin', 'member'))
);

CREATE TABLE credentials (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credentials_credential_id_unique UNIQUE (credential_id),
  CONSTRAINT credentials_credential_id_not_blank CHECK (btrim(credential_id) <> ''),
  CONSTRAINT credentials_counter_nonnegative CHECK (counter >= 0)
);

CREATE INDEX credentials_user_id_idx ON credentials(user_id);

CREATE TABLE measurement (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg numeric(5, 2) NOT NULL,
  measured_at timestamptz NOT NULL,
  source text NOT NULL,
  external_id text,
  CONSTRAINT measurement_weight_kg_reasonable CHECK (weight_kg > 0 AND weight_kg < 1000),
  CONSTRAINT measurement_source_not_blank CHECK (btrim(source) <> ''),
  CONSTRAINT measurement_external_id_source_unique UNIQUE (source, external_id)
);

CREATE INDEX measurement_user_id_measured_at_idx ON measurement(user_id, measured_at DESC);
CREATE INDEX measurement_measured_at_idx ON measurement(measured_at DESC);

CREATE TABLE integration_connection (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  status text NOT NULL,
  CONSTRAINT integration_connection_user_provider_unique UNIQUE (user_id, provider),
  CONSTRAINT integration_connection_provider_not_blank CHECK (btrim(provider) <> ''),
  CONSTRAINT integration_connection_access_token_not_blank CHECK (btrim(access_token) <> ''),
  CONSTRAINT integration_connection_status_not_blank CHECK (btrim(status) <> '')
);

CREATE INDEX integration_connection_user_id_idx ON integration_connection(user_id);
CREATE INDEX integration_connection_provider_status_idx ON integration_connection(provider, status);
