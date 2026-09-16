alter table ledger_settings add column if not exists book_budgets jsonb not null default '{}'::jsonb;
alter table ledger_settings add column if not exists book_globals jsonb not null default '{}'::jsonb;
