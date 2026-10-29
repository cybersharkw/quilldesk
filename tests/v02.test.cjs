const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { SpellingService } = require("../electron/spelling.cjs");
const testRoot = path.resolve(__dirname, "../../../work/v02-core");
fs.mkdirSync(testRoot, { recursive: true });
test("German and English dictionaries check and suggest offline", async (t) => {
  const s = new SpellingService();
  t.after(() => s.close());
  assert.deepEqual(
    await s.request("de", ["Geschichte", "Geschihcte", "Buch"]),
    ["Geschihcte"],
  );
  assert.ok(
    (await s.request("de", undefined, "Geschihcte")).includes("Geschichte"),
  );
  assert.deepEqual(await s.request("en", ["writing", "writign", "book"]), [
    "writign",
  ]);
  assert.throws(() => s.request("fr", []), /Wörterbuch/);
});
test("Versioned external copies preserve prior content, retry missing folder and deduplicate", async (t) => {
  const { ExternalBackup } = await import("../electron/external-backup.mjs");
  const { newProject, textDoc } = await import("../shared/model.mjs");
  const dir = fs.mkdtempSync(path.join(testRoot, "backup-")),
    sync = path.join(dir, "sync");
  fs.mkdirSync(sync);
  const backup = new ExternalBackup();
  t.after(() => backup.close());
  const p = newProject("Test", "versioned-test");
  backup.configure(sync);
  backup.queue(p);
  await backup.flushAll();
  const first = backup.status.lastFile,
    raw = fs.readFileSync(first);
  assert.deepEqual(JSON.parse(raw), p);
  backup.queue(p);
  await backup.flushAll();
  assert.equal(backup.status.lastFile, first);
  p.nodes.at(-1).doc = textDoc("Neue Fassung");
  backup.queue(p);
  await backup.flushAll();
  const second = backup.status.lastFile;
  assert.notEqual(second, first);
  assert.deepEqual(fs.readFileSync(first), raw);
  // Only rename a fixture directory verified under this test run.
  assert.ok(path.resolve(sync).startsWith(testRoot + path.sep));
  fs.renameSync(sync, sync + "-offline");
  p.nodes.at(-1).doc = textDoc("Auch ohne Drive weiterschreiben");
  backup.queue(p);
  await assert.rejects(() => backup.flushAll());
  assert.equal(backup.status.state, "error");
  assert.equal(backup.pending.size, 1);
  assert.equal(fs.existsSync(sync), false);
  fs.renameSync(sync + "-offline", sync);
  await backup.flushAll();
  assert.equal(backup.status.state, "written");
  assert.deepEqual(JSON.parse(fs.readFileSync(backup.status.lastFile)), p);
  assert.deepEqual(fs.readFileSync(first), raw);
});
test("Publisher layout controls and page fields reach DOCX and HTML", async () => {
  const { newProject, textDoc, validateProject } =
    await import("../shared/model.mjs");
  const { compileDocx, compileHtml, compileText } =
    await import("../electron/export.mjs");
  const p = newProject("Ein Roman", "layout-test");
  p.nodes.at(-1).doc = textDoc("Über den Wolken.");
  p.nodes.at(-1).title = "INTERNAL SCENE TITLE";
  p.spelling = "de";
  p.spellingWords = ["Quilland"];
  validateProject(p);
  const o = {
    font: "Courier New",
    fontSize: 14,
    lineSpacing: 2,
    sceneHeadings: false,
    pageNumbers: true,
    chapterBreaks: true,
  };
  const zip = await JSZip.loadAsync(await compileDocx(p, o));
  const xml = await zip.file("word/document.xml").async("string");
  assert.ok(!xml.includes("INTERNAL SCENE TITLE"));
  assert.ok(xml.includes("Über den Wolken"));
  const style = await zip.file("word/styles.xml").async("string");
  assert.ok(style.includes("Courier New"));
  assert.ok(style.includes('w:sz w:val="28"'));
  assert.ok(style.includes('w:line="480"'));
  const footer = await zip.file("word/footer1.xml").async("string");
  assert.ok(footer.includes("PAGE"));
  assert.ok(footer.includes("NUMPAGES"));
  assert.equal(
    (xml.match(/w:pageBreakBefore/g) || []).length,
    0,
    "first chapter must not create an extra blank page",
  );
  const html = compileHtml(p, o);
  assert.ok(html.includes('font:14pt "Courier New"'));
  assert.ok(html.includes("line-height:2"));
  assert.ok(!html.includes("INTERNAL SCENE TITLE"));
  assert.ok(!compileText(p, o).includes("INTERNAL SCENE TITLE"));
  const noNumbers = await JSZip.loadAsync(
    await compileDocx(p, { pageNumbers: false }),
  );
  assert.equal(noNumbers.file("word/footer1.xml"), null);
  assert.throws(() => validateProject({ ...p, spelling: "fr" }));
});
