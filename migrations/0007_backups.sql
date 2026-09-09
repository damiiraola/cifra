create table if not exists ledger_backups (
  user_id    text not null,
  day        date not null,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists ledger_backups_user_day_idx on ledger_backups (user_id, day desc);
