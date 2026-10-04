-- Límite de intentos de Better Auth guardado en la base (no en la memoria de
-- cada servidor de Vercel, que se reinicia y no se comparte). Columnas en
-- camelCase entre comillas porque así las consulta Better Auth.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

-- Cuántas preguntas le hizo cada usuario al asistente por día (tope diario).
create table if not exists ai_usage (
  user_id text not null,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);
