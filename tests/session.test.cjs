const { test } = require("node:test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const base = path.resolve(__dirname, "../../../work/session-tests");
fs.mkdirSync(base, { recursive: true });
test("Last-project record migrates legacy sessions and recovers the newest location from either copy", async () => {
  const { LastProjectSession } = await import("../electron/session.mjs");
  const dir = fs.mkdtempSync(path.join(base, "unit-")),
    config = path.join(dir, "session.json"),
    book = path.join(dir, "Roman.quill");
  fs.writeFileSync(config, JSON.stringify({ file: book }));
  const s = new LastProjectSession(config);
  assert.equal(s.read().file, book);
  s.remember(book, "Mein Roman");
  fs.writeFileSync(config, "{broken");
  assert.equal(new LastProjectSession(config).read().file, book);
  const next = path.join(dir, "Second.quill");
  s.remember(next, "Zweites Buch");
  fs.writeFileSync(config, "");
  assert.deepEqual(new LastProjectSession(config).read(), {
    file: next,
    title: "Zweites Buch",
  });
});
test("Unavailable book location is retained for retry; invalid session paths are rejected", async () => {
  const { LastProjectSession } = await import("../electron/session.mjs");
  const dir = fs.mkdtempSync(path.join(base, "missing-")),
    config = path.join(dir, "session.json"),
    book = path.join(dir, "missing.quill");
  const s = new LastProjectSession(config);
  s.remember(book, "Offline");
  assert.equal(new LastProjectSession(config).read().file, book);
  fs.writeFileSync(config, JSON.stringify({ file: "relative.quill" }));
  fs.writeFileSync(config + ".previous", "{}");
  const invalid = new LastProjectSession(config);
  assert.equal(invalid.read(), null);
  assert.ok(invalid.warning);
});
