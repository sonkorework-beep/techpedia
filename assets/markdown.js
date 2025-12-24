// Minimal markdown renderer (safe by default: HTML is escaped)
// Supported: headings, bold/italic, inline/code blocks, lists, links, paragraphs.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInline(s) {
  let out = escapeHtml(s);

  // code
  out = out.replace(/`([^`]+)`/g, (_m, c) => `<code>${escapeHtml(c)}</code>`);

  // links
  out = out.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_m, text, url) => {
    const safeUrl = escapeHtml(url);
    const safeText = escapeHtml(text);
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeText}</a>`;
  });

  // bold then italic
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, t) => `<b>${escapeHtml(t)}</b>`);
  out = out.replace(/\*([^*]+)\*/g, (_m, t) => `<i>${escapeHtml(t)}</i>`);

  return out;
}

export function renderMarkdown(md) {
  const src = String(md ?? "").replace(/\r\n/g, "\n");

  // code blocks ```
  const blocks = [];
  let text = src.replace(/```([\s\S]*?)```/g, (_m, code) => {
    const idx = blocks.length;
    blocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return `\u0000CODEBLOCK_${idx}\u0000`;
  });

  const lines = text.split("\n");
  const out = [];

  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    // restore code blocks markers as their own line paragraphs
    const codeMarker = line.match(/^\u0000CODEBLOCK_(\d+)\u0000$/);
    if (codeMarker) {
      closeLists();
      out.push(blocks[Number(codeMarker[1])] || "");
      continue;
    }

    const trimmed = line.trimEnd();
    if (!trimmed.trim()) {
      closeLists();
      continue;
    }

    // headings
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }

    // unordered list
    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }

    // ordered list
    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }

    closeLists();

    // inline (including code markers inside)
    const withBlocks = trimmed.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_m, i) => blocks[Number(i)] || "");
    out.push(`<p>${renderInline(withBlocks)}</p>`);
  }

  closeLists();

  return out
    .join("\n")
    .replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_m, i) => blocks[Number(i)] || "");
}
