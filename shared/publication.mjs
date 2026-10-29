export const DEFAULT_EXPORT_OPTIONS = Object.freeze({
  titlePage: true,
  headings: true,
  chapterBreaks: true,
  sceneHeadings: false,
  pageNumbers: true,
  font: "Times New Roman",
  fontSize: 12,
  lineSpacing: 1.5,
});
export function publicationOptions(value = {}) {
  const result = { ...DEFAULT_EXPORT_OPTIONS };
  for (const k of [
    "titlePage",
    "headings",
    "chapterBreaks",
    "sceneHeadings",
    "pageNumbers",
  ])
    if (typeof value?.[k] === "boolean") result[k] = value[k];
  if (["Times New Roman", "Georgia", "Courier New"].includes(value?.font))
    result.font = value.font;
  if ([10, 11, 12, 14].includes(value?.fontSize))
    result.fontSize = value.fontSize;
  if ([1, 1.5, 2].includes(value?.lineSpacing))
    result.lineSpacing = value.lineSpacing;
  return result;
}
export function hasHeading(node, options) {
  return (
    options.headings !== false &&
    (typeof node.headingInExport === "boolean"
      ? node.headingInExport
      : node.kind === "folder" || options.sceneHeadings === true)
  );
}
