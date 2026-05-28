const DEFAULT_STATE = {
  attacker_advantage: 0,
  user_confidence: 50,
  operational_impact: 0,
  investigation_clarity: 50
};

const DEFAULT_CONFIG = {
  minMetric: 0,
  maxMetric: 100,
  weights: {
    attacker_advantage: 1,
    user_confidence: 1,
    operational_impact: 1,
    investigation_clarity: 1
  },
  tiers: [
    { name: "Expert", minScore: 320, label: "🟢 Expert" },
    { name: "Competent", minScore: 240, label: "🟡 Competent" },
    { name: "At Risk", minScore: 0, label: "🔴 At Risk" }
  ]
};

function clamp(value, min, max) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? fallback : numeric;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export class SignalCheckScoringEngine {
  constructor(initialState = {}, config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_CONFIG.weights,
        ...(config.weights || {})
      },
      tiers: Array.isArray(config.tiers) && config.tiers.length
        ? [...config.tiers].sort((a, b) => b.minScore - a.minScore)
        : [...DEFAULT_CONFIG.tiers]
    };

    this.initialState = this.#normalizeState({
      ...DEFAULT_STATE,
      ...initialState
    });

    this.currentState = deepClone(this.initialState);
    this.decisionLog = [];
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
  }

  reset(newInitialState = null) {
    if (newInitialState) {
      this.initialState = this.#normalizeState({
        ...DEFAULT_STATE,
        ...newInitialState
      });
    }

    this.currentState = deepClone(this.initialState);
    this.decisionLog = [];
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
  }

  getState() {
    return deepClone(this.currentState);
  }

  getInitialState() {
    return deepClone(this.initialState);
  }

  getDecisionLog() {
    return deepClone(this.decisionLog);
  }

  applyDecision({
    stepId,
    stepTitle = "",
    correct = false,
    choiceId = "",
    choiceLabel = "",
    stateChanges = {},
    tags = [],
    outcomeText = ""
  }) {
    if (!stepId) {
      throw new Error("applyDecision requires a stepId.");
    }

    const beforeState = this.getState();
    const normalizedChanges = this.#normalizeStateChanges(stateChanges);

    Object.entries(normalizedChanges).forEach(([metric, delta]) => {
      const currentValue = safeNumber(this.currentState[metric], 0);
      this.currentState[metric] = clamp(
        currentValue + safeNumber(delta, 0),
        this.config.minMetric,
        this.config.maxMetric
      );
    });

    const afterState = this.getState();
    const decisionType = this.#classifyDecisionType(normalizedChanges, Boolean(correct));

    const entry = {
      timestamp: new Date().toISOString(),
      stepId,
      stepTitle,
      correct: Boolean(correct),
      choiceId,
      choiceLabel,
      tags: Array.isArray(tags) ? tags : [],
      outcomeText,
      decisionType,
      stateChanges: normalizedChanges,
      beforeState,
      afterState
    };

    this.decisionLog.push(entry);
    return entry;
  }

  calculateScore() {
    const s = this.currentState;
    const w = this.config.weights;
    const max = this.config.maxMetric;

    const attackerComponent =
      (max - safeNumber(s.attacker_advantage)) * safeNumber(w.attacker_advantage, 1);

    const confidenceComponent =
      safeNumber(s.user_confidence) * safeNumber(w.user_confidence, 1);

    const impactComponent =
      (max - safeNumber(s.operational_impact)) * safeNumber(w.operational_impact, 1);

    const clarityComponent =
      safeNumber(s.investigation_clarity) * safeNumber(w.investigation_clarity, 1);

    return Math.round(
      attackerComponent +
      confidenceComponent +
      impactComponent +
      clarityComponent
    );
  }

  getScoreBreakdown() {
    const s = this.currentState;
    const w = this.config.weights;
    const max = this.config.maxMetric;

    return {
      attacker_advantage: {
        current: safeNumber(s.attacker_advantage),
        contribution: Math.round(
          (max - safeNumber(s.attacker_advantage)) * safeNumber(w.attacker_advantage, 1)
        )
      },
      user_confidence: {
        current: safeNumber(s.user_confidence),
        contribution: Math.round(
          safeNumber(s.user_confidence) * safeNumber(w.user_confidence, 1)
        )
      },
      operational_impact: {
        current: safeNumber(s.operational_impact),
        contribution: Math.round(
          (max - safeNumber(s.operational_impact)) * safeNumber(w.operational_impact, 1)
        )
      },
      investigation_clarity: {
        current: safeNumber(s.investigation_clarity),
        contribution: Math.round(
          safeNumber(s.investigation_clarity) * safeNumber(w.investigation_clarity, 1)
        )
      }
    };
  }

  getPerformanceTier(score = null) {
    const finalScore = score ?? this.calculateScore();
    const tier = this.config.tiers.find(item => finalScore >= item.minScore)
      || this.config.tiers[this.config.tiers.length - 1];

    return {
      name: tier.name,
      label: tier.label,
      minScore: tier.minScore
    };
  }

  getPlayStyle() {
    const state = this.currentState;
    const log = this.decisionLog;

    const counts = {
      cautious: 0,
      aggressive: 0,
      investigative: 0,
      stabilizing: 0,
      misstep: 0,
      correct: 0,
      incorrect: 0
    };

    log.forEach(entry => {
      if (entry.correct) {
        counts.correct += 1;
      } else {
        counts.incorrect += 1;
      }

      if (Object.prototype.hasOwnProperty.call(counts, entry.decisionType)) {
        counts[entry.decisionType] += 1;
      }
    });

    const candidates = [
      {
        name: "Investigator",
        label: "🔍 Investigator",
        score: safeNumber(state.investigation_clarity) + counts.investigative * 8
      },
      {
        name: "Defender",
        label: "🛡️ Defender",
        score:
          (100 - safeNumber(state.operational_impact)) +
          (100 - safeNumber(state.attacker_advantage)) +
          counts.stabilizing * 8
      },
      {
        name: "Operator",
        label: "⚡ Operator",
        score: counts.aggressive * 12 + counts.correct * 4
      },
      {
        name: "Balanced",
        label: "🎯 Balanced",
        score:
          counts.correct * 6 +
          safeNumber(state.user_confidence) * 0.2 +
          safeNumber(state.investigation_clarity) * 0.2
      }
    ];

    candidates.sort((a, b) => b.score - a.score);

    return {
      primary: candidates[0].name,
      label: candidates[0].label,
      counts
    };
  }

  generateNarrativeSummary({ score = null, tier = null, playStyle = null } = {}) {
    const finalScore = score ?? this.calculateScore();
    const finalTier = tier ?? this.getPerformanceTier(finalScore);
    const finalPlayStyle = playStyle ?? this.getPlayStyle();
    const s = this.currentState;

    const attackStatus =
      s.attacker_advantage <= 25
        ? "The threat was contained early."
        : s.attacker_advantage <= 50
          ? "The threat remained active but manageable."
          : "The attacker retained significant momentum.";

    const impactStatus =
      s.operational_impact <= 25
        ? "Business disruption stayed minimal."
        : s.operational_impact <= 50
          ? "Operations experienced moderate disruption."
          : "Operational impact escalated substantially.";

    const clarityStatus =
      s.investigation_clarity >= 75
        ? "The investigation produced a clear operational picture."
        : s.investigation_clarity >= 50
          ? "The investigation produced partial clarity."
          : "The investigation remained fragmented and uncertain.";

    const confidenceStatus =
      s.user_confidence >= 75
        ? "Team confidence remained strong throughout the response."
        : s.user_confidence >= 50
          ? "Team confidence held at an acceptable level."
          : "Team confidence weakened during the response.";

    return [
      `${finalTier.label} performance with a final score of ${finalScore}.`,
      attackStatus,
      impactStatus,
      clarityStatus,
      confidenceStatus,
      `Play style: ${finalPlayStyle.label}.`
    ].join(" ");
  }

  finalizeScenario({ scenarioId = "", scenarioTitle = "" } = {}) {
    this.finishedAt = new Date().toISOString();

    const score = this.calculateScore();
    const performanceTier = this.getPerformanceTier(score);
    const playStyle = this.getPlayStyle();
    const summaryText = this.generateNarrativeSummary({
      score,
      tier: performanceTier,
      playStyle
    });

    return {
      scenarioId,
      scenarioTitle,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationSeconds: this.#getDurationSeconds(),
      finalState: this.getState(),
      score,
      scoreBreakdown: this.getScoreBreakdown(),
      performanceTier,
      playStyle,
      decisionCount: this.decisionLog.length,
      correctCount: this.decisionLog.filter(item => item.correct).length,
      incorrectCount: this.decisionLog.filter(item => !item.correct).length,
      summaryText,
      decisionLog: this.getDecisionLog()
    };
  }

  saveHighScore(storageKey = "signalcheck_high_score") {
    const score = this.calculateScore();

    try {
      const existing = Number(localStorage.getItem(storageKey) || 0);
      if (score > existing) {
        localStorage.setItem(storageKey, String(score));
        return {
          updated: true,
          previous: existing,
          current: score
        };
      }

      return {
        updated: false,
        previous: existing,
        current: existing
      };
    } catch (error) {
      console.warn("Unable to save high score:", error);
      return {
        updated: false,
        previous: null,
        current: score,
        error: error.message
      };
    }
  }

  getHighScore(storageKey = "signalcheck_high_score") {
    try {
      return Number(localStorage.getItem(storageKey) || 0);
    } catch (error) {
      console.warn("Unable to read high score:", error);
      return 0;
    }
  }

  exportSession() {
    return {
      config: deepClone(this.config),
      initialState: this.getInitialState(),
      currentState: this.getState(),
      decisionLog: this.getDecisionLog(),
      startedAt: this.startedAt,
      finishedAt: this.finishedAt
    };
  }

  importSession(sessionData = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(sessionData.config || {}),
      weights: {
        ...DEFAULT_CONFIG.weights,
        ...((sessionData.config && sessionData.config.weights) || {})
      },
      tiers:
        sessionData.config &&
        Array.isArray(sessionData.config.tiers) &&
        sessionData.config.tiers.length
          ? [...sessionData.config.tiers].sort((a, b) => b.minScore - a.minScore)
          : [...DEFAULT_CONFIG.tiers]
    };

    this.initialState = this.#normalizeState(sessionData.initialState || DEFAULT_STATE);
    this.currentState = this.#normalizeState(sessionData.currentState || this.initialState);
    this.decisionLog = Array.isArray(sessionData.decisionLog)
      ? deepClone(sessionData.decisionLog)
      : [];
    this.startedAt = sessionData.startedAt || new Date().toISOString();
    this.finishedAt = sessionData.finishedAt || null;
  }

  #normalizeState(state) {
    return {
      attacker_advantage: clamp(
        safeNumber(state.attacker_advantage, DEFAULT_STATE.attacker_advantage),
        this.config.minMetric,
        this.config.maxMetric
      ),
      user_confidence: clamp(
        safeNumber(state.user_confidence, DEFAULT_STATE.user_confidence),
        this.config.minMetric,
        this.config.maxMetric
      ),
      operational_impact: clamp(
        safeNumber(state.operational_impact, DEFAULT_STATE.operational_impact),
        this.config.minMetric,
        this.config.maxMetric
      ),
      investigation_clarity: clamp(
        safeNumber(state.investigation_clarity, DEFAULT_STATE.investigation_clarity),
        this.config.minMetric,
        this.config.maxMetric
      )
    };
  }

  #normalizeStateChanges(changes) {
    const allowedKeys = [
      "attacker_advantage",
      "user_confidence",
      "operational_impact",
      "investigation_clarity"
    ];

    const normalized = {};

    allowedKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(changes || {}, key)) {
        normalized[key] = safeNumber(changes[key], 0);
      }
    });

    return normalized;
  }

  #classifyDecisionType(stateChanges, correct) {
    if (!correct) {
      return "misstep";
    }

    const clarity = safeNumber(stateChanges.investigation_clarity, 0);
    const confidence = safeNumber(stateChanges.user_confidence, 0);
    const attacker = safeNumber(stateChanges.attacker_advantage, 0);
    const impact = safeNumber(stateChanges.operational_impact, 0);

    if (clarity > 0) {
      return "investigative";
    }

    if (attacker < 0 || impact < 0) {
      return "stabilizing";
    }

    if (confidence > 0 && clarity === 0) {
      return "cautious";
    }

    if (attacker < 0 && confidence > 0) {
      return "aggressive";
    }

    return "correct";
  }

  #getDurationSeconds() {
    if (!this.startedAt || !this.finishedAt) {
      return null;
    }

    const start = new Date(this.startedAt).getTime();
    const end = new Date(this.finishedAt).getTime();

    if (Number.isNaN(start) || Number.isNaN(end)) {
      return null;
    }

    return Math.max(0, Math.round((end - start) / 1000));
  }
}

export function createScoringEngine(initialState = {}, config = {}) {
  return new SignalCheckScoringEngine(initialState, config);
}