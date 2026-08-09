/* script.jsx — Script view + auto-draft engine.
   Left gutter = SUBTEXT (beats). Right page = TEXT (screenplay).
   Automation drafts every scene from a rolling story-state, with transition
   hinges + a continuity ledger threaded scene to scene. */

const BLOCK_CLASS = { scene:"spb-scene", action:"spb-action", char:"spb-char", paren:"spb-paren", dia:"spb-dia", trans:"spb-trans" };
const ROMAN = ["I","II","III"];

function parseSlug(loc){
  let left = String(loc||"").trim();
  let time = "";
  /* time of day = trailing segment after the LAST separator, when it reads like a
     time. A "\u00b7"-only split misses industry hyphen slugs (INT. SHOP - DAWN). */
  const tm = left.match(/[\u00b7\u2013\u2014,\-]\s*([A-Za-z][A-Za-z'\u2019 ]{1,26})\s*$/);
  if(tm && /\b(night|day|dawn|dusk|morning|evening|afternoon|noon|midday|midnight|sunset|sunrise|twilight|magic hour|golden hour|continuous|later|moments? later|same time)\b/i.test(tm[1])){
    time = tm[1].trim();
    left = left.slice(0, tm.index).replace(/[\u00b7\u2013\u2014,\-\s]+$/,"").trim();
  }
  const intext = /^EXT/.test(left) ? "EXT" : /^INT\/EXT/.test(left) ? "INT/EXT" : "INT";
  const place = left.replace(/^(INT\/EXT\.|INT\.|EXT\.)\s*/,"").trim();
  return { intext, place, time };
}
function slugText(loc){ return String(loc).replace(/\s*\u00b7\s*/g," \u2013 "); }

/* the hinge between two consecutive scenes — McKee's Principle of Transition */
function sceneTransition(prev, cur){
  if(!prev) return { type:"COLD OPEN", cls:"act", gloss:"The film opens cold \u2014 no setup, straight into motion." };
  if(prev.act !== cur.act)
    return { type:`ACT ${ROMAN[prev.act-1]} \u2192 ${ROMAN[cur.act-1]}`, cls:"act",
             gloss:"Act break \u2014 the story crosses into a new movement; the charge must alternate here." };
  const a = parseSlug(prev.loc), b = parseSlug(cur.loc);
  const ps = Math.sign(prev.closeCharge), cs = Math.sign(cur.openCharge);
  if(ps!==0 && cs!==0 && ps!==cs)
    return { type:"CONTRAST CUT", cls:"contrast",
             gloss:`The cut flips the charge \u2014 ${prev.closeValue} (${chargeStr(prev.closeCharge)}) collides with ${cur.openValue} (${chargeStr(cur.openCharge)}).` };
  if(a.place === b.place)
    return { type:"CONTINUOUS", cls:"", gloss:"Same space \u2014 the action flows on without a real break." };
  if(a.time !== b.time)
    // NBSPs keep "DAWN \u2192 DAY." one unbreakable unit \u2014 on a narrow phone the wrap
    // falls after "Time moves:" instead of splitting the two times apart
    return { type:"TIME CUT", cls:"", gloss:`Time moves: ${a.time||"\u2014"}\u00a0\u2192\u00a0${b.time||"\u2014"}.` };
  return { type:"HARD CUT", cls:"", gloss:`New location \u2014 ${b.place}.` };
}

/* the story-state carried across the cut into this scene.
   "Serves spine" is the film's controlling idea \u2014 derived from THIS project, never
   hardcoded (it used to leak the Matrix sample's spine into every story). */
function sceneCarry(prev, cur, project){
  const b = parseSlug(cur.loc);
  const ci = (project && project.controllingIdea) || {};
  const spine = (ci.value||"").trim() || ((project && (project.logline||project.premise))||"").trim();
  const cells = [
    { lab:"Location", val:b.place },
    { lab:"Time", val:b.time || "\u2014" },
  ];
  if(spine) cells.push({ lab:"Serves spine", val: spine.length>72 ? spine.slice(0,71)+"\u2026" : spine });
  if(prev) cells.push({
    lab:"Emotional carry",
    node:React.createElement(React.Fragment,null,
      React.createElement("em",{className:prev.closeCharge<0?"neg":""},`${prev.closeValue} ${chargeStr(prev.closeCharge)}`),
      " \u2192 ",
      React.createElement("em",{className:cur.openCharge<0?"neg":""},`${cur.openValue} ${chargeStr(cur.openCharge)}`)),
  });
  return cells;
}

/* AUTO-DRAFT: expand a scene's beats (subtext) into screenplay blocks (text) */
function autoDraftScene(scene, beats, prevScene){
  const blocks = [{ beat:1, type:"scene", text:slugText(scene.loc) }];
  if(beats && beats.rows){
    beats.rows.forEach(r=>{
      blocks.push({ beat:r.n, type:"action", text:`${r.drive.d} ${r.react.d}` });
    });
  } else {
    blocks.push({ beat:1, type:"action", text:scene.summary });
  }
  const slugCount = blocks.filter(b=>b.type==="scene").length;
  return { auto:true, blocks,
    note: slugCount>1 ? `This unit spans ${slugCount} sluglines.` : null };
}

window.parseSlug = parseSlug;
window.sceneTransition = sceneTransition;
window.sceneCarry = sceneCarry;
window.autoDraftScene = autoDraftScene;

function _spClean(t){
  return String(t||"").replace(/\s+/g," ").trim();
}
function _spShort(t, max){
  const s = _spClean(t);
  const n = max || 72;
  return s.length > n ? s.slice(0, n-1).trim()+"…" : s;
}
function screenplayBeatExcerpt(screenplay, beatN, max){
  const blocks = ((screenplay&&screenplay.blocks)||[]).filter(b=>Number(b.beat)===Number(beatN));
  if(!blocks.length) return "";
  const pieces = [];
  for(let i=0;i<blocks.length;i++){
    const b = blocks[i] || {};
    const txt = _spClean(b.text);
    if(!txt) continue;
    if(b.type==="scene") continue;
    if(b.type==="char"){
      const par = blocks[i+1] && blocks[i+1].type==="paren" ? _spClean(blocks[i+1].text) : "";
      const di = i+(par?2:1), dia = blocks[di] || {};
      if(dia.type==="dia" && _spClean(dia.text)){
        pieces.push(txt+": "+(par?"("+par+") ":"")+_spClean(dia.text));
        i=di; continue;
      }
    }
    if(b.type==="paren") continue;
    pieces.push(txt);
    if(pieces.join(" ").length >= (max||72)) break;
  }
  if(!pieces.length){
    const slug = blocks.find(b=>b.type==="scene" && _spClean(b.text));
    if(slug) pieces.push(_spClean(slug.text));
  }
  return _spShort(pieces.join(" "), max||72);
}
function screenplayBeatNumbers(screenplay, beats){
  const nums = new Set();
  ((beats&&beats.rows)||[]).forEach(r=>nums.add(Number(r.n)));
  ((screenplay&&screenplay.blocks)||[]).forEach(b=>{ if(b.beat!=null) nums.add(Number(b.beat)); });
  return Array.from(nums).filter(n=>Number.isFinite(n)).sort((a,b)=>a-b);
}
window.screenplayBeatExcerpt = screenplayBeatExcerpt;
window.screenplayBeatNumbers = screenplayBeatNumbers;

/* professional-completeness audit: which required screenplay elements is this scene
   missing? Returns a short list of human labels (empty = scene is complete). */
function sceneMissing(scene, drafts){
  const d = drafts && drafts[scene.id];
  if(!d || !d.blocks || !d.blocks.length) return ["not drafted"];
  const blocks = d.blocks;
  const out = [];
  const slug = blocks.find(b=>b.type==="scene");
  const slugT = slug ? String(slug.text||"").toUpperCase() : "";
  if(!slugT.trim()){ out.push("scene heading"); }
  else {
    if(!/\b(INT|EXT|I\/E|INT\.\/EXT)\b/.test(slugT)) out.push("INT./EXT.");
    if(!/(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|AFTERNOON|NOON|MIDNIGHT|CONTINUOUS|LATER|SUNSET|SUNRISE)\b/.test(slugT)
       && !/\s[–—-]\s\S/.test(slugT)) out.push("time of day");
  }
  if(!blocks.some(b=>b.type==="action" && String(b.text||"").trim())) out.push("action");
  // Structural screenplay errors are actionable completeness failures too: every
  // dialogue line needs a cue (with an optional parenthetical), and cue-like text
  // must not be buried in an action paragraph.
  let cue = false;
  blocks.forEach(b=>{
    if(b.type==="char"){
      if(cue && out.indexOf("dialogue cue")<0) out.push("dialogue cue");
      cue=true; return;
    }
    if(b.type==="paren") return;
    if(b.type==="dia"){ if(!cue && out.indexOf("dialogue cue")<0) out.push("dialogue cue"); cue=false; return; }
    if(cue && out.indexOf("dialogue cue")<0) out.push("dialogue cue");
    if(b.type==="action" && /(?:^|\s)[A-Z][A-Z .'\u2019-]{1,30}:\s*[“"']?[A-Z]/.test(String(b.text||""))
       && out.indexOf("dialogue in action")<0) out.push("dialogue in action");
    cue=false;
  });
  if(cue && out.indexOf("dialogue cue")<0) out.push("dialogue cue");
  return out;
}
window.sceneMissing = sceneMissing;

/* CONTINUITY CHECKER — flags references with no prior setup, premature references,
   and setups (setup:true) that never pay off. */
function continuityReport(scenes, CONT, FACTS){
  const estAt = {}, refIdx = {};
  scenes.forEach((s,i)=>{ const c = CONT[s.id]||{}; (c.establishes||[]).forEach(f=>{ if(estAt[f]===undefined) estAt[f]=i; }); });
  scenes.forEach((s,i)=>{ const c = CONT[s.id]||{}; (c.references||[]).forEach(f=>{ (refIdx[f]=refIdx[f]||[]).push(i); }); });
  const conflicts = [];
  scenes.forEach((s,i)=>{ const c = CONT[s.id]||{}; (c.references||[]).forEach(f=>{
    const e = estAt[f]; const label = (FACTS[f]&&FACTS[f].label)||f;
    if(e===undefined) conflicts.push({ sceneId:s.id, sceneNo:s.no, kind:"unestablished", label, fact:f,
      msg:"leans on \u201c"+label+"\u201d, which is never set up in any earlier scene." });
    else if(e>i) conflicts.push({ sceneId:s.id, sceneNo:s.no, kind:"premature", label, fact:f,
      msg:"refers to \u201c"+label+"\u201d before it is established (set up later, in Sc."+String(scenes[e].no).padStart(2,"0")+")." });
  }); });
  Object.keys(FACTS).forEach(f=>{ if(FACTS[f].setup){ const e = estAt[f];
    if(e!==undefined){ const paid = (refIdx[f]||[]).some(j=>j>e);
      if(!paid) conflicts.push({ sceneId:scenes[e].id, sceneNo:scenes[e].no, kind:"dangling", label:FACTS[f].label, fact:f,
        msg:"sets up \u201c"+FACTS[f].label+"\u201d but nothing later pays it off." }); } } });
  return { conflicts, total: scenes.length };
}
window.continuityReport = continuityReport;

const CONFLICT_KIND = {
  unestablished:{ sev:"error", lab:"Payoff without setup", ic:"alert", fix:"Plant this earlier, or cut the reference." },
  premature:{ sev:"error", lab:"Referenced too early", ic:"alert", fix:"Move the setup before this scene." },
  dangling:{ sev:"warn", lab:"Dangling setup", ic:"scissors", fix:"Pay it off in a later scene, or cut the setup." },
};

/* ---------- view ---------- */
function isSpTransition(t){ return /^(?:CUT|DISSOLVE|SMASH CUT|MATCH CUT|FADE|WIPE|JUMP CUT)\b.*(?:TO|OUT|IN)[:.]?$/i.test(String(t).trim()); }
function ScriptBlock({ b, contd, sceneNo, flash }){
  let type = b.type, text = b.text;
  const fl = flash ? " spb-flash" : "";
  if(type==="action" && isSpTransition(text)){ type="trans"; text=text.toUpperCase(); }
  if(type==="char"){
    text = text.toUpperCase();
    if(contd && !/\(CONT\u2019?D\)\s*$/i.test(text)) text = text + " (CONT\u2019D)";
  }
  // shooting-script convention: the scene number flanks the slugline in both margins
  if(type==="scene" && sceneNo!=null){
    return React.createElement("div",{className:(BLOCK_CLASS.scene)+" numbered"+fl},
      React.createElement("span",{className:"spb-scnum"},sceneNo),
      React.createElement("span",{className:"spb-sctext"},text),
      React.createElement("span",{className:"spb-scnum"},sceneNo));
  }
  return React.createElement("div",{className:(BLOCK_CLASS[type]||"spb-action")+fl}, text);
}

/* EDIT MODE: a single screenplay block as a directly-editable line. Uncontrolled
   contentEditable — React never manages its text (no children in the vdom), so
   re-renders mid-typing can't reset the caret; the raw text is pushed in via a ref
   effect on mount and after each committed change. Commits on blur only when changed. */
function EditableBlock({ b, onCommit, onRemove, flash, sceneNo }){
  const ref = React.useRef(null);
  const raw = b.text || "";
  React.useEffect(()=>{ if(ref.current && ref.current.innerText !== raw) ref.current.innerText = raw; },[raw]);
  const cls = (BLOCK_CLASS[b.type]||"spb-action") + " sp-editable" + (flash?" spb-flash":"");
  const commit = ()=>{
    if(!ref.current) return;
    const v = ref.current.innerText.replace(/ /g," ").replace(/\n+$/,"");
    if(v !== raw) onCommit(v);
  };
  // single-line block types blur on Enter; action/dialogue allow line breaks
  const oneLine = b.type==="scene" || b.type==="char" || b.type==="paren" || b.type==="trans";
  const editableProps = {
    ref, contentEditable:true, suppressContentEditableWarning:true,
    spellCheck:true, "data-ph":"…", onBlur:commit,
    onKeyDown:(e)=>{ if(oneLine && e.key==="Enter"){ e.preventDefault(); e.currentTarget.blur(); } }
  };
  // industry formatting holds while EDITING too: the first slugline keeps its
  // scene-number flanks (only the text between them stays editable)
  if(b.type==="scene" && sceneNo!=null){
    return React.createElement("div",{className:BLOCK_CLASS.scene+" numbered"+(flash?" spb-flash":"")},
      React.createElement("span",{className:"spb-scnum"},sceneNo),
      React.createElement("span",{...editableProps, className:"spb-sctext sp-editable"}),
      React.createElement("span",{className:"spb-scnum"},sceneNo));
  }
  // every other element carries a remove control while editing — deleting commits
  // a version like any manual edit, so Undo restores the element
  return React.createElement("div",{className:"sp-editwrap"},
    React.createElement("div",{...editableProps, className:cls}),
    onRemove && React.createElement("button",{className:"sp-del-btn",
      title:"Remove this element (Undo restores it)",
      onMouseDown:(e)=>e.preventDefault(), onClick:onRemove},"×"));
}

/* EDIT MODE: insert a new screenplay element into a beat — the industry parts
   (action, character cue + line, parenthetical, mini-slugline, transition). */
function AddBlockRow({ onAdd }){
  const [open, setOpen] = React.useState(false);
  const OPTS = [
    ["action","Action"],
    ["charline","Character + line"],
    ["paren","Parenthetical"],
    ["scene","Mini-slugline"],
    ["trans","Transition"],
  ];
  return React.createElement("div",{className:"sp-addrow"},
    !open
      ? React.createElement("button",{className:"sp-add-btn",title:"Insert a screenplay element into this beat",
          onClick:()=>setOpen(true)}, "+ Add")
      : React.createElement(React.Fragment,null,
          OPTS.map(o=>React.createElement("button",{key:o[0],className:"sp-add-chip",
            onClick:()=>{ setOpen(false); onAdd(o[0]); }},o[1])),
          React.createElement("button",{className:"sp-add-chip ghost",onClick:()=>setOpen(false)},"\u00d7")));
}

/* the (CONT'D) bookkeeping the main page does, reusable for any block list */
function buildContdSet(blocks){
  const set = new Set(); let last = null;
  (blocks||[]).forEach(b=>{
    if(b.type==="char"){ const nm = String(b.text).toUpperCase().replace(/\s*\(CONT\u2019?D\)\s*$/i,"");
      if(last && nm===last) set.add(b); last = nm; }
    else if(b.type==="scene" || b.type==="trans") last = null;
  });
  return set;
}

function TransitionBar({ trans, out, fromTo }){
  if(!trans) return null;
  return React.createElement("div",{className:`sp-trans ${out?"out":""}`},
    React.createElement("span",{className:`ttype ${trans.cls}`},trans.type),
    React.createElement("span",{className:"tgloss"},trans.gloss),
    fromTo && React.createElement("span",{className:"tdir"},React.createElement(Icon.arrowSmall,{s:12}),fromTo));
}

function CarryLedger({ cells }){
  return React.createElement("div",{className:"sp-carry"},
    React.createElement("div",{className:"clab2"},React.createElement(Icon.layers,{s:11}),"Story-state carried into this scene"),
    cells.map((c,i)=>React.createElement("div",{key:i,className:"cell"},
      React.createElement("div",{className:"clab"},c.lab),
      React.createElement("div",{className:"cval"},c.node || c.val))));
}

function ContinuityReport({ report, onJump, onClose, currentId }){
  const conflicts = report.conflicts;
  return React.createElement("div",{className:"cont-report"},
    React.createElement("div",{className:"cont-report-head"},
      React.createElement("div",{className:"t"},
        React.createElement(Icon.layers,{s:14}),"Continuity check"),
      React.createElement("div",{className:"sub"},
        conflicts.length ? conflicts.length+" issue"+(conflicts.length>1?"s":"")+" across "+report.total+" scenes" : report.total+" scenes \u00b7 no conflicts"),
      React.createElement("button",{className:"ai-x",onClick:onClose},React.createElement(Icon.x,{s:14}))),
    React.createElement("div",{className:"cont-explain"},
      "Tracks what every scene ", React.createElement("b",null,"sets up"), " and ", React.createElement("b",null,"pays off"),
      ". It flags a payoff with no earlier setup, a reference that lands before its setup, or a setup that never pays off \u2014 and updates live as you reorder or edit scenes."),
    conflicts.length===0
      ? React.createElement("div",{className:"cont-clean"},
          React.createElement("span",{className:"ic"},React.createElement(Icon.check,{s:18})),
          "Every referenced fact is set up before it's used, and every setup pays off.")
      : conflicts.map((c,i)=>{
          const k = CONFLICT_KIND[c.kind];
          const IcC = Icon[k.ic] || Icon.alert;
          const here = c.sceneId===currentId;
          return React.createElement("div",{key:i,className:`cont-row ${k.sev}`,onClick:()=>onJump(c.sceneId)},
            React.createElement("span",{className:"ic"},React.createElement(IcC,{s:16})),
            React.createElement("div",{className:"body"},
              React.createElement("div",{className:"kind"},k.lab,
                React.createElement("span",{className:"sc"},"Sc."+String(c.sceneNo).padStart(2,"0"))),
              React.createElement("div",{className:"msg"},"Scene "+String(c.sceneNo).padStart(2,"0")+" "+c.msg),
              React.createElement("div",{className:"fix"},React.createElement(Icon.wand,{s:11})," ",k.fix)),
            React.createElement("span",{className:"cont-jump"},
              here ? "Viewing" : "Go to scene", React.createElement(Icon.arrowSmall,{s:13})));
        }));
}

function ScriptView({ scene, beats, drafts, scenes, onSelectScene, onDraftOne, onDraftAll, onPolish, drafting, total,
                     history, labelOf, onRevert, onRedo, onEditScene, continuityMap, project, onBeatFocus, readOnly }){
  const CONT = continuityMap || (window.TURN_DATA||{}).CONTINUITY || {};
  const FACTS = (window.TURN_DATA||{}).FACTS || {};
  const live = typeof aiAvailable==="function" && aiAvailable();
  const [activeBeat, setActiveBeat] = React.useState(null);
  const [showReport, setShowReport] = React.useState(false);
  const [polishing, setPolishing] = React.useState(false);
  const [polishWait, setPolishWait] = React.useState(false);
  const [justPolished, setJustPolished] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [beatWriting, setBeatWriting] = React.useState(null);   // beat # being AI-written into a gap
  // Undo/Redo flash — the Set of blocks (of the version being restored) that DIFFER
  // from what's on screen, so the user sees exactly what the undo changed.
  const [verFlash, setVerFlash] = React.useState(null);
  const verFlashTimer = React.useRef(null);
  React.useEffect(()=>{ setActiveBeat(null); setPolishing(false); setPolishWait(false); setJustPolished(false); setEditing(false); setVerFlash(null); setBeatWriting(null); },[scene && scene.id]);
  React.useEffect(()=>{ if(readOnly) setEditing(false); },[readOnly]);
  // once the restored version renders, bring the first changed block into view if it's
  // off-screen (essential on mobile, where the change is usually below the fold)
  React.useEffect(()=>{
    if(!verFlash) return;
    const t = setTimeout(()=>{
      const el = document.querySelector(".spb-flash");
      if(!el) return;
      const r = el.getBoundingClientRect();
      if(r.top < 0 || r.bottom > (window.innerHeight||document.documentElement.clientHeight))
        el.scrollIntoView({ behavior:"smooth", block:"center" });
    }, 80);
    return ()=>clearTimeout(t);
  },[verFlash]);

  if(!scene) return React.createElement("div",{className:"script-scroll"},
    React.createElement("div",{className:"script-empty"},
      React.createElement("div",{className:"ico"},React.createElement(Icon.script,{s:26})),
      React.createElement("h3",null,"Select a scene"),
      React.createElement("p",null,"Pick a scene from the spine or the story panel to draft its screenplay.")));

  const orderedScenes=(typeof scenesInStoryOrder==="function")?scenesInStoryOrder(scenes):scenes;
  const idx = orderedScenes.findIndex(s=>s.id===scene.id);
  const prevScene = orderedScenes[idx-1] || null;
  const nextScene = orderedScenes[idx+1] || null;
  const screenplay = drafts[scene.id];
  const draftedCount = orderedScenes.filter(s=>drafts[s.id]).length;
  const go = (d, e)=>{ if(e && e.stopPropagation) e.stopPropagation(); const n = orderedScenes[idx+d]; if(n) onSelectScene(n.id); };

  const transIn = sceneTransition(prevScene, scene);
  const transOut = nextScene ? sceneTransition(scene, nextScene) : null;
  const carry = sceneCarry(prevScene, scene, project);

  const report = continuityReport(orderedScenes, CONT, FACTS);
  const sceneConflicts = report.conflicts.filter(c=>c.sceneId===scene.id);

  // ---- auto-draft control / progress ----
  let control = null;
  if(drafting){
    const pct = Math.round((drafting.i/total)*100);
    const now = orderedScenes[Math.min(drafting.i, total-1)];
    control = React.createElement("div",{className:"draft-prog"},
      React.createElement("div",{className:"orb"}),
      React.createElement("div",null,
        React.createElement("div",{className:"lbl"},`${live?"MUSE is drafting":"Drafting"} Sc.${String(now?now.no:total).padStart(2,"0")} \u00b7 threading continuity\u2026`),
        React.createElement("div",{className:"bar"},React.createElement("i",{style:{width:pct+"%"}}))));
  } else if(draftedCount < total){
    control = React.createElement("button",{className:"draft-btn sm",onClick:onDraftAll,disabled:readOnly,
      title:readOnly?"View-only access":undefined},
      React.createElement(Icon.sparkles,{s:14}),`Auto-draft all (${total-draftedCount} left)`);
  }

  // continuity button
  const contBtn = React.createElement("button",{
    className:`cont-btn ${report.conflicts.length?"warn":"ok"}`,onClick:()=>setShowReport(v=>!v)},
    React.createElement(report.conflicts.length?Icon.alert:Icon.check,{s:14}),
    report.conflicts.length ? `Continuity \u00b7 ${report.conflicts.length}` : "Continuity");


  // ---- screenplay present: render the STORED draft directly (no blend) ----
  let body = null, polishUI = null, versionUI = null;
  const hb = history || {back:[],fwd:[]};
  if(screenplay){
    const groupByBeat = (blocks)=>{ const m={}, order=[]; blocks.forEach(b=>{ if(!m[b.beat]){m[b.beat]=[];order.push(b.beat);} m[b.beat].push(b); }); return {m,order}; };
    const { m:fg } = groupByBeat(screenplay.blocks);
    // shooting-script numbering: only the scene's OPENING slugline carries the number —
    // secondary (mid-scene) sluglines render as plain headings
    const firstSlugBlock = screenplay.blocks.find(b=>b.type==="scene");
    const order = screenplayBeatNumbers(screenplay, beats);
    // mark a character cue as (CONT'D) when the same speaker returns after intervening action
    const contdSet = buildContdSet(screenplay.blocks);

    // Polish: generate a NEW version (old one is pushed to history by commitVersion)
    const runPolish = async ()=>{
      if(readOnly || polishing || !live) return;
      setPolishing(true); setPolishWait(true); setJustPolished(false);
      let ok = false;
      if(onPolish){ try{ ok = await onPolish(scene, beats); }catch(e){} }
      setPolishWait(false); setPolishing(false);
      if(ok){ setJustPolished(true); setTimeout(()=>setJustPolished(false), 1400); }
    };
    // ONE name for one lever (user ruling 2026-07-13): this is the same engine as
    // the Beats tab's button — the scene rebuilt from its CURRENT beats — so it
    // carries the same label here. The centered overlay mirrors the Beats tab's.
    if(live) polishUI = React.createElement(React.Fragment,null,
      React.createElement("button",
        // always the accent style — the primary action must read consistently orange
        // whether or not the current draft is already polished (user ruling 2026-07-19)
        {className:"draft-btn sm",onClick:runPolish,disabled:readOnly||polishing,
         title:"Rewrite this scene's screenplay from its CURRENT beat cards — the previous draft stays in version history (Undo restores it)"},
        React.createElement(Icon.wand,{s:14}),
        polishWait ? "Redrafting\u2026"
          // full label on desktop; CSS shortens the middle word out at <=400px
          : React.createElement(React.Fragment,null,"Redraft ",
              React.createElement("span",{className:"redraft-long"},"script "),"from beats")));

    // undo / redo — one linear history of the scene's screenplay states (manual edits,
    // MUSE polishes and drafts all push onto the same stack). Appears once there's history.
    // Before swapping versions, diff the incoming blocks against what's on screen and
    // FLASH the changed ones (the version's block objects become the rendered ones, so
    // identity survives the swap), scrolling the first change into view if off-screen.
    const flashDiff = (target)=>{
      if(!target || !Array.isArray(target.blocks)) return;
      const cur = (screenplay && screenplay.blocks) || [];
      const nxt = target.blocks;
      const changed = new Set();
      for(let i=0; i<Math.max(cur.length, nxt.length); i++){
        const a=cur[i], b=nxt[i];
        if(!b){ if(nxt.length) changed.add(nxt[nxt.length-1]); break; }   // lines removed at the end — mark the new last block
        if(!a || a.text!==b.text || a.type!==b.type) changed.add(b);
      }
      if(!changed.size) return;
      setVerFlash(changed);
      clearTimeout(verFlashTimer.current);
      verFlashTimer.current = setTimeout(()=>setVerFlash(null), 2600);
    };
    if(hb.back.length || hb.fwd.length){
      // the version's engine rides its Undo/Redo tooltip too ("MUSE draft · Kimi K3")
      const labelWithBy = (v)=>{ const l=labelOf(v); return (v && !v.edited && v.by && v.by.model) ? l+" · "+v.by.model : l; };
      const prevLabel = hb.back.length ? labelWithBy(hb.back[hb.back.length-1]) : null;
      const nextLabel = hb.fwd.length ? labelWithBy(hb.fwd[0]) : null;
      versionUI = React.createElement("div",{className:"ver-ctl"},
        React.createElement("button",{className:"ver-btn",disabled:readOnly||!hb.back.length||polishing,
          title: prevLabel?("Undo — back to "+prevLabel):"Nothing to undo",
          onClick:()=>{ if(polishing) return; flashDiff(hb.back[hb.back.length-1]); onRevert(scene.id); }},
          React.createElement(Icon.undo,{s:13}), "Undo"),
        React.createElement("button",{className:"ver-btn",disabled:readOnly||!hb.fwd.length||polishing,
          title: nextLabel?("Redo — forward to "+nextLabel):"Nothing to redo",
          onClick:()=>{ if(polishing) return; flashDiff(hb.fwd[0]); onRedo(scene.id); }},
          React.createElement(Icon.redo,{s:13}), "Redo"));
    }

    // EDIT: rewrite one block's raw text and commit it as a new version (so Undo/Redo
    // covers manual edits too). Matches the block by identity in the canonical block list.
    const commitEdit = (b, newText)=>{
      if(!onEditScene) return;
      const gi = screenplay.blocks.indexOf(b);
      if(gi<0) return;
      const nextBlocks = screenplay.blocks.map((x,j)=> j===gi ? {...x, text:newText} : x);
      onEditScene(scene.id, { ...screenplay, blocks:nextBlocks, edited:true, polished:false, ai:false, auto:false, by:null });
    };

    // EDIT MODE: remove one element outright (the direct undo for an added box).
    // Commits as a version like any edit, so Undo brings it back.
    const removeBlock = (b)=>{
      if(!onEditScene) return;
      const gi = screenplay.blocks.indexOf(b);
      if(gi<0) return;
      const blocks = screenplay.blocks.filter((x,j)=> j!==gi);
      onEditScene(scene.id, { ...screenplay, blocks, edited:true, polished:false, ai:false, auto:false, by:null });
    };

    // EDIT MODE: insert new element(s) at the END of a beat's blocks. "charline"
    // = a character cue plus an empty dialogue line in one press.
    const insertBlock = (beatN, kind)=>{
      if(!onEditScene) return;
      const blocks = screenplay.blocks.slice();
      let at = -1;
      for(let j=0;j<blocks.length;j++){ if((blocks[j].beat||1)===beatN) at = j; }
      if(at<0){ for(let j=0;j<blocks.length;j++){ if((blocks[j].beat||1)<beatN) at = j; } }
      const fresh = kind==="charline"
        ? [ { beat:beatN, type:"char", text:"" }, { beat:beatN, type:"dia", text:"" } ]
        : [ { beat:beatN, type:kind, text:"" } ];
      blocks.splice(at+1, 0, ...fresh);
      onEditScene(scene.id, { ...screenplay, blocks, edited:true, polished:false, ai:false, auto:false, by:null });
    };
    const beatRow = (n)=> beats && beats.rows.find(r=>r.n===n);
    // WRITE A MISSING BEAT: the map defines beat N but no screenplay block dramatizes it.
    // One click AI-writes just that beat's prose (neighbouring text as read-only context),
    // splices it in beat order and commits a NEW version (Undo restores the gap).
    const writeMissingBeat = async (n)=>{
      if(readOnly || beatWriting || !live || !onEditScene) return;
      setBeatWriting(n);
      try{
        const res = (typeof aiWriteBeatText==="function") ? await aiWriteBeatText(scene, beats, n, screenplay, prevScene, project) : null;
        if(res && res.blocks && res.blocks.length){
          const blocks = screenplay.blocks.slice();
          let at = -1;   // after the last block belonging to an EARLIER beat (slug rides as beat 1)
          for(let j=0;j<blocks.length;j++){ if((Number(blocks[j].beat)||1) < n) at = j; }
          blocks.splice(at+1, 0, ...res.blocks);
          onEditScene(scene.id, { ...screenplay, blocks, ai:true, auto:false, edited:false, by:res.by||null });
          setVerFlash(new Set(res.blocks));
          clearTimeout(verFlashTimer.current);
          verFlashTimer.current = setTimeout(()=>setVerFlash(null), 2600);
        } else if(window.appToast) window.appToast("Couldn't write this beat — try again.","error");
      } finally { setBeatWriting(null); }
    };
    body = React.createElement(React.Fragment,null,
      polishWait && React.createElement("div",{className:"polish-note"},
        React.createElement(Icon.wand,{s:12}),"MUSE is rewriting the prose \u2014 beats stay locked, only the words change\u2026"),
      React.createElement("div",{className:`script-body ${justPolished?"just-polished":""} ${editing?"editing":""}`,onMouseLeave:()=>!editing&&setActiveBeat(null)},
        order.map(n=>{
          const r = beatRow(n);
          const scriptBeat = screenplayBeatExcerpt(screenplay, n, 88);
          const missingScript = !!r && !scriptBeat;
          const on = activeBeat===n;
          return React.createElement("div",{key:n,className:`sp-seg ${on?"on":""} ${missingScript?"missing-script":""}`},
            React.createElement("div",{className:`sp-gut ${on?"on":""}`,
              title:(r ? ((r.drive&&r.drive.a)||("Beat "+n))+" / "+((r.react&&r.react.a)||"Reaction")+"\n" : "")+
                (scriptBeat ? ("Screenplay: "+scriptBeat) : "No screenplay text is assigned to this beat"),
              onMouseEnter:()=>setActiveBeat(n),
              onClick:()=>{ setActiveBeat(n); onBeatFocus && onBeatFocus(n); }},
              React.createElement("div",{className:"bnum"},n),
              React.createElement("div",{className:"blab"}, r ? r.drive.a : "Unmapped beat")),
            React.createElement("div",{className:"sp-page"},
              React.createElement("div",{className:"sp-page-inner"},
                (fg[n]||[]).length
                  ? (fg[n]||[]).map((b,i)=> editing
                  ? React.createElement(EditableBlock,{key:i,b,onCommit:(t)=>commitEdit(b,t),onRemove:()=>removeBlock(b),sceneNo:(b===firstSlugBlock?scene.no:null),flash:!!(verFlash&&verFlash.has(b))})
                  : React.createElement(ScriptBlock,{key:i,b,contd:contdSet.has(b),sceneNo:(b===firstSlugBlock?scene.no:null),flash:!!(verFlash&&verFlash.has(b))}))
                  : React.createElement("div",{className:"spb-missing-wrap"},
                      React.createElement("div",{className:"spb-action spb-missing"},"No screenplay text assigned to this beat."),
                      // one-click gap fix — only when the beat map defines this beat and MUSE is live
                      r && live && onEditScene && React.createElement("button",{className:"spb-write-btn",
                        disabled: readOnly||beatWriting!=null,
                        title:"MUSE writes JUST this beat's prose from its beat-map action/reaction ("+((r.drive&&r.drive.a)||"Action")+" / "+((r.react&&r.react.a)||"Reaction")+"), bridging the surrounding text — committed as a new version, Undo restores the gap.",
                        onClick:()=>writeMissingBeat(n)},
                        beatWriting===n
                          ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin"}),"Writing beat "+n+"…")
                          : React.createElement(React.Fragment,null,React.createElement(Icon.sparkles,{s:12}),"Write this beat from the beat map"))),
                 editing && !readOnly && React.createElement(AddBlockRow,{onAdd:(kind)=>insertBlock(n, kind)}))));
        })),
      transOut && React.createElement(TransitionBar,{trans:transOut,out:true,
        fromTo:`to Sc.${String(nextScene.no).padStart(2,"0")} ${nextScene.title}`}));
  }

  // EDIT toggle — only when there's a draft to edit and the parent supports committing
  const editBtn = (screenplay && onEditScene) ? React.createElement("button",
    { className:`draft-btn sm ${editing?"":"ghost"}`, onClick:()=>setEditing(e=>!e), disabled:readOnly||polishing,
      title: editing?"Finish editing the screenplay":"Edit the screenplay text directly" },
    React.createElement(editing?Icon.check:Icon.pencil,{s:14}),
    editing ? "Done editing" : "Edit") : null;

  const missing = (typeof sceneMissing==="function") ? sceneMissing(scene, drafts) : [];
  const header = React.createElement("div",{className:"script-head"},
    React.createElement("div",{className:"meta"},
      React.createElement("div",{className:"script-title-row"},
        React.createElement("div",{className:"script-title"},scene.title)),
      // STATUS LINE — a real warning and a neutral note sit on one row rather than
      // stacking as two competing pills; see styles.css for why the note is quiet.
      (screenplay && missing.length>0) && React.createElement("div",{className:"script-status"},
        React.createElement("div",{className:"script-missing"},React.createElement(Icon.alert,{s:12}),
          "Missing: "+missing.join(", ")))),
    // two groups so mobile can stack them as two lines with the SAME desktop look:
    // A = the housed glued strip (Continuity/Undo/Redo/Edit), B = Redraft + pager
    React.createElement("div",{className:"script-tools"},
      React.createElement("div",{className:"st-group a"}, contBtn, versionUI, editBtn),
      React.createElement("div",{className:"st-group b"}, polishUI, control,
        React.createElement("div",{className:"script-scenestep",title:"Step through the screenplay scene by scene"},
          React.createElement("button",{className:"panel-collapse",onClick:(e)=>go(-1,e),disabled:idx<=0,
            title:"Previous scene",style:{opacity:idx<=0?.4:1}},React.createElement(Icon.chevL,{s:14})),
          `Scene ${idx+1} / ${scenes.length}`,
          React.createElement("button",{className:"panel-collapse",onClick:(e)=>go(1,e),disabled:idx>=scenes.length-1,
            title:"Next scene",style:{opacity:idx>=scenes.length-1?.4:1}},React.createElement(Icon.chevR,{s:14}))))));

  // inline per-scene continuity flag
  const inlineFlag = sceneConflicts.length ? React.createElement("div",
    {className:`cont-inline ${sceneConflicts.every(c=>CONFLICT_KIND[c.kind].sev==="warn")?"warn":""}`},
    React.createElement("span",{className:"ic"},React.createElement(Icon.alert,{s:15})),
    React.createElement("div",{className:"tx"},
      React.createElement("b",null,"Continuity: "),
      sceneConflicts.map(c=>c.msg).join("  \u00b7  "))) : null;

  // empty state (undrafted)
  if(!screenplay){
    return React.createElement("div",{className:"script-scroll"},
      header,
      showReport && React.createElement(ContinuityReport,{report,currentId:scene.id,onJump:(id)=>onSelectScene(id),onClose:()=>setShowReport(false)}),
      React.createElement(TransitionBar,{trans:transIn,fromTo:prevScene?`from Sc.${String(prevScene.no).padStart(2,"0")}`:null}),
      React.createElement(CarryLedger,{cells:carry}),
      React.createElement("div",{className:"script-empty"},
        React.createElement("div",{className:"ico"},React.createElement(Icon.wand,{s:26})),
        React.createElement("h3",null,"Not drafted yet"),
        React.createElement("p",null, beats
          ? `This scene's ${beats.rows.length} beats are mapped. ${live?"MUSE will expand them into original prose, threading":"Expanding them inherits"} the story-state above.`
          : "Map this scene into beats first, then it can be expanded into screenplay."),
        React.createElement("div",{style:{display:"flex",gap:10,justifyContent:"center"}},
          React.createElement("button",{className:"draft-btn",disabled:readOnly,onClick:()=>onDraftOne(scene)},
            React.createElement(Icon.wand,{s:15}),live?"Draft with MUSE":"Draft this scene"),
          React.createElement("button",{className:"draft-btn ghost",disabled:readOnly,onClick:onDraftAll},
            React.createElement(Icon.sparkles,{s:15}),"Auto-draft all"))));
  }

  return React.createElement("div",{className:"script-scroll"},
    header,
    showReport && React.createElement(ContinuityReport,{report,currentId:scene.id,onJump:(id)=>onSelectScene(id),onClose:()=>setShowReport(false)}),
    inlineFlag,
    React.createElement(TransitionBar,{trans:transIn,fromTo:prevScene?`from Sc.${String(prevScene.no).padStart(2,"0")} ${prevScene.title}`:null}),
    React.createElement(CarryLedger,{cells:carry}),
    body);
}
window.ScriptView = ScriptView;
