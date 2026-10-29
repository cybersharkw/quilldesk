const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  session,
  shell,
  protocol,
  net,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const TEST = !app.isPackaged && process.env.QUILLDESK_TEST === "1";
if (TEST && process.env.QUILLDESK_TEST_HOME)
  app.setPath("userData", process.env.QUILLDESK_TEST_HOME);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "quilldesk",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
if (!app.requestSingleInstanceLock()) app.quit();
else
  start().catch((e) => {
    dialog.showErrorBox("QuillDesk konnte nicht starten", e.message);
    app.quit();
  });
async function start() {
  const { ProjectStore, atomicWrite, readProject } =
    await import("./store.mjs");
  const { newProject, validateProject } = await import("../shared/model.mjs");
  const { compileText, compileDocx, compileHtml } =
    await import("./export.mjs");
  const { publicationOptions } = await import("../shared/publication.mjs");
  const { importTextFile } = await import("./import.mjs");
  const { ExternalBackup } = await import("./external-backup.mjs");
  const { SpellingService } = require("./spelling.cjs");
  const spelling = new SpellingService();
  const store = new ProjectStore();
  const { LastProjectSession } = await import("./session.mjs");
  let win,
    closing = false,
    closeRequested = false;
  await app.whenReady();
  const configFile = path.join(app.getPath("userData"), "session.json");
  const lastSession = new LastProjectSession(configFile);
  const { WorkspaceStore } = await import("./workspace.mjs");
  const workspaceStore = new WorkspaceStore(
    path.join(app.getPath("userData"), "workspaces"),
  );
  const backupConfigFile = path.join(
    app.getPath("userData"),
    "backup-settings.json",
  );
  const external = new ExternalBackup((status) => {
    if (win && !win.isDestroyed())
      win.webContents.send("backup-status", status);
  });
  try {
    if (fs.existsSync(backupConfigFile)) {
      const config = JSON.parse(fs.readFileSync(backupConfigFile, "utf8"));
      if (typeof config.folder === "string" && path.isAbsolute(config.folder)) {
        external.folder = config.folder;
        external.emit({ state: "ready" });
      }
    }
  } catch (e) {
    external.emit({ state: "error", error: e.message });
  }
  const track = (result) => {
    external.queue(store.project);
    return {
      ...result,
      workspace: workspaceStore.read(store.file, store.project),
      lastProject: lastSession.last,
      warning: startupError,
    };
  };
  let startupError = "";
  const remember = () => {
    try {
      lastSession.remember(store.file, store.project?.title);
      startupError = "";
    } catch (e) {
      startupError =
        "Projekt gespeichert, aber letzter Speicherort konnte nicht gemerkt werden: " +
        e.message;
    }
  };
  try {
    const c = lastSession.read();
    startupError = lastSession.warning;
    if (c) {
      store.open(c.file);
      remember();
    }
  } catch (e) {
    startupError =
      "Das letzte Projekt konnte nicht geöffnet werden: " +
      e.message +
      " Öffnen Sie bei Bedarf eine Sicherung aus dem Ordner <Projekt>.backups.";
  }
  protocol.handle("quilldesk", (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Forbidden", { status: 403 });
    const relative = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    const root = path.join(__dirname, "../dist");
    const target = path.resolve(root, "." + relative);
    if (!target.startsWith(root + path.sep))
      return new Response("Forbidden", { status: 403 });
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    }[path.extname(target)];
    if (!mime || !fs.existsSync(target))
      return new Response("Not found", { status: 404 });
    return new Response(fs.readFileSync(target), {
      headers: { "Content-Type": mime },
    });
  });
  session.defaultSession.setPermissionRequestHandler((_, __, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
    callback({
      cancel:
        !details.url.startsWith("quilldesk://app/") &&
        !details.url.startsWith("devtools://") &&
        !details.url.startsWith("data:"),
    }),
  );
  const getSavePath = async (title, defaultPath, extensions) => {
    const answer = await dialog.showSaveDialog(win, {
      title,
      defaultPath,
      filters: [{ name: "QuillDesk", extensions }],
    });
    return answer.canceled ? null : answer.filePath;
  };
  const safeName = (title) =>
    title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100) || "Roman";
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame ||
        !event.senderFrame.url.startsWith("quilldesk://app/")
      )
        throw new Error("Unzulässiger Aufruf.");
      try {
        return { ok: true, value: await fn(...args) };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    });
  }
  handle("boot", () => {
    external.queue(store.project);
    return {
      ...store.info(),
      warning: startupError,
      lastProject: lastSession.last,
      workspace: workspaceStore.read(store.file, store.project),
      externalBackup: external.status,
    };
  });
  handle("resume", () => {
    if (!lastSession.last)
      throw new Error("Es ist noch kein letztes Projekt gespeichert.");
    const result = store.open(lastSession.last.file);
    remember();
    return track(result);
  });
  handle("save-workspace", (file, projectId, state) => {
    if (!store.file || file !== store.file || projectId !== store.project?.id)
      throw new Error(
        "Die Schreibposition gehört nicht zum geöffneten Projekt.",
      );
    if (JSON.stringify(state).length > 2000000)
      throw new Error("Zu viele gespeicherte Schreibpositionen.");
    workspaceStore.save(store.file, store.project, state);
    return true;
  });
  handle("spell-check", (language, words) => spelling.request(language, words));
  handle("spell-suggest", (language, word) =>
    spelling.request(language, undefined, word),
  );
  handle("backup-status", () => external.status);
  handle("backup-folder", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Google-Drive-Sicherungsordner wählen",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    const folder = path.resolve(result.filePaths[0]);
    external.configure(folder);
    atomicWrite(backupConfigFile, JSON.stringify({ folder }));
    external.queue(store.project);
    if (store.project) await external.flushAll();
    return external.status;
  });
  handle("backup-now", async () => {
    external.queue(store.project);
    return external.flushAll();
  });
  handle("backup-disable", () => {
    external.configure(null);
    atomicWrite(backupConfigFile, JSON.stringify({ folder: null }));
    return external.status;
  });
  handle("backup-reveal", () => {
    if (external.status.lastFile)
      shell.showItemInFolder(external.status.lastFile);
  });
  handle("create", async (title) => {
    const p = newProject(
      typeof title === "string" ? title.slice(0, 200) : "Mein Roman",
    );
    const file = await getSavePath(
      "Neues Projekt speichern",
      safeName(p.title) + ".quill",
      ["quill"],
    );
    if (!file) return null;
    const result = store.create(file, p);
    remember();
    return track(result);
  });
  handle("open", async () => {
    const answer = await dialog.showOpenDialog(win, {
      title: "QuillDesk-Projekt oder Sicherung öffnen",
      properties: ["openFile"],
      filters: [
        { name: "QuillDesk-Projekt", extensions: ["quill", "previous"] },
      ],
    });
    if (answer.canceled) return null;
    const file = answer.filePaths[0];
    if (
      file.endsWith(".previous") ||
      path.dirname(file).endsWith(".backups") ||
      (/^quilldesk-\d{4}-.*\.quill$/.test(path.basename(file)) &&
        path.basename(path.dirname(path.dirname(file))) ===
          "QuillDesk-Sicherungen")
    )
      return {
        project: readProject(file).project,
        file: null,
        warning:
          "Sicherung geöffnet. Wählen Sie Speichern, um daraus eine neue Projektdatei anzulegen. Die Sicherung bleibt unverändert.",
      };
    const result = store.open(file);
    remember();
    return track(result);
  });
  handle("save", (p) => {
    const result = store.save(p);
    remember();
    external.queue(store.project);
    return { ...result, warning: startupError };
  });
  handle("save-as", async (p) => {
    validateProject(p);
    const file = await getSavePath(
      "Projekt als neue Datei speichern",
      safeName(p.title) + " - Kopie.quill",
      ["quill"],
    );
    if (!file) return null;
    const result = store.create(file, p);
    remember();
    return track(result);
  });
  handle("backups", () => store.listBackups());
  handle("checkpoint", () => store.checkpoint());
  handle("restore", (name) => track(store.restore(name)));
  handle("import", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Texte importieren · Originale bleiben unverändert",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Texte", extensions: ["txt", "md", "docx"] }],
    });
    if (result.canceled) return null;
    if (result.filePaths.length > 20)
      throw new Error("Bitte höchstens 20 Dateien auf einmal importieren.");
    const items = [];
    for (const file of result.filePaths) items.push(await importTextFile(file));
    return items;
  });
  handle("export", async (p, format, options = {}) => {
    validateProject(p);
    if (!["txt", "docx", "pdf"].includes(format))
      throw new Error("Unbekanntes Exportformat.");
    const file = await getSavePath(
      "Manuskript exportieren",
      safeName(p.title) + "." + format,
      [format],
    );
    if (!file) return null;
    if (path.extname(file).toLowerCase() !== "." + format)
      throw new Error(
        "Bitte einen Dateinamen mit der Endung ." + format + " wählen.",
      );
    if (
      store.file &&
      (path.resolve(file).toLowerCase() === store.file.toLowerCase() ||
        path.resolve(file).toLowerCase() ===
          (store.file + ".previous").toLowerCase())
    )
      throw new Error("Ein Export darf die Projektdatei nicht überschreiben.");
    options = publicationOptions({ ...p.exportOptions, ...options });
    let data;
    if (format === "txt") data = compileText(p, options);
    if (format === "docx") data = await compileDocx(p, options);
    if (format === "pdf") {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          javascript: false,
        },
      });
      try {
        await printWindow.loadURL(
          "data:text/html;charset=utf-8," +
            encodeURIComponent(compileHtml(p, options)),
        );
        data = await printWindow.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: options.pageNumbers !== false,
          headerTemplate: "<span></span>",
          footerTemplate:
            '<div style="width:100%;text-align:center;font:10px Arial;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        });
      } finally {
        printWindow.destroy();
      }
    }
    atomicWrite(file, data);
    return { file, bytes: Buffer.byteLength(data) };
  });
  handle("reveal", () => {
    if (store.file) shell.showItemInFolder(store.file);
  });
  handle("close-ready", async () => {
    remember();
    let timeout;
    try {
      await Promise.race([
        external.flushAll(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Der zusätzliche Sicherungsordner antwortet nicht rechtzeitig.",
                ),
              ),
            5000,
          );
        }),
      ]);
    } catch (e) {
      const result = await dialog.showMessageBox(win, {
        type: "warning",
        title: "Lokal gespeichert · zusätzliche Sicherung ausstehend",
        message:
          "Ihr Projekt ist lokal gespeichert. Die zusätzliche Sicherung ist noch nicht bestätigt.",
        detail: e.message,
        buttons: ["Zurück", "Trotzdem schließen"],
        defaultId: 0,
        cancelId: 0,
      });
      if (result.response === 0) {
        closeRequested = false;
        return;
      }
    } finally {
      clearTimeout(timeout);
    }
    closing = true;
    win.close();
  });
  handle("close-failed", async (message) => {
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      title: "Änderungen sind nicht gespeichert",
      message:
        "QuillDesk bleibt geöffnet, damit Sie Ihre Arbeit sichern können.",
      detail: String(message).slice(0, 1000),
      buttons: ["Zurück zum Schreiben", "Ohne Speichern schließen"],
      defaultId: 0,
      cancelId: 0,
    });
    closeRequested = false;
    if (result.response === 1) {
      closing = true;
      win.close();
    }
  });
  win = new BrowserWindow({
    width: 1480,
    height: 950,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#f4f2ec",
    title: "QuillDesk",
    icon: path.join(__dirname, "../assets/quilldesk.ico"),
    show: !TEST,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.on("close", (event) => {
    if (!closing) {
      event.preventDefault();
      if (!closeRequested) {
        closeRequested = true;
        win.webContents.send("request-close");
      }
    }
  });
  win.webContents.on("render-process-gone", async () => {
    closeRequested = false;
    const r = await dialog.showMessageBox(win, {
      type: "error",
      message:
        "Die Schreibansicht wurde beendet. Ihr zuletzt gespeicherter Stand bleibt erhalten.",
      buttons: ["Neu laden", "Beenden"],
    });
    if (r.response === 0) win.reload();
    else {
      closing = true;
      win.close();
    }
  });
  app.on("second-instance", () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    external.close();
    spelling.close();
  });
  const action = (name) => () => win.webContents.send("menu", name);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Projekt",
        submenu: [
          { label: "Neu …", accelerator: "CmdOrCtrl+N", click: action("new") },
          {
            label: "Öffnen …",
            accelerator: "CmdOrCtrl+O",
            click: action("open"),
          },
          {
            label: "Speichern",
            accelerator: "CmdOrCtrl+S",
            click: action("save"),
          },
          {
            label: "Speichern unter …",
            accelerator: "CmdOrCtrl+Shift+S",
            click: action("saveAs"),
          },
          { type: "separator" },
          { label: "Texte importieren …", click: action("import") },
          {
            label: "Manuskript exportieren …",
            accelerator: "CmdOrCtrl+Shift+E",
            click: action("export"),
          },
          { label: "Sicherungen …", click: action("backups") },
          { type: "separator" },
          { role: "quit", label: "Beenden" },
        ],
      },
      {
        label: "Bearbeiten",
        submenu: [
          { role: "undo", label: "Rückgängig" },
          { role: "redo", label: "Wiederholen" },
          { type: "separator" },
          { role: "cut", label: "Ausschneiden" },
          { role: "copy", label: "Kopieren" },
          { role: "paste", label: "Einfügen" },
          { role: "selectAll", label: "Alles auswählen" },
        ],
      },
      {
        label: "Ansicht",
        submenu: [
          { label: "Fokusmodus", accelerator: "F11", click: action("focus") },
          {
            label: "Suche",
            accelerator: "CmdOrCtrl+Shift+F",
            click: action("search"),
          },
          { role: "resetZoom", label: "Zoom zurücksetzen" },
          { role: "zoomIn", label: "Vergrößern" },
          { role: "zoomOut", label: "Verkleinern" },
        ],
      },
      {
        label: "Hilfe",
        submenu: [{ label: "Kurzanleitung", click: action("help") }],
      },
    ]),
  );
  await win.loadURL("quilldesk://app/");
}
