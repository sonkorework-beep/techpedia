const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const express = require("express");
const multer = require("multer");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const GUIDES_DIR = path.join(ROOT, ".guides");
const DOWNLOADS_DIR = path.join(ROOT, "downloads");

const GUIDES_JSON = path.join(DATA_DIR, "guides.json");
const SOFTWARE_JSON = path.join(DATA_DIR, "software.json");
const INTEGRATIONS_JSON = path.join(DATA_DIR, "integrations.json");
const TASKS_CONFIG_JSON = path.join(DATA_DIR, "tasks.config.json");
const BREAK_CONFIG_JSON = path.join(DATA_DIR, "break.config.json");

function safeFileName(name) {
  const base = String(name || "").replace(/\\/g, "/").split("/").pop();
  // keep letters, numbers, spaces, dots, dashes, underscores
  return base.replace(/[^\p{L}\p{N} ._()-]+/gu, "_").trim() || "file";
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  const data = JSON.stringify(obj, null, 2) + "\n";
  await fsp.writeFile(tmp, data, "utf8");
  await fsp.rename(tmp, filePath);
}

function ensureDirs() {
  for (const d of [DATA_DIR, GUIDES_DIR, DOWNLOADS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

async function readIntegrationUrl() {
  const cfg = await readJson(INTEGRATIONS_JSON);
  const url = String(cfg.appsScriptUrl || "").trim();
  if (!url) {
    const err = new Error("appsScriptUrl is not configured. Set it in data/integrations.json");
    err.status = 400;
    throw err;
  }
  return url;
}

// Simple proxy helper (Node <18 needs global fetch polyfill)
async function fetchJson(url, options) {
  if (typeof fetch !== "function") {
    const err = new Error(
      "This server requires Node.js 18+ (global fetch). Install Node 18+ or add a fetch polyfill."
    );
    err.status = 500;
    throw err;
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`Upstream error ${res.status}`);
    err.status = 502;
    err.upstream = json;
    throw err;
  }
  return json;
}

ensureDirs();

const app = express();
app.use(express.json({ limit: "4mb" }));

// Static site
app.use("/downloads", express.static(DOWNLOADS_DIR));
app.use(express.static(ROOT));

// Upload handler
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DOWNLOADS_DIR),
    filename: (req, file, cb) => {
      const original = safeFileName(file.originalname);
      // avoid collisions
      let candidate = original;
      const ext = path.extname(original);
      const stem = original.slice(0, original.length - ext.length) || "file";
      let i = 1;
      while (fs.existsSync(path.join(DOWNLOADS_DIR, candidate))) {
        candidate = `${stem} (${i})${ext}`;
        i += 1;
      }
      cb(null, candidate);
    }
  })
});

// ---------- Guides API ----------
app.get("/api/guides", async (req, res, next) => {
  try {
    const data = await readJson(GUIDES_JSON);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

app.post("/api/guides", async (req, res, next) => {
  try {
    const { id, title, category, tags, keywords, summary, contentMarkdown } = req.body || {};
    if (!id || !title) return res.status(400).json({ error: "id and title are required" });

    const fileName = safeFileName(`${id}.md`);
    const absPath = path.join(GUIDES_DIR, fileName);
    if (fs.existsSync(absPath)) return res.status(409).json({ error: "Guide already exists" });

    await fsp.writeFile(absPath, String(contentMarkdown || ""), "utf8");

    const manifest = await readJson(GUIDES_JSON);
    const guides = Array.isArray(manifest.guides) ? manifest.guides : [];
    if (guides.some((g) => g.id === id)) return res.status(409).json({ error: "Duplicate id" });

    guides.push({
      id,
      title,
      category: category || "",
      path: `.guides/${fileName}`,
      tags: Array.isArray(tags) ? tags : [],
      keywords: Array.isArray(keywords) ? keywords : [],
      summary: summary || ""
    });

    manifest.guides = guides;
    await writeJsonAtomic(GUIDES_JSON, manifest);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.put("/api/guides/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const { title, category, tags, keywords, summary, contentMarkdown } = req.body || {};

    const manifest = await readJson(GUIDES_JSON);
    const guides = Array.isArray(manifest.guides) ? manifest.guides : [];
    const idx = guides.findIndex((g) => g.id === id);
    if (idx < 0) return res.status(404).json({ error: "Not found" });

    const guide = guides[idx];
    const relPath = String(guide.path || "");
    const absPath = path.join(ROOT, relPath);

    if (typeof contentMarkdown === "string") {
      await fsp.writeFile(absPath, contentMarkdown, "utf8");
    }

    guides[idx] = {
      ...guide,
      title: title ?? guide.title,
      category: category ?? guide.category,
      tags: Array.isArray(tags) ? tags : guide.tags,
      keywords: Array.isArray(keywords) ? keywords : guide.keywords,
      summary: summary ?? guide.summary
    };

    manifest.guides = guides;
    await writeJsonAtomic(GUIDES_JSON, manifest);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete("/api/guides/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const manifest = await readJson(GUIDES_JSON);
    const guides = Array.isArray(manifest.guides) ? manifest.guides : [];
    const idx = guides.findIndex((g) => g.id === id);
    if (idx < 0) return res.status(404).json({ error: "Not found" });

    const guide = guides[idx];
    const relPath = String(guide.path || "");
    const absPath = path.join(ROOT, relPath);

    guides.splice(idx, 1);
    manifest.guides = guides;
    await writeJsonAtomic(GUIDES_JSON, manifest);

    // best-effort file remove
    try {
      await fsp.unlink(absPath);
    } catch {}

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get("/api/guides/:id/content", async (req, res, next) => {
  try {
    const id = req.params.id;
    const manifest = await readJson(GUIDES_JSON);
    const guides = Array.isArray(manifest.guides) ? manifest.guides : [];
    const guide = guides.find((g) => g.id === id);
    if (!guide) return res.status(404).json({ error: "Not found" });

    const absPath = path.join(ROOT, String(guide.path || ""));
    const text = await fsp.readFile(absPath, "utf8");
    res.json({ id, path: guide.path, content: text });
  } catch (e) {
    next(e);
  }
});

// ---------- Software API ----------
app.get("/api/software", async (req, res, next) => {
  try {
    const data = await readJson(SOFTWARE_JSON);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

app.put("/api/software", async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.items)) return res.status(400).json({ error: "items[] required" });
    await writeJsonAtomic(SOFTWARE_JSON, body);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.post("/api/files", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  res.json({
    ok: true,
    fileName: req.file.filename,
    url: `/downloads/${encodeURIComponent(req.file.filename)}`
  });
});

app.post("/api/files/rename", async (req, res, next) => {
  try {
    const { fileName, newFileName } = req.body || {};
    if (!fileName || !newFileName) return res.status(400).json({ error: "fileName and newFileName required" });

    const oldName = safeFileName(fileName);
    const newNameRaw = safeFileName(newFileName);

    const oldAbs = path.join(DOWNLOADS_DIR, oldName);
    if (!fs.existsSync(oldAbs)) return res.status(404).json({ error: "File not found" });

    let candidate = newNameRaw;
    const ext = path.extname(newNameRaw);
    const stem = newNameRaw.slice(0, newNameRaw.length - ext.length) || "file";
    let i = 1;
    while (fs.existsSync(path.join(DOWNLOADS_DIR, candidate))) {
      candidate = `${stem} (${i})${ext}`;
      i += 1;
    }

    await fsp.rename(oldAbs, path.join(DOWNLOADS_DIR, candidate));

    res.json({ ok: true, fileName: candidate, url: `/downloads/${encodeURIComponent(candidate)}` });
  } catch (e) {
    next(e);
  }
});

// ---------- Tasks/Break proxy (Apps Script) ----------
app.get("/api/tasks/config", async (req, res, next) => {
  try {
    const cfg = await readJson(TASKS_CONFIG_JSON);
    res.json(cfg);
  } catch (e) {
    next(e);
  }
});

app.get("/api/tasks", async (req, res, next) => {
  try {
    const appsUrl = await readIntegrationUrl();
    const cfg = await readJson(TASKS_CONFIG_JSON);

    const u = new URL(appsUrl);
    u.searchParams.set("action", "tasks.list");
    u.searchParams.set("spreadsheetId", cfg.spreadsheetId);
    u.searchParams.set("sheetName", cfg.sheetName);

    const json = await fetchJson(u.toString(), { method: "GET" });
    res.json(json);
  } catch (e) {
    next(e);
  }
});

app.post("/api/tasks", async (req, res, next) => {
  try {
    const appsUrl = await readIntegrationUrl();
    const cfg = await readJson(TASKS_CONFIG_JSON);

    const json = await fetchJson(appsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "tasks.add",
        spreadsheetId: cfg.spreadsheetId,
        sheetName: cfg.sheetName,
        row: req.body || {}
      })
    });

    res.json(json);
  } catch (e) {
    next(e);
  }
});

app.get("/api/break/config", async (req, res, next) => {
  try {
    const cfg = await readJson(BREAK_CONFIG_JSON);
    res.json(cfg);
  } catch (e) {
    next(e);
  }
});

app.get("/api/break", async (req, res, next) => {
  try {
    const date = String(req.query.date || "");
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    const appsUrl = await readIntegrationUrl();
    const cfg = await readJson(BREAK_CONFIG_JSON);

    const u = new URL(appsUrl);
    u.searchParams.set("action", "break.getDay");
    u.searchParams.set("spreadsheetId", cfg.spreadsheetId);
    u.searchParams.set("date", date);
    u.searchParams.set("dailySheetPrefix", cfg.dailySheetPrefix);
    u.searchParams.set("configSheetName", cfg.configSheetName);

    const json = await fetchJson(u.toString(), { method: "GET" });
    res.json(json);
  } catch (e) {
    next(e);
  }
});

app.post("/api/break/event", async (req, res, next) => {
  try {
    const appsUrl = await readIntegrationUrl();
    const cfg = await readJson(BREAK_CONFIG_JSON);

    const json = await fetchJson(appsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "break.upsertEvent",
        spreadsheetId: cfg.spreadsheetId,
        dailySheetPrefix: cfg.dailySheetPrefix,
        configSheetName: cfg.configSheetName,
        payload: req.body || {}
      })
    });

    res.json(json);
  } catch (e) {
    next(e);
  }
});

app.post("/api/break/config", async (req, res, next) => {
  try {
    const appsUrl = await readIntegrationUrl();
    const cfg = await readJson(BREAK_CONFIG_JSON);

    const json = await fetchJson(appsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "break.saveConfig",
        spreadsheetId: cfg.spreadsheetId,
        configSheetName: cfg.configSheetName,
        defaults: cfg.defaults,
        employees: req.body?.employees || []
      })
    });

    res.json(json);
  } catch (e) {
    next(e);
  }
});

// Error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const payload = {
    error: err.message || "Internal error"
  };
  if (err.upstream) payload.upstream = err.upstream;
  res.status(status).json(payload);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Techpedia server running on http://localhost:${PORT}`);
});
