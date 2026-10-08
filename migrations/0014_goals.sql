alter table ledger_settings add column if not exists goals jsonb not null default '[]'::jsonb;
