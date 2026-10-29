const { _electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
(async () => {
  let app;
  try {
    const { ProjectStore } = await import("../electron/store.mjs");
    const { newProject, textDoc } = await import("../shared/model.mjs");
    const base = path.resolve(root, "../../work/packaged-recovery");
    fs.mkdirSync(base, { recursive: true });
    const dir = fs.mkdtempSync(path.join(base, "run-"));
    const profile = path.join(dir, "profile");
    fs.mkdirSync(profile);
    const store = new ProjectStore();
    const p = newProject("Recovery Test", "recovery-ui");
    p.nodes.at(-1).doc = textDoc("Ursprüngliche Textfassung.");
    const file = path.join(dir, "book.quill");
    store.create(file, p);
    const changed = structuredClone(p);
    changed.nodes.at(-1).doc = textDoc("Neuere Textfassung.");
    store.save(changed);
    fs.writeFileSync(
      path.join(profile, "session.json"),
      JSON.stringify({ file }),
    );
    const previous = fs.readFileSync(file + ".previous");
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = async () => {
      app = await _electron.launch({
        executablePath: path.resolve(
          root,
          "../releases/0.3.0/QuillDesk-win32-x64/QuillDesk.exe",
        ),
        args: ["--user-data-dir=" + profile],
        env,
      });
      const page = await app.firstWindow();
      await page.waitForSelector(".appbar");
      return page;
    };
    let page = await launch();
    await expect(
      page.getByRole("textbox", { name: "Szenentext" }),
    ).toContainText("Neuere Textfassung.");
    await app.evaluate(({ dialog, BrowserWindow }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file + ".previous"],
      });
      BrowserWindow.getAllWindows()[0].webContents.send("menu", "open");
    }, file);
    await expect(page.getByRole("alert")).toContainText("Sicherung geöffnet");
    await expect(
      page.getByRole("textbox", { name: "Szenentext" }),
    ).toContainText("Ursprüngliche Textfassung.");
    await page
      .getByRole("textbox", { name: "Szenentext" })
      .fill("Wiederhergestellte und bearbeitete Fassung.");
    const copy = path.join(dir, "Recovered.quill");
    await app.evaluate(({ dialog, BrowserWindow }, copy) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: copy });
      BrowserWindow.getAllWindows()[0].webContents.send("menu", "save");
    }, copy);
    await expect(page.locator(".save-indicator")).toHaveText("Gespeichert");
    assert.deepEqual(fs.readFileSync(file + ".previous"), previous);
    assert.ok(
      JSON.stringify(JSON.parse(fs.readFileSync(copy))).includes(
        "Wiederhergestellte",
      ),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await new Promise((r) => app.process().once("exit", r));
    page = await launch();
    await expect(
      page.getByRole("textbox", { name: "Szenentext" }),
    ).toContainText("Wiederhergestellte");
    const outside = JSON.parse(fs.readFileSync(copy));
    outside.title = "Outside change";
    fs.writeFileSync(copy, JSON.stringify(outside));
    await page
      .getByRole("textbox", { name: "Szenentext" })
      .fill("Noch nicht gespeichert.");
    await expect(page.getByRole("alert")).toContainText("außerhalb");
    await app.evaluate(({ dialog, BrowserWindow }) => {
      globalThis.closeFailureSeen = false;
      dialog.showMessageBox = async () => {
        globalThis.closeFailureSeen = true;
        return { response: 0 };
      };
      BrowserWindow.getAllWindows()[0].close();
    });
    await expect
      .poll(() => app.evaluate(() => globalThis.closeFailureSeen))
      .toBe(true);
    assert.equal(page.isClosed(), false);
    assert.equal(JSON.parse(fs.readFileSync(copy)).title, "Outside change");
    await app.evaluate(({ app }) => app.exit(0));
    fs.writeFileSync(
      path.join(root, "test-results/packaged-recovery-report.json"),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          checks: [
            "Packaged app reopens a saved project",
            "Opening a previous revision creates an unsaved recovery view",
            "Saving recovered edits preserves the original backup",
            "Packaged close/reopen persists recovered edits",
            "Save failure on close leaves the window open and external file intact",
          ],
          passed: true,
          profile,
        },
        null,
        2,
      ),
    );
    console.log("PACKAGED RECOVERY CHECKS PASSED");
  } catch (e) {
    console.error(e);
    if (app) await app.evaluate(({ app }) => app.exit(1)).catch(() => {});
    process.exitCode = 1;
  }
})();
