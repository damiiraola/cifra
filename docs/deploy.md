# Deploy y base de datos

## Cómo se deploya hoy
- **Vercel (integración con GitHub)** hace todos los deploys: cada push a `main` → producción (cifra.lol); cada PR → un preview.
- Vercel corre `npm run build` (`scripts/build.mjs`):
  1. **Solo en producción** (`VERCEL_ENV=production`): `npm run typecheck` y `npm test` (sin las variables de la app ni de la base). Si algo falla, el deploy falla y queda online la versión anterior.
  2. `vite build`.
  3. `npm run db:migrate` → **solo en producción**. En previews se saltea (ver abajo).
- `.github/workflows/deploy.yml` también puede deployar a producción, pero solo si existen los secretos `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` en GitHub. Hoy no están, así que termina en segundos sin hacer nada. Si algún día se cargan, conviene apagar el deploy automático de producción de la integración de Vercel para no deployar dos veces.
- `.github/workflows/ci.yml` corre en cada PR y en `main`: typecheck, lint, tests y build (el job se sigue llamando "Typecheck y tests" para no romper checks requeridos).

## Por qué los previews no migran
Hoy `DATABASE_URL` (y las `PG*`/`POSTGRES_*`) están en **Production y Preview** con la misma base. Antes de este cambio, cualquier PR abierto aplicaba sus migraciones a la base real **antes** de que se aprobara.

Ahora `scripts/migrate.mjs` solo migra si `VERCEL_ENV=production` (regla en `scripts/deploy-policy.mjs`, con tests). Consecuencia: un preview cuyo código necesita una tabla nueva puede fallar en esa parte hasta que se mergee. Es lo esperado mientras Preview use la base de producción.

## Cuando Preview tenga su propia base (recomendado)
1. Crear una rama de Neon para previews y poner su URL como `DATABASE_URL` (y las `PG*`/`POSTGRES_*`) **solo en Preview**.
2. Agregar `MIGRATE_ON_PREVIEW=1` **solo en Preview**. Desde ahí los previews migran su propia base.

## Migrar a mano
`DATABASE_URL=… npm run db:migrate` (fuera de Vercel no hay `VERCEL_ENV`, así que migra). Ojo: migra la base que pongas.
