import { validateDomainSpec } from "./domain-validation.js";
import type { DomainSpec } from "./domain-spec.js";
import { domainPresets, domainSpecFromPreset, type DomainPreset } from "./presets.js";

export type { DomainPreset } from "./presets.js";

export interface DomainPresetAlternative {
  presetId: string;
  score: number;
  matchedKeywords: string[];
}

export interface DomainPresetMatch {
  preset: DomainPreset;
  score: number;
  matchedKeywords: string[];
  ambiguous: boolean;
  alternatives: DomainPresetAlternative[];
}

export interface DomainInferenceResult {
  spec: DomainSpec;
  confidence: number;
  matchedPresetId: string;
  matchedKeywords: string[];
  warnings: string[];
  needsClarification: boolean;
  fallbackUsed: boolean;
}

export function inferDomainSpecResult(goal: string): DomainInferenceResult {
  const match = matchDomainPreset(goal, domainPresets);
  const spec = domainSpecFromPreset(match.preset, goal);
  const validation = validateDomainSpec(spec);
  const warnings: string[] = [];
  const fallbackUsed = match.preset.fallback === true;

  if (fallbackUsed) {
    warnings.push("No specific domain preset matched; using the fallback client request tracker.");
  }
  if (match.ambiguous) {
    warnings.push(`Domain inference matched multiple close presets: ${[match.preset.id, ...match.alternatives.slice(0, 2).map((alternative) => alternative.presetId)].join(", ")}.`);
  }
  if (!validation.ok) {
    warnings.push(...validation.failures.map((failure) => `DomainSpec validation: ${failure}`));
  }

  return {
    spec,
    confidence: fallbackUsed ? 0.35 : Math.min(0.95, 0.55 + match.matchedKeywords.length * 0.1 + (match.preset.priority ?? 0) * 0.02),
    matchedPresetId: match.preset.id,
    matchedKeywords: match.matchedKeywords,
    warnings,
    needsClarification: match.ambiguous,
    fallbackUsed
  };
}

export function inferDomainSpec(goal: string): DomainSpec {
  return inferDomainSpecResult(goal).spec;
}

export function matchDomainPreset(goal: string, presets: DomainPreset[]): DomainPresetMatch {
  const normalizedGoal = normalize(goal);
  const fallback = presets.find((preset) => preset.fallback) ?? presets[presets.length - 1];
  if (!fallback) {
    throw new Error("At least one domain preset is required.");
  }

  const scored = presets
    .filter((preset) => !preset.fallback)
    .map((preset) => {
      const matchedKeywords = preset.keywords.filter((keyword) => normalizedGoal.includes(normalize(keyword)));
      return {
        preset,
        score: matchedKeywords.length + (preset.priority ?? 0),
        matchedKeywords
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.preset.id.localeCompare(right.preset.id));

  if (scored.length === 0) {
    return {
      preset: fallback,
      score: 0,
      matchedKeywords: [],
      ambiguous: false,
      alternatives: []
    };
  }

  const [top, second] = scored;
  const ambiguous = Boolean(second && top.score - second.score <= 1);
  return {
    preset: top.preset,
    score: top.score,
    matchedKeywords: top.matchedKeywords,
    ambiguous,
    alternatives: scored.slice(1).map((candidate) => ({
      presetId: candidate.preset.id,
      score: candidate.score,
      matchedKeywords: candidate.matchedKeywords
    }))
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
