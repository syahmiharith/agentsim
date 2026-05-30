import type { Approval, ToolContext, ToolRuntime } from "../types.js";
import { askHumanTool, createArtifactTool, listFilesTool, readFileTool, runCommandTool, writeFileTool } from "./tools.js";

export function createToolRuntime(context: ToolContext): ToolRuntime {
  return {
    async readFile(input) {
      await assertToolAllowed(context, readFileTool.name);
      return readFileTool.execute(input, context);
    },
    async writeFile(input) {
      await assertToolAllowed(context, writeFileTool.name);
      return writeFileTool.execute(input, context);
    },
    async listFiles(input) {
      await assertToolAllowed(context, listFilesTool.name);
      return listFilesTool.execute(input, context);
    },
    async createArtifact(input) {
      await assertToolAllowed(context, createArtifactTool.name);
      return createArtifactTool.execute(input, context);
    },
    async runCommand(input) {
      await assertToolAllowed(context, runCommandTool.name);
      return runCommandTool.execute(input, context);
    },
    async askHuman(input) {
      await assertToolAllowed(context, askHumanTool.name);
      return askHumanTool.execute(input, context);
    }
  };
}

export async function assertToolAllowed(context: ToolContext, toolName: string): Promise<void> {
  const policy = context.contextPolicy ?? context.contextPackage?.policy;
  if (!policy) {
    return;
  }
  if (policy.allowedTools.includes(toolName)) {
    return;
  }
  await context.eventStore?.append({
    level: "warn",
    name: "tool.blocked_by_policy",
    message: `Tool ${toolName} blocked by context policy.`,
    data: {
      toolName,
      allowedTools: policy.allowedTools,
      contextPackageId: context.contextPackage?.id,
      taskId: context.contextPackage?.taskId,
      stepId: context.contextPackage?.stepId
    }
  });
  throw new Error(`Tool ${toolName} is not allowed by the active context policy.`);
}

export async function hasApprovedAction(action: string, approvalsRepo?: ToolContext["approvalsRepo"]): Promise<boolean> {
  if (!approvalsRepo) {
    return false;
  }
  const approvals = await approvalsRepo.listApprovalsByRun();
  return approvals.some((approval) => approval.action === action && approval.status === "approved");
}

export async function requestToolApproval(
  runId: string,
  approvalsRepo: NonNullable<ToolContext["approvalsRepo"]>,
  approval: Omit<Approval, "id" | "runId" | "requestedAt" | "createdAt" | "status" | "notes"> & { notes?: string }
): Promise<Approval> {
  return approvalsRepo.createApproval({
    ...approval,
    runId,
    notes: approval.notes ?? "Tool approval requested."
  });
}
