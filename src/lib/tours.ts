export type TourStep = { title: string; body: string; anchor?: string };

export type Tour = {
  path: "/" | "/analitica" | "/presupuestos" | "/tarjetas" | "/ia" | "/ajustes" | "/aprender";
  page: string;
  steps: TourStep[];
};

export const TOURS: Tour[] = [
  {
    path: "/",
    page: "Diario",
    steps: [
      {
        anchor: "mes",
        title: "Este es el mes",
        body: "El número grande es lo que ya gastaste. No es lo que te queda en el banco.",
      },
      {
        anchor: "nuevo",
        title: "Acá se anota",
        body: "Nuevo carga un gasto, un ingreso, o un pase de una caja a otra. Pasar USDT al banco no es un gasto: la plata sigue siendo tuya.",
      },
      {
        title: "Los fijos avisan",
        body: "Si este mes falta anotar un fijo, Cifra lo dice arriba. Vos decidís si cargarlo.",
      },
    ],
  },
  {
    path: "/analitica",
    page: "Analítica",
    steps: [
      {
        anchor: "titulo",
        title: "A dónde se fue",
        body: "Acá está el mes resumido: categorías, no cada ticket.",
      },
      {
        title: "Fijo y variable",
        body: "Fijo es lo que se repite (alquiler, luz). Variable es lo del día a día, como el súper.",
      },
      {
        title: "El detalle está en el diario",
        body: "Si un número no cierra, volvé al día y mirá el movimiento. Analítica no cambia la plata, solo la cuenta.",
      },
    ],
  },
  {
    path: "/presupuestos",
    page: "Presupuestos",
    steps: [
      {
        anchor: "titulo",
        title: "El tope no es el saldo",
        body: "Es hasta dónde te dejás gastar en el mes. Lo ponés vos.",
      },
      {
        title: "El plan usa lo que entra",
        body: "Suma los ingresos fijos, como el sueldo y un alquiler que cobrás, y les resta lo que se paga sí o sí.",
      },
      {
        title: "Cada categoría tiene un techo",
        body: "Si no escribís un número, Cifra usa los fijos de esa categoría. Si no hay fijos, usa lo que ya gastaste.",
      },
    ],
  },
  {
    path: "/tarjetas",
    page: "Tarjetas",
    steps: [
      {
        anchor: "titulo",
        title: "Una tarjeta, dos cajas",
        body: "Pesos y dólares van separados. El límite es lo que el banco te presta, no plata tuya.",
      },
      {
        title: "La cuota no se carga doce veces",
        body: "Anotás la compra una vez. Cifra reparte las cuotas en los meses que vienen.",
      },
      {
        title: "El resumen no es un gasto nuevo",
        body: "Pagar la tarjeta mueve plata de una caja a otra. El gasto ya fue cuando compraste.",
      },
    ],
  },
  {
    path: "/ia",
    page: "Asistente",
    steps: [
      {
        anchor: "titulo",
        title: "Preguntale a este libro",
        body: "Lee tus cajas, movimientos y fijos. No busca en internet ni inventa números.",
      },
      {
        title: "Si no entendés una palabra",
        body: "Decilo. Explica caja, fijo o tope en la misma frase, como si fuera la primera vez.",
      },
      {
        title: "Las charlas quedan",
        body: "Arriba están las conversaciones anteriores. Nueva abre otra sin borrar la de ahora.",
      },
    ],
  },
  {
    path: "/ajustes",
    page: "Ajustes",
    steps: [
      {
        anchor: "titulo",
        title: "Acá se configura el libro",
        body: "El dólar, las cajas y el tope. No es la lista de gastos: eso está en el diario.",
      },
      {
        title: "Los fijos viven acá",
        body: "Alquiler, sueldo, lo que cobrás cada mes. Si no los cargaste al entrar, se cargan en esta página.",
      },
      {
        title: "Personal y negocio van aparte",
        body: "Cada libro tiene sus cajas y sus números. Cambiar de libro no mezcla la plata.",
      },
    ],
  },
  {
    path: "/aprender",
    page: "Aprender",
    steps: [
      {
        anchor: "titulo",
        title: "Una idea por vez",
        body: "Estas seis notas son para quien nunca anotó la plata. Se leen en orden, sin apuro.",
      },
      {
        anchor: "recorridos",
        title: "Los recorridos se pueden repetir",
        body: "La primera vez que entrás a una página, Cifra te la muestra. Desde acá los volvés a ver.",
      },
    ],
  },
];

export function tourFor(path: string) {
  return TOURS.find((t) => t.path === path);
}

function seenKey(email: string) {
  return `cifra-seen-tours:${email.trim().toLowerCase()}`;
}

export function readSeen(email: string, storage: Pick<Storage, "getItem">) {
  if (!email.trim()) return [];
  try {
    const raw = storage.getItem(seenKey(email));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markSeen(email: string, path: string, storage: Pick<Storage, "getItem" | "setItem">) {
  if (!email.trim() || !path) return;
  const next = [...new Set([...readSeen(email, storage), path])];
  storage.setItem(seenKey(email), JSON.stringify(next));
}

let replayPath: string | null = null;
const replayListeners = new Set<() => void>();

export function replayTour(path: string) {
  replayPath = path;
  replayListeners.forEach((fn) => fn());
}

export function clearReplay() {
  if (!replayPath) return;
  replayPath = null;
  replayListeners.forEach((fn) => fn());
}

export function currentReplay() {
  return replayPath;
}

export function subscribeReplay(fn: () => void) {
  replayListeners.add(fn);
  return () => {
    replayListeners.delete(fn);
  };
}
