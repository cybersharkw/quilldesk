const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const testRoot = path.resolve(root, "../../work/ui-tests");
fs.mkdirSync(testRoot, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(testRoot, "run-"));
const userData = path.join(runRoot, "profile");
const projectFile = path.join(runRoot, "UI-Roman.quill");
const results = path.join(root, "test-results");
fs.mkdirSync(results, { recursive: true });
let app, page;
const errors = [],
  checks = [];
async function launch() {
  const env = {
    ...process.env,
    QUILLDESK_TEST: "1",
    QUILLDESK_TEST_HOME: userData,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root], env, timeout: 45000 });
  page = await app.firstWindow();
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("RENDERER", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE", m.text());
  });
  await page.waitForSelector(".appbar");
}
async function saveDialog(file) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
}
async function openDialog(files) {
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, files);
}
async function saved() {
  await expect(page.locator(".save-indicator")).toHaveText("Gespeichert", {
    timeout: 10000,
  });
}
async function menu(action) {
  await app.evaluate(
    ({ BrowserWindow }, action) =>
      BrowserWindow.getAllWindows()[0].webContents.send("menu", action),
    action,
  );
}
async function closeSafely() {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await new Promise((resolve) => app.process().once("exit", resolve));
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
(async () => {
  try {
    await launch();
    await check("Create project through the desktop UI", async () => {
      await saveDialog(projectFile);
      await page.getByRole("button", { name: "Neues Buch beginnen" }).click();
      await page
        .getByLabel("Arbeitstitel", { exact: true })
        .fill("Die leisen Wege");
      await page.getByRole("button", { name: "Speicherort wählen" }).click();
      await saved();
      assert.equal(
        JSON.parse(fs.readFileSync(projectFile)).title,
        "Die leisen Wege",
      );
    });
    await check(
      "Type, rich formatting, undo and redo, autosave Unicode",
      async () => {
        const editor = page.getByRole("textbox", { name: "Szenentext" });
        await editor.fill("Über den Dächern von Köln lag ein heller Morgen.");
        await editor.press("Control+End");
        await editor.press("Enter");
        await page
          .getByRole("button", { name: "Fett · Strg+B", exact: true })
          .click();
        await editor.pressSequentially("Ein neuer Anfang.");
        await expect(editor.locator("strong")).toContainText(
          "Ein neuer Anfang.",
        );
        await page.getByRole("button", { name: "Rückgängig · Strg+Z" }).click();
        await page
          .getByRole("button", { name: "Wiederholen · Strg+Y" })
          .click();
        await expect(editor).toContainText("Ein neuer Anfang.");
        await saved();
        const p = JSON.parse(fs.readFileSync(projectFile));
        assert.ok(JSON.stringify(p).includes("Köln"));
        assert.ok(JSON.stringify(p).includes('"bold"'));
      },
    );
    await check("Inspector metadata and snapshot recovery", async () => {
      await page.getByLabel("Dokumenttitel", { exact: true }).fill("Der Brief");
      await page
        .getByLabel("Synopsis", { exact: true })
        .fill("Ein Brief verändert alles.");
      await page
        .getByLabel("Dokumentnotizen", { exact: true })
        .fill("Die Uhr im Bahnhof beachten.");
      await page.getByRole("button", { name: "Textfassung sichern" }).click();
      await page
        .getByRole("textbox", { name: "Szenentext" })
        .fill("Eine ganz andere Fassung.");
      await page
        .getByRole("button", { name: /Momentaufnahme vom .* wiederherstellen/ })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Wiederherstellen", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Szenentext" }),
      ).toContainText("Köln");
      await saved();
    });
    await check(
      "Add scene, corkboard and outline keep the same synopsis",
      async () => {
        await page.getByRole("button", { name: "Dokument hinzufügen" }).click();
        await page
          .getByRole("dialog")
          .getByLabel("Titel", { exact: true })
          .fill("Die Entscheidung");
        await page
          .getByRole("button", { name: "Anlegen", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Szenentext" })
          .fill("Sie nahm den Brief mit.");
        await page
          .getByRole("button", { name: "Kapitel 1", exact: true })
          .click();
        await page
          .getByLabel("Synopsis: Die Entscheidung", { exact: true })
          .fill("Bleiben oder gehen?");
        await page.getByRole("tab", { name: "Gliederung" }).click();
        await expect(
          page.getByLabel("Synopsis: Die Entscheidung", { exact: true }),
        ).toHaveValue("Bleiben oder gehen?");
        await saved();
      },
    );
    await check("Reorder using accessible controls and drag/drop", async () => {
      await page
        .getByRole("button", {
          name: "Die Entscheidung nach oben",
          exact: true,
        })
        .click();
      await saved();
      let p = JSON.parse(fs.readFileSync(projectFile));
      assert.equal(
        p.nodes.filter((n) => n.parent === "chapter-one")[0].title,
        "Die Entscheidung",
      );
      await page.getByRole("tab", { name: "Pinnwand" }).click();
      const first = page
        .locator(".synopsis-card")
        .filter({ has: page.locator("h3", { hasText: "Der Brief" }) });
      const second = page
        .locator(".synopsis-card")
        .filter({ has: page.locator("h3", { hasText: "Die Entscheidung" }) });
      await first.dragTo(second, { targetPosition: { x: 40, y: 8 } });
      await saved();
      p = JSON.parse(fs.readFileSync(projectFile));
      assert.equal(
        p.nodes.filter((n) => n.parent === "chapter-one")[0].title,
        "Der Brief",
      );
    });
    await page.screenshot({ path: path.join(results, "corkboard.png") });
    await check("Search across scene text and open a result", async () => {
      await page.getByLabel("Im Projekt suchen").fill("Köln");
      await expect(page.locator(".search-result")).toHaveCount(1);
      await page.locator(".search-result").click();
      await expect(page.getByLabel("Dokumenttitel")).toHaveValue("Der Brief");
    });
    await check(
      "Safe plain-text import through native file-dialog boundary",
      async () => {
        const file = path.join(runRoot, "Recherche.txt");
        fs.writeFileSync(file, "Eine Quelle über Köln – unverändert.");
        await page
          .getByRole("button", { name: "Recherche", exact: true })
          .click();
        await openDialog([file]);
        await menu("import");
        await expect(
          page.getByRole("textbox", { name: "Szenentext" }),
        ).toContainText("Eine Quelle über Köln");
        await saved();
        assert.equal(
          fs.readFileSync(file, "utf8"),
          "Eine Quelle über Köln – unverändert.",
        );
      },
    );
    await check("Move a scene to another collection and back", async () => {
      await page
        .locator(".binder")
        .getByRole("button", { name: "Der Brief", exact: true })
        .click();
      await page.getByLabel("Übergeordneter Ordner").selectOption("research");
      await saved();
      assert.equal(
        JSON.parse(fs.readFileSync(projectFile)).nodes.find(
          (n) => n.title === "Der Brief",
        ).parent,
        "research",
      );
      await page
        .getByLabel("Übergeordneter Ordner")
        .selectOption("chapter-one");
      await saved();
    });
    await check("Trash and recover a chapter with all scenes", async () => {
      await page
        .locator(".binder")
        .getByRole("button", { name: "Kapitel 1", exact: true })
        .click();
      await page
        .getByRole("button", { name: "In den Papierkorb", exact: true })
        .click();
      await expect(page.locator(".trash-item")).toHaveCount(1);
      await page
        .locator(".trash-item")
        .getByRole("button", { name: "Wiederherstellen" })
        .click();
      await saved();
      const p = JSON.parse(fs.readFileSync(projectFile));
      assert.ok(!p.nodes.find((n) => n.title === "Der Brief").trashed);
    });
    await check("Manual project backup and restore", async () => {
      await menu("backups");
      await page.getByRole("button", { name: "Jetzt sichern" }).click();
      await expect(
        page.locator(".backup-row").filter({ hasText: "Manuelle Sicherung" }),
      ).toHaveCount(1);
      await page.getByRole("button", { name: "Dialog schließen" }).click();
      await page
        .locator(".binder")
        .getByRole("button", { name: "Der Brief", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Szenentext" })
        .fill("Ungewollte Änderung");
      await saved();
      await menu("backups");
      await page
        .locator(".backup-row")
        .filter({ hasText: "Manuelle Sicherung" })
        .getByRole("button", { name: "Wiederherstellen" })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Wiederherstellen", exact: true })
        .click();
      await saved();
      await page
        .locator(".binder")
        .getByRole("button", { name: "Der Brief", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Szenentext" }),
      ).toContainText("Köln");
    });
    await check("DOCX, TXT and PDF compilation through export UI", async () => {
      for (const format of ["txt", "docx", "pdf"]) {
        const output = path.join(runRoot, "Manuskript." + format);
        await saveDialog(output);
        await menu("export");
        await page.getByLabel("Dateiformat").selectOption(format);
        await page.getByRole("button", { name: "Export speichern" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0, {
          timeout: 15000,
        });
        assert.ok(fs.statSync(output).size > 100);
        if (format === "txt") {
          const text = fs.readFileSync(output, "utf8");
          assert.ok(text.includes("Köln"));
          assert.ok(!text.includes("Eine Quelle"));
        }
        if (format === "pdf")
          assert.equal(
            fs.readFileSync(output).subarray(0, 4).toString(),
            "%PDF",
          );
      }
    });
    await check(
      "Focus mode toggles and keyboard escape restores workspace",
      async () => {
        await page
          .getByRole("button", { name: "Fokusmodus · F11", exact: true })
          .click();
        await expect(page.locator(".binder")).toBeHidden();
        await page.keyboard.press("Escape");
        await expect(page.locator(".binder")).toBeVisible();
      },
    );
    await page.screenshot({ path: path.join(results, "writing-desk.png") });
    await check(
      "Close immediately after typing flushes and reopen recovers it",
      async () => {
        await page
          .getByRole("textbox", { name: "Szenentext" })
          .press("Control+End");
        await page
          .getByRole("textbox", { name: "Szenentext" })
          .pressSequentially(" Sofort vor dem Schließen.");
        await closeSafely();
        await launch();
        await saved();
        await page
          .locator(".binder")
          .getByRole("button", { name: "Der Brief", exact: true })
          .click();
        await expect(
          page.getByRole("textbox", { name: "Szenentext" }),
        ).toContainText("Sofort vor dem Schließen.");
      },
    );
    await check(
      "Continuous typing checkpoints within two seconds and abrupt exit recovers saved text",
      async () => {
        const editor = page.getByRole("textbox", { name: "Szenentext" });
        await editor.press("Control+End");
        await editor.pressSequentially(" Laufender Text ".repeat(12), {
          delay: 20,
        });
        const beforePause = JSON.stringify(
          JSON.parse(fs.readFileSync(projectFile)),
        );
        assert.ok(beforePause.includes("Laufender Text"));
        await saved();
        await app.evaluate(({ app }) => app.exit(0));
        await launch();
        await saved();
        await page
          .locator(".binder")
          .getByRole("button", { name: "Der Brief", exact: true })
          .click();
        await expect(
          page.getByRole("textbox", { name: "Szenentext" }),
        ).toContainText("Laufender Text");
      },
    );
    await check(
      "Minimum window size keeps text and essential controls usable",
      async () => {
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(1050, 700),
        );
        await expect(
          page.getByRole("textbox", { name: "Szenentext" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Exportieren", exact: true }),
        ).toBeVisible();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
        await page.screenshot({
          path: path.join(results, "compact-window.png"),
        });
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setSize(1480, 950),
        );
      },
    );
    await check(
      "Outside modification shows an error and Save As preserves both versions",
      async () => {
        const external = JSON.parse(fs.readFileSync(projectFile));
        external.title = "Externe Fassung";
        fs.writeFileSync(projectFile, JSON.stringify(external));
        await page
          .getByRole("textbox", { name: "Szenentext" })
          .press("Control+End");
        await page
          .getByRole("textbox", { name: "Szenentext" })
          .pressSequentially(" Meine separate Änderung.");
        await expect(page.getByRole("alert")).toContainText("außerhalb", {
          timeout: 10000,
        });
        assert.equal(
          JSON.parse(fs.readFileSync(projectFile)).title,
          "Externe Fassung",
        );
        const copy = path.join(runRoot, "Recovered.quill");
        await saveDialog(copy);
        await page
          .getByRole("button", { name: "Als neue Datei sichern" })
          .click();
        await saved();
        assert.ok(
          JSON.stringify(JSON.parse(fs.readFileSync(copy))).includes(
            "Meine separate Änderung",
          ),
        );
        assert.equal(
          JSON.parse(fs.readFileSync(projectFile)).title,
          "Externe Fassung",
        );
      },
    );
    assert.deepEqual(errors, []);
    await closeSafely();
    const report = {
      date: new Date().toISOString(),
      checks,
      rendererErrors: errors,
      projectFile,
      artifacts: runRoot,
    };
    fs.writeFileSync(
      path.join(results, "ui-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log("ALL UI CHECKS PASSED");
  } catch (e) {
    console.error(e);
    if (page && !page.isClosed())
      await page
        .screenshot({ path: path.join(results, "failure.png") })
        .catch(() => {});
    if (app) await app.evaluate(({ app }) => app.exit(1)).catch(() => {});
    process.exitCode = 1;
  }
})();
