import { afterEach, describe, expect, it } from "vitest";
import { startViewerServer, type ViewerServerHandle } from "../src/viewer/viewer-server.js";
import { createViewerRun } from "./viewer-fixture.js";

const handles: ViewerServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe("viewer server", () => {
  it("serves the model, assets, file previews, and artifact previews", async () => {
    const runRoot = await createViewerRun();
    const handle = await startViewerServer({ runRoot, port: 0 });
    handles.push(handle);

    const html = await text(`${handle.url}/`);
    expect(html).toContain("Agentsim Viewer");

    const model = await json(`${handle.url}/api/model`);
    expect(model.run.id).toBe("viewer-run");

    const tree = await json(`${handle.url}/api/final-package-tree`);
    expect(Array.isArray(tree)).toBe(true);

    const file = await json(`${handle.url}/api/file?path=${encodeURIComponent("client/project-summary.md")}`);
    expect(file.content).toContain("Viewer Desk summary");

    const artifact = await json(`${handle.url}/api/artifact?type=project-summary`);
    expect(artifact.content).toContain("Project Summary");
  });

  it("blocks path traversal through file endpoint", async () => {
    const runRoot = await createViewerRun();
    const handle = await startViewerServer({ runRoot, port: 0 });
    handles.push(handle);

    const response = await fetch(`${handle.url}/api/file?path=${encodeURIComponent("../state/run.json")}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Path escapes workspace") });
  });
});

async function text(url: string): Promise<string> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.text();
}

async function json(url: string): Promise<any> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.json();
}
