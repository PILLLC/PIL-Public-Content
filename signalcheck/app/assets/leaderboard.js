const STORAGE_KEYS = {
  HISTORY: 'signalcheck_history',
  BEST_RESULTS: 'signalcheck_best_results'
};

const bestResultsContainer = document.getElementById('bestResultsContainer');
const recentHistoryContainer = document.getElementById('recentHistoryContainer');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const clearBestBtn = document.getElementById('clearBestBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const toggleDarkBtn = document.getElementById('toggleDark');
const hamburgerBtn = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadLocalData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Failed to read localStorage key "${key}":`, error);
    return fallback;
  }
}

function saveLocalData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write localStorage key "${key}":`, error);
  }
}

function formatDate(isoString) {
  if (!isoString) return 'n/a';

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'n/a';

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? fallback : numeric;
}

function getSortedBestResults() {
  const bestResults = loadLocalData(STORAGE_KEYS.BEST_RESULTS, {});

  return Object.values(bestResults).sort((a, b) => {
    const scoreDiff = normalizeNumber(b.score) - normalizeNumber(a.score);
    if (scoreDiff !== 0) return scoreDiff;

    const outcomeDiff = normalizeNumber(b.outcomeScore) - normalizeNumber(a.outcomeScore);
    if (outcomeDiff !== 0) return outcomeDiff;

    const correctDiff = normalizeNumber(b.correctAnswers) - normalizeNumber(a.correctAnswers);
    if (correctDiff !== 0) return correctDiff;

    return String(a.scenarioTitle || '').localeCompare(String(b.scenarioTitle || ''));
  });
}

function renderBestResults() {
  if (!bestResultsContainer) return;

  const rows = getSortedBestResults();

  if (!rows.length) {
    bestResultsContainer.innerHTML = '<p>No best results recorded yet.</p>';
    return;
  }

  bestResultsContainer.innerHTML = `
    <div class="state-panel">
      <ul class="state-list">
        ${rows.map(item => `
          <li>
            <strong>${escapeHtml(item.scenarioTitle || 'Unknown Scenario')}</strong><br>
            Final Score: ${escapeHtml(item.score)} / ${escapeHtml(item.total ?? 400)} |
            Correct Decisions: ${escapeHtml(item.correctAnswers ?? 'n/a')} / ${escapeHtml(item.totalSteps ?? 'n/a')}<br>
            Performance: ${escapeHtml(item.performance || 'n/a')} |
            Outcome: ${escapeHtml(item.outcome || 'n/a')} |
            Outcome Score: ${escapeHtml(item.outcomeScore ?? 'n/a')}<br>
            Style: ${escapeHtml(item.dominantStyle || '🎯 Balanced')} |
            Difficulty: ${escapeHtml(item.difficulty || 'n/a')}<br>
            Completed: ${escapeHtml(formatDate(item.completedAt))}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderRecentHistory() {
  if (!recentHistoryContainer) return;

  const history = loadLocalData(STORAGE_KEYS.HISTORY, []);

  if (!history.length) {
    recentHistoryContainer.innerHTML = '<p>No recent sessions recorded yet.</p>';
    return;
  }

  recentHistoryContainer.innerHTML = `
    <div class="state-panel">
      <ul class="state-list">
        ${history.map(item => `
          <li>
            <strong>${escapeHtml(item.scenarioTitle || 'Unknown Scenario')}</strong><br>
            Final Score: ${escapeHtml(item.score)} / ${escapeHtml(item.total ?? 400)} |
            Correct Decisions: ${escapeHtml(item.correctAnswers ?? 'n/a')} / ${escapeHtml(item.totalSteps ?? 'n/a')}<br>
            Outcome: ${escapeHtml(item.outcome || 'n/a')} |
            Style: ${escapeHtml(item.dominantStyle || '🎯 Balanced')}<br>
            Performance: ${escapeHtml(item.performance || 'n/a')} |
            Difficulty: ${escapeHtml(item.difficulty || 'n/a')} |
            Completed: ${escapeHtml(formatDate(item.completedAt))}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function clearHistory() {
  saveLocalData(STORAGE_KEYS.HISTORY, []);
  renderRecentHistory();
}

function clearBestResults() {
  saveLocalData(STORAGE_KEYS.BEST_RESULTS, {});
  renderBestResults();
}

function clearAllData() {
  saveLocalData(STORAGE_KEYS.HISTORY, []);
  saveLocalData(STORAGE_KEYS.BEST_RESULTS, {});
  renderBestResults();
  renderRecentHistory();
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', clearHistory);
}

if (clearBestBtn) {
  clearBestBtn.addEventListener('click', clearBestResults);
}

if (clearAllBtn) {
  clearAllBtn.addEventListener('click', clearAllData);
}

if (toggleDarkBtn) {
  toggleDarkBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.body.classList.toggle('dark');
  });
}

if (hamburgerBtn && navLinks) {
  hamburgerBtn.addEventListener('click', () => {
    navLinks.classList.toggle('show');
    const expanded = navLinks.classList.contains('show');
    hamburgerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
}

renderBestResults();
renderRecentHistory();