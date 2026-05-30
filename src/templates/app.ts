import { basename } from "node:path";
import type { DomainSpec } from "../domain/domain-spec.js";
import type { Workspace, WorkspaceDriver } from "../types.js";

export async function writeGeneratedApp(workspace: Workspace, driver: WorkspaceDriver, spec: DomainSpec): Promise<void> {
  const files: Record<string, string> = {
    "app/package.json": appPackageJson(spec),
    "app/index.html": indexHtml(spec),
    "app/tsconfig.json": appTsconfig(),
    "app/vite.config.ts": viteConfig(),
    "app/server.js": serverJs(spec),
    [`app/data/${spec.primaryEntity.slug}.json`]: `${JSON.stringify(seedRecords(spec), null, 2)}\n`,
    "app/src/main.tsx": mainTsx(),
    "app/src/App.tsx": appTsx(spec),
    "app/src/styles.css": stylesCss(),
    "app/README.md": appReadme(workspace.runId, spec)
  };

  for (const [path, content] of Object.entries(files)) {
    await driver.writeFile(workspace, path, content);
  }
}

function appPackageJson(spec: DomainSpec): string {
  return `${JSON.stringify(
    {
      name: spec.appSlug,
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
        typescript: "^5.8.0",
        vite: "^6.3.0"
      }
    },
    null,
    2
  )}\n`;
}

function indexHtml(spec: DomainSpec): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(spec.appName)}</title>
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

function appTsx(spec: DomainSpec): string {
  const config = {
    appName: spec.appName,
    domain: spec.domain,
    primaryEntityName: spec.primaryEntity.name,
    primaryEntityPluralName: spec.primaryEntity.pluralName,
    entitySlug: spec.primaryEntity.slug,
    collectionKey: spec.primaryEntity.slug,
    initialStatus: spec.workflowStatuses[0] ?? "Requested",
    fields: spec.primaryEntity.fields,
    statuses: spec.workflowStatuses,
    targetUsers: spec.targetUsers,
    screens: spec.screens,
    coreActions: spec.coreActions
  };

  return `import { FormEvent, useEffect, useMemo, useState } from "react";

type FieldType = "text" | "number" | "date" | "datetime" | "select" | "textarea";
type FormValue = string | number;

interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

interface AppConfig {
  appName: string;
  domain: string;
  primaryEntityName: string;
  primaryEntityPluralName: string;
  entitySlug: string;
  collectionKey: string;
  initialStatus: string;
  fields: FieldConfig[];
  statuses: string[];
  targetUsers: string[];
  screens: Array<{ name: string; purpose: string; actions: string[] }>;
  coreActions: string[];
}

interface RecordItem extends Record<string, FormValue> {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const appConfig: AppConfig = ${JSON.stringify(config, null, 2)};
const apiBase = "http://127.0.0.1:4178/api";

export default function App() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [form, setForm] = useState<Record<string, FormValue>>(createInitialForm());
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadRecords() {
    setIsLoading(true);
    const response = await fetch(\`\${apiBase}/\${appConfig.entitySlug}\`);
    const data = await response.json();
    setRecords(data[appConfig.collectionKey] ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    loadRecords().catch((err) => {
      setError(err instanceof Error ? err.message : \`Unable to load \${appConfig.primaryEntityPluralName.toLowerCase()}.\`);
      setIsLoading(false);
    });
  }, []);

  const visibleRecords = useMemo(() => {
    if (statusFilter === "All") return records;
    return records.filter((record) => record.status === statusFilter);
  }, [records, statusFilter]);

  async function createRecord(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch(\`\${apiBase}/\${appConfig.entitySlug}\`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? \`\${appConfig.primaryEntityName} could not be created.\`);
      return;
    }
    setForm(createInitialForm());
    await loadRecords();
  }

  async function updateStatus(id: string, status: string) {
    setError("");
    const response = await fetch(\`\${apiBase}/\${appConfig.entitySlug}/\${id}/status\`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Status could not be updated.");
      return;
    }
    await loadRecords();
  }

  const titleField = appConfig.fields[0];
  const detailFields = appConfig.fields.slice(1, 5);
  const createScreen = appConfig.screens[0]?.name ?? \`New \${appConfig.primaryEntityName}\`;
  const listScreen = appConfig.screens[1]?.name ?? \`\${appConfig.primaryEntityName} List\`;

  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="overline">{appConfig.domain}</p>
          <h1>{appConfig.appName}</h1>
          <p className="summary">
            Create, review, and update {appConfig.primaryEntityPluralName.toLowerCase()} through a focused local workflow for {appConfig.targetUsers.join(", ")}.
          </p>
        </div>
        <div className="metric">
          <span>{records.length}</span>
          <small>Total {appConfig.primaryEntityPluralName.toLowerCase()}</small>
        </div>
      </section>

      <section className="layout">
        <form className="panel form-panel" onSubmit={createRecord}>
          <h2>{createScreen}</h2>
          {appConfig.fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={form[field.name] ?? ""}
              onChange={(value) => setForm({ ...form, [field.name]: value })}
            />
          ))}
          <button type="submit">Create {appConfig.primaryEntityName.toLowerCase()}</button>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="panel queue-panel">
          <div className="queue-heading">
            <h2>{listScreen}</h2>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>All</option>
              {appConfig.statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>

          {isLoading ? <p className="muted">Loading {appConfig.primaryEntityPluralName.toLowerCase()}...</p> : null}
          {!isLoading && visibleRecords.length === 0 ? <p className="muted">No records match this view.</p> : null}

          <div className="record-list">
            {visibleRecords.map((record) => (
              <article className="record-card" key={record.id}>
                <div>
                  <div className="record-title">
                    <h3>{formatValue(record[titleField.name])}</h3>
                    <span className={\`status \${statusClass(record.status)}\`}>{record.status}</span>
                  </div>
                  <dl>
                    {detailFields.map((field) => (
                      <div key={field.name}>
                        <dt>{field.label}</dt>
                        <dd>{formatValue(record[field.name])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <select value={record.status} onChange={(event) => updateStatus(record.id, event.target.value)}>
                  {appConfig.statuses.map((status) => (
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

function FieldInput(props: { field: FieldConfig; value: FormValue; onChange: (value: FormValue) => void }) {
  const { field, value, onChange } = props;
  const inputType = field.type === "datetime" ? "datetime-local" : field.type;

  if (field.type === "textarea") {
    return (
      <label>
        {field.label}
        <textarea
          required={field.required}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.required ? field.label : "Optional context"}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        {field.label}
        <select required={field.required} value={String(value)} onChange={(event) => onChange(event.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label>
      {field.label}
      <input
        required={field.required}
        type={inputType}
        min={field.type === "number" ? "1" : undefined}
        value={String(value)}
        onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
        placeholder={field.label}
      />
    </label>
  );
}

function createInitialForm(): Record<string, FormValue> {
  return Object.fromEntries(appConfig.fields.map((field) => [field.name, defaultValue(field)]));
}

function defaultValue(field: FieldConfig): FormValue {
  if (field.type === "number") {
    return 1;
  }
  if (field.type === "select") {
    return field.options?.[0] ?? "";
  }
  return "";
}

function formatValue(value: FormValue | undefined): string {
  if (value === undefined || value === "") {
    return "Not set";
  }
  return String(value).replace("T", " ");
}

function statusClass(status: string): string {
  return \`status-\${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\`;
}
`;
}

function stylesCss(): string {
  return `:root {
  color: #1e2026;
  background: #f7f8fa;
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
  color: #0f766e;
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
  font-size: clamp(2rem, 5vw, 4.25rem);
  line-height: 0.98;
  max-width: 760px;
  margin-bottom: 18px;
}

.summary {
  max-width: 720px;
  color: #505866;
  font-size: 1.04rem;
  line-height: 1.6;
  margin-bottom: 0;
}

.metric {
  background: #ffffff;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  padding: 18px 22px;
  min-width: 160px;
  box-shadow: 0 10px 30px rgba(31, 41, 55, 0.08);
}

.metric span {
  display: block;
  font-size: 2.25rem;
  font-weight: 800;
}

.metric small {
  color: #667085;
}

.layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
}

.panel {
  background: #ffffff;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  padding: 22px;
  box-shadow: 0 10px 30px rgba(31, 41, 55, 0.07);
}

.form-panel {
  display: grid;
  gap: 14px;
  align-self: start;
}

label {
  display: grid;
  gap: 7px;
  color: #303846;
  font-size: 0.92rem;
  font-weight: 700;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #cbd3df;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fbfcfe;
  color: #1f2937;
}

textarea {
  min-height: 88px;
  resize: vertical;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 12px 14px;
  background: #0f766e;
  color: #ffffff;
  font-weight: 800;
  cursor: pointer;
}

button:hover {
  background: #115e59;
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
  max-width: 190px;
}

.record-list {
  display: grid;
  gap: 12px;
}

.record-card {
  display: grid;
  grid-template-columns: 1fr 170px;
  gap: 16px;
  align-items: start;
  border: 1px solid #e1e6ee;
  border-radius: 8px;
  padding: 16px;
  background: #fbfcfe;
}

.record-title {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.record-title h3 {
  margin-bottom: 0;
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  margin: 12px 0 0;
}

dt {
  color: #667085;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

dd {
  color: #303846;
  margin: 3px 0 0;
}

.status {
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 0.75rem;
  font-weight: 800;
  background: #e7edf4;
  color: #344054;
  white-space: nowrap;
}

.status-confirmed,
.status-approved,
.status-scheduled,
.status-completed,
.status-returned {
  background: #d9f7e7;
  color: #12613a;
}

.status-cancelled,
.status-rejected,
.status-overdue {
  background: #fee2e2;
  color: #991b1b;
}

.status-checked-in,
.status-checked-out,
.status-in-progress,
.status-seated {
  background: #dbeafe;
  color: #1e40af;
}

.muted {
  color: #667085;
}

.error {
  color: #b42318;
  font-weight: 700;
  margin-bottom: 0;
}

@media (max-width: 820px) {
  .header,
  .layout {
    grid-template-columns: 1fr;
    display: grid;
  }

  .record-card {
    grid-template-columns: 1fr;
  }

  dl {
    grid-template-columns: 1fr;
  }
}
`;
}

function serverJs(spec: DomainSpec): string {
  const config = {
    appName: spec.appName,
    entitySlug: spec.primaryEntity.slug,
    collectionKey: spec.primaryEntity.slug,
    primaryEntityName: spec.primaryEntity.name,
    initialStatus: spec.workflowStatuses[0] ?? "Requested",
    fields: spec.primaryEntity.fields,
    statuses: spec.workflowStatuses
  };

  return `import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = ${JSON.stringify(config, null, 2)};
const dataPath = join(__dirname, "data", config.entitySlug + ".json");
const statuses = new Set(config.statuses);

async function readRecords() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    return [];
  }
}

async function writeRecords(records) {
  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(records, null, 2), "utf8");
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

function validate(body) {
  for (const field of config.fields) {
    const value = body[field.name];
    if (field.required && (value === undefined || value === null || value === "")) {
      return field.label + " is required.";
    }
    if (field.type === "number" && Number(value) <= 0) {
      return field.label + " must be a positive number.";
    }
  }
  return undefined;
}

function normalizeRecord(body) {
  const record = {};
  for (const field of config.fields) {
    const value = body[field.name];
    record[field.name] = field.type === "number" ? Number(value) : String(value ?? "");
  }
  return record;
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

    if (request.method === "GET" && url.pathname === "/api/" + config.entitySlug) {
      send(response, 200, { [config.collectionKey]: await readRecords() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/" + config.entitySlug) {
      const body = await readJson(request);
      const validationError = validate(body);
      if (validationError) {
        send(response, 400, { error: validationError });
        return;
      }

      const now = new Date().toISOString();
      const records = await readRecords();
      records.unshift({
        id: randomUUID(),
        ...normalizeRecord(body),
        status: config.initialStatus,
        createdAt: now,
        updatedAt: now
      });
      await writeRecords(records);
      send(response, 201, { ok: true });
      return;
    }

    const statusMatch = url.pathname.match(new RegExp("^/api/" + config.entitySlug + "/([^/]+)/status$"));
    if (request.method === "PATCH" && statusMatch) {
      const body = await readJson(request);
      if (!statuses.has(body.status)) {
        send(response, 400, { error: "Unknown status." });
        return;
      }

      const records = await readRecords();
      const recordToUpdate = records.find((item) => item.id === statusMatch[1]);
      if (!recordToUpdate) {
        send(response, 404, { error: config.primaryEntityName + " not found." });
        return;
      }

      recordToUpdate.status = body.status;
      recordToUpdate.updatedAt = new Date().toISOString();
      await writeRecords(records);
      send(response, 200, { ok: true });
      return;
    }

    send(response, 404, { error: "Not found." });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
});

server.listen(4178, "127.0.0.1", () => {
  console.log(config.appName ? config.appName + " API running at http://127.0.0.1:4178" : "Agentsim generated API running at http://127.0.0.1:4178");
});
`;
}

function appReadme(runId: string, spec: DomainSpec): string {
  return `# ${spec.appName}

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

- The API stores demo data in \`data/${spec.primaryEntity.slug}.json\`.
- The local route is \`/api/${spec.primaryEntity.slug}\`.
- Do not expose this app publicly without adding authentication and production persistence.
`;
}

function seedRecords(spec: DomainSpec): Array<Record<string, string | number>> {
  const now = new Date().toISOString();
  return spec.seedRecords.map((record, index) => ({
    id: `seed-${index + 1}`,
    ...record,
    status: String(record.status ?? spec.workflowStatuses[0] ?? "Requested"),
    createdAt: now,
    updatedAt: now
  }));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
