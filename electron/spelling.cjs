const { Worker } = require("node:worker_threads");
const path = require("node:path");
class SpellingService {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.sequence = 0;
  }
  request(language, words, word) {
    if (!["de", "en"].includes(language))
      throw new Error("Unbekannte Wörterbuchsprache.");
    if (word !== undefined) {
      if (typeof word !== "string" || word.length > 45 || !word.length)
        throw new Error("Ungültiges Wort.");
    } else if (
      !Array.isArray(words) ||
      words.length > 3000 ||
      words.some((w) => typeof w !== "string" || w.length > 80)
    )
      throw new Error("Zu viele oder ungültige Wörter.");
    if (!this.worker) {
      this.worker = new Worker(path.join(__dirname, "spelling-worker.cjs"));
      this.worker.on("message", ({ id, result, error }) => {
        const entry = this.pending.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(id);
        error ? entry.reject(new Error(error)) : entry.resolve(result);
      });
      this.worker.on("error", (e) => {
        for (const entry of this.pending.values()) {
          clearTimeout(entry.timer);
          entry.reject(e);
        }
        this.pending.clear();
        this.worker = null;
      });
      this.worker.unref();
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Wörterbuch antwortet nicht. Bitte Rechtschreibprüfung erneut einschalten.",
          ),
        );
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, language, words, word });
    });
  }
  close() {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Anwendung geschlossen."));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
module.exports = { SpellingService };
