export const viewerCss = `
:root {
  color: #1f2733;
  background: #f5f6f8;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; }
button, input, select { font: inherit; }

.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 380px;
}

.sidebar {
  border-right: 1px solid #d9dee7;
  background: #ffffff;
  padding: 18px 14px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  font-weight: 800;
  margin: 0 0 18px;
}

.nav {
  display: grid;
  gap: 4px;
}

.nav button {
  border: 0;
  background: transparent;
  color: #455064;
  text-align: left;
  border-radius: 6px;
  padding: 9px 10px;
  cursor: pointer;
}

.nav button.active {
  background: #e7f2ee;
  color: #0f5f55;
  font-weight: 800;
}

.main {
  padding: 28px;
  min-width: 0;
}

.detail {
  border-left: 1px solid #d9dee7;
  background: #ffffff;
  padding: 22px;
  height: 100vh;
  overflow: auto;
  position: sticky;
  top: 0;
}

.page-title {
  margin: 0 0 6px;
  font-size: 1.75rem;
}

.muted {
  color: #667085;
}

.grid {
  display: grid;
  gap: 14px;
}

.stats {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  margin: 18px 0;
}

.card, .panel {
  background: #ffffff;
  border: 1px solid #d9dee7;
  border-radius: 8px;
  padding: 16px;
}

.stat span {
  display: block;
  font-size: 1.9rem;
  font-weight: 800;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: #ffffff;
  border: 1px solid #d9dee7;
  border-radius: 8px;
  overflow: hidden;
}

.table th, .table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e6e9ef;
  text-align: left;
  vertical-align: top;
  font-size: 0.9rem;
}

.table th {
  color: #475467;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid #d0d5dd;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #344054;
  background: #f8fafc;
}

.pill.failed, .pill.error {
  border-color: #fecaca;
  color: #991b1b;
  background: #fef2f2;
}

.pill.completed, .pill.passed, .pill.approved, .pill.true {
  border-color: #bbf7d0;
  color: #166534;
  background: #f0fdf4;
}

.list {
  display: grid;
  gap: 10px;
}

.row-button {
  width: 100%;
  border: 1px solid #d9dee7;
  background: #ffffff;
  border-radius: 8px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
}

.row-button:hover {
  border-color: #0f766e;
}

.file-tree {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.86rem;
}

.file-tree button {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 3px 0;
  color: #1f2733;
}

pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #111827;
  color: #f9fafb;
  border-radius: 8px;
  padding: 14px;
  max-height: 62vh;
  overflow: auto;
}

.markdown {
  line-height: 1.55;
}

.markdown h1, .markdown h2, .markdown h3 {
  margin: 1rem 0 0.4rem;
}

.markdown code {
  background: #eef2f7;
  padding: 1px 4px;
  border-radius: 4px;
}

@media (max-width: 1050px) {
  .shell {
    grid-template-columns: 180px minmax(0, 1fr);
  }
  .detail {
    grid-column: 1 / -1;
    height: auto;
    position: static;
    border-left: 0;
    border-top: 1px solid #d9dee7;
  }
}

@media (max-width: 760px) {
  .shell {
    display: block;
  }
  .sidebar {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid #d9dee7;
  }
  .nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .main {
    padding: 18px;
  }
}
`;

export const viewerJs = `
const navItems = ["Goal", "Progress", "Decisions", "Artifacts", "Review", "Trace", "Final Package"];
let model;
let selectedView = "Goal";

async function boot() {
  model = await fetchJson("/api/model");
  renderShell();
  render();
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function renderShell() {
  document.body.innerHTML = '<div class="shell"><aside class="sidebar"><p class="brand">Agentsim Viewer</p><nav class="nav"></nav></aside><main class="main"></main><aside class="detail"><h2>Details</h2><p class="muted">Select an artifact, file, check, or trace item.</p></aside></div>';
  const nav = document.querySelector(".nav");
  navItems.forEach((item) => {
    const button = document.createElement("button");
    button.textContent = item;
    button.onclick = () => { selectedView = item; render(); };
    nav.appendChild(button);
  });
}

function render() {
  document.querySelectorAll(".nav button").forEach((button) => button.classList.toggle("active", button.textContent === selectedView));
  const main = document.querySelector(".main");
  if (selectedView === "Goal") main.innerHTML = goalView();
  if (selectedView === "Progress") main.innerHTML = progressView();
  if (selectedView === "Decisions") main.innerHTML = decisionsView();
  if (selectedView === "Artifacts") main.innerHTML = artifactsView();
  if (selectedView === "Review") main.innerHTML = reviewView();
  if (selectedView === "Trace") main.innerHTML = traceView();
  if (selectedView === "Final Package") main.innerHTML = finalPackageView();
  attachHandlers();
}

function goalView() {
  const validation = model.run.validationSummary;
  return page("Goal", model.run.goal, [
    stats([
      ["Run", model.run.id],
      ["Status", model.run.status],
      ["Model", model.run.modelMode || "-"],
      ["Validation", validation ? String(validation.ok) : "not available"],
    ]),
    panel("Run", table([["Output", model.run.outputDir], ["Started", model.run.startedAt || "-"], ["Completed", model.run.completedAt || "-"]])),
    panel("App Understanding", table([
      ["App", model.goal.appName || "-"],
      ["Archetype", model.goal.archetype || "-"],
      ["Primary Entity", model.goal.primaryEntity || "-"],
      ["Target Users", listText(model.goal.targetUsers)],
      ["Deferred Features", listText(model.goal.deferredFeatures)],
      ["Unresolved Questions", listText(model.goal.unresolvedQuestions)],
    ])),
  ]);
}

function progressView() {
  return page("Progress", "Task state by artifact-producing role.", [
    stats([["Tasks", model.progress.taskCount], ["Completed", model.progress.completed], ["Failed", model.progress.failed], ["Waiting", model.progress.waitingForApproval]]),
    dataTable(["Task", "Status", "Owner", "Output", "Attempts", "Review", "Approval"], model.progress.tasks.map((task) => [
      task.title,
      pill(task.status),
      task.ownerAgentId,
      task.outputArtifactType || "-",
      String(task.attempts),
      task.reviewStatus || "-",
      task.approvalStatus || "-",
    ])),
  ]);
}

function decisionsView() {
  return page("Decisions", "Traceable choices made during the run.", [
    model.decisions.length ? '<div class="list">' + model.decisions.map((decision) => rowButton(decision.title, decision.selectedOption, "decision", decision.id)).join("") + '</div>' : empty("No decisions found."),
  ]);
}

function artifactsView() {
  const groups = groupBy(model.artifacts, (artifact) => artifact.category);
  return page("Artifacts", "Final package artifacts grouped by delivery area.", Object.entries(groups).map(([category, artifacts]) =>
    panel(category, '<div class="list">' + artifacts.map((artifact) => rowButton(artifact.type, artifact.finalPackagePath, "artifact", artifact.type)).join("") + '</div>')
  ));
}

function reviewView() {
  const checks = model.review.appValidation?.checks || [];
  return page("Review", "Validation and review evidence for trusting the package.", [
    panel("Review Files", '<div class="list">' + ["qaReport", "codeReview", "knownIssues", "appTestReport"].map((key) => {
      const file = model.review[key];
      return file ? rowButton(file.title, file.path, "markdown", key) : "";
    }).join("") + '</div>'),
    panel("Validation Matrix", checks.length ? dataTable(["Check", "Status", "Message"], checks.map((check) => [check.id, pill(check.status), check.message])) : empty("No app validation trace found.")),
  ]);
}

function traceView() {
  const traceItems = [
    ["Product Brief", "productBrief"],
    ["Domain Spec", "domainSpec"],
    ["App Spec", "appSpec"],
    ["App Validation", "appValidation"],
    ["Workflow Graph", "workflowGraph"],
    ["Tool Registry", "toolRegistry"],
  ];
  return page("Trace", "Structured trace previews without raw log overload.", [
    panel("Trace Files", '<div class="list">' + traceItems.map(([label, key]) => rowButton(label, model.trace[key] ? "available" : "not available", "trace", key)).join("") + '</div>'),
    panel("Events Preview", model.trace.eventsPreview.length ? dataTable(["Time", "Level", "Name", "Actor", "Message"], model.trace.eventsPreview.map((event) => [event.timestamp || "-", pill(event.level || "-"), event.name || "-", event.actor || "-", event.message || "-"])) : empty("No events preview available.")),
    panel("Command Results Preview", model.trace.commandResultsPreview.length ? dataTable(["Command", "Exit", "Policy", "Duration", "CWD"], model.trace.commandResultsPreview.map((item) => [[item.command, ...(item.args || [])].join(" "), String(item.exitCode ?? "-"), item.policyLevel || "-", String(item.durationMs ?? "-"), item.cwd || "-"])) : empty("No command result preview available.")),
  ]);
}

function finalPackageView() {
  return page("Final Package", "Read-only final-package file tree.", [
    panel("Files", renderFileTree(model.finalPackage.files)),
  ]);
}

function attachHandlers() {
  document.querySelectorAll("[data-kind]").forEach((button) => {
    button.onclick = async () => {
      const kind = button.dataset.kind;
      const id = button.dataset.id;
      if (kind === "artifact") return showArtifact(id);
      if (kind === "markdown") return showMarkdown(model.review[id]);
      if (kind === "trace") return showJson(id, model.trace[id]);
      if (kind === "decision") return showJson(id, model.decisions.find((decision) => decision.id === id));
      if (kind === "file") return showFile(id);
    };
  });
}

async function showArtifact(type) {
  const response = await fetchJson("/api/artifact?type=" + encodeURIComponent(type));
  if (response.content) {
    detail(response.path, markdown(response.content));
  } else {
    detail(type, '<p class="muted">Preview unavailable.</p>');
  }
}

function showMarkdown(file) {
  detail(file.title, markdown(file.content));
}

function showJson(title, value) {
  detail(title, value ? '<pre>' + escapeHtml(JSON.stringify(value, null, 2)) + '</pre>' : '<p class="muted">Not available for this run.</p>');
}

async function showFile(path) {
  const response = await fetchJson("/api/file?path=" + encodeURIComponent(path));
  const content = response.path.endsWith(".md") ? markdown(response.content) : '<pre>' + escapeHtml(response.content) + '</pre>';
  detail(response.path + " (" + response.size + " bytes)", content);
}

function detail(title, body) {
  document.querySelector(".detail").innerHTML = '<h2>' + escapeHtml(title) + '</h2>' + body;
}

function page(title, subtitle, sections) {
  return '<h1 class="page-title">' + escapeHtml(title) + '</h1><p class="muted">' + escapeHtml(subtitle || "") + '</p><div class="grid">' + sections.join("") + '</div>';
}

function stats(items) {
  return '<div class="grid stats">' + items.map(([label, value]) => '<div class="card stat"><small>' + escapeHtml(label) + '</small><span>' + escapeHtml(String(value)) + '</span></div>').join("") + '</div>';
}

function panel(title, body) {
  return '<section class="panel"><h2>' + escapeHtml(title) + '</h2>' + body + '</section>';
}

function table(rows) {
  return '<table class="table"><tbody>' + rows.map(([key, value]) => '<tr><th>' + escapeHtml(key) + '</th><td>' + escapeHtml(String(value)) + '</td></tr>').join("") + '</tbody></table>';
}

function dataTable(headers, rows) {
  return '<table class="table"><thead><tr>' + headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join("") + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + String(cell) + '</td>').join("") + '</tr>').join("") + '</tbody></table>';
}

function rowButton(title, subtitle, kind, id) {
  return '<button class="row-button" data-kind="' + escapeAttr(kind) + '" data-id="' + escapeAttr(id) + '"><strong>' + escapeHtml(String(title)) + '</strong><br><span class="muted">' + escapeHtml(String(subtitle || "")) + '</span></button>';
}

function renderFileTree(nodes) {
  return '<div class="file-tree">' + nodes.map((node) => {
    if (node.type === "directory") {
      return '<details open><summary>' + escapeHtml(node.name) + '</summary>' + renderFileTree(node.children || []) + '</details>';
    }
    return '<div><button data-kind="file" data-id="' + escapeAttr(node.path) + '">' + escapeHtml(node.name) + '</button> <span class="muted">' + (node.size || 0) + ' bytes</span></div>';
  }).join("") + '</div>';
}

function markdown(source) {
  const lines = escapeHtml(source).split(/\\r?\\n/);
  let inCode = false;
  const html = [];
  for (const line of lines) {
    if (line.startsWith("\`\`\`")) {
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(line + "\\n");
    } else if (line.startsWith("# ")) {
      html.push("<h1>" + line.slice(2) + "</h1>");
    } else if (line.startsWith("## ")) {
      html.push("<h2>" + line.slice(3) + "</h2>");
    } else if (line.startsWith("### ")) {
      html.push("<h3>" + line.slice(4) + "</h3>");
    } else if (line.startsWith("- ")) {
      html.push("<ul><li>" + line.slice(2) + "</li></ul>");
    } else if (line.trim()) {
      html.push("<p>" + line + "</p>");
    }
  }
  return '<div class="markdown">' + html.join("") + '</div>';
}

function pill(value) {
  return '<span class="pill ' + escapeAttr(String(value).toLowerCase()) + '">' + escapeHtml(String(value)) + '</span>';
}

function listText(items) {
  return items && items.length ? items.join(", ") : "-";
}

function empty(message) {
  return '<p class="muted">' + escapeHtml(message) + '</p>';
}

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\\s+/g, " ");
}

boot().catch((error) => {
  document.body.innerHTML = '<pre>' + escapeHtml(error.stack || error.message || error) + '</pre>';
});
`;
