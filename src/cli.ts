#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { z } from "zod";
import { loadDotEnv } from "./config.js";
import { createModelProvider, type ProviderSelection } from "./providers/index.js";
import { startDashboard } from "./tui/run-inspector.js";
import { runDemo } from "./workflow.js";

type CliCommand = "run" | "demo" | "dashboard" | "tui";

interface CliOptions {
  command?: CliCommand | string;
  goal?: string;
  providerSelection: ProviderSelection;
  outputRoot: string;
  runId?: string;
}

const cliOptionsSchema = z.object({
  command: z.enum(["run", "demo", "dashboard", "tui"]).optional(),
  goal: z.string().trim().min(1).optional(),
  providerSelection: z.enum(["auto", "mock", "live"]),
  outputRoot: z.string().trim().min(1),
  runId: z.string().trim().min(1).optional()
});

export async function main(argv: string[]): Promise<void> {
  loadDotEnv();
  let options: CliOptions;

  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!isSupportedCommand(options.command)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (options.command === "dashboard" || options.command === "tui") {
    await startDashboard({
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
  let parsed: CliOptions = {
    providerSelection: "auto",
    outputRoot: "outputs"
  };

  const program = new Command();
  program
    .name("agentsim")
    .exitOverride()
    .allowExcessArguments(false)
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined
    });

  addRunCommand(program, "run", (options) => {
    parsed = options;
  });
  addRunCommand(program, "demo", (options) => {
    parsed = options;
  });
  addDashboardCommand(program, "dashboard", (options) => {
    parsed = options;
  });
  addDashboardCommand(program, "tui", (options) => {
    parsed = options;
  });

  program.parse(["node", "agentsim", ...argv], { from: "node" });
  return cliOptionsSchema.parse(parsed);
}

function isSupportedCommand(command: string | undefined): command is CliCommand {
  return command === "run" || command === "demo" || command === "dashboard" || command === "tui";
}

function addRunCommand(program: Command, name: "run" | "demo", onParse: (options: CliOptions) => void): void {
  program
    .command(name)
    .argument("[goal...]", "client software goal")
    .option("--mock", "use deterministic mock model mode")
    .option("--live", "require configured live model mode")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .option("--run-id <id>", "stable run id")
    .action((goalParts: string[], flags: { mock?: boolean; live?: boolean; outDir: string; runId?: string }) => {
      if (flags.mock && flags.live) {
        throw new Error("Choose only one provider mode: --mock or --live.");
      }
      onParse({
        command: name,
        goal: goalParts.join(" ").trim() || undefined,
        providerSelection: flags.live ? "live" : flags.mock ? "mock" : "auto",
        outputRoot: flags.outDir,
        runId: flags.runId
      });
    });
}

function addDashboardCommand(program: Command, name: "dashboard" | "tui", onParse: (options: CliOptions) => void): void {
  program
    .command(name)
    .argument("[runId]", "run id to inspect")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .action((runId: string | undefined, flags: { outDir: string }) => {
      onParse({
        command: name,
        goal: runId,
        providerSelection: "auto",
        outputRoot: flags.outDir
      });
    });
}

function printUsage(): void {
  console.error(`Usage:
  agentsim run "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
  agentsim dashboard [runId] [--out-dir outputs]
  agentsim tui [runId] [--out-dir outputs]
  pnpm agentsim run "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
  pnpm agentsim dashboard [runId] [--out-dir outputs]
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
