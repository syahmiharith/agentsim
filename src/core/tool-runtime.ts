import type { Approval, ToolContext, ToolRuntime } from "../types.js";
import { askHumanTool, createArtifactTool, listFilesTool, readFileTool, runCommandTool, writeFileTool } from "./tools.js";

export function createToolRuntime(context: ToolContext): ToolRuntime {
  return {
    readFile(input) {
      return readFileTool.execute(input, context);
    },
    writeFile(input) {
      return writeFileTool.execute(input, context);
    },
    listFiles(input) {
      return listFilesTool.execute(input, context);
    },
    createArtifact(input) {
      return createArtifactTool.execute(input, context);
    },
    runCommand(input) {
      return runCommandTool.execute(input, context);
    },
    askHuman(input) {
      return askHumanTool.execute(input, context);
    }
  };
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
