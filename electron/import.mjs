import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
export function checkDocxSize(buffer) {
  // Read central-directory sizes before allowing the DOCX parser to expand ZIP entries.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Ungültige DOCX-Datei.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16),
    total = 0;
  if (count > 2000 || buffer.readUInt16LE(eocd + 4) !== 0)
    throw new Error("DOCX ist zu komplex.");
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new Error("Ungültiges DOCX-Archiv.");
    total += buffer.readUInt32LE(offset + 24);
    if (total > 25 * 1024 * 1024)
      throw new Error("Entpackte DOCX-Datei ist größer als 25 MB.");
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
export async function importTextFile(file) {
  if (fs.statSync(file).size > 10 * 1024 * 1024)
    throw new Error("Import ist auf 10 MB pro Datei begrenzt.");
  const buffer = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  let text;
  if (ext === ".docx") {
    checkDocxSize(buffer);
    const zip = await JSZip.loadAsync(buffer);
    const entry = zip.file("word/document.xml");
    if (!entry) throw new Error("DOCX enthält keinen Dokumenttext.");
    const xml = await entry.async("string");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw new Error("XML-Entitäten werden nicht unterstützt.");
    const doc = new DOMParser({
      onError: () => {
        throw new Error("Ungültiges DOCX-XML.");
      },
    }).parseFromString(xml, "application/xml");
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p"));
    const read = (node) => {
      if (node.namespaceURI === ns && node.localName === "del") return "";
      if (node.namespaceURI === ns && node.localName === "t")
        return node.textContent;
      if (node.namespaceURI === ns && node.localName === "tab") return "\t";
      if (node.namespaceURI === ns && ["br", "cr"].includes(node.localName))
        return "\n";
      return Array.from(node.childNodes || [])
        .map(read)
        .join("");
    };
    text = paragraphs.map(read).join("\n");
  } else if ([".txt", ".md"].includes(ext)) {
    const encoding =
      buffer[0] === 255 && buffer[1] === 254
        ? "utf-16le"
        : buffer[0] === 254 && buffer[1] === 255
          ? "utf-16be"
          : "utf-8";
    text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
  } else throw new Error("Unterstützt werden TXT, Markdown und DOCX.");
  if (text.includes("\0")) throw new Error("Die Datei enthält Binärdaten.");
  if (text.length > 5000000) throw new Error("Importierter Text ist zu lang.");
  return { title: path.basename(file, ext), text };
}
