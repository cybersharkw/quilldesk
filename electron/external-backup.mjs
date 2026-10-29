import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { validateProject } from "../shared/model.mjs";
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
export class ExternalBackup {
  constructor(onStatus = () => {}) {
    this.folder = null;
    this.pending = new Map();
    this.written = new Map();
    this.running = null;
    this.lastAttempt = 0;
    this.onStatus = onStatus;
    this.status = { state: "disabled", folder: null };
    this.timer = setInterval(() => this.flush().catch(() => {}), 60000);
    this.timer.unref();
  }
  emit(values) {
    this.status = { ...this.status, ...values, folder: this.folder };
    this.onStatus(this.status);
    return this.status;
  }
  configure(folder) {
    if (this.running)
      throw new Error("Eine Sicherung läuft noch. Bitte kurz warten.");
    if (
      folder !== null &&
      (!path.isAbsolute(folder) ||
        !fs.existsSync(folder) ||
        !fs.statSync(folder).isDirectory())
    )
      throw new Error(
        "Bitte einen vorhandenen lokalen oder synchronisierten Ordner wählen.",
      );
    this.folder = folder;
    this.pending.clear();
    this.written.clear();
    this.lastAttempt = 0;
    return this.emit({
      state: folder ? "ready" : "disabled",
      error: null,
      lastCopyAt: null,
      lastFile: null,
    });
  }
  queue(project) {
    if (!this.folder || !project) return;
    validateProject(project);
    const raw = JSON.stringify(project, null, 2);
    const key = hash(project.id).slice(0, 24);
    const checksum = hash(raw);
    if (this.written.get(key) === checksum) return;
    this.pending.set(key, { raw, checksum, id: project.id });
    if (this.status.state !== "error") this.emit({ state: "pending" });
    if (Date.now() - this.lastAttempt >= 60000) this.flush().catch(() => {});
  }
  flush() {
    if (this.running) return this.running;
    if (!this.folder || !this.pending.size) return Promise.resolve(this.status);
    const folder = this.folder;
    this.lastAttempt = Date.now();
    this.emit({ state: "copying", error: null });
    this.running = (async () => {
      // A missing/disconnected sync root must not be silently recreated as an unsynced folder.
      if (!(await fsp.stat(folder)).isDirectory())
        throw new Error("Sicherungsordner ist nicht verfügbar.");
      for (const [key, entry] of [...this.pending]) {
        const dir = path.join(folder, "QuillDesk-Sicherungen", key);
        await fsp.mkdir(dir, { recursive: true });
        const file = path.join(
          dir,
          `quilldesk-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}.quill`,
        );
        const temp = file + ".tmp";
        let fd;
        try {
          fd = await fsp.open(temp, "wx");
          await fd.writeFile(entry.raw, "utf8");
          await fd.sync();
          await fd.close();
          fd = null;
          await fsp.rename(temp, file);
          const written = await fsp.readFile(file);
          if (hash(written) !== entry.checksum)
            throw new Error("Sicherung konnte nicht verifiziert werden.");
          validateProject(JSON.parse(written.toString("utf8")));
        } finally {
          await fd?.close();
          await fsp.unlink(temp).catch(() => {});
        }
        this.written.set(key, entry.checksum);
        if (this.pending.get(key) === entry) this.pending.delete(key);
        this.emit({
          state: this.pending.size ? "pending" : "written",
          lastCopyAt: new Date().toISOString(),
          lastFile: file,
          error: null,
        });
      }
      return this.status;
    })()
      .catch((e) => {
        this.emit({ state: "error", error: e.message });
        throw e;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
  async flushAll() {
    while (this.pending.size) {
      await this.flush();
    }
    return this.status;
  }
  close() {
    clearInterval(this.timer);
  }
}
