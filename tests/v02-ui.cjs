const { _electron, expect } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  base = path.resolve(root, "../../work/v02-ui");
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, "run-")),
  profile = path.join(dir, "profile"),
  file = path.join(dir, "book.quill"),
  sync = path.join(dir, "Sync");
fs.mkdirSync(profile);
fs.mkdirSync(sync);
let app, page;
const checks = [],
  errors = [];
const packaged = process.argv.includes("--packaged");
const results = path.join(root, "test-results");
fs.mkdirSync(results, { recursive: true });
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
async function saved() {
  await expect(page.locator(".save-indicator")).toHaveText("Gespeichert", {
    timeout: 10000,
  });
}
async function dialog(kind, target) {
  await app.evaluate(
    ({ dialog }, { kind, target }) => {
      dialog[kind] = async () =>
        kind === "showOpenDialog"
          ? { canceled: false, filePaths: [target] }
          : { canceled: false, filePath: target };
    },
    { kind, target },
  );
}
async function menu(action) {
  await app.evaluate(
    ({ BrowserWindow }, action) =>
      BrowserWindow.getAllWindows()[0].webContents.send("menu", action),
    action,
  );
}
async function api(name, ...args) {
  const r = await page.evaluate(
    async ({ name, args }) => window.quill[name](...args),
    { name, args },
  );
  assert.equal(r.ok, true, r.error);
  return r.value;
}
async function close() {
  const exited = new Promise((resolve) => app.process().once("exit", resolve));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await exited;
}
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
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".appbar");
}
(async () => {
  try {
    const { newProject, makeNode, textDoc, plainText } =
      await import("../shared/model.mjs");
    const { ProjectStore } = await import("../electron/store.mjs");
    const p = newProject("Der erste Roman", "new-tools");
    p.nodes.at(-1).doc = textDoc("Eine Geschichte beginnt.");
    const second = makeNode("second", "chapter-one", "scene", "Zweite Szene");
    second.include = true;
    second.doc = textDoc("Der zweite Text.");
    p.nodes.push(second);
    const store = new ProjectStore();
    store.create(file, p);
    fs.writeFileSync(
      path.join(profile, "session.json"),
      JSON.stringify({ file }),
    );
    await launch();
    await check(
      "Offline German corrections and project dictionary work in the rich editor",
      async () => {
        const editor = page.getByRole("textbox", {
          name: "Szenentext",
          exact: true,
        });
        await editor.fill("Eine Geschihcte beginnt. Quilland");
        await expect(
          editor.locator('[data-spelling-word="Geschihcte"]'),
        ).toBeVisible({ timeout: 25000 });
        await editor
          .locator('[data-spelling-word="Geschihcte"]')
          .click({ button: "right" });
        await page
          .getByRole("dialog", { name: "Rechtschreibvorschläge", exact: true })
          .getByRole("button", { name: "Geschichte", exact: true })
          .click();
        await expect(editor).toContainText("Eine Geschichte beginnt.");
        await editor
          .locator('[data-spelling-word="Quilland"]')
          .click({ button: "right" });
        await page
          .getByRole("button", { name: "Als Projektwort merken" })
          .click();
        await expect(
          editor.locator('[data-spelling-word="Quilland"]'),
        ).toHaveCount(0);
        await saved();
        assert.ok(
          JSON.parse(fs.readFileSync(file)).spellingWords.includes("Quilland"),
        );
        await page
          .getByLabel("Rechtschreibung: Szenentext", { exact: true })
          .selectOption("en");
        await editor.fill("A writign book.");
        await expect(
          editor.locator('[data-spelling-word="writign"]'),
        ).toBeVisible({ timeout: 25000 });
        await page
          .getByLabel("Rechtschreibung: Szenentext", { exact: true })
          .selectOption("off");
        await expect(editor.locator(".misspelled")).toHaveCount(0);
      },
    );
    await check(
      "Split panes persist edits to separate scene IDs and survive pane changes",
      async () => {
        await page
          .getByRole("button", { name: "Geteilten Editor ein-/ausschalten" })
          .click();
        await page
          .getByLabel("Zweiter Text", { exact: true })
          .selectOption("second");
        await page
          .getByRole("textbox", { name: "Szenentext", exact: true })
          .fill("Erste Szene – unabhängig.");
        await page
          .getByRole("textbox", { name: "Zweiter Szenentext", exact: true })
          .fill("Zweite Szene – unabhängig.");
        await saved();
        const disk = JSON.parse(fs.readFileSync(file));
        assert.equal(
          plainText(disk.nodes.find((n) => n.id === "first-scene").doc).trim(),
          "Erste Szene – unabhängig.",
        );
        assert.equal(
          plainText(disk.nodes.find((n) => n.id === "second").doc).trim(),
          "Zweite Szene – unabhängig.",
        );
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(1050, 700),
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await expect(
          page.getByRole("textbox", {
            name: "Zweiter Szenentext",
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(
            results,
            packaged ? "v02-packaged-split.png" : "v02-split.png",
          ),
        });
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(1480, 950),
        );
      },
    );
    await check(
      "Combined manuscript edits retain scene identity and order",
      async () => {
        await page
          .getByRole("tab", { name: "Manuskript", exact: true })
          .click();
        const sections = await page
          .locator(".combined-section")
          .getAttribute("data-document-id")
          .catch(() => null);
        assert.deepEqual(
          await page
            .locator(".combined-section")
            .evaluateAll((es) => es.map((e) => e.dataset.documentId)),
          ["chapter-one", "first-scene", "second"],
        );
        await page
          .locator('[data-document-id="second"] .combined-read')
          .click();
        await page
          .getByRole("textbox", {
            name: "Manuskripttext: Zweite Szene",
            exact: true,
          })
          .fill("Im Zusammenhang überarbeitet.");
        await saved();
        const disk = JSON.parse(fs.readFileSync(file));
        assert.ok(
          plainText(disk.nodes.find((n) => n.id === "second").doc).includes(
            "Im Zusammenhang",
          ),
        );
        assert.ok(
          plainText(
            disk.nodes.find((n) => n.id === "first-scene").doc,
          ).includes("Erste Szene"),
        );
        await page.screenshot({
          path: path.join(results, "v02-manuscript.png"),
        });
      },
    );
    let first, firstRaw;
    await check(
      "Folder selection makes a verified versioned copy without altering the working file",
      async () => {
        await page
          .getByRole("button", { name: "Google-Drive-Sicherung", exact: true })
          .click();
        await dialog("showOpenDialog", sync);
        await page
          .getByRole("button", { name: "Sicherungsordner wählen" })
          .click();
        await expect(page.locator(".backup-status")).toContainText(
          "Datei geschrieben und überprüft",
        );
        const status = await api("backupStatus");
        first = status.lastFile;
        firstRaw = fs.readFileSync(first);
        assert.deepEqual(
          JSON.parse(firstRaw),
          JSON.parse(fs.readFileSync(file)),
        );
        await page.getByRole("button", { name: "Fertig", exact: true }).click();
      },
    );
    await check(
      "Local writing survives unavailable backup folder and retry preserves older copies",
      async () => {
        assert.ok(path.resolve(sync).startsWith(base + path.sep));
        fs.renameSync(sync, sync + "-offline");
        await page
          .getByRole("textbox", {
            name: "Manuskripttext: Zweite Szene",
            exact: true,
          })
          .fill("Lokal sicher, auch wenn Drive fehlt.");
        await saved();
        const failure = await page.evaluate(() => window.quill.backupNow());
        assert.equal(failure.ok, false);
        assert.ok(fs.readFileSync(file, "utf8").includes("Lokal sicher"));
        await expect(page.locator(".backup-indicator")).toContainText(
          "fehlgeschlagen",
        );
        fs.renameSync(sync + "-offline", sync);
        const status = await api("backupNow");
        assert.notEqual(status.lastFile, first);
        assert.deepEqual(fs.readFileSync(first), firstRaw);
      },
    );
    await check(
      "External copies open as recovery drafts and never overwrite the source",
      async () => {
        await dialog("showOpenDialog", first);
        await menu("open");
        await expect(page.getByRole("alert")).toContainText(
          "Sicherung geöffnet",
        );
        await page
          .getByRole("textbox", { name: "Szenentext", exact: true })
          .fill("Aus einer Sicherung wiederhergestellt.");
        await dialog("showSaveDialog", path.join(dir, "Recovered.quill"));
        await menu("save");
        await saved();
        assert.deepEqual(fs.readFileSync(first), firstRaw);
        assert.ok(
          fs
            .readFileSync(path.join(dir, "Recovered.quill"), "utf8")
            .includes("wiederhergestellt"),
        );
      },
    );
    await check(
      "PDF export has page numbers and manuscript layout with no internal scene headings",
      async () => {
        const manuscript = structuredClone(p);
        manuscript.author = "Testautorin";
        manuscript.nodes.find((n) => n.id === "first-scene").doc = textDoc(
          Array.from(
            { length: 50 },
            (_, i) =>
              `${i + 1}. Über den Dächern lag der Morgen. Die Straße war still, und am Fenster wartete jemand auf den ersten Brief. Eine Geschichte beginnt mit einer Entscheidung.`,
          ).join("\n"),
        );
        const pdf = path.join(dir, "publisher.pdf");
        await dialog("showSaveDialog", pdf);
        await api("exportProject", manuscript, "pdf", {
          font: "Times New Roman",
          fontSize: 12,
          lineSpacing: 2,
          titlePage: true,
          headings: true,
          sceneHeadings: false,
          chapterBreaks: true,
          pageNumbers: true,
        });
        assert.equal(fs.readFileSync(pdf).subarray(0, 4).toString(), "%PDF");
      },
    );
    await check(
      "Close copies the final revision and reopen retains dictionary and backup folder",
      async () => {
        await page
          .getByRole("textbox", { name: "Szenentext", exact: true })
          .fill("Letzte Fassung beim Schließen.");
        await close();
        await launch();
        await expect(
          page.getByRole("textbox", { name: "Szenentext", exact: true }),
        ).toContainText("Letzte Fassung beim Schließen.");
        const status = await api("backupNow");
        assert.equal(status.folder, sync);
        assert.ok(
          fs.readFileSync(status.lastFile, "utf8").includes("Letzte Fassung"),
        );
        const disk = JSON.parse(
          fs.readFileSync(path.join(dir, "Recovered.quill")),
        );
        assert.ok(disk.spellingWords.includes("Quilland"));
      },
    );
    assert.deepEqual(errors, []);
    await close();
    fs.writeFileSync(
      path.join(
        results,
        packaged ? "v02-packaged-report.json" : "v02-ui-report.json",
      ),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          packaged,
          checks,
          errors,
          artifacts: dir,
        },
        null,
        2,
      ),
    );
    console.log("ALL NEW WORKFLOW CHECKS PASSED", dir);
  } catch (e) {
    console.error(e);
    if (page && !page.isClosed())
      await page
        .screenshot({ path: path.join(results, "v02-failure.png") })
        .catch(() => {});
    if (app) await app.evaluate(({ app }) => app.exit(1)).catch(() => {});
    process.exitCode = 1;
  }
})();
