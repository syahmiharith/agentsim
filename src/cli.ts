#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadDotEnv } from "./config.js";
import { createModelProvider, type ProviderSelection } from "./providers/index.js";
import { startRunInspector } from "./tui/run-inspector.js";
import { runDemo } from "./workflow.js";

type CliCommand = "run" | "demo" | "tui";

interface CliOptions {
  command?: CliCommand | string;
  goal?: string;
  providerSelection: ProviderSelection;
  outputRoot: string;
  runId?: string;
}

export async function main(argv: string[]): Promise<void> {
  loadDotEnv();
  const options = parseArgs(argv);

  if (!isSupportedCommand(options.command)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (options.command === "tui") {
    await startRunInspector({
      outputRoot: resolve(options.outputRoot),
      runId: options.runId ?? options.goal
    });
    return;
  }

  if (!options.goal) {
    console.error("Missing goal. Example: agentsim run \"Build an inventory request system for a flower company\"");
    process.exitCode = 1;
    return;
  }

  const provider = createModelProvider(options.providerSelection);
  const result = await runDemo({
    goal: options.goal,
    outputRoot: resolve(options.outputRoot),
    runId: options.runId,
    modelProvider: provider
  });

  console.log(`Agentsim run completed.`);
  console.log(`Run ID: ${result.taskRun.id}`);
  console.log(`Model mode: ${result.taskRun.modelMode}`);
  console.log(`Final package: ${result.finalPackageDir}`);
}

export function parseArgs(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  const goalParts: string[] = [];
  let providerSelection: ProviderSelection = "auto";
  let outputRoot = "outputs";
  let runId: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--mock") {
      providerSelection = "mock";
      continue;
    }
    if (arg === "--live") {
      providerSelection = "live";
      continue;
    }
    if (arg === "--out-dir") {
      outputRoot = rest[index + 1] ?? outputRoot;
      index += 1;
      continue;
    }
    if (arg === "--run-id") {
      runId = rest[index + 1];
      index += 1;
      continue;
    }
    goalParts.push(arg);
  }

  return {
    command,
    goal: goalParts.join(" ").trim() || undefined,
    providerSelection,
    outputRoot,
    runId
  };
}

function isSupportedCommand(command: string | undefined): command is CliCommand {
  return command === "run" || command === "demo" || command === "tui";
}

function printUsage(): void {
  console.error(`Usage:
  agentsim run "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
  agentsim tui [runId] [--out-dir outputs]
  pnpm agentsim run "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
  pnpm agentsim tui [runId] [--out-dir outputs]
  pnpm demo "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
