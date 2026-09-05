export type BetaQuestion = {
  id: string;
  title: string;
  hint?: string;
  multi?: boolean;
  optional?: boolean;
  input?: "none" | "text";
  options: { id: string; label: string; sub?: string }[];
};

export const BETA_QUESTIONS: BetaQuestion[] = [
  {
    id: "quien",
    title: "¿Para quién es esta beta?",
    options: [
      { id: "solo", label: "Solo yo", sub: "Libro personal" },
      { id: "varios", label: "Yo y 1 o 2 más", sub: "Cada uno con su libro" },
      { id: "compartido", label: "Un libro compartido", sub: "Negocio o socio" },
      { id: "libros", label: "Libros separados", sub: "Personal y negocio" },
    ],
  },
  {
    id: "ronda",
    title: "¿Cuántas personas en la primera ronda?",
    options: [
      { id: "1", label: "Solo yo" },
      { id: "5", label: "3 a 5" },
      { id: "20", label: "10 a 20" },
      { id: "abierta", label: "Abierta" },
    ],
  },
  {
    id: "dia1",
    title: "El día 1, ¿qué tiene que quedar claro?",
    options: [
      { id: "gastos", label: "Cuánto gasté este mes" },
      { id: "saldos", label: "Cuánta plata tengo", sub: "Saldos ARS / USD / USDT" },
      { id: "ambos", label: "Las dos cosas" },
    ],
  },
  {
    id: "transfer",
    title: "Cuando pasás USDT a pesos, o Mercado Pago al banco…",
    hint: "Hoy Cifra lo cuenta como gasto y infla el mes.",
    options: [
      { id: "cambio", label: "Es un cambio, no un gasto" },
      { id: "mano", label: "Lo cargo a mano en dos movimientos" },
      { id: "cajas", label: "Quiero cajas y mover entre ellas", sub: "Efectivo, MP, banco, Binance" },
    ],
  },
  {
    id: "fx",
    title: "¿Qué cotización usamos en cada movimiento?",
    options: [
      { id: "historica", label: "La del día del movimiento", sub: "Recomendado" },
      { id: "ahora", label: "Siempre la de ahora" },
      { id: "elegir", label: "Yo elijo en cada carga", sub: "Blue, MEP, cripto o manual" },
    ],
  },
  {
    id: "usd",
    title: "Default para el dólar cash",
    options: [
      { id: "blue", label: "Blue" },
      { id: "mep", label: "MEP" },
      { id: "ccl", label: "CCL" },
      { id: "oficial", label: "Oficial" },
    ],
  },
  {
    id: "usdt",
    title: "USDT, ¿siempre al dólar cripto?",
    options: [
      { id: "cripto", label: "Sí, siempre DolarApi cripto" },
      { id: "p2p", label: "A veces P2P con precio mío" },
    ],
  },
  {
    id: "carga",
    title: "¿Cómo lo vas a cargar la mayoría de los días?",
    hint: "Podés marcar más de una.",
    multi: true,
    options: [
      { id: "form", label: "Formulario rápido" },
      { id: "ia", label: "Texto / IA", sub: "“Gasté 15 mil en Coto”" },
      { id: "wa", label: "WhatsApp" },
      { id: "csv", label: "Excel o CSV del banco / MP" },
      { id: "fijos", label: "Gastos que se repiten", sub: "Alquiler, Edenor, Netflix" },
    ],
  },
  {
    id: "volumen",
    title: "En un día normal, ¿cuántos movimientos?",
    options: [
      { id: "pocos", label: "1 a 3" },
      { id: "medio", label: "4 a 8" },
      { id: "muchos", label: "9 o más" },
    ],
  },
  {
    id: "cats",
    title: "Categorías",
    options: [
      { id: "fijas", label: "Las 12 de ahora me alcanzan" },
      { id: "editar", label: "Quiero crear y renombrar" },
      { id: "tags", label: "Categorías + etiquetas", sub: "Personal, negocio, viaje…" },
    ],
  },
  {
    id: "presupuesto",
    title: "Presupuesto",
    options: [
      { id: "global", label: "Un tope del mes" },
      { id: "rubro", label: "Por rubro" },
      { id: "ambos", label: "Los dos, como ahora" },
    ],
  },
  {
    id: "ia",
    title: "La IA en esta beta",
    options: [
      { id: "ahora", label: "Como ahora", sub: "Preguntar y dictar un gasto" },
      { id: "informe", label: "Informe el 1 de cada mes" },
      { id: "auto", label: "Que cargue sin que yo confirme" },
      { id: "fuera", label: "Fuera de esta beta" },
    ],
  },
  {
    id: "alertas",
    title: "Alertas",
    options: [
      { id: "ninguna", label: "Ninguna" },
      { id: "presupuesto", label: "Me pasé el presupuesto" },
      { id: "diario", label: "Recordatorio diario", sub: "¿Cargaste el día?" },
      { id: "ambas", label: "Presupuesto y recordatorio" },
    ],
  },
  {
    id: "acceso",
    title: "Cómo se entra",
    options: [
      { id: "oauth", label: "Google y X, como ahora" },
      { id: "email", label: "Sumar email y contraseña" },
      { id: "invite", label: "Solo con invitación" },
    ],
  },
  {
    id: "visibilidad",
    title: "¿Alguien más ve tu libro en esta beta?",
    options: [
      { id: "nadie", label: "Nadie" },
      { id: "lectura", label: "Un socio, solo lectura" },
      { id: "carga", label: "Un socio, puede cargar" },
    ],
  },
  {
    id: "onboarding",
    title: "La primera vez que abrís Cifra",
    options: [
      { id: "vacio", label: "Libro vacío + 3 preguntas" },
      { id: "demo", label: "Ver el ejemplo y poder borrarlo" },
      { id: "primero", label: "Obligar el primer movimiento" },
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
    id: "plazo",
    title: "¿Para cuándo la beta usable?",
    options: [
      { id: "3", label: "3 días" },
      { id: "7", label: "7 días" },
      { id: "14", label: "14 días" },
    ],
  },
  {
    id: "exito",
    title: "¿Cuándo decimos que funcionó?",
    options: [
      { id: "racha", label: "7 días seguidos cargando" },
      { id: "informe", label: "Ver el informe del mes" },
      { id: "socio", label: "Que el socio también lo use" },
    ],
  },
  {
    id: "sensible",
    title: "¿Hay algo que no deba entrar nunca?",
    hint: "CUIL, CBU, clientes, tickets. Si no, seguí.",
    optional: true,
    input: "text",
    options: [
      { id: "nada", label: "Nada, puede entrar todo" },
      { id: "omitir", label: "Prefiero anotarlo después" },
    ],
  },
];

export type BetaAnswers = Record<string, string | string[]>;

export function isAnswered(q: BetaQuestion, answers: BetaAnswers) {
  const v = answers[q.id];
  if (q.optional) return true;
  if (q.multi) return Array.isArray(v) && v.length > 0;
  if (q.input === "text") return typeof v === "string" && v.trim().length > 0;
  return typeof v === "string" && v.length > 0;
}
