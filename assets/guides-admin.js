import { renderMarkdown } from "./markdown.js";

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

function splitCsv(s) {
  return String(s || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

async function api(url, opts) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts && opts.headers ? opts.headers : {})
    }
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function main() {
  const list = $("adminList");
  const search = $("adminSearch");
  const meta = $("adminMeta");
  const status = $("status");

  const btnNew = $("newGuide");
  const btnReload = $("reload");
  const btnSave = $("save");
  const btnDelete = $("delete");

  const f_id = $("f_id");
  const f_title = $("f_title");
  const f_category = $("f_category");
  const f_tags = $("f_tags");
  const f_keywords = $("f_keywords");
  const f_summary = $("f_summary");
  const f_md = $("f_md");

  const preview = $("preview");
  const openGuide = $("openGuide");

  let guides = [];
  let currentId = null;
  let isNew = false;

  function setStatus(msg) {
    status.textContent = msg || "";
  }

  function renderPreview() {
    preview.innerHTML = renderMarkdown(f_md.value);
  }

  async function loadList() {
    setStatus("Загрузка…");
    const manifest = await api("/api/guides", { method: "GET" });
    guides = Array.isArray(manifest.guides) ? manifest.guides : [];

    applyFilter();
    setStatus("Готово");
  }

  function applyFilter() {
    const q = norm(search.value);
    const filtered = guides
      .slice()
      .sort((a, b) => String(a.title).localeCompare(String(b.title), "ru"))
      .filter((g) => {
        if (!q) return true;
        return norm(g.title).includes(q) || norm(g.id).includes(q);
      });

    list.innerHTML = "";
    for (const g of filtered) {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = `${g.title} (${g.id})`;
      list.appendChild(opt);
    }

    meta.textContent = `Статей: ${filtered.length}`;

    if (currentId && filtered.some((g) => g.id === currentId)) {
      list.value = currentId;
    } else if (filtered[0]) {
      list.value = filtered[0].id;
      currentId = filtered[0].id;
      void loadCurrent();
    }
  }

  async function loadCurrent() {
    if (!currentId) return;
    isNew = false;

    const g = guides.find((x) => x.id === currentId);
    if (!g) return;

    f_id.value = g.id;
    f_id.disabled = true;

    f_title.value = g.title || "";
    f_category.value = g.category || "";
    f_tags.value = (g.tags || []).join(", ");
    f_keywords.value = (g.keywords || []).join(", ");
    f_summary.value = g.summary || "";

    openGuide.href = `guides.html?id=${encodeURIComponent(g.id)}`;

    // Load markdown content via API to avoid CORS/file restrictions
    const content = await api(`/api/guides/${encodeURIComponent(g.id)}/content`, { method: "GET" });
    f_md.value = content.content || "";

    renderPreview();
    setStatus("Загружено");
  }

  function newGuide() {
    isNew = true;
    currentId = null;

    f_id.disabled = false;
    f_id.value = "";
    f_title.value = "";
    f_category.value = "";
    f_tags.value = "";
    f_keywords.value = "";
    f_summary.value = "";
    f_md.value = "# Новая статья\n\nТекст...\n";

    openGuide.href = "guides.html";
    renderPreview();
    setStatus("Новая статья: заполните поля и нажмите Сохранить");
  }

  async function save() {
    const payload = {
      id: f_id.value.trim(),
      title: f_title.value.trim(),
      category: f_category.value.trim(),
      tags: splitCsv(f_tags.value),
      keywords: splitCsv(f_keywords.value),
      summary: f_summary.value.trim(),
      contentMarkdown: f_md.value
    };

    if (!payload.id || !payload.title) {
      setStatus("ID и Заголовок обязательны");
      return;
    }

    setStatus("Сохранение…");

    if (isNew) {
      await api("/api/guides", { method: "POST", body: JSON.stringify(payload) });
      isNew = false;
      currentId = payload.id;
    } else {
      await api(`/api/guides/${encodeURIComponent(payload.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    }

    await loadList();
    setStatus("Сохранено");
  }

  async function del() {
    const id = f_id.value.trim();
    if (!id) return;
    if (!confirm(`Удалить статью ${id}?`)) return;

    setStatus("Удаление…");
    await api(`/api/guides/${encodeURIComponent(id)}`, { method: "DELETE" });

    newGuide();
    await loadList();
    setStatus("Удалено");
  }

  // events
  btnNew.addEventListener("click", () => newGuide());
  btnReload.addEventListener("click", () => loadList());

  list.addEventListener("change", () => {
    currentId = list.value;
    void loadCurrent();
  });

  search.addEventListener("input", () => applyFilter());

  f_md.addEventListener("input", () => renderPreview());

  btnSave.addEventListener("click", () => {
    void save().catch((e) => setStatus(`Ошибка: ${e.message}`));
  });
  btnDelete.addEventListener("click", () => {
    void del().catch((e) => setStatus(`Ошибка: ${e.message}`));
  });

  await loadList();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
