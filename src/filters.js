/** @typedef {import('./state.js').Filters} Filters */

/**
 * C3. Повертає поточні значення форми фільтрів #filters. Поки C3 не виконано, фільтрів немає,
 * і список показує всі серіали. Специфікація — ТЗ, C3.
 *
 * @returns {Filters}
 */
export function readFilters() {
  const form = document.querySelector('#filters');
  if (!(form instanceof HTMLFormElement)) throw new TypeError('Не знайдено форму #filters');

  const query = form.elements.namedItem('query');
  const genre = form.elements.namedItem('genre');
  const mine = form.elements.namedItem('mine');
  if (!(query instanceof HTMLInputElement)) throw new TypeError('Не знайдено поле пошуку query');
  if (!(genre instanceof HTMLSelectElement)) throw new TypeError('Не знайдено список жанрів genre');
  if (!(mine instanceof HTMLInputElement) || mine.type !== 'checkbox') {
    throw new TypeError('Не знайдено прапорець mine');
  }

  return { query: query.value, genre: genre.value, mine: mine.checked };
}

/**
 * C3. Підключає форму фільтрів: після кожної зміни — refresh(). main.js викликає цю функцію
 * один раз. Специфікація — ТЗ, C3.
 *І
 * @param {() => void} refresh перемальовує список для поточних фільтрів
 */
export function initFilters(refresh) {
  const form = document.querySelector('#filters');
  if (!(form instanceof HTMLFormElement)) throw new TypeError('Не знайдено форму #filters');

  form.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'query') refresh();
  });
  form.addEventListener('change', (event) => {
    if (
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLInputElement && event.target.name === 'mine')
    ) {
      refresh();
    }
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('reset', () => queueMicrotask(refresh));
}
