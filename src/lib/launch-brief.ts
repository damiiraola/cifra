import type { BetaAnswers, BetaQuestion } from "./beta-brief";

export const LAUNCH_QUESTIONS: BetaQuestion[] = [
  {
    id: "quien",
    title: "¿Quién entra a la beta?",
    options: [
      { id: "solo", label: "Solo yo" },
      { id: "confianza", label: "3 a 8 de confianza", sub: "Link, no abierto" },
      { id: "lista", label: "Lista de espera", sub: "Yo apruebo" },
      { id: "link", label: "Quien tenga el link se crea cuenta" },
    ],
  },
  {
    id: "invitacion",
    title: "¿Cómo les mandás el acceso?",
    options: [
      { id: "wa", label: "WhatsApp con el link" },
      { id: "mail", label: "Mail de invitación", sub: "Cifra manda el mail" },
      { id: "ambas", label: "Las dos" },
    ],
  },
  {
    id: "dominio",
    title: "Dominio en la beta",
    options: [
      { id: "vercel", label: "Seguimos el link de Vercel" },
      { id: "propio", label: "cifra.com.ar ya" },
      { id: "despues", label: "Dominio después, beta igual" },
    ],
  },
  {
    id: "primera",
    title: "Un tester nuevo, primera pantalla",
    options: [
      { id: "ahora", label: "Como ahora", sub: "Onboarding de saldos" },
      { id: "rapida", label: "30 segundos", sub: "Mail, 2 cajas, un gasto" },
      { id: "demo", label: "Libro de ejemplo y poder borrarlo" },
    ],
  },
  {
    id: "critico",
    title: "El día 1, ¿qué no puede fallar?",
    hint: "Tocá todas las que apliquen, después Siguiente.",
    multi: true,
    options: [
      { id: "login", label: "Login, mail, olvidé clave" },
      { id: "carga", label: "Cargar un gasto en 10 segundos" },
      { id: "saldos", label: "Ver ARS, USD y USDT bien" },
      { id: "libros", label: "Personal y Negocio separados" },
      { id: "fijos", label: "Fijos del mes" },
      { id: "fx", label: "Cotización en vivo" },
      { id: "persistir", label: "Que no se pierda el libro al recargar" },
    ],
  },
  {
    id: "pulir",
    title: "¿Qué pulimos primero?",
    options: [
      { id: "plus", label: "Carga rápida (el +)" },
      { id: "movil", label: "Inicio vacío / se ve mal en el iPhone" },
      { id: "ajustes", label: "Ajustes y categorías" },
      { id: "analitica", label: "Analítica del mes" },
      { id: "login", label: "Login y mails" },
    ],
  },
  {
    id: "fuera",
    title: "Qué no entra en esta beta",
    hint: "Tocá todas las que quieras dejar afuera.",
    multi: true,
    options: [
      { id: "wa", label: "WhatsApp" },
      { id: "csv", label: "Excel / CSV del banco" },
      { id: "ia_auto", label: "IA que carga sola" },
      { id: "socio", label: "Un socio viendo tu libro" },
      { id: "nativa", label: "App nativa / TestFlight" },
      { id: "nada", label: "Nada: quiero casi todo lo que ya está" },
    ],
  },
  {
    id: "alertas",
    title: "Alertas en la beta",
    options: [
      { id: "ninguna", label: "Ninguna" },
      { id: "diario", label: "¿Cargaste el día?", sub: "En la app o mail" },
      { id: "presupuesto", label: "Te pasaste el presupuesto" },
      { id: "ambas", label: "Las dos" },
    ],
  },
  {
    id: "informe",
    title: "Informe del mes",
    options: [
      { id: "app", label: "Solo en la app" },
      { id: "mail", label: "Mail el 1 de cada mes" },
      { id: "ambos", label: "Los dos" },
    ],
  },
  {
    id: "bugs",
    title: "Si se rompe, ¿dónde te avisan?",
    options: [
      { id: "wa", label: "WhatsApp tuyo" },
      { id: "boton", label: "Botón “se rompió” en Cifra" },
      { id: "mail", label: "Mail" },
    ],
  },
  {
    id: "nombre",
    title: "¿El nombre Cifra queda?",
    options: [
      { id: "cifra", label: "Queda Cifra" },
      { id: "otro", label: "Lo cambio después" },
    ],
  },
  {
    id: "precio",
    title: "Precio ahora",
    options: [
      { id: "gratis", label: "Gratis total" },
      { id: "badge", label: "Gratis, con “beta” visible" },
      { id: "aviso", label: "Gratis, pero aviso que después va a costar" },
    ],
  },
  {
    id: "exito",
    title: "¿Cuándo decimos que funcionó?",
    options: [
      { id: "racha", label: "Yo, 7 días seguidos cargando" },
      { id: "testers", label: "3 testers que no sea yo, 5 días cada uno" },
      { id: "mes", label: "Cerrar el mes y entender el gasto" },
    ],
  },
  {
    id: "molesto",
    title: "Lo más molesto hoy",
    options: [
      { id: "data", label: "Se pierde data / login" },
      { id: "movil", label: "En el teléfono se ve mal" },
      { id: "carga", label: "Cargar es lento o confuso" },
      { id: "fx", label: "Las cotizaciones / USDT" },
      { id: "inicio", label: "No sé qué tocar primero" },
      { id: "otra", label: "Otra cosa", sub: "La anotás en el chat si hace falta" },
    ],
  },
  {
    id: "plazo",
    title: "¿Para cuándo “invitá a alguien”?",
    options: [
      { id: "3", label: "3 días" },
      { id: "7", label: "7 días" },
      { id: "14", label: "14 días" },
    ],
  },
  {
    id: "perfil",
    title: "Los testers, ¿qué usan?",
    options: [
      { id: "full", label: "Como yo: los dos libros + USDT" },
      { id: "ars", label: "Solo Personal / pesos" },
      { id: "mezcla", label: "Mezcla" },
    ],
  },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function formatLaunchCode(answers: BetaAnswers): string {
  return LAUNCH_QUESTIONS.map((q, i) => {
    const letter = LETTERS[i] ?? String(i + 1);
    const v = answers[q.id];
    if (Array.isArray(v) && v.length) {
      const idx = v
        .map((id) => q.options.findIndex((o) => o.id === id) + 1)
        .filter((n) => n > 0);
      return `${letter}${idx.join(",")}`;
    }
    if (typeof v === "string" && v) {
      const n = q.options.findIndex((o) => o.id === v) + 1;
      return n > 0 ? `${letter}${n}` : `${letter}:${v}`;
    }
    return `${letter}-`;
  }).join(" ");
}
