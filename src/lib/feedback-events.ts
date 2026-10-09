/** Open the "Contanos" sheet from anywhere (menu, sidebar, Ajustes). */
export const OPEN_FEEDBACK = "cifra:contanos";

export function openFeedback() {
  window.dispatchEvent(new Event(OPEN_FEEDBACK));
}
