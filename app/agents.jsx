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

/* the audit rule is the FRAMEWORK's (frameworks.jsx via window.turnInfo) — no
   second copy of the three-act arithmetic here; inline body = safety fallback */
function sd_turnInfo(s){
  if(typeof window.turnInfo==="function"){ try{ return window.turnInfo(s); }catch(e){} }
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
  // 4) one-sided argument \u2014 4+ consecutive scenes arguing the SAME side of the
  //    controlling idea (explicit scene.argues, or derived from the closing charge
  //    via themeArgues). A story argues both sides; a one-sided stretch is a sermon.
  {
    let run = [];
    const flag = ()=>{
      if(run.length<4) return false;
      const side = themeArgues(run[0]).side;
      const mid = run[Math.floor(run.length/2)];
      issues.push({ kind:"themerun", sceneId:mid.id, sceneNo:mid.no, sev:0, side,
        runFrom:run[0].no, runTo:run[run.length-1].no,
        msg:"Scenes "+run[0].no+"\u2013"+run[run.length-1].no+" all argue the "
          +(side==="idea"?"idea":"counter-idea")+" \u2014 "+run.length
          +" scenes with no answer from the other side. The argument flattens into a sermon." });
      return true;
    };
    for(const s of scenes){
      const side = themeArgues(s).side;
      if(side==="neither"){ if(flag()) break; run = []; continue; }
      if(run.length && themeArgues(run[0]).side!==side){ if(flag()) break; run = []; }
      run.push(s);
    }
    if(!issues.some(i=>i.kind==="themerun")) flag();
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
  ctx.emit({k:"plan", t:"Scanning all "+ctx.model.scenes.length+" scenes for the weakest structural link \u2014 scenes that don't turn, soft peaks, flat runs, and one-sided stretches of the controlling idea's argument."});
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
    } else if(issue.kind==="themerun"){
      // one-sided argument — flip the middle scene of the run to argue the other side
      const opp = issue.side==="idea" ? "counter" : "idea";
      const cc = opp==="idea" ? Math.max(2, Math.abs(scene.closeCharge)) : Math.min(-2, -Math.abs(scene.closeCharge));
      fix = { closeValue:scene.closeValue, closeCharge:cc,
        // an explicit override must flip too, or the re-charge wouldn't change the argument
        argues: themeArgues(scene).explicit ? opp : undefined,
        rationale:"Scenes "+issue.runFrom+"\u2013"+issue.runTo+" argue only the "
          +(issue.side==="idea"?"idea":"counter-idea")
          +". Flip this one so the other side answers back \u2014 the controlling idea stays an argument, not a sermon." };
    } else { // monotony — nudge the middle scene to break the run
      const cc = -Math.sign(scene.closeCharge)*2;
      fix = { closeValue:scene.closeValue, closeCharge:cc, rationale:"Push this scene to the opposite pole to break the flat run and restore contrast." };
    }

    const sideLabel = (s)=> s==="idea" ? "the idea" : s==="counter" ? "the counter-idea" : "neither side";
    const ok = await ctx.propose({
      title:"Re-charge Scene "+scene.no+" \u2014 "+scene.title,
      reason:issue.msg,
      rationale:fix.rationale,
      before: issue.kind==="themerun"
        ? "Argues "+sideLabel(themeArgues(scene).side)+" \u00b7 closes "+scene.closeValue+" ("+chargeStr(scene.closeCharge)+")"
        : scene.openValue+" ("+chargeStr(scene.openCharge)+") \u2192 "+scene.closeValue+" ("+chargeStr(scene.closeCharge)+")",
      after: issue.kind==="themerun"
        ? "Argues "+sideLabel(issue.side==="idea"?"counter":"idea")+" \u00b7 closes "+fix.closeValue+" ("+chargeStr(fix.closeCharge)+")"
        : scene.openValue+" ("+chargeStr(scene.openCharge)+") \u2192 "+fix.closeValue+" ("+chargeStr(fix.closeCharge)+")",
    });
    if(ctx.cancelled()) return;
    if(ok){
      ctx.model.scenes[idx] = {...scene, closeValue:fix.closeValue, closeCharge:fix.closeCharge,
        ...(fix.argues!==undefined ? {argues:fix.argues} : {})};
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
  // voice distinctiveness pass — the sharpest note a real table-read produces:
  // lines that could swap speakers without anyone noticing
  ctx.emit({k:"act", t:"Re-reading the dialogue per character — checking every voice is distinct enough that no line could swap speakers…"});
  const vc = ctx.ai.voiceCheck ? await ctx.ai.voiceCheck(ctx.model.scenes, ctx.model.drafts) : null;
  if(ctx.cancelled()) return;
  if(vc){
    ctx.emit({k:"report", t:"Voice check complete.", voiceReport:vc});
    const n = (vc.swappable||[]).length;
    ctx.emit({k:"done", t:rep.notes.length+" note"+(rep.notes.length!==1?"s":"")+" flagged"
      +(n ? (" + "+n+" swappable line"+(n!==1?"s":"")) : " — and every voice reads distinct")
      +". Click a note to jump to its scene."});
  } else {
    ctx.emit({k:"flag", t:"Voice check skipped — it needs at least two characters with spoken lines."});
    ctx.emit({k:"done", t:rep.notes.length+" specific notes flagged. Click a note to jump to that scene."});
  }
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

/* =========================================================
   AGENT 6 — CINEMATOGRAPHER / COLORIST  (Art Room ▸ Style Bible, gated)
   The visual counterpart to the Writers' Room: reads the spine + the user's visual
   references, designs a bespoke colour-grade system (palette + film stock) WITH a stated
   rationale, color-scripts every scene along the value-charge spine, and proposes the whole
   system for approval (swatches + per-scene assignments + the "why"). Applies on accept.
   Reads ctx.art.designStyles / applyStyles — never touches ctx.model.
   ========================================================= */
async function agentColorist(ctx){
  const art = ctx.art;
  if(!ctx.ai || !ctx.ai.available){
    ctx.emit({k:"flag", t:"The writing model isn't available right now — the Colorist needs it to design the palette."});
    ctx.emit({k:"done", t:"Aborted."}); return;
  }
  if(!art || typeof art.designStyles!=="function" || !(art.scenesLite||[]).length){
    ctx.emit({k:"flag", t:"No scenes to colour yet — build the spine first, then run the Colorist."});
    ctx.emit({k:"done", t:"Nothing to grade."}); return;
  }
  ctx.emit({k:"plan", t:"Designing this film's colour system — a bespoke palette + film stock from the story and your references — then color-scripting every scene along the value-charge spine."});
  ctx.emit({k:"act", t:"Reading the spine + visual references, designing the looks…"});
  let res = null;
  try{ res = await art.designStyles(); }catch(e){}
  if(ctx.cancelled()) return;
  if(!res || !(res.presets||[]).length){
    ctx.emit({k:"flag", t:"The model didn't return a usable palette. Try again."});
    ctx.emit({k:"done", t:"Aborted."}); return;
  }
  const nP = res.presets.length, nS = Object.keys(res.sceneStyles||{}).length;
  const stock = (window.FILM_STOCKS||[]).find(f=>f.id===res.filmStock);
  ctx.emit({k:"observe", t:nP+" bespoke look"+(nP!==1?"s":"")+(stock&&stock.id!=="none"?(" · "+stock.name):"")+" · "+nS+" scene"+(nS!==1?"s":"")+" color-scripted"+((res.rationale&&res.rationale.palette)?(" — "+res.rationale.palette):"")});

  const ok = await ctx.propose({
    title:"Apply this colour system",
    reason:"Replaces the current looks with a bespoke palette and color-scripts every scene.",
    rationale: (res.rationale && res.rationale.palette) || "",
    colorProposal:{ presets:res.presets, sceneStyles:res.sceneStyles, filmStock:res.filmStock, rationale:res.rationale, scenes:art.scenesLite },
  });
  if(ctx.cancelled()) return;
  if(ok){
    art.applyStyles(res);
    if(ctx.art.markApplied) ctx.art.markApplied("colorist");
    ctx.emit({k:"ok", t:"Applied — "+nP+" look"+(nP!==1?"s":"")+", color-scripted "+nS+" scene"+(nS!==1?"s":"")+". Fine-tune any scene in the film-strip."});
  }else{
    ctx.emit({k:"flag", t:"Kept your current looks — nothing changed."});
  }
  ctx.emit({k:"done", t:"Colour pass complete."});
}

/* =========================================================
   AGENT 7 — SHOT DESIGNER  (Art Room ▸ Shot List, gated)
   The cinematographer's COVERAGE pass: audits each scene's shot list — does it establish
   wide, tighten through the middle, and LAND the turn on its most expressive size, with an
   anchor set? — and for the weakest scene proposes the coverage (per-beat size/angle/lens/
   move + the anchor) for approval. Mirrors Story Doctor's audit loop. Does NOT render: it
   locks the shot list, then hands off to "Generate all shots" (which already renders
   anchor-first). Reads ctx.art.coverage — never touches ctx.model.
   ========================================================= */
const _TIGHT_SIZES = new Set(["MCU","CU","ECU","INSERT"]);

/* find weak / missing coverage, scene by scene (mirrors auditSpine) */
function auditCoverage(scenes, shots, beatsMap){
  const issues=[];
  const byScene={}; (shots||[]).forEach(s=>{ (byScene[s.sceneId]=byScene[s.sceneId]||[]).push(s); });
  (scenes||[]).forEach(s=>{
    const bm=(beatsMap||{})[s.id]||{}; const beats=(bm.rows||[]); const ss=byScene[s.id]||[];
    const t='"'+(s.title||("Scene "+s.no))+'"';
    if(!ss.length){ issues.push({kind:"nocoverage",sceneId:s.id,sceneNo:s.no,sev:3,msg:t+" has no shots yet — it needs coverage."}); return; }
    if(beats.length && ss.length < beats.length){ issues.push({kind:"nocoverage",sceneId:s.id,sceneNo:s.no,sev:3,msg:t+" has "+ss.length+" shot"+(ss.length!==1?"s":"")+" for "+beats.length+" beats — coverage is thin."}); return; }
    const turnAt = bm.turnAt;
    if(turnAt){ const ts=ss.find(x=>x.beatN===turnAt); if(ts && !_TIGHT_SIZES.has(ts.size)){ issues.push({kind:"weakturn",sceneId:s.id,sceneNo:s.no,sev:2,msg:t+" doesn't land its turn — the turning beat is a "+ts.size+", not a tight push-in (MCU/CU/ECU)."}); return; } }
    if(ss.length>=3){ const sizes=new Set(ss.map(x=>x.size)); if(sizes.size===1){ issues.push({kind:"flatsizes",sceneId:s.id,sceneNo:s.no,sev:1,msg:t+" is all "+[...sizes][0]+" — no size progression from wide to tight."}); return; } }
    if(ss.length && !ss.some(x=>x.anchor)){ issues.push({kind:"noanchor",sceneId:s.id,sceneNo:s.no,sev:0,msg:t+" has no anchor frame set — the shots may drift apart."}); return; }
  });
  issues.sort((a,b)=>b.sev-a.sev);
  return issues;
}

async function agentShotDesigner(ctx){
  const cov = ctx.art && ctx.art.coverage;
  if(!cov || typeof cov.audit!=="function"){
    ctx.emit({k:"flag", t:"No shot data available — build the spine and beats first, then break the scenes into shots."});
    ctx.emit({k:"done", t:"Aborted."}); return;
  }
  const MAX=12, skip=new Set();
  ctx.emit({k:"plan", t:"Auditing coverage scene by scene — does each scene establish wide, tighten through the middle, and LAND its turn on its most expressive size, with an anchor set?"});
  let fixes=0;
  for(let iter=0;iter<MAX;iter++){
    if(ctx.cancelled()) return;
    const issues = cov.audit().filter(i=>!skip.has(i.sceneId));
    if(!issues.length){ ctx.emit({k:"ok", t:"Re-audit complete — every scene establishes, tightens and lands its turn. Coverage holds."}); break; }
    const issue=issues[0]; const scene=cov.sceneById(issue.sceneId);
    ctx.emit({k:"observe", t:issues.length+" coverage issue"+(issues.length>1?"s":"")+" — weakest link: Scene "+issue.sceneNo+" — "+issue.msg});
    const turnAt = cov.turnAtOf(issue.sceneId);
    let fix=null;
    if(issue.kind==="noanchor"){
      const cur = cov.shotsOf(issue.sceneId); const anchorId = cov.pickAnchor(cur);
      fix = { kind:"anchor", anchorId, list: cov.grammarList(cur, anchorId, turnAt),
        rationale:"Lock the scene to its establishing frame so every other shot matches its light, grade and world." };
    } else {
      if(!ctx.ai || !ctx.ai.available){ ctx.emit({k:"flag", t:"The model isn't available to design coverage — skipping Scene "+issue.sceneNo+"."}); skip.add(issue.sceneId); continue; }
      ctx.emit({k:"act", t:"Designing coverage for Scene "+issue.sceneNo+" — establishing, tightening, landing the turn…"});
      let made=null; try{ made = await cov.draftCoverage(scene); }catch(e){}
      if(ctx.cancelled()) return;
      if(!made || !made.length){ ctx.emit({k:"flag", t:"Couldn't design coverage for Scene "+issue.sceneNo+". Moving on."}); skip.add(issue.sceneId); continue; }
      // guarantee the turn LANDS tight: if the model left the turning beat wide, push it to a CU
      // push-in (also what resolves the weakturn audit so the loop converges, never re-proposes).
      if(turnAt){ const ti = made.findIndex(s=>s.beatN===turnAt);
        if(ti>=0 && !_TIGHT_SIZES.has(made[ti].size)){ made[ti] = {...made[ti], size:"CU", move:(made[ti].move==="static"?"push":made[ti].move) }; } }
      const anchorId = cov.pickAnchor(made);
      fix = { kind:"coverage", shots:made, anchorId, list: cov.grammarList(made, anchorId, turnAt),
        rationale:"Coverage that establishes wide, tightens through the middle, and lands the turn on its most expressive size." };
    }
    const curCount = cov.shotsOf(issue.sceneId).length;
    const ok = await ctx.propose({
      title:"Shot coverage — Scene "+issue.sceneNo+" “"+((scene&&scene.title)||"Untitled")+"”",
      reason:issue.msg + ((fix.kind==="coverage"&&curCount)?(" This REPLACES the scene's "+curCount+" current shot"+(curCount!==1?"s":"")+"."):""),
      rationale:fix.rationale,
      list:fix.list,
    });
    if(ctx.cancelled()) return;
    if(ok){
      if(fix.kind==="anchor") cov.setAnchorOnly(issue.sceneId, fix.anchorId);
      else cov.applyCoverage(issue.sceneId, fix.shots, fix.anchorId);
      fixes++;
      ctx.emit({k:"ok", t:"Applied to Scene "+issue.sceneNo+". Re-auditing…"});
    } else {
      ctx.emit({k:"flag", t:"Skipped Scene "+issue.sceneNo+"."});
      skip.add(issue.sceneId);
    }
  }
  ctx.emit({k:"done", t: fixes ? ("Designed coverage for "+fixes+" scene"+(fixes!==1?"s":"")+", anchors set. Click ‘Generate all shots’ in the Shot List to render — anchor-first.") : "No coverage changes applied." });
}

/* =========================================================
   AGENT 8 — CASTING DIRECTOR  (Art Room ▸ Characters, autonomous)
   Designs the whole cast in dependency order: per character it (1) drafts the visual spec
   from the script, (2) suggests appearance states, (3) generates the master sheet (pulling
   in already-generated prop sheets + any cameo face-lock), then (4) generates each
   appearance-state variant identity-locked off the master. Runs on its own (no approval);
   cancellable via Stop; idempotent (fills only what's missing). Reads ctx.art.cast — never
   touches ctx.model.
   ========================================================= */
async function agentCastingDirector(ctx){
  const cast = ctx.art && ctx.art.cast;
  if(!cast || !cast.list || !cast.list.length){
    ctx.emit({k:"flag", t:"No cast yet — build the spine first, then run the Casting Director."});
    ctx.emit({k:"done", t:"Nothing to cast."}); return;
  }
  const N = cast.list.length;
  ctx.emit({k:"plan", t:"Designing the cast — for each of the "+N+" character"+(N!==1?"s":"")+": draft the look, find their appearance changes, generate the master sheet (with prop + cameo references), then each state variant."});
  let specs=0, sheets=0, variants=0;
  for(const ch of cast.list){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+sheets+" sheet"+(sheets!==1?"s":"")+" generated."}); return; }
    let c = ch;
    ctx.emit({k:"act", t:"Casting "+(c.name||"a character")+"…"});

    // 1) draft the visual spec (force = re-draft even if already drafted, applying the Lookbook)
    if((ctx.force || !cast.isDrafted(c)) && ctx.ai && ctx.ai.available){
      ctx.emit({k:"act", t:(ctx.force?"Re-drafting ":"Drafting ")+(c.name||"the character")+"'s look from the script…"});
      try{ const patch = await cast.draftSpec(c); if(patch){ c = {...c, ...patch}; specs++; } }catch(e){}
    }
    if(ctx.cancelled()) return;
    if(!cast.isDrafted(c)){ ctx.emit({k:"flag", t:(c.name||"This character")+" has no spec yet (add a look in the Characters tab) — skipping."}); continue; }

    // 2) suggest appearance states if none
    if(!(c.states && c.states.length) && ctx.ai && ctx.ai.available){
      ctx.emit({k:"act", t:"Finding "+(c.name||"the character")+"'s appearance changes…"});
      try{ const sts = await cast.suggestStates(c); if(sts && sts.length){ c = {...c, states:sts}; } }catch(e){}
    }
    if(ctx.cancelled()) return;

    // 3) generate the master sheet (force = regenerate even if one exists)
    let baseUrl = ctx.force ? "" : await cast.imageOf(c.id);
    if(!baseUrl){
      ctx.emit({k:"act", t:"Generating "+(c.name||"the character")+"'s master sheet…"});
      try{ baseUrl = await cast.generateMaster(c); sheets++;
        ctx.emit({k:"ok", t:(c.name||"Character")+" — master sheet generated."}); }
      catch(e){ ctx.emit({k:"flag", t:"Couldn't generate "+(c.name||"the character")+"'s sheet: "+((e&&e.message)||e)+". Moving on."}); continue; }
    }
    if(ctx.cancelled()) return;

    // 4) generate each appearance-state variant (identity-locked off the master)
    for(const st of (c.states||[])){
      if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+sheets+" sheets, "+variants+" variants."}); return; }
      const sid = c.id+":"+st.id;
      const have = ctx.force ? "" : await cast.imageOf(sid);
      if(have) continue;
      ctx.emit({k:"act", t:"Generating "+(c.name||"the character")+" — “"+(st.label||"variant")+"”…"});
      try{ await cast.generateState(c, st, baseUrl); variants++;
        ctx.emit({k:"ok", t:(c.name||"Character")+" — “"+(st.label||"variant")+"” generated."}); }
      catch(e){ ctx.emit({k:"flag", t:"Couldn't generate "+(c.name||"the character")+" — “"+(st.label||"variant")+"”: "+((e&&e.message)||e)+"."}); }
    }
  }
  if(ctx.art.markApplied && (ctx.force||specs||sheets||variants)) ctx.art.markApplied("characters");
  ctx.emit({k:"done", t:"Cast designed — "+specs+" spec"+(specs!==1?"s":"")+" drafted, "+sheets+" master sheet"+(sheets!==1?"s":"")+", "+variants+" appearance variant"+(variants!==1?"s":"")+". Review and tweak any in the Characters tab."});
}

async function agentPropsMaster(ctx){
  const pm = ctx.art && ctx.art.propmaster;
  if(!pm){
    ctx.emit({k:"flag", t:"Props workspace unavailable."});
    ctx.emit({k:"done", t:"Nothing to do."}); return;
  }
  ctx.emit({k:"plan", t:"Mastering the props — derive every prop the script names (worn/carried by the cast + the set dressing in the action), draft each spec, dedup near-duplicates, then generate a reference sheet for each so the cast can reference them."});

  // 1) derive props from the script: cast-owned + set dressing
  ctx.emit({k:"act", t:"Reading the script for props…"});
  let castN=0, setN=0;
  try{ castN = pm.deriveCast(); }catch(e){}
  if(ctx.cancelled()) return;
  try{ setN = await pm.deriveSet(); }
  catch(e){ ctx.emit({k:"flag", t:"Couldn't derive set dressing: "+((e&&e.message)||e)}); }
  ctx.emit({k:"observe", t:"Derived "+castN+" cast prop"+(castN!==1?"s":"")+" + "+setN+" set-dressing object"+(setN!==1?"s":"")+"."});
  if(ctx.cancelled()) return;

  // 2) draft prop specs (force = re-draft ALL, applying the current Lookbook)
  ctx.emit({k:"act", t:ctx.force?"Re-drafting every prop spec from the story…":"Drafting prop specs from the story…"});
  let drafted=0;
  try{ drafted = await pm.draftSpecs(ctx.force); }
  catch(e){ ctx.emit({k:"flag", t:"Spec drafting hit an error: "+((e&&e.message)||e)}); }
  ctx.emit({k:"observe", t:drafted?("Drafted "+drafted+" spec"+(drafted!==1?"s":"")+"."):"Specs already complete."});
  if(ctx.cancelled()) return;

  // 3) dedup near-duplicates (same owner + same object) into one card each
  let merged=0;
  try{ merged = pm.dedup(); }catch(e){}
  if(merged) ctx.emit({k:"ok", t:"Merged "+merged+" near-duplicate"+(merged!==1?"s":"")+" into one card each."});
  if(ctx.cancelled()) return;

  // 4) generate sheets (force = regenerate ALL drafted props)
  let todo=[];
  try{ todo = await pm.toGenerate(ctx.force); }catch(e){}
  if(!todo.length){
    if(ctx.art.markApplied && (ctx.force||drafted)) ctx.art.markApplied("props");
    ctx.emit({k:"done", t:"Props ready — "+(castN+setN)+" derived, "+drafted+" drafted; every drafted prop already has a sheet. The cast can reference them."}); return;
  }
  ctx.emit({k:"act", t:"Generating "+todo.length+" prop sheet"+(todo.length!==1?"s":"")+"…"});
  let sheets=0;
  for(const p of todo){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+sheets+" sheet"+(sheets!==1?"s":"")+" generated."}); return; }
    ctx.emit({k:"act", t:"Generating "+(p.name||"a prop")+"'s sheet…"});
    try{ await pm.generateSheet(p); sheets++;
      ctx.emit({k:"ok", t:(p.name||"Prop")+" — sheet generated."}); }
    catch(e){ ctx.emit({k:"flag", t:"Couldn't generate "+(p.name||"the prop")+"'s sheet: "+((e&&e.message)||e)+". Moving on."}); }
  }
  if(ctx.art.markApplied && (ctx.force||drafted||sheets)) ctx.art.markApplied("props");
  ctx.emit({k:"done", t:"Props mastered — "+(castN+setN)+" derived, "+drafted+" drafted, "+sheets+" sheet"+(sheets!==1?"s":"")+" generated. The cast can now reference them."});
}

async function agentLocationScout(ctx){
  const ls = ctx.art && ctx.art.locscout;
  if(!ls){
    ctx.emit({k:"flag", t:"Locations workspace unavailable."});
    ctx.emit({k:"done", t:"Nothing to do."}); return;
  }
  ctx.emit({k:"plan", t:"Scouting the film's locations — pull every place from the sluglines, draft each one's staging + depth-grid spec, generate the plate, and add the time-of-day variants the script needs. Plus a coverage check: any scene whose slugline location has no card yet."});

  // 1) pull locations from the sluglines (and refresh existing scene lists / times)
  ctx.emit({k:"act", t:"Reading the sluglines for locations…"});
  let added=0;
  try{ added = ls.pull(); }catch(e){}
  ctx.emit({k:"observe", t:added?("Pulled "+added+" new location"+(added!==1?"s":"")+" from the script."):"Locations already pulled — refreshed their scene lists."});
  if(ctx.cancelled()) return;

  // 2) coverage check
  let gaps=[];
  try{ gaps = ls.coverage(); }catch(e){}
  if(gaps.length){
    ctx.emit({k:"flag", t:"Coverage — "+gaps.length+" scene"+(gaps.length!==1?"s":"")+" with no location card: "+
      gaps.slice(0,6).map(g=>"Sc "+String(g.no||"?")+(g.place?(" ("+g.place+")"):"")).join(", ")+(gaps.length>6?"…":"")+
      ". Their sluglines may be malformed — add a card by hand if needed."});
  } else {
    ctx.emit({k:"ok", t:"Coverage clean — every scene's slugline location has a card."});
  }
  if(ctx.cancelled()) return;

  // 3) draft the spec (force = re-draft ALL, applying the current Lookbook)
  ctx.emit({k:"act", t:ctx.force?"Re-drafting every location spec from the script…":"Drafting location specs from the script…"});
  let specs=0;
  try{ specs = await ls.draftSpecs(ctx.force); }
  catch(e){ ctx.emit({k:"flag", t:"Spec drafting hit an error: "+((e&&e.message)||e)}); }
  ctx.emit({k:"observe", t:specs?("Drafted "+specs+" spec"+(specs!==1?"s":"")+"."):"Specs already complete."});
  if(ctx.cancelled()) return;

  // 4) design the depth-grid staging
  ctx.emit({k:"act", t:"Designing the depth-grid staging…"});
  let staged=0;
  try{ staged = await ls.draftStaging(); }catch(e){}
  if(staged) ctx.emit({k:"observe", t:"Staged "+staged+" location"+(staged!==1?"s":"")+"."});
  if(ctx.cancelled()) return;

  // 5) add the time-of-day variants the script calls for (a place seen at >1 time)
  let vars=0;
  try{ vars = ls.addVariants(); }catch(e){}
  if(vars) ctx.emit({k:"ok", t:"Added "+vars+" time-of-day variant"+(vars!==1?"s":"")+" for places the script shows at more than one time."});
  if(ctx.cancelled()) return;

  // 6) generate plates, then variants (force = regenerate ALL)
  let plates=[], variants=[];
  try{ plates = await ls.toGeneratePlates(ctx.force); }catch(e){}
  try{ variants = await ls.toGenerateVariants(ctx.force); }catch(e){}
  if(!plates.length && !variants.length){
    if(ctx.art.markApplied && (ctx.force||specs)) ctx.art.markApplied("locations");
    ctx.emit({k:"done", t:"Locations ready — "+added+" pulled, "+specs+" drafted; every plate is already generated."}); return;
  }
  ctx.emit({k:"act", t:"Generating "+plates.length+" plate"+(plates.length!==1?"s":"")+(variants.length?(" + "+variants.length+" variant"+(variants.length!==1?"s":"")):"")+"…"});
  let madeP=0, madeV=0;
  for(const l of plates){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+madeP+" plate"+(madeP!==1?"s":"")+", "+madeV+" variant"+(madeV!==1?"s":"")+" generated."}); return; }
    ctx.emit({k:"act", t:"Generating "+(l.name||"a location")+"'s plate…"});
    try{ await ls.generatePlate(l); madeP++; ctx.emit({k:"ok", t:(l.name||"Location")+" — plate generated."}); }
    catch(e){ ctx.emit({k:"flag", t:"Couldn't generate "+(l.name||"the location")+"'s plate: "+((e&&e.message)||e)+". Moving on."}); }
  }
  for(const pair of variants){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+madeP+" plates, "+madeV+" variants generated."}); return; }
    const l=pair.l, v=pair.v;
    ctx.emit({k:"act", t:"Generating "+(l.name||"a location")+" — "+(v.time||"variant")+"…"});
    try{ await ls.generateVariant(l, v); madeV++; ctx.emit({k:"ok", t:(l.name||"Location")+" — "+(v.time||"variant")+" generated."}); }
    catch(e){ ctx.emit({k:"flag", t:"Couldn't generate "+(l.name||"the location")+" — "+(v.time||"variant")+": "+((e&&e.message)||e)+"."}); }
  }
  if(ctx.art.markApplied && (ctx.force||specs||madeP||madeV)) ctx.art.markApplied("locations");
  ctx.emit({k:"done", t:"Locations scouted — "+added+" pulled, "+specs+" drafted, "+madeP+" plate"+(madeP!==1?"s":"")+" + "+madeV+" variant"+(madeV!==1?"s":"")+" generated. Tweak any in the Locations tab."});
}

async function agentVisualResearcher(ctx){
  const lb = ctx.art && ctx.art.lookbook;
  if(!lb){
    ctx.emit({k:"flag", t:"Lookbook workspace unavailable."});
    ctx.emit({k:"done", t:"Nothing to do."}); return;
  }
  if(!ctx.ai || !ctx.ai.available){
    ctx.emit({k:"flag", t:"The writing model isn't available — the Visual Researcher needs it to research the look."});
    ctx.emit({k:"done", t:"Aborted."}); return;
  }
  ctx.emit({k:"plan", t:"Researching the film's visual language — writing the look statement, gathering reference touchstones (palette, lighting, lens, texture), then rendering a mood frame for each. The colour system (Presets) reads these references when it designs the palette downstream."});

  // 1) research: statement + reference entries, written through to the Colorist
  ctx.emit({k:"act", t:"Reading the story, writing the look statement, gathering references…"});
  let res;
  try{ res = await lb.research(); }
  catch(e){ ctx.emit({k:"flag", t:"Research hit an error: "+((e&&e.message)||e)}); }
  if(res && res.statement) ctx.emit({k:"observe", t:"Look statement — "+res.statement.slice(0,150)});
  ctx.emit({k:"observe", t:(res&&res.added ? ("Gathered "+res.added+" reference"+(res.added!==1?"s":"")) : "References already gathered")+" — the colour system (Presets) reads these directly when it designs the palette."});
  if(ctx.cancelled()) return;

  // 2) render a mood frame for each drafted reference without one
  let todo=[];
  try{ todo = await lb.toGenerate(); }catch(e){}
  if(!todo.length){
    ctx.emit({k:"done", t:"Lookbook ready — references gathered; every mood frame is already rendered."}); return;
  }
  ctx.emit({k:"act", t:"Rendering "+todo.length+" mood frame"+(todo.length!==1?"s":"")+"…"});
  let made=0;
  for(const c of todo){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+made+" frame"+(made!==1?"s":"")+" rendered."}); return; }
    ctx.emit({k:"act", t:"Rendering "+(c.source||"a reference")+"…"});
    try{ await lb.generateFrame(c); made++; ctx.emit({k:"ok", t:(c.source||"Reference")+" — mood frame rendered."}); }
    catch(e){ ctx.emit({k:"flag", t:"Couldn't render "+(c.source||"the reference")+": "+((e&&e.message)||e)+"."}); }
  }
  ctx.emit({k:"done", t:"Lookbook complete — "+((res&&res.added)||0)+" references, "+made+" mood frame"+(made!==1?"s":"")+" rendered. The look now guides the colour system."});
}

async function agentDepartmentCoordinator(ctx){
  // The meta-agent: chains the six Art Room agents in dependency order. The four
  // autonomous ones (Props, Characters, Locations, Storyboard) run hands-off; the two
  // approval-gated ones (Colour, Shots) pause at their proposal cards and resume on your yes.
  const steps = [
    ["Lookbook",   agentVisualResearcher],
    ["Props",      agentPropsMaster],
    ["Characters", agentCastingDirector],
    ["Locations",  agentLocationScout],
    ["Colour",     agentColorist],
    ["Shots",      agentShotDesigner],
    ["Storyboard", agentStoryboardDirector],
  ];
  ctx.emit({k:"plan", t:"Running the whole pre-production pipeline in dependency order — the lookbook first (it steers the look), then props, then the cast that references them, then locations, then the colour system, then shot coverage, then the storyboard. It runs end to end WITHOUT stopping — the colour and shot-coverage steps are applied automatically, no approval needed. Press Stop anytime."});
  // each sub-agent emits its own k:"done" when its stage finishes — relabel those to k:"ok"
  // so each stage reads as one completed step and only THIS coordinator emits the final done.
  // propose() is auto-approved so the two gated steps (Colour, Shots) apply without pausing.
  const subCtx = Object.assign({}, ctx, {
    emit:(e)=> ctx.emit((e && e.k==="done") ? Object.assign({}, e, {k:"ok"}) : e),
    propose:()=> Promise.resolve(true),
  });
  let n=0;
  for(const step of steps){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — completed "+n+" of "+steps.length+" steps."}); return; }
    n++;
    ctx.emit({k:"act", t:"▸ Step "+n+"/"+steps.length+" — "+step[0]+"…"});
    try{ await step[1](subCtx); }
    catch(e){ ctx.emit({k:"flag", t:step[0]+" step hit an error: "+((e&&e.message)||e)+". Continuing with the next."}); }
  }
  if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — completed "+n+" of "+steps.length+" steps."}); return; }
  ctx.emit({k:"done", t:"Pre-production complete — props, cast, locations, colour, shots and the storyboard are all built in order. Review or tweak anything in its tab."});
}

/* =========================================================
   AGENT — SCENE DIRECTOR  (Art Room ▸ Shot List, gated)
   Per docs/Scene Director Agent Plan.md: takes a scene from shot list to a
   CONSISTENT set of frames — locks the key frame (anchor), derives every
   other shot from it, visually QCs each result against the anchor, and
   repairs the drifted ones with bounded corrective regenerations. A plan
   gate (propose) sits BEFORE every scene's spend. Reads ctx.art:
   { scenes:[{scene,shots,ctx}], frameOf(id), shotFrame(sh,shots,ctx,opts),
     qc(sh,frameUrl,anchorUrl) }.
   ========================================================= */
async function agentSceneDirector(ctx){
  const art = ctx.art;
  const MAX_GENS = 24, MAX_REPAIRS = 2;
  if(!art || !art.scenes || !art.scenes.length){
    ctx.emit({k:"flag", t:"No shots to direct yet — break your scenes into shots in the Shot List first."});
    ctx.emit({k:"done", t:"Nothing to direct."}); return;
  }
  let gens = 0, qcDown = false;
  ctx.emit({k:"plan", t:"Directing "+art.scenes.length+" scene"+(art.scenes.length>1?"s":"")
    +" — per scene: lock the KEY FRAME, derive every other shot from it, visually inspect each result against the anchor, repair drift (max "+MAX_REPAIRS+" per shot). Capped at "+MAX_GENS+" generations this run."});
  for(const grp of art.scenes){
    if(ctx.cancelled()) return;
    const { scene, shots } = grp, sctx = grp.ctx;
    const no = (i)=> scene.no+"."+(i+1);
    const anchorSh = shots.find(s=>s.anchor) || shots[0];
    const others = shots.filter(s=>s!==anchorSh);
    const haveAnchor = !!(await art.frameOf(anchorSh.id));
    const missing = [];
    for(const s of others){ if(!(await art.frameOf(s.id))) missing.push(s); }
    const planned = (haveAnchor?0:1) + missing.length;
    // PLAN GATE — generation costs money; ask before spending on this scene
    const ok = await ctx.propose({
      title:"Direct Scene "+scene.no+" — "+(scene.title||"Untitled"),
      reason:(haveAnchor ? "The key frame exists" : "The key frame is missing — it generates first")
        +" · "+missing.length+" frame"+(missing.length!==1?"s":"")+" to generate · then visual QC of every shot with up to "+MAX_REPAIRS+" repairs per drifted frame.",
      rationale:"Roughly "+Math.max(planned,1)+"–"+(planned+Math.min(others.length,4))+" image generations. Every frame is version-committed — each change is revertible on its card.",
      before: shots.length+" shots · "+(shots.length-missing.length-(haveAnchor?0:1))+" frame"+((shots.length-missing.length)!==1?"s":"")+" already exist",
      after:  "All "+shots.length+" frames generated, inspected against the key frame, drifted ones repaired",
    });
    if(ctx.cancelled()) return;
    if(!ok){ ctx.emit({k:"flag", t:"Skipped Scene "+scene.no+"."}); continue; }
    // 1) ANCHOR — the scene's look-master
    if(!haveAnchor){
      if(gens>=MAX_GENS){ ctx.emit({k:"flag", t:"Generation cap reached — stopping."}); break; }
      ctx.emit({k:"act", t:"Scene "+scene.no+": generating the KEY FRAME — shot "+no(shots.indexOf(anchorSh))+", locked hard to the location coverage sheet…"});
      try{ await art.shotFrame(anchorSh, shots, sctx, {}); gens++; ctx.emit({k:"ok", t:"Key frame locked."}); }
      catch(e){ ctx.emit({k:"flag", t:"Key frame failed: "+((e&&e.message)||e)+". Skipping this scene."}); continue; }
    }
    const anchorUrl = await art.frameOf(anchorSh.id);
    // 2) SEQUENCE — derive the missing shots from the key frame
    for(const s of missing){
      if(ctx.cancelled()) return;
      if(gens>=MAX_GENS){ ctx.emit({k:"flag", t:"Generation cap reached — stopping."}); break; }
      ctx.emit({k:"act", t:"Deriving "+no(shots.indexOf(s))+" from the key frame ("+(typeof shotGrammarLabel==="function"?shotGrammarLabel(s):"")+")…"});
      try{ await art.shotFrame(s, shots, sctx, {}); gens++; }
      catch(e){ ctx.emit({k:"flag", t:no(shots.indexOf(s))+" failed: "+((e&&e.message)||e)+". Moving on."}); }
    }
    // 3) QC — look at every non-anchor frame against the key frame
    const flagged = []; let repaired = 0;
    if(!qcDown && art.qc){
      for(const s of others){
        if(ctx.cancelled()) return;
        const u = await art.frameOf(s.id); if(!u) continue;
        ctx.emit({k:"act", t:"QC: inspecting "+no(shots.indexOf(s))+" against the key frame…"});
        let v = null; try{ v = await art.qc(s, u, anchorUrl); }catch(e){}
        if(v && v.unsupported){ qcDown = true;
          ctx.emit({k:"flag", t:"Visual QC unavailable — the image-proxy needs a redeploy to accept image inputs on its text task (supabase functions deploy image-proxy). Frames are generated; QC and repair skipped."});
          break; }
        if(!v){ ctx.emit({k:"flag", t:"No QC verdict for "+no(shots.indexOf(s))+" — leaving the frame as is."}); continue; }
        if(v.overall==="fail"){ flagged.push({ s, v });
          ctx.emit({k:"observe", t:"Drift in "+no(shots.indexOf(s))+": "+(v.issues||[]).slice(0,2).map(i=>i.dim+" — "+i.reason).join("; ")}); }
        else ctx.emit({k:"ok", t:no(shots.indexOf(s))+" consistent"+(v.overall==="minor"?" (minor notes)":"")+"."});
      }
    }
    // 4) REPAIR — bounded corrective regenerations
    for(const f of flagged){
      let fixed = false;
      for(let r=0; r<MAX_REPAIRS && !fixed; r++){
        if(ctx.cancelled()) return;
        if(gens>=MAX_GENS){ ctx.emit({k:"flag", t:"Generation cap reached — stopping repairs."}); break; }
        ctx.emit({k:"act", t:"Repairing "+no(shots.indexOf(f.s))+" — "+(f.v.fix||"re-deriving tight to the key frame")+"…"});
        try{ await art.shotFrame(f.s, shots, sctx, { correction:f.v.fix||"match the key frame's set, lighting and characters exactly" }); gens++; }
        catch(e){ ctx.emit({k:"flag", t:"Repair failed: "+((e&&e.message)||e)}); break; }
        const u2 = await art.frameOf(f.s.id);
        let v2 = null; try{ v2 = await art.qc(f.s, u2, anchorUrl); }catch(e){}
        if(!v2 || v2.unsupported || v2.overall!=="fail"){ fixed = true; repaired++; ctx.emit({k:"ok", t:no(shots.indexOf(f.s))+" repaired."}); }
        else f.v = v2;
      }
      if(!fixed) ctx.emit({k:"flag", t:no(shots.indexOf(f.s))+" still drifts after "+MAX_REPAIRS+" repairs — needs your eye (its card has Edit frame / Generate fresh sample, and every version is revertible)."});
    }
    ctx.emit({k:"ok", t:"Scene "+scene.no+" directed — "+shots.length+" frames"
      +(repaired?(", "+repaired+" repaired"):"")
      +((flagged.length-repaired)>0?(", "+(flagged.length-repaired)+" still flagged"):"")+"."});
  }
  ctx.emit({k:"done", t:"Direction complete — "+gens+" generation"+(gens!==1?"s":"")+" spent"
    +(qcDown?" (visual QC was unavailable — redeploy the image-proxy to enable it)":"")
    +". Review flagged frames in the Shot List; every change is revertible per card."});
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
  { id:"colorist", name:"Cinematographer", icon:"palette", kind:"build", room:"art",
    blurb:"Designs your film's colour system \u2014 a bespoke palette + film stock from the story and your visual references \u2014 then color-scripts every scene along the value-charge spine and shows you why, for your approval.",
    run:agentColorist },
  { id:"shotdesigner", name:"Shot Designer", icon:"film", kind:"build", room:"art",
    blurb:"Audits your coverage scene by scene \u2014 does each scene establish wide, tighten, and land its turn on its most expressive size? \u2014 and proposes the shots (and the anchor) to fix it, for your approval. Then hand off to \u2018Generate all shots\u2019.",
    run:agentShotDesigner },
  { id:"casting", name:"Casting Director", icon:"userScan", kind:"build", room:"art", autonomous:true,
    blurb:"Designs your whole cast on its own \u2014 drafts each character's look, finds their appearance changes, then generates the master sheet (with prop + cameo references) and every state variant. Runs autonomously; press Stop anytime.",
    run:agentCastingDirector },
  { id:"propsmaster", name:"Props Master", icon:"box", kind:"build", room:"art", autonomous:true,
    blurb:"Derives every prop the script names \u2014 worn/carried by the cast plus the set dressing in the action \u2014 drafts each spec, dedups near-duplicates, and generates the reference sheets, so they're ready before the cast. Runs autonomously; press Stop anytime.",
    run:agentPropsMaster },
  { id:"researcher", name:"Visual Researcher", icon:"image", kind:"build", room:"art", autonomous:true,
    blurb:"Builds the film's lookbook on its own — writes the visual statement, gathers reference touchstones (palette, lighting, lens, texture), and renders a mood frame for each. The colour system (Presets) reads these references when it designs the palette, so the whole look is built from one brief. Runs autonomously; press Stop anytime.",
    run:agentVisualResearcher },
  { id:"locscout", name:"Location Scout", icon:"globe", kind:"build", room:"art", autonomous:true,
    blurb:"Scouts your film's locations on its own \u2014 pulls every place from the sluglines, drafts each one's staging + depth-grid spec, generates the plate, and adds the time-of-day variants the script calls for. Also flags any scene whose slugline location has no card yet. Runs autonomously; press Stop anytime.",
    run:agentLocationScout },
  { id:"scenedirector", name:"Scene Director", icon:"clapper", kind:"build", room:"art",
    blurb:"Takes a scene from shot list to a CONSISTENT set of frames: locks the key frame, derives every other shot from it, visually inspects each result against the anchor, and repairs the drifted ones — asking before it spends on each scene.",
    run:agentSceneDirector },
  { id:"coordinator", name:"Art Department Coordinator", icon:"robot", kind:"build", room:"art", autonomous:true,
    blurb:"Runs your whole pre-production in the right order, on its own \u2014 props, then the cast that references them, then locations, then the colour system, then shot coverage, then the storyboard. One click = 'do my pre-production', end to end with no stops: the colour and shot-coverage steps are applied automatically rather than waiting for approval. Press Stop anytime.",
    run:agentDepartmentCoordinator },
];
window.AGENTS = AGENTS;
window.auditSpine = auditSpine;
window.auditCoverage = auditCoverage;
