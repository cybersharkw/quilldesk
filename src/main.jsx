import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { Spelling, spellKey } from "./spelling";
import { publicationOptions, hasHeading } from "../shared/publication.mjs";
import {
  Feather,
  BookOpen,
  Folder,
  FileText,
  Users,
  Globe,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PanelRight,
  LayoutGrid,
  List,
  AlignLeft,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Trash2,
  RotateCcw,
  Save,
  FolderOpen,
  Download,
  Upload,
  History,
  Check,
  AlertCircle,
  X,
  Bold,
  Italic,
  Underline,
  Highlighter,
  ListOrdered,
  List as ListIcon,
  Quote,
  Undo2,
  Redo2,
  ArrowUp,
  ArrowDown,
  Settings,
  Target,
  HelpCircle,
  Copy,
  Columns2,
  BookText,
  Cloud,
} from "lucide-react";
import {
  ROOTS,
  LABELS,
  STATUSES,
  newProject,
  makeNode,
  emptyDoc,
  textDoc,
  plainText,
  wordCount,
  children,
  descendants,
  isUnder,
  moveNode,
  trashNode,
  restoreNode,
  manuscript,
  manuscriptWords,
} from "../shared/model.mjs";
import "./style.css";

const api = window.quill;
const EMPTY_WORDS = [];
async function call(method, ...args) {
  if (!api) throw new Error("Bitte QuillDesk als Desktop-App starten.");
  const r = await api[method](...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const number = (n) => new Intl.NumberFormat("de-DE").format(n);
const date = (d) =>
  new Date(d).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const icons = {
  manuscript: BookOpen,
  research: FolderOpen,
  characters: Users,
  world: Globe,
};
function IconButton({ icon: Icon, label, children, ...props }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={17} />
      {children}
    </button>
  );
}
function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const first = ref.current?.querySelector("input,select,textarea,button");
    first?.focus();
    return () => before?.focus();
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const all = [
              ...ref.current.querySelectorAll(
                "button,input,select,textarea,a[href]",
              ),
            ].filter((x) => !x.disabled);
            const first = all[0],
              last = all.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <IconButton icon={X} label="Dialog schließen" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
function ProjectWordsEditor({ words, onChange }) {
  const [draft, setDraft] = useState(() => words.join("\n"));
  return (
    <textarea
      aria-label="Projektwörter"
      placeholder="Ein Wort pro Zeile"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(
          [
            ...new Set(
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ]
            .filter((s) => s.length <= 80)
            .slice(0, 5000),
        );
      }}
    />
  );
}
function EditorPane({
  node,
  onChange,
  spelling = "de",
  personalWords = [],
  onSpellingChange = () => {},
  onLearnWord = () => {},
  textLabel = "Szenentext",
  embedded = false,
  getPosition = () => null,
  onPosition = () => {},
  visibility = () => ({ included: true, heading: true }),
  resumeFocus = true,
}) {
  const scrollRef = useRef(null),
    restoring = useRef(true),
    positionCallback = useRef(onPosition);
  positionCallback.current = onPosition;
  const capturePosition = ({ editor }) => {
    if (!restoring.current)
      positionCallback.current(node.id, {
        anchor: editor.state.selection.anchor,
        head: editor.state.selection.head,
        scrollTop: scrollRef.current?.scrollTop || 0,
      });
  };
  const callback = useRef(onChange);
  callback.current = onChange;
  const preferences = useRef({ spelling, personalWords });
  preferences.current = { spelling, personalWords };
  const [spellStatus, setSpellStatus] = useState("Prüft …");
  const [spellMenu, setSpellMenu] = useState(null);
  const wordHandler = useRef(() => {}),
    suggestionRequest = useRef(0);
  const [, render] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder: "Hier beginnt Ihre Geschichte …" }),
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Spelling.configure({
        getLanguage: () => preferences.current.spelling,
        getWords: () => preferences.current.personalWords,
        onStatus: setSpellStatus,
        onWord: (word) => wordHandler.current(word),
      }),
    ],
    content: node.doc,
    editorProps: {
      attributes: {
        class: "prose",
        role: "textbox",
        "aria-label": textLabel,
        "aria-multiline": "true",
        lang: "de",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      setSpellMenu(null);
      suggestionRequest.current++;
      callback.current(editor.getJSON());
      capturePosition({ editor });
    },
    onSelectionUpdate: capturePosition,
    onTransaction: () => render((n) => n + 1),
  });
  useEffect(() => {
    if (!editor) return;
    restoring.current = true;
    const position = getPosition(node.id),
      max = Math.max(1, editor.state.doc.content.size - 1);
    if (position) {
      editor.commands.setTextSelection({
        from: Math.max(1, Math.min(max, position.anchor)),
        to: Math.max(1, Math.min(max, position.head)),
      });
      if (resumeFocus) editor.view.focus();
    }
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current)
        scrollRef.current.scrollTop = position?.scrollTop || 0;
      restoring.current = false;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [editor, node.id]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(spellKey, "clear"));
      setSpellMenu(null);
    }
  }, [editor, spelling, personalWords]);
  useEffect(
    () => () => {
      suggestionRequest.current++;
    },
    [],
  );
  wordHandler.current = async (word) => {
    if (!editor) return;
    const request = ++suggestionRequest.current;
    const doc = editor.state.doc;
    setSpellMenu({ ...word, doc, loading: true, suggestions: [] });
    try {
      const suggestions =
        word.word.length <= 45
          ? await call("spellSuggest", spelling, word.word)
          : [];
      if (request === suggestionRequest.current)
        setSpellMenu({ ...word, doc, loading: false, suggestions });
    } catch (e) {
      if (request === suggestionRequest.current)
        setSpellMenu({
          ...word,
          doc,
          loading: false,
          suggestions: [],
          error: e.message,
        });
    }
  };
  if (!editor) return null;
  const tool = (label, Icon, cmd, active) => (
    <IconButton
      key={label}
      icon={Icon}
      label={label}
      aria-pressed={active || false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => cmd(editor.chain().focus()).run()}
    />
  );
  return (
    <div className={"editor-pane " + (embedded ? "embedded" : "")}>
      <div className="formatbar" role="toolbar" aria-label="Textformatierung">
        <select
          aria-label="Absatzformat"
          value={
            editor.isActive("heading", { level: 1 })
              ? "1"
              : editor.isActive("heading", { level: 2 })
                ? "2"
                : editor.isActive("heading", { level: 3 })
                  ? "3"
                  : "p"
          }
          onChange={(e) =>
            e.target.value === "p"
              ? editor.chain().focus().setParagraph().run()
              : editor
                  .chain()
                  .focus()
                  .toggleHeading({ level: Number(e.target.value) })
                  .run()
          }
        >
          <option value="p">Fließtext</option>
          <option value="1">Überschrift 1</option>
          <option value="2">Überschrift 2</option>
          <option value="3">Überschrift 3</option>
        </select>
        <span className="toolbar-rule" />
        {tool(
          "Fett · Strg+B",
          Bold,
          (c) => c.toggleBold(),
          editor.isActive("bold"),
        )}
        {tool(
          "Kursiv · Strg+I",
          Italic,
          (c) => c.toggleItalic(),
          editor.isActive("italic"),
        )}
        {tool(
          "Unterstrichen · Strg+U",
          Underline,
          (c) => c.toggleUnderline(),
          editor.isActive("underline"),
        )}
        {tool(
          "Hervorheben",
          Highlighter,
          (c) => c.toggleHighlight(),
          editor.isActive("highlight"),
        )}
        <span className="toolbar-rule" />
        {tool(
          "Aufzählung",
          ListIcon,
          (c) => c.toggleBulletList(),
          editor.isActive("bulletList"),
        )}
        {tool(
          "Nummerierte Liste",
          ListOrdered,
          (c) => c.toggleOrderedList(),
          editor.isActive("orderedList"),
        )}
        {tool(
          "Zitat",
          Quote,
          (c) => c.toggleBlockquote(),
          editor.isActive("blockquote"),
        )}
        <span className="toolbar-spacer" />
        {tool("Rückgängig · Strg+Z", Undo2, (c) => c.undo())}
        {tool("Wiederholen · Strg+Y", Redo2, (c) => c.redo())}
      </div>
      <div className="spelling-bar">
        <label>
          Rechtschreibung
          <select
            aria-label={`Rechtschreibung: ${textLabel}`}
            value={spelling}
            onChange={(e) => onSpellingChange(e.target.value)}
          >
            <option value="de">Deutsch · offline</option>
            <option value="en">English · offline</option>
            <option value="off">Aus</option>
          </select>
        </label>
        <button
          className="text-button"
          disabled={spelling === "off"}
          onClick={() => {
            const next =
              spellKey
                .getState(editor.state)
                ?.find()
                .find((d) => d.from >= editor.state.selection.to) ||
              spellKey.getState(editor.state)?.find()[0];
            if (next) {
              editor
                .chain()
                .focus()
                .setTextSelection({ from: next.from, to: next.to })
                .scrollIntoView()
                .run();
              wordHandler.current({
                word: editor.state.doc.textBetween(next.from, next.to),
                from: next.from,
                to: next.to,
              });
            }
          }}
        >
          {spellStatus} {spelling !== "off" && "· Nächster"}
        </button>
      </div>
      {spellMenu && (
        <div
          className="spelling-menu"
          role="dialog"
          aria-label="Rechtschreibvorschläge"
        >
          <header>
            <strong>{spellMenu.word}</strong>
            <IconButton
              icon={X}
              label="Rechtschreibvorschläge schließen"
              onClick={() => setSpellMenu(null)}
            />
          </header>
          <p>
            {spellMenu.loading
              ? "Vorschläge werden gesucht …"
              : spellMenu.error ||
                (!spellMenu.suggestions.length
                  ? "Kein Vorschlag gefunden."
                  : "Ersetzen durch:")}
          </p>
          <div className="spelling-suggestions">
            {spellMenu.suggestions.map((word) => (
              <button
                key={word}
                onClick={() => {
                  if (editor.state.doc === spellMenu.doc)
                    editor
                      .chain()
                      .focus()
                      .insertContentAt(
                        { from: spellMenu.from, to: spellMenu.to },
                        word,
                      )
                      .run();
                  setSpellMenu(null);
                }}
              >
                {word}
              </button>
            ))}
          </div>
          <button
            className="text-button"
            onClick={() => {
              onLearnWord(spellMenu.word);
              setSpellMenu(null);
            }}
          >
            Als Projektwort merken
          </button>
        </div>
      )}
      <div
        className="paper-scroll"
        ref={scrollRef}
        onScroll={() => editor && capturePosition({ editor })}
      >
        <article className="paper">
          <p className="paper-eyebrow">
            {node.kind === "note" ? "NOTIZ" : "MANUSKRIPT"} <span>•</span>{" "}
            {node.status}
          </p>
          <div
            className={
              "publication-badge " +
              (!visibility(node).included
                ? "excluded"
                : visibility(node).heading
                  ? "published"
                  : "internal")
            }
          >
            {!visibility(node).included
              ? "Nicht im Buch · Text und Titel bleiben intern"
              : visibility(node).heading
                ? "Titel und Text erscheinen im Buch"
                : "Interner Titel · nur der Text erscheint im Buch"}
          </div>
          <h1
            className={
              !visibility(node).included || !visibility(node).heading
                ? "internal-title"
                : ""
            }
          >
            {node.title || "Ohne Titel"}
          </h1>
          <EditorContent editor={editor} />
          <div className="paper-end">✦</div>
        </article>
      </div>
    </div>
  );
}
function RichText({ doc }) {
  const render = (node, key) => {
    if (node.type === "text") {
      let content = node.text;
      for (const mark of node.marks || []) {
        const tag = {
          bold: "strong",
          italic: "em",
          underline: "u",
          strike: "s",
          code: "code",
          highlight: "mark",
        }[mark.type];
        if (tag)
          content = React.createElement(tag, { key: mark.type }, content);
      }
      return <React.Fragment key={key}>{content}</React.Fragment>;
    }
    const tag =
      {
        doc: "div",
        paragraph: "p",
        heading: `h${node.attrs?.level || 2}`,
        bulletList: "ul",
        orderedList: "ol",
        listItem: "li",
        blockquote: "blockquote",
        hardBreak: "br",
        horizontalRule: "hr",
        codeBlock: "pre",
      }[node.type] || "div";
    return React.createElement(
      tag,
      {
        key,
        style: node.attrs?.textAlign
          ? { textAlign: node.attrs.textAlign }
          : undefined,
      },
      ["br", "hr"].includes(tag) ? undefined : (node.content || []).map(render),
    );
  };
  return <div className="prose">{render(doc, "doc")}</div>;
}
function RestorableScroll({
  className,
  initialScroll = 0,
  onScroll = () => {},
  children,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollTop = initialScroll;
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={className}
      ref={ref}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
    >
      {children}
    </div>
  );
}
function BookReader({ project, options, scroll, onScroll, onSettings }) {
  const entries = manuscript(project);
  return (
    <RestorableScroll
      className="book-reader"
      initialScroll={scroll}
      onScroll={onScroll}
    >
      <div className="reader-controls">
        <div>
          <p className="eyebrow">BUCH LESEN · LESERANSICHT</p>
          <p>
            Inhalt und Überschriften wie im Export. Die endgültige
            Seiteneinteilung sehen Sie im PDF.
          </p>
        </div>
        <button onClick={onSettings}>Buchausgabe einstellen</button>
      </div>
      <article
        className="reader-book"
        aria-label="Buch für Leser"
        style={{
          fontFamily: options.font,
          fontSize: options.fontSize + "pt",
          lineHeight: options.lineSpacing,
        }}
      >
        {options.titlePage && (
          <header className="reader-title">
            <h1>{project.title}</h1>
            <p>{project.author}</p>
          </header>
        )}
        {entries.map((n) => (
          <section
            key={n.id}
            className={n.kind === "folder" ? "reader-chapter" : "reader-scene"}
          >
            {hasHeading(n, options) &&
              (n.kind === "folder" ? <h1>{n.title}</h1> : <h2>{n.title}</h2>)}
            <RichText doc={n.doc} />
          </section>
        ))}
        {!entries.length && (
          <p>Noch keine Texte für die Buchausgabe ausgewählt.</p>
        )}
      </article>
    </RestorableScroll>
  );
}
function CombinedView({
  project,
  epoch,
  patchNode,
  editorProps,
  workspace,
  rememberWorkspace,
}) {
  const [editing, changeEditing] = useState(workspace.combinedEditing || null);
  const setEditing = (id) => {
    changeEditing(id);
    rememberWorkspace({ combinedEditing: id });
  };
  const entries = [];
  const walk = (id) => {
    for (const n of children(project, id)) {
      entries.push(n);
      if (n.kind === "folder") walk(n.id);
    }
  };
  walk("manuscript");
  return (
    <RestorableScroll
      className="combined-view"
      initialScroll={workspace.combinedScroll}
      onScroll={(combinedScroll) => rememberWorkspace({ combinedScroll })}
    >
      <div className="combined-intro">
        <p className="eyebrow">ALLES IM ZUSAMMENHANG</p>
        <h1>{project.title}</h1>
        <p>
          Alle Manuskript-Einträge in Schreibmappen-Reihenfolge. Klicken Sie
          einen Text an, um ihn zu bearbeiten. Hier sehen Sie auch interne
          Namen. „Buch lesen“ zeigt die Leseransicht.
        </p>
      </div>
      {entries.map((n) => (
        <section
          className={
            "combined-section " + (n.kind === "folder" ? "chapter" : "")
          }
          key={n.id}
          data-document-id={n.id}
        >
          <div className="combined-heading">
            <span>
              {n.kind === "folder" ? "KAPITEL" : "SZENE"} · {n.status}
              {!n.include ? " · nicht im Export" : ""}
            </span>
            <button onClick={() => setEditing(editing === n.id ? null : n.id)}>
              {editing === n.id ? "Lesen" : "Bearbeiten"}: {n.title}
            </button>
          </div>
          {editing === n.id ? (
            <EditorPane
              key={`${n.id}-${epoch}`}
              node={n}
              embedded
              {...editorProps}
              textLabel={`Manuskripttext: ${n.title}`}
              onChange={(doc) => patchNode(n.id, { doc })}
            />
          ) : (
            <div
              className="combined-read"
              role="button"
              tabIndex={0}
              aria-label={`${n.title} im Zusammenhang bearbeiten`}
              onClick={() => setEditing(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditing(n.id);
                }
              }}
            >
              <h2
                className={
                  !editorProps.visibility(n).included ||
                  !editorProps.visibility(n).heading
                    ? "internal-title"
                    : ""
                }
              >
                {n.title}
              </h2>
              <RichText doc={n.doc} />
              {!plainText(n.doc).trim() && (
                <p className="muted">Noch kein Text. Zum Schreiben klicken.</p>
              )}
            </div>
          )}
        </section>
      ))}
    </RestorableScroll>
  );
}
function App() {
  const workspaceRef = useRef({ positions: {} }),
    workspaceTimer = useRef(null),
    workspaceMeta = useRef({});

  const [booting, setBooting] = useState(true),
    [lastProject, setLastProject] = useState(null);
  const bootPending = useRef(true);
  const [project, setProject] = useState(null),
    [file, setFile] = useState(null),
    [selected, setSelected] = useState("first-scene"),
    [view, setView] = useState("editor");
  const [split, setSplit] = useState(false),
    [secondaryId, setSecondaryId] = useState(null),
    [externalBackup, setExternalBackup] = useState({ state: "disabled" });
  const [expanded, setExpanded] = useState(new Set([...ROOTS, "chapter-one"])),
    [inspector, setInspector] = useState(true),
    [focus, setFocus] = useState(false),
    [query, setQuery] = useState("");
  const [status, setStatus] = useState("loading"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [backups, setBackups] = useState([]),
    [epoch, setEpoch] = useState(0);
  const [newTitle, setNewTitle] = useState("Mein Roman"),
    [exportFormat, setExportFormat] = useState("docx"),
    [sessionGoal, setSessionGoal] = useState(500),
    [sessionStart, setSessionStart] = useState(0),
    [addKind, setAddKind] = useState("scene"),
    [addTitle, setAddTitle] = useState("");
  const pRef = useRef(null),
    fileRef = useRef(null),
    revision = useRef(0),
    savedRevision = useRef(0),
    timer = useRef(null),
    maxTimer = useRef(null),
    savePromise = useRef(null),
    actions = useRef({}),
    dragId = useRef(null),
    searchRef = useRef(null),
    mounted = useRef(true);
  const exportOptions = publicationOptions(project?.exportOptions);
  const setExportOptions = (value) =>
    update((p) => ({
      ...p,
      exportOptions: publicationOptions(
        typeof value === "function"
          ? value(publicationOptions(p.exportOptions))
          : value,
      ),
    }));
  workspaceMeta.current = { selected, view, split, secondaryId, inspector };
  async function flushWorkspace() {
    clearTimeout(workspaceTimer.current);
    if (!fileRef.current || !pRef.current || bootPending.current) return;
    return call("saveWorkspace", fileRef.current, pRef.current.id, {
      ...workspaceRef.current,
      ...workspaceMeta.current,
    });
  }
  function rememberWorkspace(patch = {}) {
    workspaceRef.current = { ...workspaceRef.current, ...patch };
    clearTimeout(workspaceTimer.current);
    if (fileRef.current && !bootPending.current)
      workspaceTimer.current = setTimeout(
        () =>
          flushWorkspace().catch((e) =>
            setError(
              "Schreibposition konnte nicht gespeichert werden: " + e.message,
            ),
          ),
        400,
      );
  }
  useEffect(() => {
    if (project && !booting) rememberWorkspace();
  }, [selected, view, split, secondaryId, inspector, booting]);
  const dirty = () => revision.current !== savedRevision.current;
  const load = useCallback((data) => {
    clearTimeout(timer.current);
    clearTimeout(maxTimer.current);
    maxTimer.current = null;
    clearTimeout(workspaceTimer.current);
    workspaceRef.current = { positions: {}, ...(data.workspace || {}) };
    pRef.current = data.project;
    fileRef.current = data.file;
    revision.current = 0;
    savedRevision.current = 0;
    setProject(data.project);
    if (data.lastProject) setLastProject(data.lastProject);
    setSplit(data.workspace?.split || false);
    setSecondaryId(data.workspace?.secondaryId || null);
    setInspector(data.workspace?.inspector !== false);
    if (data.externalBackup) setExternalBackup(data.externalBackup);
    setFile(data.file);
    setStatus(data.file ? "saved" : "unsaved");
    setError(data.warning || "");
    setSelected(
      data.workspace?.selected ||
        data.project?.nodes.find((n) => n.kind === "scene" && !n.trashed)?.id ||
        "manuscript",
    );
    setExpanded(
      new Set(
        data.project?.nodes
          .filter((n) => n.kind === "folder")
          .map((n) => n.id) || ROOTS,
      ),
    );
    setSessionStart(data.project ? manuscriptWords(data.project) : 0);
    setEpoch((x) => x + 1);
    setView(
      data.workspace?.view ||
        (data.project?.nodes.some((n) => n.kind === "scene" && !n.trashed)
          ? "editor"
          : "board"),
    );
    setQuery("");
  }, []);
  async function flush() {
    clearTimeout(timer.current);
    clearTimeout(maxTimer.current);
    maxTimer.current = null;
    if (savePromise.current) await savePromise.current;
    if (!pRef.current || !dirty()) return true;
    if (!fileRef.current) {
      setStatus("unsaved");
      return false;
    }
    const pending = (async () => {
      while (dirty()) {
        const rev = revision.current;
        const snapshot = pRef.current;
        setStatus("saving");
        try {
          const result = await call("save", snapshot);
          savedRevision.current = rev;
          setError(result.warning || "");
          setStatus(dirty() ? "saving" : "saved");
        } catch (e) {
          setStatus("error");
          setError(e.message);
          throw e;
        }
      }
      return true;
    })();
    savePromise.current = pending;
    try {
      return await pending;
    } finally {
      if (savePromise.current === pending) savePromise.current = null;
    }
  }
  function update(fn) {
    const p = pRef.current;
    if (!p) return;
    const next = typeof fn === "function" ? fn(p) : fn;
    pRef.current = next;
    revision.current++;
    setProject(next);
    setStatus(fileRef.current ? "pending" : "unsaved");
    clearTimeout(timer.current);
    if (fileRef.current) {
      timer.current = setTimeout(() => flush().catch(() => {}), 400);
      if (!maxTimer.current)
        maxTimer.current = setTimeout(() => flush().catch(() => {}), 2000);
    }
  }
  function patchNode(id, values) {
    update((p) => ({
      ...p,
      nodes: p.nodes.map((n) =>
        n.id === id
          ? { ...n, ...values, updatedAt: new Date().toISOString() }
          : n,
      ),
    }));
  }
  const visibility = (node) => ({
    included:
      !node.trashed && node.include && isUnder(project, node.id, "manuscript"),
    heading: hasHeading(node, exportOptions),
  });
  const editorProps = {
    visibility,
    getPosition: (id) => workspaceRef.current.positions?.[id],
    onPosition: (id, position) =>
      rememberWorkspace({
        positions: { ...workspaceRef.current.positions, [id]: position },
      }),
    spelling: project?.spelling || "de",
    personalWords: project?.spellingWords || EMPTY_WORDS,
    onSpellingChange: (value) => update((p) => ({ ...p, spelling: value })),
    onLearnWord: (word) =>
      update((p) => ({
        ...p,
        spellingWords: [...new Set([...(p.spellingWords || []), word])].slice(
          0,
          5000,
        ),
      })),
  };
  async function ensureSaved() {
    if (!pRef.current) return true;
    if (!fileRef.current) {
      const result = await call("saveAs", pRef.current);
      if (!result) return false;
      load(result);
      return true;
    }
    const saved = await flush();
    await flushWorkspace();
    return saved;
  }
  async function perform(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const showNotice = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 6000);
  };
  const choose = (id) => {
    setSelected(id);
    setQuery("");
    const n = pRef.current?.nodes.find((n) => n.id === id);
    setView(n?.kind === "folder" ? "board" : "editor");
  };
  function addDocument() {
    const n = pRef.current.nodes.find((n) => n.id === selected);
    const parent =
      n && !n.trashed ? (n.kind === "folder" ? n.id : n.parent) : "manuscript";
    const kind = addKind;
    const node = makeNode(
      crypto.randomUUID(),
      parent,
      kind,
      addTitle.trim() ||
        (kind === "folder"
          ? "Neues Kapitel"
          : kind === "note"
            ? "Neue Notiz"
            : "Neue Szene"),
    );
    node.include = isUnder(pRef.current, parent, "manuscript");
    update((p) => ({ ...p, nodes: [...p.nodes, node] }));
    setExpanded((s) => new Set([...s, parent]));
    setSelected(node.id);
    setView(kind === "folder" ? "board" : "editor");
    setModal(null);
  }
  function reorder(id, direction) {
    const p = pRef.current;
    const n = p.nodes.find((n) => n.id === id);
    const siblings = children(p, n.parent);
    const index = siblings.findIndex((n) => n.id === id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    update(
      moveNode(
        p,
        id,
        n.parent,
        direction < 0 ? siblings[target].id : siblings[target + 1]?.id || null,
      ),
    );
  }
  function onDrop(e, target) {
    e.preventDefault();
    const id = dragId.current;
    dragId.current = null;
    if (!id || id === target.id) return;
    try {
      const rect = e.currentTarget.getBoundingClientRect(),
        ratio = (e.clientY - rect.top) / rect.height;
      const into =
        target.kind === "folder" &&
        (ROOTS.includes(target.id) || (ratio > 0.25 && ratio < 0.75));
      let parent = into ? target.id : target.parent;
      if (!parent) return;
      const siblings = children(pRef.current, parent);
      const before = into
        ? null
        : ratio > 0.5
          ? siblings[siblings.findIndex((n) => n.id === target.id) + 1]?.id ||
            null
          : target.id;
      update(moveNode(pRef.current, id, parent, before));
      setExpanded((s) => new Set([...s, parent]));
    } catch (e) {
      setError(e.message);
    }
  }
  actions.current = {
    save: () =>
      perform(async () => {
        if (await ensureSaved())
          showNotice("Alle Änderungen sind gespeichert.");
      }),
    saveAs: () =>
      perform(async () => {
        if (!pRef.current) return;
        clearTimeout(timer.current);
        if (savePromise.current) await savePromise.current.catch(() => {});
        await flushWorkspace();
        const result = await call("saveAs", pRef.current);
        if (result) {
          load(result);
          showNotice("Neue Projektdatei gespeichert.");
        }
      }),
    new: () => {
      setNewTitle("Mein Roman");
      setModal("new");
    },
    open: () =>
      perform(async () => {
        if (!(await ensureSaved())) return;
        const result = await call("open");
        if (result) load(result);
      }),
    import: () =>
      perform(async () => {
        if (!pRef.current) return;
        const items = await call("importFiles");
        if (!items) return;
        const n = pRef.current.nodes.find((n) => n.id === selected);
        const parent =
          n && !n.trashed
            ? n.kind === "folder"
              ? n.id
              : n.parent
            : "research";
        const additions = items.map((item) => ({
          ...makeNode(
            crypto.randomUUID(),
            parent,
            isUnder(pRef.current, parent, "manuscript") ? "scene" : "note",
            item.title,
          ),
          doc: textDoc(item.text),
          include: isUnder(pRef.current, parent, "manuscript"),
        }));
        update((p) => ({ ...p, nodes: [...p.nodes, ...additions] }));
        setExpanded((s) => new Set([...s, parent]));
        if (additions.length) {
          choose(additions[0].id);
          showNotice(
            `${additions.length} Texte importiert. Originaldateien wurden nicht verändert.`,
          );
        }
      }),
    export: () => {
      if (pRef.current) setModal("export");
    },
    backups: () =>
      perform(async () => {
        if (!(await ensureSaved())) return;
        setBackups(await call("backups"));
        setModal("backups");
      }),
    focus: () => setFocus((s) => !s),
    search: () => {
      setFocus(false);
      setTimeout(() => searchRef.current?.focus(), 50);
    },
    help: () => setModal("help"),
  };
  useEffect(() => {
    mounted.current = true;
    call("boot")
      .then((data) => {
        if (mounted.current) {
          load(data);
          if (data.warning) setError(data.warning);
        }
      })
      .catch((e) => {
        setStatus("error");
        setError(e.message);
      })
      .finally(() => {
        bootPending.current = false;
        setBooting(false);
      });
    const offClose = api?.onClose(async () => {
      try {
        if (await ensureSaved()) await call("closeReady");
        else await call("closeFailed", "Es wurde kein Speicherort gewählt.");
      } catch (e) {
        await call("closeFailed", e.message);
      }
    });
    const offMenu = api?.onMenu((action) => {
      if (!bootPending.current) actions.current[action]?.();
    });
    const offBackup = api?.onBackupStatus(setExternalBackup);
    const blur = () => {
      if (fileRef.current) {
        flush().catch(() => {});
        flushWorkspace().catch(() => {});
      }
    };
    window.addEventListener("blur", blur);
    const keys = (e) => {
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", keys);
    return () => {
      mounted.current = false;
      offClose?.();
      offMenu?.();
      offBackup?.();
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", keys);
      clearTimeout(timer.current);
      clearTimeout(workspaceTimer.current);
    };
  }, []);
  useEffect(() => {
    document.title = project ? `${project.title} — QuillDesk` : "QuillDesk";
  }, [project?.title]);
  const active = project?.nodes.find((n) => n.id === selected);
  const secondaryOptions =
    project?.nodes.filter(
      (n) => !n.trashed && !ROOTS.includes(n.id) && n.id !== selected,
    ) || [];
  const secondary =
    secondaryOptions.find((n) => n.id === secondaryId) ||
    secondaryOptions.find((n) => n.kind !== "folder") ||
    secondaryOptions[0];
  const total = project ? manuscriptWords(project) : 0;
  const sessionWords = Math.max(0, total - sessionStart);
  const scope =
    active?.kind === "folder" ? active.id : active?.parent || "manuscript";
  const visible = project
    ? query
      ? project.nodes.filter(
          (n) =>
            !n.trashed &&
            !ROOTS.includes(n.id) &&
            `${n.title}\n${n.synopsis}\n${n.notes}\n${plainText(n.doc)}`
              .toLocaleLowerCase("de")
              .includes(query.toLocaleLowerCase("de")),
        )
      : children(project, scope)
    : [];
  const inTrash = selected === "trash";
  const trash =
    project?.nodes.filter((n) => n.trashed && n.trashGroup === n.id) || [];
  const progress = (count, target) =>
    Math.min(100, target > 0 ? (count / target) * 100 : 0);
  function tree(parent, depth = 0) {
    return children(project, parent).map((n) => {
      const Icon = n.kind === "folder" ? Folder : FileText;
      const hasChildren = children(project, n.id).length > 0;
      return (
        <React.Fragment key={n.id}>
          <div
            className={"binder-row " + (selected === n.id ? "selected" : "")}
            style={{ paddingLeft: 12 + depth * 17 }}
            draggable
            onDragStart={(e) => {
              dragId.current = n.id;
              e.dataTransfer.setData("text/plain", n.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => (dragId.current = null)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => onDrop(e, n)}
          >
            <button
              className="disclosure"
              aria-label={`${n.title} ${expanded.has(n.id) ? "einklappen" : "ausklappen"}`}
              disabled={!hasChildren}
              onClick={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                  return next;
                })
              }
            >
              {hasChildren ? (
                expanded.has(n.id) ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )
              ) : (
                <span />
              )}
            </button>
            <button
              className="node-button"
              onClick={() => choose(n.id)}
              title={
                n.title +
                " · " +
                (!visibility(n).included
                  ? "Nicht im Buch"
                  : visibility(n).heading
                    ? "Titel im Buch"
                    : "Interner Titel; Text im Buch")
              }
            >
              <Icon size={15} />
              <span
                className={
                  !visibility(n).included || !visibility(n).heading
                    ? "internal-title"
                    : ""
                }
              >
                {n.title || "Ohne Titel"}
              </span>
            </button>
            <small
              className={
                "binder-publication " +
                (visibility(n).included && visibility(n).heading
                  ? "published"
                  : "internal")
              }
              title={
                !visibility(n).included
                  ? "Text und Titel nicht im Buch"
                  : visibility(n).heading
                    ? "Titel erscheint im Buch"
                    : "Titel intern; Text erscheint im Buch"
              }
            >
              {!visibility(n).included
                ? "Notiz"
                : visibility(n).heading
                  ? "Titel"
                  : "intern"}
            </small>
            <i className={"label-dot " + n.label} />
          </div>
          {expanded.has(n.id) && tree(n.id, depth + 1)}
        </React.Fragment>
      );
    });
  }
  return (
    <div
      className={
        "app " +
        (focus ? "focus-mode" : "") +
        (inspector ? "" : " inspector-hidden") +
        (split ? " split-active" : "")
      }
    >
      <header className="appbar">
        <div className="brand">
          <span className="brand-icon">
            <Feather size={23} />
          </span>
          <span>
            Quill<span className="brand-light">Desk</span>
          </span>
          <span className="private-badge">LOKAL</span>
        </div>
        <div className="project-heading">
          {project ? (
            <>
              <span>{project.title}</span>
              <span className="project-subtitle">Ihr Raum für Geschichten</span>
            </>
          ) : (
            <span>Ein guter Ort für den ersten Satz.</span>
          )}
        </div>
        <div
          className={"save-indicator " + status}
          role="status"
          title={file || "Noch kein Speicherort"}
        >
          {status === "saved" ? (
            <Check size={14} />
          ) : status === "error" ? (
            <AlertCircle size={14} />
          ) : (
            <span className="status-dot" />
          )}
          {
            {
              loading: "Wird geöffnet …",
              saved: "Gespeichert",
              saving: "Speichert …",
              pending: "Änderungen …",
              unsaved: "Noch nicht gespeichert",
              error: "Speicherfehler",
            }[status]
          }
        </div>
        {project && (
          <button
            className={"backup-indicator " + externalBackup.state}
            onClick={() => setModal("externalBackup")}
            title={
              externalBackup.folder ||
              "Zusätzlichen Sicherungsordner einrichten"
            }
          >
            <Cloud size={14} />
            {{
              disabled: "Zweitkopie einrichten",
              ready: "Zweitkopie bereit",
              pending: "Zweitkopie ausstehend",
              copying: "Kopiert …",
              written: "In Sicherungsordner kopiert",
              error: "Zweitkopie fehlgeschlagen",
            }[externalBackup.state] || "Zweitkopie"}
          </button>
        )}
        <IconButton
          icon={HelpCircle}
          label="Kurzanleitung"
          onClick={() => setModal("help")}
        />
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          {project && (
            <button onClick={() => actions.current.saveAs()}>
              Als neue Datei sichern
            </button>
          )}
          <IconButton
            icon={X}
            label="Meldung schließen"
            onClick={() => setError("")}
          />
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {booting ? (
        <main
          className="welcome"
          role="status"
          aria-label="Projekt wird geladen"
        >
          <div className="welcome-mark">
            <BookOpen size={42} />
          </div>
          <h1>Ihr Schreibplatz wird geöffnet …</h1>
          <p>Das zuletzt verwendete Buch wird automatisch geladen.</p>
        </main>
      ) : !project ? (
        <main className="welcome">
          <div className="welcome-mark">
            <Feather size={42} />
          </div>
          <p className="eyebrow">EIN SCHREIBPLATZ. ALLE IHRE IDEEN.</p>
          <h1>
            Die nächste Geschichte
            <br />
            beginnt hier.
          </h1>
          <p>
            Vom ersten Gedanken bis zum fertigen Manuskript.
            <br />
            In Ihrem Tempo. Auf Ihrem Computer.
          </p>
          <div className="welcome-actions">
            {lastProject && (
              <button
                className="primary"
                disabled={busy}
                title={lastProject.file}
                onClick={() => perform(async () => load(await call("resume")))}
              >
                <BookOpen size={18} />
                Weiter an „{lastProject.title}“
              </button>
            )}
            <button
              className="primary"
              onClick={() => actions.current.new()}
              disabled={busy}
            >
              <Plus size={18} />
              Neues Buch beginnen
            </button>
            <button onClick={() => actions.current.open()} disabled={busy}>
              <FolderOpen size={18} />
              Projekt öffnen
            </button>
          </div>
          <button
            className="text-button"
            onClick={() => {
              load({
                project: newProject("Mein Roman", crypto.randomUUID(), true),
                file: null,
              });
              revision.current = 1;
            }}
          >
            Mit einem Beispiel ausprobieren <ChevronRight size={15} />
          </button>
          <div className="welcome-features">
            <span>
              <BookOpen size={18} />
              Kapitel & Szenen
            </span>
            <span>
              <LayoutGrid size={18} />
              Pinnwand & Gliederung
            </span>
            <span>
              <History size={18} />
              Lokale Sicherungen
            </span>
          </div>
        </main>
      ) : (
        <>
          <div className="workspace">
            <aside className="binder">
              <div className="binder-top">
                <div>
                  <p className="eyebrow">IHR PROJEKT</p>
                  <h2>Schreibmappe</h2>
                </div>
                <IconButton
                  icon={Plus}
                  label="Dokument hinzufügen"
                  onClick={() => {
                    setAddTitle("");
                    setAddKind("scene");
                    setModal("add");
                  }}
                />
              </div>
              <label className="search">
                <Search size={16} />
                <input
                  ref={searchRef}
                  placeholder="Im Projekt suchen …"
                  aria-label="Im Projekt suchen"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Suche leeren"
                    onClick={() => setQuery("")}
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              <nav className="binder-tree" aria-label="Schreibmappe">
                {ROOTS.map((id) => {
                  const Icon = icons[id];
                  return (
                    <section className="binder-section" key={id}>
                      <div
                        className={
                          "root-row " + (selected === id ? "selected" : "")
                        }
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) =>
                          onDrop(
                            e,
                            project.nodes.find((n) => n.id === id),
                          )
                        }
                      >
                        <button
                          className="disclosure"
                          aria-label={`${LABELS[id]} ${expanded.has(id) ? "einklappen" : "ausklappen"}`}
                          onClick={() =>
                            setExpanded((s) => {
                              const next = new Set(s);
                              next.has(id) ? next.delete(id) : next.add(id);
                              return next;
                            })
                          }
                        >
                          {expanded.has(id) ? (
                            <ChevronDown size={13} />
                          ) : (
                            <ChevronRight size={13} />
                          )}
                        </button>
                        <button
                          className="node-button"
                          onClick={() => choose(id)}
                        >
                          <Icon size={17} />
                          <span>{LABELS[id]}</span>
                        </button>
                        {id === "manuscript" && (
                          <span className="subtle-count">
                            {
                              project.nodes.filter(
                                (n) =>
                                  n.kind === "scene" &&
                                  !n.trashed &&
                                  isUnder(project, n.id, id),
                              ).length
                            }
                          </span>
                        )}
                      </div>
                      {expanded.has(id) && tree(id, 1)}
                    </section>
                  );
                })}
                <button
                  className={"trash-nav " + (inTrash ? "selected" : "")}
                  onClick={() => {
                    setSelected("trash");
                    setQuery("");
                  }}
                >
                  <Trash2 size={16} />
                  Papierkorb<span>{trash.length || ""}</span>
                </button>
              </nav>
              <div className="binder-bottom">
                <div className="goal-heading">
                  <span>
                    <Target size={15} />
                    Manuskriptziel
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setModal("settings")}
                  >
                    Anpassen
                  </button>
                </div>
                <div className="goal-numbers">
                  <strong>{number(total)}</strong>
                  <span>/ {number(project.target)} Wörter</span>
                </div>
                <div className="progress">
                  <i style={{ width: progress(total, project.target) + "%" }} />
                </div>
                <p>Jeder Satz bringt Sie weiter.</p>
                <div className="binder-actions">
                  <IconButton
                    icon={FolderOpen}
                    label="Projekt öffnen"
                    onClick={() => actions.current.open()}
                    disabled={busy}
                  />
                  <IconButton
                    icon={Save}
                    label="Projekt speichern"
                    onClick={() => actions.current.save()}
                    disabled={busy}
                  />
                  <IconButton
                    icon={History}
                    label="Sicherungen"
                    onClick={() => actions.current.backups()}
                    disabled={busy}
                  />
                  <IconButton
                    icon={Settings}
                    label="Projekteinstellungen"
                    onClick={() => setModal("settings")}
                  />
                </div>
              </div>
            </aside>
            <main className="writing-area">
              <div className="workspace-toolbar">
                <div className="breadcrumbs">
                  <BookOpen size={15} />
                  <span>
                    {query
                      ? "Suchergebnisse"
                      : inTrash
                        ? "Papierkorb"
                        : LABELS[
                            ROOTS.find((root) =>
                              isUnder(project, selected, root),
                            )
                          ] || "Schreibmappe"}
                  </span>
                  <ChevronRight size={12} />
                  <strong>
                    {query ? `„${query}“` : active?.title || "Wiederherstellen"}
                  </strong>
                </div>
                <div className="workspace-tools">
                  <IconButton
                    icon={Cloud}
                    label="Google-Drive-Sicherung"
                    onClick={() => setModal("externalBackup")}
                  />
                  <IconButton
                    icon={Columns2}
                    label="Geteilten Editor ein-/ausschalten"
                    aria-pressed={split}
                    disabled={!active || ROOTS.includes(selected)}
                    onClick={() => {
                      setSplit((s) => !s);
                      setView("editor");
                      if (!split) setInspector(false);
                    }}
                  />
                  <button
                    className="export-button"
                    onClick={() => setModal("export")}
                  >
                    <Download size={15} />
                    Exportieren
                  </button>
                  <IconButton
                    icon={focus ? Minimize2 : Maximize2}
                    label={focus ? "Fokusmodus verlassen" : "Fokusmodus · F11"}
                    onClick={() => setFocus((x) => !x)}
                  />
                  <IconButton
                    icon={PanelRight}
                    label="Inspektor ein-/ausblenden"
                    aria-pressed={inspector}
                    onClick={() => setInspector((x) => !x)}
                  />
                </div>
              </div>
              {!inTrash && !query && (
                <div className="viewbar">
                  <div
                    className="view-tabs"
                    role="tablist"
                    aria-label="Ansicht"
                  >
                    <button
                      role="tab"
                      aria-selected={view === "editor"}
                      disabled={ROOTS.includes(selected)}
                      onClick={() => setView("editor")}
                    >
                      <AlignLeft size={15} />
                      Text
                    </button>
                    <button
                      role="tab"
                      aria-selected={view === "board"}
                      onClick={() => setView("board")}
                    >
                      <LayoutGrid size={15} />
                      Pinnwand
                    </button>
                    <button
                      role="tab"
                      aria-selected={view === "outline"}
                      onClick={() => setView("outline")}
                    >
                      <List size={16} />
                      Gliederung
                    </button>
                    <button
                      role="tab"
                      aria-selected={view === "combined"}
                      onClick={() => {
                        setView("combined");
                        setSplit(false);
                      }}
                    >
                      <BookText size={15} />
                      Manuskript
                    </button>
                    <button
                      role="tab"
                      aria-selected={view === "reader"}
                      onClick={() => {
                        setView("reader");
                        setSplit(false);
                        setInspector(false);
                      }}
                    >
                      <BookOpen size={15} />
                      Buch lesen
                    </button>
                  </div>
                  <span className="view-hint">
                    {view === "editor"
                      ? "Worte finden. Welten schaffen."
                      : view === "reader"
                        ? "Ihr Buch aus Lesersicht"
                        : `${visible.length} Einträge · ${project.nodes.find((n) => n.id === scope)?.title}`}
                  </span>
                </div>
              )}
              {inTrash ? (
                <div className="collection">
                  <p className="eyebrow">NICHT VERLOREN</p>
                  <h1>Papierkorb</h1>
                  <p className="muted">
                    Gelöschte Kapitel und ihre Szenen können gemeinsam
                    wiederhergestellt werden.
                  </p>
                  {trash.length ? (
                    trash.map((n) => (
                      <div className="trash-item" key={n.id}>
                        <FileText size={20} />
                        <div>
                          <strong>{n.title}</strong>
                          <p>
                            {n.kind === "folder"
                              ? `${descendants(project, n.id).length} Untereinträge`
                              : number(wordCount(n.doc)) + " Wörter"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            update(restoreNode(project, n.id));
                            showNotice("Dokument wiederhergestellt.");
                          }}
                        >
                          <RotateCcw size={15} />
                          Wiederherstellen
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Trash2 size={36} />
                      <h3>Alles an seinem Platz.</h3>
                      <p>Der Papierkorb ist leer.</p>
                    </div>
                  )}
                </div>
              ) : query ? (
                <div className="collection">
                  <p className="eyebrow">PROJEKTWEITE SUCHE</p>
                  <h1>
                    {visible.length}{" "}
                    {visible.length === 1 ? "Treffer" : "Treffer"}
                  </h1>
                  <p className="muted">
                    Titel, Text, Synopsis und Notizen · ohne Papierkorb
                  </p>
                  {visible.map((n) => (
                    <button
                      className="search-result"
                      key={n.id}
                      onClick={() => choose(n.id)}
                    >
                      <FileText size={19} />
                      <div>
                        <h3>{n.title}</h3>
                        <p>
                          {plainText(n.doc).slice(0, 220) ||
                            n.synopsis ||
                            n.notes ||
                            "Leeres Dokument"}
                        </p>
                        <small>
                          {
                            LABELS[
                              ROOTS.find((root) => isUnder(project, n.id, root))
                            ]
                          }{" "}
                          · {number(wordCount(n.doc))} Wörter
                        </small>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              ) : view === "reader" ? (
                <BookReader
                  key={epoch}
                  project={project}
                  options={exportOptions}
                  scroll={workspaceRef.current.readerScroll}
                  onScroll={(readerScroll) =>
                    rememberWorkspace({ readerScroll })
                  }
                  onSettings={() => setModal("export")}
                />
              ) : view === "combined" ? (
                <CombinedView
                  key={epoch}
                  project={project}
                  epoch={epoch}
                  patchNode={patchNode}
                  editorProps={editorProps}
                  workspace={workspaceRef.current}
                  rememberWorkspace={rememberWorkspace}
                />
              ) : view === "editor" && active ? (
                <div className={split ? "split-desk" : "single-desk"}>
                  <div className="writing-pane">
                    <EditorPane
                      key={`${selected}-${epoch}`}
                      node={active}
                      {...editorProps}
                      onChange={(doc) => patchNode(active.id, { doc })}
                    />
                  </div>
                  {split && secondary && (
                    <div className="writing-pane secondary-pane">
                      <div className="secondary-picker">
                        <label>
                          Zweiter Text
                          <select
                            aria-label="Zweiter Text"
                            value={secondary.id}
                            onChange={(e) => setSecondaryId(e.target.value)}
                          >
                            {secondaryOptions.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <IconButton
                          icon={X}
                          label="Zweiten Editor schließen"
                          onClick={() => setSplit(false)}
                        />
                      </div>
                      <EditorPane
                        key={`${secondary.id}-${epoch}`}
                        node={secondary}
                        {...editorProps}
                        resumeFocus={false}
                        textLabel="Zweiter Szenentext"
                        onChange={(doc) => patchNode(secondary.id, { doc })}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="collection">
                  <div className="collection-heading">
                    <div>
                      <p className="eyebrow">DIE GESCHICHTE IM BLICK</p>
                      <h1>
                        {project.nodes.find((n) => n.id === scope)?.title}
                      </h1>
                    </div>
                    <button
                      onClick={() => {
                        setAddTitle("");
                        setAddKind("scene");
                        setModal("add");
                      }}
                    >
                      <Plus size={16} />
                      Hinzufügen
                    </button>
                  </div>
                  {view === "board" ? (
                    <div className="cards">
                      {visible.map((n, index) => (
                        <article
                          className={"synopsis-card " + n.label}
                          key={n.id}
                          draggable
                          onDragStart={(e) => {
                            dragId.current = n.id;
                            e.dataTransfer.setData("text/plain", n.id);
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => onDrop(e, n)}
                        >
                          <div className="card-top">
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <span className="status-tag">{n.status}</span>
                          </div>
                          <button
                            className="card-title"
                            onClick={() => choose(n.id)}
                          >
                            {n.kind === "folder" && <Folder size={16} />}
                            <h3>{n.title}</h3>
                          </button>
                          <textarea
                            aria-label={`Synopsis: ${n.title}`}
                            placeholder="Was geschieht in dieser Szene?"
                            value={n.synopsis}
                            onChange={(e) =>
                              patchNode(n.id, { synopsis: e.target.value })
                            }
                          />
                          <footer>
                            <span>{number(wordCount(n.doc))} Wörter</span>
                            <div>
                              <IconButton
                                icon={ArrowUp}
                                label={`${n.title} nach oben`}
                                onClick={() => reorder(n.id, -1)}
                              />
                              <IconButton
                                icon={ArrowDown}
                                label={`${n.title} nach unten`}
                                onClick={() => reorder(n.id, 1)}
                              />
                            </div>
                          </footer>
                        </article>
                      ))}
                      <button
                        className="add-card"
                        onClick={() => {
                          setAddTitle("");
                          setAddKind("scene");
                          setModal("add");
                        }}
                      >
                        <Plus size={25} />
                        <span>Eine neue Idee</span>
                      </button>
                    </div>
                  ) : (
                    <div className="outline-wrap">
                      <table className="outline">
                        <thead>
                          <tr>
                            <th>Dokument / Synopsis</th>
                            <th>Status</th>
                            <th>Wörter / Ziel</th>
                            <th>Export</th>
                            <th>Reihenfolge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((n) => (
                            <tr
                              key={n.id}
                              draggable
                              onDragStart={(e) => {
                                dragId.current = n.id;
                                e.dataTransfer.setData("text/plain", n.id);
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => onDrop(e, n)}
                            >
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => choose(n.id)}
                                >
                                  {n.kind === "folder" ? (
                                    <Folder size={16} />
                                  ) : (
                                    <FileText size={16} />
                                  )}
                                  <strong>{n.title}</strong>
                                </button>
                                <textarea
                                  aria-label={`Synopsis: ${n.title}`}
                                  placeholder="Synopsis ergänzen …"
                                  value={n.synopsis}
                                  onChange={(e) =>
                                    patchNode(n.id, {
                                      synopsis: e.target.value,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  aria-label={`Status: ${n.title}`}
                                  value={n.status}
                                  onChange={(e) =>
                                    patchNode(n.id, { status: e.target.value })
                                  }
                                >
                                  {STATUSES.map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {number(wordCount(n.doc))}
                                <small> / {number(n.target)}</small>
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`${n.title} exportieren`}
                                  checked={n.include}
                                  onChange={(e) =>
                                    patchNode(n.id, {
                                      include: e.target.checked,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <IconButton
                                  icon={ArrowUp}
                                  label={`${n.title} nach oben`}
                                  onClick={() => reorder(n.id, -1)}
                                />
                                <IconButton
                                  icon={ArrowDown}
                                  label={`${n.title} nach unten`}
                                  onClick={() => reorder(n.id, 1)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!visible.length && (
                        <div className="empty-state">
                          <FolderOpen size={36} />
                          <h3>Platz für Ihre Ideen.</h3>
                          <p>Fügen Sie die erste Szene oder Notiz hinzu.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <footer className="editor-footer">
                <span>
                  {active && !inTrash ? (
                    <>
                      <strong>{number(wordCount(active.doc))}</strong> Wörter
                      <span className="footer-divider">|</span>
                      {number(plainText(active.doc).trim().length)} Zeichen
                    </>
                  ) : (
                    `${number(total)} Wörter im Manuskript`
                  )}
                </span>
                <button
                  className="session-progress"
                  onClick={() => setModal("goals")}
                >
                  <span
                    className="tiny-ring"
                    style={{
                      background: `conic-gradient(var(--green) ${progress(sessionWords, sessionGoal)}%,var(--line) 0)`,
                    }}
                  />
                  <span>
                    Sitzung: <strong>{number(sessionWords)}</strong> /{" "}
                    {number(sessionGoal)}
                  </span>
                </button>
                <span className="local-label">
                  <span className="status-dot" />
                  Privat & lokal
                </span>
              </footer>
            </main>
            {inspector && (
              <aside className="inspector">
                <div className="inspector-title">
                  <span>Inspektor</span>
                  <IconButton
                    icon={PanelRight}
                    label="Inspektor schließen"
                    onClick={() => setInspector(false)}
                  />
                </div>
                {active && !inTrash ? (
                  <>
                    <div className="inspector-scroll">
                      <section>
                        <p className="eyebrow">DOKUMENT</p>
                        <label>
                          Titel
                          <input
                            aria-label="Dokumenttitel"
                            value={active.title}
                            maxLength={200}
                            onChange={(e) =>
                              patchNode(active.id, { title: e.target.value })
                            }
                            disabled={ROOTS.includes(active.id)}
                          />
                        </label>
                        <div className="field-pair">
                          <label>
                            Status
                            <select
                              value={active.status}
                              onChange={(e) =>
                                patchNode(active.id, { status: e.target.value })
                              }
                            >
                              {STATUSES.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Farbe
                            <select
                              value={active.label}
                              onChange={(e) =>
                                patchNode(active.id, { label: e.target.value })
                              }
                            >
                              <option value="sage">Salbei</option>
                              <option value="gold">Honig</option>
                              <option value="rose">Rose</option>
                              <option value="blue">Nebelblau</option>
                            </select>
                          </label>
                        </div>
                      </section>
                      <section>
                        <div className="section-label">
                          <h3>Synopsis</h3>
                          <LayoutGrid size={15} />
                        </div>
                        <textarea
                          className={"synopsis-input " + active.label}
                          aria-label="Synopsis"
                          placeholder="Die Essenz dieser Szene in wenigen Sätzen …"
                          value={active.synopsis}
                          onChange={(e) =>
                            patchNode(active.id, { synopsis: e.target.value })
                          }
                        />
                      </section>
                      <section>
                        <div className="section-label">
                          <h3>Dokumentnotizen</h3>
                          <FileText size={15} />
                        </div>
                        <textarea
                          aria-label="Dokumentnotizen"
                          placeholder="Gedanken, offene Fragen, Details …"
                          value={active.notes}
                          onChange={(e) =>
                            patchNode(active.id, { notes: e.target.value })
                          }
                        />
                      </section>
                      {!ROOTS.includes(active.id) && (
                        <section>
                          <h3>Organisation</h3>
                          <label>
                            Ordner
                            <select
                              aria-label="Übergeordneter Ordner"
                              value={active.parent}
                              onChange={(e) => {
                                try {
                                  update(
                                    moveNode(
                                      project,
                                      active.id,
                                      e.target.value,
                                    ),
                                  );
                                  setExpanded(
                                    (s) => new Set([...s, e.target.value]),
                                  );
                                } catch (e) {
                                  setError(e.message);
                                }
                              }}
                            >
                              {project.nodes
                                .filter(
                                  (n) =>
                                    n.kind === "folder" &&
                                    !n.trashed &&
                                    !isUnder(project, n.id, active.id),
                                )
                                .map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.title}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <div className="field-pair">
                            <label>
                              Wortziel
                              <input
                                type="number"
                                aria-label="Wortziel"
                                min="0"
                                max="100000000"
                                value={active.target}
                                onChange={(e) =>
                                  patchNode(active.id, {
                                    target: Math.max(
                                      0,
                                      Math.min(
                                        1e8,
                                        Number(e.target.value) || 0,
                                      ),
                                    ),
                                  })
                                }
                              />
                            </label>
                            <div className="order-controls">
                              <IconButton
                                icon={ArrowUp}
                                label="Dokument nach oben"
                                onClick={() => reorder(active.id, -1)}
                              />
                              <IconButton
                                icon={ArrowDown}
                                label="Dokument nach unten"
                                onClick={() => reorder(active.id, 1)}
                              />
                            </div>
                          </div>
                          <div className="progress">
                            <i
                              style={{
                                width:
                                  progress(
                                    wordCount(active.doc),
                                    active.target,
                                  ) + "%",
                              }}
                            />
                          </div>
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={active.include}
                              onChange={(e) =>
                                patchNode(active.id, {
                                  include: e.target.checked,
                                })
                              }
                            />
                            Text in Buchausgabe aufnehmen
                          </label>
                          {isUnder(project, active.id, "manuscript") && (
                            <div className="publication-settings">
                              <label className="check-label">
                                <input
                                  type="checkbox"
                                  aria-label="Titel im Buch anzeigen"
                                  disabled={
                                    !active.include || !exportOptions.headings
                                  }
                                  checked={hasHeading(active, exportOptions)}
                                  onChange={(e) =>
                                    patchNode(active.id, {
                                      headingInExport: e.target.checked,
                                    })
                                  }
                                />
                                Titel im Buch anzeigen
                              </label>
                              <p
                                className={
                                  "publication-badge " +
                                  (visibility(active).included &&
                                  visibility(active).heading
                                    ? "published"
                                    : "internal")
                                }
                              >
                                {!visibility(active).included
                                  ? "Text und Titel bleiben intern"
                                  : visibility(active).heading
                                    ? "Leser sehen diesen Titel und den Text"
                                    : "Grüner Titel = interner Name. Leser sehen nur den Text."}
                              </p>
                              {!exportOptions.headings && (
                                <p className="small muted">
                                  Überschriften sind in den
                                  Buchausgabe-Einstellungen ausgeschaltet.
                                </p>
                              )}
                              <p className="small muted">
                                Synopsis und Dokumentnotizen bleiben immer
                                privat. Überschriften, die Sie direkt in den
                                Text schreiben, gehören zum Buchtext.
                              </p>
                              {active.kind === "folder" && (
                                <p className="small muted">
                                  Diese Auswahl gilt für den eigenen
                                  Kapiteltext. Untergeordnete Szenen haben eine
                                  eigene Auswahl.
                                </p>
                              )}
                            </div>
                          )}
                          {!isUnder(project, active.id, "manuscript") && (
                            <small>
                              Exportiert werden nur Einträge in „Manuskript“.
                            </small>
                          )}
                        </section>
                      )}
                      <section>
                        <div className="section-label">
                          <h3>Momentaufnahmen</h3>
                          <History size={15} />
                        </div>
                        <p className="muted small">
                          Eine Textfassung behalten, bevor Sie etwas ändern.
                          Maximal 30 pro Dokument.
                        </p>
                        <button
                          className="full-button"
                          onClick={() => {
                            if (active.snapshots.length >= 30) {
                              setError(
                                "30 Momentaufnahmen erreicht. Bitte zuerst eine Aufnahme entfernen.",
                              );
                              return;
                            }
                            patchNode(active.id, {
                              snapshots: [
                                {
                                  id: crypto.randomUUID(),
                                  title: active.status,
                                  date: new Date().toISOString(),
                                  doc: structuredClone(active.doc),
                                },
                                ...active.snapshots,
                              ],
                            });
                            showNotice("Momentaufnahme erstellt.");
                          }}
                        >
                          <Plus size={15} />
                          Textfassung sichern
                        </button>
                        {active.snapshots.map((s) => (
                          <div className="snapshot" key={s.id}>
                            <div>
                              <strong>{s.title}</strong>
                              <small>{date(s.date)}</small>
                            </div>
                            <IconButton
                              icon={RotateCcw}
                              label={`Momentaufnahme vom ${date(s.date)} wiederherstellen`}
                              onClick={() =>
                                setModal({
                                  type: "snapshot",
                                  snapshot: s,
                                  nodeId: active.id,
                                })
                              }
                            />
                            <IconButton
                              icon={X}
                              label="Momentaufnahme entfernen"
                              onClick={() =>
                                setModal({
                                  type: "deleteSnapshot",
                                  snapshot: s,
                                  nodeId: active.id,
                                })
                              }
                            />
                          </div>
                        ))}
                      </section>
                    </div>
                    {!ROOTS.includes(active.id) && (
                      <div className="inspector-bottom">
                        <button
                          className="danger-subtle"
                          onClick={() => {
                            update(trashNode(project, active.id));
                            setSelected("trash");
                            showNotice("In den Papierkorb verschoben.");
                          }}
                        >
                          <Trash2 size={15} />
                          In den Papierkorb
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <BookOpen size={30} />
                    <p>
                      Wählen Sie ein Dokument
                      <br />
                      in Ihrer Schreibmappe.
                    </p>
                  </div>
                )}
              </aside>
            )}
          </div>
        </>
      )}
      {modal === "new" && (
        <Modal title="Ein neues Buch" onClose={() => setModal(null)}>
          <p className="muted">
            Geben Sie Ihrer Geschichte einen Arbeitstitel. Sie können ihn später
            ändern.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(async () => {
                if (!(await ensureSaved())) return;
                const result = await call(
                  "create",
                  newTitle.trim() || "Mein Roman",
                );
                if (result) {
                  load(result);
                  setModal(null);
                }
              });
            }}
          >
            <label>
              Arbeitstitel
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                required
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setModal(null)}>
                Abbrechen
              </button>
              <button className="primary" disabled={busy} type="submit">
                Speicherort wählen
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "add" && (
        <Modal title="Ein neuer Baustein" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addDocument();
            }}
          >
            <label>
              Titel
              <input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Ein neuer Anfang"
                maxLength={200}
              />
            </label>
            <label>
              Dokumenttyp
              <select
                value={addKind}
                onChange={(e) => setAddKind(e.target.value)}
              >
                <option value="scene">Szene</option>
                <option value="folder">Kapitel / Ordner</option>
                <option value="note">Notiz</option>
              </select>
            </label>
            <p className="muted small">
              Wird im ausgewählten Ordner oder neben der ausgewählten Szene
              angelegt.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setModal(null)}>
                Abbrechen
              </button>
              <button type="submit" className="primary">
                Anlegen
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "settings" && project && (
        <Modal title="Ihr Buchprojekt" onClose={() => setModal(null)}>
          <label>
            Arbeitstitel
            <input
              value={project.title}
              maxLength={200}
              onChange={(e) => update((p) => ({ ...p, title: e.target.value }))}
            />
          </label>
          <label>
            Autor / Autorin
            <input
              value={project.author}
              maxLength={200}
              onChange={(e) =>
                update((p) => ({ ...p, author: e.target.value }))
              }
            />
          </label>
          <label>
            Manuskriptziel in Wörtern
            <input
              type="number"
              min="0"
              max="100000000"
              value={project.target}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  target: Math.max(
                    0,
                    Math.min(1e8, Number(e.target.value) || 0),
                  ),
                }))
              }
            />
          </label>
          <label>
            Projektwörter · Eigennamen und erfundene Begriffe
            <ProjectWordsEditor
              words={project.spellingWords || []}
              onChange={(words) =>
                update((p) => ({ ...p, spellingWords: words }))
              }
            />
          </label>
          <div className="file-location">
            <p className="eyebrow">SPEICHERORT</p>
            <code>{file || "Noch kein Speicherort gewählt"}</code>
            {file && (
              <button
                className="text-button"
                onClick={() => perform(() => call("reveal"))}
              >
                Im Explorer anzeigen
              </button>
            )}
          </div>
          <div className="modal-actions">
            <button onClick={() => actions.current.saveAs()} disabled={busy}>
              <Copy size={15} />
              Speichern unter
            </button>
            <button className="primary" onClick={() => setModal(null)}>
              Fertig
            </button>
          </div>
        </Modal>
      )}
      {modal === "goals" && (
        <Modal
          title="Ein kleines Ziel für heute"
          onClose={() => setModal(null)}
        >
          <p className="muted">
            Diese Sitzung zählt den Nettozuwachs im exportierbaren Manuskript
            seit dem Öffnen. Gelöschte Wörter verringern den Zuwachs.
          </p>
          <label>
            Sitzungsziel in Wörtern
            <input
              type="number"
              min="1"
              max="1000000"
              value={sessionGoal}
              onChange={(e) =>
                setSessionGoal(
                  Math.max(1, Math.min(1e6, Number(e.target.value) || 1)),
                )
              }
            />
          </label>
          <div className="large-stat">
            {number(sessionWords)} <small>/ {number(sessionGoal)} Wörter</small>
          </div>
          <div className="modal-actions">
            <button onClick={() => setSessionStart(total)}>
              Zähler zurücksetzen
            </button>
            <button className="primary" onClick={() => setModal(null)}>
              Weiter schreiben
            </button>
          </div>
        </Modal>
      )}
      {modal === "export" && project && (
        <Modal
          title="Aus Szenen wird ein Manuskript"
          onClose={() => setModal(null)}
        >
          <p className="muted">
            {manuscript(project).length} markierte Einträge aus „Manuskript“, in
            Reihenfolge der Schreibmappe. Recherche, Figuren, Welt und
            Papierkorb bleiben außen vor.
          </p>
          <label>
            Dateiformat
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <option value="docx">Word-Dokument (.docx)</option>
              <option value="pdf">PDF · A4 (.pdf)</option>
              <option value="txt">Reiner Text · UTF-8 (.txt)</option>
            </select>
          </label>
          {exportFormat !== "txt" && (
            <div className="export-layout">
              <label>
                Schrift
                <select
                  aria-label="Exportschrift"
                  value={exportOptions.font}
                  onChange={(e) =>
                    setExportOptions((o) => ({ ...o, font: e.target.value }))
                  }
                >
                  <option>Times New Roman</option>
                  <option>Georgia</option>
                  <option>Courier New</option>
                </select>
              </label>
              <label>
                Größe
                <select
                  aria-label="Exportschriftgröße"
                  value={exportOptions.fontSize}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      fontSize: Number(e.target.value),
                    }))
                  }
                >
                  {[10, 11, 12, 14].map((n) => (
                    <option key={n} value={n}>
                      {n} pt
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Zeilenabstand
                <select
                  aria-label="Exportzeilenabstand"
                  value={exportOptions.lineSpacing}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      lineSpacing: Number(e.target.value),
                    }))
                  }
                >
                  <option value="1">Einfach</option>
                  <option value="1.5">1,5-fach</option>
                  <option value="2">Doppelt</option>
                </select>
              </label>
            </div>
          )}
          {[
            ["titlePage", "Titel und Autor voranstellen"],
            ["headings", "Überschriften in der Buchausgabe verwenden"],
            ["chapterBreaks", "Kapitel auf neuer Seite (DOCX / PDF)"],
            [
              "sceneHeadings",
              "Szenentitel standardmäßig anzeigen (Einzelauswahl im Inspektor hat Vorrang)",
            ],
            ["pageNumbers", "Seitenzahlen (DOCX / PDF)"],
          ].map(([key, label]) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={exportOptions[key]}
                onChange={(e) =>
                  setExportOptions((o) => ({ ...o, [key]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
          <p className="small muted">
            Diese Einstellungen werden im Projekt gespeichert und gelten auch
            für „Buch lesen“. Jeder Titel kann im Inspektor einzeln sichtbar
            oder intern gesetzt werden.
          </p>
          <p className="callout">
            {number(total)} Wörter ·{" "}
            {project.author ||
              "Autor kann in den Projekteinstellungen ergänzt werden."}
          </p>
          <p className="small muted">
            PDF zum Lesen mit festem Layout · DOCX zum Bearbeiten in Word,
            LibreOffice oder Google Docs. Bitte immer die Vorgaben des Verlags
            prüfen. Die .quill-Projektdatei ist keine Einreichungsdatei.
          </p>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>Schließen</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await flush();
                  const result = await call(
                    "exportProject",
                    pRef.current,
                    exportFormat,
                    exportOptions,
                  );
                  if (result) {
                    setModal(null);
                    showNotice("Export gespeichert: " + result.file);
                  }
                })
              }
            >
              <Download size={16} />
              Export speichern
            </button>
          </div>
        </Modal>
      )}
      {modal === "backups" && (
        <Modal
          title="Sicherungen & Wiederherstellung"
          onClose={() => setModal(null)}
          wide
        >
          <p className="muted">
            Vor jedem Speichern bleibt die vorherige Fassung erhalten. Bei
            Änderungen entsteht zusätzlich höchstens einmal pro Minute eine
            versionierte Sicherung (120 automatische Fassungen). Manuelle
            Sicherungen bleiben erhalten.
          </p>
          <div className="backup-actions">
            <button onClick={() => setModal("externalBackup")}>
              <Cloud size={16} />
              Google Drive / Zweitkopie
            </button>
            <button
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await flush();
                  await call("checkpoint");
                  setBackups(await call("backups"));
                  showNotice("Manuelle Sicherung erstellt.");
                })
              }
            >
              <Plus size={16} />
              Jetzt sichern
            </button>
            <button onClick={() => perform(() => call("reveal"))}>
              <FolderOpen size={16} />
              Projektordner
            </button>
          </div>
          <div className="backup-list">
            {backups.length ? (
              backups.map((b) => (
                <div className="backup-row" key={b.name}>
                  <History size={18} />
                  <div>
                    <strong>
                      {b.name === "previous"
                        ? "Vorheriger Speicherstand"
                        : b.name.includes("-before-restore-")
                          ? "Vor Wiederherstellung"
                          : b.name.includes("-manual-")
                            ? "Manuelle Sicherung"
                            : "Automatische Sicherung"}
                    </strong>
                    <small>{date(b.date)}</small>
                  </div>
                  <button
                    onClick={() =>
                      setModal({ type: "restoreBackup", backup: b })
                    }
                  >
                    Wiederherstellen
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>
                  Noch keine Sicherung vorhanden.
                  <br />
                  Erstellen Sie jetzt die erste.
                </p>
              </div>
            )}
          </div>
          <p className="small muted">
            Sicherungen liegen neben der Projektdatei. Kopieren Sie Projekt und
            Sicherungsordner regelmäßig auf ein zweites Laufwerk.
          </p>
        </Modal>
      )}
      {modal === "externalBackup" && (
        <Modal
          title="Google Drive · zusätzliche Sicherung"
          onClose={() => setModal(null)}
          wide
        >
          <p className="muted">
            Wählen Sie einen Ordner, den Google Drive für Desktop
            synchronisiert. QuillDesk legt dort vollständige, datierte
            Projektkopien ab. Ihr Arbeitsprojekt und die lokalen Sicherungen
            bleiben an ihrem bisherigen Speicherort.
          </p>
          <div className="callout">
            <strong>Lokale Kopie ≠ bestätigter Cloud-Upload</strong>
            <p>
              QuillDesk überprüft die geschriebene Datei. Ob sie schon
              hochgeladen wurde, zeigt Google Drive für Desktop. Bei Bedarf den
              Ordner in Drive als „offline verfügbar“ markieren. Ohne
              erreichbaren Sicherungsordner bleibt das lokale Schreiben möglich.
            </p>
          </div>
          <div className="file-location">
            <p className="eyebrow">ZIELORDNER</p>
            <code>
              {externalBackup.folder || "Noch kein Ordner ausgewählt"}
            </code>
            <p className="backup-status" role="status">
              {
                {
                  disabled: "Nicht eingerichtet",
                  ready: "Bereit",
                  pending: "Neue Änderungen warten auf die nächste Kopie",
                  copying: "Projektkopie wird geschrieben …",
                  written: "Datei geschrieben und überprüft",
                  error:
                    "Kopie fehlgeschlagen – lokales Projekt bleibt erhalten",
                }[externalBackup.state]
              }
            </p>
            {externalBackup.lastCopyAt && (
              <p>
                Letzte bestätigte Dateikopie: {date(externalBackup.lastCopyAt)}
              </p>
            )}
            {externalBackup.error && (
              <p className="backup-error">{externalBackup.error}</p>
            )}
          </div>
          <div className="backup-actions">
            <button
              disabled={busy || externalBackup.state === "copying"}
              onClick={() =>
                perform(async () => {
                  if (project && !(await ensureSaved())) return;
                  const result = await call("backupFolder");
                  if (result) setExternalBackup(result);
                })
              }
            >
              <FolderOpen size={16} />
              Sicherungsordner wählen
            </button>
            <button
              disabled={busy || !externalBackup.folder}
              onClick={() =>
                perform(async () => {
                  if (!(await ensureSaved())) return;
                  setExternalBackup(await call("backupNow"));
                  showNotice(
                    "Projektkopie im Sicherungsordner überprüft. Upload-Status bitte in Google Drive prüfen.",
                  );
                })
              }
            >
              <Cloud size={16} />
              Jetzt Kopie erstellen
            </button>
            {externalBackup.lastFile && (
              <button onClick={() => perform(() => call("backupReveal"))}>
                Kopie im Explorer
              </button>
            )}
          </div>
          <p className="small muted">
            Bei Änderungen wird etwa einmal pro Minute kopiert, außerdem beim
            Schließen. Fehlgeschlagene Kopien werden erneut versucht. Jede
            Fassung enthält Texte, Notizen, Papierkorb und Momentaufnahmen. Es
            werden keine Sicherungen automatisch gelöscht. Der Speicherbedarf
            wächst mit der Anzahl der Fassungen.
          </p>
          <p className="small muted">
            Wiederherstellen: Projekt → Öffnen → eine .quill-Datei aus dem
            Sicherungsordner wählen → als neues Arbeitsprojekt speichern. Diese
            Kopien sind unverschlüsselt; wählen Sie einen privaten Drive-Ordner.
          </p>
          <div className="modal-actions">
            {externalBackup.folder && (
              <button
                disabled={busy || externalBackup.state === "copying"}
                onClick={() =>
                  perform(async () =>
                    setExternalBackup(await call("backupDisable")),
                  )
                }
              >
                Weitere Kopien ausschalten
              </button>
            )}
            <button className="primary" onClick={() => setModal(null)}>
              Fertig
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "restoreBackup" && (
        <Modal
          title="Projektfassung wiederherstellen?"
          onClose={() => setModal(null)}
        >
          <p>
            Das gesamte Projekt wird auf den Stand vom {date(modal.backup.date)}{" "}
            zurückgesetzt. Die aktuelle Fassung wird vorher zusätzlich
            gesichert.
          </p>
          <div className="modal-actions">
            <button onClick={() => actions.current.backups()}>Zurück</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await flush();
                  const result = await call("restore", modal.backup.name);
                  load(result);
                  setModal(null);
                  showNotice("Projektfassung wiederhergestellt.");
                })
              }
            >
              Wiederherstellen
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "snapshot" && (
        <Modal
          title="Textfassung wiederherstellen?"
          onClose={() => setModal(null)}
        >
          <p>
            Nur der Szenentext wird ersetzt. Der aktuelle Text bleibt als neue
            Momentaufnahme erhalten.
          </p>
          <div className="snapshot-preview">
            {plainText(modal.snapshot.doc)}
          </div>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>Abbrechen</button>
            <button
              className="primary"
              onClick={() => {
                const n = pRef.current.nodes.find((n) => n.id === modal.nodeId);
                if (n.snapshots.length >= 30) {
                  setError(
                    "Bitte eine Momentaufnahme entfernen, damit der aktuelle Text vor der Wiederherstellung gesichert werden kann.",
                  );
                  return;
                }
                patchNode(n.id, {
                  doc: structuredClone(modal.snapshot.doc),
                  snapshots: [
                    {
                      id: crypto.randomUUID(),
                      title: "Vor Wiederherstellung",
                      date: new Date().toISOString(),
                      doc: structuredClone(n.doc),
                    },
                    ...n.snapshots,
                  ],
                });
                setEpoch((x) => x + 1);
                setModal(null);
              }}
            >
              Wiederherstellen
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "deleteSnapshot" && (
        <Modal title="Momentaufnahme entfernen?" onClose={() => setModal(null)}>
          <p>
            Diese Textfassung vom {date(modal.snapshot.date)} wird aus dem
            Projekt entfernt. Der aktuelle Szenentext bleibt erhalten.
          </p>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>Abbrechen</button>
            <button
              className="danger"
              onClick={() => {
                const n = pRef.current.nodes.find((n) => n.id === modal.nodeId);
                patchNode(n.id, {
                  snapshots: n.snapshots.filter(
                    (s) => s.id !== modal.snapshot.id,
                  ),
                });
                setModal(null);
              }}
            >
              Entfernen
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Willkommen an Ihrem Schreibplatz"
          onClose={() => setModal(null)}
          wide
        >
          <div className="help-grid">
            <section>
              <Columns2 />
              <h3>Zwei Texte nebeneinander</h3>
              <p>
                Die Schaltfläche mit zwei Spalten öffnet einen zweiten Editor.
                Dort wählen Sie eine andere Szene oder Notiz. Beide Texte werden
                automatisch gespeichert.
              </p>
            </section>
            <section>
              <BookText />
              <h3>Das Buch im Zusammenhang</h3>
              <p>
                Im Reiter „Manuskript“ lesen Sie alle Kapitel und Szenen in
                ihrer Reihenfolge. Klicken Sie einen Abschnitt an, um ihn direkt
                zu überarbeiten. Die Szenen bleiben einzeln organisiert. „Buch
                lesen“ zeigt das ganze Buch mit den für die Ausgabe gewählten
                Überschriften. Grüne Namen mit „intern“ dienen nur Ihrer
                Organisation; der Szenentext bleibt im Buch. „Titel im Buch
                anzeigen“ und „Text in Buchausgabe aufnehmen“ im Inspektor
                steuern Titel und Text getrennt.
              </p>
            </section>
            <section>
              <Check />
              <h3>Rechtschreibung ohne Internet</h3>
              <p>
                Deutsch und Englisch sind eingebaut. Unterstrichene Wörter per
                Rechtsklick oder über „Nächster“ prüfen. Eigennamen können als
                Projektwörter gemerkt werden. Dies ist eine Rechtschreibprüfung,
                keine Grammatikprüfung.
              </p>
            </section>
            <section>
              <Cloud />
              <h3>Eine zweite Kopie in Google Drive</h3>
              <p>
                Über das Wolkensymbol einmal Ihren synchronisierten Ordner
                auswählen. QuillDesk speichert dort datierte Fassungen. Den
                erfolgreichen Upload kontrollieren Sie in Google Drive für
                Desktop.
              </p>
            </section>
            <section>
              <BookOpen />
              <h3>Eine Mappe für Ihr Buch</h3>
              <p>
                Kapitel sind Ordner, Szenen sind Texte. Ziehen Sie Einträge an
                eine neue Position oder in die Mitte eines Ordners. Pfeile und
                Ordnerauswahl im Inspektor sind die Alternative.
              </p>
            </section>
            <section>
              <LayoutGrid />
              <h3>Planen, schreiben, überarbeiten</h3>
              <p>
                Pinnwand und Gliederung zeigen die direkten Untereinträge eines
                Ordners. Synopsis, Status und Notizen begleiten Ihren Text. Die
                Suche findet Texte im ganzen Projekt.
              </p>
            </section>
            <section>
              <History />
              <h3>Ihre Arbeit bleibt bei Ihnen</h3>
              <p>
                Änderungen werden nach 0,4 Sekunden Schreibpause gespeichert,
                beim durchgehenden Tippen spätestens nach etwa 2 Sekunden.
                „Gespeichert“ erscheint erst nach erfolgreichem Schreiben. Beim
                Schließen wird ausstehender Text gesichert. QuillDesk merkt sich
                außerdem den geöffneten Abschnitt, die Ansicht, den Cursor und
                die Scrollposition auf diesem Computer. Sicherungen und
                Momentaufnahmen bieten Rückwege.
              </p>
            </section>
            <section>
              <Download />
              <h3>Ein Manuskript zum Mitnehmen</h3>
              <p>
                Exportieren Sie markierte Manuskript-Einträge als DOCX, PDF oder
                TXT. Importieren Sie TXT, Markdown und DOCX über das
                Projekt-Menü. Importe übernehmen Text; komplexe Formatierungen,
                Bilder und Kommentare werden nicht übernommen.
              </p>
            </section>
          </div>
          <div className="keyboard-guide">
            <span>
              Strg+S <b>Speichern</b>
            </span>
            <span>
              Strg+Shift+F <b>Suche</b>
            </span>
            <span>
              F11 <b>Fokus</b>
            </span>
            <span>
              Strg+Z <b>Rückgängig</b>
            </span>
          </div>
          <p className="small muted">
            QuillDesk 0.3.0 · Keine Anmeldung, keine Telemetrie. Optionale
            Kopien in einem selbst gewählten Sicherungsordner. Projekte sind
            unverschlüsselt. Eigenständige Umsetzung; kein
            Scrivener-Dateiformat. Bei einem abrupten Absturz können die letzten
            noch nicht gespeicherten Eingaben fehlen. Undo gilt für den aktuell
            geöffneten Text.
          </p>
          <div className="modal-actions">
            <button className="primary" onClick={() => setModal(null)}>
              An die Geschichte
            </button>
          </div>
        </Modal>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          Einen Moment …
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
