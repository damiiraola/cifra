-- Card purchases in cuotas (phase 2). The cuotas themselves are ordinary
-- ledger_transactions with deterministic ids `cuo_<purchase>_<k>`.
create table if not exists ledger_card_purchases (
  id                 text primary key,
  user_id            text not null,
  book_id            text not null,
  card_id            text not null,
  date               date not null,
  merchant           text not null default '',
  category_id        text not null,
  currency           text not null default 'ARS',
  installments       integer not null,
  installment_amount double precision not null,
  total              double precision not null,
  interest_free      boolean not null default true,
  cash_price         double precision not null default 0,
  paid_before        integer not null default 0,
  note               text not null default '',
  created_at         timestamptz not null default now()
);
create index if not exists ledger_card_purchases_user_idx on ledger_card_purchases (user_id, card_id);

alter table ledger_transactions add column if not exists purchase_id text;
alter table ledger_transactions add column if not exists installment_no integer;
alter table ledger_transactions add column if not exists installment_count integer;
create index if not exists ledger_transactions_purchase_idx
  on ledger_transactions (user_id, purchase_id) where purchase_id is not null;
