#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { loadDotEnv } from "../config.js";
import { createModelProvider, type ProviderSelection } from "../providers/index.js";
import { runEvals } from "./eval-runner.js";

interface EvalCliFlags {
  mock?: boolean;
  live?: boolean;
  outDir: string;
  evalRunId?: string;
}

loadDotEnv();

const program = new Command();
program
  .name("agentsim-eval")
  .description("Run deterministic Agentsim software-freelance eval cases.")
  .option("--mock", "use deterministic mock model mode")
  .option("--live", "require configured live model mode")
  .option("--out-dir <dir>", "eval output root directory", "outputs/evals")
  .option("--eval-run-id <id>", "stable eval run id")
  .action(async (flags: EvalCliFlags) => {
    if (flags.mock && flags.live) {
      throw new Error("Choose only one provider mode: --mock or --live.");
    }

    const providerSelection: ProviderSelection = flags.live ? "live" : flags.mock ? "mock" : "mock";
    const report = await runEvals({
      outputRoot: resolve(flags.outDir),
      evalRunId: flags.evalRunId,
      modelProvider: createModelProvider(providerSelection)
    });

    console.log("Agentsim eval completed.");
    console.log(`Eval run ID: ${report.evalRunId}`);
    console.log(`Cases: ${report.cases.length}`);
    console.log(`Average workflow score: ${report.averageWorkflowScore.toFixed(1)}`);
    console.log(`Average baseline score: ${report.averageBaselineScore.toFixed(1)}`);
    console.log(`Report: ${report.reportPath}`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
