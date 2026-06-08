/* script.jsx — Script view + auto-draft engine.
   Left gutter = SUBTEXT (beats). Right page = TEXT (screenplay).
   Automation drafts every scene from a rolling story-state, with transition
   hinges + a continuity ledger threaded scene to scene. */

const BLOCK_CLASS = { scene:"spb-scene", action:"spb-action", char:"spb-char", paren:"spb-paren", dia:"spb-dia", trans:"spb-trans" };
const ROMAN = ["I","II","III"];

function parseSlug(loc){
  const parts = String(loc).split("\u00b7");
  const time = (parts[1]||"").trim();
  const left = (parts[0]||"").trim();
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
    return { type:"TIME CUT", cls:"", gloss:`Time moves: ${a.time||"\u2014"} \u2192 ${b.time||"\u2014"}.` };
  return { type:"HARD CUT", cls:"", gloss:`New location \u2014 ${b.place}.` };
}

/* the story-state carried across the cut into this scene */
function sceneCarry(prev, cur){
  const b = parseSlug(cur.loc);
  const cells = [
    { lab:"Location", val:b.place },
    { lab:"Time", val:b.time || "\u2014" },
    { lab:"Serves spine", val:"Neo \u2014 break the lie, become free" },
  ];
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
function ScriptBlock({ b, contd }){
  let type = b.type, text = b.text;
  if(type==="action" && isSpTransition(text)){ type="trans"; text=text.toUpperCase(); }
  if(type==="char"){
    text = text.toUpperCase();
    if(contd && !/\(CONT\u2019?D\)\s*$/i.test(text)) text = text + " (CONT\u2019D)";
  }
  return React.createElement("div",{className:BLOCK_CLASS[type]||"spb-action"}, text);
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
                     history, labelOf, onRevert, onRedo, continuityMap }){
  const CONT = continuityMap || (window.TURN_DATA||{}).CONTINUITY || {};
  const FACTS = (window.TURN_DATA||{}).FACTS || {};
  const live = typeof aiAvailable==="function" && aiAvailable();
  const [activeBeat, setActiveBeat] = React.useState(null);
  const [showReport, setShowReport] = React.useState(false);
  const [polishing, setPolishing] = React.useState(false);
  const [polishWait, setPolishWait] = React.useState(false);
  const [justPolished, setJustPolished] = React.useState(false);
  React.useEffect(()=>{ setActiveBeat(null); setPolishing(false); setPolishWait(false); setJustPolished(false); },[scene && scene.id]);

  if(!scene) return React.createElement("div",{className:"script-scroll"},
    React.createElement("div",{className:"script-empty"},
      React.createElement("div",{className:"ico"},React.createElement(Icon.script,{s:26})),
      React.createElement("h3",null,"Select a scene"),
      React.createElement("p",null,"Pick a scene from the spine or the story panel to draft its screenplay.")));

  const idx = scenes.findIndex(s=>s.id===scene.id);
  const prevScene = scenes[idx-1] || null;
  const nextScene = scenes[idx+1] || null;
  const screenplay = drafts[scene.id];
  const draftedCount = scenes.filter(s=>drafts[s.id]).length;
  const go = (d)=>{ const n = scenes[idx+d]; if(n) onSelectScene(n.id); };

  const transIn = sceneTransition(prevScene, scene);
  const transOut = nextScene ? sceneTransition(scene, nextScene) : null;
  const carry = sceneCarry(prevScene, scene);

  const report = continuityReport(scenes, CONT, FACTS);
  const sceneConflicts = report.conflicts.filter(c=>c.sceneId===scene.id);

  // ---- auto-draft control / progress ----
  let control = null;
  if(drafting){
    const pct = Math.round((drafting.i/total)*100);
    const now = scenes[Math.min(drafting.i, total-1)];
    control = React.createElement("div",{className:"draft-prog"},
      React.createElement("div",{className:"orb"}),
      React.createElement("div",null,
        React.createElement("div",{className:"lbl"},`${live?"MUSE is drafting":"Drafting"} Sc.${String(now?now.no:total).padStart(2,"0")} \u00b7 threading continuity\u2026`),
        React.createElement("div",{className:"bar"},React.createElement("i",{style:{width:pct+"%"}}))));
  } else if(draftedCount < total){
    control = React.createElement("button",{className:"draft-btn sm",onClick:onDraftAll},
      React.createElement(Icon.sparkles,{s:14}),`Auto-draft all (${total-draftedCount} left)`);
  }

  // continuity button
  const contBtn = React.createElement("button",{
    className:`cont-btn ${report.conflicts.length?"warn":"ok"}`,onClick:()=>setShowReport(v=>!v)},
    React.createElement(report.conflicts.length?Icon.alert:Icon.check,{s:14}),
    report.conflicts.length ? `Continuity \u00b7 ${report.conflicts.length}` : "Continuity");

  // ---- screenplay present: render the STORED draft directly (no blend) ----
  let body = null, badge = null, noteText = null, polishUI = null, versionUI = null;
  const hb = history || {back:[],fwd:[]};
  if(screenplay){
    const groupByBeat = (blocks)=>{ const m={}, order=[]; blocks.forEach(b=>{ if(!m[b.beat]){m[b.beat]=[];order.push(b.beat);} m[b.beat].push(b); }); return {m,order}; };
    const { m:fg, order } = groupByBeat(screenplay.blocks);
    // mark a character cue as (CONT'D) when the same speaker returns after intervening action
    const contdSet = new Set();
    let lastSpeaker = null;
    screenplay.blocks.forEach(b=>{
      if(b.type==="char"){ const nm=String(b.text).toUpperCase().replace(/\s*\(CONT\u2019?D\)\s*$/i,"");
        if(lastSpeaker && nm===lastSpeaker) contdSet.add(b); lastSpeaker=nm; }
      else if(b.type==="scene"||b.type==="trans") lastSpeaker=null;
    });
    const slugCount = screenplay.blocks.filter(b=>b.type==="scene").length;
    noteText = screenplay.note || (slugCount>1 ? ("This unit is a sequence \u2014 it spans "+slugCount+" sluglines.") : null);

    const verLabel = labelOf(screenplay);
    const isPolished = !!screenplay.polished;
    badge = React.createElement("span",{className:`sp-badge ${isPolished?"polished":(screenplay.auto?"structural":"")}`}, verLabel);

    // Polish: generate a NEW version (old one is pushed to history by commitVersion)
    const runPolish = async ()=>{
      if(polishing || !live) return;
      setPolishing(true); setPolishWait(true); setJustPolished(false);
      let ok = false;
      if(onPolish){ try{ ok = await onPolish(scene, beats); }catch(e){} }
      setPolishWait(false); setPolishing(false);
      if(ok){ setJustPolished(true); setTimeout(()=>setJustPolished(false), 1400); }
    };
    if(live) polishUI = React.createElement("button",
      {className:`draft-btn sm ${isPolished?"ghost":""}`,onClick:runPolish,disabled:polishing},
      React.createElement(Icon.wand,{s:14}),
      polishWait ? "MUSE is writing\u2026" : (isPolished ? "Re-polish" : "Polish with MUSE"));

    // version history (revert / redo) — appears once a scene has other versions
    if(hb.back.length || hb.fwd.length){
      const prevLabel = hb.back.length ? labelOf(hb.back[hb.back.length-1]) : null;
      const nextLabel = hb.fwd.length ? labelOf(hb.fwd[0]) : null;
      versionUI = React.createElement("div",{className:"ver-ctl"},
        React.createElement("button",{className:"ver-btn",disabled:!hb.back.length||polishing,
          title: prevLabel?("Revert to "+prevLabel):"Nothing to revert to",
          onClick:()=>!polishing&&onRevert(scene.id)},
          React.createElement(Icon.undo,{s:13}), prevLabel?("Revert to "+prevLabel):"Revert"),
        React.createElement("button",{className:"ver-btn icon",disabled:!hb.fwd.length||polishing,
          title: nextLabel?("Redo to "+nextLabel):"Nothing to redo",
          onClick:()=>!polishing&&onRedo(scene.id)},
          React.createElement(Icon.redo,{s:13})));
    }

    const beatRow = (n)=> beats && beats.rows.find(r=>r.n===n);
    body = React.createElement(React.Fragment,null,
      polishWait && React.createElement("div",{className:"polish-note"},
        React.createElement(Icon.wand,{s:12}),"MUSE is rewriting the prose \u2014 beats stay locked, only the words change\u2026"),
      React.createElement("div",{className:`script-body ${justPolished?"just-polished":""}`,onMouseLeave:()=>setActiveBeat(null)},
        order.map(n=>{
          const r = beatRow(n);
          const on = activeBeat===n;
          return React.createElement("div",{key:n,className:"sp-seg"},
            React.createElement("div",{className:`sp-gut ${on?"on":""}`,
              onMouseEnter:()=>setActiveBeat(n),onClick:()=>setActiveBeat(n)},
              React.createElement("div",{className:"bnum"},n),
              r && React.createElement("div",{className:"blab"},r.drive.a),
              r && React.createElement("div",{className:"bsub"},"\u2197 "+r.react.a)),
            React.createElement("div",{className:"sp-page"},
              React.createElement("div",{className:"sp-page-inner"},
                (fg[n]||[]).map((b,i)=>React.createElement(ScriptBlock,{key:i,b,contd:contdSet.has(b)})))));
        })),
      transOut && React.createElement(TransitionBar,{trans:transOut,out:true,
        fromTo:`to Sc.${String(nextScene.no).padStart(2,"0")} ${nextScene.title}`}));
  }

  const missing = (typeof sceneMissing==="function") ? sceneMissing(scene, drafts) : [];
  const header = React.createElement("div",{className:"script-head"},
    React.createElement("div",{className:"meta"},
      React.createElement("div",{className:"script-slug"},`SCENE ${String(scene.no).padStart(2,"0")} \u00b7 ${scene.loc}`),
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10}},
        React.createElement("div",{className:"script-title"},scene.title), badge),
      // professional-completeness flag (only when something's missing AND the scene is drafted)
      screenplay && missing.length>0 &&
        React.createElement("div",{className:"script-missing"},React.createElement(Icon.alert,{s:12}),
          "Missing: "+missing.join(", ")),
      noteText &&
        React.createElement("div",{className:"script-note"},React.createElement(Icon.layers,{s:12}),noteText)),
    React.createElement("div",{className:"script-tools"},
      contBtn, versionUI, polishUI, control,
      React.createElement("div",{className:"script-scenestep"},
        React.createElement("button",{className:"panel-collapse",onClick:()=>go(-1),disabled:idx<=0,
          style:{opacity:idx<=0?.4:1}},React.createElement(Icon.chevL,{s:14})),
        `${idx+1} / ${scenes.length}`,
        React.createElement("button",{className:"panel-collapse",onClick:()=>go(1),disabled:idx>=scenes.length-1,
          style:{opacity:idx>=scenes.length-1?.4:1}},React.createElement(Icon.chevR,{s:14})))));

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
          React.createElement("button",{className:"draft-btn",onClick:()=>onDraftOne(scene)},
            React.createElement(Icon.wand,{s:15}),live?"Draft with MUSE":"Draft this scene"),
          React.createElement("button",{className:"draft-btn ghost",onClick:onDraftAll},
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
