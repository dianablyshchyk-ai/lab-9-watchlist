/**
 * Дані й стан застосунку «Мій список». Наданий модуль: не змінюйте його.
 *
 * Модуль не знає про DOM. Він зберігає стан і повертає дані, а показати їх на сторінці й
 * підключити події — ваша частина роботи (render.js, list.js, filters.js, details.js).
 * Стан живе лише в пам'яті: після перезавантаження сторінки список і нотатки знову порожні.
 *
 * `watchlist` і `notes` можна читати напряму (`watchlist.has(id)`, `notes.get(id)`), а
 * змінювати — лише через функції нижче: вони перевіряють аргументи й кидають помилку з
 * поясненням, якщо щось не так.
 */
import data from '../data/shows.json' with { type: 'json' };

/**
 * @typedef {object} Show
 * @property {number} id
 * @property {string} name
 * @property {number | null} year рік прем'єри
 * @property {number | null} rating середня оцінка глядачів TVmaze
 * @property {number | null} runtime тривалість серії, хв
 * @property {string | null} network
 * @property {readonly string[]} genres може бути порожнім
 * @property {string} summary опис — HTML-розмітка TVmaze (`<p>`, `<b>`, `<i>`)
 * @property {string} url сторінка серіалу на TVmaze
 */

/**
 * @typedef {object} Note моя оцінка й нотатка до серіалу
 * @property {number} rating ціле число від 1 до 10
 * @property {string} text може бути порожнім рядком
 */

/**
 * @typedef {object} Filters
 * @property {string} [query] частина назви; регістр і пробіли на початку й у кінці не враховуються
 * @property {string} [genre] точна назва жанру; порожній рядок — усі жанри
 * @property {boolean} [mine] лише серіали з мого списку
 */

/** Усі серіали в порядку файлу даних. Масив і записи заморожені. @type {readonly Show[]} */
export const shows = Object.freeze(
  data.shows.map((show) => Object.freeze({ ...show, genres: Object.freeze([...show.genres]) })),
);

/** id серіалів у моєму списку. Змінюйте лише через toggle(). @type {ReadonlySet<number>} */
export const watchlist = new Set();

/** Мої оцінки й нотатки за id серіалу. Змінюйте лише через saveNote() і removeNote(). @type {ReadonlyMap<number, Note>} */
export const notes = new Map();

/** @param {unknown} value */
const describe = (value) => `${JSON.stringify(value) ?? String(value)} (${typeof value})`;

/**
 * Серіал за id. Кидає TypeError, якщо такого серіалу немає: зокрема, якщо id передано рядком,
 * бо '82' і 82 — різні значення.
 *
 * @param {number} id
 * @returns {Show}
 */
export function getShow(id) {
  const show = shows.find((item) => item.id === id);
  if (!show) throw new TypeError(`Немає серіалу з id ${describe(id)}`);
  return show;
}

/**
 * Серіали, що відповідають усім заданим фільтрам, у порядку файлу даних. Не задане поле нічого
 * не відкидає, тож visibleShows() повертає всі серіали.
 *
 * @param {Filters} [filters]
 * @returns {Show[]} новий масив
 */
export function visibleShows({ query, genre, mine } = {}) {
  const needle = (query ?? '').trim().toLowerCase();
  return shows.filter(
    (show) =>
      (!needle || show.name.toLowerCase().includes(needle)) &&
      (!genre || show.genres.includes(genre)) &&
      (!mine || watchlist.has(show.id)),
  );
}

/**
 * Додає серіал до мого списку, а якщо він уже там — прибирає.
 *
 * @param {number} id
 * @returns {boolean} true, якщо після виклику серіал у списку
 */
export function toggle(id) {
  getShow(id);
  if (watchlist.has(id)) {
    watchlist.delete(id);
    return false;
  }
  watchlist.add(id);
  return true;
}

/**
 * Зберігає мою оцінку й нотатку до серіалу, замінюючи попередні.
 *
 * @param {number} id
 * @param {Note} note `rating` — число (не рядок з поля форми), ціле, від 1 до 10
 */
export function saveNote(id, { rating, text }) {
  getShow(id);
  if (typeof rating !== 'number') throw new TypeError(`Оцінка має бути числом, отримано ${describe(rating)}`);
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    throw new RangeError(`Оцінка має бути цілим числом від 1 до 10, отримано ${describe(rating)}`);
  }
  if (typeof text !== 'string') throw new TypeError(`Нотатка має бути рядком, отримано ${describe(text)}`);
  notes.set(id, Object.freeze({ rating, text }));
}

/**
 * Видаляє мою оцінку й нотатку до серіалу.
 *
 * @param {number} id
 * @returns {boolean} true, якщо нотатка була
 */
export function removeNote(id) {
  getShow(id);
  return notes.delete(id);
}
