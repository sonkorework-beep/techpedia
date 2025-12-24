import { renderMarkdown } from "./markdown.js";

const MANIFEST_URL = "data/guides.json";

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

function tokenize(q) {
  return norm(q)
    .replace(/[#,]/g, " ")
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function matchesTokens(guide, tokens) {
  if (tokens.length === 0) return true;
  const hay = norm(
    [
      guide.title,
      guide.category,
      guide.summary,
      ...(guide.tags ?? []),
      ...(guide.keywords ?? [])
    ].join(" ")
  );

  return tokens.every((t) => hay.includes(t));
}

function groupByCategory(guides) {
  const map = new Map();
  for (const g of guides) {
    const cat = g.category || "Без категории";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(g);
  }

  for (const [cat, arr] of map.entries()) {
    arr.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    map.set(cat, arr);
  }

  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
}

function renderTags(container, tags) {
  container.innerHTML = "";
  for (const t of tags ?? []) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.style.cursor = "default";
    chip.textContent = t;
    container.appendChild(chip);
  }
}

function setQueryParam(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("id", id);
  window.history.replaceState({}, "", url);
}

async function loadManifest() {
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${MANIFEST_URL}: ${res.status}`);
  return res.json();
}

function buildOptions(select, guides) {
  select.innerHTML = "";
  const grouped = groupByCategory(guides);

  for (const [cat, items] of grouped) {
    const og = document.createElement("optgroup");
    og.label = cat;
    for (const g of items) {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.title;
      og.appendChild(opt);
    }
    select.appendChild(og);
  }
}

function selectGuide(select, guideId) {
  select.value = guideId;
  if (select.value !== guideId) {
    const first = select.querySelector("option");
    if (first) select.value = first.value;
  }
}

function findGuide(guides, id) {
  return guides.find((g) => g.id === id) || null;
}

function getSelectedGuideId(select) {
  const opt = select.selectedOptions?.[0];
  return opt?.value ?? "";
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

async function main() {
  const search = $("guideSearch");
  const select = $("guideSelect");
  const meta = $("guideMeta");
  const title = $("guideTitle");
  const tags = $("guideTags");

  const frame = $("guideFrame");
  const openInNewTab = $("openInNewTab");

  const contentInner = $("guideContentInner");

  let guides = [];
  try {
    const manifest = await loadManifest();
    guides = Array.isArray(manifest.guides) ? manifest.guides : [];
  } catch (e) {
    meta.textContent = `Ошибка загрузки списка статей: ${e.message}`;
    return;
  }

  if (guides.length === 0) {
    meta.textContent = "Список статей пуст. Добавьте элементы в data/guides.json";
    return;
  }

  // Initial state from URL
  let currentId = new URL(window.location.href).searchParams.get("id") || "";
  const initialQuery = new URL(window.location.href).searchParams.get("q") || "";
  if (initialQuery) search.value = initialQuery;

  function applyFilter() {
    const tokens = tokenize(search.value);
    const filtered = guides.filter((g) => matchesTokens(g, tokens));

    buildOptions(select, filtered);
    meta.textContent = `Найдено статей: ${filtered.length}`;

    if (currentId && findGuide(filtered, currentId)) {
      selectGuide(select, currentId);
    } else {
      const first = select.querySelector("option");
      if (first) selectGuide(select, first.value);
    }

    renderSelected();
  }

  async function renderSelected() {
    const id = getSelectedGuideId(select);
    const g = findGuide(guides, id);
    if (!g) return;

    currentId = g.id;

    title.textContent = g.title;
    renderTags(tags, g.tags);

    openInNewTab.href = g.path;
    openInNewTab.classList.remove("hidden");

    setQueryParam(g.id);

    const p = String(g.path || "");

    // markdown render
    if (p.toLowerCase().endsWith(".md")) {
      frame.classList.add("hidden");
      try {
        const md = await fetchText(p);
        contentInner.innerHTML = renderMarkdown(md);
      } catch (e) {
        contentInner.innerHTML = `<div class="muted">Ошибка загрузки статьи: ${String(e.message || e)}</div>`;
      }
      return;
    }

    // fallback: html in iframe
    contentInner.innerHTML = "";
    frame.src = p;
    frame.classList.remove("hidden");
  }

  search.addEventListener("input", () => {
    const u = new URL(window.location.href);
    if (search.value) u.searchParams.set("q", search.value);
    else u.searchParams.delete("q");
    window.history.replaceState({}, "", u);

    applyFilter();
  });

  select.addEventListener("change", () => {
    renderSelected();
  });

  applyFilter();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
