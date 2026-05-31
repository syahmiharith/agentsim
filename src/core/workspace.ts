import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { RunCommandInput, RunCommandResult, Workspace, WorkspaceDriver } from "../types.js";
import { assertCommandAllowed, resolveCommandPolicy } from "./command-policy.js";
import { assertPathInside, safeJoin } from "./paths.js";
import { redactSecrets } from "./redact.js";

export class LocalFilesystemWorkspaceDriver implements WorkspaceDriver {
  private readonly createdRoots = new Set<string>();

  async create(runId: string, outputRoot: string): Promise<Workspace> {
    const rootDir = safeJoin(outputRoot, runId);
    const workspaceDir = join(rootDir, "workspace");
    const finalPackageDir = join(rootDir, "final-package");

    await mkdir(workspaceDir, { recursive: true });
    await mkdir(finalPackageDir, { recursive: true });

    this.createdRoots.add(assertPathInside(rootDir, rootDir, "workspace root"));
    return { runId, rootDir, workspaceDir, finalPackageDir };
  }

  async writeFile(workspace: Workspace, relativePath: string, content: string): Promise<string> {
    const absolutePath = safeJoin(workspace.workspaceDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    return absolutePath;
  }

  async readFile(workspace: Workspace, relativePath: string): Promise<string> {
    return readFile(safeJoin(workspace.workspaceDir, relativePath), "utf8");
  }

  async listFiles(workspace: Workspace, relativePath = "."): Promise<string[]> {
    const root = safeJoin(workspace.workspaceDir, relativePath);
    const files: string[] = [];

    async function walk(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
        } else {
          files.push(relative(workspace.workspaceDir, path));
        }
      }
    }

    await walk(root);
    return files.sort();
  }

  async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
    const source = this.assertInsideCreatedRun(sourceDir, "copy source");
    const target = this.assertInsideCreatedRun(targetDir, "copy target");
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true });
  }

  async runCommand(workspace: Workspace, input: RunCommandInput): Promise<RunCommandResult> {
    const cwd = resolveCommandCwd(workspace, input.cwd);
    const policy = input.commandPolicy ?? resolveCommandPolicy("strict");
    const validation = assertCommandAllowed(input, policy);
    if (!validation.ok) {
      const denied: RunCommandResult = {
        command: input.command,
        args: input.args ?? [],
        cwd,
        exitCode: 126,
        stdout: "",
        stderr: validation.failures.join("; "),
        durationMs: 0,
        timedOut: false,
        policyLevel: policy.level,
        deniedReason: validation.failures.join("; ")
      };
      await appendCommandResultTrace(workspace, denied);
      throw new Error(denied.deniedReason);
    }

    const timeoutMs = Math.min(input.timeoutMs ?? policy.maxTimeoutMs, policy.maxTimeoutMs);
    const maxOutputBytes = Math.min(input.maxOutputBytes ?? policy.maxOutputBytes, policy.maxOutputBytes);
    const startedAt = Date.now();

    const result = await new Promise<RunCommandResult>((resolveResult) => {
      execFile(input.command, input.args ?? [], {
        cwd,
        timeout: timeoutMs,
        maxBuffer: Math.max(maxOutputBytes * 8, 1024 * 1024),
        env: sanitizedCommandEnv()
      }, (error, stdout, stderr) => {
        const timedOut = Boolean(error && "killed" in error && error.killed);
        const exitCode = deriveCommandExitCode(error, timedOut);
        resolveResult({
          command: input.command,
          args: input.args ?? [],
          cwd,
          exitCode,
          stdout: capOutput(redactSecrets(stdout), maxOutputBytes),
          stderr: capOutput(redactSecrets(stderr), maxOutputBytes),
          durationMs: Date.now() - startedAt,
          timedOut,
          policyLevel: policy.level
        });
      });
    });

    await appendCommandResultTrace(workspace, result);
    if (result.exitCode !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}: ${input.command}`);
    }
    return result;
  }

  private assertInsideCreatedRun(path: string, label: string): string {
    for (const root of this.createdRoots) {
      try {
        return assertPathInside(root, path, label);
      } catch {
        // Try the next created run root.
      }
    }
    throw new Error(`${label} is not inside a known workspace root: ${path}`);
  }
}

function resolveCommandCwd(workspace: Workspace, cwd = "."): string {
  let rootCandidate: string;
  try {
    rootCandidate = cwd.startsWith("workspace/") || cwd.startsWith("final-package/")
      ? safeJoin(workspace.rootDir, cwd)
      : safeJoin(workspace.workspaceDir, cwd);
  } catch {
    throw new Error(`Command cwd must stay inside workspace or final package: ${cwd}`);
  }
  const resolved = resolve(rootCandidate);
  const workspaceDir = resolve(workspace.workspaceDir);
  const finalPackageDir = resolve(workspace.finalPackageDir);
  if (
    resolved !== workspaceDir &&
    !resolved.startsWith(workspaceDir + sep) &&
    resolved !== finalPackageDir &&
    !resolved.startsWith(finalPackageDir + sep)
  ) {
    throw new Error(`Command cwd must stay inside workspace or final package: ${cwd}`);
  }
  return resolved;
}

function deriveCommandExitCode(error: unknown, timedOut: boolean): number {
  if (!error) {
    return 0;
  }
  if (timedOut) {
    return 124;
  }
  if (typeof error === "object" && error && "code" in error && typeof error.code === "number") {
    return error.code;
  }
  return 1;
}

function sanitizedCommandEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "Path", "PATHEXT", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "ComSpec"];
  return Object.fromEntries(keep.flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : []));
}

function capOutput(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxBytes) {
    return value;
  }
  return `${buffer.subarray(0, maxBytes).toString("utf8")}\n[truncated]`;
}

async function appendCommandResultTrace(workspace: Workspace, result: RunCommandResult): Promise<void> {
  const record = {
    timestamp: new Date().toISOString(),
    command: result.command,
    args: result.args ?? [],
    cwd: result.cwd,
    exitCode: result.exitCode,
    stdoutPreview: result.stdout,
    stderrPreview: result.stderr,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    policyLevel: result.policyLevel,
    deniedReason: result.deniedReason
  };
  const statePath = safeJoin(workspace.rootDir, "state/command-results.jsonl");
  const tracePath = safeJoin(workspace.finalPackageDir, "trace/command-results.jsonl");
  await mkdir(dirname(statePath), { recursive: true });
  await mkdir(dirname(tracePath), { recursive: true });
  await appendFile(statePath, `${JSON.stringify(record)}\n`, "utf8");
  await appendFile(tracePath, `${JSON.stringify(record)}\n`, "utf8");
}
