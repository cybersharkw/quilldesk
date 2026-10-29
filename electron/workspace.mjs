import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWrite } from "./store.mjs";
const integer = (n, max = 1e8) =>
  Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0;
export function sanitizeWorkspace(value = {}, project) {
  const live = new Set(
    project.nodes.filter((n) => !n.trashed).map((n) => n.id),
  );
  const fallback =
    project.nodes.find(
      (n) =>
        !n.trashed &&
        n.parent &&
        n.doc?.content?.some((c) => JSON.stringify(c).includes('"text"')),
    )?.id ||
    project.nodes.find((n) => !n.trashed && n.kind === "scene")?.id ||
    "manuscript";
  const selected =
    live.has(value?.selected) || value?.selected === "trash"
      ? value.selected
      : fallback;
  const positions = Object.fromEntries(
    Object.entries(
      value?.positions && typeof value.positions === "object"
        ? value.positions
        : {},
    )
      .filter(([id]) => live.has(id))
      .slice(-10000)
      .map(([id, p]) => [
        id,
        {
          anchor: integer(p?.anchor),
          head: integer(p?.head),
          scrollTop: integer(p?.scrollTop),
        },
      ]),
  );
  return {
    selected,
    view: ["editor", "board", "outline", "combined", "reader"].includes(
      value?.view,
    )
      ? value.view
      : "editor",
    split: value?.split === true,
    secondaryId: live.has(value?.secondaryId) ? value.secondaryId : null,
    inspector: value?.inspector !== false,
    combinedEditing: live.has(value?.combinedEditing)
      ? value.combinedEditing
      : null,
    combinedScroll: integer(value?.combinedScroll),
    readerScroll: integer(value?.readerScroll),
    positions,
  };
}
export class WorkspaceStore {
  constructor(directory) {
    this.directory = directory;
  }
  location(file) {
    return path.join(
      this.directory,
      crypto
        .createHash("sha256")
        .update(path.resolve(file).toLowerCase())
        .digest("hex") + ".json",
    );
  }
  read(file, project) {
    if (!file || !project) return null;
    try {
      const state = JSON.parse(fs.readFileSync(this.location(file), "utf8"));
      if (state.projectId === project.id)
        return sanitizeWorkspace(state.workspace, project);
    } catch {}
    return sanitizeWorkspace({}, project);
  }
  save(file, project, value) {
    const workspace = sanitizeWorkspace(value, project);
    atomicWrite(
      this.location(file),
      JSON.stringify({ projectId: project.id, workspace }),
    );
    return workspace;
  }
}
