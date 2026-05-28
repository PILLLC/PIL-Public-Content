import { createScoringEngine } from "./scoring.js";

let score = 0;
let maxScore = 0;
let results = [];
let styleCounts = {};

let currentScenario = null;
let scenarioSteps = {};
let scenarioState = {};
let currentCaseData = null;
let currentStepData = null;
let currentTimerInterval = null;
let availableScenarios = [];
let currentStepId = null;
let stepCount = 0;
let isSubmitting = false;

let scoringEngine = null;

let scenarioInjects = [];
let pendingInject = null;
let firedInjectIds = new Set();

let incidentFeed = [];
let lastRenderedPhaseIndex = null;

const spinner = document.getElementById('spinner');
const scenarioSelect = document.getElementById('scenarioSelect');
const loadScenarioBtn = document.getElementById('loadScenarioBtn');
const randomScenarioBtn = document.getElementById('randomScenarioBtn');
const caseContainer = document.getElementById('caseContainer');
const timerEl = document.getElementById('timer');
const sessionStatusEl = document.getElementById('sessionStatus');

const STORAGE_KEYS = {
  HISTORY: 'signalcheck_history',
  BEST_RESULTS: 'signalcheck_best_results'
};

function cloneState(stateObj) {
  return JSON.parse(JSON.stringify(stateObj || {}));
}

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getIsoTimestamp() {
  return new Date().toISOString();
}

function setSpinner(visible) {
  if (!spinner) return;
  spinner.style.display = visible ? 'flex' : 'none';
}

function setSessionStatus(message) {
  if (!sessionStatusEl) return;
  sessionStatusEl.textContent = message || 'Awaiting scenario load.';
}

function addFeedEntry(message, type = 'info') {
  incidentFeed.unshift({
    timestamp: getTimestamp(),
    message,
    type
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderIncidentFeed() {
  return `
    <div class="feed-panel">
      <p><strong>Active Incident Feed</strong></p>
      <div class="feed-list">
        ${incidentFeed.length ? incidentFeed.map(entry => `
          <div class="feed-item feed-${escapeHtml(entry.type)}">
            <span class="feed-time">${escapeHtml(entry.timestamp)}</span>
            <span class="feed-message">${escapeHtml(entry.message)}</span>
          </div>
        `).join('') : '<div class="feed-empty">No incident activity yet.</div>'}
      </div>
    </div>
  `;
}

function clearTimer() {
  if (currentTimerInterval) {
    clearInterval(currentTimerInterval);
    currentTimerInterval = null;
  }

  if (timerEl) {
    timerEl.textContent = '';
  }
}

function clampMetric(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function syncScenarioStateFromEngine() {
  if (scoringEngine) {
    scenarioState = cloneState(scoringEngine.getState());
  }
}

function applyStateChanges(changes) {
  if (scoringEngine) {
    Object.entries(changes || {}).forEach(([key, delta]) => {
      const currentValue = Number(scoringEngine.currentState[key] || 0);
      scoringEngine.currentState[key] = clampMetric(currentValue + Number(delta || 0));
    });
    syncScenarioStateFromEngine();
    return;
  }

  Object.entries(changes || {}).forEach(([key, delta]) => {
    const currentValue = Number(scenarioState[key] || 0);
    scenarioState[key] = clampMetric(currentValue + Number(delta || 0));
  });
}

function resetSession() {
  score = 0;
  maxScore = 0;
  results = [];
  styleCounts = {};
  currentScenario = null;
  scenarioSteps = {};
  scenarioState = {};
  currentCaseData = null;
  currentStepData = null;
  currentStepId = null;
  stepCount = 0;
  isSubmitting = false;
  scoringEngine = null;

  scenarioInjects = [];
  pendingInject = null;
  firedInjectIds = new Set();

  incidentFeed = [];
  lastRenderedPhaseIndex = null;

  clearTimer();
  setSessionStatus('Awaiting scenario load.');
}

function showMessage(title, message, extra = '') {
  if (!caseContainer) return;

  caseContainer.innerHTML = `
    <div class="case">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      ${extra}
    </div>
  `;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function fetchJsonWithFallback(urls) {
  let lastError = null;

  for (const url of urls) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to fetch resource.');
}

function populateScenarioSelect(scenarios) {
  if (!scenarioSelect) return;

  if (!scenarios.length) {
    scenarioSelect.innerHTML = `<option value="">No scenarios available</option>`;
    return;
  }

  scenarioSelect.innerHTML = `
    <option value="">Select a scenario...</option>
    ${scenarios.map(file => `
      <option value="${escapeHtml(file)}">${escapeHtml(formatScenarioName(file))}</option>
    `).join('')}
  `;
}

function formatScenarioName(filename) {
  return filename
    .replace('.json', '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function showNoScenariosMessage() {
  setSessionStatus('No scenarios available.');
  showMessage(
    'No scenarios found',
    'Add one or more scenario JSON files to the app/scenario or app/scenarios folder and reload the app.'
  );
}

function getIncidentPhases() {
  return ['Detection', 'Investigation', 'Containment', 'Recovery'];
}

function getCurrentPhaseIndex() {
  const phases = getIncidentPhases();
  const totalSteps = Math.max(Object.keys(scenarioSteps).length, 1);

  if (stepCount <= 0) return 0;

  const normalized = Math.min(stepCount - 1, totalSteps - 1);
  const phaseIndex = Math.floor((normalized / totalSteps) * phases.length);

  return Math.min(phaseIndex, phases.length - 1);
}

function notePhaseTransition() {
  const phaseIndex = getCurrentPhaseIndex();
  const phases = getIncidentPhases();

  if (phaseIndex !== lastRenderedPhaseIndex) {
    lastRenderedPhaseIndex = phaseIndex;
    addFeedEntry(`Phase entered: ${phases[phaseIndex]}`, 'phase');
  }
}

function renderIncidentTimeline() {
  const phases = getIncidentPhases();
  const currentPhaseIndex = getCurrentPhaseIndex();

  return `
    <div class="timeline-panel">
      <p><strong>Incident Timeline</strong></p>
      <div class="timeline">
        ${phases.map((phase, index) => {
          let statusClass = 'upcoming';
          if (index < currentPhaseIndex) statusClass = 'complete';
          if (index === currentPhaseIndex) statusClass = 'current';

          return `
            <div class="timeline-step ${statusClass}">
              <div class="timeline-dot"></div>
              <div class="timeline-label">${escapeHtml(phase)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function formatStateLabel(key) {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function renderStatePanel() {
  const stateEntries = Object.entries(scenarioState);

  if (!stateEntries.length) {
    return '';
  }

  return `
    <div class="state-panel">
      <p><strong>Incident Status</strong></p>
      <ul class="state-list">
        ${stateEntries.map(([key, value]) => {
          const percent = clampPercent(value);
          const blocks = Math.round(percent / 10);
          const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);

          return `
            <li>
              <div class="state-row">
                <span class="state-label">${escapeHtml(formatStateLabel(key))}</span>
                <span class="state-bar">${bar}</span>
                <span class="state-percent">${percent}%</span>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    </div>
  `;
}

function renderFeedbackText(feedbackText) {
  if (Array.isArray(feedbackText)) {
    return feedbackText.map(line => `<div>${escapeHtml(line)}</div>`).join('');
  }

  return escapeHtml(feedbackText || 'No feedback.');
}

function validateScenario(scenario) {
  const errors = [];

  if (!scenario || typeof scenario !== 'object') {
    errors.push('Scenario payload is missing or invalid.');
    return errors;
  }

  if (!scenario.title) errors.push('Scenario missing title.');
  if (!scenario.briefing) errors.push('Scenario missing briefing.');
  if (!scenario.steps) errors.push('Scenario missing steps.');

  if (Array.isArray(scenario.steps)) {
    scenario.steps.forEach((step, index) => {
      if (!step.case_file) {
        errors.push(`Step ${index + 1} is missing case_file.`);
      }
    });
  } else if (typeof scenario.steps === 'object') {
    Object.entries(scenario.steps).forEach(([stepId, step]) => {
      if (!step?.case_file) {
        errors.push(`Step "${stepId}" is missing case_file.`);
      }
    });
  } else {
    errors.push('Scenario steps must be an array or object.');
  }

  return errors;
}

function getCaseInteractionType(data) {
  const rawType = data?.interaction_type || data?.type || 'timed';

  switch (rawType) {
    case 'checkbox':
      return 'checkbox';
    case 'text_input':
    case 'text':
      return 'text_input';
    case 'drag_drop':
    case 'dragdrop':
      return 'drag_drop';
    case 'radio':
    case 'timed':
    case 'codechoice':
    case 'choice':
    default:
      return 'timed';
  }
}

function validateCaseData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Case payload is missing or invalid.');
    return errors;
  }

  if (!data.title) errors.push('Case missing title.');
  if (!data.briefing) errors.push('Case missing briefing.');

  const interactionType = getCaseInteractionType(data);

  if (interactionType === 'checkbox') {
    if (!Array.isArray(data.options) || data.options.length === 0) {
      errors.push('Checkbox case missing options array.');
    }

    if (!Array.isArray(data.answer) || data.answer.length === 0) {
      errors.push('Checkbox case missing answer array.');
    }
  } else if (interactionType === 'text_input') {
    const hasStringAnswer = typeof data.answer === 'string' && data.answer.trim();
    const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;

    if (!hasStringAnswer && !hasKeywords) {
      errors.push('Text input case missing string answer or keywords array.');
    }
  } else if (interactionType === 'drag_drop') {
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errors.push('Drag and drop case missing items array.');
    }

    if (!Array.isArray(data.targets) || data.targets.length === 0) {
      errors.push('Drag and drop case missing targets array.');
    }

    if (!data.correct_mapping || typeof data.correct_mapping !== 'object') {
      errors.push('Drag and drop case missing correct_mapping object.');
    }
  } else {
    if (!Array.isArray(data.options) || data.options.length === 0) {
      errors.push('Choice case missing options array.');
    }

    if (typeof data.answer !== 'string' || !data.answer.trim()) {
      errors.push('Choice case missing string answer.');
    }
  }

  return errors;
}

function normalizeScenarioSteps(scenario) {
  if (Array.isArray(scenario.steps)) {
    const mappedSteps = {};

    scenario.steps.forEach((step, index) => {
      const stepId = step.id || `step_${index + 1}`;
      const nextLinearStep = scenario.steps[index + 1]?.id || null;

      mappedSteps[stepId] = {
        ...step,
        id: stepId,
        if_correct: {
          ...(step.if_correct || {}),
          next_step: step.if_correct?.next_step ?? nextLinearStep
        },
        if_incorrect: {
          ...(step.if_incorrect || {}),
          next_step: step.if_incorrect?.next_step ?? nextLinearStep
        }
      };
    });

    return mappedSteps;
  }

  const mappedSteps = {};

  Object.entries(scenario.steps || {}).forEach(([stepId, step]) => {
    mappedSteps[stepId] = {
      ...step,
      id: stepId,
      if_correct: {
        ...(step.if_correct || {})
      },
      if_incorrect: {
        ...(step.if_incorrect || {})
      }
    };
  });

  return mappedSteps;
}

function incrementStyle(style) {
  if (!style) return;

  if (Array.isArray(style)) {
    style.forEach(tag => {
      if (!tag) return;
      styleCounts[tag] = (styleCounts[tag] || 0) + 1;
    });
    return;
  }

  styleCounts[style] = (styleCounts[style] || 0) + 1;
}

function getStyleProfile() {
  return {
    cautious: styleCounts.cautious || 0,
    aggressive: styleCounts.aggressive || 0,
    thorough: styleCounts.thorough || 0,
    fast: styleCounts.fast || 0,
    governance: styleCounts.governance || 0,
    preventive: styleCounts.preventive || 0,
    analytical: styleCounts.analytical || 0,
    careless: styleCounts.careless || 0,
    careful: styleCounts.careful || 0
  };
}

function getDominantStyleLabel() {
  if (scoringEngine) {
    const playStyle = scoringEngine.getPlayStyle();
    return playStyle?.label || '🎯 Balanced';
  }

  const entries = Object.entries(getStyleProfile()).sort((a, b) => b[1] - a[1]);
  if (!entries.length || entries[0][1] === 0) return 'Balanced';
  return formatStateLabel(entries[0][0]);
}

function getPerformanceLabel(scoreValue, totalValue) {
  if (!totalValue) return 'Unrated';

  const pct = (scoreValue / totalValue) * 100;

  if (pct >= 90) return 'Excellent';
  if (pct >= 75) return 'Strong';
  if (pct >= 60) return 'Developing';
  return 'Needs Review';
}

function getScenarioThresholds() {
  return currentScenario?.success_thresholds || {};
}

function calculateOutcome() {
  const thresholds = getScenarioThresholds();

  const attacker = Number(scenarioState.attacker_advantage || 0);
  const impact = Number(scenarioState.operational_impact || 0);

  const attackerMax = Number(thresholds.attacker_advantage_max ?? 20);
  const impactMax = Number(thresholds.operational_impact_max ?? 20);

  const strongAttackerCutoff = Math.round(attackerMax * 0.5);
  const strongImpactCutoff = Math.round(impactMax * 0.5);

  if (attacker <= strongAttackerCutoff && impact <= strongImpactCutoff) {
    return 'Successful Containment';
  }

  if (attacker <= attackerMax && impact <= impactMax) {
    return 'Partial Containment';
  }

  return 'Incident Escalated';
}

function calculateOutcomeScore() {
  const thresholds = getScenarioThresholds();
  const stateEntries = Object.entries(scenarioState);

  if (!stateEntries.length) return 0;

  let total = 0;
  let count = 0;

  stateEntries.forEach(([key, value]) => {
    const numericValue = Number(value || 0);
    const thresholdKey = `${key}_max`;

    if (thresholds[thresholdKey] != null) {
      const maxAllowed = Number(thresholds[thresholdKey]);
      if (maxAllowed > 0) {
        const ratio = Math.max(0, 1 - (numericValue / maxAllowed));
        total += Math.max(0, Math.min(1, ratio)) * 100;
        count += 1;
      }
      return;
    }

    if (key.includes('confidence') || key.includes('clarity') || key.includes('progress')) {
      total += clampPercent(numericValue);
      count += 1;
      return;
    }

    if (key.includes('advantage') || key.includes('impact') || key.includes('risk')) {
      total += Math.max(0, 100 - clampPercent(numericValue));
      count += 1;
    }
  });

  return count ? Math.round(total / count) : 0;
}

function buildSessionResult() {
  syncScenarioStateFromEngine();

  const totalSteps = maxScore || stepCount || 0;
  const outcome = calculateOutcome();
  const outcomeScore = calculateOutcomeScore();

  const finalScore = scoringEngine ? scoringEngine.calculateScore() : score;
  const performance = scoringEngine
    ? scoringEngine.getPerformanceTier(finalScore).label
    : getPerformanceLabel(score, totalSteps);

  const dominantStyle = getDominantStyleLabel();

  return {
    scenarioId: currentScenario?.id || 'unknown_scenario',
    scenarioTitle: currentScenario?.title || 'Unknown Scenario',
    role: currentScenario?.role || 'Unknown Role',
    difficulty: currentScenario?.difficulty || 'unknown',
    completedAt: getIsoTimestamp(),
    score: finalScore,
    total: 400,
    correctAnswers: score,
    totalSteps,
    performance,
    outcome,
    outcomeScore,
    dominantStyle,
    styleProfile: getStyleProfile(),
    scenarioState: cloneState(scenarioState)
  };
}

function loadLocalData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Failed reading localStorage key "${key}":`, error);
    return fallback;
  }
}

function saveLocalData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed writing localStorage key "${key}":`, error);
  }
}

function saveSessionResult() {
  const sessionResult = buildSessionResult();

  const history = loadLocalData(STORAGE_KEYS.HISTORY, []);
  history.unshift(sessionResult);
  saveLocalData(STORAGE_KEYS.HISTORY, history.slice(0, 20));

  const bestResults = loadLocalData(STORAGE_KEYS.BEST_RESULTS, {});
  const existingBest = bestResults[sessionResult.scenarioId];

  const shouldReplace =
    !existingBest ||
    sessionResult.score > existingBest.score ||
    (
      sessionResult.score === existingBest.score &&
      sessionResult.outcomeScore > (existingBest.outcomeScore || 0)
    );

  if (shouldReplace) {
    bestResults[sessionResult.scenarioId] = sessionResult;
    saveLocalData(STORAGE_KEYS.BEST_RESULTS, bestResults);
  }

  return {
    sessionResult,
    history: history.slice(0, 5),
    bestResult: bestResults[sessionResult.scenarioId] || sessionResult
  };
}

function renderBestResult(bestResult) {
  if (!bestResult) {
    return '<p>No best result recorded yet.</p>';
  }

  return `
    <div class="state-panel">
      <p><strong>Best Result for This Scenario</strong></p>
      <ul class="state-list">
        <li><strong>Final Score:</strong> ${escapeHtml(bestResult.score)} / ${escapeHtml(bestResult.total)}</li>
        <li><strong>Correct Decisions:</strong> ${escapeHtml(bestResult.correctAnswers ?? 'n/a')} / ${escapeHtml(bestResult.totalSteps ?? 'n/a')}</li>
        <li><strong>Performance:</strong> ${escapeHtml(bestResult.performance)}</li>
        <li><strong>Outcome:</strong> ${escapeHtml(bestResult.outcome)}</li>
        <li><strong>Decision Style:</strong> ${escapeHtml(bestResult.dominantStyle)}</li>
      </ul>
    </div>
  `;
}

function renderRecentHistory(history) {
  if (!history?.length) {
    return '<p>No recent session history yet.</p>';
  }

  return `
    <div class="state-panel">
      <p><strong>Recent Sessions</strong></p>
      <ul class="state-list">
        ${history.map(item => `
          <li>
            <strong>${escapeHtml(item.scenarioTitle)}</strong><br>
            Final Score: ${escapeHtml(item.score)} / ${escapeHtml(item.total)} |
            Outcome: ${escapeHtml(item.outcome)} |
            Style: ${escapeHtml(item.dominantStyle)}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

async function fetchScenarios() {
  try {
    setSpinner(true);
    setSessionStatus('Loading scenario library...');

    const scenarios = await fetchJson('/api/scenarios');
    availableScenarios = Array.isArray(scenarios) ? scenarios : [];

    if (!availableScenarios.length) {
      populateScenarioSelect([]);
      showNoScenariosMessage();
      return;
    }

    populateScenarioSelect(availableScenarios);
    setSessionStatus(`Scenario library ready. ${availableScenarios.length} loaded.`);
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    populateScenarioSelect([]);
    setSessionStatus('Unable to load scenarios.');
    showMessage('Unable to load scenarios', error.message || 'An unexpected error occurred.');
  } finally {
    setSpinner(false);
  }
}

async function loadScenarioFile(filename) {
  try {
    setSpinner(true);
    resetSession();
    setSessionStatus(`Loading scenario: ${formatScenarioName(filename)}...`);

    const scenario = await fetchJsonWithFallback([
      `/scenario/${filename}`,
      `/scenarios/${filename}`
    ]);

    const validationErrors = validateScenario(scenario);
    if (validationErrors.length) {
      throw new Error(validationErrors.join(' '));
    }

    currentScenario = scenario;
    scenarioSteps = normalizeScenarioSteps(currentScenario);
    currentStepId = currentScenario.start_step || Object.keys(scenarioSteps)[0] || null;
    scenarioInjects = Array.isArray(currentScenario.injects) ? currentScenario.injects : [];
    scenarioState = cloneState(currentScenario.initial_state || {});
    maxScore = Object.keys(scenarioSteps).length;

    scoringEngine = createScoringEngine(currentScenario.initial_state || {});
    syncScenarioStateFromEngine();
    window.scoringEngine = scoringEngine;

    addFeedEntry(`Scenario loaded: ${currentScenario.title}`, 'system');
    addFeedEntry(`Role assigned: ${currentScenario.role || 'Analyst'}`, 'system');
    setSessionStatus(`Scenario loaded: ${currentScenario.title}`);

    showScenarioIntro();
  } catch (error) {
    console.error('Error loading scenario:', error);
    setSessionStatus('Unable to load scenario.');
    showMessage('Unable to load scenario', error.message || 'An unexpected error occurred.');
  } finally {
    setSpinner(false);
  }
}

async function loadRandomScenario() {
  if (!availableScenarios.length) {
    showNoScenariosMessage();
    return;
  }

  const chosenScenario = availableScenarios[Math.floor(Math.random() * availableScenarios.length)];

  if (scenarioSelect) {
    scenarioSelect.value = chosenScenario;
  }

  await loadScenarioFile(chosenScenario);
}

function showScenarioIntro() {
  if (!currentScenario || !caseContainer) return;

  notePhaseTransition();
  syncScenarioStateFromEngine();
  setSessionStatus(`Ready to begin: ${currentScenario.title}`);

  caseContainer.innerHTML = `
    <div class="case">
      <h2>${escapeHtml(currentScenario.title)}</h2>
      <p><strong>Role:</strong> ${escapeHtml(currentScenario.role || 'Analyst')}</p>
      <p><strong>Difficulty:</strong> ${escapeHtml(currentScenario.difficulty || 'n/a')}</p>
      <p>${escapeHtml(currentScenario.briefing || '')}</p>
      ${renderIncidentTimeline()}
      ${renderStatePanel()}
      ${renderIncidentFeed()}
      <button id="startScenarioBtn">Start Incident</button>
    </div>
  `;

  const startBtn = document.getElementById('startScenarioBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      addFeedEntry('Incident response initiated.', 'system');
      setSessionStatus(`Incident in progress: ${currentScenario.title}`);
      loadNextCase();
    });
  }
}

function getTriggeredInject(stepId, outcomeType) {
  const inject = scenarioInjects.find(item => {
    if (!item || !item.id || firedInjectIds.has(item.id)) return false;
    if (item.trigger_after_step !== stepId) return false;

    const triggerOn = item.trigger_on || 'any';
    return triggerOn === 'any' || triggerOn === outcomeType;
  });

  if (!inject) {
    return null;
  }

  firedInjectIds.add(inject.id);
  applyStateChanges(inject.state_changes || {});
  addFeedEntry(`Incident update: ${inject.title || 'New Development'}`, 'inject');

  return inject;
}

function renderInject(inject) {
  if (!caseContainer) return;

  syncScenarioStateFromEngine();
  setSessionStatus(`Inject received: ${inject.title || 'New Development'}`);

  caseContainer.innerHTML = `
    <div class="case">
      <p><strong>Scenario:</strong> ${escapeHtml(currentScenario.title)}</p>
      ${renderIncidentTimeline()}
      ${renderStatePanel()}
      ${renderIncidentFeed()}
      <div class="consequence-block">
        <p><strong>⚠ Incident Update: ${escapeHtml(inject.title || 'New Development')}</strong></p>
        <p>${escapeHtml(inject.message || 'A new development has changed the incident context.')}</p>
      </div>
      <button id="continueAfterInjectBtn">Continue</button>
    </div>
  `;

  const continueBtn = document.getElementById('continueAfterInjectBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      pendingInject = null;
      setSessionStatus(`Incident in progress: ${currentScenario.title}`);
      loadNextCase();
    });
  }
}

async function loadNextCase() {
  try {
    if (pendingInject) {
      renderInject(pendingInject);
      return;
    }

    if (!currentStepId) {
      showSummary();
      return;
    }

    const step = scenarioSteps[currentStepId];
    currentStepData = step;

    if (!step) {
      showSummary();
      return;
    }

    setSpinner(true);

    const data = await fetchJson(`/cases/${step.case_file}`);
    const validationErrors = validateCaseData(data);

    if (validationErrors.length) {
      throw new Error(validationErrors.join(' '));
    }

    currentCaseData = data;
    stepCount += 1;
    notePhaseTransition();
    addFeedEntry(`Decision point loaded: ${data.title}`, 'step');
    setSessionStatus(`Step ${stepCount} of ${maxScore}: ${data.title}`);

    renderCase(data, step);
  } catch (error) {
    console.error('Error loading case:', error);
    setSessionStatus('Unable to load case.');
    showMessage('Unable to load case', error.message || 'An unexpected error occurred.');
  } finally {
    setSpinner(false);
  }
}

function buildDragDropContent(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const targets = Array.isArray(data.targets) ? data.targets : [];

  return `
    <p>${escapeHtml(data.instructions || 'Drag each item into the correct category.')}</p>

    <div class="dragdrop-wrapper">
      <div class="dragdrop-bank">
        <p><strong>Indicators</strong></p>
        <div id="dragItemBank" class="drag-item-bank drop-zone bank-zone" data-target="">
          ${items.map(item => `
            <div
              class="drag-item"
              draggable="true"
              data-item="${escapeHtml(item)}"
              id="drag-item-${escapeHtml(item).replace(/[^a-zA-Z0-9_-]/g, '_')}"
            >
              ${escapeHtml(item)}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="dragdrop-targets">
        ${targets.map(target => `
          <div class="drag-target-group">
            <p><strong>${escapeHtml(target)}</strong></p>
            <div class="drop-zone drag-target" data-target="${escapeHtml(target)}"></div>
          </div>
        `).join('')}
      </div>
    </div>

    <input type="hidden" id="dragDropState" name="action" value="">
  `;
}

function buildFormContent(data) {
  const interactionType = getCaseInteractionType(data);

  switch (interactionType) {
    case 'checkbox':
      return data.options.map(opt => `
        <label>
          <input type="checkbox" name="action" value="${escapeHtml(opt)}"> ${escapeHtml(opt)}
        </label>
      `).join('');

    case 'text_input':
      return `<label>Enter your answer: <input type="text" name="action"></label>`;

    case 'drag_drop':
      return buildDragDropContent(data);

    case 'timed':
    default:
      return data.options.map(opt => `
        <label>
          <input type="radio" name="action" value="${escapeHtml(opt)}"> ${escapeHtml(opt)}
        </label>
      `).join('');
  }
}

function startTimerIfNeeded(data) {
  clearTimer();

  const interactionType = getCaseInteractionType(data);

  if (interactionType !== 'timed' || !data.time_limit || !timerEl) {
    return;
  }

  let timeLeft = Number(data.time_limit) || 0;
  timerEl.textContent = `⏳ Time Remaining: ${timeLeft}s`;

  currentTimerInterval = setInterval(() => {
    timeLeft -= 1;
    timerEl.textContent = `⏳ Time Remaining: ${timeLeft}s`;

    if (timeLeft <= 0) {
      clearTimer();
      addFeedEntry(`Timed response expired: ${data.title}`, 'warning');
      setSessionStatus(`Time expired on step ${stepCount}. Submitting response...`);

      const feedbackEl = document.querySelector('#feedback');
      if (feedbackEl && !feedbackEl.innerHTML.trim()) {
        const form = document.getElementById('responseForm');
        if (form) {
          form.dispatchEvent(new Event('submit'));
        }
      }
    }
  }, 1000);
}

function setupDragDrop(data) {
  const interactionType = getCaseInteractionType(data);
  if (interactionType !== 'drag_drop') return;

  const dragItems = Array.from(document.querySelectorAll('.drag-item'));
  const dropZones = Array.from(document.querySelectorAll('.drop-zone'));
  const stateInput = document.getElementById('dragDropState');

  function updateDragDropState() {
    const mapping = {};
    const activeItems = Array.from(document.querySelectorAll('.drag-item'));

    activeItems.forEach(itemEl => {
      const itemName = itemEl.dataset.item;
      const parentZone = itemEl.closest('.drop-zone');

      if (itemName && parentZone && parentZone.dataset.target) {
        mapping[itemName] = parentZone.dataset.target;
      }
    });

    if (stateInput) {
      stateInput.value = JSON.stringify(mapping);
    }
  }

  dragItems.forEach(item => {
    item.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', item.dataset.item || '');
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      updateDragDropState();
    });
  });

  dropZones.forEach(zone => {
    zone.addEventListener('dragover', event => {
      event.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', event => {
      event.preventDefault();
      zone.classList.remove('drag-over');

      const itemName = event.dataTransfer.getData('text/plain');
      if (!itemName) return;

      const draggedEl = document.querySelector(`.drag-item[data-item="${CSS.escape(itemName)}"]`);
      if (!draggedEl) return;

      zone.appendChild(draggedEl);
      updateDragDropState();
    });
  });

  updateDragDropState();
}

function getSelectedResponse(data) {
  const interactionType = getCaseInteractionType(data);

  if (interactionType === 'checkbox') {
    return Array.from(document.querySelectorAll('input[name="action"]:checked')).map(cb => cb.value);
  }

  if (interactionType === 'text_input') {
    return document.querySelector('input[name="action"]')?.value.trim() || '';
  }

  if (interactionType === 'drag_drop') {
    const raw = document.getElementById('dragDropState')?.value || '{}';

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('Unable to parse drag and drop state:', error);
      return {};
    }
  }

  return document.querySelector('input[name="action"]:checked')?.value;
}

function evaluateKeywordTextResponse(data, normalizedSelected) {
  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  const matchedKeywords = keywords.filter(keyword =>
    normalizedSelected.includes(String(keyword).toLowerCase())
  );

  const matchRatio = keywords.length ? matchedKeywords.length / keywords.length : 0;

  let correct = false;
  let feedbackText = 'No feedback.';
  let style = null;

  if (matchRatio >= 0.5) {
    correct = true;
    feedbackText = data.feedback?.success || 'Good response.';
  } else if (matchRatio > 0) {
    correct = false;
    feedbackText = data.feedback?.partial || 'Partially correct response.';
  } else {
    correct = false;
    feedbackText = data.feedback?.failure || 'Response did not include expected guidance.';
  }

  style = matchedKeywords.length
    ? matchedKeywords
        .map(keyword => data.style_tags?.[keyword])
        .filter(Boolean)
    : null;

  return { correct, feedbackText, style };
}

function evaluateDragDropResponse(data, selected) {
  const correctMapping = data.correct_mapping || {};
  const items = Array.isArray(data.items) ? data.items : [];

  const feedbackText = [];
  const styles = [];
  let allCorrect = true;

  items.forEach(item => {
    const expectedTarget = correctMapping[item];
    const actualTarget = selected?.[item];

    if (!actualTarget) {
      allCorrect = false;
      feedbackText.push(`${item}: Not placed in any category.`);
      return;
    }

    if (actualTarget !== expectedTarget) {
      allCorrect = false;
      feedbackText.push(`${item}: Incorrect placement. Expected ${expectedTarget}.`);
      return;
    }

    feedbackText.push(data.feedback?.[item] || `${item}: Correct.`);
    const tag = data.style_tags?.[item];
    if (tag) styles.push(tag);
  });

  return {
    correct: allCorrect,
    feedbackText,
    style: styles.length ? styles : null
  };
}

function evaluateResponse(data, selected) {
  let correct = false;
  let feedbackText = 'No feedback.';
  let style = null;
  const interactionType = getCaseInteractionType(data);

  if (interactionType === 'checkbox') {
    const normalizedSelected = Array.isArray(selected) ? [...selected].sort() : [];
    const normalizedAnswer = Array.isArray(data.answer) ? [...data.answer].sort() : [];

    correct = JSON.stringify(normalizedSelected) === JSON.stringify(normalizedAnswer);

    feedbackText = normalizedSelected.length
      ? normalizedSelected.map(opt => data.feedback?.[opt] || 'No feedback.')
      : ['No selection made.'];

    style = normalizedSelected.length
      ? normalizedSelected
          .map(opt => data.style_tags?.[opt])
          .filter(Boolean)
      : null;
  } else if (interactionType === 'text_input') {
    const normalizedSelected = String(selected || '').trim().toLowerCase();

    if (typeof data.answer === 'string' && data.answer.trim()) {
      const answer = String(data.answer).trim().toLowerCase();
      correct = normalizedSelected === answer;
      feedbackText = data.feedback?.[normalizedSelected] || data.feedback?.default || 'No feedback.';
      style = data.style_tags?.[normalizedSelected] || null;
    } else if (Array.isArray(data.keywords) && data.keywords.length) {
      return evaluateKeywordTextResponse(data, normalizedSelected);
    } else {
      correct = false;
      feedbackText = 'No feedback.';
      style = null;
    }
  } else if (interactionType === 'drag_drop') {
    return evaluateDragDropResponse(data, selected);
  } else {
    correct = selected === data.answer;
    feedbackText = data.feedback?.[selected] || 'No feedback.';
    style = data.style_tags?.[selected] || null;
  }

  return { correct, feedbackText, style };
}

function renderCase(data, step) {
  if (!caseContainer) return;

  clearTimer();
  isSubmitting = false;
  syncScenarioStateFromEngine();

  caseContainer.innerHTML = `
    <div class="case">
      <p><strong>Scenario:</strong> ${escapeHtml(currentScenario.title)}</p>
      <p><strong>Step:</strong> ${stepCount}</p>
      ${renderIncidentTimeline()}
      ${renderStatePanel()}
      ${renderIncidentFeed()}
      <h2>${escapeHtml(data.title)}</h2>
      <p><strong>Situation:</strong> ${escapeHtml(step.situation || data.briefing || '')}</p>
      <p>${escapeHtml(data.briefing || '')}</p>
      ${data.prompt ? `<p><strong>Prompt:</strong> ${escapeHtml(data.prompt)}</p>` : ''}
      <form id="responseForm">
        ${buildFormContent(data)}
        <br><button type="submit" id="submitResponseBtn">Submit</button>
      </form>
      <div id="feedback"></div>
    </div>
  `;

  setupDragDrop(data);
  startTimerIfNeeded(data);

  const form = document.getElementById('responseForm');
  const feedbackEl = document.getElementById('feedback');
  const submitBtn = document.getElementById('submitResponseBtn');

  if (!form || !feedbackEl) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (isSubmitting) return;
    isSubmitting = true;

    clearTimer();

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitted';
    }

    const selected = getSelectedResponse(data);
    const { correct, feedbackText, style } = evaluateResponse(data, selected);

    incrementStyle(style);

    if (correct) {
      score += 1;
    }

    const outcomeType = correct ? 'correct' : 'incorrect';
    const outcome = correct ? step.if_correct : step.if_incorrect;

    if (scoringEngine) {
      scoringEngine.applyDecision({
        stepId: step.id,
        stepTitle: data.title,
        correct,
        choiceId: '',
        choiceLabel: Array.isArray(selected)
          ? selected.join(', ')
          : (typeof selected === 'object' && selected !== null
            ? Object.entries(selected).map(([item, target]) => `${item} → ${target}`).join(' | ')
            : (selected || 'No answer')),
        stateChanges: outcome?.state_changes || {},
        tags: Array.isArray(style) ? style : (style ? [style] : []),
        outcomeText: outcome?.consequence || 'No consequence provided.'
      });
      syncScenarioStateFromEngine();
    } else {
      applyStateChanges(outcome?.state_changes || {});
    }

    const interactionType = getCaseInteractionType(data);
    let choiceLabel = 'No answer';

    if (interactionType === 'drag_drop') {
      choiceLabel = Object.keys(selected || {}).length
        ? Object.entries(selected).map(([item, target]) => `${item} → ${target}`).join(' | ')
        : 'No items placed';
    } else {
      choiceLabel = Array.isArray(selected)
        ? selected.join(', ')
        : (selected || 'No answer');
    }

    addFeedEntry(`Decision submitted: ${choiceLabel}`, 'decision');
    addFeedEntry(`Outcome: ${correct ? 'Correct response' : 'Incorrect response'}`, correct ? 'good' : 'warning');
    addFeedEntry(`Consequence recorded: ${outcome?.consequence || 'No consequence provided.'}`, 'consequence');
    setSessionStatus(
      correct
        ? `Step ${stepCount} resolved correctly. Review consequence and continue.`
        : `Step ${stepCount} resolved incorrectly. Review consequence and continue.`
    );

    results.push({
      case: data.title,
      step_id: currentStepId,
      step_number: stepCount,
      selected,
      correct,
      feedback: Array.isArray(feedbackText) ? feedbackText.join(' | ') : feedbackText,
      style,
      consequence: outcome?.consequence || 'No consequence provided.',
      next_step: outcome?.next_step || null
    });

    currentStepId = outcome?.next_step || null;
    pendingInject = getTriggeredInject(step.id, outcomeType);
    syncScenarioStateFromEngine();

    feedbackEl.innerHTML = `
      <div class="feedback-block">
        <p><strong>Assessment:</strong></p>
        ${renderFeedbackText(feedbackText)}
      </div>
      <div class="consequence-block">
        <p><strong>Operational Consequence:</strong><br>${escapeHtml(outcome?.consequence || 'No consequence provided.')}</p>
      </div>
      <button id="nextStepBtn">Next</button>
      ${renderIncidentTimeline()}
      ${renderStatePanel()}
      ${renderIncidentFeed()}
    `;

    feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const nextBtn = document.getElementById('nextStepBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', next);
    }
  });
}

function next() {
  clearTimer();
  setSessionStatus(`Advancing scenario${currentScenario?.title ? `: ${currentScenario.title}` : ''}...`);
  loadNextCase();
}

function showSummary() {
  addFeedEntry(`Scenario complete: ${currentScenario?.title || 'Unknown scenario'}`, 'system');

  if (!caseContainer) return;

  syncScenarioStateFromEngine();

  const saveResultData = saveSessionResult();
  const { sessionResult, history, bestResult } = saveResultData;

  const scoringSummary = scoringEngine
    ? {
        finalScore: scoringEngine.calculateScore(),
        performanceTier: scoringEngine.getPerformanceTier().label,
        playStyle: scoringEngine.getPlayStyle().label,
        scoreBreakdown: scoringEngine.getScoreBreakdown()
      }
    : null;

  setSessionStatus(`Scenario complete: ${currentScenario?.title || 'Unknown scenario'}`);

  const styleBreakdown = Object.entries(styleCounts)
    .map(([style, count]) => `<li>${escapeHtml(style)}: ${escapeHtml(count)}</li>`)
    .join('');

  const stateBreakdown = Object.entries(scenarioState)
    .map(([key, value]) => {
      const percent = clampPercent(value);
      const blocks = Math.round(percent / 10);
      const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);

      return `
        <li>
          <div class="state-row">
            <span class="state-label">${escapeHtml(formatStateLabel(key))}</span>
            <span class="state-bar">${bar}</span>
            <span class="state-percent">${percent}%</span>
          </div>
        </li>
      `;
    })
    .join('');

  caseContainer.innerHTML = `
    <div class="case">
      <h2>Incident Complete</h2>
      <p><strong>Scenario:</strong> ${escapeHtml(currentScenario?.title || 'n/a')}</p>
      <p><strong>Role:</strong> ${escapeHtml(currentScenario?.role || 'n/a')}</p>
      <p><strong>Difficulty:</strong> ${escapeHtml(currentScenario?.difficulty || 'n/a')}</p>

      <p><strong>Final Score:</strong> ${escapeHtml(sessionResult.score)} / ${escapeHtml(sessionResult.total)}</p>
      <p><strong>Correct Decisions:</strong> ${escapeHtml(sessionResult.correctAnswers)} / ${escapeHtml(sessionResult.totalSteps)}</p>
      <p><strong>Performance:</strong> ${escapeHtml(sessionResult.performance)}</p>
      <p><strong>Outcome:</strong> ${escapeHtml(sessionResult.outcome)}</p>
      <p><strong>Outcome Score:</strong> ${escapeHtml(sessionResult.outcomeScore)} / 100</p>
      <p><strong>Decision Style:</strong> ${escapeHtml(sessionResult.dominantStyle)}</p>

      ${renderIncidentTimeline()}

      <div class="state-panel">
        <p><strong>Incident State Summary</strong></p>
        <ul class="state-list">
          ${stateBreakdown || '<li>No state data available.</li>'}
        </ul>
      </div>

      ${scoringSummary ? `
        <div class="state-panel">
          <p><strong>Score Breakdown</strong></p>
          <ul class="state-list">
            <li>Attacker Advantage: ${escapeHtml(scoringSummary.scoreBreakdown.attacker_advantage.contribution)}</li>
            <li>User Confidence: ${escapeHtml(scoringSummary.scoreBreakdown.user_confidence.contribution)}</li>
            <li>Operational Impact: ${escapeHtml(scoringSummary.scoreBreakdown.operational_impact.contribution)}</li>
            <li>Investigation Clarity: ${escapeHtml(scoringSummary.scoreBreakdown.investigation_clarity.contribution)}</li>
          </ul>
        </div>
      ` : ''}

      ${renderBestResult(bestResult)}
      ${renderRecentHistory(history)}
      ${renderIncidentFeed()}

      <p><strong>Decision Style Breakdown:</strong></p>
      <ul>
        ${styleBreakdown || '<li>n/a</li>'}
      </ul>

      <hr>

      <p><strong>Step Review:</strong></p>
      <ul>
        ${results.map(r => `
          <li>
            <strong>Step ${escapeHtml(r.step_number)}: ${escapeHtml(r.case)}</strong><br>
            Your Choice: ${escapeHtml(
              typeof r.selected === 'object' && !Array.isArray(r.selected)
                ? Object.entries(r.selected || {}).map(([item, target]) => `${item} → ${target}`).join(' | ')
                : Array.isArray(r.selected)
                  ? r.selected.join(', ')
                  : (r.selected || 'No answer')
            )} ${r.correct ? '✅' : '❌'}<br>
            Style: ${escapeHtml(Array.isArray(r.style) ? r.style.join(', ') : (r.style || 'n/a'))}<br>
            Feedback: ${escapeHtml(r.feedback)}<br>
            Consequence: ${escapeHtml(r.consequence)}<br>
            Next Step: ${escapeHtml(r.next_step || 'End of scenario')}
          </li>
        `).join('')}
      </ul>

      <br><button id="exportAdocBtn">Export .adoc Summary</button>
    </div>
  `;

  const exportBtn = document.getElementById('exportAdocBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportAdoc);
  }
}

function exportAdoc() {
  const sessionResult = buildSessionResult();

  const payload = {
    scenario: {
      title: currentScenario?.title || null,
      id: currentScenario?.id || null,
      role: currentScenario?.role || null,
      difficulty: currentScenario?.difficulty || null
    },
    score: sessionResult.score,
    total: sessionResult.total,
    correctAnswers: sessionResult.correctAnswers,
    totalSteps: sessionResult.totalSteps,
    performance: sessionResult.performance,
    outcome: sessionResult.outcome,
    outcomeScore: sessionResult.outcomeScore,
    dominantStyle: sessionResult.dominantStyle,
    styleCounts,
    scenarioState,
    results,
    incidentFeed
  };

  fetch('/export/session.adoc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }
      return response.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signalcheck_session.adoc';
      a.click();
      window.URL.revokeObjectURL(url);
    })
    .catch(error => {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
    });
}

const toggleDarkBtn = document.getElementById('toggleDark');
if (toggleDarkBtn) {
  toggleDarkBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.body.classList.toggle('dark');
  });
}

const hamburger = document.getElementById('hamburger');
if (hamburger) {
  hamburger.addEventListener('click', () => {
    document.getElementById('navLinks')?.classList.toggle('show');
  });
}

if (loadScenarioBtn) {
  loadScenarioBtn.addEventListener('click', async () => {
    const selected = scenarioSelect?.value;
    if (!selected) {
      alert('Please select a scenario first.');
      return;
    }

    await loadScenarioFile(selected);
  });
}

if (randomScenarioBtn) {
  randomScenarioBtn.addEventListener('click', async () => {
    await loadRandomScenario();
  });
}

resetSession();
fetchScenarios();