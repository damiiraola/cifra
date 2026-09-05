create table if not exists ledger_books (
  id         text primary key,
  user_id    text not null,
  name       text not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_books_user_idx on ledger_books (user_id);

create table if not exists ledger_accounts (
  id         text primary key,
  user_id    text not null,
  book_id    text not null,
  name       text not null,
  kind       text not null,
  currency   text not null,
  opening    double precision not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ledger_accounts_book_idx on ledger_accounts (user_id, book_id);

alter table ledger_transactions add column if not exists book_id text;
alter table ledger_transactions add column if not exists account_id text;
alter table ledger_transactions add column if not exists counterparty_id text;
alter table ledger_transactions add column if not exists amount_to double precision;
alter table ledger_transactions add column if not exists rate_ars double precision;
alter table ledger_transactions add column if not exists rate_locked boolean not null default false;

alter table ledger_settings add column if not exists active_book_id text;
alter table ledger_settings add column if not exists onboarded boolean not null default false;
alter table ledger_settings add column if not exists category_names jsonb not null default '{}'::jsonb;
