import { createHash } from "node:crypto";

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function shortHash(content: string): string {
  return sha256(content).slice(0, 12);
}

