CREATE TABLE withings_weight_webhook_event (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  last_error text,
  raw_body text NOT NULL,
  withings_userid bigint NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  CONSTRAINT withings_weight_webhook_event_status_valid CHECK (
    status IN ('pending', 'processing', 'succeeded', 'failed')
  ),
  CONSTRAINT withings_weight_webhook_event_attempts_nonnegative CHECK (attempts >= 0),
  CONSTRAINT withings_weight_webhook_event_withings_userid_positive CHECK (withings_userid > 0),
  CONSTRAINT withings_weight_webhook_event_end_at_after_start_at CHECK (end_at >= start_at),
  CONSTRAINT withings_weight_webhook_event_user_window_unique UNIQUE (
    withings_userid,
    start_at,
    end_at
  )
);

CREATE INDEX withings_weight_webhook_event_status_next_attempt_at_idx
  ON withings_weight_webhook_event(status, next_attempt_at);

CREATE INDEX withings_weight_webhook_event_received_at_idx
  ON withings_weight_webhook_event(received_at DESC);

CREATE INDEX withings_weight_webhook_event_userid_idx
  ON withings_weight_webhook_event(withings_userid);
