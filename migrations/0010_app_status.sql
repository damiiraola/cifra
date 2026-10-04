-- Estado general de la app (no por usuario). Hoy: cuándo fue el último mail
-- que salió bien y el último que falló, para avisar en pantalla si el envío
-- de mails está caído (sin revelar nada de ninguna cuenta).
create table if not exists app_status (
  key   text primary key,
  value text not null default '',
  at    timestamptz not null default now()
);
