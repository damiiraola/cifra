# Seguridad

Cifra guarda plata de gente real. Si encontrás un agujero, **no lo abras en un issue público**.

## Cómo reportar

En el repo: **Security → Report a vulnerability**. GitHub nos avisa en privado.

Si no podés usar eso, escribí a quien te pasó el acceso de Cifra. No pegues tokens, claves ni dumps del libro.

## Qué no va en este repo

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `XAI_API_KEY`
- Cookies de sesión, mails de testers, respaldos JSON
- Capturas con saldos reales

Esos valores viven en Vercel / Neon, no en GitHub.

## Alcance

El código es público. Los libros no: cada cuenta ve solo la suya. Un clone del repo no abre producción.
