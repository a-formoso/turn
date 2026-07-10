/* build-dist.mjs — production build for the buildless app.
   DEV stays buildless (TURN.html + raw .jsx via Babel standalone). This script
   runs only in the deploy build step and assembles dist/:
     • every app/*.jsx  → transpiled (preset-react) + minified .js
                          (comments stripped, names mangled; TOP-LEVEL names
                          kept — files talk to each other via globals)
     • every other app/ asset (css, plain .js) → copied (plain .js minified)
     • TURN.html → dist/index.html with type="text/babel" tags rewritten to
       plain .js tags and the Babel-standalone CDN tag removed
   Why: (1) the deployed site no longer ships raw commented source — the
   casual read-the-cookbook leak is closed (string literals do survive
   minification; server-side prompt assembly is the real fix, on the roadmap);
   (2) no in-browser transpile in production — boot goes from ~25s to ~instant.
   Deps (installed by the deploy build command, never committed):
     @babel/core @babel/preset-react terser */
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { transformSync } from "@babel/core";
import { minify } from "terser";

const ROOT = process.cwd();
const APP  = join(ROOT, "app");
const DIST = join(ROOT, "dist");
mkdirSync(join(DIST, "app"), { recursive: true });

async function minifyJs(code, label){
  const out = await minify(code, {
    compress: { passes: 2 },
    mangle: true,                      // toplevel:false (default) — globals survive
    format: { comments: false },
  });
  if (out.error) throw new Error(label + ": " + out.error);
  return out.code;
}

let built = 0, copied = 0;
for (const f of readdirSync(APP)) {
  const src = join(APP, f);
  if (statSync(src).isDirectory()) { cpSync(src, join(DIST, "app", f), { recursive: true }); copied++; continue; }
  const ext = extname(f);
  if (ext === ".jsx") {
    const t = transformSync(readFileSync(src, "utf8"), {
      // classic runtime → JSX compiles to React.createElement against the global
      // React UMD (no "react/jsx-runtime" imports, which a classic <script> can't use).
      presets: [["@babel/preset-react", { runtime: "classic" }]],
      // lower top-level const/let → var, matching what Babel-standalone does in the
      // buildless dev app: files are separate classic <script>s sharing one global
      // scope, so block-scoped top-level names would throw on any cross-file or
      // re-exec collision. var redeclaration is harmless — this keeps prod identical
      // to the semantics the app already ships under.
      plugins: ["@babel/plugin-transform-block-scoping"],
      comments: false, compact: false, babelrc: false, configFile: false,
      filename: f,
    });
    writeFileSync(join(DIST, "app", f.replace(/\.jsx$/, ".js")), await minifyJs(t.code, f));
    built++;
  } else if (ext === ".js") {
    writeFileSync(join(DIST, "app", f), await minifyJs(readFileSync(src, "utf8"), f));
    built++;
  } else {
    cpSync(src, join(DIST, "app", f));
    copied++;
  }
}

let html = readFileSync(join(ROOT, "TURN.html"), "utf8");
const before = html.length;
html = html.replace(/<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"[^>]*><\/script>\s*\n?/, "");
html = html.replace(/<script type="text\/babel" src="(app\/[^"?]+)\.jsx(\?[^"]*)?"><\/script>/g,
                    '<script src="$1.js$2"></script>');
if (html.includes("text/babel") || html.includes("@babel/standalone"))
  throw new Error("index.html rewrite incomplete — babel references remain");
if (html.length === before) throw new Error("index.html rewrite made no changes");
writeFileSync(join(DIST, "index.html"), html);

console.log(`dist/ built: ${built} js files transpiled+minified, ${copied} assets copied, index.html rewritten (no Babel).`);
