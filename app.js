// ============ Nonaxamine — поиск аниме через AniLiberty (AniLibria) API v1 ============
//
// ВАЖНО: старый api.anilibria.tv/v3 ПОЛНОСТЬЮ ОТКЛЮЧЁН разработчиками (отдаёт 403).
// Актуальный API — v1, документация: https://anilibria.top/api/docs/v1
// Основной домен: anilibria.top (домен aniliberty.top заблокирован в РФ через РКН)
// Зеркало API: api.anilibria.app

const API_HOSTS = [
  'https://anilibria.top/api/v1',
  'https://api.anilibria.app/api/v1',
];

// AniLibria хранит тайтлы в основном под русскими названиями (переведёнными, а не
// транслитерацией), и поиск API не умеет сам сопоставлять "one piece" ↔ "Ван-Пис".
// Небольшой словарь самых популярных тайтлов решает это для частых случаев.
// Если что-то не находится — просто добавь пару "английское: русское" сюда.
const TITLE_TRANSLATIONS = {
  'one piece': 'ван пис',
  'bleach': 'блич',
  'attack on titan': 'атака титанов',
  'death note': 'тетрадь смерти',
  'demon slayer': 'клинок рассекающий демонов',
  'jujutsu kaisen': 'магическая битва',
  'my hero academia': 'моя геройская академия',
  'dragon ball': 'драконий жемчуг',
  'fullmetal alchemist': 'стальной алхимик',
  'chainsaw man': 'человек бензопила',
  'spy x family': 'семья шпиона',
  'tokyo ghoul': 'токийский гуль',
  'sword art online': 'мастера меча онлайн',
  'one punch man': 'ванпанчмен',
  'hunter x hunter': 'хантер х хантер',
  'black clover': 'чёрный клевер',
  'the promised neverland': 'обещанный неверленд',
  'mob psycho 100': 'моб психо 100',
  'code geass': 'гиас',
  'steins gate': 'штейнс гейт',
  'violet evergarden': 'violet evergarden',
  'made in abyss': 'созданный в бездне',
  're zero': 're zero',
  'konosuba': 'коносуба',
  'overlord': 'оверлорд',
  'no game no life': 'нет игры нет жизни',
  'fairy tail': 'хвост феи',
  'seven deadly sins': 'семь смертных грехов',
  'vinland saga': 'сага о винланде',
  'haikyuu': 'волейбол',
  'evangelion': 'евангелион',
  'cowboy bebop': 'ковбой бибоп',
  'gintama': 'гинтама',
};

// Ищет русский перевод названия по частичному совпадению запроса со словарём
function findTitleTranslation(query) {
  const q = query.trim().toLowerCase();
  if (TITLE_TRANSLATIONS[q]) return TITLE_TRANSLATIONS[q];

  const key = Object.keys(TITLE_TRANSLATIONS).find(
    k => q.includes(k) || k.includes(q)
  );
  return key ? TITLE_TRANSLATIONS[key] : null;
}

const searchInput = document.getElementById('searchInput');

const infoBtn = document.getElementById('infoBtn');
const infoModal = document.getElementById('infoModal');
const infoCloseBtn = document.getElementById('infoCloseBtn');

infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
infoCloseBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
infoModal.addEventListener('click', (e) => {
  if (e.target === infoModal) infoModal.classList.add('hidden'); // клик по фону закрывает
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') infoModal.classList.add('hidden');
});
const searchBtn = document.getElementById('searchBtn');
const exactMatchToggle = document.getElementById('exactMatchToggle');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('results');
const resultsGrid = document.getElementById('resultsGrid');

const homeSections = document.getElementById('homeSections');
const popularGrid = document.getElementById('popularGrid');
const newGrid = document.getElementById('newGrid');
const randomGrid = document.getElementById('randomGrid');
const shuffleBtn = document.getElementById('shuffleBtn');

const genreNav = document.getElementById('genreNav');
const genreResultsSection = document.getElementById('genreResults');
const genreGrid = document.getElementById('genreGrid');
const genreResultsTitle = document.getElementById('genreResultsTitle');
const genreBackBtn = document.getElementById('genreBackBtn');

const playerSection = document.getElementById('playerSection');
const backBtn = document.getElementById('backBtn');
const videoEl = document.getElementById('video');
const playerStatusEl = document.getElementById('playerStatus');
const releaseTitleEl = document.getElementById('releaseTitle');
const episodesListEl = document.getElementById('episodesList');

let hlsInstance = null;
let catalogPool = []; // список каталога — используем для Популярное/Новинки/Случайное
let genresMap = new Map(); // id -> name, собираем из реальных данных релизов
let selectedGenreIds = new Set(); // выбранные жанры для пересечения
let genreBrowsePool = []; // кэш большого пула каталога для фильтрации по жанрам
let previousView = 'home';

// Переключение между экранами: home / results / genre / player
function showView(view) {
  homeSections.classList.toggle('hidden', view !== 'home');
  resultsSection.classList.toggle('hidden', view !== 'results');
  genreResultsSection.classList.toggle('hidden', view !== 'genre');
  playerSection.classList.toggle('hidden', view !== 'player');
}

genreBackBtn.addEventListener('click', () => {
  selectedGenreIds.clear();
  renderGenreNav();
  showView('home');
});

backBtn.addEventListener('click', () => {
  stopPlayback();
  showView(previousView);
});

shuffleBtn.addEventListener('click', renderRandomPick);

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

async function doSearch() {
  const query = searchInput.value.trim();

  if (!query) {
    showStatus('Введите название аниме для поиска.', 'error');
    return;
  }

  setLoading(true);
  showStatus(`Ищу «${query}»...`, 'loading');

  try {
    const translated = findTitleTranslation(query);
    const data = await searchAnilibria(query);
    let list = extractList(data);

    // Если нашли известный перевод — досыпаем результаты по русскому запросу
    // (AniLibria хранит тайтлы под русскими названиями, английский поиск их не находит)
    if (translated) {
      try {
        const dataRu = await searchAnilibria(translated);
        const listRu = extractList(dataRu);
        list = mergeUnique(list, listRu);
        console.log(`Дополнительно искал по переводу "${translated}", найдено:`, listRu);
      } catch (err) {
        console.warn('Не удалось выполнить поиск по переводу:', err.message);
      }
    }

    // Дополнительно ищем среди уже загруженного полного каталога (если он успел
    // загрузиться в фоне) — это находит вообще всё, что реально есть в базе,
    // независимо от того, что решил вернуть капризный серверный поиск
    if (fullCatalogPromise) {
      try {
        const fullCatalog = await fullCatalogPromise;
        const localMatches = fullCatalog.filter(title => phraseMatches(title, query));
        list = mergeUnique(list, localMatches);
        console.log(`Локальный поиск по полному каталогу (${fullCatalog.length} тайтлов): найдено`, localMatches);
      } catch (err) {
        console.warn('Полный каталог ещё не загрузился или упал:', err.message);
      }
    }

    // Режим "точные совпадения": оставляем только тайтлы, где вся фраза целиком
    // встречается в названии — без разбивки на отдельные слова, как это делает сервер
    if (exactMatchToggle.checked) {
      const before = list.length;
      list = list.filter(title => phraseMatches(title, query));
      console.log(`Точные совпадения: было ${before}, осталось ${list.length}`);
    }

    renderResults(list, query);
  } catch (err) {
    console.error('Ошибка поиска:', err);
    showStatus(
      `Не удалось выполнить поиск: ${err.message}. Попробуй ещё раз через пару секунд — сервер AniLibria иногда подтормаживает.`,
      'error'
    );
  } finally {
    setLoading(false);
  }
}

// Структура ответа v1 может быть массивом, { data: [...] } или { list: [...] }
function extractList(data) {
  return Array.isArray(data) ? data : (data.data || data.list || data.items || []);
}

// Объединяем два списка релизов без дублей (по id/alias)
function mergeUnique(listA, listB) {
  const seen = new Set(listA.map(t => t.id ?? t.alias ?? t.code));
  const merged = [...listA];

  for (const title of listB) {
    const key = title.id ?? title.alias ?? title.code;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(title);
    }
  }

  return merged;
}

// Пробуем каждый хост из списка по очереди, пока один не сработает
async function searchAnilibria(query) {
  let lastError;

  for (const host of API_HOSTS) {
    try {
      return await fetchWithTimeout(
        `${host}/app/search/releases?query=${encodeURIComponent(query)}&limit=50`,
        8000
      );
    } catch (err) {
      lastError = err;
      console.warn(`Хост ${host} не ответил:`, err.message);
    }
  }

  throw lastError || new Error('Все серверы недоступны');
}

// fetch с таймаутом, чтобы не висело бесконечно
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const rawText = await res.text();

    if (!res.ok) {
      // Логируем сырой ответ сервера — пригодится, если путь эндпоинта поменяли
      console.error(`[${url}] HTTP ${res.status}. Ответ сервера:`, rawText);
      throw new Error(`сервер вернул код ${res.status}`);
    }

    let json;
    try {
      json = JSON.parse(rawText);
    } catch {
      console.error(`[${url}] Ответ не JSON:`, rawText.slice(0, 300));
      throw new Error('сервер вернул не JSON (возможно, изменился путь API)');
    }

    // AniLibria может возвращать { error: {...} } при ошибке
    if (json.error) {
      throw new Error(json.error.message || json.error || 'ошибка API');
    }

    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('сервер не ответил вовремя (таймаут)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============ Главная: Популярное / Новинки / Случайное ============

// Пробуем получить список каталога — используем его как общий пул данных
async function fetchCatalog(page = 1, limit = 24) {
  let lastError;

  for (const host of API_HOSTS) {
    try {
      return await fetchWithTimeout(`${host}/anime/catalog/releases?page=${page}&limit=${limit}`, 8000);
    } catch (err) {
      lastError = err;
      console.warn(`Хост ${host} не отдал каталог:`, err.message);
    }
  }

  throw lastError || new Error('Все серверы недоступны');
}

// Загружаем ВЕСЬ каталог целиком (все страницы) и кэшируем — считаем один раз за сессию.
// Каталог AniLibria — около 1800+ тайтлов, это вполне реально скачать за несколько секунд.
let fullCatalogPromise = null;

function fetchFullCatalog() {
  if (fullCatalogPromise) return fullCatalogPromise;

  fullCatalogPromise = (async () => {
    const first = await fetchCatalog(1, 50);
    const firstList = extractList(first);
    const totalPages = first?.meta?.pagination?.total_pages || 1;
    const total = first?.meta?.pagination?.total || firstList.length;

    console.log(`Полный каталог: всего ${total} тайтлов, ${totalPages} страниц. Начинаю грузить остальное...`);

    const restPromises = [];
    for (let p = 2; p <= totalPages; p++) {
      restPromises.push(
        fetchCatalog(p, 50).catch(err => {
          console.warn(`Не удалось загрузить страницу ${p} каталога:`, err.message);
          return null;
        })
      );
    }

    const restResults = await Promise.all(restPromises);

    let combined = firstList;
    for (const data of restResults) {
      if (!data) continue;
      combined = mergeUnique(combined, extractList(data));
    }

    console.log(`Полный каталог загружен: ${combined.length} тайтлов (из заявленных ${total}).`);

    collectGenres(combined);
    renderGenreNav();

    // Раз каталог теперь полный — пересчитываем Популярное точнее
    renderPopular(combined);

    return combined;
  })();

  return fullCatalogPromise;
}

async function loadHomeSections() {
  try {
    const data = await fetchCatalog(1, 24);
    console.log('Сырой ответ каталога (для отладки):', data);

    const list = extractList(data);

    if (!list.length) {
      popularGrid.innerHTML = '<p class="home-empty">Не удалось загрузить каталог — глянь консоль (F12).</p>';
      return;
    }

    catalogPool = list;
    collectGenres(list);
    renderGenreNav();

    renderNew(list);
    renderPopular(list);
    renderRandomPick();

    // Параллельно в фоне тянем весь каталог — для полного поиска и жанров
    fetchFullCatalog().catch(err => console.error('Не удалось загрузить полный каталог:', err));
  } catch (err) {
    console.error('Ошибка загрузки каталога:', err);
    popularGrid.innerHTML = `<p class="home-empty">Не удалось загрузить каталог: ${escapeHtml(err.message)}</p>`;
  }
}

// Собираем реальный список жанров прямо из данных релизов (id → название)
function collectGenres(list) {
  for (const title of list) {
    for (const g of title.genres || []) {
      if (g?.id !== undefined) genresMap.set(g.id, g.name);
    }
  }
}

function renderGenreNav() {
  genreNav.innerHTML = '';

  const sortedGenres = [...genresMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));

  for (const [id, name] of sortedGenres) {
    const chip = document.createElement('button');
    chip.className = 'genre-chip';
    chip.textContent = name;
    if (selectedGenreIds.has(id)) chip.classList.add('active');
    chip.addEventListener('click', () => toggleGenre(id, name, chip));
    genreNav.appendChild(chip);
  }
}

// Переключаем жанр во множестве выбранных и пересчитываем подборку (пересечение жанров)
function toggleGenre(id, name, chipEl) {
  if (selectedGenreIds.has(id)) {
    selectedGenreIds.delete(id);
    chipEl.classList.remove('active');
  } else {
    selectedGenreIds.add(id);
    chipEl.classList.add('active');
  }

  if (selectedGenreIds.size === 0) {
    showView('home');
    return;
  }

  applyGenreFilter();
}

function renderNew(list) {
  // Порядок в ответе каталога обычно уже свежие сверху — берём как есть
  newGrid.innerHTML = '';
  list.slice(0, 12).forEach(title => newGrid.appendChild(buildCard(title)));
}

function renderPopular(list) {
  // Реальное поле популярности в API — added_in_users_favorites (проверено через консоль)
  const popularityField = ['added_in_users_favorites', 'added_in_watching_collection', 'in_favorites', 'rating', 'score']
    .find(field => list[0]?.[field] !== undefined);

  const sorted = popularityField
    ? [...list].sort((a, b) => (b[popularityField] || 0) - (a[popularityField] || 0))
    : list;

  if (!popularityField) {
    console.warn('Не нашёл поле популярности в ответе каталога — показываю без сортировки. Смотри "Сырой ответ каталога" выше.');
  }

  popularGrid.innerHTML = '';
  sorted.slice(0, 12).forEach(title => popularGrid.appendChild(buildCard(title)));
}

function renderRandomPick() {
  if (!catalogPool.length) return;
  const pick = catalogPool[Math.floor(Math.random() * catalogPool.length)];
  randomGrid.innerHTML = '';
  randomGrid.appendChild(buildCard(pick));
}

// Показываем пересечение всех выбранных жанров сразу (аниме должно иметь ВСЕ выбранные жанры)
async function applyGenreFilter() {
  const names = [...selectedGenreIds].map(id => genresMap.get(id)).filter(Boolean);
  genreResultsTitle.textContent = `Жанры: ${names.join(' + ')}`;
  genreGrid.innerHTML = '';
  showView('genre');
  showStatus(`Загружаю полный каталог для точной подборки (один раз за сессию, дальше быстро)...`, 'loading');

  try {
    const pool = await fetchFullCatalog();

    const filtered = pool.filter(title => {
      const titleGenreIds = new Set((title.genres || []).map(g => g.id));
      return [...selectedGenreIds].every(id => titleGenreIds.has(id));
    });

    console.log(`Жанры [${names.join(', ')}]: найдено ${filtered.length} из ${pool.length}`, filtered);

    if (!filtered.length) {
      showStatus(`По жанрам «${names.join(' + ')}» ничего не нашлось во всём каталоге.`, 'error');
      return;
    }

    statusEl.classList.add('hidden');
    filtered.forEach(title => genreGrid.appendChild(buildCard(title)));
  } catch (err) {
    console.error('Ошибка загрузки жанров:', err);
    showStatus(`Не удалось загрузить подборку: ${err.message}`, 'error');
  }
}

function renderResults(list, query) {
  console.log('Итоговый список результатов (для отладки):', list);

  resultsGrid.innerHTML = '';
  showView('results');

  if (!list.length) {
    const hint = exactMatchToggle.checked
      ? ` Попробуй выключить «Точные совпадения» — сервер мог найти что-то похожее.`
      : '';
    showStatus(`По запросу «${query}» ничего не найдено.${hint}`, 'error');
    return;
  }

  statusEl.classList.add('hidden');

  const sorted = sortByRelevance(list, query);

  for (const title of sorted) {
    resultsGrid.appendChild(buildCard(title));
  }
}

// Достаём все возможные варианты названия релиза (основное, английское, альтернативные)
function getAllNames(title) {
  const names = [
    title.name?.main,
    title.name?.english,
    title.name?.alternative,
    title.names?.ru,
    title.names?.en,
    title.title,
  ];

  if (Array.isArray(title.name?.alternative_names)) {
    names.push(...title.name.alternative_names);
  }

  return names.filter(Boolean);
}

// Простая релевантность: точное совпадение > начинается с > целое слово > просто содержит
// Сравниваем и с оригинальным запросом, и с его русским переводом (если есть в словаре)
function relevanceScore(title, query) {
  const variants = [query.trim().toLowerCase()];
  const translated = findTitleTranslation(query);
  if (translated) variants.push(translated);

  let best = 0;

  for (const raw of getAllNames(title)) {
    const n = raw.toLowerCase();

    for (const q of variants) {
      if (n === q) {
        best = Math.max(best, 100);
      } else if (n.startsWith(q)) {
        best = Math.max(best, 80);
      } else if (new RegExp(`\\b${escapeRegex(q)}\\b`).test(n)) {
        best = Math.max(best, 60);
      } else if (n.includes(q)) {
        best = Math.max(best, 40);
      }
    }
  }

  return best;
}

// Проверяет, встречается ли запрос целиком (как фраза, без разбивки на слова)
// в каком-либо из названий тайтла
function phraseMatches(title, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const variants = [q];
  const translated = findTitleTranslation(query);
  if (translated) variants.push(translated);

  return getAllNames(title).some(raw => {
    const n = raw.toLowerCase();
    return variants.some(v => n.includes(v));
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Сортируем по релевантности, не выкидывая ничего — просто точные совпадения оказываются первыми
function sortByRelevance(list, query) {
  return [...list].sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
}

function buildCard(title) {
  const card = document.createElement('div');
  card.className = 'card';

  // Пытаемся достать постер из разных возможных мест схемы v1
  const posterPath =
    title.poster?.src ||
    title.poster?.optimized?.src ||
    title.posters?.medium?.url ||
    title.posters?.original?.url ||
    '';

  const posterUrl = posterPath
    ? (posterPath.startsWith('http') ? posterPath : `https://anilibria.top${posterPath}`)
    : '';

  const name =
    title.name?.main ||
    title.name?.english ||
    title.names?.ru ||
    title.names?.en ||
    title.title ||
    'Без названия';

  const year =
    title.year ||
    title.season?.year ||
    '—';

  const episodes = title.episodes_total
    ? `${title.episodes_total} эп.`
    : (title.type?.episodes ? `${title.type.episodes} эп.` : '');

  card.innerHTML = `
    <img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(name)}" loading="lazy"
         onerror="this.style.opacity=0.3">
    <div class="card-info">
      <div class="card-title">${escapeHtml(name)}</div>
      <div class="card-meta">${escapeHtml(String(year))} ${episodes ? '· ' + escapeHtml(episodes) : ''}</div>
    </div>
  `;

  card.addEventListener('click', () => openPlayer(title, name));

  return card;
}

// ============ Плеер ============

async function openPlayer(title, displayName) {
  const releaseId = title.id ?? title.alias ?? title.code;

  if (releaseId === undefined || releaseId === null) {
    showStatus('Не удалось определить ID релиза для открытия плеера.', 'error');
    console.error('Объект релиза без id/alias/code:', title);
    return;
  }

  // Запоминаем откуда пришли — home или results — чтобы кнопка "Назад" вернула туда же
  // Запоминаем откуда пришли — home / results / genre — чтобы "Назад" вернул туда же
  if (!homeSections.classList.contains('hidden')) {
    previousView = 'home';
  } else if (!genreResultsSection.classList.contains('hidden')) {
    previousView = 'genre';
  } else {
    previousView = 'results';
  }

  showView('player');
  releaseTitleEl.textContent = displayName;
  episodesListEl.innerHTML = '';
  setPlayerStatus('Загружаю список серий...');

  try {
    const detail = await fetchReleaseDetail(releaseId);
    console.log('Сырой ответ по релизу (для отладки):', detail);

    const episodesArr = extractEpisodes(detail);

    if (!episodesArr.length) {
      setPlayerStatus('Не нашёл серий у этого релиза. Возможно, изменилась структура ответа API — глянь консоль (F12).');
      return;
    }

    renderEpisodesList(episodesArr);
    // Автоматически открываем первую серию
    playEpisode(episodesArr[0]);
  } catch (err) {
    console.error('Ошибка загрузки релиза:', err);
    setPlayerStatus(`Не удалось загрузить серии: ${err.message}`);
  }
}

async function fetchReleaseDetail(releaseId) {
  let lastError;

  for (const host of API_HOSTS) {
    try {
      return await fetchWithTimeout(`${host}/anime/releases/${releaseId}`, 8000);
    } catch (err) {
      lastError = err;
      console.warn(`Хост ${host} не отдал детали релиза:`, err.message);
    }
  }

  throw lastError || new Error('Все серверы недоступны');
}

// Пытаемся вытащить массив серий из разных возможных мест схемы ответа
function extractEpisodes(detail) {
  const raw =
    detail.episodes ||
    detail.player?.list ||
    detail.player?.episodes ||
    [];

  // Если это объект вида {"1": {...}, "2": {...}} — превращаем в массив
  if (!Array.isArray(raw) && typeof raw === 'object') {
    return Object.values(raw);
  }

  return raw;
}

function renderEpisodesList(episodesArr) {
  episodesListEl.innerHTML = '';

  episodesArr.forEach((ep, index) => {
    const num = ep.episode ?? ep.ordinal ?? ep.serie ?? (index + 1);
    const epName = ep.name ? escapeHtml(ep.name) : `Серия ${num}`;
    const btn = document.createElement('button');
    btn.className = 'episode-btn';
    btn.innerHTML = `<span class="episode-num">${num}</span><span>${epName}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playEpisode(ep);
    });
    if (index === 0) btn.classList.add('active');
    episodesListEl.appendChild(btn);
  });
}

function playEpisode(ep) {
  const streamUrl = extractStreamUrl(ep);

  if (!streamUrl) {
    setPlayerStatus('Не нашёл ссылку на видеопоток для этой серии. Смотри консоль (F12) — там сырой объект серии.');
    console.error('Серия без ссылки на видео:', ep);
    return;
  }

  setPlayerStatus('');
  loadHls(streamUrl);
}

// Пытаемся достать ссылку на HLS в разных возможных форматах схемы
function extractStreamUrl(ep) {
  let url =
    ep.hls_1080 || ep.hls_720 || ep.hls_480 ||
    ep.hls?.fhd || ep.hls?.hd || ep.hls?.sd ||
    ep.hls?.['1080'] || ep.hls?.['720'] || ep.hls?.['480'] ||
    null;

  if (!url) return null;

  // Если ссылка относительная — добавляем домен видеосервера
  if (!url.startsWith('http')) {
    const host = ep.host || 'cache.libria.fun';
    url = `https://${host}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  return url;
}

function loadHls(url) {
  stopPlayback();

  if (window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls();
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(videoEl);
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('HLS.js ошибка:', data);
        setPlayerStatus(`Ошибка воспроизведения: ${data.details}`);
      }
    });
    videoEl.play().catch(() => {});
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari умеет нативно
    videoEl.src = url;
    videoEl.play().catch(() => {});
  } else {
    setPlayerStatus('Этот браузер не поддерживает HLS-плеер.');
  }
}

function stopPlayback() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();
}

function setPlayerStatus(message) {
  if (!message) {
    playerStatusEl.classList.add('hidden');
    return;
  }
  playerStatusEl.textContent = message;
  playerStatusEl.classList.remove('hidden');
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchBtn.textContent = isLoading ? 'Поиск...' : 'Найти';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ Инициализация ============
loadHomeSections();
