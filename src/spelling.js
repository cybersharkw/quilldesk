import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
export const spellKey = new PluginKey("quill-spelling");
export function wordPositions(doc) {
  const words = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, undefined, " ");
    for (const match of text.matchAll(
      /[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu,
    )) {
      if (match[0].length > 1 && match[0].length <= 80)
        words.push({
          word: match[0],
          from: pos + 1 + match.index,
          to: pos + 1 + match.index + match[0].length,
        });
    }
    return false;
  });
  return words;
}
export const Spelling = Extension.create({
  name: "quillSpelling",
  addOptions() {
    return {
      getLanguage: () => "off",
      getWords: () => [],
      onStatus: () => {},
      onWord: () => {},
    };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: spellKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, previous) {
            const result = tr.getMeta(spellKey);
            if (Array.isArray(result))
              return DecorationSet.create(
                tr.doc,
                result.map((w) =>
                  Decoration.inline(w.from, w.to, {
                    class: "misspelled",
                    "data-spelling-word": w.word,
                  }),
                ),
              );
            return tr.docChanged || result === "clear"
              ? DecorationSet.empty
              : previous;
          },
        },
        props: {
          decorations: (state) => spellKey.getState(state),
          handleDOMEvents: {
            contextmenu(view, event) {
              const el = event.target.closest?.("[data-spelling-word]");
              if (!el) return false;
              event.preventDefault();
              const position = view.posAtDOM(el, 0);
              const found = spellKey
                .getState(view.state)
                .find(position, position + el.textContent.length)
                .find((d) => d.from <= position && d.to >= position);
              if (found)
                options.onWord({
                  word: el.getAttribute("data-spelling-word"),
                  from: found.from,
                  to: found.to,
                });
              return true;
            },
          },
        },
        view(view) {
          let timer,
            sequence = 0,
            alive = true,
            lastConfig = "";
          const config = () =>
            options.getLanguage() + JSON.stringify(options.getWords());
          const schedule = () => {
            clearTimeout(timer);
            lastConfig = config();
            const seq = ++sequence;
            const language = options.getLanguage();
            if (language === "off") {
              options.onStatus("Aus");
              return;
            }
            options.onStatus("Prüft …");
            timer = setTimeout(async () => {
              try {
                const snapshot = view.state.doc;
                const positions = wordPositions(snapshot);
                const ignored = new Set(options.getWords());
                const words = [...new Set(positions.map((w) => w.word))].filter(
                  (w) => !ignored.has(w),
                );
                const wrong = new Set();
                for (let i = 0; i < words.length; i += 3000) {
                  const r = await window.quill.spellCheck(
                    language,
                    words.slice(i, i + 3000),
                  );
                  if (!r.ok) throw new Error(r.error);
                  for (const w of r.value) wrong.add(w);
                  if (!alive || seq !== sequence) return;
                }
                if (!alive || seq !== sequence || snapshot !== view.state.doc)
                  return;
                view.dispatch(
                  view.state.tr.setMeta(
                    spellKey,
                    positions.filter((w) => wrong.has(w.word)),
                  ),
                );
                options.onStatus(
                  `${wrong.size} ${wrong.size === 1 ? "Hinweis" : "Hinweise"}`,
                );
              } catch (e) {
                if (alive && seq === sequence)
                  options.onStatus("Nicht verfügbar: " + e.message);
              }
            }, 650);
          };
          schedule();
          return {
            update(next, prev) {
              if (next.state.doc !== prev.doc || lastConfig !== config())
                schedule();
            },
            destroy() {
              alive = false;
              clearTimeout(timer);
              sequence++;
            },
          };
        },
      }),
    ];
  },
});
