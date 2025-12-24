function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHm() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseHm(hm) {
  const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function durationMin(start, end) {
  const s = parseHm(start);
  const e = parseHm(end);
  if (s == null || e == null) return 0;
  const diff = e - s;
  return diff >= 0 ? diff : 0;
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

function computeRemaining(employees, events) {
  const map = new Map();
  for (const e of employees) {
    map.set(e.name, {
      breakLimit: Number(e.breakMinutes || 0),
      lunchLimit: Number(e.lunchMinutes || 0),
      breakUsed: 0,
      lunchUsed: 0
    });
  }

  for (const ev of events) {
    const fio = String(ev["ФИО"] || "");
    const type = String(ev["Тип"] || "");
    const state = String(ev["Состояние"] || "");
    const start = String(ev["Начало"] || "");
    const end = String(ev["Конец"] || "");

    if (!fio || !map.has(fio)) continue;

    // count only finished
    if (state !== "Завершен") continue;

    const d = durationMin(start, end);
    const rec = map.get(fio);
    if (type === "Перерыв") rec.breakUsed += d;
    if (type === "Обед") rec.lunchUsed += d;
  }

  const rows = [];
  for (const [fio, r] of map.entries()) {
    rows.push({
      fio,
      breakLeft: Math.max(0, r.breakLimit - r.breakUsed),
      lunchLeft: Math.max(0, r.lunchLimit - r.lunchUsed),
      breakUsed: r.breakUsed,
      lunchUsed: r.lunchUsed,
      breakLimit: r.breakLimit,
      lunchLimit: r.lunchLimit
    });
  }

  rows.sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
  return rows;
}

function renderRemaining(container, remRows) {
  if (!remRows.length) {
    container.textContent = "Добавьте сотрудников в лимиты слева.";
    return;
  }

  container.innerHTML = remRows
    .map(
      (r) =>
        `<div class="muted">${r.fio}: Перерыв ${r.breakLeft}/${r.breakLimit} мин, Обед ${r.lunchLeft}/${r.lunchLimit} мин</div>`
    )
    .join("");
}

function renderEvents(container, events, onAction) {
  container.innerHTML = "";

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const head = ["ФИО", "Тип", "Состояние", "Начало", "Конец", "Длительность (мин)", "Действия"];

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const h of head) {
    const th = document.createElement("th");
    th.textContent = h;
    th.style.textAlign = "left";
    th.style.padding = "10px";
    th.style.borderBottom = "1px solid var(--border)";
    th.style.color = "var(--muted)";
    th.style.fontWeight = "700";
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");

  const sorted = (events || []).slice().sort((a, b) => {
    return String(a["ФИО"] || "").localeCompare(String(b["ФИО"] || ""), "ru");
  });

  for (const ev of sorted) {
    const tr = document.createElement("tr");
    const dur = durationMin(ev["Начало"], ev["Конец"]);

    const cells = [
      ev["ФИО"] || "",
      ev["Тип"] || "",
      ev["Состояние"] || "",
      ev["Начало"] || "",
      ev["Конец"] || "",
      String(dur)
    ];

    for (const v of cells) {
      const td = document.createElement("td");
      td.textContent = String(v);
      td.style.padding = "10px";
      td.style.borderBottom = "1px solid var(--border)";
      td.style.verticalAlign = "top";
      tr.appendChild(td);
    }

    const tdActions = document.createElement("td");
    tdActions.style.padding = "10px";
    tdActions.style.borderBottom = "1px solid var(--border)";

    const row = document.createElement("div");
    row.className = "row";

    const bStart = document.createElement("button");
    bStart.className = "chip";
    bStart.type = "button";
    bStart.textContent = "Старт";

    const bFinish = document.createElement("button");
    bFinish.className = "chip";
    bFinish.type = "button";
    bFinish.textContent = "Финиш";

    const bEdit = document.createElement("button");
    bEdit.className = "chip";
    bEdit.type = "button";
    bEdit.textContent = "Правка";

    bStart.addEventListener("click", () => onAction("start", ev));
    bFinish.addEventListener("click", () => onAction("finish", ev));
    bEdit.addEventListener("click", () => onAction("edit", ev));

    row.appendChild(bStart);
    row.appendChild(bFinish);
    row.appendChild(bEdit);

    tdActions.appendChild(row);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderConfig(container, employees) {
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.marginTop = "10px";

  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "8px";

    const name = document.createElement("input");
    name.className = "input";
    name.style.flex = "2";
    name.value = e.name || "";
    name.placeholder = "ФИО";

    const br = document.createElement("input");
    br.className = "input";
    br.style.width = "90px";
    br.value = String(e.breakMinutes ?? "");
    br.placeholder = "Перерыв";

    const lu = document.createElement("input");
    lu.className = "input";
    lu.style.width = "90px";
    lu.value = String(e.lunchMinutes ?? "");
    lu.placeholder = "Обед";

    const del = document.createElement("button");
    del.className = "chip";
    del.type = "button";
    del.textContent = "Удалить";
    del.style.borderColor = "#fecaca";

    del.addEventListener("click", () => {
      employees.splice(i, 1);
      renderConfig(container, employees);
    });

    name.addEventListener("input", () => (e.name = name.value));
    br.addEventListener("input", () => (e.breakMinutes = Number(br.value || 0)));
    lu.addEventListener("input", () => (e.lunchMinutes = Number(lu.value || 0)));

    row.appendChild(name);
    row.appendChild(br);
    row.appendChild(lu);
    row.appendChild(del);

    wrap.appendChild(row);
  }

  container.appendChild(wrap);
}

function renderEventForm(container, employees, event, onSubmit, onCancel) {
  container.innerHTML = "";

  const title = document.createElement("div");
  title.style.fontWeight = "800";
  title.textContent = event?.id ? "Редактирование" : "Новое событие";

  const fio = document.createElement("select");
  fio.className = "select";
  for (const e of employees) {
    const opt = document.createElement("option");
    opt.value = e.name;
    opt.textContent = e.name;
    fio.appendChild(opt);
  }

  const type = document.createElement("select");
  type.className = "select";
  ["Перерыв", "Обед"].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    type.appendChild(opt);
  });

  const state = document.createElement("select");
  state.className = "select";
  ["Запланирован", "Начат", "Завершен"].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    state.appendChild(opt);
  });

  const start = document.createElement("input");
  start.className = "input";
  start.placeholder = "HH:MM";

  const end = document.createElement("input");
  end.className = "input";
  end.placeholder = "HH:MM";

  // prefill
  if (event) {
    fio.value = event["ФИО"] || fio.value;
    type.value = event["Тип"] || type.value;
    state.value = event["Состояние"] || state.value;
    start.value = event["Начало"] || "";
    end.value = event["Конец"] || "";
  }

  const row1 = document.createElement("div");
  row1.className = "row";
  row1.appendChild(fio);
  row1.appendChild(type);
  row1.appendChild(state);

  const row2 = document.createElement("div");
  row2.className = "row";
  row2.style.marginTop = "10px";
  start.style.width = "120px";
  end.style.width = "120px";
  row2.appendChild(start);
  row2.appendChild(end);

  const actions = document.createElement("div");
  actions.className = "row";
  actions.style.marginTop = "10px";

  const save = document.createElement("button");
  save.className = "chip";
  save.type = "button";
  save.textContent = "Сохранить";

  const cancel = document.createElement("button");
  cancel.className = "chip";
  cancel.type = "button";
  cancel.textContent = "Отмена";

  actions.appendChild(save);
  actions.appendChild(cancel);

  save.addEventListener("click", () => {
    onSubmit({
      id: event?.id,
      "ФИО": fio.value,
      "Тип": type.value,
      "Состояние": state.value,
      "Начало": start.value,
      "Конец": end.value
    });
  });
  cancel.addEventListener("click", () => onCancel());

  container.appendChild(title);
  container.appendChild(document.createElement("hr"));
  container.appendChild(row1);
  container.appendChild(row2);
  container.appendChild(actions);
}

async function main() {
  const b_date = $("b_date");
  const b_today = $("b_today");
  const b_meta = $("b_meta");
  const b_cfg = $("b_cfg");
  const b_save_cfg = $("b_save_cfg");
  const b_add_emp = $("b_add_emp");
  const b_integration = $("b_integration");

  const b_reload = $("b_reload");
  const b_new = $("b_new");

  const b_table = $("b_table");
  const b_form = $("b_form");
  const b_remaining = $("b_remaining");

  const cfg = await getJson("/api/break/config");
  b_integration.textContent =
    "Для работы нужно указать data/integrations.json → appsScriptUrl и задеплоить Apps Script Web App.";

  const today = new Date();
  b_date.value = toYmd(today);

  // enforce maxHistoryDays
  const maxBack = new Date();
  maxBack.setDate(maxBack.getDate() - (cfg.maxHistoryDays || 183));
  b_date.min = toYmd(maxBack);
  b_date.max = toYmd(today);

  let employees = [];
  let events = [];

  function setMeta(msg) {
    b_meta.textContent = msg || "";
  }

  function refreshUi() {
    renderConfig(b_cfg, employees);
    renderEvents(b_table, events, onAction);
    const rem = computeRemaining(employees, events);
    renderRemaining(b_remaining, rem);
  }

  async function loadDay() {
    const date = b_date.value;
    setMeta("Загрузка…");
    const data = await getJson(`/api/break?date=${encodeURIComponent(date)}`);
    employees = Array.isArray(data.employees) ? data.employees : [];
    events = Array.isArray(data.events) ? data.events : [];

    refreshUi();
    setMeta(`Последнее обновление: ${toYmd(new Date())} ${nowHm()}`);
  }

  async function saveConfig() {
    setMeta("Сохранение лимитов…");
    // normalize
    employees = employees
      .map((e) => ({
        name: String(e.name || "").trim(),
        breakMinutes: Number(e.breakMinutes || cfg.defaults?.breakMinutes || 0),
        lunchMinutes: Number(e.lunchMinutes || cfg.defaults?.lunchMinutes || 0)
      }))
      .filter((e) => e.name);

    await postJson("/api/break/config", { employees });
    await loadDay();
    setMeta("Лимиты сохранены");
  }

  async function upsertEvent(ev) {
    const date = b_date.value;
    setMeta("Сохранение события…");
    const res = await postJson("/api/break/event", { date, event: ev });
    // update id on local
    if (!ev.id && res.id) ev.id = res.id;
    await loadDay();
    setMeta("Сохранено");
  }

  function showForm(ev) {
    b_form.classList.remove("hidden");
    renderEventForm(
      b_form,
      employees,
      ev,
      (newEv) => {
        upsertEvent(newEv).catch((e) => setMeta(`Ошибка: ${e.message}`));
        b_form.classList.add("hidden");
      },
      () => b_form.classList.add("hidden")
    );
  }

  function onAction(action, ev) {
    if (action === "edit") {
      showForm(ev);
      return;
    }

    const updated = { ...ev };

    if (action === "start") {
      updated["Состояние"] = "Начат";
      if (!updated["Начало"]) updated["Начало"] = nowHm();
    }

    if (action === "finish") {
      updated["Состояние"] = "Завершен";
      if (!updated["Начало"]) updated["Начало"] = nowHm();
      if (!updated["Конец"]) updated["Конец"] = nowHm();
    }

    upsertEvent(updated).catch((e) => setMeta(`Ошибка: ${e.message}`));
  }

  b_today.addEventListener("click", () => {
    b_date.value = toYmd(new Date());
    loadDay().catch((e) => setMeta(`Ошибка: ${e.message}`));
  });

  b_date.addEventListener("change", () => {
    loadDay().catch((e) => setMeta(`Ошибка: ${e.message}`));
  });

  b_reload.addEventListener("click", () => loadDay().catch((e) => setMeta(`Ошибка: ${e.message}`)));
  b_new.addEventListener("click", () => {
    if (!employees.length) {
      setMeta("Сначала добавьте сотрудников в лимиты слева и сохраните");
      return;
    }
    showForm({ "ФИО": employees[0].name, "Тип": "Перерыв", "Состояние": "Запланирован" });
  });

  b_add_emp.addEventListener("click", () => {
    employees.push({ name: "", breakMinutes: cfg.defaults?.breakMinutes || 0, lunchMinutes: cfg.defaults?.lunchMinutes || 0 });
    refreshUi();
  });

  b_save_cfg.addEventListener("click", () => saveConfig().catch((e) => setMeta(`Ошибка: ${e.message}`)));

  await loadDay();

  // polling
  setInterval(() => {
    loadDay().catch(() => {});
  }, cfg.pollMs || 5000);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
});
