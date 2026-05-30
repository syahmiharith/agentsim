import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadDotEnv } from "./config.js";
import { createModelProvider, type ProviderSelection } from "./providers/index.js";
import { runDemo } from "./workflow.js";

interface CliOptions {
  command?: string;
  goal?: string;
  providerSelection: ProviderSelection;
  outputRoot: string;
  runId?: string;
}

async function main(argv: string[]): Promise<void> {
  loadDotEnv();
  const options = parseArgs(argv);

  if (options.command !== "demo") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!options.goal) {
    console.error("Missing goal. Example: pnpm demo \"Build an inventory request system for a flower company\"");
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

  console.log(`Agentsim demo completed.`);
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

function printUsage(): void {
  console.error(`Usage:
  pnpm demo "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
