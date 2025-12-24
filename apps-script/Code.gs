/*
Apps Script Web App template

Deploy:
- Extensions -> Apps Script
- Deploy -> New deployment -> Web app
  - Execute as: Me
  - Who has access: Anyone within domain (or Anyone)

Then put the Web App URL into: data/integrations.json -> appsScriptUrl

This script implements:
- GET  ?action=tasks.list&spreadsheetId=...&sheetName=...
- POST {action:"tasks.add", spreadsheetId, sheetName, row:{...}}
- GET  ?action=break.getDay&spreadsheetId=...&date=YYYY-MM-DD&dailySheetPrefix=...&configSheetName=...
- POST {action:"break.upsertEvent", spreadsheetId, dailySheetPrefix, configSheetName, payload:{date, event}}
- POST {action:"break.saveConfig", spreadsheetId, configSheetName, employees:[{name, breakMinutes, lunchMinutes}]}
*/

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "";
    if (action === "tasks.list") return json_(tasksList_(e.parameter));
    if (action === "break.getDay") return json_(breakGetDay_(e.parameter));
    return json_({ error: "Unknown action" }, 400);
  } catch (err) {
    return json_({ error: String(err) }, 500);
  }
}

function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = body.action || "";

    if (action === "tasks.add") return json_(tasksAdd_(body));
    if (action === "break.upsertEvent") return json_(breakUpsertEvent_(body));
    if (action === "break.saveConfig") return json_(breakSaveConfig_(body));

    return json_({ error: "Unknown action" }, 400);
  } catch (err) {
    return json_({ error: String(err) }, 500);
  }
}

function json_(obj, code) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // CORS headers are limited in Apps Script, but backend proxy avoids CORS in the browser.
  return out;
}

// ---------------- Tasks ----------------
function tasksList_(p) {
  var ss = SpreadsheetApp.openById(p.spreadsheetId);
  var sh = ss.getSheetByName(p.sheetName);
  if (!sh) throw new Error("Sheet not found: " + p.sheetName);

  var values = sh.getDataRange().getValues();
  if (values.length < 1) return { rows: [] };

  var headers = values[0].map(String);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[r][c];
    }
    rows.push(obj);
  }

  return { rows: rows };
}

function tasksAdd_(body) {
  var ss = SpreadsheetApp.openById(body.spreadsheetId);
  var sh = ss.getSheetByName(body.sheetName);
  if (!sh) throw new Error("Sheet not found: " + body.sheetName);

  var rowObj = body.row || {};
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);

  // If sheet empty, create header row from keys
  if (headers.length === 0 || (headers.length === 1 && headers[0] === "")) {
    headers = Object.keys(rowObj);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(rowObj[headers[i]] || "");
  }

  sh.appendRow(row);

  // Basic formatting (can be expanded)
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sh.setFrozenRows(1);

  return { ok: true };
}

// ---------------- Breaks ----------------
function breakSheetName_(prefix, date) {
  return prefix + " " + date;
}

function ensureBreakSheet_(ss, prefix, date) {
  var name = breakSheetName_(prefix, date);
  var sh = ss.getSheetByName(name);
  if (sh) return sh;

  sh = ss.insertSheet(name);
  var headers = ["id", "ФИО", "Тип", "Состояние", "Начало", "Конец"];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}

function ensureConfigSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;

  sh = ss.insertSheet(name);
  var headers = ["ФИО", "Перерыв (мин)", "Обед (мин)"];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}

function breakGetDay_(p) {
  var ss = SpreadsheetApp.openById(p.spreadsheetId);
  var day = ensureBreakSheet_(ss, p.dailySheetPrefix, p.date);
  var cfg = ensureConfigSheet_(ss, p.configSheetName);

  var dayValues = day.getDataRange().getValues();
  var dayHeaders = dayValues[0].map(String);
  var events = [];
  for (var r = 1; r < dayValues.length; r++) {
    var obj = {};
    for (var c = 0; c < dayHeaders.length; c++) {
      obj[dayHeaders[c]] = dayValues[r][c];
    }
    events.push(obj);
  }

  var cfgValues = cfg.getDataRange().getValues();
  var employees = [];
  for (var rr = 1; rr < cfgValues.length; rr++) {
    if (!cfgValues[rr][0]) continue;
    employees.push({
      name: String(cfgValues[rr][0]),
      breakMinutes: Number(cfgValues[rr][1] || 0),
      lunchMinutes: Number(cfgValues[rr][2] || 0)
    });
  }

  return { date: p.date, events: events, employees: employees };
}

function breakSaveConfig_(body) {
  var ss = SpreadsheetApp.openById(body.spreadsheetId);
  var sh = ensureConfigSheet_(ss, body.configSheetName);

  // clear old rows (keep header)
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 3).clearContent();

  var emps = body.employees || [];
  if (emps.length) {
    var rows = emps.map(function (e) {
      return [e.name || "", Number(e.breakMinutes || 0), Number(e.lunchMinutes || 0)];
    });
    sh.getRange(2, 1, rows.length, 3).setValues(rows);
  }

  return { ok: true };
}

function breakUpsertEvent_(body) {
  var payload = body.payload || {};
  var date = payload.date;
  var ev = payload.event || {};

  if (!date) throw new Error("payload.date is required");
  if (!ev.id) ev.id = Utilities.getUuid();

  var ss = SpreadsheetApp.openById(body.spreadsheetId);
  var sh = ensureBreakSheet_(ss, body.dailySheetPrefix, date);

  var values = sh.getDataRange().getValues();
  var headers = values[0].map(String);

  var idCol = headers.indexOf("id") + 1;
  var fioCol = headers.indexOf("ФИО") + 1;
  var typeCol = headers.indexOf("Тип") + 1;
  var stCol = headers.indexOf("Состояние") + 1;
  var startCol = headers.indexOf("Начало") + 1;
  var endCol = headers.indexOf("Конец") + 1;

  var targetRow = -1;
  for (var r = 2; r <= sh.getLastRow(); r++) {
    var cell = sh.getRange(r, idCol).getValue();
    if (String(cell) === String(ev.id)) {
      targetRow = r;
      break;
    }
  }

  var row = [
    ev.id,
    ev["ФИО"] || "",
    ev["Тип"] || "",
    ev["Состояние"] || "",
    ev["Начало"] || "",
    ev["Конец"] || ""
  ];

  if (targetRow === -1) {
    sh.appendRow(row);
  } else {
    sh.getRange(targetRow, 1, 1, row.length).setValues([row]);
  }

  return { ok: true, id: ev.id };
}
