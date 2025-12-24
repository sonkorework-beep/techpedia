const MANIFEST_URL = "data/software.json";

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

function matchesTokens(item, tokens) {
  if (tokens.length === 0) return true;
  const hay = norm(
    [
      item.title,
      item.description,
      ...(item.tags ?? []),
      ...(item.keywords ?? [])
    ].join(" ")
  );
  return tokens.every((t) => hay.includes(t));
}

function hasAllTags(item, selectedTags) {
  if (selectedTags.size === 0) return true;
  const tags = new Set((item.tags ?? []).map((t) => norm(t)));
  for (const t of selectedTags) {
    if (!tags.has(t)) return false;
  }
  return true;
}

async function loadManifest() {
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${MANIFEST_URL}: ${res.status}`);
  return res.json();
}

function uniqSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b, "ru"));
}

function renderTagCloud(container, tags, selectedTags, onToggle) {
  container.innerHTML = "";
  for (const t of tags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = t;

    if (selectedTags.has(norm(t))) chip.classList.add("is-active");

    chip.addEventListener("click", () => onToggle(t));
    container.appendChild(chip);
  }
}

function renderList(container, items) {
  container.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Ничего не найдено. Попробуйте изменить запрос или теги.";
    container.appendChild(empty);
    return;
  }

  for (const it of items) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("div");
    title.className = "card__title";
    title.textContent = it.title;

    const desc = document.createElement("div");
    desc.className = "card__desc";
    desc.textContent = it.description || "";

    const actions = document.createElement("div");
    actions.className = "row";

    const download = document.createElement("a");
    download.className = "chip";
    download.href = it.file;
    download.target = "_blank";
    download.rel = "noopener";
    download.textContent = "Скачать";
    actions.appendChild(download);

    if (it.guideId) {
      const guide = document.createElement("a");
      guide.className = "chip";
      guide.href = `guides.html?id=${encodeURIComponent(it.guideId)}`;
      guide.textContent = "Статья";
      actions.appendChild(guide);
    }

    const tagsRow = document.createElement("div");
    tagsRow.className = "row";
    tagsRow.style.marginTop = "10px";

    for (const t of it.tags ?? []) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.style.cursor = "default";
      chip.textContent = t;
      tagsRow.appendChild(chip);
    }

    card.appendChild(title);
    if (it.description) card.appendChild(desc);
    card.appendChild(actions);
    if ((it.tags ?? []).length) card.appendChild(tagsRow);

    container.appendChild(card);
  }
}

function writeUrlState(q, selectedTags) {
  const url = new URL(window.location.href);

  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");

  if (selectedTags.size) url.searchParams.set("tags", [...selectedTags].join(","));
  else url.searchParams.delete("tags");

  window.history.replaceState({}, "", url);
}

async function main() {
  const search = $("softSearch");
  const tagCloud = $("tagCloud");
  const list = $("softList");
  const resultCount = $("resultCount");
  const clear = $("clearFilters");
  const meta = $("softMeta");

  let items = [];
  try {
    const manifest = await loadManifest();
    items = Array.isArray(manifest.items) ? manifest.items : [];
  } catch (e) {
    meta.textContent = `Ошибка загрузки каталога: ${e.message}`;
    return;
  }

  if (items.length === 0) {
    meta.textContent = "Каталог пуст. Добавьте элементы в data/software.json";
    return;
  }

  const allTags = uniqSorted(items.flatMap((i) => i.tags ?? []));

  const selectedTags = new Set();
  const url = new URL(window.location.href);
  const initialQ = url.searchParams.get("q") || "";
  const initialTags = url.searchParams.get("tags") || "";

  if (initialQ) search.value = initialQ;
  if (initialTags) {
    for (const t of initialTags.split(",")) {
      const n = norm(t.trim());
      if (n) selectedTags.add(n);
    }
  }

  function apply() {
    const tokens = tokenize(search.value);
    const filtered = items
      .filter((it) => matchesTokens(it, tokens))
      .filter((it) => hasAllTags(it, selectedTags));

    renderList(list, filtered);
    resultCount.textContent = `Показано: ${filtered.length} из ${items.length}`;

    renderTagCloud(tagCloud, allTags, selectedTags, (t) => {
      const key = norm(t);
      if (selectedTags.has(key)) selectedTags.delete(key);
      else selectedTags.add(key);

      writeUrlState(search.value, selectedTags);
      apply();
    });

    writeUrlState(search.value, selectedTags);
  }

  search.addEventListener("input", () => apply());

  clear.addEventListener("click", () => {
    search.value = "";
    selectedTags.clear();
    apply();
  });

  apply();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
