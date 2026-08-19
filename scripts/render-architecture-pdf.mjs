import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outputPath = path.join(
  root,
  "docs/architecture/ai-customer-operations-platform-architecture.pdf"
);
const sourceFiles = [
  "docs/architecture/hld.md",
  "docs/architecture/dld.md",
  "docs/architecture/network-and-data-flow.md",
  "docs/architecture/technology-stack.md",
  "docs/architecture/deployment.md",
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
}

function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdown(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;
  let codeLines = [];
  let codeLanguage = "";

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      output.push(
        `<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${listType}>`
      );
      listItems = [];
      listType = null;
    }
  };
  const flushCode = () => {
    if (codeLines.length > 0) {
      const content = escapeHtml(codeLines.join("\n"));
      if (codeLanguage === "mermaid") {
        output.push(`<div class="mermaid">${content}</div>`);
      } else {
        output.push(`<pre><code>${content}</code></pre>`);
      }
      codeLines = [];
      codeLanguage = "";
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (codeLanguage) {
      if (line.trim() === "```") flushCode();
      else codeLines.push(line);
      continue;
    }
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      flushParagraph();
      flushList();
      codeLanguage = fence[1].trim();
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      flushParagraph();
      flushList();
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      const level = match[1].length;
      output.push(`<h${level}>${inlineMarkdown(match[2])}</h${level}>`);
      continue;
    }
    if (/^\s*\|/.test(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph();
      flushList();
      const header = tableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && /^\s*\|/.test(lines[index]) && lines[index].trim() !== "") {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      output.push(
        `<table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      );
      continue;
    }
    const listMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const nextType = /^\s*\d+\./.test(line) ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType ??= nextType;
      listItems.push(listMatch[1]);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.trim() === "---") {
      flushParagraph();
      flushList();
      output.push("<hr>");
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  flushCode();
  return output.join("\n");
}

const sections = [];
for (const sourceFile of sourceFiles) {
  const markdown = await fs.readFile(path.join(root, sourceFile), "utf8");
  sections.push(`<section>${renderMarkdown(markdown)}</section>`);
}

const documentHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AI Customer Operations Platform - Architecture</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm; }
  :root { color: #17202a; font-family: "Aptos", "Segoe UI", sans-serif; }
  body { margin: 0; font-size: 10pt; line-height: 1.45; }
  .cover { min-height: 245mm; display: flex; flex-direction: column; justify-content: center; border-bottom: 3px solid #176b87; page-break-after: always; }
  .cover h1 { color: #123b4a; font-size: 30pt; line-height: 1.08; margin: 0 0 12pt; }
  .cover p { color: #4d6470; font-size: 14pt; max-width: 125mm; }
  .cover .meta { margin-top: 35mm; color: #176b87; font-size: 10pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  section { page-break-before: always; }
  section:first-of-type { page-break-before: auto; }
  h1 { color: #123b4a; font-size: 22pt; border-bottom: 2px solid #176b87; padding-bottom: 5pt; margin: 0 0 15pt; page-break-after: avoid; }
  h2 { color: #176b87; font-size: 15pt; margin: 18pt 0 7pt; page-break-after: avoid; }
  h3 { color: #285668; font-size: 12pt; margin: 13pt 0 5pt; page-break-after: avoid; }
  h4, h5, h6 { color: #285668; page-break-after: avoid; }
  p { margin: 6pt 0; orphans: 3; widows: 3; }
  ul, ol { margin: 5pt 0 8pt 17pt; padding-left: 10pt; }
  li { margin: 2pt 0; }
  code { font-family: "Cascadia Mono", "Consolas", monospace; font-size: 8.5pt; color: #15485b; background: #edf4f6; padding: 1pt 3pt; border-radius: 2pt; }
  pre { background: #f3f6f7; border: 1px solid #d5e0e4; border-left: 3px solid #176b87; padding: 8pt; overflow: hidden; white-space: pre-wrap; font-size: 7.2pt; line-height: 1.3; page-break-inside: avoid; }
  pre code { background: transparent; padding: 0; color: #25343a; }
  table { width: 100%; border-collapse: collapse; margin: 9pt 0 12pt; font-size: 8.5pt; page-break-inside: avoid; }
  th { background: #176b87; color: white; text-align: left; }
  th, td { border: 1px solid #c8d6db; padding: 4pt 5pt; vertical-align: top; }
  tr:nth-child(even) td { background: #f4f8f9; }
  blockquote { border-left: 3px solid #73aab8; margin: 8pt 0; padding: 2pt 10pt; color: #4d6470; }
  hr { border: 0; border-top: 1px solid #c8d6db; margin: 15pt 0; }
  a { color: #176b87; text-decoration: none; }
  .mermaid { text-align: center; margin: 10pt 0; page-break-inside: avoid; }
  .mermaid svg { max-width: 100%; height: auto; }
  @media print { a { color: inherit; } }
</style>
</head>
<body>
<div class="cover">
  <div class="meta">Architecture and Operations Documentation</div>
  <h1>AI Customer Operations Platform</h1>
  <p>High-level design, detailed design, network and data flows, technology stack, and deployment guide.</p>
  <p class="meta">Generated from the repository documentation</p>
</div>
${sections.join("\n")}
<script type="module">
  try {
    const { default: mermaid } = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
    await mermaid.run({ querySelector: ".mermaid" });
  } catch (error) {
    document.querySelectorAll(".mermaid").forEach((element) => {
      element.classList.add("diagram-fallback");
      element.textContent = "Diagram source could not be rendered in this environment.";
    });
  }
</script>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
await page.setContent(documentHtml, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.pdf({ path: outputPath, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
globalThis.console.log(outputPath);
