import { moneyARS } from "./format.ts";

export type Lesson = { id: string; title: string; body: string };

/** Plain-language primer. Written for someone who has never tracked money. */
export function lessonSet(cap: number): Lesson[] {
  const tope = cap > 0 ? `El tuyo este mes es ${moneyARS(cap)}. ` : "";
  return [
    {
      id: "libro",
      title: "Un libro es una lista",
      body: "Cifra anota lo que entra y lo que sale. No mueve tu plata y no es el banco. Si nunca usaste una app para esto, alcanza con cargar el día: cuánto, de dónde, y en qué se fue.",
    },
    {
      id: "caja",
      title: "Una caja es dónde está la plata",
      body: "Efectivo, el banco, Mercado Pago o los USDT son cajas distintas. El saldo es lo que había al empezar más lo que entró menos lo que salió. Si dos cajas no coinciden con la realidad, el resto de los números miente.",
    },
    {
      id: "movimiento",
      title: "Un movimiento es una anotación",
      body: "Hay tres: gasté, cobré, o pasé plata de una caja a otra. Pasar USDT al banco es un cambio: la plata sigue siendo tuya, no es un gasto. Un gasto es cuando la plata se va y no vuelve, como el súper o la luz.",
    },
    {
      id: "fijo",
      title: "Un fijo vuelve todos los meses",
      body: "El alquiler que pagás, la luz, el sueldo, el alquiler que cobrás. Se carga una vez, con el día. Cuando llega, Cifra avisa y vos decidís si anotarlo. Lo que cobrás también es un fijo: si no está, el mes parece más pobre de lo que es.",
    },
    {
      id: "tope",
      title: "El tope es hasta dónde te dejás gastar",
      body: `${tope}No es el saldo del banco. Es el techo del mes. Si los fijos ya ocupan casi todo ese techo, el mes está justo: lo que queda es para comer y moverte, no para otra cosa.`,
    },
    {
      id: "sobra",
      title: "Si sobra, se aparta solo",
      body: "Sobra cuando entra más de lo que te permitís gastar. Esa diferencia, el día que cobrás, se puede pasar a dólares y dejarla quieta: la parte grande en un índice amplio de empresas grandes de Estados Unidos (se compra y no se vende) y una parte chica en cripto, también quieta. El interés compuesto es simple: lo que quedó también crece, y al mes siguiente crece sobre eso. No es una ganancia prometida. Si el tope ya se come lo que entra, primero se baja el gasto. No se invierte la plata del alquiler.",
    },
  ];
}
