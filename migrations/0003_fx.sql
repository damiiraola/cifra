alter table ledger_settings
  add column if not exists usdt_rate double precision not null default 1574;
alter table ledger_settings
  add column if not exists usd_source text not null default 'blue';
