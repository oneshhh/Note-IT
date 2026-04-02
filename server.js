const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const NOTES_PATH = path.join(DATA_DIR, "notes.json");
const SHARES_PATH = path.join(DATA_DIR, "shares.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function respondJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { "Content-Type": MIME[".json"] });
  res.end(body);
}

function respondText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function toIsoDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? value : null;
}

function toMonth(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? value : null;
}

function safeReadJson(filePath, fallback) {
  return fsp
    .readFile(filePath, "utf8")
    .then((raw) => JSON.parse(raw))
    .catch(() => fallback);
}

async function ensureDataFiles() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(NOTES_PATH)) {
    await fsp.writeFile(NOTES_PATH, "[]", "utf8");
  }
  if (!fs.existsSync(SHARES_PATH)) {
    await fsp.writeFile(SHARES_PATH, "{}", "utf8");
  }
}

async function readNotes() {
  const notes = await safeReadJson(NOTES_PATH, []);
  if (!Array.isArray(notes)) return [];
  return notes;
}

async function writeNotes(notes) {
  await fsp.writeFile(NOTES_PATH, JSON.stringify(notes, null, 2), "utf8");
}

async function readShares() {
  const shares = await safeReadJson(SHARES_PATH, {});
  if (!shares || typeof shares !== "object" || Array.isArray(shares)) {
    return {};
  }
  return shares;
}

async function writeShares(shares) {
  await fsp.writeFile(SHARES_PATH, JSON.stringify(shares, null, 2), "utf8");
}

function summarizeNote(note) {
  return {
    id: note.id,
    title: note.title,
    date: note.date,
    mood: note.mood,
    updatedAt: note.updatedAt,
  };
}

function computeStreak(notes) {
  const uniqueDates = new Set(
    notes.map((n) => n.date).filter((d) => typeof d === "string")
  );
  const sorted = Array.from(uniqueDates).sort();
  if (sorted.length === 0) {
    return { current: 0, longest: 0 };
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const curr = new Date(`${sorted[i]}T00:00:00`);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  let current = 0;
  if (uniqueDates.has(todayIso) || uniqueDates.has(yesterdayIso)) {
    let cursor = uniqueDates.has(todayIso) ? new Date(today) : yesterday;
    while (uniqueDates.has(cursor.toISOString().slice(0, 10))) {
      current += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    }
  }

  return { current, longest };
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sanitizePathname(pathname) {
  if (pathname === "/") return "/index.html";
  return pathname;
}

function serveStatic(req, res, pathname) {
  const safePath = sanitizePathname(pathname);
  const resolved = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    respondText(res, 403, "Forbidden");
    return;
  }
  const ext = path.extname(resolved).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  fs.readFile(resolved, (err, data) => {
    if (err) {
      respondText(res, 404, "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSharedPage(note) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(note.title || "Shared Journal Note")}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0d1122; color: #d9e9ff; margin: 0; }
    .wrap { max-width: 840px; margin: 32px auto; padding: 24px; border-radius: 16px;
      background: rgba(28, 42, 84, 0.8); border: 1px solid #3e68ff; box-shadow: 0 0 30px rgba(58, 105, 255, 0.35); }
    h1 { margin-top: 0; }
    .meta { color: #8fb4ff; margin-bottom: 16px; }
    .content { line-height: 1.7; }
    a { color: #9cc5ff; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(note.title || "Untitled Note")}</h1>
    <div class="meta">Date: ${escapeHtml(note.date)} | Mood: ${escapeHtml(note.mood || "neutral")}</div>
    <div class="content">${note.contentHtml || ""}</div>
  </div>
</body>
</html>`;
}

function getBaseUrl(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = forwardedProto ? String(forwardedProto).split(",")[0] : "http";
  const host = req.headers.host || `${HOST}:${PORT}`;
  return `${proto}://${host}`;
}

async function handleApi(req, res, urlObj) {
  const { pathname, searchParams } = urlObj;

  if (req.method === "GET" && pathname === "/api/health") {
    respondJson(res, 200, { ok: true, localOnly: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/notes") {
    const notes = await readNotes();
    const date = toIsoDate(searchParams.get("date"));
    const month = toMonth(searchParams.get("month"));

    let filtered = notes;
    if (date) {
      filtered = notes.filter((n) => n.date === date);
    } else if (month) {
      filtered = notes.filter((n) => n.date.startsWith(month));
    }

    filtered.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    respondJson(res, 200, { notes: filtered.map(summarizeNote) });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/notes/")) {
    const id = pathname.split("/").pop();
    const notes = await readNotes();
    const note = notes.find((n) => n.id === id);
    if (!note) {
      respondJson(res, 404, { error: "Note not found" });
      return;
    }
    respondJson(res, 200, { note });
    return;
  }

  if (req.method === "POST" && pathname === "/api/notes") {
    let payload;
    try {
      payload = await parseBody(req);
    } catch (err) {
      respondJson(res, 400, { error: err.message });
      return;
    }

    const date = toIsoDate(payload.date);
    if (!date) {
      respondJson(res, 400, { error: "date must be YYYY-MM-DD" });
      return;
    }

    const note = {
      id: crypto.randomUUID(),
      title: String(payload.title || "").trim() || "Untitled Note",
      date,
      mood: String(payload.mood || "neutral").trim() || "neutral",
      contentHtml: String(payload.contentHtml || ""),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const notes = await readNotes();
    notes.push(note);
    await writeNotes(notes);
    respondJson(res, 201, { note: summarizeNote(note) });
    return;
  }

  if (req.method === "PUT" && pathname.startsWith("/api/notes/")) {
    const id = pathname.split("/").pop();
    let payload;
    try {
      payload = await parseBody(req);
    } catch (err) {
      respondJson(res, 400, { error: err.message });
      return;
    }

    const notes = await readNotes();
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) {
      respondJson(res, 404, { error: "Note not found" });
      return;
    }

    const nextDate = payload.date ? toIsoDate(payload.date) : notes[idx].date;
    if (!nextDate) {
      respondJson(res, 400, { error: "date must be YYYY-MM-DD" });
      return;
    }

    notes[idx] = {
      ...notes[idx],
      title: String(payload.title ?? notes[idx].title).trim() || "Untitled Note",
      date: nextDate,
      mood: String(payload.mood ?? notes[idx].mood).trim() || "neutral",
      contentHtml: String(payload.contentHtml ?? notes[idx].contentHtml),
      updatedAt: new Date().toISOString(),
    };

    await writeNotes(notes);
    respondJson(res, 200, { note: summarizeNote(notes[idx]) });
    return;
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/notes/")) {
    const id = pathname.split("/").pop();
    const notes = await readNotes();
    const next = notes.filter((n) => n.id !== id);
    if (next.length === notes.length) {
      respondJson(res, 404, { error: "Note not found" });
      return;
    }
    await writeNotes(next);
    respondJson(res, 200, { deleted: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/streak") {
    const notes = await readNotes();
    respondJson(res, 200, { streak: computeStreak(notes) });
    return;
  }

  if (req.method === "POST" && pathname.startsWith("/api/share/")) {
    const id = pathname.split("/").pop();
    const notes = await readNotes();
    const note = notes.find((n) => n.id === id);
    if (!note) {
      respondJson(res, 404, { error: "Note not found" });
      return;
    }

    const shares = await readShares();
    const token = crypto.randomBytes(18).toString("hex");
    shares[token] = { noteId: id, createdAt: new Date().toISOString() };
    await writeShares(shares);
    const baseUrl = getBaseUrl(req);
    respondJson(res, 200, {
      sharePath: `/shared/${token}`,
      shareUrl: `${baseUrl}/shared/${token}`,
      localOnly: true,
    });
    return;
  }

  respondJson(res, 404, { error: "API route not found" });
}

async function handleShared(req, res, pathname) {
  const token = pathname.split("/").pop();
  const shares = await readShares();
  const mapping = shares[token];
  if (!mapping) {
    respondText(res, 404, "Shared note not found.");
    return;
  }
  const notes = await readNotes();
  const note = notes.find((n) => n.id === mapping.noteId);
  if (!note) {
    respondText(res, 404, "Original note does not exist.");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(renderSharedPage(note));
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, getBaseUrl(req));
    const { pathname } = urlObj;

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, urlObj);
      return;
    }

    if (pathname.startsWith("/shared/")) {
      await handleShared(req, res, pathname);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    respondJson(res, 500, { error: "Internal server error", details: err.message });
  }
});

ensureDataFiles()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Tech Journal app running at http://${HOST}:${PORT}`);
      console.log("Data is stored locally in journal-app/data/");
    });
  })
  .catch((err) => {
    console.error("Failed to initialize app data:", err);
    process.exit(1);
  });
