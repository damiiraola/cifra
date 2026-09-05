-- Per-user ledger: movements + settings. user_id is TEXT (Better Auth ids).
create table if not exists ledger_transactions (
  id          text primary key,
  user_id     text not null,
  type        text not null,
  amount      double precision not null,
  currency    text not null,
  category_id text not null,
  note        text not null default '',
  merchant    text not null default '',
  date        date not null,
  method      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists ledger_transactions_user_date_idx
  on ledger_transactions (user_id, date desc);

create table if not exists ledger_settings (
  user_id       text primary key,
  budgets       jsonb not null,
  global_budget double precision not null,
  usd_rate      double precision not null,
  updated_at    timestamptz not null default now()
);
