import { isAbsolute, relative, resolve, sep } from "node:path";

export function safeJoin(root: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Absolute paths are not allowed: ${relativePath}`);
  }

  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(resolvedRoot, relativePath);

  if (!isPathInside(resolvedRoot, resolvedTarget)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }

  return resolvedTarget;
}

export function assertPathInside(root: string, targetPath: string, label = "path"): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(targetPath);

  if (!isPathInside(resolvedRoot, resolvedTarget)) {
    throw new Error(`${label} escapes workspace: ${targetPath}`);
  }

  return resolvedTarget;
}

export function toSafeRelativePath(root: string, targetPath: string): string {
  const resolvedTarget = assertPathInside(root, targetPath);
  return relative(resolve(root), resolvedTarget).split(sep).join("/");
}

function isPathInside(root: string, targetPath: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(targetPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + sep);
}
