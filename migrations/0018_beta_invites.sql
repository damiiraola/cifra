-- Beta cerrada: invitaciones y lista de espera. Solo tablas nuevas (aditivo,
-- idempotente): no toca ninguna tabla existente.
--
-- beta_invites: un código por invitación, con límite de usos. No guarda quién
-- lo usó: solo cuántas veces.
create table if not exists beta_invites (
  code        text primary key,
  max_uses    integer not null default 1 check (max_uses between 1 and 100),
  uses        integer not null default 0 check (uses >= 0),
  note        text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz
);

-- Quien llega sin invitación puede dejar el mail. Se borra a pedido o cuando
-- el dueño lo saca de la lista.
create table if not exists beta_waitlist (
  email       text primary key,
  created_at  timestamptz not null default now()
);

create index if not exists beta_waitlist_created on beta_waitlist (created_at);
