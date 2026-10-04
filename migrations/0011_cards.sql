-- Credit cards (phase 1). One row per card + two cajas of kind 'card' in
-- ledger_accounts (ARS and USD). Never the full card number: last4 only.
create table if not exists ledger_cards (
  id                     text primary key,
  user_id                text not null,
  book_id                text not null,
  name                   text not null,
  bank                   text not null default '',
  network                text not null default 'otra',
  last4                  text not null default '',
  closing_day            integer not null,
  due_day                integer not null,
  limit_ars              double precision not null default 0,
  limit_installments_ars double precision not null default 0,
  account_ars_id         text not null,
  account_usd_id         text not null,
  pay_account_id         text not null default '',
  usd_perception_pct     double precision not null default 30,
  tna                    double precision not null default 0,
  archived               boolean not null default false,
  created_at             timestamptz not null default now()
);
create index if not exists ledger_cards_user_idx on ledger_cards (user_id, book_id);

-- Statement a card expense belongs to (YYYY-MM of the closing). Computed when
-- loading the movement, stored so it can be corrected by hand later.
alter table ledger_transactions add column if not exists card_period text;
