alter table ledger_settings add column if not exists book_budget_locks jsonb not null default '{}'::jsonb;
