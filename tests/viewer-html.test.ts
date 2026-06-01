import { describe, expect, it } from "vitest";
import { renderViewerHtml } from "../src/viewer/viewer-html.js";
import { viewerCss, viewerJs } from "../src/viewer/viewer-assets.js";

describe("viewer html", () => {
  it("renders asset hooks and escapes the run id", () => {
    const html = renderViewerHtml("<run>");

    expect(html).toContain("Agentsim Viewer - &lt;run&gt;");
    expect(html).toContain("/assets/viewer.css");
    expect(html).toContain("/assets/viewer.js");
  });

  it("contains the product-flow navigation labels", () => {
    expect(viewerJs).toContain('"Goal"');
    expect(viewerJs).toContain('"Progress"');
    expect(viewerJs).toContain('"Decisions"');
    expect(viewerJs).toContain('"Artifacts"');
    expect(viewerJs).toContain('"Review"');
    expect(viewerJs).toContain('"Trace"');
    expect(viewerJs).toContain('"Final Package"');
    expect(viewerCss).toContain(".sidebar");
  });
});
