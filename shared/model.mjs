export const ROOTS = ["manuscript", "research", "characters", "world"];
export const LABELS = {
  manuscript: "Manuskript",
  research: "Recherche",
  characters: "Figuren",
  world: "Welt & Schauplätze",
};
export const STATUSES = ["Idee", "Entwurf", "Überarbeitung", "Fertig"];
export const emptyDoc = () => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});
export const textDoc = (text) => ({
  type: "doc",
  content: text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
});
export const plainText = (doc) => {
  if (!doc) return "";
  if (doc.type === "text") return doc.text || "";
  if (doc.type === "hardBreak") return "\n";
  const s = (doc.content || []).map(plainText).join("");
  return (
    s +
    (["paragraph", "heading", "blockquote", "listItem"].includes(doc.type)
      ? "\n"
      : "")
  );
};
export const wordCount = (doc) =>
  (plainText(doc).match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [])
    .length;
export function makeNode(id, parent, kind = "scene", title = "Neue Szene") {
  return {
    id,
    parent,
    kind,
    title,
    synopsis: "",
    notes: "",
    status: "Idee",
    label: "sage",
    target: 1000,
    include: parent === "manuscript",
    doc: emptyDoc(),
    snapshots: [],
    trashed: false,
    updatedAt: new Date().toISOString(),
  };
}
export function newProject(
  title = "Mein Roman",
  id = crypto.randomUUID(),
  demo = false,
) {
  const p = {
    format: "quilldesk",
    version: 1,
    id,
    title,
    author: "",
    target: 80000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: ROOTS.map((r) => ({
      ...makeNode(r, null, "folder", LABELS[r]),
      include: r === "manuscript",
    })),
  };
  p.nodes.push(makeNode("chapter-one", "manuscript", "folder", "Kapitel 1"));
  p.nodes.push({
    ...makeNode(
      "first-scene",
      "chapter-one",
      "scene",
      demo ? "Ein Anfang" : "Erste Szene",
    ),
    include: true,
  });
  if (demo) {
    p.title = "Willkommen bei QuillDesk";
    const scene = p.nodes.at(-1);
    scene.synopsis =
      "Ein ruhiger Ort für die nächste große Geschichte. Dieses Beispiel gehört ganz Ihnen.";
    scene.doc = textDoc(
      "Jede Geschichte beginnt mit einem Moment.\n\nVielleicht ist es eine Tür, die sich öffnet. Ein Brief, der nie hätte ankommen dürfen. Oder ein Mensch, der beschließt, nicht länger zu warten.\n\nDies ist Ihr Schreibplatz. Legen Sie links Kapitel und Szenen an, sammeln Sie Ideen auf der Pinnwand und geben Sie Ihrer Geschichte eine Form.\n\nSchreiben Sie den nächsten Satz.",
    );
    p.nodes.push({
      ...makeNode("idea-scene", "chapter-one", "scene", "Was danach geschieht"),
      include: true,
      synopsis:
        "Was will die Hauptfigur? Was steht ihr im Weg? Was verändert diese Szene?",
    });
  }
  return p;
}
export const children = (p, id) =>
  p.nodes.filter((n) => n.parent === id && !n.trashed);
export function descendants(p, id) {
  const found = [];
  const visit = (parent) => {
    for (const n of p.nodes.filter((n) => n.parent === parent)) {
      found.push(n);
      visit(n.id);
    }
  };
  visit(id);
  return found;
}
export function isUnder(p, id, ancestor) {
  let n = p.nodes.find((n) => n.id === id);
  const seen = new Set();
  while (n && !seen.has(n.id)) {
    if (n.id === ancestor) return true;
    seen.add(n.id);
    n = p.nodes.find((x) => x.id === n.parent);
  }
  return false;
}
export function moveNode(p, id, parent, before = null) {
  if (ROOTS.includes(id))
    throw new Error("Diese Sammlung kann nicht verschoben werden.");
  const node = p.nodes.find((n) => n.id === id);
  const destination = p.nodes.find((n) => n.id === parent);
  if (
    !node ||
    node.trashed ||
    !destination ||
    destination.trashed ||
    destination.kind !== "folder" ||
    isUnder(p, parent, id)
  )
    throw new Error("Ungültiger Zielordner.");
  if (before === id) return p;
  if (before && !p.nodes.some((n) => n.id === before && n.parent === parent))
    throw new Error("Ungültige Position.");
  const nodes = p.nodes.filter((n) => n.id !== id);
  const index = before ? nodes.findIndex((n) => n.id === before) : nodes.length;
  nodes.splice(index, 0, { ...node, parent });
  return { ...p, nodes };
}
export function trashNode(p, id) {
  if (ROOTS.includes(id)) throw new Error("Sammlungen bleiben erhalten.");
  const ids = new Set([id, ...descendants(p, id).map((n) => n.id)]);
  return {
    ...p,
    nodes: p.nodes.map((n) =>
      ids.has(n.id) ? { ...n, trashed: true, trashGroup: id } : n,
    ),
  };
}
export function restoreNode(p, id) {
  const node = p.nodes.find((n) => n.id === id);
  if (!node) return p;
  const group = node.trashGroup || id;
  return {
    ...p,
    nodes: p.nodes.map((n) =>
      n.trashed && n.trashGroup === group
        ? {
            ...n,
            trashed: false,
            trashGroup: undefined,
            parent:
              n.id === group &&
              !p.nodes.some((x) => x.id === n.parent && !x.trashed)
                ? "manuscript"
                : n.parent,
          }
        : n,
    ),
  };
}
export function manuscript(p) {
  const result = [];
  const visit = (id) => {
    for (const n of children(p, id)) {
      if (n.include) result.push(n);
      if (n.kind === "folder") visit(n.id);
    }
  };
  visit("manuscript");
  return result;
}
export const manuscriptWords = (p) =>
  manuscript(p).reduce((sum, n) => sum + wordCount(n.doc), 0);

const TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
]);
const MARKS = new Set([
  "bold",
  "italic",
  "strike",
  "underline",
  "code",
  "highlight",
]);
const BLOCKS = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "horizontalRule",
  "codeBlock",
]);
export function validateDoc(doc, depth = 0) {
  if (!doc || typeof doc !== "object" || !TYPES.has(doc.type) || depth > 50)
    throw new Error("Ungültiger Dokumentinhalt.");
  if (depth === 0 && doc.type !== "doc")
    throw new Error("Ungültiges Textdokument.");
  if (doc.type === "text" && (typeof doc.text !== "string" || !doc.text.length))
    throw new Error("Ungültiger Text.");
  if (
    doc.content !== undefined &&
    (!Array.isArray(doc.content) || doc.content.length > 100000)
  )
    throw new Error("Ungültiger Textumfang.");
  if (
    doc.marks !== undefined &&
    (!Array.isArray(doc.marks) ||
      doc.marks.some((m) => !m || !MARKS.has(m.type)))
  )
    throw new Error("Unbekannte Textformatierung.");
  const content = doc.content || [];
  const allowed = ["doc", "blockquote", "listItem"].includes(doc.type)
    ? BLOCKS
    : ["bulletList", "orderedList"].includes(doc.type)
      ? new Set(["listItem"])
      : ["paragraph", "heading"].includes(doc.type)
        ? new Set(["text", "hardBreak"])
        : doc.type === "codeBlock"
          ? new Set(["text"])
          : new Set();
  if (content.some((child) => !allowed.has(child?.type)))
    throw new Error("Ungültige Absatzstruktur.");
  if (
    ["doc", "blockquote", "bulletList", "orderedList", "listItem"].includes(
      doc.type,
    ) &&
    !content.length
  )
    throw new Error("Leere Dokumentstruktur.");
  if (doc.type === "listItem" && content[0]?.type !== "paragraph")
    throw new Error("Ungültiger Listenabsatz.");
  if (
    doc.type === "heading" &&
    (!Number.isInteger(doc.attrs?.level) ||
      doc.attrs.level < 1 ||
      doc.attrs.level > 6)
  )
    throw new Error("Ungültige Überschrift.");
  for (const child of doc.content || []) validateDoc(child, depth + 1);
}
export function validateProject(p) {
  if (!p || p.format !== "quilldesk" || p.version !== 1)
    throw new Error("Keine unterstützte QuillDesk-Projektdatei (Version 1).");
  if (
    p.exportOptions !== undefined &&
    (!p.exportOptions ||
      typeof p.exportOptions !== "object" ||
      Array.isArray(p.exportOptions) ||
      JSON.stringify(p.exportOptions).length > 2000)
  )
    throw new Error("Ungültige Buchausgabe-Einstellungen.");
  if (p.spelling !== undefined && !["de", "en", "off"].includes(p.spelling))
    throw new Error("Ungültige Rechtschreibsprache.");
  if (
    p.spellingWords !== undefined &&
    (!Array.isArray(p.spellingWords) ||
      p.spellingWords.length > 5000 ||
      p.spellingWords.some((w) => typeof w !== "string" || w.length > 80))
  )
    throw new Error("Ungültige Projektwortliste.");
  for (const k of ["id", "title", "createdAt", "updatedAt"])
    if (typeof p[k] !== "string" || p[k].length > 2000)
      throw new Error("Ungültige Projekteigenschaften.");
  if (
    typeof p.author !== "string" ||
    !Number.isFinite(p.target) ||
    p.target < 0 ||
    p.target > 1e8
  )
    throw new Error("Ungültige Projektziele.");
  if (!Array.isArray(p.nodes) || p.nodes.length > 10000)
    throw new Error("Ungültige Dokumentliste (maximal 10.000).");
  const byId = new Map();
  for (const n of p.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !n.id ||
      n.id.length > 200 ||
      byId.has(n.id)
    )
      throw new Error("Doppelte oder ungültige Dokument-ID.");
    byId.set(n.id, n);
    if (
      n.headingInExport !== undefined &&
      typeof n.headingInExport !== "boolean"
    )
      throw new Error("Ungültige Titel-Sichtbarkeit.");
    for (const k of ["title", "synopsis", "notes", "status", "label"])
      if (typeof n[k] !== "string" || n[k].length > 200000)
        throw new Error("Ungültige Dokumenteigenschaften.");
    if (
      !["folder", "scene", "note"].includes(n.kind) ||
      !STATUSES.includes(n.status) ||
      !["sage", "gold", "rose", "blue"].includes(n.label) ||
      typeof n.include !== "boolean" ||
      typeof n.trashed !== "boolean" ||
      !Number.isFinite(n.target) ||
      n.target < 0 ||
      n.target > 1e8
    )
      throw new Error("Ungültige Metadaten.");
    validateDoc(n.doc);
    if (!Array.isArray(n.snapshots) || n.snapshots.length > 30)
      throw new Error("Ungültige Momentaufnahmen.");
    for (const s of n.snapshots) {
      if (
        typeof s.id !== "string" ||
        typeof s.title !== "string" ||
        typeof s.date !== "string"
      )
        throw new Error("Ungültige Momentaufnahme.");
      validateDoc(s.doc);
    }
  }
  for (const root of ROOTS)
    if (
      !byId.has(root) ||
      byId.get(root).parent !== null ||
      byId.get(root).kind !== "folder" ||
      byId.get(root).trashed
    )
      throw new Error("Eine feste Sammlung fehlt.");
  for (const n of p.nodes) {
    if (ROOTS.includes(n.id)) continue;
    const seen = new Set([n.id]);
    let parent = n.parent;
    let depth = 0;
    while (parent !== null) {
      const next = byId.get(parent);
      if (!next || next.kind !== "folder" || seen.has(parent) || ++depth > 80)
        throw new Error("Ungültige Ordnerstruktur.");
      seen.add(parent);
      parent = next.parent;
    }
    if (![...seen].some((id) => ROOTS.includes(id)))
      throw new Error("Dokument ohne Sammlung.");
  }
  return p;
}
