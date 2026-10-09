// Точка входу «Мій список»: показує список і підключає обробники подій. Кожен модуль у src/
// відповідає своєму challenge; що саме має робити кожна функція — у її коментарі й у ТЗ.
import { initDetails } from './details.js';
import { initFilters, readFilters } from './filters.js';
import { initList } from './list.js';
import { renderShows } from './render.js';
import { visibleShows } from './state.js';

/** Перемальовує список для поточних значень форми фільтрів. */
function refresh() {
  renderShows(visibleShows(readFilters()));
}

refresh();
initList(refresh);
initFilters(refresh);
initDetails(refresh);
