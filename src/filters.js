/** @typedef {import('./state.js').Filters} Filters */

/**
 * C3. Повертає поточні значення форми фільтрів #filters. Поки C3 не виконано, фільтрів немає,
 * і список показує всі серіали. Специфікація — ТЗ, C3.
 *
 * @returns {Filters}
 */
export function readFilters() {
  // TODO C3
  return {};
}

/**
 * C3. Підключає форму фільтрів: після кожної зміни — refresh(). main.js викликає цю функцію
 * один раз. Специфікація — ТЗ, C3.
 *
 * @param {() => void} refresh перемальовує список для поточних фільтрів
 */
export function initFilters(refresh) {
  // TODO C3
}
