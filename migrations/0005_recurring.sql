create table if not exists ledger_recurring (
  id          text primary key,
  user_id     text not null,
  book_id     text not null,
  type        text not null default 'expense',
  name        text not null,
  amount      double precision not null,
  currency    text not null,
  category_id text not null,
  account_id  text not null,
  method      text not null,
  day         integer not null,
  note        text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists ledger_recurring_user_idx on ledger_recurring (user_id, book_id);

alter table ledger_transactions add column if not exists recurring_id text;
