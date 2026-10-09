// Перевірки «Мій список». Номер і назва кожної — правило з ТЗ (C2.4 — четверте правило C2).
// Кожна перевірка відкриває свіжу копію застосунку й діє як користувач; невдача пояснює, що
// саме не так. Дані для очікуваних результатів — з data/shows.json.
import { accessibleName, describe, norm, openApp, sleep, visibleLabel } from './harness.js';

/** @typedef {import('./harness.js').App} App */
/** @typedef {{ id: number, name: string, genres: string[], summary: string, url: string }} Show */
/** @typedef {{ id: string, group: string, title: string, run: () => Promise<void> }} Check */

export const groups = [
  { id: 'C1', title: 'C1 · Картки' },
  { id: 'C2', title: 'C2 · Кнопки карток' },
  { id: 'C3', title: 'C3 · Фільтри' },
  { id: 'C4', title: 'C4 · Діалог «Детальніше» і нотатка' },
];

export class Fail extends Error {}

/** @returns {asserts condition} */
function expect(/** @type {unknown} */ condition, /** @type {string} */ detail) {
  if (!condition) throw new Fail(detail);
}

/** @template T @param {T | null | undefined} value @returns {T} */
function need(value, /** @type {string} */ detail) {
  if (value === null || value === undefined) throw new Fail(detail);
  return value;
}

const BREAKING_BAD = 169;
const DA_VINCI = 197;
const TRUE_DETECTIVE = 5; // два абзаци опису, у них <b> та <i>
const UTOPIA = 153; // без оцінки й без жанрів
const HOSTILE = '<img src="x" onerror="__check.xss++"><b data-probe="1">Тест</b>';

/** @param {{ shows: Show[] }} data */
export function defineChecks(data) {
  const shows = data.shows;
  const total = shows.length;
  const byId = new Map(shows.map((show) => [show.id, show]));
  const nameOf = (/** @type {number | string} */ id) => byId.get(Number(id))?.name ?? `id ${id}`;

  /** id серіалів, які мають бути на екрані, — рядками, як у data-id. */
  const expected = ({ query = '', genre = '', mine = /** @type {number[] | null} */ (null) } = {}) => {
    const needle = query.trim().toLowerCase();
    return shows
      .filter((show) => !needle || show.name.toLowerCase().includes(needle))
      .filter((show) => !genre || show.genres.includes(genre))
      .filter((show) => !mine || mine.includes(show.id))
      .map((show) => String(show.id));
  };
  const found = (/** @type {number} */ count) => (count ? `Знайдено: ${count} з ${total}` : 'Нічого не знайдено');
  const same = (/** @type {string[]} */ a, /** @type {string[]} */ b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const listed = (/** @type {string[]} */ ids) =>
    ids.length ? ids.slice(0, 4).map(nameOf).join(', ') + (ids.length > 4 ? ` … (усього ${ids.length})` : '') : 'жодної';

  /** Застосунок, у якому вже є картки (C1). */
  async function withCards(/** @type {{ data?: unknown }} */ options = {}) {
    const app = await openApp(options);
    expect(app.cards().length > 0, 'у #results немає жодної картки <li data-id> — спершу C1');
    return app;
  }

  const toggleOf = (/** @type {App} */ app, /** @type {number} */ id) =>
    need(app.button(id, 'toggle'), `на картці ${nameOf(id)} немає кнопки [data-action="toggle"]`);
  const detailsOf = (/** @type {App} */ app, /** @type {number} */ id) =>
    need(app.button(id, 'details'), `на картці ${nameOf(id)} немає кнопки [data-action="details"]`);
  const pressed = (/** @type {App} */ app, /** @type {number} */ id) => app.button(id, 'toggle')?.getAttribute('aria-pressed');

  /** Фокус переходить одразу, у тому самому обробнику, а не з таймера (ТЗ, §5). */
  async function focusedDirectly(/** @type {App} */ app) {
    await sleep(35); // відкладені колбеки, зокрема requestAnimationFrame, встигають виконатися
    const via = app.probe.delayedFocus[0];
    expect(!via, `фокус переводить відкладений колбек ${via}(): доти фокус деінде, найчастіше на <body>. Таймерів ТЗ не дозволяє (§5): переведіть фокус одразу, у тому самому обробнику`);
  }

  const filters = (/** @type {App} */ app) => ({
    form: /** @type {HTMLFormElement} */ (need(app.$('#filters'), 'немає форми #filters')),
    query: need(app.field('#filters', 'query'), 'у формі #filters немає поля name="query"'),
    genre: need(app.field('#filters', 'genre'), 'у формі #filters немає поля name="genre"'),
    mine: need(app.field('#filters', 'mine'), 'у формі #filters немає поля name="mine"'),
  });

  /** Відкриває «Детальніше» серіалу й повертає діалог #details. */
  async function openDetails(/** @type {App} */ app, /** @type {number} */ id) {
    await app.press(detailsOf(app, id));
    const dialog = /** @type {HTMLDialogElement} */ (need(app.$('dialog#details'), 'немає елемента <dialog id="details">'));
    expect(dialog.open, `після «Детальніше» на картці ${nameOf(id)} діалог #details не відкрито`);
    return dialog;
  }

  const note = (/** @type {App} */ app) => ({
    form: /** @type {HTMLFormElement} */ (need(app.$('#note-form'), 'немає форми #note-form')),
    rating: /** @type {HTMLInputElement} */ (need(app.field('#note-form', 'rating'), 'у формі #note-form немає поля name="rating"')),
    text: /** @type {HTMLTextAreaElement} */ (need(app.field('#note-form', 'note'), 'у формі #note-form немає поля name="note"')),
    save: need(app.buttonByText(app.$('#note-form'), 'Зберегти'), 'у формі #note-form немає кнопки «Зберегти»'),
    cancel: need(app.buttonByText(app.$('#details'), 'Скасувати'), 'у діалозі немає кнопки «Скасувати»'),
  });

  /** Тексти елементів, на які посилається aria-describedby поля, — лише видимі. */
  function described(/** @type {Element} */ field) {
    const doc = field.ownerDocument;
    return norm(field.getAttribute('aria-describedby'))
      .split(' ')
      .filter(Boolean)
      .map((id) => doc.getElementById(id))
      .filter((el) => el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 1)
      .map((el) => norm(el?.textContent))
      .filter(Boolean);
  }

  /** Абзаци опису TVmaze як текст — розібрані в інертному документі, без виконання. */
  const paragraphs = (/** @type {string} */ html) =>
    [...new DOMParser().parseFromString(html, 'text/html').body.children].map((p) => norm(p.textContent)).filter(Boolean);

  /** @type {Check[]} */
  const checks = [];
  const check = (/** @type {string} */ id, /** @type {string} */ title, /** @type {() => Promise<void>} */ run) =>
    checks.push({ id, group: id.slice(0, 2), title, run });

  /* ---------------- C1 · Картки ---------------- */

  check('C1.1', `На старті — ${total} карток з shows у src/state.js: кожна є клоном шаблону #show-card, <li data-id> у #results, у порядку даних`, async () => {
    const app = await openApp();
    expect(!app.fetchedData(), 'застосунок сам завантажує data/shows.json (fetch): дані беруться лише з shows у src/state.js, без fetch (ТЗ, §5)');
    const ids = app.ids();
    expect(ids.length === total, `у #results ${ids.length} карток <li data-id>, очікувалося ${total}`);
    const order = shows.map((show) => String(show.id));
    expect(same(ids, order), `порядок карток: ${listed(ids)}; очікувався: ${listed(order)}`);
    const template = /** @type {HTMLTemplateElement | null} */ (app.$('template#show-card'));
    const root = need(template?.content.firstElementChild, 'у index.html немає шаблону <template id="show-card">');
    const pattern = [root, ...root.querySelectorAll('*')].map((el) => ({ tag: el.tagName, classes: [...el.classList] }));
    for (const card of app.cards()) {
      const elements = [card, ...card.querySelectorAll('*')];
      let at = 0;
      for (const el of elements) {
        const want = pattern[at];
        if (want && el.tagName === want.tag && want.classes.every((name) => el.classList.contains(name))) at += 1;
      }
      const missing = pattern[at];
      expect(!missing, `у картці ${nameOf(card.dataset.id ?? '')} немає елемента шаблону <${missing?.tag.toLowerCase()}${missing?.classes.length ? ` class="${missing.classes.join(' ')}"` : ''}>: картку зібрано не з #show-card`);
    }
  });

  check('C1.2', 'На картці — назва, рік, жанри через кому й оцінка; відсутні дані — «—», ніде не видно null, undefined чи NaN', async () => {
    const app = await withCards();
    const bb = need(app.card(BREAKING_BAD), `немає картки ${nameOf(BREAKING_BAD)} (data-id="${BREAKING_BAD}")`);
    const text = norm(bb.innerText);
    for (const part of ['Breaking Bad', '2008', 'Drama, Crime, Thriller', '9.2']) {
      expect(text.includes(part), `на картці Breaking Bad немає «${part}». Видимий текст: «${text}»`);
    }
    const utopia = norm(need(app.card(UTOPIA), `немає картки Utopia (data-id="${UTOPIA}")`).innerText);
    expect((utopia.match(/—/g) ?? []).length >= 2, `в Utopia немає ні оцінки, ні жанрів: обидва мають бути «—». Видимий текст: «${utopia}»`);
    for (const card of app.cards()) {
      const word = card.innerText.match(/\b(null|undefined|NaN)\b/)?.[0];
      expect(!word, `на картці ${nameOf(card.dataset.id ?? '')} видно «${word}»: «${norm(card.innerText)}»`);
    }
  });

  check('C1.3', 'Дані потрапляють у DOM лише як текст або значення атрибутів: розмітка в назві залишається текстом', async () => {
    const app = await withCards({
      data: { ...data, shows: [...shows, { ...shows[0], id: 9001, name: HOSTILE, genres: ['Drama'] }] },
    });
    await sleep(300);
    const card = need(app.card(9001), 'немає картки серіалу з data-id="9001" (його назва — HTML-розмітка)');
    const created = app.list?.querySelector('img, [data-probe]');
    expect(!created, `назва серіалу стала елементом ${describe(created)}: дані вставлено як HTML (innerHTML)`);
    expect(app.probe.xss === 0, `обробник onerror з назви серіалу виконався: це XSS`);
    expect(norm(card.innerText).includes(HOSTILE), `назву показано не як текст. Видимий текст картки: «${norm(card.innerText)}»`);
  });

  check('C1.4', '«Da Vinci\'s Demons» — повна назва на картці й в іменах обох її кнопок', async () => {
    const app = await withCards();
    const card = need(app.card(DA_VINCI), `немає картки Da Vinci's Demons (data-id="${DA_VINCI}")`);
    const name = "Da Vinci's Demons";
    expect(norm(card.innerText).includes(name), `на картці не видно «${name}»: «${norm(card.innerText)}»`);
    for (const action of /** @type {const} */ (['toggle', 'details'])) {
      const accName = accessibleName(need(app.button(DA_VINCI, action), `на картці немає кнопки [data-action="${action}"]`));
      expect(accName.includes(name), `ім'я кнопки [data-action="${action}"] — «${accName}»: апостроф обірвав назву`);
    }
  });

  check('C1.5', 'Ім\'я кожної кнопки містить її видимий текст і назву серіалу: «До списку: Breaking Bad», «Детальніше про Breaking Bad»', async () => {
    const app = await withCards();
    for (const card of app.cards()) {
      const name = nameOf(card.dataset.id ?? '');
      for (const action of ['toggle', 'details']) {
        const button = need(card.querySelector(`[data-action="${action}"]`), `на картці ${name} немає кнопки [data-action="${action}"]`);
        const accName = accessibleName(button);
        const label = visibleLabel(button);
        expect(accName.toLowerCase().includes(name.toLowerCase()), `кнопка «${label}» на картці ${name} має ім'я «${accName}» — без назви серіалу: ${total} однакових кнопок не розрізнити`);
        expect(accName.toLowerCase().includes(label.toLowerCase()), `ім'я «${accName}» не містить видимого тексту кнопки «${label}» (WCAG 2.5.3)`);
      }
    }
  });

  check('C1.6', `Рядок статусу — елемент #status з role="status", що є в HTML від початку; змінюється лише його текст: «Знайдено: ${total} з ${total}»`, async () => {
    const app = await openApp();
    const initial = need(app.probe.initialStatus, 'в index.html немає елемента з role="status"');
    expect(initial.isConnected, `елемент статусу з HTML прибрано або замінено новим (${describe(app.$('#status'))}): скрінрідер може не оголосити новий live region`);
    expect(norm(initial.textContent) === found(total), `текст статусу «${norm(initial.textContent)}», очікувався «${found(total)}»`);
  });

  check('C1.7', 'Якщо показувати нічого — список порожній, статус «Нічого не знайдено»', async () => {
    const app = await openApp({ data: { ...data, shows: [] } });
    expect(app.cards().length === 0, `з порожніми даними в #results ${app.cards().length} карток`);
    expect(app.status() === 'Нічого не знайдено', `статус «${app.status()}», очікувався «Нічого не знайдено»`);
  });

  /* ---------------- C2 · Кнопки карток ---------------- */

  check('C2.1', 'Один обробник click — на списку #results; на картках і кнопках обробників немає', async () => {
    const app = await withCards();
    for (let i = 0; i < 3; i += 1) await app.press(app.button(1, 'toggle'));
    const list = /** @type {HTMLElement} */ (app.list);
    const onList = app.listeners(list, 'click');
    const inside = [...list.querySelectorAll('*')].filter((el) => app.listeners(el, 'click') > 0);
    expect(inside.length === 0, `обробники click є на ${inside.length} елементах усередині списку, зокрема на ${describe(inside[0])}: потрібен один обробник на #results (event delegation)`);
    expect(onList > 0, 'на #results немає обробника click');
    expect(onList === 1, `після трьох перемальовувань на #results ${onList} обробників click: новий додається під час кожного перемальовування`);
  });

  check('C2.2', '«До списку» додає серіал до мого списку, повторне натискання прибирає; стан передає aria-pressed, текст кнопки не змінюється', async () => {
    const app = await withCards();
    const before = accessibleName(toggleOf(app, DA_VINCI));
    expect(pressed(app, DA_VINCI) === 'false', `до натискання aria-pressed="${pressed(app, DA_VINCI)}", очікувалося "false"`);
    await app.press(toggleOf(app, DA_VINCI));
    expect(pressed(app, DA_VINCI) === 'true', `після натискання «До списку» на картці Da Vinci's Demons aria-pressed="${pressed(app, DA_VINCI)}", очікувалося "true"`);
    const after = accessibleName(toggleOf(app, DA_VINCI));
    expect(after === before, `ім'я кнопки змінилося: «${before}» → «${after}». Стан передає aria-pressed, а текст лишається тим самим`);
    await app.press(toggleOf(app, DA_VINCI));
    expect(pressed(app, DA_VINCI) === 'false', `після другого натискання aria-pressed="${pressed(app, DA_VINCI)}", очікувалося "false"`);
  });

  check('C2.3', 'Лічильник «У списку: N» у header дорівнює кількості серіалів у моєму списку', async () => {
    const app = await withCards();
    need(app.$('#watchlist-count'), 'немає елемента #watchlist-count');
    for (const id of [1, 2, 5]) await app.press(toggleOf(app, id));
    expect(app.counter() === '3', `додано три серіали, а лічильник показує «${app.counter()}»`);
    await app.press(toggleOf(app, 2));
    expect(app.counter() === '2', `один із трьох прибрано, а лічильник показує «${app.counter()}»`);
  });

  check('C2.4', 'Клік по іконці всередині кнопки працює так само, як по тексту', async () => {
    const app = await withCards();
    const target = await app.clickIcon(toggleOf(app, BREAKING_BAD));
    need(target, 'у кнопці «До списку» немає іконки <svg> із шаблону');
    expect(pressed(app, BREAKING_BAD) === 'true', `клік по іконці отримав ${describe(target)} (event.target), і серіал не додано: обробник має знайти кнопку через closest()`);
  });

  check('C2.5', 'Кнопки працюють і на картці, якої не було на екрані під час запуску', async () => {
    const app = await withCards();
    const template = /** @type {HTMLTemplateElement | null} */ (app.$('template#show-card'));
    const fresh = /** @type {HTMLElement} */ (need(template?.content.firstElementChild, 'немає шаблону #show-card').cloneNode(true));
    fresh.dataset.id = '82';
    for (const slot of fresh.querySelectorAll('[data-field="name"]')) slot.textContent = nameOf(82);
    need(app.card(82), `немає картки ${nameOf(82)}`).replaceWith(fresh);
    await app.press(need(/** @type {HTMLElement | null} */ (fresh.querySelector('[data-action="toggle"]')), 'у шаблоні немає кнопки [data-action="toggle"]'));
    const added = app.counter() === '1' || app.list?.querySelector('li[data-id="82"] [data-action="toggle"][aria-pressed="true"]');
    expect(added, `картку ${nameOf(82)} створено заново з шаблону, і її «До списку» нічого не робить: обробники прив'язано до старих кнопок, а не до списку`);
  });

  check('C2.6', 'Один клік — рівно одне перемикання, скільки б разів список не перемальовувався перед ним', async () => {
    for (const [before, inList] of /** @type {const} */ ([[1, 2], [2, 1]])) {
      const app = await withCards();
      for (let i = 0; i < before; i += 1) await app.press(toggleOf(app, 1));
      await app.press(toggleOf(app, BREAKING_BAD));
      expect(pressed(app, BREAKING_BAD) === 'true' && app.counter() === String(inList), `після ${before === 1 ? 'одного перемикання' : 'двох перемикань'} іншої картки один клік по «До списку» Breaking Bad дав aria-pressed="${pressed(app, BREAKING_BAD)}", лічильник «${app.counter()}» (очікувалося "true" і «${inList}»): клік обробляється кілька разів`);
    }
  });

  check('C2.7', 'Після натискання «До списку» фокус залишається на цій кнопці тієї самої картки', async () => {
    const app = await withCards();
    await app.press(toggleOf(app, BREAKING_BAD));
    await focusedDirectly(app);
    const active = app.active();
    expect(active === app.button(BREAKING_BAD, 'toggle'), `фокус на ${describe(active)}: стару кнопку замінено під час перемальовування, а фокус на нову не перенесено`);
  });

  /* ---------------- C3 · Фільтри ---------------- */

  check('C3.1', 'Пошук за назвою застосовується під час введення (input): регістр і пробіли на краях не враховуються; статус оновлюється', async () => {
    const app = await withCards();
    const { query } = filters(app);
    for (const text of ['  The ', 'zzz']) {
      await app.type(query, text);
      const want = expected({ query: text });
      expect(same(app.ids(), want), `для «${text}» показано: ${listed(app.ids())}; очікувалося: ${listed(want)}`);
      expect(app.status() === found(want.length), `для «${text}» статус «${app.status()}», очікувався «${found(want.length)}»`);
    }
  });

  check('C3.2', 'Жанр і «Лише мій список» застосовуються одразу (change); фільтри поєднуються через «і»', async () => {
    const app = await withCards();
    const { query, genre, mine } = filters(app);
    await app.choose(genre, 'Comedy');
    let want = expected({ genre: 'Comedy' });
    expect(same(app.ids(), want), `для жанру Comedy показано: ${listed(app.ids())}; очікувалося: ${listed(want)}`);
    await app.type(query, 'the');
    want = expected({ query: 'the', genre: 'Comedy' });
    expect(same(app.ids(), want), `для «the» + Comedy показано: ${listed(app.ids())}; очікувалося: ${listed(want)}`);
    expect(app.status() === found(want.length), `статус «${app.status()}», очікувався «${found(want.length)}»`);
    await app.press(mine);
    expect(app.ids().length === 0, `мій список порожній, а з «Лише мій список» показано: ${listed(app.ids())}`);
    expect(app.status() === 'Нічого не знайдено', `статус «${app.status()}», очікувався «Нічого не знайдено»`);
  });

  check('C3.3', 'Enter у полі пошуку не перезавантажує сторінку', async () => {
    const app = await withCards();
    const { form, query } = filters(app);
    await app.type(query, 'the');
    await app.submit(form);
    await sleep(250);
    expect(!app.navigated(), 'після Enter сторінку перезавантажено (подію submit не скасовано): стан застосунку втрачено');
    expect(same(app.ids(), expected({ query: 'the' })), `після Enter показано: ${listed(app.ids())}`);
  });

  check('C3.4', 'Поки користувач вводить текст, фокус лишається в полі пошуку', async () => {
    const app = await withCards();
    const { query } = filters(app);
    for (const text of ['Br', 'Bre']) {
      await app.type(query, text);
      expect(same(app.ids(), expected({ query: text })), `для «${text}» показано: ${listed(app.ids())} — фільтр не застосовано`);
      expect(app.active() === query, `після введення «${text}» фокус на ${describe(app.active())}, а не в полі пошуку`);
    }
  });

  check('C3.5', `«Скинути» очищає поля, показує всі ${total} серіалів і статус «${found(total)}»`, async () => {
    const app = await withCards();
    const { form, query, genre, mine } = filters(app);
    await app.type(query, 'the');
    await app.choose(genre, 'Drama');
    await app.press(mine);
    await app.press(need(app.buttonByText(form, 'Скинути'), 'у формі #filters немає кнопки «Скинути»'));
    expect(query.value === '' && genre.value === '' && !mine.checked, 'після «Скинути» поля форми не очищено');
    expect(app.ids().length === total, `після «Скинути» показано ${app.ids().length} карток, очікувалося ${total}: список перемальовано зі старими значеннями полів`);
    expect(app.status() === found(total), `статус «${app.status()}», очікувався «${found(total)}»`);
  });

  check('C3.6', 'Стан «До списку» зберігається під час фільтрації, кнопки працюють після зміни фільтра; «Лише мій список» показує саме мій список', async () => {
    const app = await withCards();
    const { query, mine } = filters(app);
    await app.press(toggleOf(app, BREAKING_BAD));
    await app.press(toggleOf(app, 123));
    await app.type(query, 'Breaking');
    expect(pressed(app, BREAKING_BAD) === 'true', `після фільтрації Breaking Bad має aria-pressed="${pressed(app, BREAKING_BAD)}", хоча він у моєму списку`);
    await app.press(toggleOf(app, BREAKING_BAD));
    expect(pressed(app, BREAKING_BAD) === 'false', 'після зміни фільтра «До списку» не спрацювала: кнопки нових карток без обробника');
    await app.type(query, '');
    expect(pressed(app, 123) === 'true', `Lost має aria-pressed="${pressed(app, 123)}", хоча він у моєму списку`);
    await app.press(mine);
    expect(same(app.ids(), ['123']), `з «Лише мій список» показано: ${listed(app.ids())}; очікувався лише Lost`);
    expect(app.status() === found(1), `статус «${app.status()}», очікувався «${found(1)}»`);
  });

  check('C3.7', 'З «Лише мій список» прибраний серіал зникає, а фокус переходить на «До списку» наступної картки, інакше — попередньої, інакше — на заголовок #results-heading', async () => {
    const app = await withCards();
    for (const id of [1, 2, 5]) await app.press(toggleOf(app, id));
    await app.press(filters(app).mine);
    expect(same(app.ids(), ['1', '2', '5']), `з «Лише мій список» показано: ${listed(app.ids())}`);
    const steps = /** @type {const} */ ([
      [2, () => app.button(5, 'toggle'), `на «До списку» наступної картки (${nameOf(5)})`],
      [5, () => app.button(1, 'toggle'), `на «До списку» попередньої картки (${nameOf(1)})`],
      [1, () => app.$('#results-heading'), 'на заголовок #results-heading'],
    ]);
    for (const [id, target, where] of steps) {
      await app.press(toggleOf(app, id));
      await focusedDirectly(app);
      expect(!app.card(id), `${nameOf(id)} прибрано зі списку, а картка лишилася`);
      expect(app.active() === target(), `після прибирання ${nameOf(id)} фокус на ${describe(app.active())}, а мав перейти ${where}`);
    }
  });

  /* ---------------- C4 · Діалог «Детальніше» і нотатка ---------------- */

  check('C4.1', '«Детальніше» відкриває <dialog id="details"> як модальний (showModal), і фокус переходить у діалог', async () => {
    const app = await withCards();
    const dialog = await openDetails(app, BREAKING_BAD);
    expect(dialog.matches(':modal'), 'діалог відкрито не через showModal(): решта сторінки лишається доступною для клавіатури й скрінрідера');
    expect(dialog.contains(app.active()), `фокус на ${describe(app.active())}, а не в діалозі`);
  });

  check('C4.2', 'Ім\'я діалогу й заголовок — назва серіалу, посилання веде на його сторінку TVmaze; щоразу — саме той серіал, з якого відкрито', async () => {
    const app = await withCards();
    for (const [id, previous] of [[TRUE_DETECTIVE, 0], [BREAKING_BAD, TRUE_DETECTIVE]]) {
      const show = /** @type {Show} */ (byId.get(id));
      const dialog = await openDetails(app, id);
      expect(accessibleName(dialog) === show.name, `ім'я діалогу (через aria-labelledby) — «${accessibleName(dialog)}», очікувалося «${show.name}»`);
      const links = [...dialog.querySelectorAll('a')].map((a) => a.href);
      expect(links.includes(show.url), `у діалозі немає посилання на ${show.url}; є: ${links.join(', ') || 'жодного'}`);
      const old = previous ? paragraphs(/** @type {Show} */ (byId.get(previous)).summary)[0] : '';
      expect(!old || !norm(dialog.innerText).includes(old), `у діалозі ${show.name} лишився опис ${nameOf(previous)}: новий вміст додано до старого, а не замінено`);
      await app.escape(dialog);
    }
  });

  check('C4.3', 'Опис показано як текст: жодного елемента з розмітки TVmaze у DOM', async () => {
    let app = await withCards();
    const show = /** @type {Show} */ (byId.get(TRUE_DETECTIVE));
    let dialog = await openDetails(app, TRUE_DETECTIVE);
    const text = norm(dialog.innerText);
    for (const paragraph of paragraphs(show.summary)) {
      expect(text.includes(paragraph), `у діалозі немає тексту опису «${paragraph.slice(0, 60)}…»`);
    }
    const tag = dialog.querySelector('b, i, strong, em');
    expect(!tag, `у діалозі є ${describe(tag)} з опису: розмітку TVmaze вставлено як HTML`);

    const summary = '<p>Безпечний опис.</p><img src="x" onerror="__check.xss++"><b data-probe="1">Жирний текст</b>';
    app = await withCards({ data: { ...data, shows: shows.map((s) => (s.id === 1 ? { ...s, summary } : s)) } });
    dialog = await openDetails(app, 1);
    await sleep(300);
    const created = dialog.querySelector('img, [data-probe]');
    expect(!created, `опис із розміткою створив у діалозі ${describe(created)}`);
    expect(app.probe.xss === 0, 'обробник onerror з опису виконався: розмітку розібрано в живому документі (innerHTML на <div> — теж), це XSS');
    expect(norm(dialog.innerText).includes('Безпечний опис.'), 'текст опису з розміткою не показано');
  });

  check('C4.4', 'Esc і «Скасувати» закривають діалог', async () => {
    const app = await withCards();
    let dialog = await openDetails(app, BREAKING_BAD);
    await app.escape(dialog);
    expect(!dialog.open, 'Esc не закриває діалог');
    dialog = await openDetails(app, BREAKING_BAD);
    await app.press(note(app).cancel);
    expect(!dialog.open, '«Скасувати» не закриває діалог');
  });

  check('C4.5', 'Після закриття фокус повертається на «Детальніше», що відкрила діалог', async () => {
    const app = await withCards();
    for (const how of ['Esc', '«Скасувати»']) {
      const dialog = await openDetails(app, BREAKING_BAD);
      if (how === 'Esc') await app.escape(dialog);
      else await app.press(note(app).cancel);
      await focusedDirectly(app);
      expect(!dialog.open, `${how} не закриває діалог`);
      expect(app.active() === app.button(BREAKING_BAD, 'details'), `після закриття (${how}) фокус на ${describe(app.active())}, а не на «Детальніше» картки Breaking Bad`);
    }
  });

  check('C4.6', 'Форма відкривається з даними саме цього серіалу: збережені оцінка й нотатка або порожні поля, без помилок з минулого разу', async () => {
    const app = await withCards();
    await openDetails(app, BREAKING_BAD);
    let f = note(app);
    expect(f.rating.value === '' && f.text.value === '', `для серіалу без нотатки поля не порожні: «${f.rating.value}», «${f.text.value}»`);
    await app.type(f.rating, '8');
    await app.type(f.text, 'Сильний фінал');
    await app.submit(f.form, f.save);
    expect(!(/** @type {HTMLDialogElement} */ (app.$('#details')).open), 'валідну оцінку 8 не збережено: діалог лишився відкритим');

    await openDetails(app, 82);
    f = note(app);
    expect(f.rating.value === '' && f.text.value === '', `у ${nameOf(82)} поля показують дані іншого серіалу: «${f.rating.value}», «${f.text.value}»`);
    await app.submit(f.form, f.save);
    await app.press(f.cancel);

    await openDetails(app, 123);
    f = note(app);
    expect(f.rating.getAttribute('aria-invalid') !== 'true' && described(f.rating).length === 0, 'помилка з попереднього відкриття лишилася у формі іншого серіалу');

    await app.press(f.cancel);
    await openDetails(app, BREAKING_BAD);
    f = note(app);
    expect(f.rating.value === '8' && f.text.value === 'Сильний фінал', `збережену нотатку не показано: «${f.rating.value}», «${f.text.value}»`);
  });

  check('C4.7', 'Невалідна оцінка (порожня, не ціле число, поза 1–10): діалог лишається відкритим без alert(); помилка поруч із полем через aria-describedby, у поля aria-invalid="true"', async () => {
    const app = await withCards();
    const dialog = await openDetails(app, BREAKING_BAD);
    const f = note(app);
    for (const value of ['', '0', '11', '7.5']) {
      await app.type(f.rating, value);
      await app.submit(f.form, f.save);
      const shown = value === '' ? 'порожня оцінка' : `оцінка ${value}`;
      expect(app.probe.alerts.length === 0, `${shown}: помилку показано через alert(): «${app.probe.alerts[0]}»`);
      expect(dialog.open && !app.navigated(), `${shown}: форму надіслано — діалог закрито`);
      expect(f.rating.getAttribute('aria-invalid') === 'true', `${shown}: у поля немає aria-invalid="true"`);
      expect(described(f.rating).length > 0, `${shown}: aria-describedby поля не вказує на видимий текст помилки`);
    }
  });

  check('C4.8', 'Після невдалого надсилання фокус — на першому полі з помилкою', async () => {
    const app = await withCards();
    await openDetails(app, BREAKING_BAD);
    const f = note(app);
    await app.type(f.text, 'Без оцінки');
    await app.submit(f.form, f.save);
    await focusedDirectly(app);
    expect(app.active() === f.rating, `фокус на ${describe(app.active())}, а не на полі оцінки`);
  });

  check('C4.9', 'Щойно значення виправлено (input), помилка зникає, і форма зберігається', async () => {
    const app = await withCards();
    const dialog = await openDetails(app, BREAKING_BAD);
    const f = note(app);
    await app.type(f.rating, '42');
    await app.submit(f.form, f.save);
    expect(f.rating.getAttribute('aria-invalid') === 'true', 'оцінка 42 не дала помилки (aria-invalid)');
    await app.type(f.rating, '7');
    expect(f.rating.getAttribute('aria-invalid') !== 'true', 'оцінку виправлено на 7, а aria-invalid="true" лишився');
    expect(described(f.rating).length === 0, `оцінку виправлено на 7, а текст помилки лишився: «${described(f.rating).join(' ')}»`);
    await app.submit(f.form, f.save);
    expect(!dialog.open, 'виправлену оцінку 7 не збережено: діалог лишився відкритим (поле досі невалідне?)');
  });

  check('C4.10', 'Після збереження картка показує «Моя оцінка: 8/10» і нотатку; розмітка в нотатці лишається текстом', async () => {
    const app = await withCards();
    await openDetails(app, BREAKING_BAD);
    const f = note(app);
    await app.type(f.rating, '8');
    await app.type(f.text, HOSTILE);
    await app.submit(f.form, f.save);
    await sleep(300);
    const card = need(app.card(BREAKING_BAD), 'після збереження картки Breaking Bad немає');
    const text = norm(card.innerText);
    expect(text.includes('8/10'), `на картці не видно «8/10»: «${text}»`);
    const created = app.list?.querySelector('img, [data-probe]');
    expect(!created, `нотатка стала елементом ${describe(created)}: її вставлено як HTML`);
    expect(app.probe.xss === 0, 'обробник onerror з нотатки виконався: це XSS');
    expect(text.includes(HOSTILE), `нотатку не показано як текст: «${text}»`);
  });

  check('C4.11', 'Після збереження діалог закривається, статус: «Нотатку до <назва> збережено»', async () => {
    const app = await withCards();
    const dialog = await openDetails(app, BREAKING_BAD);
    const f = note(app);
    await app.type(f.rating, '9');
    await app.submit(f.form, f.save);
    expect(!dialog.open, 'після збереження діалог лишився відкритим');
    expect(app.status() === 'Нотатку до Breaking Bad збережено', `статус «${app.status()}», очікувався «Нотатку до Breaking Bad збережено»`);
  });

  check('C4.12', 'Після збереження фокус — на «Детальніше» цієї картки (картку перемальовано, тож це нова кнопка)', async () => {
    const app = await withCards();
    await openDetails(app, BREAKING_BAD);
    const f = note(app);
    await app.type(f.rating, '9');
    await app.submit(f.form, f.save);
    await focusedDirectly(app);
    const target = app.button(BREAKING_BAD, 'details');
    expect(app.active() === target && target?.isConnected, `фокус на ${describe(app.active())}, а не на «Детальніше» картки Breaking Bad`);
  });

  return checks;
}
