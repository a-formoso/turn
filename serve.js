// Minimal static file server for the buildless TURN app.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname); // project root on Replit
const PORT = process.env.PORT || 5000;
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".jsx": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};

// Block dotfiles, .git, and directories that shouldn't be served
const BLOCKED = /(?:^|\/)(?:\.|\.git|\.claude|\.local|\.cache|\.agents|node_modules|docs)(\/|$)/;

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/TURN.html";

  // Block obviously sensitive paths before resolving
  if (BLOCKED.test(urlPath)) { res.writeHead(403); return res.end("forbidden"); }

  // Resolve first, then enforce the boundary with a trailing separator so a
  // sibling dir sharing the prefix (e.g. workspace-backup) can't be served.
  const filePath = path.resolve(ROOT, "." + urlPath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => console.log("TURN serving on port " + PORT));
