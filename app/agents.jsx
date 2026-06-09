/* agents.jsx — bounded-loop AI agents for TURN.
   Each agent is an async function run(ctx) that:
     • works on ctx.model — a live working copy { scenes, beats, continuity, drafts }
     • emits reasoning steps via ctx.emit({k, t})   (k = plan|act|observe|flag|ok|done)
     • proposes changes via  await ctx.propose({...}) -> true(approved)|false(rejected)
       (on approval the agent mutates ctx.model then calls ctx.sync())
   Loops are BOUNDED (hard step caps) with deterministic fallbacks, so an
   unparseable model response degrades gracefully instead of hanging.

   ctx = {
     model, sync(), emit(step), propose(card)->Promise<bool>,
     project, facts, cancelled()->bool,
     ai: { available, suggestTurn, plantLine, tableRead, buildSpine, authorScene, draftScene }
   }
*/

/* ---- shared spine analysis (deterministic) ---- */
/* derive the major plot-point kinds from position in the three-act structure,
   so a generated spine gets the same labels (Inciting Incident, Act Climax,
   Midpoint, Crisis, Story Climax, Resolution) the sample story has. */
function assignPlotPoints(scenes){
  scenes.forEach(s=>{ s.kind = "normal"; s.plot = ""; });
  const idxByAct = (act)=> scenes.map((s,i)=>s.act===act?i:-1).filter(i=>i>=0);
  const set = (i,k)=>{ if(i>=0 && i<scenes.length) scenes[i].kind = k; };
  const a1 = idxByAct(1), a2 = idxByAct(2), a3 = idxByAct(3);
  let inciteIdx=-1, midIdx=-1;
  // Act I: inciting incident (mid/late) + act climax (end)
  if(a1.length){
    const climax1 = a1[a1.length-1];
    const incite = a1.length>=2 ? a1[Math.max(0, Math.ceil(a1.length/2)-1)] : -1;
    if(incite>=0 && incite!==climax1){ set(incite,"incite"); inciteIdx=incite; }
    set(climax1, a1.length>=2 ? "act-climax" : "incite");
  }
  // Act II: midpoint (middle) + act climax (end)
  if(a2.length){
    const climax2 = a2[a2.length-1];
    const mid = a2.length>=3 ? a2[Math.floor((a2.length-1)/2)] : -1;
    if(mid>=0 && mid!==climax2){ set(mid,"midpoint"); midIdx=mid; }
    set(climax2,"act-climax");
  }
  // Act III: crisis, story climax, resolution
  if(a3.length===1){ set(a3[0],"story-climax"); }
  else if(a3.length===2){ set(a3[0],"story-climax"); set(a3[1],"resolution"); }
  else if(a3.length>=3){
    set(a3[a3.length-3],"crisis");
    set(a3[a3.length-2],"story-climax");
    set(a3[a3.length-1],"resolution");
  }
  // secondary Title-Case labels for the remaining (non-major) scenes
  scenes.forEach((s,i)=>{
    if(s.kind!=="normal") return;
    if(s.act===1){
      s.plot = (inciteIdx>=0 && i<inciteIdx) ? "Exposition" : "Rising Action";
    } else if(s.act===2){
      if(midIdx<0) s.plot = "Rising Action";
      else if(i<midIdx) s.plot = "Rising Action";
      else if(i===midIdx+1) s.plot = "Reversal";
      else s.plot = "Complication";
    } else {
      const a3 = idxByAct(3);
      s.plot = (i===a3[0]) ? "Low Point" : "Falling Action";
    }
  });
  return scenes;
}
window.assignPlotPoints = assignPlotPoints;

function sd_turnInfo(s){
  const turned = Math.sign(s.openCharge)!==Math.sign(s.closeCharge) || Math.abs(s.closeCharge-s.openCharge)>=2;
  const exempt = s.kind==="resolution";
  return { turned, flagged: !turned && !exempt };
}
function auditSpine(scenes){
  const issues = [];
  // 1) scenes that don't turn (highest priority)
  scenes.forEach(s=>{ if(sd_turnInfo(s).flagged)
    issues.push({ kind:"noturn", sceneId:s.id, sceneNo:s.no, sev:2,
      msg:'"'+s.title+'" opens and closes on the same charge ('+chargeStr(s.openCharge)+" \u2192 "+chargeStr(s.closeCharge)+") \u2014 it doesn't turn." }); });
  // 2) flat climax/midpoint — a big-beat scene whose magnitude is weak
  scenes.forEach(s=>{
    const big = ["midpoint","story-climax","act-climax","crisis"].includes(s.kind);
    if(big && Math.abs(s.closeCharge)<2 && !sd_turnInfo(s).flagged)
      issues.push({ kind:"weakpeak", sceneId:s.id, sceneNo:s.no, sev:1,
        msg:'"'+s.title+'" is a '+(KIND_LABEL[s.kind]||s.kind)+" but lands soft (close "+chargeStr(s.closeCharge)+"). A peak should hit \u00b13." });
  });
  // 3) monotony — 3+ consecutive scenes closing on the same sign with little movement
  for(let i=0;i<scenes.length-2;i++){
    const run = [scenes[i],scenes[i+1],scenes[i+2]];
    const sign = Math.sign(run[0].closeCharge);
    if(sign!==0 && run.every(s=>Math.sign(s.closeCharge)===sign)){
      const spread = Math.max.apply(null,run.map(s=>s.closeCharge)) - Math.min.apply(null,run.map(s=>s.closeCharge));
      if(spread<=1){ issues.push({ kind:"monotony", sceneId:run[1].id, sceneNo:run[1].no, sev:0,
        msg:"Scenes "+run[0].no+"\u2013"+run[2].no+" all sit on the "+(sign>0?"positive":"negative")+" side with little movement \u2014 the rhythm flattens." });
        break; }
    }
  }
  issues.sort((a,b)=>b.sev-a.sev);
  return issues;
}

/* =========================================================
   AGENT 1 — STORY DOCTOR
   audit -> fix weakest link -> apply -> re-audit -> repeat
   ========================================================= */
async function agentStoryDoctor(ctx){
  const MAX_FIXES = 5;
  const skip = new Set();
  ctx.emit({k:"plan", t:"Scanning all "+ctx.model.scenes.length+" scenes for the weakest structural link \u2014 scenes that don't turn, soft peaks, and flat runs."});
  let fixes = 0;
  for(let iter=0; iter<MAX_FIXES; iter++){
    if(ctx.cancelled()) return;
    const issues = auditSpine(ctx.model.scenes).filter(i=>!skip.has(i.sceneId));
    if(!issues.length){ ctx.emit({k:"ok", t:"Re-audit complete \u2014 every remaining scene turns and the rhythm holds. The spine is sound."}); break; }
    ctx.emit({k:"observe", t:issues.length+" issue"+(issues.length>1?"s":"")+" found. Weakest link: Scene "+issues[0].sceneNo+" \u2014 "+issues[0].msg});
    const issue = issues[0];
    const idx = ctx.model.scenes.findIndex(s=>s.id===issue.sceneId);
    const scene = ctx.model.scenes[idx];
    const prev = idx>0 ? ctx.model.scenes[idx-1] : null;

    let fix = null;
    if(issue.kind==="noturn" || issue.kind==="weakpeak"){
      ctx.emit({k:"act", t:"Asking the model for a sharper closing value on Scene "+scene.no+"\u2026"});
      const sug = ctx.ai.available ? await ctx.ai.suggestTurn(scene, prev) : null;
      if(sug){ fix = { closeValue:sug.closeValue, closeCharge:sug.closeCharge, rationale:sug.rationale }; }
      else { // deterministic fallback
        const cc = scene.openCharge>=0 ? Math.max(-3,scene.openCharge-3) : Math.min(3,scene.openCharge+3);
        fix = { closeValue:scene.closeValue, closeCharge:cc, rationale:"Reverse the closing charge so the scene's value flips." };
      }
    } else { // monotony — nudge the middle scene to break the run
      const cc = -Math.sign(scene.closeCharge)*2;
      fix = { closeValue:scene.closeValue, closeCharge:cc, rationale:"Push this scene to the opposite pole to break the flat run and restore contrast." };
    }

    const ok = await ctx.propose({
      title:"Re-charge Scene "+scene.no+" \u2014 "+scene.title,
      reason:issue.msg,
      rationale:fix.rationale,
      before: scene.openValue+" ("+chargeStr(scene.openCharge)+") \u2192 "+scene.closeValue+" ("+chargeStr(scene.closeCharge)+")",
      after:  scene.openValue+" ("+chargeStr(scene.openCharge)+") \u2192 "+fix.closeValue+" ("+chargeStr(fix.closeCharge)+")",
    });
    if(ctx.cancelled()) return;
    if(ok){
      ctx.model.scenes[idx] = {...scene, closeValue:fix.closeValue, closeCharge:fix.closeCharge};
      ctx.sync();
      fixes++;
      ctx.emit({k:"ok", t:"Applied. Scene "+scene.no+" now turns "+chargeStr(scene.openCharge)+" \u2192 "+chargeStr(fix.closeCharge)+". Re-auditing\u2026"});
    } else {
      ctx.emit({k:"flag", t:"Skipped Scene "+scene.no+". Moving on."});
      skip.add(scene.id);
    }
  }
  ctx.emit({k:"done", t: fixes? ("Story Doctor applied "+fixes+" fix"+(fixes>1?"es":"")+". Open the Spine to see the reshaped charge graph.") : "No changes applied."});
}

/* =========================================================
   AGENT 2 — CONTINUITY REPAIR
   run check -> for each flag, plant setup / add payoff -> re-check
   ========================================================= */
async function agentContinuityRepair(ctx){
  const MAX = 5;
  ctx.emit({k:"plan", t:"Running the continuity check across the spine, then repairing each break \u2014 planting missing setups and paying off dangling threads."});
  for(let iter=0; iter<MAX; iter++){
    if(ctx.cancelled()) return;
    const report = continuityReport(ctx.model.scenes, ctx.model.continuity, ctx.facts);
    if(!report.conflicts.length){ ctx.emit({k:"ok", t:"Continuity check clean \u2014 every reference is set up before use and every setup pays off."}); break; }
    ctx.emit({k:"observe", t:report.conflicts.length+" continuity issue"+(report.conflicts.length>1?"s":"")+" remaining. Repairing: "+report.conflicts[0].msg});
    const c = report.conflicts[0];
    const factLabel = c.label || c.fact;
    const scenes = ctx.model.scenes;

    let targetIdx, mode, applyFn, beforeT, afterT;
    if(c.kind==="unestablished" || c.kind==="premature"){
      // plant the setup in an earlier scene (just before its first reference)
      const refIdx = scenes.findIndex(s=>s.id===c.sceneId);
      targetIdx = Math.max(0, refIdx-1);
      mode = "setup";
      beforeT = "Scene "+scenes[refIdx].no+" references \u201c"+factLabel+"\u201d with no earlier setup.";
      afterT  = "Plant \u201c"+factLabel+"\u201d in Scene "+scenes[targetIdx].no+" so the payoff lands.";
    } else { // dangling — add a payoff later
      const setIdx = scenes.findIndex(s=>s.id===c.sceneId);
      targetIdx = Math.min(scenes.length-1, setIdx+1);
      mode = "payoff";
      beforeT = "Scene "+scenes[setIdx].no+" sets up \u201c"+factLabel+"\u201d but nothing pays it off.";
      afterT  = "Pay off \u201c"+factLabel+"\u201d in Scene "+scenes[targetIdx].no+".";
    }
    const target = scenes[targetIdx];
    ctx.emit({k:"act", t:"Drafting a "+mode+" line for \u201c"+factLabel+"\u201d in Scene "+target.no+"\u2026"});
    const line = ctx.ai.available ? await ctx.ai.plantLine(target, factLabel, mode) : null;

    const ok = await ctx.propose({
      title:(mode==="setup"?"Plant setup":"Add payoff")+" in Scene "+target.no+" \u2014 "+target.title,
      reason:beforeT,
      rationale:afterT,
      before: target.summary,
      after: (line ? (target.summary+"  "+line) : (target.summary+"  ["+(mode==="setup"?"Setup":"Payoff")+": "+factLabel+"]")),
    });
    if(ctx.cancelled()) return;
    if(ok){
      // update continuity map so the re-check actually clears
      const cont = {...ctx.model.continuity};
      const entry = {...(cont[target.id]||{establishes:[],references:[]})};
      const key = (c.fact);
      if(mode==="setup"){ entry.establishes = [...(entry.establishes||[]), key]; }
      else { entry.references = [...(entry.references||[]), key]; }
      cont[target.id] = entry;
      ctx.model.continuity = cont;
      // also reflect the planted line in the scene summary
      if(line){ const sidx = ctx.model.scenes.findIndex(s=>s.id===target.id);
        ctx.model.scenes[sidx] = {...target, summary: target.summary+"  "+line}; }
      ctx.sync();
      ctx.emit({k:"ok", t:"Applied to Scene "+target.no+". Re-running the continuity check\u2026"});
    } else {
      ctx.emit({k:"flag", t:"Skipped. Stopping continuity repair to avoid looping on a declined fix."});
      break;
    }
  }
  ctx.emit({k:"done", t:"Continuity repair finished. Open the Script view's continuity check to confirm."});
}

/* =========================================================
   AGENT 3 — ADAPTATION  (logline -> whole spine)
   ========================================================= */
async function agentAdaptation(ctx){
  const brief = (ctx.input||"").trim();
  if(!brief){ ctx.emit({k:"flag", t:"No logline provided. Type a logline or synopsis above and run again."}); ctx.emit({k:"done",t:"Nothing to build."}); return; }
  if(!ctx.ai.available){ ctx.emit({k:"flag", t:"The model isn't available, so a full spine can't be generated here."}); ctx.emit({k:"done",t:"Aborted."}); return; }
  ctx.emit({k:"plan", t:"Designing a complete three-act spine from your logline \u2014 scenes, acts, and a value charge for each that turns."});
  ctx.emit({k:"act", t:"Generating the scene breakdown\u2026"});
  const spine = await ctx.ai.buildSpine(brief);
  if(ctx.cancelled()) return;
  if(!spine){ ctx.emit({k:"flag", t:"The model didn't return a usable spine. Try a more concrete logline."}); ctx.emit({k:"done",t:"Aborted."}); return; }
  const turns = spine.scenes.filter(s=> Math.sign(s.openCharge)!==Math.sign(s.closeCharge) || Math.abs(s.closeCharge-s.openCharge)>=2).length;
  ctx.emit({k:"observe", t:'"'+spine.title+'" \u2014 '+spine.scenes.length+" scenes across 3 acts, "+turns+" of them turning. Review below before it replaces the current project."});

  const ok = await ctx.propose({
    title:"Replace the project with \u201c"+spine.title+"\u201d",
    reason:"This rebuilds the entire spine from your logline, then writes every scene's beats and screenplay. Your current scenes, beats and drafts will be cleared.",
    rationale:spine.scenes.length+" new scenes \u00b7 "+turns+" turn cleanly \u00b7 beats + script written automatically",
    list: spine.scenes.map((s,i)=>String(i+1).padStart(2,"0")+" \u00b7 Act "+["I","II","III"][s.act-1]+" \u00b7 "+s.title+"  ("+chargeStr(s.openCharge)+"\u2192"+chargeStr(s.closeCharge)+")"),
    danger:true,
  });
  if(ctx.cancelled()) return;
  if(!ok){ ctx.emit({k:"flag", t:"Kept the existing project. Nothing changed."}); ctx.emit({k:"done",t:"Cancelled."}); return; }

  ctx.emit({k:"act", t:"Building the story world \u2014 premise, controlling idea, setting and cast\u2026"});
  let world = null;
  try{ world = ctx.ai.buildStoryWorld ? await ctx.ai.buildStoryWorld(brief, spine) : null; }catch(e){}

  const newScenes = spine.scenes.map((s,i)=>({
    id:"g"+Date.now().toString(36)+i, no:i+1, act:s.act, seq:"",
    title:s.title, loc:s.loc, summary:s.summary, driver:s.driver,
    openValue:s.openValue, openCharge:s.openCharge, closeValue:s.closeValue, closeCharge:s.closeCharge,
    conf:2, kind:"normal", objective:"", turningPoint:"",
  }));
  assignPlotPoints(newScenes);
  // card sequence label = the secondary plot function (major beats carry their own badge)
  newScenes.forEach(s=>{ s.seq = s.plot || ""; });
  ctx.model.scenes = newScenes;
  ctx.model.beats = {};
  ctx.model.drafts = {};
  ctx.model.continuity = {};

  // rebuild the whole left panel: project title/premise/idea/setting + cast keyed to drivers
  const base = ctx.project || {};
  ctx.model.project = {
    ...base,
    title: spine.title || base.title,
    format: base.format || "Short Film",
    premise: (world && world.premise) || base.premise,
    controllingIdea: (world && world.controllingIdea) || base.controllingIdea,
    setting: (world && world.setting) || base.setting,
  };

  // ---- reconcile cast identities with the actual scene drivers so counts are right ----
  const palette = ["linear-gradient(135deg,#c97b45,#5e3a1d)","linear-gradient(135deg,#3f7d86,#16323a)",
    "linear-gradient(135deg,#7a6cae,#2a2440)","linear-gradient(135deg,#5a6470,#23282f)",
    "linear-gradient(135deg,#4a8c6a,#1d3a2a)","linear-gradient(135deg,#9a5a6e,#3a2230)"];
  const norm = (s)=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const nameWords = (s)=>String(s||"").toLowerCase().split(/[^a-z]+/).filter(w=>w.length>2);
  const titleCase = (s)=>String(s||"").replace(/[_-]+/g," ").replace(/\b\w/g,m=>m.toUpperCase());

  let cast = ((world && world.cast) || []).map((c,i)=>({
    id: norm(c.id) || norm(c.name) || ("char"+i),
    name: c.name || titleCase(c.id) || ("Character "+(i+1)),
    role: c.role || "", color: palette[i%palette.length],
    conscious:"", unconscious:"", arc:"", look:"", wardrobe:"", props:"",
  }));
  // dedup: the model sometimes splits one person into multiple entries (e.g. an
  // "expanded" later-act version). Merge cast members with the same name into one.
  (()=>{
    const byName = {}; const kept = []; const remap = {};
    cast.forEach(c=>{
      const key = norm(c.name);
      const prev = byName[key];
      if(prev){
        remap[c.id] = prev.id;
        // prefer the protagonist/lead role and keep the richer (longer) role text
        const lead = (r)=>/protagon|lead|hero/i.test(r||"");
        if(lead(c.role) && !lead(prev.role)) prev.role = c.role;
        else if((c.role||"").length > (prev.role||"").length && !lead(prev.role)) prev.role = c.role;
      } else { byName[key] = c; kept.push(c); }
    });
    if(kept.length !== cast.length){
      newScenes.forEach(s=>{ if(remap[s.driver]) s.driver = remap[s.driver]; });
      cast = kept;
    }
  })();
  // remap each scene's driver onto a matching cast id (by id, then by name word)
  const matchTo = (driver)=>{
    const dn = norm(driver); if(!dn) return null;
    let m = cast.find(c=>c.id===dn);
    if(m) return m;
    return cast.find(c=> nameWords(c.name).some(w=> norm(w)===dn || dn.includes(norm(w)) || norm(w).includes(dn))) || null;
  };
  newScenes.forEach(s=>{ const m=matchTo(s.driver); if(m) s.driver = m.id; });
  // orphan drivers = scene driver ids with no cast member
  const castIds = new Set(cast.map(c=>c.id));
  const orphanCounts = {};
  newScenes.forEach(s=>{ if(!castIds.has(s.driver)) orphanCounts[s.driver]=(orphanCounts[s.driver]||0)+1; });
  let orphans = Object.keys(orphanCounts).sort((a,b)=>orphanCounts[b]-orphanCounts[a]);
  // a protagonist must drive scenes: if they'd be empty but unowned scenes exist, give them the biggest group
  const countOf = (id)=> newScenes.filter(s=>s.driver===id).length;
  const prot = cast.find(c=>/protagon|lead|hero/i.test(c.role)) || cast[0];
  if(prot && countOf(prot.id)===0 && orphans.length){
    const give = orphans.shift();
    newScenes.forEach(s=>{ if(s.driver===give) s.driver = prot.id; });
  }
  // remaining orphan drivers: a generic ROLE word (antagonist, mentor, ally…) should
  // fold into the existing cast member who holds that role — never become a literal
  // character named "Antagonist". Only a name-like id earns its own supporting member.
  const ROLE_WORDS = {
    antagonist:/antagon|villain|nemesis|rival|opponent/i,
    protagonist:/protagon|lead|hero|main/i,
    mentor:/mentor|guide|teacher/i,
    ally:/ally|sidekick|friend|partner/i,
    love:/love|romance|partner/i,
    foil:/foil/i,
  };
  const isRoleWord = (id)=> Object.keys(ROLE_WORDS).some(k=> id===k || id.startsWith(k));
  orphans.forEach(d=>{
    const dn = norm(d);
    // try to fold a role-word orphan into a cast member whose ROLE matches
    if(isRoleWord(dn)){
      const key = Object.keys(ROLE_WORDS).find(k=> dn===k || dn.startsWith(k));
      const host = cast.find(c=> ROLE_WORDS[key].test(c.role)) || cast.find(c=>/protagon|lead|hero/i.test(c.role)) || cast[0];
      if(host){ newScenes.forEach(s=>{ if(s.driver===d) s.driver = host.id; }); return; }
    }
    // genuine unnamed character → its own supporting member (kept, but not role-named)
    cast.push({ id:d, name:titleCase(d), role:"Supporting",
      color:palette[cast.length%palette.length], conscious:"",unconscious:"",arc:"",look:"",wardrobe:"",props:"" });
  });
  // fallback: no cast at all -> synthesize from the drivers themselves
  if(!cast.length){
    [...new Set(newScenes.map(s=>s.driver))].forEach((d,i)=>cast.push({ id:d, name:titleCase(d),
      role:i===0?"Protagonist":"Supporting", color:palette[i%palette.length],
      conscious:"",unconscious:"",arc:"",look:"",wardrobe:"",props:"" }));
  }
  // safety net: if a cast member's NAME is just a role word ("Antagonist"), fold it
  // into the real role-holder when one exists — a function is not a character name.
  (()=>{
    const bare = (nm)=>{ const n=norm(nm); return Object.keys(ROLE_WORDS).find(k=> n===k || n==="the"+k); };
    const drop = [];
    cast.forEach(c=>{
      const key = bare(c.name);
      if(!key) return;
      const host = cast.find(o=> o!==c && ROLE_WORDS[key].test(o.role));
      if(host){ newScenes.forEach(s=>{ if(s.driver===c.id) s.driver = host.id; }); drop.push(c.id); }
      else if(!c.role){ c.role = titleCase(key); }   // lone role-named member: at least label its role
    });
    if(drop.length) cast = cast.filter(c=> drop.indexOf(c.id)<0);
  })();
  ctx.model.characters = cast;
  // auto-populate Art Room visual fields: deterministic defaults instantly, so
  // character sheets are never empty when the user opens The Art Room
  if(typeof window.charVisualDefaults==="function"){
    cast.forEach(c=>{ Object.assign(c, window.charVisualDefaults(c)); });
  }
  ctx.sync();
  ctx.emit({k:"ok", t:"Built "+newScenes.length+" scenes"+(world?", plus the premise, controlling idea, setting and cast":"")+". Now writing each scene \u2014 beats first, then the screenplay \u2014 threading continuity scene to scene."});

  // ---- seamlessly author beats + script for every scene (no manual Auto-draft needed) ----
  const author = window.aiAuthorScene, draft = window.aiDraftScene;
  let written = 0;
  for(let i=0;i<ctx.model.scenes.length;i++){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped \u2014 "+written+" of "+ctx.model.scenes.length+" scenes written. Run again to finish."}); return; }
    const s = ctx.model.scenes[i];
    const prev = i>0 ? ctx.model.scenes[i-1] : null;
    ctx.emit({k:"act", t:"Writing Sc "+s.no+" \u201c"+s.title+"\u201d \u2014 "+(i+1)+" of "+ctx.model.scenes.length+"\u2026"});
    let scn = s, beats = ctx.model.beats[s.id];
    try{
      if(!beats && typeof author==="function"){
        const authored = await author(s, prev, ctx.model.characters);
        if(authored){ scn = {...s, ...authored.patch}; beats = authored.beats;
          ctx.model.scenes[i] = scn; ctx.model.beats[s.id] = authored.beats; }
      }
      const res = (typeof draft==="function") ? await draft(scn, beats, prev) : null;
      if(res){ ctx.model.drafts[s.id] = res; written++; }
      ctx.sync();
    }catch(e){ /* keep going — one bad scene shouldn't stop the film */ }
  }
  ctx.sync();
  ctx.emit({k:"ok", t:"Wrote "+written+" of "+ctx.model.scenes.length+" scenes \u2014 beats and screenplay are in place."});

  // ---- draft each character's psychology (want / need / arc) so the cast isn't blank ----
  if(ctx.ai.available && typeof window.aiCastPsychology==="function" && ctx.model.characters && ctx.model.characters.length){
    ctx.emit({k:"act", t:"Drafting the cast's inner life \u2014 conscious want, unconscious need and arc\u2026"});
    try{
      const psych = await window.aiCastPsychology(ctx.model.characters, ctx.model.scenes, ctx.model.project);
      if(psych){ ctx.model.characters = ctx.model.characters.map(c=> psych[c.id] ? {...c, ...psych[c.id]} : c);
        ctx.sync(); ctx.emit({k:"ok", t:"Every character now has a want, a need and an arc \u2014 visible in the Cast panel."}); }
    }catch(e){ /* arc still derives from the spine even without this */ }
  }

  // ---- design the cast's visual bible so The Art Room sheets arrive pre-filled ----
  if(ctx.ai.available && typeof window.aiCastVisualBible==="function" && ctx.model.characters && ctx.model.characters.length){
    ctx.emit({k:"act", t:"Designing the cast's visual bible for The Art Room \u2014 look, wardrobe, palette\u2026"});
    try{
      const bible = await window.aiCastVisualBible(ctx.model.characters, ctx.model.scenes, ctx.model.project);
      if(bible){ ctx.model.characters = ctx.model.characters.map(c=> bible[c.id] ? {...c, ...bible[c.id]} : c);
        ctx.sync(); ctx.emit({k:"ok", t:"Character sheets are ready in The Art Room \u2014 body, two wardrobe states, palette and a master grid prompt each."}); }
    }catch(e){ /* deterministic defaults already populated the sheets */ }
  }
  ctx.emit({k:"done", t:'\u201c'+spine.title+'\u201d is fully written. Open the Script view to read it, or the Spine to see the charge graph.'});
}

/* =========================================================
   AGENT 4 — TABLE-READ  (whole-script critique, read-only)
   ========================================================= */
async function agentTableRead(ctx){
  const drafted = ctx.model.scenes.filter(s=>ctx.model.drafts[s.id]).length;
  if(!drafted){ ctx.emit({k:"flag", t:"No scenes are drafted yet. Draft some scenes (or Auto-draft all), then run the table-read."}); ctx.emit({k:"done",t:"Nothing to read."}); return; }
  if(!ctx.ai.available){ ctx.emit({k:"flag", t:"The model isn't available, so a table-read can't run here."}); ctx.emit({k:"done",t:"Aborted."}); return; }
  ctx.emit({k:"plan", t:"Reading all "+drafted+" drafted scenes end-to-end \u2014 looking for pacing, tone, and voice issues that only show across the whole script."});
  ctx.emit({k:"act", t:"Performing the table-read\u2026"});
  const rep = await ctx.ai.tableRead(ctx.model.scenes, ctx.model.drafts);
  if(ctx.cancelled()) return;
  if(!rep){ ctx.emit({k:"flag", t:"The model didn't return a usable report. Try again."}); ctx.emit({k:"done",t:"Aborted."}); return; }
  ctx.emit({k:"report", t:"Table-read complete.", report:rep});
  ctx.emit({k:"done", t:rep.notes.length+" specific notes flagged. Click a note to jump to that scene."});
}

/* =========================================================
   AGENT 5 — STORYBOARD DIRECTOR  (Art Room, autonomous)
   Boards the whole film: per scene-page it (a) asks the writing model to think through
   the panels into an optimized single-sheet prompt, then (b) renders the composite sheet
   with GPT Image 2. Runs on its own (no per-sheet approval); cancellable via Stop. Reads
   a dedicated ctx.art surface (pages + the two tools) — never touches ctx.model.
   ========================================================= */
async function agentStoryboardDirector(ctx){
  const art = ctx.art;
  if(!art || !art.pages || !art.pages.length){
    ctx.emit({k:"flag", t:"No shots to board yet. Break your scenes into shots in the Shot List, then run the Director."});
    ctx.emit({k:"done", t:"Nothing to board."}); return;
  }
  if(!art.gpt2Available){
    ctx.emit({k:"flag", t:"GPT Image 2 isn't available right now — it runs through the server image proxy. Sign in / enable the proxy and try again."});
    ctx.emit({k:"done", t:"Aborted."}); return;
  }
  const pages = art.pages, N = pages.length;
  ctx.emit({k:"plan", t:"Directing "+N+" storyboard sheet"+(N>1?"s":"")+" — one composite per scene, boarded as a CONTINUOUS film: each scene is thought through with the writing model, then rendered with GPT Image 2 using the previous scene's sheet as a visual anchor so the cast, world and grade carry forward."});
  let rendered=0, skipped=0;
  let prevSheetUrl=null;   // chained continuity anchor — the previous scene's rendered sheet
  let memo="";             // running continuity memo (established cast looks, world, grade)
  for(let i=0;i<N;i++){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+rendered+" of "+N+" sheets rendered."}); return; }
    const p = pages[i];
    const label = "Sc "+p.scene.no+" “"+(p.scene.title||"Untitled")+"”"+(p.pageCount>1?(" · page "+(p.index+1)+"/"+p.pageCount):"");

    // (a) think — optimized prompt + updated memo from the writing model (fallback to deterministic)
    let prompt = null, notes = null;
    if(ctx.ai && ctx.ai.available){
      ctx.emit({k:"act", t:"Thinking through the panels for "+label+" — beats, blocking, camera"+(prevSheetUrl?", continuity with the last scene":"")+"…"});
      try{ const dn = await art.directorNotes(p, memo); if(dn && dn.prompt){ prompt = dn.prompt; notes = dn.notes; if(dn.memo) memo = dn.memo; } }catch(e){}
    }
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+rendered+" of "+N+" sheets rendered."}); return; }
    if(!prompt){ prompt = art.buildPrompt(p); }
    // bake the cross-scene continuity block (prev-sheet anchor note + running memo) onto the prompt
    prompt = art.withContinuity(prompt, memo, !!prevSheetUrl);
    ctx.emit({k:"observe", t:label+" — "+p.shots.length+" panel"+(p.shots.length!==1?"s":"")+(prevSheetUrl?" · continuing from the previous sheet":"")+(notes?(" · "+notes):"")});

    // (b) render + commit the composite sheet, chaining the previous sheet as the anchor
    ctx.emit({k:"act", t:"Rendering "+label+" with GPT Image 2…"});
    try{
      const url = await art.renderSheet(p, prompt, prevSheetUrl);
      prevSheetUrl = url;   // this sheet becomes the next scene's continuity anchor
      rendered++;
      ctx.emit({k:"ok", t:"Rendered "+label+". "+rendered+" of "+N+" done."});
    }catch(e){
      skipped++;
      ctx.emit({k:"flag", t:"Couldn't render "+label+": "+((e&&e.message)||e)+". Moving on."});
    }
  }
  ctx.emit({k:"done", t:"Directed "+rendered+" sheet"+(rendered!==1?"s":"")+(skipped?(", "+skipped+" skipped"):"")+" as a continuous board. Sheets are managed per-card in the Storyboard — Clear or Regenerate any to revise."});
}

const AGENTS = [
  { id:"doctor", name:"Story Doctor", icon:"stethoscope", kind:"fix",
    blurb:"Scans the spine for the weakest link \u2014 scenes that don't turn, soft peaks, flat runs \u2014 and proposes a fix for each, re-auditing until the spine holds.",
    run:agentStoryDoctor },
  { id:"continuity", name:"Continuity Repair", icon:"link", kind:"fix",
    blurb:"Runs the continuity check, then plants missing setups and pays off dangling threads \u2014 re-checking after each repair until it's clean.",
    run:agentContinuityRepair },
  { id:"adapt", name:"Adaptation", icon:"flask", kind:"build", needsInput:true, ideaStarters:true,
    inputLabel:"Logline or synopsis", inputPlaceholder:"e.g. A lighthouse keeper discovers the fog is erasing the town's memories \u2014 including her own.",
    blurb:"Give it a logline and it architects a whole three-act spine \u2014 scenes, charges, beats, and screenplay, all written automatically. Blank page \u2192 finished draft.",
    run:agentAdaptation },
  { id:"tableread", name:"Table-Read", icon:"film", kind:"report",
    blurb:"Reads every drafted scene end-to-end and reports pacing, tone, and voice issues across the whole script \u2014 not scene by scene.",
    run:agentTableRead },
  { id:"director", name:"Storyboard Director", icon:"board", kind:"build", room:"art", autonomous:true,
    blurb:"Boards your film scene by scene \u2014 it thinks through each sheet's panels with the writing model, then renders the whole storyboard sheet with GPT Image 2. Runs on its own; press Stop anytime.",
    run:agentStoryboardDirector },
];
window.AGENTS = AGENTS;
window.auditSpine = auditSpine;
