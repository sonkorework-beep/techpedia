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
  const uploadFile = $("uploadFile");
  const uploadBtn = $("uploadBtn");
  const uploadMeta = $("uploadMeta");

  const list = $("adminList");
  const search = $("adminSearch");
  const meta = $("adminMeta");
  const status = $("status");

  const reload = $("reload");
  const newItemBtn = $("newItem");
  const saveBtn = $("save");

  const f_id = $("f_id");
  const f_title = $("f_title");
  const f_file = $("f_file");
  const f_desc = $("f_desc");
  const f_tags = $("f_tags");
  const f_keywords = $("f_keywords");
  const f_guideId = $("f_guideId");
  const f_rename = $("f_rename");

  const openFile = $("openFile");
  const openGuide = $("openGuide");
  const renameBtn = $("renameBtn");

  let items = [];
  let currentId = null;

  function setStatus(msg) {
    status.textContent = msg || "";
  }

  function setLink(el, href) {
    if (href) {
      el.href = href;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  async function loadManifest() {
    setStatus("Загрузка…");
    const m = await api("/api/software", { method: "GET" });
    items = Array.isArray(m.items) ? m.items : [];
    applyFilter();
    setStatus("Готово");
  }

  function applyFilter() {
    const q = norm(search.value);
    const filtered = items
      .slice()
      .sort((a, b) => String(a.title).localeCompare(String(b.title), "ru"))
      .filter((it) => {
        if (!q) return true;
        return norm(it.title).includes(q);
      });

    list.innerHTML = "";
    for (const it of filtered) {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = `${it.title} (${it.id})`;
      list.appendChild(opt);
    }

    meta.textContent = `Записей: ${filtered.length}`;

    if (currentId && filtered.some((x) => x.id === currentId)) {
      list.value = currentId;
    } else if (filtered[0]) {
      currentId = filtered[0].id;
      list.value = currentId;
      loadCurrent();
    }
  }

  function clearForm() {
    f_id.value = "";
    f_title.value = "";
    f_file.value = "";
    f_desc.value = "";
    f_tags.value = "";
    f_keywords.value = "";
    f_guideId.value = "";
    f_rename.value = "";

    setLink(openFile, "");
    setLink(openGuide, "");
  }

  function loadCurrent() {
    const it = items.find((x) => x.id === currentId);
    if (!it) return;

    f_id.value = it.id || "";
    f_title.value = it.title || "";
    f_file.value = it.file || "";
    f_desc.value = it.description || "";
    f_tags.value = (it.tags || []).join(", ");
    f_keywords.value = (it.keywords || []).join(", ");
    f_guideId.value = it.guideId || "";

    setLink(openFile, it.file);
    setLink(openGuide, it.guideId ? `guides.html?id=${encodeURIComponent(it.guideId)}` : "");
  }

  function upsertCurrentFromForm() {
    const id = f_id.value.trim();
    const payload = {
      id,
      title: f_title.value.trim(),
      file: f_file.value.trim(),
      description: f_desc.value.trim(),
      tags: splitCsv(f_tags.value),
      keywords: splitCsv(f_keywords.value),
      guideId: f_guideId.value.trim() || undefined
    };

    if (!payload.id || !payload.title || !payload.file) {
      throw new Error("ID, название и ссылка на файл обязательны");
    }

    const idx = items.findIndex((x) => x.id === id);
    if (idx >= 0) items[idx] = { ...items[idx], ...payload };
    else items.push(payload);

    currentId = id;
  }

  async function saveManifest() {
    setStatus("Сохранение…");
    upsertCurrentFromForm();
    await api("/api/software", {
      method: "PUT",
      body: JSON.stringify({ version: 1, items })
    });
    await loadManifest();
    setStatus("Сохранено");
  }

  async function upload() {
    uploadMeta.textContent = "";
    if (!uploadFile.files || !uploadFile.files[0]) {
      uploadMeta.textContent = "Выберите файл";
      return;
    }

    const fd = new FormData();
    fd.append("file", uploadFile.files[0]);

    uploadMeta.textContent = "Загрузка…";
    const res = await fetch("/api/files", { method: "POST", body: fd });
    const json = await res.json();

    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    uploadMeta.textContent = `Готово: ${json.fileName}`;
    f_file.value = json.url;
    setLink(openFile, json.url);

    if (!f_title.value.trim()) {
      f_title.value = uploadFile.files[0].name;
    }
  }

  async function renameFile() {
    const currentUrl = f_file.value.trim();
    if (!currentUrl.startsWith("/downloads/")) {
      setStatus("Переименование поддерживается только для файлов из /downloads/");
      return;
    }

    const oldName = decodeURIComponent(currentUrl.replace("/downloads/", ""));
    const newName = f_rename.value.trim();
    if (!newName) return;

    setStatus("Переименование…");
    const json = await api("/api/files/rename", {
      method: "POST",
      body: JSON.stringify({ fileName: oldName, newFileName: newName })
    });

    f_file.value = json.url;
    setLink(openFile, json.url);

    // update current item (if exists)
    try {
      upsertCurrentFromForm();
      const idx = items.findIndex((x) => x.id === f_id.value.trim());
      if (idx >= 0) items[idx].file = json.url;
    } catch {}

    await api("/api/software", {
      method: "PUT",
      body: JSON.stringify({ version: 1, items })
    });

    await loadManifest();
    setStatus("Переименовано");
  }

  // wire up
  uploadBtn.addEventListener("click", () => {
    upload().catch((e) => {
      uploadMeta.textContent = `Ошибка: ${e.message}`;
    });
  });

  reload.addEventListener("click", () => loadManifest().catch((e) => setStatus(`Ошибка: ${e.message}`)));
  newItemBtn.addEventListener("click", () => {
    currentId = null;
    clearForm();
    setStatus("Новая запись: заполните поля и нажмите Сохранить");
  });

  search.addEventListener("input", () => applyFilter());
  list.addEventListener("change", () => {
    currentId = list.value;
    loadCurrent();
  });

  saveBtn.addEventListener("click", () => {
    saveManifest().catch((e) => setStatus(`Ошибка: ${e.message}`));
  });

  renameBtn.addEventListener("click", () => {
    renameFile().catch((e) => setStatus(`Ошибка: ${e.message}`));
  });

  await loadManifest();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
