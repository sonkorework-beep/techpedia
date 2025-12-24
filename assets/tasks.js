function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

async function getJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  const t = await r.text();
  let j;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    j = { raw: t };
  }
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  let j;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    j = { raw: t };
  }
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

function applyCellStyle(td, rule) {
  if (!rule) return;
  if (rule.bg) td.style.background = rule.bg;
}

function renderTable(container, cfg, rows, filterText) {
  container.innerHTML = "";

  const cols = cfg.columns || [];
  const f = norm(filterText);

  const filtered = (rows || []).filter((row) => {
    if (!f) return true;
    const hay = norm(cols.map((c) => row[c.key]).join(" "));
    return hay.includes(f);
  });

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c.key;
    th.style.textAlign = "left";
    th.style.padding = "10px";
    th.style.borderBottom = "1px solid var(--border)";
    th.style.color = "var(--muted)";
    th.style.fontWeight = "700";
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");

  for (const row of filtered) {
    const tr = document.createElement("tr");

    for (const c of cols) {
      const td = document.createElement("td");
      td.style.padding = "10px";
      td.style.borderBottom = "1px solid var(--border)";
      td.style.verticalAlign = "top";

      const val = row[c.key] ?? "";
      td.textContent = String(val);

      const rules = cfg.formatRules?.[c.key];
      if (rules) applyCellStyle(td, rules[String(val)]);

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);

  return filtered.length;
}

function nowIsoLocal() {
  // ISO without timezone conversion requirement: use current local time
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

async function main() {
  const t_fio = $("t_fio");
  const t_topic = $("t_topic");
  const t_desc = $("t_desc");
  const t_priority = $("t_priority");
  const t_status = $("t_status");
  const t_add = $("t_add");
  const t_reload = $("t_reload");
  const t_meta = $("t_meta");
  const t_table = $("t_table");
  const t_count = $("t_count");
  const t_filter = $("t_filter");
  const t_integration = $("t_integration");

  let cfg;
  let lastRows = [];

  function setMeta(msg) {
    t_meta.textContent = msg || "";
  }

  async function loadConfig() {
    cfg = await getJson("/api/tasks/config");
    t_integration.textContent =
      "Для работы нужно указать data/integrations.json → appsScriptUrl и задеплоить Apps Script Web App.";
  }

  async function loadTasks() {
    setMeta("Загрузка…");
    const data = await getJson("/api/tasks");
    lastRows = Array.isArray(data.rows) ? data.rows : [];

    const visible = renderTable(t_table, cfg, lastRows, t_filter.value);
    t_count.textContent = `Показано: ${visible} из ${lastRows.length}`;
    setMeta(`Последнее обновление: ${nowIsoLocal()}`);
  }

  async function addTask() {
    const row = {
      "Дата": nowIsoLocal(),
      "ФИО": t_fio.value.trim(),
      "Тема": t_topic.value.trim(),
      "Описание": t_desc.value.trim(),
      "Приоритет": t_priority.value,
      "Статус": t_status.value
    };

    if (!row["ФИО"] || !row["Тема"]) {
      setMeta("ФИО и Тема обязательны");
      return;
    }

    setMeta("Отправка…");
    await postJson("/api/tasks", row);

    t_desc.value = "";
    setMeta("Добавлено");
    await loadTasks();
  }

  t_add.addEventListener("click", () => addTask().catch((e) => setMeta(`Ошибка: ${e.message}`)));
  t_reload.addEventListener("click", () => loadTasks().catch((e) => setMeta(`Ошибка: ${e.message}`)));
  t_filter.addEventListener("input", () => {
    const visible = renderTable(t_table, cfg, lastRows, t_filter.value);
    t_count.textContent = `Показано: ${visible} из ${lastRows.length}`;
  });

  await loadConfig();
  await loadTasks();

  // polling
  setInterval(() => {
    loadTasks().catch(() => {});
  }, cfg.pollMs || 5000);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
