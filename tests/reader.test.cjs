const { test } = require("node:test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
test("Publication rules keep chapter titles, hide internal scene names, honor per-entry overrides across formats", async () => {
  const { newProject, textDoc, makeNode } = await import("../shared/model.mjs");
  const { compileHtml, compileText, compileDocx } =
    await import("../electron/export.mjs");
  const p = newProject("Book", "reader");
  p.nodes.find((n) => n.id === "chapter-one").title = "Prolog PUBLIC";
  p.nodes.at(-1).title = "INTERNAL Sommerfest";
  p.nodes.at(-1).doc = textDoc("VISIBLE scene text.");
  p.nodes.at(-1).notes = "PRIVATE notes";
  p.nodes.at(-1).synopsis = "PRIVATE synopsis";
  p.nodes.push({
    ...makeNode("research-note", "research", "note", "PRIVATE research"),
    include: true,
    doc: textDoc("PRIVATE research body"),
  });
  for (const compile of [compileHtml, compileText]) {
    const result = compile(p);
    assert.ok(result.includes("Prolog PUBLIC"));
    assert.ok(result.includes("VISIBLE scene text"));
    assert.ok(!result.includes("INTERNAL"));
    assert.ok(!result.includes("PRIVATE"));
  }
  const zip = await require("jszip").loadAsync(await compileDocx(p));
  const xml = await zip.file("word/document.xml").async("string");
  assert.ok(xml.includes("Prolog PUBLIC"));
  assert.ok(!xml.includes("INTERNAL"));
  assert.ok(!xml.includes("PRIVATE"));
  p.nodes.find((n) => n.id === "first-scene").headingInExport = true;
  p.nodes.find((n) => n.id === "chapter-one").headingInExport = false;
  assert.ok(compileHtml(p).includes("INTERNAL"));
  assert.ok(!compileText(p).includes("Prolog PUBLIC"));
  p.exportOptions = { headings: false };
  assert.ok(!compileHtml(p).includes("INTERNAL"));
  assert.ok(compileHtml(p).includes("VISIBLE scene text"));
});
test("Workspace state is isolated per file and safely falls back when the selected scene disappears", async () => {
  const { WorkspaceStore } = await import("../electron/workspace.mjs");
  const { newProject } = await import("../shared/model.mjs");
  const base = path.resolve(__dirname, "../../../work/workspace-tests");
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, "case-"));
  const store = new WorkspaceStore(dir),
    p = newProject("Book", "same-id"),
    file = path.join(dir, "first.quill");
  store.save(file, p, {
    selected: "chapter-one",
    view: "editor",
    positions: {
      "chapter-one": { anchor: 5, head: 7, scrollTop: 450 },
      bad: { anchor: Infinity },
    },
    readerScroll: 240,
  });
  const state = store.read(file, p);
  assert.equal(state.selected, "chapter-one");
  assert.equal(state.positions["chapter-one"].scrollTop, 450);
  assert.ok(!("bad" in state.positions));
  assert.notEqual(
    store.read(path.join(dir, "copy.quill"), p).selected,
    "chapter-one",
  );
  p.nodes.find((n) => n.id === "chapter-one").trashed = true;
  const safe = store.read(file, p);
  assert.notEqual(safe.selected, "chapter-one");
  assert.ok(!("chapter-one" in safe.positions));
});
