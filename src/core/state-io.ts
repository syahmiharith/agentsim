import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const runStateLocks = new Map<string, Promise<void>>();

export async function withRunStateLock<T>(runRoot: string, operation: () => Promise<T>): Promise<T> {
  const resolvedRunRoot = resolve(runRoot);
  const key = process.platform === "win32" ? resolvedRunRoot.toLowerCase() : resolvedRunRoot;
  const previous = runStateLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => {
    release = resolveRelease;
  });
  const next = previous.catch(() => undefined).then(() => current);
  runStateLocks.set(key, next);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (runStateLocks.get(key) === next) {
      runStateLocks.delete(key);
    }
  }
}

export async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(tempPath, "w");
  let shouldClose = true;
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    shouldClose = false;
    await rename(tempPath, path);
  } catch (error) {
    if (shouldClose) {
      await handle.close().catch(() => undefined);
    }
    await rm(tempPath, { force: true });
    throw error;
  }
}
