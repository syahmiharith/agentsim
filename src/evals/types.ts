export type EvalSuite = "smoke" | "domain" | "unseen-simple-apps";

export type EvalDifficulty = "smoke" | "easy" | "medium" | "hard";

export interface EvalPhraseExpectation {
  path: string;
  terms: string[];
}

export interface EvalCommandExpectation {
  command: string;
  cwd: string;
  timeoutMs: number;
  optional?: boolean;
}

export interface EvalCase {
  id: string;
  suite: EvalSuite;
  difficulty: EvalDifficulty;
  prompt: string;
  expected: {
    appName: string;
    appArchetype?: "crud-workflow" | "booking-lite" | "inventory-lite";
    primaryEntity: string;
    requiredFields: string[];
    requiredStatuses: string[];
    requiredArtifacts: string[];
    requiredPhrases: EvalPhraseExpectation[];
    forbiddenPhrases: EvalPhraseExpectation[];
    commands?: EvalCommandExpectation[];
  };
}

export type EvalMode = "mock" | "live";

export type EvalAdapter = "agentsim";

export type EvalFailureSeverity = "error" | "warn";

export interface EvalFailure {
  code: string;
  message: string;
  severity: EvalFailureSeverity;
  path?: string;
  expected?: unknown;
  actual?: unknown;
}

export type EvalFailureCategory =
  | "none"
  | "missing_app_file"
  | "missing_trace_file"
  | "validation"
  | "context"
  | "domain_mismatch"
  | "run_status"
  | "command"
  | "api_behavior"
  | "secret_redaction"
  | "runtime";

export interface EvalTiming {
  durationMs: number;
}

export interface ThroughputSummary {
  totalRuns: number;
  acceptedRuns: number;
  acceptanceRate: number;
  wallClockMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  qualityAdjustedPackagesPerHour: number;
  costPerAcceptedPackageUsd?: number;
  retries: number;
  failureCategories: Record<string, number>;
}
