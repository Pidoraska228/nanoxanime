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
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('results');
const resultsGrid = document.getElementById('resultsGrid');

const homeSections = document.getElementById('homeSections');
const popularGrid = document.getElementById('popularGrid');
const newGrid = document.getElementById('newGrid');
const randomGrid = document.getElementById('randomGrid');
const shuffleBtn = document.getElementById('shuffleBtn');

const playerSection = document.getElementById('playerSection');
const backBtn = document.getElementById('backBtn');
const videoEl = document.getElementById('video');
const playerStatusEl = document.getElementById('playerStatus');
const releaseTitleEl = document.getElementById('releaseTitle');
const episodesListEl = document.getElementById('episodesList');

let hlsInstance = null;
let catalogPool = []; // список каталога — используем для Популярное/Новинки/Случайное
let previousView = 'home';

// Переключение между тремя "экранами": home / results / player
function showView(view) {
  homeSections.classList.toggle('hidden', view !== 'home');
  resultsSection.classList.toggle('hidden', view !== 'results');
  playerSection.classList.toggle('hidden', view !== 'player');
}

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
        `${host}/app/search/releases?query=${encodeURIComponent(query)}&limit=20`,
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
async function fetchCatalog() {
  let lastError;

  for (const host of API_HOSTS) {
    try {
      return await fetchWithTimeout(`${host}/anime/catalog/releases?page=1&limit=24`, 8000);
    } catch (err) {
      lastError = err;
      console.warn(`Хост ${host} не отдал каталог:`, err.message);
    }
  }

  throw lastError || new Error('Все серверы недоступны');
}

async function loadHomeSections() {
  try {
    const data = await fetchCatalog();
    console.log('Сырой ответ каталога (для отладки):', data);

    const list = Array.isArray(data)
      ? data
      : (data.data || data.list || data.items || []);

    if (!list.length) {
      popularGrid.innerHTML = '<p class="home-empty">Не удалось загрузить каталог — глянь консоль (F12).</p>';
      return;
    }

    catalogPool = list;

    renderNew(list);
    renderPopular(list);
    renderRandomPick();
  } catch (err) {
    console.error('Ошибка загрузки каталога:', err);
    popularGrid.innerHTML = `<p class="home-empty">Не удалось загрузить каталог: ${escapeHtml(err.message)}</p>`;
  }
}

function renderNew(list) {
  // Порядок в ответе каталога обычно уже свежие сверху — берём как есть
  newGrid.innerHTML = '';
  list.slice(0, 12).forEach(title => newGrid.appendChild(buildCard(title)));
}

function renderPopular(list) {
  // Пытаемся отсортировать по любому найденному "популярностному" полю.
  // Если такого поля нет в ответе — используем список как есть (см. консоль для деталей).
  const popularityField = ['in_favorites', 'favorites_count', 'rating', 'score', 'views']
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

function renderResults(list, query) {
  console.log('Итоговый список результатов (для отладки):', list);

  if (!list.length) {
    showStatus(`По запросу «${query}» ничего не найдено.`, 'error');
    return;
  }

  statusEl.classList.add('hidden');
  resultsGrid.innerHTML = '';

  const sorted = sortByRelevance(list, query);

  for (const title of sorted) {
    resultsGrid.appendChild(buildCard(title));
  }

  showView('results');
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
    <img src="${posterUrl}" alt="${escapeHtml(name)}" loading="lazy"
         onerror="this.style.opacity=0.3">
    <div class="card-info">
      <div class="card-title">${escapeHtml(name)}</div>
      <div class="card-meta">${year} ${episodes ? '· ' + episodes : ''}</div>
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
  previousView = homeSections.classList.contains('hidden') ? 'results' : 'home';

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
    const btn = document.createElement('button');
    btn.className = 'episode-btn';
    btn.innerHTML = `<span class="episode-num">${num}</span><span>${ep.name || 'Серия ' + num}</span>`;
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
