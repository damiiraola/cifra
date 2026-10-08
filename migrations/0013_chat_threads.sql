alter table ledger_settings add column if not exists chat_threads jsonb not null default '[]'::jsonb;
