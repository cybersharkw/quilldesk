const { parentPort } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");
const nspell = require("nspell");
const dictionaries = new Map();
function dictionary(language) {
  if (!dictionaries.has(language)) {
    const base = path.dirname(
      require.resolve(language === "en" ? "dictionary-en" : "dictionary-de"),
    );
    dictionaries.set(
      language,
      nspell(
        fs.readFileSync(path.join(base, "index.aff")),
        fs.readFileSync(path.join(base, "index.dic")),
      ),
    );
  }
  return dictionaries.get(language);
}
parentPort.on("message", ({ id, language, words, word }) => {
  try {
    const spell = dictionary(language);
    const result =
      word !== undefined
        ? spell.suggest(word).slice(0, 6)
        : words.filter((w) => !spell.correct(w));
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message });
  }
});
