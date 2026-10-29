import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "./store.mjs";

export class LastProjectSession {
  constructor(file) {
    this.file = file;
    this.last = null;
    this.warning = "";
  }
  read() {
    let failure;
    for (const candidate of [this.file, this.file + ".previous"]) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (
          typeof data.file !== "string" ||
          !path.isAbsolute(data.file) ||
          path.extname(data.file).toLowerCase() !== ".quill"
        )
          throw new Error("Ungültiger letzter Projektspeicherort.");
        this.last = {
          file: data.file,
          title:
            typeof data.title === "string"
              ? data.title
              : path.basename(data.file, ".quill"),
        };
        return this.last;
      } catch (e) {
        failure = e;
      }
    }
    if (failure)
      this.warning =
        "Der zuletzt verwendete Speicherort konnte nicht gelesen werden: " +
        failure.message;
    return null;
  }
  remember(file, title) {
    if (!file) return;
    this.last = { file: path.resolve(file), title };
    const raw = JSON.stringify(this.last);
    // Keep an independent copy of the most recent successful location.
    for (const target of [this.file, this.file + ".previous"]) {
      if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== raw)
        atomicWrite(target, raw);
    }
    this.warning = "";
  }
}
