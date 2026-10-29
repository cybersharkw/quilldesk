const { _electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const executablePath = path.resolve(
  root,
  "../releases/0.3.0/QuillDesk-win32-x64/QuillDesk.exe",
);
(async () => {
  let app;
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({
      executablePath,
      env,
      args: [
        "--user-data-dir=" + path.resolve(root, "../../work/packaged-profile-v021"),
      ],
      timeout: 45000,
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector(".appbar");
    const metadata = await app.evaluate(({ app, BrowserWindow }) => {
      return {
        packaged: app.isPackaged,
        version: app.getVersion(),
        profile: app.getPath("userData"),
      };
    });
    console.log("PACKAGE METADATA", metadata);
    assert.equal(metadata.packaged, true);
    assert.equal(metadata.version, "0.3.0");
    await page
      .getByRole("button", { name: /Mit einem Beispiel ausprobieren/ })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Szenentext" }),
    ).toContainText("Jede Geschichte beginnt");
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    assert.equal(await page.evaluate(() => typeof window.process), "undefined");
    await page.screenshot({
      path: path.resolve(root, "../QuillDesk-preview.png"),
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(root, "test-results/packaged-report.json"),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          ...metadata,
          checks: [
            "Packaged executable launches",
            "Bundled resources load offline",
            "Sample project and rich editor render",
            "Renderer has no Node access",
            "No renderer exceptions",
          ],
          rendererErrors: errors,
        },
        null,
        2,
      ),
    );
    await app.evaluate(({ app }) => app.exit(0));
    console.log("PACKAGED WINDOWS SMOKE TEST PASSED", metadata);
  } catch (e) {
    console.error(e);
    if (app) await app.evaluate(({ app }) => app.exit(1)).catch(() => {});
    process.exitCode = 1;
  }
})();
