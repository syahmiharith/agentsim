export function renderViewerHtml(runId: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agentsim Viewer - ${escapeHtml(runId)}</title>
    <link rel="stylesheet" href="/assets/viewer.css" />
  </head>
  <body>
    <noscript>Agentsim Viewer requires JavaScript for local artifact navigation.</noscript>
    <script type="module" src="/assets/viewer.js"></script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
