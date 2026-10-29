const { _electron, expect } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  base = path.resolve(root, "../../work/session-tests");
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, "ui-")),
  profile = path.join(dir, "profile");
fs.mkdirSync(profile);
const file = path.join(dir, "Book.quill"),
  config = path.join(profile, "session.json");
const packaged = process.argv.includes("--packaged");
let app, page;
const checks = [];
async function launch() {
  const env = {
    ...process.env,
    QUILLDESK_TEST: "1",
    QUILLDESK_TEST_HOME: profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    ...(packaged
      ? {
          executablePath: path.resolve(
            root,
            "../releases/0.3.0/QuillDesk-win32-x64/QuillDesk.exe",
          ),
          args: ["--user-data-dir=" + profile],
        }
      : { args: [root] }),
    env,
  });
  page = await app.firstWindow();
  await page.waitForSelector(".appbar");
}
async function close() {
  const done = new Promise((r) => app.process().once("exit", r));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await done;
}
async function book(text) {
  await expect(
    page.getByRole("textbox", { name: "Szenentext", exact: true }),
  ).toContainText(text);
  await expect(page.locator(".save-indicator")).toHaveText("Gespeichert");
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
(async () => {
  try {
    const { ProjectStore } = await import("../electron/store.mjs"),
      { newProject, textDoc } = await import("../shared/model.mjs");
    const p = newProject("Mein bestehendes Buch", "startup");
    p.nodes.at(-1).doc = textDoc("Vorhandener Buchtext.");
    new ProjectStore().create(file, p);
    fs.writeFileSync(config, JSON.stringify({ file }));
    const original = fs.readFileSync(file);
    await check(
      "Existing book opens automatically from a legacy session, without a file picker",
      async () => {
        await launch();
        await book("Vorhandener Buchtext.");
        assert.deepEqual(fs.readFileSync(file), original);
      },
    );
    await check(
      "Slow startup shows loading instead of asking to create or open a book",
      async () => {
        const boot = await page.evaluate(() => window.quill.boot());
        await app.evaluate(({ ipcMain }, boot) => {
          ipcMain.removeHandler("boot");
          ipcMain.handle("boot", async () => {
            await new Promise((r) => setTimeout(r, 1800));
            return boot;
          });
        }, boot);
        await page.reload();
        await expect(
          page.getByRole("status", { name: "Projekt wird geladen" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: "Neues Buch beginnen",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Projekt öffnen", exact: true }),
        ).toHaveCount(0);
        await book("Vorhandener Buchtext.");
        await close();
      },
    );
    await check(
      "Damaged primary preferences recover automatically on restart",
      async () => {
        fs.writeFileSync(config, "{broken");
        await launch();
        await book("Vorhandener Buchtext.");
        assert.deepEqual(fs.readFileSync(file), original);
        await close();
      },
    );
    await check(
      "A temporarily missing book can be reopened with Continue, without browsing for its file",
      async () => {
        assert.ok(path.resolve(file).startsWith(base + path.sep));
        fs.renameSync(file, file + ".offline");
        await launch();
        await expect(
          page.getByRole("button", {
            name: "Weiter an „Mein bestehendes Buch“",
          }),
        ).toBeVisible();
        await expect(page.getByRole("alert")).toContainText(
          "Das letzte Projekt konnte nicht geöffnet werden",
        );
        fs.renameSync(file + ".offline", file);
        await app.evaluate(({ dialog }) => {
          dialog.showOpenDialog = async () => {
            throw new Error("Unexpected file picker");
          };
        });
        await page
          .getByRole("button", { name: "Weiter an „Mein bestehendes Buch“" })
          .click();
        await book("Vorhandener Buchtext.");
        await close();
      },
    );
    await check(
      "Opening another book remembers the latest selection through normal close and restart",
      async () => {
        const second = path.join(dir, "Second.quill"),
          other = newProject("Zweites Buch", "second");
        other.nodes.at(-1).doc = textDoc("Zweiter gespeicherter Roman.");
        new ProjectStore().create(second, other);
        await launch();
        await book("Vorhandener Buchtext.");
        await app.evaluate(({ dialog, BrowserWindow }, second) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [second],
          });
          BrowserWindow.getAllWindows()[0].webContents.send("menu", "open");
        }, second);
        await book("Zweiter gespeicherter Roman.");
        await close();
        await launch();
        await book("Zweiter gespeicherter Roman.");
        await close();
        assert.equal(JSON.parse(fs.readFileSync(config)).file, second);
        assert.deepEqual(fs.readFileSync(file), original);
      },
    );
    fs.writeFileSync(
      path.join(
        root,
        "test-results",
        packaged ? "session-packaged-report.json" : "session-ui-report.json",
      ),
      JSON.stringify(
        { date: new Date().toISOString(), packaged, checks, passed: true },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(e);
    if (app) await app.evaluate(({ app }) => app.exit(1)).catch(() => {});
    process.exitCode = 1;
  }
})();
