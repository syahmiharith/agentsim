import { basename } from "node:path";
import type { Workspace, WorkspaceDriver } from "../types.js";

export async function writeGeneratedApp(workspace: Workspace, driver: WorkspaceDriver): Promise<void> {
  const files: Record<string, string> = {
    "app/package.json": appPackageJson(),
    "app/index.html": indexHtml(),
    "app/tsconfig.json": appTsconfig(),
    "app/vite.config.ts": viteConfig(),
    "app/server.js": serverJs(),
    "app/data/requests.json": `${JSON.stringify(seedRequests(), null, 2)}\n`,
    "app/src/main.tsx": mainTsx(),
    "app/src/App.tsx": appTsx(),
    "app/src/styles.css": stylesCss(),
    "app/README.md": appReadme(workspace.runId)
  };

  for (const [path, content] of Object.entries(files)) {
    await driver.writeFile(workspace, path, content);
  }
}

function appPackageJson(): string {
  return `${JSON.stringify(
    {
      name: "flower-inventory-requests",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        "dev:web": "vite --host 127.0.0.1",
        "dev:api": "node server.js",
        build: "tsc -b && vite build",
        preview: "vite preview --host 127.0.0.1"
      },
      dependencies: {
        react: "^19.1.0",
        "react-dom": "^19.1.0"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.5.0",
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        "typescript": "^5.8.0",
        "vite": "^6.3.0"
      }
    },
    null,
    2
  )}\n`;
}

function indexHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flower Inventory Requests</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function appTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx"
      },
      include: ["src"]
    },
    null,
    2
  )}\n`;
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
`;
}

function mainTsx(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;
}

function appTsx(): string {
  return `import { FormEvent, useEffect, useMemo, useState } from "react";

type Priority = "Low" | "Normal" | "High";
type Status = "Pending" | "Approved" | "Ordered" | "Fulfilled" | "Rejected";

interface InventoryRequest {
  id: string;
  itemName: string;
  quantity: number;
  requester: string;
  priority: Priority;
  status: Status;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const statuses: Status[] = ["Pending", "Approved", "Ordered", "Fulfilled", "Rejected"];
const priorities: Priority[] = ["Low", "Normal", "High"];
const apiBase = "http://127.0.0.1:4178/api";

export default function App() {
  const [requests, setRequests] = useState<InventoryRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status | "All">("All");
  const [form, setForm] = useState({
    itemName: "",
    quantity: 1,
    requester: "",
    priority: "Normal" as Priority,
    notes: ""
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadRequests() {
    setIsLoading(true);
    const response = await fetch(\`\${apiBase}/requests\`);
    const data = await response.json();
    setRequests(data.requests);
    setIsLoading(false);
  }

  useEffect(() => {
    loadRequests().catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to load requests.");
      setIsLoading(false);
    });
  }, []);

  const visibleRequests = useMemo(() => {
    if (statusFilter === "All") return requests;
    return requests.filter((request) => request.status === statusFilter);
  }, [requests, statusFilter]);

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch(\`\${apiBase}/requests\`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Request could not be created.");
      return;
    }
    setForm({ itemName: "", quantity: 1, requester: "", priority: "Normal", notes: "" });
    await loadRequests();
  }

  async function updateStatus(id: string, status: Status) {
    setError("");
    const response = await fetch(\`\${apiBase}/requests/\${id}/status\`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Status could not be updated.");
      return;
    }
    await loadRequests();
  }

  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="overline">Flower Company Operations</p>
          <h1>Inventory Request Desk</h1>
          <p className="summary">
            Create replenishment requests, monitor the queue, and move each item through a simple fulfillment workflow.
          </p>
        </div>
        <div className="metric">
          <span>{requests.length}</span>
          <small>Total requests</small>
        </div>
      </section>

      <section className="layout">
        <form className="panel form-panel" onSubmit={createRequest}>
          <h2>New Request</h2>
          <label>
            Item name
            <input
              value={form.itemName}
              onChange={(event) => setForm({ ...form, itemName: event.target.value })}
              placeholder="e.g. White roses"
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
            />
          </label>
          <label>
            Requester
            <input
              value={form.requester}
              onChange={(event) => setForm({ ...form, requester: event.target.value })}
              placeholder="Team member"
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}
            >
              {priorities.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Optional supplier, event, or timing context"
            />
          </label>
          <button type="submit">Create request</button>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="panel queue-panel">
          <div className="queue-heading">
            <h2>Admin Queue</h2>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | "All")}>
              <option>All</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>

          {isLoading ? <p className="muted">Loading requests...</p> : null}
          {!isLoading && visibleRequests.length === 0 ? <p className="muted">No requests match this view.</p> : null}

          <div className="request-list">
            {visibleRequests.map((request) => (
              <article className="request-card" key={request.id}>
                <div>
                  <div className="request-title">
                    <h3>{request.itemName}</h3>
                    <span className={\`status status-\${request.status.toLowerCase()}\`}>{request.status}</span>
                  </div>
                  <p>
                    {request.quantity} requested by {request.requester} - {request.priority} priority
                  </p>
                  {request.notes ? <p className="notes">{request.notes}</p> : null}
                </div>
                <select value={request.status} onChange={(event) => updateStatus(request.id, event.target.value as Status)}>
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
`;
}

function stylesCss(): string {
  return `:root {
  color: #1b1b1f;
  background: #f6f4ef;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 40px 0;
}

.header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  margin-bottom: 28px;
}

.overline {
  color: #527853;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 10px;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  font-size: clamp(2rem, 5vw, 4.5rem);
  line-height: 0.96;
  max-width: 760px;
  margin-bottom: 18px;
}

.summary {
  max-width: 680px;
  color: #55524c;
  font-size: 1.08rem;
  line-height: 1.6;
  margin-bottom: 0;
}

.metric {
  background: #ffffff;
  border: 1px solid #ded9cf;
  border-radius: 8px;
  padding: 18px 22px;
  min-width: 150px;
  box-shadow: 0 10px 30px rgba(58, 48, 32, 0.08);
}

.metric span {
  display: block;
  font-size: 2.25rem;
  font-weight: 800;
}

.metric small {
  color: #68645d;
}

.layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
}

.panel {
  background: #ffffff;
  border: 1px solid #ded9cf;
  border-radius: 8px;
  padding: 22px;
  box-shadow: 0 10px 30px rgba(58, 48, 32, 0.07);
}

.form-panel {
  display: grid;
  gap: 14px;
  align-self: start;
}

label {
  display: grid;
  gap: 7px;
  color: #3d3a35;
  font-size: 0.92rem;
  font-weight: 700;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #cfc8bc;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fffdf8;
  color: #24221f;
}

textarea {
  min-height: 88px;
  resize: vertical;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 12px 14px;
  background: #527853;
  color: #ffffff;
  font-weight: 800;
  cursor: pointer;
}

button:hover {
  background: #416642;
}

.queue-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.queue-heading h2 {
  margin-bottom: 0;
}

.queue-heading select {
  max-width: 180px;
}

.request-list {
  display: grid;
  gap: 12px;
}

.request-card {
  display: grid;
  grid-template-columns: 1fr 170px;
  gap: 16px;
  align-items: start;
  border: 1px solid #e6e0d7;
  border-radius: 8px;
  padding: 16px;
  background: #fffdf8;
}

.request-title {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.request-title h3 {
  margin-bottom: 0;
}

.request-card p {
  color: #5a554d;
  margin: 8px 0 0;
}

.notes {
  font-style: italic;
}

.status {
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 0.75rem;
  font-weight: 800;
  background: #ece7db;
}

.status-approved,
.status-fulfilled {
  background: #d9ead8;
  color: #24562a;
}

.status-rejected {
  background: #f7d9d9;
  color: #7b2424;
}

.status-ordered {
  background: #dce7f7;
  color: #274d7a;
}

.muted {
  color: #746f67;
}

.error {
  color: #9f2f2f;
  font-weight: 700;
  margin-bottom: 0;
}

@media (max-width: 820px) {
  .header,
  .layout {
    grid-template-columns: 1fr;
    display: grid;
  }

  .request-card {
    grid-template-columns: 1fr;
  }
}
`;
}

function serverJs(): string {
  return `import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "data", "requests.json");
const statuses = new Set(["Pending", "Approved", "Ordered", "Fulfilled", "Rejected"]);

async function readRequests() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    return [];
  }
}

async function writeRequests(requests) {
  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(requests, null, 2), "utf8");
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1:4178");

    if (request.method === "OPTIONS") {
      send(response, 204, {});
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      send(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/requests") {
      send(response, 200, { requests: await readRequests() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/requests") {
      const body = await readJson(request);
      if (!body.itemName || !body.requester || Number(body.quantity) <= 0) {
        send(response, 400, { error: "Item name, requester, and positive quantity are required." });
        return;
      }

      const now = new Date().toISOString();
      const requests = await readRequests();
      requests.unshift({
        id: randomUUID(),
        itemName: String(body.itemName),
        quantity: Number(body.quantity),
        requester: String(body.requester),
        priority: ["Low", "Normal", "High"].includes(body.priority) ? body.priority : "Normal",
        status: "Pending",
        notes: String(body.notes ?? ""),
        createdAt: now,
        updatedAt: now
      });
      await writeRequests(requests);
      send(response, 201, { ok: true });
      return;
    }

    const statusMatch = url.pathname.match(/^\\/api\\/requests\\/([^/]+)\\/status$/);
    if (request.method === "PATCH" && statusMatch) {
      const body = await readJson(request);
      if (!statuses.has(body.status)) {
        send(response, 400, { error: "Unknown status." });
        return;
      }

      const requests = await readRequests();
      const requestToUpdate = requests.find((item) => item.id === statusMatch[1]);
      if (!requestToUpdate) {
        send(response, 404, { error: "Request not found." });
        return;
      }

      requestToUpdate.status = body.status;
      requestToUpdate.updatedAt = new Date().toISOString();
      await writeRequests(requests);
      send(response, 200, { ok: true });
      return;
    }

    send(response, 404, { error: "Not found." });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
});

server.listen(4178, "127.0.0.1", () => {
  console.log("Inventory request API running at http://127.0.0.1:4178");
});
`;
}

function appReadme(runId: string): string {
  return `# Flower Inventory Request App

Generated by Agentsim run \`${basename(runId)}\`.

## Run Locally

\`\`\`bash
pnpm install
pnpm dev:api
\`\`\`

In a second terminal:

\`\`\`bash
pnpm dev:web
\`\`\`

Open the Vite URL shown in the terminal, usually \`http://127.0.0.1:5173\`.

## Build

\`\`\`bash
pnpm build
\`\`\`

## Notes

- The API stores demo data in \`data/requests.json\`.
- Do not expose this app publicly without adding authentication and production persistence.
`;
}

function seedRequests() {
  const now = new Date().toISOString();
  return [
    {
      id: "seed-roses",
      itemName: "White roses",
      quantity: 48,
      requester: "Mina",
      priority: "High",
      status: "Pending",
      notes: "Needed for weekend wedding arrangements.",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "seed-ribbon",
      itemName: "Sage ribbon rolls",
      quantity: 12,
      requester: "Jon",
      priority: "Normal",
      status: "Approved",
      notes: "Low stock in wrapping station.",
      createdAt: now,
      updatedAt: now
    }
  ];
}
