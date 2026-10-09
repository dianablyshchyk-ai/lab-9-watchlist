import { toggle, watchlist } from './state.js';
import { openDetails } from './details.js';
import { readFilters } from './filters.js';

/**
 * C2. Підключає кнопки карток у списку #results: «До списку» додає серіал до мого списку або
 * прибирає з нього, «Детальніше» відкриває діалог (openDetails з details.js). main.js викликає
 * цю функцію один раз, після першого показу списку. Специфікація — ТЗ, C2.
 *
 * @param {() => void} refresh перемальовує список для поточних фільтрів
 */
export function initList(refresh) {
  const results = document.querySelector('#results');
  const count = document.querySelector('#watchlist-count');

  if (!(results instanceof HTMLUListElement)) throw new TypeError('Не знайдено список #results');
  if (!(count instanceof HTMLElement)) throw new TypeError('Не знайдено лічильник #watchlist-count');

  results.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest('button[data-action]');
    const card = button?.closest('li[data-id]');
    if (!button || !card || !results.contains(card)) return;

    const id = Number(card.dataset.id);
    if (!Number.isInteger(id)) throw new TypeError(`Некоректний id серіалу: ${card.dataset.id}`);

    if (button.dataset.action === 'toggle') {
      const wasListed = watchlist.has(id);
      const cardIndex = [...results.children].indexOf(card);
      const { mine } = readFilters();
      toggle(id);
      count.textContent = String(watchlist.size);
      refresh();
      if (mine && wasListed) {
        const cards = [...results.children];
        const nextCard = cards[Math.min(cardIndex, cards.length - 1)];
        const nextButton = nextCard?.querySelector('[data-action="toggle"]');
        if (nextButton instanceof HTMLButtonElement) {
          nextButton.focus();
        } else {
          const heading = document.querySelector('#results-heading');
          if (!(heading instanceof HTMLElement)) {
            throw new TypeError('Не знайдено заголовок #results-heading');
          }
          heading.focus();
        }
      } else {
        results.querySelector(`[data-id="${id}"] [data-action="toggle"]`)?.focus();
      }
    } else if (button.dataset.action === 'details') {
      openDetails(id);
    }
  });
}
