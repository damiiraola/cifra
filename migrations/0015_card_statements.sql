-- Card statements imported from the bank's PDF (phase 3). What the bank
-- printed (real closing/due dates, totals, minimum, charges) is kept apart
-- from what Cifra adds up, so they can be reconciled. One per card and month.
create table if not exists ledger_card_statements (
  id                text primary key,
  user_id           text not null,
  book_id           text not null,
  card_id           text not null,
  period            text not null,
  closing_date      date not null,
  due_date          date not null,
  next_closing_date date,
  next_due_date     date,
  bank_total_ars    double precision not null default 0,
  bank_total_usd    double precision not null default 0,
  bank_minimum_ars  double precision not null default 0,
  charges_ars       double precision not null default 0,
  status            text not null default 'cerrado',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists ledger_card_statements_card_period
  on ledger_card_statements (user_id, card_id, period);

-- AI cap in units (chat 1, statement PDF 6) plus a separate count of PDFs per day.
alter table ai_usage add column if not exists pdf_count integer not null default 0;
