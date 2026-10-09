/** @typedef {import('./state.js').Show} Show */
import { notes, shows, watchlist } from './state.js';

/**
 * C1. Показує серіали в списку #results — по картці з шаблону #show-card на кожен, у тому
 * самому порядку, — і оновлює рядок статусу #status. Специфікація — ТЗ, C1.
 *
 * @param {readonly Show[]} list серіали, які треба показати
 */
export function renderShows(list) {
  const results = document.querySelector('#results');
  const status = document.querySelector('#status');
  const template = document.querySelector('#show-card');

  if (!(results instanceof HTMLUListElement)) throw new TypeError('Не знайдено список #results');
  if (!(status instanceof HTMLElement)) throw new TypeError('Не знайдено рядок статусу #status');
  if (!(template instanceof HTMLTemplateElement)) throw new TypeError('Не знайдено шаблон #show-card');

  const cards = list.map((show) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.card');
    if (!(card instanceof HTMLLIElement)) throw new TypeError('У шаблоні #show-card немає картки <li>');

    card.dataset.id = String(show.id);
    card.querySelectorAll('[data-field="name"]').forEach((field) => {
      field.textContent = show.name;
    });
    card.querySelector('[data-field="year"]').textContent = show.year ?? '—';
    card.querySelector('[data-field="genres"]').textContent = show.genres.length
      ? show.genres.join(', ')
      : '—';
    card.querySelector('[data-field="rating"]').textContent = show.rating ?? '—';

    const note = notes.get(show.id);
    const myRating = card.querySelector('.card__mine');
    myRating.hidden = !note;
    if (note) card.querySelector('[data-field="my-rating"]').textContent = String(note.rating);

    const noteText = card.querySelector('.card__note');
    noteText.hidden = !note?.text;
    if (note?.text) noteText.textContent = note.text;

    card.querySelector('[data-action="toggle"]').setAttribute(
      'aria-pressed',
      String(watchlist.has(show.id)),
    );
    return fragment;
  });

  results.replaceChildren(...cards);
  status.textContent = list.length
    ? `Знайдено: ${list.length} з ${shows.length}`
    : 'Нічого не знайдено';
}
