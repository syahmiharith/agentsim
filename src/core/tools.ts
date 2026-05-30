import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ArtifactType, CreateArtifactInput, RunCommandResult, ToolContext, ToolDefinition } from "../types.js";
import { FileArtifactStore } from "./artifacts.js";
import { safeJoin } from "./paths.js";

const execFileAsync = promisify(execFile);

export class ToolApprovalRequiredError extends Error {
  constructor(
    readonly toolName: string,
    readonly action: string
  ) {
    super(`Approval required for ${toolName}: ${action}`);
  }
}

export const readFileTool: ToolDefinition<{ path: string }, string> = {
  name: "read_file",
  description: "Read a UTF-8 file from the run workspace.",
  riskLevel: "safe",
  requiresApproval: false,
  async execute(input, context) {
    await emitToolCalled(context, "read_file", input.path);
    safeJoin(context.workspace.workspaceDir, input.path);
    return context.workspaceDriver.readFile(context.workspace, input.path);
  }
};

export const writeFileTool: ToolDefinition<{ path: string; content: string }, string> = {
  name: "write_file",
  description: "Write a UTF-8 file inside the run workspace.",
  riskLevel: "medium",
  requiresApproval: false,
  async execute(input, context) {
    await emitToolCalled(context, "write_file", input.path);
    safeJoin(context.workspace.workspaceDir, input.path);
    return context.workspaceDriver.writeFile(context.workspace, input.path, input.content);
  }
};

export const listFilesTool: ToolDefinition<{ path?: string }, string[]> = {
  name: "list_files",
  description: "List files inside the run workspace.",
  riskLevel: "safe",
  requiresApproval: false,
  async execute(input, context) {
    const path = input.path ?? ".";
    await emitToolCalled(context, "list_files", path);
    safeJoin(context.workspace.workspaceDir, path);
    return context.workspaceDriver.listFiles(context.workspace, path);
  }
};

export const createArtifactTool: ToolDefinition<CreateArtifactInput, { id: string; type: ArtifactType }> = {
  name: "create_artifact",
  description: "Create a markdown artifact through the artifact store.",
  riskLevel: "medium",
  requiresApproval: false,
  async execute(input, context) {
    await emitToolCalled(context, "create_artifact", input.finalPackagePath);
    const store = new FileArtifactStore(context.workspace);
    const artifact = await store.createMarkdown(input);
    return { id: artifact.id, type: artifact.type };
  }
};

export const runCommandTool: ToolDefinition<{ command: string; args?: string[] }, RunCommandResult> = {
  name: "run_command",
  description: "Run a local command in the workspace when explicitly allowed.",
  riskLevel: "dangerous",
  requiresApproval: true,
  async execute(input, context) {
    const action = [input.command, ...(input.args ?? [])].join(" ");
    await requireApproval(runCommandTool, action, context);
    await emitToolCalled(context, "run_command", action);
    if (context.modelMode === "mock" && !context.allowCommands) {
      throw new Error("run_command is disabled in mock mode unless allowCommands is true.");
    }
    if (!context.allowCommands) {
      throw new Error("run_command is disabled unless allowCommands is true.");
    }

    const result = await execFileAsync(input.command, input.args ?? [], { cwd: context.workspace.workspaceDir });
    return {
      command: action,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
};

export const askHumanTool: ToolDefinition<{ action: string; taskId?: string; requestedBy: string; notes?: string }, { approvalId: string }> = {
  name: "ask_human",
  description: "Request a human approval and pause execution.",
  riskLevel: "dangerous",
  requiresApproval: true,
  async execute(input, context) {
    await emitToolCalled(context, "ask_human", input.action);
    if (!context.requestApproval) {
      throw new ToolApprovalRequiredError("ask_human", input.action);
    }
    const approval = await context.requestApproval({
      taskId: input.taskId,
      requestedBy: input.requestedBy,
      action: input.action,
      riskLevel: "high",
      notes: input.notes ?? "Human decision requested."
    });
    throw new ToolApprovalRequiredError("ask_human", approval.id);
  }
};

export const defaultTools = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  createArtifactTool,
  runCommandTool,
  askHumanTool
] as const;

async function requireApproval<I, O>(tool: ToolDefinition<I, O>, action: string, context: ToolContext): Promise<void> {
  if (!tool.requiresApproval) {
    return;
  }
  if (context.hasApproval?.(action)) {
    return;
  }
  if (context.requestApproval) {
    await context.requestApproval({
      requestedBy: "tool-runtime",
      action,
      riskLevel: tool.riskLevel === "dangerous" ? "high" : "medium",
      notes: `Approval required before executing ${tool.name}.`
    });
  }
  throw new ToolApprovalRequiredError(tool.name, action);
}

async function emitToolCalled(context: ToolContext, name: string, action: string): Promise<void> {
  await context.eventStore?.append({
    level: "info",
    name: "tool.called",
    message: `Tool ${name} called.`,
    data: { toolName: name, action }
  });
}
