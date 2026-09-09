alter table ledger_settings add column if not exists hidden_category_ids jsonb not null default '[]'::jsonb;
alter table ledger_settings add column if not exists custom_categories jsonb not null default '[]'::jsonb;
