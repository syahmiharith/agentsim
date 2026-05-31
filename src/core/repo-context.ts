import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { RepoContextSummary, RepoFileSummary } from "../types.js";

export interface ScanRepoContextOptions {
  maxFiles?: number;
  maxFileBytes?: number;
}

const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", "coverage", "outputs"]);
const secretFilePattern = /(^|[/\\])\.env(\.|$)|secret|credential|token|key/i;

export async function scanRepoContext(rootPath: string, options: ScanRepoContextOptions = {}): Promise<RepoContextSummary> {
  const root = resolve(rootPath);
  const maxFiles = options.maxFiles ?? 500;
  const maxFileBytes = options.maxFileBytes ?? 64_000;
  const files: RepoFileSummary[] = [];
  const warnings: string[] = [];
  let truncated = false;

  async function walk(directory: string): Promise<void> {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      warnings.push(`Could not read ${relative(root, directory) || "."}`);
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      const absolutePath = join(directory, entry.name);
      const repoRelativePath = normalizePath(relative(root, absolutePath));
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await walk(absolutePath);
        }
        continue;
      }
      if (!entry.isFile() || secretFilePattern.test(repoRelativePath)) {
        continue;
      }
      const info = await stat(absolutePath);
      if (info.size > maxFileBytes && isSourceLike(repoRelativePath)) {
        warnings.push(`Skipped large source-like file ${repoRelativePath}`);
        continue;
      }
      files.push({
        path: repoRelativePath,
        kind: inferFileKind(repoRelativePath),
        language: inferLanguage(repoRelativePath),
        sizeBytes: info.size
      });
    }
  }

  await walk(root);
  const packageJson = await readPackageJson(root);
  return {
    rootPath: root,
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    truncated,
    packageManagers: inferPackageManagers(files),
    frameworks: inferFrameworks(files, packageJson),
    languages: inferLanguages(files),
    importantFiles: files.sort(sortImportantFiles).slice(0, 120),
    warnings
  };
}

function inferPackageManagers(files: RepoFileSummary[]): string[] {
  const paths = new Set(files.map((file) => file.path));
  return [
    paths.has("pnpm-lock.yaml") ? "pnpm" : undefined,
    paths.has("package-lock.json") ? "npm" : undefined,
    paths.has("yarn.lock") ? "yarn" : undefined
  ].filter((value): value is string => Boolean(value));
}

function inferFrameworks(files: RepoFileSummary[], packageJson: Record<string, unknown> | undefined): string[] {
  const paths = new Set(files.map((file) => file.path));
  const dependencies = {
    ...readRecord(packageJson?.dependencies),
    ...readRecord(packageJson?.devDependencies)
  };
  const frameworks = new Set<string>();
  if ("vite" in dependencies || paths.has("vite.config.ts") || paths.has("vite.config.js")) {
    frameworks.add("Vite");
  }
  if ("react" in dependencies) {
    frameworks.add("React");
  }
  if ("next" in dependencies || paths.has("next.config.js") || paths.has("next.config.mjs")) {
    frameworks.add("Next.js");
  }
  if ("typescript" in dependencies || paths.has("tsconfig.json")) {
    frameworks.add("TypeScript");
  }
  if ("vitest" in dependencies || paths.has("vitest.config.ts")) {
    frameworks.add("Vitest");
  }
  return [...frameworks].sort();
}

function inferLanguages(files: RepoFileSummary[]): string[] {
  return [...new Set(files.map((file) => file.language).filter((value): value is string => Boolean(value)))].sort();
}

async function readPackageJson(root: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function inferFileKind(path: string): RepoFileSummary["kind"] {
  if (/package\.json$|lock\.yaml$|lock\.json$/i.test(path)) {
    return "manifest";
  }
  if (/config\.(js|mjs|cjs|ts)$|tsconfig\.json$|eslint|prettier/i.test(path)) {
    return "config";
  }
  if (/readme|docs\//i.test(path)) {
    return "doc";
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(path) || /^tests\//i.test(path)) {
    return "test";
  }
  if (isSourceLike(path)) {
    return "source";
  }
  return "other";
}

function inferLanguage(path: string): string | undefined {
  if (/\.tsx$/i.test(path)) return "TSX";
  if (/\.ts$/i.test(path)) return "TypeScript";
  if (/\.jsx$/i.test(path)) return "JSX";
  if (/\.js$/i.test(path) || /\.mjs$/i.test(path) || /\.cjs$/i.test(path)) return "JavaScript";
  if (/\.css$/i.test(path)) return "CSS";
  if (/\.md$/i.test(path)) return "Markdown";
  if (/\.json$/i.test(path)) return "JSON";
  return undefined;
}

function isSourceLike(path: string): boolean {
  return /\.(tsx?|jsx?|css|json|md)$/i.test(path);
}

function sortImportantFiles(left: RepoFileSummary, right: RepoFileSummary): number {
  const rank = (file: RepoFileSummary) => {
    if (file.path === "package.json" || file.path === "README.md") return 0;
    if (file.kind === "manifest") return 1;
    if (file.kind === "config") return 2;
    if (file.kind === "doc") return 3;
    if (file.kind === "source") return 4;
    if (file.kind === "test") return 5;
    return 6;
  };
  return rank(left) - rank(right) || left.path.localeCompare(right.path);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
