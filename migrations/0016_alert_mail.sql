-- Avisos por mail (phase 8). Opt-in per user, off by default. `token` is the
-- secret in the unsubscribe link (no login needed to stop the mails).
create table if not exists alert_mail_prefs (
  user_id      text primary key,
  enabled      boolean not null default false,
  token        text not null unique,
  last_sent_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Every alert already mailed (its id includes the card/goal and the period),
-- so the same alert never goes out twice.
create table if not exists alert_mail_sent (
  user_id  text not null,
  alert_id text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, alert_id)
);
