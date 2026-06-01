import { createServer, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { loadRunViewerModel, readFinalPackageFile } from "./load-run-viewer-model.js";
import { renderViewerHtml } from "./viewer-html.js";
import { viewerCss, viewerJs } from "./viewer-assets.js";

export interface ViewerServerHandle {
  url: string;
  port: number;
  close(): Promise<void>;
  closed: Promise<void>;
}

export async function startViewerServer(input: { runRoot: string; port?: number }): Promise<ViewerServerHandle> {
  const model = await loadRunViewerModel(input.runRoot);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }
      if (url.pathname === "/") {
        sendText(response, 200, renderViewerHtml(model.run.id), "text/html; charset=utf-8");
        return;
      }
      if (url.pathname === "/assets/viewer.css") {
        sendText(response, 200, viewerCss, "text/css; charset=utf-8");
        return;
      }
      if (url.pathname === "/assets/viewer.js") {
        sendText(response, 200, viewerJs, "text/javascript; charset=utf-8");
        return;
      }
      if (url.pathname === "/api/model") {
        sendJson(response, 200, model);
        return;
      }
      if (url.pathname === "/api/final-package-tree") {
        sendJson(response, 200, model.finalPackage.files);
        return;
      }
      if (url.pathname === "/api/file") {
        const path = url.searchParams.get("path") ?? "";
        sendJson(response, 200, await readFinalPackageFile(input.runRoot, path));
        return;
      }
      if (url.pathname === "/api/artifact") {
        const type = url.searchParams.get("type") ?? "";
        const artifact = model.artifacts.find((candidate) => candidate.type === type);
        if (!artifact?.previewPath) {
          sendJson(response, 200, { type, content: undefined });
          return;
        }
        sendJson(response, 200, await readFinalPackageFile(input.runRoot, artifact.previewPath));
        return;
      }
      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Viewer request failed" });
    }
  });

  const port = input.port ?? 4317;
  await listen(server, port);
  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  server.on("close", resolveClosed);
  return {
    url: `http://127.0.0.1:${resolvedPort}`,
    port: resolvedPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    closed,
  };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  sendText(response, status, `${JSON.stringify(body)}\n`, "application/json; charset=utf-8");
}
