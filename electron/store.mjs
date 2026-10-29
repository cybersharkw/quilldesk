import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateProject } from "../shared/model.mjs";

export const MAX_BYTES = 50 * 1024 * 1024;
const digest = (data) => crypto.createHash("sha256").update(data).digest("hex");
export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, "wx");
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
export function readProject(file) {
  if (fs.statSync(file).size > MAX_BYTES)
    throw new Error("Projektdatei ist größer als 50 MB.");
  const raw = fs.readFileSync(file);
  return {
    project: validateProject(JSON.parse(raw.toString("utf8"))),
    hash: digest(raw),
    raw,
  };
}
export class ProjectStore {
  constructor() {
    this.file = null;
    this.hash = null;
    this.project = null;
    this.lastBackup = 0;
  }
  open(file) {
    const data = readProject(file);
    this.file = path.resolve(file);
    this.hash = data.hash;
    this.project = data.project;
    this.lastBackup = 0;
    return this.info();
  }
  info() {
    return { project: this.project, file: this.file };
  }
  create(file, project) {
    if (fs.existsSync(file))
      throw new Error(
        "Die Datei existiert bereits. Bitte wählen Sie einen neuen Dateinamen.",
      );
    validateProject(project);
    const data = JSON.stringify(project, null, 2);
    if (Buffer.byteLength(data) > MAX_BYTES)
      throw new Error("Projekt ist größer als 50 MB.");
    // Exclusive creation prevents a file appearing between the dialog and this operation from being overwritten.
    const fd = fs.openSync(file, "wx");
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return this.open(file);
  }
  checkConflict() {
    if (!this.file) throw new Error("Noch kein Speicherort.");
    if (
      !fs.existsSync(this.file) ||
      digest(fs.readFileSync(this.file)) !== this.hash
    )
      throw new Error(
        "Die Projektdatei wurde außerhalb von QuillDesk geändert oder verschoben. Speichern Sie Ihre Änderungen als neues Projekt, um beide Fassungen zu behalten.",
      );
  }
  backup(raw, reason = "auto") {
    const dir = this.file + ".backups";
    fs.mkdirSync(dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${reason}-${crypto.randomUUID().slice(0, 8)}.quill`;
    atomicWrite(path.join(dir, name), raw);
    const entries = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".quill") && n.includes("-auto-"))
      .sort()
      .reverse();
    for (const name of entries.slice(120)) fs.unlinkSync(path.join(dir, name));
    this.lastBackup = Date.now();
    return name;
  }
  save(project, forceBackup = false) {
    validateProject(project);
    if (this.project && project.id !== this.project.id)
      throw new Error("Projekt-ID stimmt nicht überein.");
    this.checkConflict();
    const next = { ...project, updatedAt: new Date().toISOString() };
    const data = JSON.stringify(next, null, 2);
    if (Buffer.byteLength(data) > MAX_BYTES)
      throw new Error(
        "Projekt ist größer als 50 MB. Bitte große Texte auf mehrere Projekte verteilen.",
      );
    const previous = fs.readFileSync(this.file);
    // All recovery writes must succeed before replacing the live project.
    atomicWrite(this.file + ".previous", previous);
    if (forceBackup || Date.now() - this.lastBackup >= 60000)
      this.backup(previous, forceBackup ? "manual" : "auto");
    atomicWrite(this.file, data);
    this.hash = digest(data);
    this.project = next;
    return { savedAt: next.updatedAt, file: this.file };
  }
  checkpoint() {
    this.checkConflict();
    return this.backup(fs.readFileSync(this.file), "manual");
  }
  listBackups() {
    if (!this.file) return [];
    const dir = this.file + ".backups";
    const result = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((n) => n.endsWith(".quill"))
          .sort()
          .reverse()
          .map((name) => ({
            name,
            date: fs.statSync(path.join(dir, name)).mtime.toISOString(),
          }))
      : [];
    if (fs.existsSync(this.file + ".previous"))
      result.unshift({
        name: "previous",
        date: fs.statSync(this.file + ".previous").mtime.toISOString(),
      });
    return result;
  }
  restore(name) {
    this.checkConflict();
    if (name !== "previous" && !this.listBackups().some((n) => n.name === name))
      throw new Error("Unbekannte Sicherung.");
    const restored = readProject(
      name === "previous"
        ? this.file + ".previous"
        : path.join(this.file + ".backups", name),
    ).project;
    if (restored.id !== this.project.id)
      throw new Error("Sicherung gehört zu einem anderen Projekt.");
    this.backup(fs.readFileSync(this.file), "before-restore");
    this.save(restored);
    return this.info();
  }
}
