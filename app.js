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

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('results');
const resultsGrid = document.getElementById('resultsGrid');

const playerSection = document.getElementById('playerSection');
const backBtn = document.getElementById('backBtn');
const videoEl = document.getElementById('video');
const playerStatusEl = document.getElementById('playerStatus');
const releaseTitleEl = document.getElementById('releaseTitle');
const episodesListEl = document.getElementById('episodesList');

let hlsInstance = null;

backBtn.addEventListener('click', () => {
  stopPlayback();
  playerSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');
});

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
  resultsSection.classList.add('hidden');

  try {
    const data = await searchAnilibria(query);
    renderResults(data, query);
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

function renderResults(data, query) {
  // Структура ответа v1 может быть массивом, { data: [...] } или { list: [...] } —
  // на случай если API чуть отличается от ожидаемого, проверяем все варианты.
  const list = Array.isArray(data)
    ? data
    : (data.data || data.list || data.items || []);

  console.log('Сырой ответ API (для отладки):', data);

  if (!list.length) {
    showStatus(`По запросу «${query}» ничего не найдено.`, 'error');
    return;
  }

  statusEl.classList.add('hidden');
  resultsGrid.innerHTML = '';

  for (const title of list) {
    resultsGrid.appendChild(buildCard(title));
  }

  resultsSection.classList.remove('hidden');
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

  resultsSection.classList.add('hidden');
  playerSection.classList.remove('hidden');
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