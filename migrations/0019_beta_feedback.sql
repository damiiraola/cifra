-- "Contanos": comentarios y problemas que la gente manda a propósito desde la
-- app. Tabla nueva (aditivo, idempotente). Se borra junto con la cuenta
-- (on delete cascade). No guarda el mail: si la persona acepta que le
-- respondan, el mail va solo en el aviso al dueño.
create table if not exists beta_feedback (
  id          bigint generated always as identity primary key,
  user_id     text references "user" ("id") on delete cascade,
  kind        text not null check (kind in ('comentario', 'problema', 'idea')),
  message     text not null check (char_length(message) between 1 and 2000),
  page        text,
  contact_ok  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists beta_feedback_created on beta_feedback (created_at);
create index if not exists beta_feedback_user on beta_feedback (user_id, created_at);
