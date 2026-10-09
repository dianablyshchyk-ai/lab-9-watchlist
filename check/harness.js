// Завантажує index.html у фрейм і керує застосунком так, як це робить користувач: клікає,
// вводить текст, надсилає форми. Код застосунку перевірка не читає — лише DOM, атрибути,
// фокус і те, що застосунок робить у відповідь на дії.
//
// Сторінка потрапляє у фрейм через srcdoc, щоб до запуску її модулів додати невеликий скрипт:
// він рахує обробники подій (addEventListener), перехоплює alert() і помилки в Console,
// помічає фокус, переведений із таймера, і запити до data/shows.json. Для кількох перевірок
// той самий index.html отримує інші дані: import map підмінює data/shows.json, а сам файл
// даних не змінюється.

export const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Чи серед запитів застосунку є data/shows.json: дані мали б прийти з src/state.js. */
export const fetchedData = (/** @type {readonly string[]} */ requests) =>
  requests.some((url) => /(^|\/)data\/shows\.json(\?|$)/.test(url));

/** Пробіли й переноси — як один пробіл; без пробілів на краях. */
export const norm = (/** @type {string | null | undefined} */ text) => (text ?? '').replace(/\s+/g, ' ').trim();

let html = '';

/** Читає index.html один раз на запуск перевірки. */
export async function loadSource() {
  const response = await fetch('index.html', { cache: 'no-store' });
  if (!response.ok) throw new Error(`index.html: HTTP ${response.status}`);
  html = await response.text();
}

// Виконується у фреймі першим, до будь-якого модуля застосунку.
const PROBE = `(() => {
  const registry = new WeakMap();
  const proto = EventTarget.prototype;
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;
  const capture = (options) => (typeof options === 'boolean' ? options : Boolean(options && options.capture));
  const drop = (target, type, fn, phase) => {
    const list = registry.get(target);
    if (list) registry.set(target, list.filter((l) => !(l.type === type && l.fn === fn && l.capture === phase)));
  };
  proto.addEventListener = function (type, fn, options) {
    if (fn) {
      const list = registry.get(this) || [];
      const phase = capture(options);
      // Браузер ігнорує повторну реєстрацію тієї самої функції — так само рахуємо й ми.
      if (!list.some((l) => l.type === type && l.fn === fn && l.capture === phase)) {
        list.push({ type, fn, capture: phase });
        registry.set(this, list);
        const signal = options && typeof options === 'object' ? options.signal : null;
        if (signal) add.call(signal, 'abort', () => drop(this, type, fn, phase), { once: true });
      }
    }
    return add.call(this, type, fn, options);
  };
  proto.removeEventListener = function (type, fn, options) {
    drop(this, type, fn, capture(options));
    return remove.call(this, type, fn, options);
  };
  const probe = { registry, alerts: [], errors: [], xss: 0, initialStatus: null, delayedFocus: [], deferred: [], requests: [] };
  window.__check = probe;
  window.alert = (message) => { probe.alerts.push(String(message)); };
  window.confirm = (message) => { probe.alerts.push(String(message)); return false; };
  window.prompt = (message) => { probe.alerts.push(String(message)); return null; };
  // Перевірка діє зі скрипта, тож мікрозадачі виконуються лише після всіх обробників події:
  // до того часу inEvent показує, що триває реакція застосунку на дію.
  let inEvent = false;
  const afterEvent = window.queueMicrotask.bind(window);
  for (const type of ['click', 'input', 'change', 'submit', 'reset']) {
    add.call(window, type, () => {
      if (!inEvent) afterEvent(() => { inEvent = false; });
      inEvent = true;
    }, true);
  }
  // Відкладений колбек, що переводить фокус: до нього фокус був деінде, найчастіше на <body>.
  // Таймер, запущений в обробнику події: реакцію на дію відкладено (наприклад, debounce).
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask']) {
    const original = window[name];
    window[name] = function (callback, ...rest) {
      if (inEvent) probe.deferred.push(name);
      if (typeof callback !== 'function') return original.call(window, callback, ...rest);
      const wrapped = function (...args) {
        const before = document.activeElement;
        try {
          return callback.apply(this, args);
        } finally {
          if (document.activeElement !== before) probe.delayedFocus.push(name);
        }
      };
      return original.call(window, wrapped, ...rest);
    };
  }
  // Запити застосунку: дані мають приходити з src/state.js, а не окремим завантаженням.
  const request = window.fetch;
  window.fetch = function (input, init) {
    probe.requests.push(String(input instanceof Request ? input.url : input));
    return request.call(window, input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    probe.requests.push(String(url));
    return open.call(this, method, url, ...rest);
  };
  add.call(window, 'error', (event) => probe.errors.push(event.message || String(event.error)));
  add.call(window, 'unhandledrejection', (event) => probe.errors.push('Uncaught (in promise) ' + String(event.reason)));
})();`;

// Виконується наприкінці розбору HTML, до модулів: запам'ятовує live region, що є в самому HTML.
const AFTER_PARSE = `window.__check.initialStatus = document.querySelector('[role="status"], [aria-live]');`;

/**
 * Відкриває свіжу копію застосунку. Кожна перевірка працює зі своєю копією, тож стан однієї
 * не впливає на іншу.
 *
 * @param {{ data?: unknown }} [options] data — інший вміст data/shows.json
 */
export async function openApp({ data } = {}) {
  let head = `<script>${PROBE}<\/script>`;
  if (data !== undefined) {
    const blob = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const key = new URL('data/shows.json', location.href).href;
    head = `<script type="importmap">${JSON.stringify({ imports: { [key]: blob } })}<\/script>${head}`;
  }
  const doc = html
    .replace(/<head(\s[^>]*)?>/i, (tag) => tag + head)
    .replace(/<\/body>/i, `<script>${AFTER_PARSE}<\/script></body>`);

  const frame = document.createElement('iframe');
  frame.title = 'Застосунок «Мій список» під час перевірки';
  const app = new App(frame);
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.addEventListener('load', () => (app.loads += 1));
  frame.srcdoc = doc;
  /** @type {HTMLElement} */ (document.querySelector('#stage')).replaceChildren(frame);
  await loaded;
  await sleep(30);
  app.attach();
  return app;
}

export class App {
  /** @param {HTMLIFrameElement} frame */
  constructor(frame) {
    this.frame = frame;
    this.loads = 0;
    /** @type {any} */ this.win = null;
    /** @type {Document} */ this.doc = /** @type {any} */ (null);
  }

  attach() {
    this.win = this.frame.contentWindow;
    this.doc = /** @type {Document} */ (this.frame.contentDocument);
    this.win.focus();
  }

  /** @returns {{ registry: WeakMap<EventTarget, {type: string}[]>, alerts: string[], errors: string[], xss: number, initialStatus: Element | null, delayedFocus: string[], deferred: string[], requests: string[] }} */
  get probe() {
    return this.win.__check;
  }

  /** Чи застосунок сам завантажував data/shows.json (fetch або XMLHttpRequest). */
  fetchedData() {
    return fetchedData(this.probe.requests);
  }

  /** Сторінку перезавантажено або відкрито іншу: стан застосунку втрачено. */
  navigated() {
    return this.loads > 1 || this.frame.contentDocument !== this.doc;
  }

  /** @param {string} selector */
  $(selector) {
    return /** @type {HTMLElement | null} */ (this.doc.querySelector(selector));
  }

  get list() {
    return this.$('#results');
  }

  cards() {
    return /** @type {HTMLElement[]} */ ([...(this.list?.querySelectorAll('li[data-id]') ?? [])]);
  }

  ids() {
    return this.cards().map((card) => card.dataset.id ?? '');
  }

  /** @param {number | string} id */
  card(id) {
    return /** @type {HTMLElement | null} */ (this.list?.querySelector(`li[data-id="${id}"]`) ?? null);
  }

  /**
   * @param {number | string} id
   * @param {'toggle' | 'details'} action
   */
  button(id, action) {
    return /** @type {HTMLElement | null} */ (this.card(id)?.querySelector(`[data-action="${action}"]`) ?? null);
  }

  /**
   * Поле форми за name.
   * @param {string} formSelector
   * @param {string} name
   */
  field(formSelector, name) {
    const form = /** @type {HTMLFormElement | null} */ (this.$(formSelector));
    return /** @type {any} */ (form?.elements.namedItem(name) ?? null);
  }

  /** Текст live region статусу. */
  status() {
    const initial = this.probe.initialStatus;
    const region = initial?.isConnected ? initial : this.$('#status');
    return norm(region?.textContent);
  }

  counter() {
    return norm(this.$('#watchlist-count')?.textContent);
  }

  active() {
    return this.doc.activeElement;
  }

  /** Кількість обробників події на елементі: addEventListener і властивість on<type>. */
  listeners(/** @type {EventTarget} */ target, /** @type {string} */ type) {
    const registered = (this.probe.registry.get(target) ?? []).filter((l) => l.type === type).length;
    return registered + (/** @type {any} */ (target)[`on${type}`] ? 1 : 0);
  }

  /** Як клавіатура: фокус на кнопку, потім Enter (клік по самій кнопці). */
  async press(/** @type {HTMLElement | null} */ element) {
    if (!element) return false;
    element.focus();
    element.click();
    await sleep(15);
    return true;
  }

  /**
   * Як миша: клік у центр іконки. Подію отримує той елемент, який браузер знаходить у цій
   * точці (elementFromPoint), — зазвичай <svg> або <path>, а не сама кнопка.
   */
  async clickIcon(/** @type {HTMLElement | null} */ button) {
    const icon = button?.querySelector('svg');
    if (!button || !icon) return null;
    icon.scrollIntoView({ block: 'center' });
    const box = icon.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const target = this.doc.elementFromPoint(x, y) ?? icon;
    button.focus();
    const init = { bubbles: true, cancelable: true, composed: true, view: this.win, clientX: x, clientY: y };
    target.dispatchEvent(new this.win.MouseEvent('click', init));
    await sleep(15);
    return target;
  }

  /** Вводить текст у поле: значення змінюється, подія input спливає. */
  async type(/** @type {HTMLInputElement | HTMLTextAreaElement | null} */ input, /** @type {string} */ text) {
    if (!input) return false;
    input.focus();
    input.value = text;
    input.dispatchEvent(new this.win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    await sleep(15);
    return true;
  }

  /** Обирає варіант у <select>: як і браузер, надсилає input і change. */
  async choose(/** @type {HTMLSelectElement | null} */ select, /** @type {string} */ value) {
    if (!select) return false;
    select.focus();
    select.value = value;
    select.dispatchEvent(new this.win.Event('input', { bubbles: true }));
    select.dispatchEvent(new this.win.Event('change', { bubbles: true }));
    await sleep(15);
    return true;
  }

  /** Надсилає форму, як Enter у полі або кнопка submit. */
  async submit(/** @type {HTMLFormElement | null} */ form, /** @type {HTMLElement | null} */ submitter = null) {
    if (!form) return false;
    if (submitter) {
      submitter.focus();
      form.requestSubmit(submitter);
    } else {
      form.requestSubmit();
    }
    await sleep(40);
    return true;
  }

  /** Esc у модальному діалозі: requestClose() робить те саме, що й клавіша. */
  async escape(/** @type {HTMLDialogElement | null} */ dialog) {
    if (!dialog) return;
    if (typeof dialog.requestClose === 'function') dialog.requestClose();
    else if (dialog.dispatchEvent(new this.win.Event('cancel', { cancelable: true }))) dialog.close();
    await sleep(20);
  }

  /** Кнопка в контейнері за видимим текстом. */
  buttonByText(/** @type {Element | null} */ root, /** @type {string} */ text) {
    return /** @type {HTMLElement | null} */ (
      [...(root?.querySelectorAll('button') ?? [])].find((button) => norm(button.textContent) === text) ?? null
    );
  }
}

/** Чи елемент «візуально прихований» (клас visually-hidden): рамка 1×1 px або менша. */
function visuallyHidden(/** @type {Element} */ element) {
  const box = element.getBoundingClientRect();
  return box.width <= 1 && box.height <= 1;
}

/** Чи елемент виключено з дерева доступності: hidden, display: none, aria-hidden. */
function excluded(/** @type {Element} */ element) {
  if (element.getAttribute('aria-hidden') === 'true') return true;
  if (/** @type {HTMLElement} */ (element).hidden) return true;
  return element.ownerDocument.defaultView?.getComputedStyle(element).display === 'none';
}

/** Текст, який бачить користувач: без прихованих і візуально прихованих частин. */
export function visibleLabel(/** @type {Element} */ element) {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node.nodeType === Node.ELEMENT_NODE && !excluded(/** @type {Element} */ (node))) {
      if (!visuallyHidden(/** @type {Element} */ (node))) text += visibleLabel(/** @type {Element} */ (node));
    }
  }
  return norm(text);
}

/** Текст з усіх вузлів, що потрапляють у дерево доступності (зокрема visually-hidden). */
function accessibleText(/** @type {Element} */ element) {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node.nodeType === Node.ELEMENT_NODE && !excluded(/** @type {Element} */ (node))) {
      text += accessibleText(/** @type {Element} */ (node));
    }
  }
  return text;
}

/**
 * Спрощене обчислення accessible name (як у панелі Accessibility): aria-labelledby, потім
 * aria-label, потім вміст елемента. Для кнопок і діалогів цього застосунку його достатньо.
 */
export function accessibleName(/** @type {Element | null} */ element) {
  if (!element) return '';
  const doc = element.ownerDocument;
  const ids = norm(element.getAttribute('aria-labelledby'));
  if (ids) {
    return norm(
      ids
        .split(' ')
        .map((id) => doc.getElementById(id))
        .map((label) => (label ? accessibleText(label) : ''))
        .join(' '),
    );
  }
  const label = norm(element.getAttribute('aria-label'));
  if (label) return label;
  return norm(accessibleText(element));
}

/** Короткий опис елемента для повідомлення: <button data-action="toggle">. */
export function describe(/** @type {Element | null | undefined} */ element) {
  if (!element) return 'нічого';
  if (element === element.ownerDocument.body) return '<body>';
  const attrs = ['id', 'data-action', 'data-id', 'class']
    .filter((name) => element.hasAttribute(name))
    .slice(0, 2)
    .map((name) => ` ${name}="${element.getAttribute(name)}"`)
    .join('');
  return `<${element.tagName.toLowerCase()}${attrs}>`;
}
