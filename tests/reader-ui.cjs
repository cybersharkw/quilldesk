const { _electron, expect } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  base = path.resolve(root, "../../work/reader-tests");
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, "run-")),
  profile = path.join(dir, "profile");
fs.mkdirSync(profile);
const file = path.join(dir, "Book.quill");
const packaged = process.argv.includes("--packaged");
let app, page;
const checks = [],
  errors = [];
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
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".save-indicator")).toHaveText("Gespeichert");
}
async function close() {
  const done = new Promise((r) => app.process().once("exit", r));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await done;
}
async function saved() {
  await expect(page.locator(".save-indicator")).toHaveText("Gespeichert");
}
const editor = () =>
  page.getByRole("textbox", { name: "Szenentext", exact: true });
async function choose(title) {
  await page.locator(".binder .node-button").filter({ hasText: title }).click();
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
(async () => {
  try {
    const { ProjectStore } = await import("../electron/store.mjs"),
      { newProject, textDoc, makeNode } = await import("../shared/model.mjs");
    const p = newProject("Lesetest", "reader-test");
    p.spelling = "off";
    p.nodes.find((n) => n.id === "chapter-one").title =
      "Prolog – Ein Feuer entfacht";
    p.nodes.find((n) => n.id === "chapter-one").doc = textDoc(
      "PROLOGTEXT sichtbar.",
    );
    p.nodes.at(-1).title = "Das Sommerfest";
    p.nodes.at(-1).doc = textDoc(
      Array.from(
        { length: 65 },
        (_, i) =>
          `Absatz ${i}: Die Sonne schien über dem Dorf. Alle warteten auf das Sommerfest.`,
      ).join("\n"),
    );
    p.nodes.at(-1).notes = "GEHEIME NOTIZ";
    p.nodes.at(-1).synopsis = "GEHEIME SYNOPSIS";
    p.nodes.push({
      ...makeNode("second", "chapter-one", "scene", "Zweite interne Szene"),
      include: true,
      doc: textDoc("ZWEITER SZENENTEXT sichtbar."),
    });
    new ProjectStore().create(file, p);
    fs.writeFileSync(
      path.join(profile, "session.json"),
      JSON.stringify({ file }),
    );
    const original = fs.readFileSync(file);
    await launch();
    await check(
      "Selected scene, cursor and scroll survive immediate close and reopen without changing manuscript bytes",
      async () => {
        await choose("Das Sommerfest");
        await editor().evaluate((el) => {
          const p = el.querySelectorAll("p")[10];
          const range = document.createRange();
          range.setStart(p.firstChild, 8);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
        });
        await expect
          .poll(() => page.evaluate(() => window.getSelection()?.anchorOffset))
          .toBe(8);
        await page.locator(".paper-scroll").evaluate((el) => {
          el.scrollTop = 480;
          el.dispatchEvent(new Event("scroll"));
        });
        await close();
        await launch();
        await expect(page.locator(".binder-row.selected")).toContainText(
          "Das Sommerfest",
        );
        await expect
          .poll(() => page.evaluate(() => window.getSelection()?.anchorOffset))
          .toBe(8);
        await expect
          .poll(() =>
            page
              .locator(".paper-scroll")
              .evaluate((el) => Math.round(el.scrollTop)),
          )
          .toBe(480);
        assert.deepEqual(fs.readFileSync(file), original);
      },
    );
    await check(
      "Chapter text reopens as text rather than a folder board",
      async () => {
        await choose("Prolog – Ein Feuer entfacht");
        await page.getByRole("tab", { name: "Text", exact: true }).click();
        await expect(editor()).toContainText("PROLOGTEXT");
        await close();
        await launch();
        await expect(editor()).toContainText("PROLOGTEXT");
        await expect(
          page.getByRole("tab", { name: "Text", exact: true }),
        ).toHaveAttribute("aria-selected", "true");
      },
    );
    await check(
      "Internal scene names are green and labelled; reader keeps Prolog heading and all included prose",
      async () => {
        await choose("Das Sommerfest");
        await expect(page.locator(".paper h1")).toHaveClass(/internal-title/);
        await expect(page.locator(".paper .publication-badge")).toContainText(
          "nur der Text",
        );
        await page
          .getByRole("tab", { name: "Buch lesen", exact: true })
          .click();
        const book = page.getByRole("article", { name: "Buch für Leser" });
        await expect(book).toContainText("Prolog – Ein Feuer entfacht");
        await expect(book).toContainText("PROLOGTEXT");
        await expect(book).toContainText("ZWEITER SZENENTEXT");
        await expect(book.locator("h1,h2")).not.toContainText([
          "Das Sommerfest",
        ]);
        assert.ok(!(await book.textContent()).includes("GEHEIME"));
        await page.screenshot({
          path: path.join(root, "test-results/reader-book.png"),
        });
      },
    );
    await check("Reader scroll and view survive reopening", async () => {
      await page.locator(".book-reader").evaluate((el) => {
        el.scrollTop = 650;
        el.dispatchEvent(new Event("scroll"));
      });
      await close();
      await launch();
      await expect(
        page.getByRole("tab", { name: "Buch lesen", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect
        .poll(() =>
          page
            .locator(".book-reader")
            .evaluate((el) => Math.round(el.scrollTop)),
        )
        .toBe(650);
    });
    await check(
      "Per-scene title visibility matches reader and DOCX export and persists",
      async () => {
        await choose("Das Sommerfest");
        await page
          .getByRole("button", { name: "Inspektor ein-/ausblenden" })
          .click();
        await page
          .getByLabel("Titel im Buch anzeigen", { exact: true })
          .check();
        await saved();
        await page
          .getByRole("tab", { name: "Buch lesen", exact: true })
          .click();
        await expect(page.locator(".reader-book h2")).toContainText(
          "Das Sommerfest",
        );
        const docx = path.join(dir, "Book.docx");
        await app.evaluate(({ dialog }, file) => {
          dialog.showSaveDialog = async () => ({
            canceled: false,
            filePath: file,
          });
        }, docx);
        const current = JSON.parse(fs.readFileSync(file));
        const result = await page.evaluate(
          (p) => window.quill.exportProject(p, "docx", p.exportOptions || {}),
          current,
        );
        assert.equal(result.ok, true, result.error);
        const zip = await require("jszip").loadAsync(fs.readFileSync(docx));
        assert.ok(
          (await zip.file("word/document.xml").async("string")).includes(
            "Das Sommerfest",
          ),
        );
        await choose("Das Sommerfest");
        await page
          .getByRole("button", { name: "Inspektor ein-/ausblenden" })
          .click();
        await page
          .getByLabel("Titel im Buch anzeigen", { exact: true })
          .uncheck();
        await saved();
        await close();
        await launch();
        await expect(
          page.getByLabel("Titel im Buch anzeigen", { exact: true }),
        ).not.toBeChecked();
      },
    );
    await check(
      "Excluding scene prose removes it from reader without excluding sibling scenes",
      async () => {
        await choose("Zweite interne Szene");
        await page
          .getByLabel("Text in Buchausgabe aufnehmen", { exact: true })
          .uncheck();
        await saved();
        await page
          .getByRole("tab", { name: "Buch lesen", exact: true })
          .click();
        await expect(page.locator(".reader-book")).not.toContainText(
          "ZWEITER SZENENTEXT",
        );
        await expect(page.locator(".reader-book")).toContainText("PROLOGTEXT");
      },
    );
    await check('Publication settings survive reopening and reader follows them',async()=>{
      await page.getByRole('button',{name:'Buchausgabe einstellen',exact:true}).click();
      await page.getByLabel('Titel und Autor voranstellen',{exact:true}).uncheck();
      await page.getByRole('button',{name:'Schließen',exact:true}).click();
      await saved();await close();await launch();
      await expect(page.locator('.reader-title')).toHaveCount(0);
      assert.equal(JSON.parse(fs.readFileSync(file)).exportOptions.titlePage,false);
    });
    await check('Combined manuscript resumes its active editor; all tabs fit the minimum window',async()=>{
      await page.getByRole('tab',{name:'Manuskript',exact:true}).click();
      await page.getByRole('button',{name:'Das Sommerfest im Zusammenhang bearbeiten',exact:true}).click();
      await close();await launch();
      await expect(page.getByRole('textbox',{name:'Manuskripttext: Das Sommerfest',exact:true})).toContainText('Absatz 0');
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1080,760));
      await expect(page.getByRole('tab',{name:'Buch lesen',exact:true})).toBeInViewport();
      await page.getByRole('tab',{name:'Buch lesen',exact:true}).click();
      await page.screenshot({path:path.join(root,'test-results/reader-compact.png')});
    });
    assert.deepEqual(errors, []);
    await close();
    fs.writeFileSync(
      path.join(
        root,
        "test-results",
        packaged ? "reader-packaged-report.json" : "reader-ui-report.json",
      ),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          checks,
          packaged,
          passed: true,
          artifacts: dir,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(e);
    if (page && !page.isClosed())
      await page
        .screenshot({
          path: path.join(root, "test-results/reader-failure.png"),
        })
        .catch(() => {});
    if (app) await app.evaluate(({ app }) => app.exit(1)).catch(() => {});
    process.exitCode = 1;
  }
})();
