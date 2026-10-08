-- Una fila por llamada a la IA (asistente, informe, resumen PDF, interpretar
-- movimiento): solo metadatos para saber cuánto cuesta y frenar a tiempo.
-- Nunca el texto de la pregunta ni de la respuesta, ni montos del usuario.
-- Se borra a los 90 días (cron diario). Al borrar la cuenta, user_id queda en
-- null: el costo sigue contando para el tope global, pero ya no es de nadie.
create table if not exists ai_call_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  day           date not null,
  user_id       text,
  kind          text not null,
  provider      text,
  model         text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      double precision not null default 0,
  cost_source   text,
  latency_ms    integer,
  result        text not null
);

create index if not exists ai_call_log_day on ai_call_log (day);
create index if not exists ai_call_log_user on ai_call_log (user_id);
