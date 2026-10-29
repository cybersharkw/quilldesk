const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const testRoot = path.resolve(__dirname, "../../../work/core-tests");
fs.mkdirSync(testRoot, { recursive: true });
let model, storage, exportsModule, importer;
before(async () => {
  model = await import("../shared/model.mjs");
  storage = await import("../electron/store.mjs");
  exportsModule = await import("../electron/export.mjs");
  importer = await import("../electron/import.mjs");
});
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(testRoot, "quilldesk-test-"));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(testRoot + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const store = new storage.ProjectStore();
  const p = model.newProject("Über den Wolken", "test-project");
  store.create(path.join(dir, "roman.quill"), p);
  return { dir, store, p };
}
test("Unicode content saves atomically, reopens, and preserves previous revision", (t) => {
  const { store, p } = fixture(t);
  p.nodes.at(-1).doc = model.textDoc(
    "Grüße aus Köln. „Ein schöner Tag!“ 日本語 🦉",
  );
  store.save(p);
  const reopened = new storage.ProjectStore();
  const result = reopened.open(store.file);
  assert.equal(
    model.plainText(result.project.nodes.at(-1).doc),
    "Grüße aus Köln. „Ein schöner Tag!“ 日本語 🦉\n",
  );
  assert.ok(fs.existsSync(store.file + ".previous"));
  assert.equal(model.wordCount(p.nodes.at(-1).doc), 7);
  assert.equal(
    fs.readdirSync(path.dirname(store.file)).filter((f) => f.endsWith(".tmp"))
      .length,
    0,
  );
});
test("malformed projects and cyclic folder moves cannot corrupt a live project", (t) => {
  const { store, p } = fixture(t);
  const before = fs.readFileSync(store.file);
  const invalid = structuredClone(p);
  invalid.nodes.push({ ...invalid.nodes[0] });
  assert.throws(() => store.save(invalid), /Doppelte/);
  const cyclic = structuredClone(p);
  cyclic.nodes.find((n) => n.id === "chapter-one").parent = "chapter-one";
  assert.throws(() => store.save(cyclic), /Ordnerstruktur/);
  assert.throws(
    () => model.moveNode(p, "chapter-one", "chapter-one"),
    /Zielordner/,
  );
  assert.deepEqual(fs.readFileSync(store.file), before);
});
test("outside changes are detected and are never silently overwritten", (t) => {
  const { store, p } = fixture(t);
  const external = { ...p, title: "Andere Fassung" };
  fs.writeFileSync(store.file, JSON.stringify(external));
  assert.throws(
    () => store.save({ ...p, title: "Meine Fassung" }),
    /außerhalb/,
  );
  assert.equal(JSON.parse(fs.readFileSync(store.file)).title, "Andere Fassung");
});
test("failed live-file rename leaves the previous live project intact and recoverable", (t) => {
  const { store, p } = fixture(t);
  const original = fs.renameSync;
  const before = fs.readFileSync(store.file);
  fs.renameSync = (source, target) => {
    if (target === store.file) throw new Error("Simulated disk failure");
    return original(source, target);
  };
  try {
    assert.throws(() => store.save({ ...p, title: "Changed" }), /Simulated/);
  } finally {
    fs.renameSync = original;
  }
  assert.deepEqual(fs.readFileSync(store.file), before);
  assert.deepEqual(fs.readFileSync(store.file + ".previous"), before);
  assert.equal(
    fs.readdirSync(path.dirname(store.file)).filter((f) => f.endsWith(".tmp"))
      .length,
    0,
  );
});
test("backup restore creates a safety copy of the replaced manuscript", (t) => {
  const { store, p } = fixture(t);
  store.checkpoint();
  const backup = store.listBackups()[0].name;
  store.save({ ...p, title: "Neue Fassung" });
  store.restore(backup);
  assert.equal(store.project.title, p.title);
  const safety = store
    .listBackups()
    .find((b) => b.name.includes("before-restore"));
  assert.ok(safety);
  assert.equal(
    storage.readProject(path.join(store.file + ".backups", safety.name)).project
      .title,
    "Neue Fassung",
  );
  assert.throws(() => store.restore("../other.quill"), /Unbekannte/);
});
test("automatic backup retention preserves manual checkpoints", (t) => {
  const { store } = fixture(t);
  const manual = store.checkpoint();
  for (let i = 0; i < 125; i++)
    store.backup(fs.readFileSync(store.file), "auto");
  const list = store.listBackups();
  assert.equal(list.filter((n) => n.name.includes("-auto-")).length, 120);
  assert.ok(list.some((n) => n.name === manual));
});
test("reordering and nesting preserve content and manuscript order after reopen", (t) => {
  const { store, p } = fixture(t);
  p.nodes.push({
    ...model.makeNode("two", "chapter-one", "scene", "Zweite Szene"),
    include: true,
    doc: model.textDoc("Zwei"),
  });
  const moved = model.moveNode(p, "two", "chapter-one", "first-scene");
  store.save(moved);
  const saved = storage.readProject(store.file).project;
  assert.deepEqual(
    model.children(saved, "chapter-one").map((n) => n.id),
    ["two", "first-scene"],
  );
  assert.equal(
    model.plainText(saved.nodes.find((n) => n.id === "two").doc),
    "Zwei\n",
  );
  assert.deepEqual(
    model.manuscript(saved).map((n) => n.title),
    ["Kapitel 1", "Zweite Szene", "Erste Szene"],
  );
});
test("trash removes a whole chapter from compilation and restores the subtree", () => {
  const p = model.newProject("Roman", "trash-project");
  p.nodes.at(-1).doc = model.textDoc("Das bleibt erhalten.");
  const trashed = model.trashNode(p, "chapter-one");
  assert.equal(model.manuscript(trashed).length, 0);
  const restored = model.restoreNode(trashed, "chapter-one");
  assert.equal(model.manuscript(restored).length, 2);
  assert.equal(
    model.plainText(restored.nodes.at(-1).doc),
    "Das bleibt erhalten.\n",
  );
  model.validateProject(restored);
});
test("failed open does not replace the currently open project", (t) => {
  const { store, dir } = fixture(t);
  const current = store.file;
  const bad = path.join(dir, "bad.quill");
  fs.writeFileSync(bad, "{");
  assert.throws(() => store.open(bad));
  assert.equal(store.file, current);
  assert.equal(store.project.id, "test-project");
});
test("creating or saving as an existing file is refused", (t) => {
  const { store, p } = fixture(t);
  const before = fs.readFileSync(store.file);
  assert.throws(() => store.create(store.file, p), /existiert bereits/);
  assert.deepEqual(fs.readFileSync(store.file), before);
});
test("TXT and HTML compilation include only marked manuscript entries and escape markup", () => {
  const p = model.newProject("<Buch>", "compile-project");
  p.author = "Müller & Sohn";
  p.nodes.at(-1).doc = model.textDoc("„Grüße“ <script>alert(1)</script>");
  p.nodes.push({
    ...model.makeNode("secret", "research", "note", "SECRET"),
    include: true,
    doc: model.textDoc("Research secret"),
  });
  const txt = exportsModule.compileText(p);
  assert.match(txt, /„Grüße“/);
  assert.ok(!txt.includes("SECRET"));
  const html = exportsModule.compileHtml(p);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("Research secret"));
  assert.ok(
    !exportsModule
      .compileText(p, { headings: false, titlePage: false })
      .includes("Erste Szene"),
  );
});
test("DOCX roundtrip preserves German text, paragraphs, bold and italic XML", async (t) => {
  const { dir, p } = fixture(t);
  p.nodes.at(-1).doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Grüße – ÄÖÜ ß",
            marks: [{ type: "bold" }, { type: "italic" }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Zweiter Absatz." }],
      },
    ],
  };
  const file = path.join(dir, "manuscript.docx");
  fs.writeFileSync(file, await exportsModule.compileDocx(p));
  const imported = await importer.importTextFile(file);
  assert.match(imported.text, /Grüße – ÄÖÜ ß/);
  assert.match(imported.text, /Zweiter Absatz/);
  const zip = await require("jszip").loadAsync(fs.readFileSync(file));
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /<w:i\/>/);
});
test("imports read source safely, reject binary, malformed UTF8 and oversized ZIP metadata", async (t) => {
  const { dir } = fixture(t);
  const file = path.join(dir, "Notiz.txt");
  const original = "Ein unverändertes Original: Äpfel und Öl.";
  fs.writeFileSync(file, original);
  const imported = await importer.importTextFile(file);
  assert.equal(imported.text, original);
  assert.equal(fs.readFileSync(file, "utf8"), original);
  fs.writeFileSync(file, Buffer.from([0xff, 0xfe, 0, 0]));
  await assert.rejects(() => importer.importTextFile(file), /Binärdaten/);
  fs.writeFileSync(file, Buffer.from([0xc3, 0x28]));
  await assert.rejects(() => importer.importTextFile(file));
  const buffer = Buffer.alloc(68);
  buffer.writeUInt32LE(0x02014b50, 0);
  buffer.writeUInt32LE(30 * 1024 * 1024, 24);
  buffer.writeUInt32LE(0x06054b50, 46);
  buffer.writeUInt16LE(1, 56);
  assert.throws(() => importer.checkDocxSize(buffer), /25 MB/);
});
test("document snapshots survive save and reopen", (t) => {
  const { store, p } = fixture(t);
  p.nodes.at(-1).snapshots = [
    {
      id: "snap",
      title: "Fassung 1",
      date: new Date().toISOString(),
      doc: model.textDoc("Ursprünglicher Text."),
    },
  ];
  store.save(p);
  assert.equal(
    model.plainText(
      storage.readProject(store.file).project.nodes.at(-1).snapshots[0].doc,
    ),
    "Ursprünglicher Text.\n",
  );
});

test("a 100,000-word novel survives full save and reopen", (t) => {
  const { store, p } = fixture(t);
  const prose = "Geschichten ".repeat(1000);
  for (let i = 0; i < 100; i++)
    p.nodes.push({
      ...model.makeNode(`large-${i}`, "chapter-one", "scene", `Szene ${i + 1}`),
      include: true,
      doc: model.textDoc(prose),
    });
  const started = performance.now();
  store.save(p);
  const reopened = storage.readProject(store.file).project;
  assert.equal(model.manuscriptWords(reopened), 100000);
  assert.equal(reopened.nodes.length, 106);
  console.log(
    `100,000-word save and reopen: ${Math.round(performance.now() - started)} ms; ${fs.statSync(store.file).size} bytes`,
  );
});

test("unsupported and structurally invalid editor documents are rejected before saving", (t) => {
  const { store, p } = fixture(t);
  p.nodes.at(-1).doc = {
    type: "doc",
    content: [{ type: "text", text: "Invalid direct child" }],
  };
  assert.throws(() => store.save(p), /Absatzstruktur/);
  p.nodes.at(-1).doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Unsupported mark",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
        ],
      },
    ],
  };
  assert.throws(() => store.save(p), /Textformatierung/);
});
