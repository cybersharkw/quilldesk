import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
  AlignmentType,
  Footer,
  PageNumber,
} from "docx";
import { manuscript, plainText } from "../shared/model.mjs";
import { hasHeading, publicationOptions } from "../shared/publication.mjs";
function layout(o) {
  return {
    font: ["Times New Roman", "Courier New", "Georgia"].includes(o.font)
      ? o.font
      : "Times New Roman",
    size: [10, 11, 12, 14].includes(Number(o.fontSize))
      ? Number(o.fontSize)
      : 12,
    line: [1, 1.5, 2].includes(Number(o.lineSpacing))
      ? Number(o.lineSpacing)
      : 1.5,
  };
}
export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function docHtml(node) {
  if (node.type === "text") {
    let text = escapeHtml(node.text);
    for (const mark of node.marks || []) {
      const tag = {
        bold: "strong",
        italic: "em",
        underline: "u",
        strike: "s",
        code: "code",
        highlight: "mark",
      }[mark.type];
      if (tag) text = `<${tag}>${text}</${tag}>`;
    }
    return text;
  }
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "horizontalRule") return "<hr>";
  const tags = {
    paragraph: "p",
    heading: `h${Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))}`,
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    blockquote: "blockquote",
    codeBlock: "pre",
  };
  const content = (node.content || []).map(docHtml).join("");
  const tag = tags[node.type];
  const align = ["left", "right", "center", "justify"].includes(
    node.attrs?.textAlign,
  )
    ? ` style="text-align:${node.attrs.textAlign}"`
    : "";
  return tag ? `<${tag}${align}>${content || "<br>"}</${tag}>` : content;
}
export function compileText(p, options = {}) {
  options = publicationOptions({ ...p.exportOptions, ...options });
  const intro =
    options.titlePage === false ? "" : `${p.title}\n${p.author}\n\n`;
  return (
    intro +
    manuscript(p)
      .map(
        (n) =>
          (hasHeading(n, options) ? n.title + "\n\n" : "") +
          plainText(n.doc).trim(),
      )
      .join("\n\n* * *\n\n") +
    "\n"
  );
}
export function compileHtml(p, options = {}) {
  options = publicationOptions({ ...p.exportOptions, ...options });
  const style = layout(options);
  const title =
    options.titlePage === false
      ? ""
      : `<header><h1>${escapeHtml(p.title)}</h1><p>${escapeHtml(p.author)}</p></header>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(p.title)}</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:25mm}body{font:${style.size}pt "${style.font}",serif;line-height:${style.line};color:#171717}header{text-align:center;padding-top:25%;break-after:page}header h1{font-size:28pt}h1,h2,h3{break-after:avoid}section.chapter:not(:first-of-type){${options.chapterBreaks ? "break-before:page;" : ""}}p{orphans:3;widows:3}blockquote{margin-left:2em}pre{white-space:pre-wrap}mark{background:#fff3a8}</style></head><body>${title}${manuscript(
    p,
  )
    .map(
      (n) =>
        `<section class="${n.kind === "folder" ? "chapter" : "scene"}">${!hasHeading(n, options) ? "" : `<${n.kind === "folder" ? "h1" : "h2"}>${escapeHtml(n.title)}</${n.kind === "folder" ? "h1" : "h2"}>`}${docHtml(n.doc)}</section>`,
    )
    .join("")}</body></html>`;
}
function runs(nodes = []) {
  return nodes.flatMap((n) => {
    if (n.type === "hardBreak") return [new TextRun({ break: 1 })];
    if (n.type !== "text") return runs(n.content);
    const has = (t) => (n.marks || []).some((m) => m.type === t);
    return [
      new TextRun({
        text: n.text,
        bold: has("bold"),
        italics: has("italic"),
        strike: has("strike"),
        underline: has("underline") ? {} : undefined,
        highlight: has("highlight") ? "yellow" : undefined,
        font: has("code") ? "Consolas" : undefined,
      }),
    ];
  });
}
function paragraphs(nodes = [], list = null, level = 0, line = 360) {
  return nodes.flatMap((n) => {
    if (n.type === "bulletList" || n.type === "orderedList")
      return paragraphs(n.content, n.type, Math.min(5, level + 1), line);
    if (n.type === "listItem" || n.type === "blockquote" || n.type === "doc")
      return paragraphs(n.content, list, level, line);
    if (n.type === "horizontalRule")
      return [
        new Paragraph({
          children: [new TextRun("* * *")],
          alignment: AlignmentType.CENTER,
        }),
      ];
    return [
      new Paragraph({
        children: runs(n.content),
        spacing: { after: 160, line },
        heading:
          n.type === "heading"
            ? HeadingLevel[
                `HEADING_${Math.min(6, Math.max(1, Number(n.attrs?.level) || 2))}`
              ]
            : undefined,
        alignment: {
          left: AlignmentType.LEFT,
          right: AlignmentType.RIGHT,
          center: AlignmentType.CENTER,
          justify: AlignmentType.JUSTIFIED,
        }[n.attrs?.textAlign],
        bullet:
          list === "bulletList" ? { level: Math.max(0, level - 1) } : undefined,
        numbering:
          list === "orderedList"
            ? { reference: "numbered", level: Math.max(0, level - 1) }
            : undefined,
      }),
    ];
  });
}
export async function compileDocx(p, options = {}) {
  options = publicationOptions({ ...p.exportOptions, ...options });
  const style = layout(options);
  const content = [];
  if (options.titlePage !== false)
    content.push(
      new Paragraph({ text: p.title, heading: HeadingLevel.TITLE }),
      new Paragraph(p.author),
      new Paragraph({ children: [new PageBreak()] }),
    );
  let first = true;
  for (const n of manuscript(p)) {
    if (hasHeading(n, options))
      content.push(
        new Paragraph({
          text: n.title,
          heading:
            n.kind === "folder"
              ? HeadingLevel.HEADING_1
              : HeadingLevel.HEADING_2,
          pageBreakBefore:
            !first && !!options.chapterBreaks && n.kind === "folder",
        }),
      );
    else if (!first && options.chapterBreaks && n.kind === "folder")
      content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(...paragraphs(n.doc.content, null, 0, style.line * 240));
    first = false;
  }
  const doc = new Document({
    creator: p.author,
    title: p.title,
    description: "Compiled with QuillDesk",
    styles: {
      default: {
        document: {
          run: { font: style.font, size: style.size * 2 },
          paragraph: { spacing: { line: style.line * 240 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "numbered",
          levels: Array.from({ length: 6 }, (_, i) => ({
            level: i,
            format: "decimal",
            text: `%${i + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: { indent: { left: 720 * (i + 1), hanging: 260 } },
            },
          })),
        },
      ],
    },
    sections: [
      {
        footers:
          options.pageNumbers === false
            ? undefined
            : {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          children: [
                            PageNumber.CURRENT,
                            " / ",
                            PageNumber.TOTAL_PAGES,
                          ],
                          size: 20,
                        }),
                      ],
                    }),
                  ],
                }),
              },
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 },
          },
        },
        children: content,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
