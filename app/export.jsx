/* export.jsx — export the story as a screenplay (PDF / Fountain), an outline, or CSV.
   Pure functions over { project, scenes, drafts }. No external deps. */

function esc(s){ return String(s==null?"":s); }

/* a scene's screenplay blocks, falling back to slug + summary when undrafted */
function sceneBlocks(scene, drafts){
  const d = drafts[scene.id];
  if(d && d.blocks && d.blocks.length) return d.blocks;
  return [
    { type:"scene", text: (scene.loc||"INT. SCENE").toUpperCase() },
    { type:"action", text: scene.summary || "" },
  ];
}

/* ---------- FOUNTAIN (plain-text screenplay standard) ---------- */
function buildFountain(project, scenes, drafts){
  const L = [];
  L.push("Title: "+esc(project.title));
  L.push("Credit: written by");
  L.push("Author: Infinite Studio AI");
  L.push("Draft date: "+new Date().toLocaleDateString());
  if(project.genre) L.push("Genre: "+esc(project.genre));
  L.push(""); L.push("===" ); L.push("");   // title-page break
  scenes.forEach(s=>{
    const blocks = sceneBlocks(s, drafts);
    blocks.forEach(b=>{
      const t = esc(b.text).trim(); if(!t) return;
      if(b.type==="scene"){ L.push(""); L.push("."+t.replace(/^\.*/,"").toUpperCase()); L.push(""); }
      else if(b.type==="char"){ L.push(""); L.push("@"+t.toUpperCase()); }
      else if(b.type==="paren"){ L.push(t.startsWith("(")?t:("("+t+")")); }
      else if(b.type==="dia"){ L.push(t); }
      else { L.push(""); L.push(t); }   // action
    });
  });
  return L.join("\n");
}

/* ---------- OUTLINE (readable story bible) ---------- */
function buildOutline(project, scenes){
  const L = [];
  L.push(project.title.toUpperCase());
  if(project.format||project.genre) L.push([project.format,project.genre].filter(Boolean).join(" · "));
  L.push("");
  L.push("PREMISE");
  L.push(esc(project.premise));
  L.push("");
  if(project.controllingIdea){
    L.push("CONTROLLING IDEA");
    L.push(esc(project.controllingIdea.value)+" "+esc(project.controllingIdea.cause)+"  ("+esc(project.controllingIdea.polarity)+")");
    L.push("");
  }
  L.push("SPINE — "+scenes.length+" scenes");
  L.push("".padEnd(54,"\u2500"));
  const acts={1:"ACT I",2:"ACT II",3:"ACT III"};
  let lastAct=null;
  scenes.forEach(s=>{
    if(s.act!==lastAct){ L.push(""); L.push(acts[s.act]||("ACT "+s.act)); lastAct=s.act; }
    const ch=(v)=>v>0?("+"+v):(""+v);
    const turns = (Math.sign(s.openCharge)!==Math.sign(s.closeCharge)||Math.abs(s.closeCharge-s.openCharge)>=2);
    L.push("");
    L.push(String(s.no).padStart(2,"0")+". "+esc(s.title)+"   ["+esc(s.openValue)+" "+ch(s.openCharge)+" \u2192 "+esc(s.closeValue)+" "+ch(s.closeCharge)+"]"+(turns?"":"  \u26A0 does not turn"));
    if(s.loc) L.push("    "+esc(s.loc));
    if(s.summary) L.push("    "+esc(s.summary));
  });
  return L.join("\n");
}

/* ---------- CSV (spine data) ---------- */
function buildCSV(scenes){
  const q=(v)=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
  const rows=[["#","Act","Title","Location","Open value","Open charge","Close value","Close charge","Turns","Driver"]];
  scenes.forEach(s=>{
    const turns=(Math.sign(s.openCharge)!==Math.sign(s.closeCharge)||Math.abs(s.closeCharge-s.openCharge)>=2);
    rows.push([s.no,s.act,s.title,s.loc,s.openValue,s.openCharge,s.closeValue,s.closeCharge,turns?"yes":"no",s.driver]);
  });
  return rows.map(r=>r.map(q).join(",")).join("\r\n");
}

/* ---------- SCREENPLAY HTML (for print → PDF) — full professional format ---------- */
function isTransition(t){
  return /(CUT|DISSOLVE|FADE|WIPE)( TO| OUT| IN)?[:.]?$/i.test(String(t).trim());
}

function screenplayHTML(project, scenes, drafts){
  function ee(s){ return String(s==null?"":s).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;"); }
  const CONTD = " (CONT\u2019D)";
  const parts = ['<p class="trans first">FADE IN:</p>'];
  let sceneNo = 0;
  scenes.forEach(function(s){
    let lastChar = null;
    sceneBlocks(s, drafts).forEach(function(b){
      const t = ee(b.text).trim();
      if(!t) return;
      if(b.type==="scene"){
        sceneNo++; lastChar = null;
        const slug = t.toUpperCase().replace(/^\.+/,"");
        // scene-start => clear separation; a new scene always begins on a fresh line/space
        parts.push('<p class="slug scene-start"><span class="sn">'+sceneNo+'</span>'+slug+'<span class="sn sr">'+sceneNo+'</span></p>');
      } else if(b.type==="char"){
        let nm = t.toUpperCase();
        if(lastChar && nm===lastChar){ nm = nm + CONTD; } else { lastChar = nm; }
        parts.push('<p class="char">'+nm+'</p>');
      } else if(b.type==="paren"){
        const pt = t.charAt(0)==="(" ? t : ("("+t+")");
        parts.push('<p class="paren">'+pt+'</p>');
      } else if(b.type==="dia"){
        parts.push('<p class="dia">'+t+'</p>');
      } else if(isTransition(t)){
        parts.push('<p class="trans">'+t.toUpperCase()+'</p>'); lastChar = null;
      } else {
        parts.push('<p class="action">'+t+'</p>'); lastChar = null;
      }
    });
  });
  parts.push('<p class="trans">FADE OUT.</p><p class="end">THE END</p>');
  const bodyHTML = parts.join("");

  const dateStr = new Date().toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
  const css = [
    '@page{size:letter;margin:0}',
    'html,body{margin:0;color:#000;background:#33363b}',
    '*{box-sizing:border-box}',
    // a PAGE = a real US-Letter sheet, on a grey backdrop, with screenplay margins as padding
    '.page{position:relative;width:8.5in;min-height:11in;background:#fff;margin:22px auto;'
      +'box-shadow:0 10px 34px rgba(0,0,0,.55);padding:1in 1in 1in 1.5in;'
      +'font:12pt/1 "Courier New",Courier,monospace}',
    '.page-body{width:6in}',
    '.pgnum{position:absolute;top:0.5in;right:1in;font:10pt "Courier New",monospace;color:#555}',
    // fallback if scripts are blocked: show the raw source as one continuous sheet
    '#sp-src{width:8.5in;min-height:11in;background:#fff;margin:22px auto;box-shadow:0 10px 34px rgba(0,0,0,.55);'
      +'padding:1in 1in 1in 1.5in;font:12pt/1 "Courier New",Courier,monospace;max-width:6in;width:auto}',
    'p{margin:0;white-space:pre-wrap;orphans:2;widows:2}',
    '.action{margin:0 0 12pt}',
    '.slug{position:relative;font-weight:bold;text-transform:uppercase;margin:0 0 12pt;page-break-after:avoid}',
    '.slug.scene-start{margin-top:24pt}',
    '.slug .sn{position:absolute;font-weight:normal}',
    '.slug .sn:first-child{left:0}.slug .sr{right:0}',
    '.char{margin:12pt 0 0;padding-left:2.0in;text-transform:uppercase;page-break-after:avoid}',
    '.paren{margin:0;padding-left:1.5in;width:3.5in;page-break-inside:avoid;page-break-after:avoid}',
    '.dia{margin:0;padding-left:1.0in;width:3.5in;page-break-inside:avoid}',
    '.dia+.action,.action+.slug{margin-top:12pt}',
    '.trans{text-align:right;text-transform:uppercase;margin:12pt 0}',
    '.trans.first{text-align:left;margin:0 0 12pt}',
    '.end{text-align:center;margin:24pt 0;text-transform:uppercase;letter-spacing:1px}',
    // title page
    '.title-page{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}',
    '.title-page .ttl{font-weight:bold;text-transform:uppercase;text-decoration:underline;letter-spacing:1px;font-size:14pt}',
    '.title-page .by{margin-top:26pt}',
    '.title-page .auth{margin-top:6pt}',
    '.title-page .tp-meta{position:absolute;bottom:1in;left:1.5in;right:1in;display:flex;justify-content:space-between;font-size:10pt;color:#333}',
    // PRINT: each .page becomes one physical sheet
    '@media print{html,body{background:#fff}'
      +'.page,#sp-src{box-shadow:none;margin:0;width:auto;min-height:0;page-break-after:always}'
      +'.page:last-child{page-break-after:auto}}'
  ].join("");

  const tpPage = '<div class="page title-page">'+
    '<div class="ttl">'+ee(project.title||"Untitled")+'</div>'+
    '<div class="by">written by</div>'+
    '<div class="auth">\u221E Infinite Studio AI</div>'+
    '<div class="tp-meta"><span>'+(project.genre?ee(project.genre):"")+'</span><span>Draft \u00b7 '+ee(dateStr)+'</span></div>'+
    '</div>';

  // client-side pagination: flow the flat blocks into US-Letter pages (the real "page view").
  const pager = '<scr'+'ipt>(function(){try{'+
    'var src=document.getElementById("sp-src"),pages=document.getElementById("sp-pages");if(!src||!pages)return;'+
    'var probe=document.createElement("div");probe.style.cssText="position:absolute;visibility:hidden;height:9in;";document.body.appendChild(probe);'+
    'var PAGE_H=probe.offsetHeight||864;probe.parentNode.removeChild(probe);'+
    'function addPage(){var p=document.createElement("div");p.className="page";var bd=document.createElement("div");bd.className="page-body";p.appendChild(bd);pages.appendChild(p);return bd;}'+
    'var cur=addPage(),kids=Array.prototype.slice.call(src.children);'+
    'for(var i=0;i<kids.length;i++){var el=kids[i];cur.appendChild(el);'+
      'if(cur.children.length>1&&cur.scrollHeight>PAGE_H){cur.removeChild(el);cur=addPage();cur.appendChild(el);}}'+
    'if(src.parentNode)src.parentNode.removeChild(src);'+
    'var ps=pages.querySelectorAll(".page"),c=0;'+
    'for(var j=0;j<ps.length;j++){if(ps[j].className.indexOf("title-page")>=0)continue;c++;'+
      'var n=document.createElement("div");n.className="pgnum";n.textContent=c+".";ps[j].appendChild(n);}'+
    '}catch(e){}})();</scr'+'ipt>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+ee(project.title||"Screenplay")+
    '</title><style>'+css+'</style></head><body>'+
    '<div id="sp-pages">'+tpPage+'</div>'+
    '<div id="sp-src">'+bodyHTML+'</div>'+
    pager+
    '</body></html>';
}

/* ---------- helpers ---------- */
function downloadText(filename, text, mime){
  const blob = new Blob([text], { type: (mime||"text/plain")+";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

function safeName(project, ext){
  return (project.title||"screenplay").replace(/[^\w\-]+/g,"_").replace(/^_+|_+$/g,"").toUpperCase()+"."+ext;
}

function exportScreenplayPDF(project, scenes, drafts){
  const html = screenplayHTML(project, scenes, drafts);
  const w = window.open("", "_blank");
  if(w && w.document){
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    try{ w.document.title = project.title || "Screenplay"; }catch(e){}
    setTimeout(()=>{ try{ w.print(); }catch(e){} }, 500);
    return true;
  }
  // pop-up blocked → download the HTML to open & print
  downloadText(safeName(project,"html"), html, "text/html");
  return false;
}

/* In-app screenplay PREVIEW before download: renders the formatted screenplay in a
   sandboxed iframe so you can read it exactly as it'll print, then print/save as PDF or
   download the HTML. Avoids opening a new tab (which sandboxes/pop-up blockers reject). */
function screenplayPreview(project, scenes, drafts){
  const html = screenplayHTML(project, scenes, drafts);
  const ce = (tag, cls, txt)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; };

  const overlay = ce("div","sp-prev-overlay");
  const panel = ce("div","sp-prev-panel");

  const head = ce("div","sp-prev-head");
  const titleWrap = ce("div","sp-prev-titlewrap");
  titleWrap.appendChild(ce("div","sp-prev-t","Screenplay preview"));
  titleWrap.appendChild(ce("div","sp-prev-sub", (project && project.title) || "Untitled film"));
  const closeBtn = ce("button","sp-prev-x"); closeBtn.setAttribute("title","Close"); closeBtn.setAttribute("aria-label","Close preview"); closeBtn.innerHTML="✕";
  head.appendChild(titleWrap); head.appendChild(closeBtn);

  const frame = document.createElement("iframe");
  frame.className = "sp-prev-frame";
  frame.setAttribute("title","Screenplay preview");
  // allow-scripts runs OUR pagination only (all screenplay text is escaped via ee(), so no injection)
  frame.setAttribute("sandbox","allow-same-origin allow-scripts allow-modals");
  frame.srcdoc = html;

  const foot = ce("div","sp-prev-foot");
  const hint = ce("div","sp-prev-hint","Review it, then save as PDF (Print → Save as PDF).");
  const dlBtn = ce("button","sp-prev-btn ghost","Download .html");
  const printBtn = ce("button","sp-prev-btn primary","Print / Save as PDF");
  foot.appendChild(hint); foot.appendChild(dlBtn); foot.appendChild(printBtn);

  panel.appendChild(head); panel.appendChild(frame); panel.appendChild(foot);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const remove = ()=>{ try{ document.body.removeChild(overlay); }catch(e){} document.removeEventListener("keydown", onKey); };
  const onKey = (e)=>{ if(e.key==="Escape") remove(); };
  document.addEventListener("keydown", onKey);
  closeBtn.onclick = remove;
  overlay.addEventListener("mousedown", (e)=>{ if(e.target===overlay) remove(); });
  dlBtn.onclick = ()=>{ downloadText(safeName(project,"html"), html, "text/html"); };
  printBtn.onclick = ()=>{
    try{ frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch(e){ try{ exportScreenplayPDF(project, scenes, drafts); }catch(_e){ downloadText(safeName(project,"html"), html, "text/html"); } }
  };
  return true;
}

/* Generic in-app DOCUMENT PREVIEW — the same overlay as the screenplay preview
   (sp-prev-* styles), for any export HTML: review it in a sandboxed iframe FIRST,
   then 'Print / Save as PDF' or 'Download .html' — nothing prints uninvited.
   Returns { setHtml, close } so an async export (e.g. the storyboard inlining its
   images as data URLs) can open instantly with a placeholder and swap in the
   finished document. Used by the Shot List and Storyboard exports. */
function docPreview({ title, sub, fileName, html, hint }){
  let cur = html || "";
  const ce = (tag, cls, txt)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; };
  const overlay = ce("div","sp-prev-overlay");
  const panel = ce("div","sp-prev-panel");
  const head = ce("div","sp-prev-head");
  const titleWrap = ce("div","sp-prev-titlewrap");
  titleWrap.appendChild(ce("div","sp-prev-t", title||"Preview"));
  if(sub) titleWrap.appendChild(ce("div","sp-prev-sub", sub));
  const closeBtn = ce("button","sp-prev-x"); closeBtn.setAttribute("title","Close"); closeBtn.setAttribute("aria-label","Close preview"); closeBtn.innerHTML="✕";
  head.appendChild(titleWrap); head.appendChild(closeBtn);
  const frame = document.createElement("iframe");
  frame.className = "sp-prev-frame";
  frame.setAttribute("title", title||"Preview");
  frame.setAttribute("sandbox","allow-same-origin allow-scripts allow-modals");   // scripts: none in these docs; modals: the print dialog
  frame.srcdoc = cur;
  const foot = ce("div","sp-prev-foot");
  foot.appendChild(ce("div","sp-prev-hint", hint||"Review it, then save as PDF (Print → Save as PDF)."));
  const dlBtn = ce("button","sp-prev-btn ghost","Download .html");
  const printBtn = ce("button","sp-prev-btn primary","Print / Save as PDF");
  foot.appendChild(dlBtn); foot.appendChild(printBtn);
  panel.appendChild(head); panel.appendChild(frame); panel.appendChild(foot);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  const remove = ()=>{ try{ document.body.removeChild(overlay); }catch(e){} document.removeEventListener("keydown", onKey); };
  const onKey = (e)=>{ if(e.key==="Escape") remove(); };
  document.addEventListener("keydown", onKey);
  closeBtn.onclick = remove;
  overlay.addEventListener("mousedown",(e)=>{ if(e.target===overlay) remove(); });
  dlBtn.onclick = ()=> downloadText(fileName||"export.html", cur, "text/html");
  printBtn.onclick = ()=>{ try{ frame.contentWindow.focus(); frame.contentWindow.print(); }catch(e){} };
  return { setHtml:(h)=>{ cur=h||""; frame.srcdoc=cur; }, close: remove };
}
window.docPreview = docPreview;

const TURNExport = {
  pdf:   (p,s,d)=> screenplayPreview(p,s,d),
  pdfDirect: (p,s,d)=> exportScreenplayPDF(p,s,d),
  html:  (p,s,d)=> screenplayHTML(p,s,d),
  fountain:(p,s,d)=> downloadText(safeName(p,"fountain"), buildFountain(p,s,d), "text/plain"),
  outline:(p,s,d)=> downloadText(safeName(p,"txt"), buildOutline(p,s), "text/plain"),
  csv:   (p,s,d)=> downloadText((p.title||"spine").replace(/[^\w\-]+/g,"_").toUpperCase()+"_spine.csv", buildCSV(s), "text/csv"),
};
window.TURNExport = TURNExport;
