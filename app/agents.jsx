/* agents.jsx — bounded-loop AI agents for Cinema Machine.
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
/* derive the major plot-point kinds from position in the FRAMEWORK's structure:
   three-act gets the classic labels (Inciting Incident, Act Climax, Midpoint,
   Crisis, Story Climax, Resolution); Kishōtenketsu gets its movements (Planting,
   Deepening, The Twist, Recontextualization, Reconciliation). */
function assignPlotPoints(scenes){
  scenes.forEach(s=>{ s.kind = "normal"; s.plot = ""; });
  const idxByAct = (act)=> scenes.map((s,i)=>s.act===act?i:-1).filter(i=>i>=0);
  const set = (i,k)=>{ if(i>=0 && i<scenes.length) scenes[i].kind = k; };
  const fw = (typeof frameworkOf==="function") ? frameworkOf(window.turnProject) : null;
  if(fw && fw.id==="herosjourney"){
    const h1=idxByAct(1), h2=idxByAct(2), h3=idxByAct(3);
    const used = new Set();
    const mark = (i,k)=>{ if(i>=0 && !used.has(i)){ set(i,k); used.add(i); } };
    if(h1.length){
      mark(h1[0],"ordinary-world");
      if(h1.length>=2) mark(h1[h1.length-1],"threshold");
      if(h1.length>=3) mark(h1[Math.floor((h1.length-1)/2)],"call");
      if(h1.length>=4) mark(h1[Math.floor((h1.length-1)/2)+1],"refusal");
      if(h1.length>=5) mark(h1[h1.length-2],"mentor");
    }
    if(h2.length){
      const mid = h2[Math.floor((h2.length-1)/2)];
      mark(mid,"ordeal");
      if(h2.length>=2) mark(h2[h2.length-1],"road-back");
      if(h2.length>=3) mark(h2[0],"tests");
      const mi = h2.indexOf(mid);
      if(mi>0) mark(h2[mi-1],"approach");
      if(mi>=0 && mi<h2.length-1) mark(h2[mi+1],"reward");
    }
    if(h3.length===1) mark(h3[0],"resurrection");
    else if(h3.length>=2){ mark(h3[h3.length-1],"elixir"); mark(h3[h3.length-2],"resurrection"); }
    scenes.forEach(s=>{ if(s.kind!=="normal") return;
      s.plot = s.act===1 ? "Departure" : s.act===2 ? "Trials" : "Return"; });
    return scenes;
  }
  if(fw && fw.id==="storycircle"){
    const c1=idxByAct(1), c2=idxByAct(2), c3=idxByAct(3), c4=idxByAct(4);
    if(c1.length){ set(c1[0],"you"); if(c1.length>=2) set(c1[c1.length-1],"need"); }
    if(c2.length){ set(c2[0],"go"); if(c2.length>=2) set(c2[c2.length-1],"search"); }
    if(c3.length===1) set(c3[0],"take");
    else if(c3.length>=2){ set(c3[0],"find"); set(c3[c3.length-1],"take"); }
    if(c4.length){ if(c4.length>=2) set(c4[0],"return"); set(c4[c4.length-1],"change"); }
    scenes.forEach(s=>{ if(s.kind!=="normal") return;
      s.plot = s.act===1 ? "Comfort" : s.act===2 ? "Searching" : s.act===3 ? "The Price" : "Coming Home"; });
    return scenes;
  }
  if(fw && fw.id==="kishotenketsu"){
    const k1=idxByAct(1), k2=idxByAct(2), k3=idxByAct(3), k4=idxByAct(4);
    if(k1.length) set(k1[0],"plant");
    if(k2.length) set(k2[k2.length-1],"deepen");
    if(k3.length){ set(k3[0],"ten"); k3.slice(1).forEach(i=>set(i,"re-read")); }
    if(k4.length) set(k4[k4.length-1],"ketsu");
    scenes.forEach(s=>{ if(s.kind!=="normal") return;
      s.plot = s.act===1 ? "Planting" : s.act===2 ? "Deepening" : s.act===3 ? "Re-reading" : "Settling"; });
    return scenes;
  }
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
  const _kisho = (typeof frameworkOf==="function") && frameworkOf(window.turnProject).id==="kishotenketsu";
  scenes.forEach(s=>{ if(sd_turnInfo(s).flagged)
    issues.push({ kind:"noturn", sceneId:s.id, sceneNo:s.no, sev:2,
      msg: _kisho
        ? '"'+s.title+'" sits flat ('+chargeStr(s.openCharge)+" \u2192 "+chargeStr(s.closeCharge)+") \u2014 it neither plants, deepens, nor shifts the pattern. It's inert."
        : '"'+s.title+'" opens and closes on the same charge ('+chargeStr(s.openCharge)+" \u2192 "+chargeStr(s.closeCharge)+") \u2014 it doesn't turn." }); });
  // 2) flat peaks — framework-specific. Three-act: a big-beat scene that lands
  // soft. Kishōtenketsu: only the TEN must land hard — a soft ten can't re-read
  // anything (ki/shō scenes are ALLOWED to be quiet).
  if(_kisho){
    scenes.forEach(s=>{
      const isTen = s.kind==="ten" || (Number(s.act)===3 && ["crisis","story-climax"].includes(s.kind));
      const delta = Math.abs(s.closeCharge - s.openCharge);
      const flip = Math.sign(s.openCharge)!==Math.sign(s.closeCharge);
      if(isTen && !flip && delta<2)
        issues.push({ kind:"weakpeak", sceneId:s.id, sceneNo:s.no, sev:1,
          msg:'"'+s.title+'" is the TEN but barely shifts ('+chargeStr(s.openCharge)+" \u2192 "+chargeStr(s.closeCharge)+"). The twist must break the pattern hard enough to make the audience re-read everything before it." });
    });
  } else {
    const bigKinds = (typeof fwAuditOf==="function" && fwAuditOf().bigKinds) || ["midpoint","story-climax","act-climax","crisis"];
    scenes.forEach(s=>{
      const big = bigKinds.includes(s.kind);
      if(big && Math.abs(s.closeCharge)<2 && !sd_turnInfo(s).flagged)
        issues.push({ kind:"weakpeak", sceneId:s.id, sceneNo:s.no, sev:1,
          msg:'"'+s.title+'" is a '+(KIND_LABEL[s.kind]||s.kind)+" but lands soft (close "+chargeStr(s.closeCharge)+"). A peak should hit \u00b13." });
    });
  }
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
  const _fwDoc = (typeof frameworkOf==="function") ? frameworkOf(window.turnProject) : null;
  ctx.emit({k:"plan", t:"Scanning all "+ctx.model.scenes.length+" scenes for the weakest structural link \u2014 "
    +((_fwDoc && _fwDoc.id!=="threeact" && _fwDoc.doctorCriteria) ? _fwDoc.doctorCriteria
      : "scenes that don't turn, soft peaks, flat runs, and one-sided stretches of the controlling idea's argument")+"."});
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

    // Kishōtenketsu: quiet ki/shō scenes are never forced to "turn" — the Doctor
    // reports the inert scene and leaves the re-charge to the writer.
    if(_fwDoc && _fwDoc.id==="kishotenketsu" && issue.kind==="noturn" && Number(scene.act)<3){
      ctx.emit({k:"flag", t:"Scene "+scene.no+" is inert — but ki/shō scenes aren't forced to turn in kishōtenketsu. Give it something to plant or deepen; noting it for your pass, not re-charging it."});
      skip.add(scene.id); continue;
    }

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
  // Kishōtenketsu's real audit is semantic — put the re-read question to the model
  // and report prose findings (docs/Frameworks Plan.md, Phase 3).
  if(_fwDoc && _fwDoc.id==="kishotenketsu" && ctx.ai.available && typeof window.aiTenReRead==="function" && !ctx.cancelled()){
    ctx.emit({k:"act", t:"Re-reading the story with the ten in mind — what recontextualizes, and what doesn't?"});
    let rr=null; try{ rr = await window.aiTenReRead(ctx.model.scenes); }catch(e){}
    if(ctx.cancelled()) return;
    if(rr){
      if(rr.verdict) ctx.emit({k:"observe", t:rr.verdict});
      (rr.hits||[]).forEach(h=>ctx.emit({k:"ok", t:"Scene "+h.scene+" re-reads — "+h.how}));
      (rr.misses||[]).forEach(m=>ctx.emit({k:"flag", t:"Scene "+m.scene+" doesn't re-read — "+m.why}));
      if(!(rr.misses||[]).length) ctx.emit({k:"ok", t:"The ten earns its re-read — every scene before it means something new."});
    } else {
      ctx.emit({k:"flag", t:"Couldn't put the re-read question to the model — run the Doctor again when the engine is reachable."});
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
  const _fwA = (typeof frameworkOf==="function") ? frameworkOf(window.turnProject) : null;
  const _kishoA = !!(_fwA && _fwA.id==="kishotenketsu");
  ctx.emit({k:"plan", t: _kishoA
    ? "Designing a complete kish\u014dtenketsu spine from your logline \u2014 four movements (ki \u00b7 sh\u014d \u00b7 ten \u00b7 ketsu), with a value charge tracing each scene's movement."
    : "Designing a complete three-act spine from your logline \u2014 scenes, acts, and a value charge for each that turns."});
  ctx.emit({k:"act", t:"Generating the scene breakdown\u2026"});
  const spine = await ctx.ai.buildSpine(brief);
  if(ctx.cancelled()) return;
  if(!spine){ ctx.emit({k:"flag", t:"The model didn't return a usable spine. Try a more concrete logline."}); ctx.emit({k:"done",t:"Aborted."}); return; }
  const turns = spine.scenes.filter(s=> Math.sign(s.openCharge)!==Math.sign(s.closeCharge) || Math.abs(s.closeCharge-s.openCharge)>=2).length;
  const _actsN = _fwA ? Object.keys(_fwA.acts).length : 3;
  const _isNew = !(ctx.model.scenes||[]).length;   // a fresh project has nothing to replace
  ctx.emit({k:"observe", t:'"'+spine.title+'" \u2014 '+spine.scenes.length+" scenes across "+_actsN+" "+(_kishoA?"movements":"acts")+", "+turns+" of them "+(_kishoA?"moving":"turning")+". Review below before it "+(_isNew?"becomes your project.":"replaces the current project.")});

  const ok = await ctx.propose({
    title:(_isNew?"Create the project \u201c":"Replace the project with \u201c")+spine.title+"\u201d",
    reason:_isNew
      ? "This builds the whole spine from your logline, then writes every scene's beats and screenplay."
      : "This rebuilds the entire spine from your logline, then writes every scene's beats and screenplay. Your current scenes, beats and drafts will be cleared.",
    rationale:spine.scenes.length+" new scenes \u00b7 "+turns+(_kishoA?" move cleanly":" turn cleanly")+" \u00b7 beats + script written automatically",
    list: spine.scenes.map((s,i)=>String(i+1).padStart(2,"0")+" \u00b7 Act "+(["I","II","III","IV"][s.act-1]||s.act)+" \u00b7 "+s.title+"  ("+chargeStr(s.openCharge)+"\u2192"+chargeStr(s.closeCharge)+")"),
    danger:!_isNew,
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
        // author the beat map; retry ONCE if the model hiccups — a scene must never end
        // up with a screenplay but no beat map (the cause of "No beat map yet" on a written
        // scene). Both tries can fail only on a hard model error.
        for(let attempt=0; attempt<2 && !beats; attempt++){
          const authored = await author(s, prev, ctx.model.characters);
          if(authored && authored.beats && (authored.beats.rows||[]).length){
            scn = {...s, ...authored.patch}; beats = authored.beats;
            ctx.model.scenes[i] = scn; ctx.model.beats[s.id] = authored.beats;
          }
        }
      }
      const res = (typeof draft==="function") ? await draft(scn, beats, prev) : null;
      if(res){ ctx.model.drafts[s.id] = res; written++; }
      // never leave a written scene beat-less and silent — flag it so the user can fix it.
      if(res && !(beats && (beats.rows||[]).length))
        ctx.emit({k:"flag", t:"Sc "+s.no+" “"+s.title+"” was written, but its beat map didn't generate — open it and 'Create beat map', or re-run."});
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
   SCRIPT BREAKDOWN  (Writers' Room — the 1st-AD pass, runs on Claude)
   Reads every WRITTEN scene's beats + screenplay, tags each beat's characters (anatomy /
   features / appearance states + the pronoun the script uses), props handled, and set
   dressing. Two jobs: (1) ENRICH the cast sheets with script-only details; (2) the
   bible↔script DRIFT CHECK — flag where the script's pronouns contradict a character's
   canonical pronouns, with a reconcile proposal (catches the Lumi gender case). Props are
   tagged + listed for the Props Master to generate (this Writers' ctx can't write props).
   ========================================================= */
async function agentScriptBreakdown(ctx){
  if(!ctx.ai || !ctx.ai.available){ ctx.emit({k:"flag", t:"The model isn't available — the breakdown needs it."}); ctx.emit({k:"done",t:"Aborted."}); return; }
  const scenes = (ctx.model.scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const written = scenes.filter(s=> ctx.model.drafts[s.id]);
  if(!written.length){ ctx.emit({k:"flag", t:"No scenes are written yet — build the script first (New Story / Adaptation), then run the breakdown."}); ctx.emit({k:"done",t:"Nothing to break down."}); return; }
  ctx.emit({k:"plan", t:"Breaking down "+written.length+" written scene"+(written.length>1?"s":"")+" — tagging each beat's characters, features, props and set dressing, and checking the script against the cast sheets."});
  const pronOf = (g)=> g==="he"?"he/him":g==="she"?"she/her":g==="they"?"they/them":"";
  const charByName = {}; (ctx.model.characters||[]).forEach(c=>{ if(c.name) charByName[c.name.toLowerCase()]=c; });
  const findChar = (nm)=>{ const low=(nm||"").toLowerCase();
    return charByName[low] || (ctx.model.characters||[]).find(x=>{ const xn=(x.name||"").toLowerCase(); return xn && (xn.includes(low)||low.includes(xn)); }); };
  let drift=0, reconciled=0, enriched=0, propsFound=0, dressFound=0, lintCount=0;
  const emoTally = {};   // charId → { emotion: count } — the character's emotions across the story
  for(const s of written){
    if(ctx.cancelled()) return;
    ctx.emit({k:"act", t:"Reading Sc "+s.no+" “"+s.title+"”…"});
    let bd=null; try{ bd = await window.aiScriptBreakdown(s, ctx.model.beats[s.id], ctx.model.drafts[s.id], ctx.model.characters); }catch(e){}
    if(!bd){ ctx.emit({k:"flag", t:"Sc "+s.no+": couldn't read a breakdown — skipping."}); continue; }
    // (4) REFERENTIAL-COMPLETENESS LINT — flag beats whose text isn't self-contained
    // (ambiguous pronoun, or a prop established earlier that this beat drops) before any
    // frame is generated. Deterministic, reads the beat map + the breakdown's prop list.
    if(typeof window.beatContinuityLint==="function"){
      const lf = window.beatContinuityLint(s, ctx.model.beats[s.id], bd.props, ctx.model.characters);
      lf.forEach(f=> ctx.emit({k:"flag", t:"Sc "+s.no+" · "+f.msg}));
      lintCount += lf.length;
    }
    bd.characters.forEach(c=>{ const bits=[]; if(c.features.length) bits.push(c.features.length+" feature"+(c.features.length>1?"s":"")); if(c.states.length) bits.push(c.states.length+" state"+(c.states.length>1?"s":""));
      ctx.emit({k:"observe", t:"Sc "+s.no+" · "+c.name+(bits.length?(" — "+bits.join(", ")):"")+(c.gender_used!=="unclear"?(" · script says “"+c.gender_used+"”"):"")}); });
    if(bd.props.length){ propsFound+=bd.props.length; ctx.emit({k:"observe", t:"Sc "+s.no+" props: "+bd.props.map(p=>p.name+(p.owner?(" ("+p.owner+")"):"")).join(", ")}); }
    if(bd.set_dressing.length){ dressFound+=bd.set_dressing.length; ctx.emit({k:"observe", t:"Sc "+s.no+" set dressing: "+bd.set_dressing.join(", ")}); }
    for(const c of bd.characters){
      if(ctx.cancelled()) return;
      const ch = findChar(c.name); if(!ch) continue;
      // tally the emotion this scene shows for the character (aggregated into their 3 signature expressions after the pass)
      if(c.emotion){ (emoTally[ch.id]=emoTally[ch.id]||{})[c.emotion]=(emoTally[ch.id][c.emotion]||0)+1; }
      // (1) DRIFT CHECK — script pronoun vs canonical pronoun
      const scriptPron = pronOf(c.gender_used);
      const canonPron = (typeof window.charPronouns==="function") ? window.charPronouns(ch) : "";
      if(scriptPron==="they/them"){
        // house rule: singular they never becomes canon — the SCRIPT is what needs fixing
        ctx.emit({k:"flag", t:"Sc "+s.no+" refers to "+ch.name+" with singular \u201cthey\u201d \u2014 rewrite to "+(canonPron||"he/she or the name")+" (house rule: explicit pronouns only; Consistency Check can fix this)."});
      } else if(scriptPron && canonPron && scriptPron!==canonPron){
        drift++;
        const ok = await ctx.propose({
          title:"Gender drift — "+ch.name,
          reason:"Sc "+s.no+" refers to "+ch.name+" as “"+c.gender_used+"”, but the cast sheet's pronouns are "+canonPron+".",
          rationale:"Approve to set "+ch.name+"'s canonical pronouns to "+scriptPron+" (match the script). Reject to keep "+canonPron+" — then fix the script's pronouns.",
          before:"Sheet: "+canonPron, after:"Sheet: "+scriptPron });
        if(ctx.cancelled()) return;
        if(ok){ const i=ctx.model.characters.findIndex(x=>x.id===ch.id);
          if(i>=0){ ctx.model.characters[i]={...ctx.model.characters[i], pronouns:scriptPron}; charByName[(ch.name||"").toLowerCase()]=ctx.model.characters[i]; ctx.sync(); reconciled++; ctx.emit({k:"ok", t:ch.name+" → "+scriptPron}); } }
      }
      // (1b) SCALE DRIFT — the script implies a scale class that contradicts the sheet's
      const SCALE_MAP = { human:"A", critter:"B", giant:"C", microscopic:"D" };
      const SCALE_LAB = { A:"Human scale", B:"Small / critter", C:"Massive / giant", D:"Microscopic / sub-insect" };
      const scriptCls = SCALE_MAP[c.scale_used];
      const canonCls = (typeof window.scaleClassOf==="function") ? window.scaleClassOf(ch) : "A";
      if(scriptCls && scriptCls!==canonCls){
        drift++;
        const ok = await ctx.propose({
          title:"Scale drift — "+ch.name,
          reason:"Sc "+s.no+" reads "+ch.name+" as “"+c.scale_used+"” scale, but the sheet is "+(SCALE_LAB[canonCls]||canonCls)+".",
          rationale:"Approve to set "+ch.name+"'s scale class to "+(SCALE_LAB[scriptCls]||scriptCls)+" — it drives the height sheet's ruler and how the world is rendered from their POV in shots.",
          before:"Sheet: "+(SCALE_LAB[canonCls]||canonCls), after:"Sheet: "+(SCALE_LAB[scriptCls]||scriptCls) });
        if(ctx.cancelled()) return;
        if(ok){ const i=ctx.model.characters.findIndex(x=>x.id===ch.id);
          if(i>=0){ ctx.model.characters[i]={...ctx.model.characters[i], scaleClass:scriptCls}; charByName[(ch.name||"").toLowerCase()]=ctx.model.characters[i]; ctx.sync(); reconciled++; ctx.emit({k:"ok", t:ch.name+" → "+(SCALE_LAB[scriptCls]||scriptCls)}); } }
      }
      // (2) ENRICH — features the scene reveals that aren't on the sheet yet
      const existing = ((ch.coreBody||"")+" "+(ch.physique?Object.values(ch.physique).join(" "):"")).toLowerCase();
      const newFeats = c.features.filter(f=> f && !existing.includes(f.toLowerCase().slice(0,16)));
      for(const f of newFeats){
        if(ctx.cancelled()) return;
        const ok = await ctx.propose({
          title:"Add to "+ch.name+"'s sheet",
          reason:"Sc "+s.no+" reveals a detail not on "+ch.name+"'s sheet: “"+f+"”.",
          rationale:"Approve to append it to the character's physical description so every sheet and shot includes it.",
          before:(ch.coreBody||"(no body description)").slice(0,90), after:f });
        if(ctx.cancelled()) return;
        if(ok){ const i=ctx.model.characters.findIndex(x=>x.id===ch.id);
          if(i>=0){ const cur=ctx.model.characters[i]; const cb=(cur.coreBody||"").trim();
            ctx.model.characters[i]={...cur, coreBody:(cb+(cb?" ":"")+f.replace(/\.$/,"")+".").trim()};
            charByName[(ch.name||"").toLowerCase()]=ctx.model.characters[i]; ctx.sync(); enriched++; ctx.emit({k:"ok", t:"Added “"+f+"” to "+ch.name}); } }
      }
      // (2b) VOICE ENRICH — audible voice details the script states that aren't on the
      // character's voice block yet. An accent-shaped cue fills voice.accent (the field
      // voice casting reads first); anything else lands in voice.quirks.
      const vb = ch.voice || {};
      const voiceExisting = [vb.accent, vb.pitch, vb.pace, vb.quirks].filter(Boolean).join(" ").toLowerCase();
      const newCues = (c.voice_cues||[]).filter(q=> q && !voiceExisting.includes(q.toLowerCase().slice(0,16)));
      for(const q of newCues){
        if(ctx.cancelled()) return;
        const isAccent = /\baccent|dialect\b/i.test(q);
        const field = isAccent ? "accent" : "quirks";
        const cur = ch.voice || {};
        if(isAccent && cur.accent) continue;   // an authored accent wins over a script cue
        const ok = await ctx.propose({
          title:"Voice — "+ch.name,
          reason:"Sc "+s.no+" states how "+ch.name+" SOUNDS: “"+q+"”.",
          rationale:"Approve to record it on "+ch.name+"'s voice block ("+field+") — voice casting builds its description from these fields, so the locked voice matches the script.",
          before:(voiceExisting||"(no voice block yet)").slice(0,90), after:q });
        if(ctx.cancelled()) return;
        if(ok){ const i=ctx.model.characters.findIndex(x=>x.id===ch.id);
          if(i>=0){ const cc=ctx.model.characters[i]; const cv={...(cc.voice||{})};
            if(isAccent) cv.accent = q;
            else cv.quirks = ((cv.quirks||"")+(cv.quirks?"; ":"")+q).slice(0,160);
            ctx.model.characters[i]={...cc, voice:cv};
            charByName[(ch.name||"").toLowerCase()]=ctx.model.characters[i]; ctx.sync(); enriched++; ctx.emit({k:"ok", t:ch.name+" voice · "+q}); } }
      }
    }
  }
  // SIGNATURE EXPRESSIONS — each character's 3 most-prevalent emotions across the story become
  // the expression-headshot row on their sheet (replacing the generic joy/anger/sadness default).
  let exprSet=0;
  Object.keys(emoTally).forEach(cid=>{
    const top = Object.entries(emoTally[cid]).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]);
    if(top.length){ const i=ctx.model.characters.findIndex(x=>x.id===cid);
      if(i>=0){ ctx.model.characters[i]={...ctx.model.characters[i], expressions:top}; exprSet++; } }
  });
  if(exprSet){ ctx.sync(); ctx.emit({k:"ok", t:"Set signature expressions for "+exprSet+" character"+(exprSet!==1?"s":"")+" from the story."}); }
  ctx.emit({k:"done", t:"Breakdown complete — "+drift+" drift flag"+(drift!==1?"s":"")+" ("+reconciled+" reconciled), "+enriched+" feature"+(enriched!==1?"s":"")+" added to the cast, "+(exprSet?exprSet+" expression set"+(exprSet!==1?"s":"")+", ":"")+propsFound+" prop"+(propsFound!==1?"s":"")+" + "+dressFound+" set-dressing item"+(dressFound!==1?"s":"")+" tagged, "+lintCount+" continuity warning"+(lintCount!==1?"s":"")+" flagged. Generate the tagged props in the Art Room → Props (Props Master)."});
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
/* the framework's word for what coverage must land on ("the turn" / "the re-read");
   null for three-act so the classic copy stays byte-identical */
function fwTurnWord(){
  try{
    const fw = (typeof frameworkOf==="function") ? frameworkOf(window.turnProject) : null;
    if(fw && fw.id!=="threeact" && fw.beatVocab && fw.beatVocab.turnLabel) return fw.beatVocab.turnLabel;
  }catch(e){}
  return null;
}

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
    if(turnAt){ const ts=ss.find(x=>x.beatN===turnAt); if(ts && !_TIGHT_SIZES.has(ts.size)){ issues.push({kind:"weakturn",sceneId:s.id,sceneNo:s.no,sev:2,msg:t+" doesn't land "+(fwTurnWord()||"its turn")+" — the turning beat is a "+ts.size+", not a tight push-in (MCU/CU/ECU)."}); return; } }
    if(ss.length>=3){ const sizes=new Set(ss.map(x=>x.size)); if(sizes.size===1){ issues.push({kind:"flatsizes",sceneId:s.id,sceneNo:s.no,sev:1,msg:t+" is all "+[...sizes][0]+" — no size progression from wide to tight."}); return; } }
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
  ctx.emit({k:"plan", t:"Auditing coverage scene by scene — does each scene establish wide, tighten through the middle, and LAND "+(fwTurnWord()||"its turn")+" on its most expressive size?"});
  let fixes=0;
  for(let iter=0;iter<MAX;iter++){
    if(ctx.cancelled()) return;
    const issues = cov.audit().filter(i=>!skip.has(i.sceneId));
    if(!issues.length){ ctx.emit({k:"ok", t:"Re-audit complete — every scene establishes, tightens and lands "+(fwTurnWord()||"its turn")+". Coverage holds."}); break; }
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
      ctx.emit({k:"act", t:"Designing coverage for Scene "+issue.sceneNo+" — establishing, tightening, landing "+(fwTurnWord()||"the turn")+"…"});
      let made=null; try{ made = await cov.draftCoverage(scene); }catch(e){}
      if(ctx.cancelled()) return;
      if(!made || !made.length){ ctx.emit({k:"flag", t:"Couldn't design coverage for Scene "+issue.sceneNo+". Moving on."}); skip.add(issue.sceneId); continue; }
      // guarantee the turn LANDS tight: if the model left the turning beat wide, push it to a CU
      // push-in (also what resolves the weakturn audit so the loop converges, never re-proposes).
      if(turnAt){ const ti = made.findIndex(s=>s.beatN===turnAt);
        if(ti>=0 && !_TIGHT_SIZES.has(made[ti].size)){ made[ti] = {...made[ti], size:"CU", move:(made[ti].move==="static"?"push":made[ti].move) }; } }
      const anchorId = cov.pickAnchor(made);
      fix = { kind:"coverage", shots:made, anchorId, list: cov.grammarList(made, anchorId, turnAt),
        rationale:"Coverage that establishes wide, tightens through the middle, and lands "+(fwTurnWord()||"the turn")+" on its most expressive size." };
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
  ctx.emit({k:"done", t: fixes ? ("Designed coverage for "+fixes+" scene"+(fixes!==1?"s":"")+". Click ‘Generate all shots’ in the Shot List to render the chain in order.") : "No coverage changes applied." });
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
  ctx.emit({k:"plan", t: ctx.draftOnly
    ? "Re-drafting the cast from the updated Lookbook — for each of the "+N+" character"+(N!==1?"s":"")+": re-draft the look and appearance states. Specs only — every master sheet and variant stays untouched."
    : "Designing the cast — for each of the "+N+" character"+(N!==1?"s":"")+": draft the look, find their appearance changes, generate the master sheet (with prop + cameo references), then each state variant."});
  let specs=0, sheets=0, variants=0;
  for(const ch of cast.list){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+sheets+" sheet"+(sheets!==1?"s":"")+" generated."}); return; }
    let c = ch;
    ctx.emit({k:"act", t:"Casting "+(c.name||"a character")+"…"});

    // 1) draft the visual spec (force = re-draft even if already drafted, applying the Lookbook)
    const redraftSpecs = ctx.force || ctx.draftOnly;
    if((redraftSpecs || !cast.isDrafted(c)) && ctx.ai && ctx.ai.available){
      ctx.emit({k:"act", t:(redraftSpecs?"Re-drafting ":"Drafting ")+(c.name||"the character")+"'s look from the script…"});
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

    // draft-only ("Re-draft only" on the Lookbook-stale banner): spec updated — leave this
    // character's master sheet and variants untouched.
    if(ctx.draftOnly) continue;

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
  ctx.emit({k:"done", t: ctx.draftOnly
    ? "Cast re-drafted — "+specs+" spec"+(specs!==1?"s":"")+" updated from the Lookbook. Sheets left untouched — regenerate them from the Characters tab when ready."
    : "Cast designed — "+specs+" spec"+(specs!==1?"s":"")+" drafted, "+sheets+" master sheet"+(sheets!==1?"s":"")+", "+variants+" appearance variant"+(variants!==1?"s":"")+". Review and tweak any in the Characters tab."});
}

/* =========================================================
   WEAR PROPS (the Coordinator's "step 3", Art Room) — after the cast is generated and
   the props (which reference the cast) are made, RE-GENERATE each character's master so
   it wears its exact finalized worn-prop sheets (generateMaster already attaches them).
   Only touches characters that (a) already have a master and (b) have ≥1 worn prop WITH a
   sheet; any already-generated appearance-state variant is refreshed off the new master so
   they don't drift. Closes the loop: character → prop (refs character) → character wears prop.
   ========================================================= */
async function agentWearProps(ctx){
  const cast = ctx.art && ctx.art.cast;
  if(!cast || !cast.list || !cast.list.length){ ctx.emit({k:"done", t:"No cast to dress."}); return; }
  const targets = [];
  for(const c of cast.list){
    if(ctx.cancelled()) return;
    const hasMaster = cast.imageOf ? await cast.imageOf(c.id) : null;
    if(!hasMaster) continue;   // never generated — leave it for the Casting Director
    const worn = cast.wornPropsWithSheets ? await cast.wornPropsWithSheets(c) : [];
    if(worn.length) targets.push({ c, worn });
  }
  if(!targets.length){ ctx.emit({k:"ok", t:"No characters have newly-generated worn props to wear."}); ctx.emit({k:"done", t:"Cast already wears its props."}); return; }
  ctx.emit({k:"plan", t:"Dressing "+targets.length+" character"+(targets.length!==1?"s":"")+" in their finalized worn props — re-generating each master so it wears the exact prop sheet"+(targets.length!==1?"s":"")+", then refreshing any appearance variant off the new master."});
  let done=0;
  for(const { c, worn } of targets){
    if(ctx.cancelled()){ ctx.emit({k:"flag", t:"Stopped — "+done+" dressed."}); return; }
    ctx.emit({k:"act", t:"Dressing "+(c.name||"a character")+" in "+worn.length+" worn prop"+(worn.length!==1?"s":"")+" ("+worn.map(p=>p.name).join(", ").slice(0,80)+")…"});
    try{
      const masterUrl = await cast.generateMaster(c);
      // refresh ONLY appearance states that already exist, off the new master
      for(const st of (c.states||[])){
        if(ctx.cancelled()) return;
        const existing = cast.imageOf ? await cast.imageOf(c.id+":"+st.id) : null;
        if(existing){ try{ await cast.generateState(c, st, masterUrl); }catch(e){} }
      }
      done++;
      ctx.emit({k:"ok", t:(c.name||"Character")+" now wears its exact prop"+(worn.length!==1?"s":"")+"."});
    }catch(e){ ctx.emit({k:"flag", t:"Couldn't dress "+(c.name||"the character")+": "+((e&&e.message)||e)+". Moving on."}); }
  }
  ctx.emit({k:"done", t:"Dressed "+done+" character"+(done!==1?"s":"")+" in their finalized worn props."});
}
window.agentWearProps = agentWearProps;

async function agentPropsMaster(ctx){
  const pm = ctx.art && ctx.art.propmaster;
  if(!pm){
    ctx.emit({k:"flag", t:"Props workspace unavailable."});
    ctx.emit({k:"done", t:"Nothing to do."}); return;
  }
  ctx.emit({k:"plan", t: ctx.draftOnly
    ? "Re-drafting the props from the updated Lookbook — derive any new props, re-draft each spec, dedup near-duplicates. Specs only — every generated sheet stays untouched."
    : "Mastering the props — derive every prop the script names (worn/carried by the cast + the set dressing in the action), draft each spec, dedup near-duplicates, then generate a reference sheet for each so the cast can reference them."});

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
  const redraftSpecs = ctx.force || ctx.draftOnly;
  ctx.emit({k:"act", t:redraftSpecs?"Re-drafting every prop spec from the story…":"Drafting prop specs from the story…"});
  let drafted=0;
  try{ drafted = await pm.draftSpecs(redraftSpecs); }
  catch(e){ ctx.emit({k:"flag", t:"Spec drafting hit an error: "+((e&&e.message)||e)}); }
  ctx.emit({k:"observe", t:drafted?("Drafted "+drafted+" spec"+(drafted!==1?"s":"")+"."):"Specs already complete."});
  if(ctx.cancelled()) return;

  // 3) dedup near-duplicates (same owner + same object) into one card each
  let merged=0;
  try{ merged = pm.dedup(); }catch(e){}
  if(merged) ctx.emit({k:"ok", t:"Merged "+merged+" near-duplicate"+(merged!==1?"s":"")+" into one card each."});
  if(ctx.cancelled()) return;

  // draft-only ("Re-draft only" on the Lookbook-stale banner): the specs now carry the
  // updated Lookbook — stop before generation so every existing sheet stays untouched.
  if(ctx.draftOnly){
    if(ctx.art.markApplied) ctx.art.markApplied("props");
    ctx.emit({k:"done", t:"Props re-drafted — "+(castN+setN)+" derived, "+drafted+" spec"+(drafted!==1?"s":"")+" updated from the Lookbook. Sheets left untouched — regenerate them from the Props tab when ready."});
    return;
  }

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
  ctx.emit({k:"plan", t: ctx.draftOnly
    ? "Re-drafting the locations from the updated Lookbook — pull any new places, re-draft each spec + depth-grid staging. Specs only — every generated plate stays untouched."
    : "Scouting the film's locations — pull every place from the sluglines, draft each one's staging + depth-grid spec, generate the plate, and add the time-of-day variants the script needs. Plus a coverage check: any scene whose slugline location has no card yet."});

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
  const redraftSpecs = ctx.force || ctx.draftOnly;
  ctx.emit({k:"act", t:redraftSpecs?"Re-drafting every location spec from the script…":"Drafting location specs from the script…"});
  let specs=0;
  try{ specs = await ls.draftSpecs(redraftSpecs); }
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

  // draft-only ("Re-draft only" on the Lookbook-stale banner): the specs + staging now
  // carry the updated Lookbook — stop before generation so every plate stays untouched.
  if(ctx.draftOnly){
    if(ctx.art.markApplied) ctx.art.markApplied("locations");
    ctx.emit({k:"done", t:"Locations re-drafted — "+specs+" spec"+(specs!==1?"s":"")+" updated from the Lookbook"+(staged?(", "+staged+" staged"):"")+". Plates left untouched — regenerate them from the Locations tab when ready."});
    return;
  }

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
  ctx.emit({k:"plan", t:"Researching the film's visual language — writing the look statement, gathering/deduping reference touchstones across every department (palette, lighting, lens, texture, plus wardrobe for the cast and production design for props & sets), and proposing the film's RENDER STYLE from the story (approval-gated — a yes sets every character/prop/location style dropdown in one pass). Use “Generate all frames” afterwards when you want to render mood frames."});

  // 0) REPAIR — a lookbook that outgrew its 8-touchstone brief (the pre-guard
  // growth bug stacked +8 cards per re-run). Approval-gated: keeps every hand-added
  // card, every rendered frame and one reference per category; proposes dropping
  // the excess so users never prune the wall by hand.
  if(typeof lb.trimPlan==="function" && typeof lb.applyTrim==="function"){
    let plan=null;
    try{ plan = await lb.trimPlan(); }catch(e){}
    if(plan && plan.drop && plan.drop.length){
      ctx.emit({k:"observe", t:"This lookbook holds "+(plan.keep.length+plan.drop.length)+" references — far past its 8-touchstone brief (an earlier bug let every re-run add more). "+plan.drop.length+" are excess: agent-added, no rendered frame, category already covered."});
      const ok = await ctx.propose({
        title:"Trim the lookbook back to its brief",
        reason:"The brief is 8 touchstones covering the categories; the excess cards only multiply “missing frame” counts and generation costs.",
        rationale:"Keeps every hand-added reference, every card with a rendered mood frame, and one reference per category ("+plan.keep.length+" stay). Removes "+plan.drop.length+" excess unrendered card"+(plan.drop.length!==1?"s":"")+": "+plan.drop.slice(0,8).map(c=>c.source).join(", ")+(plan.drop.length>8?"…":"")+".",
        before: (plan.keep.length+plan.drop.length)+" reference cards",
        after: plan.keep.length+" reference cards — the brief, nothing more",
      });
      if(ctx.cancelled()) return;
      if(ok){ const n = lb.applyTrim(plan); ctx.emit({k:"ok", t:"Trimmed "+n+" excess reference"+(n!==1?"s":"")+" — the lookbook is back to its brief."}); }
      else ctx.emit({k:"flag", t:"Trim declined — every card stays."});
    }
  }
  if(ctx.cancelled()) return;

  // 1) research: statement + reference entries, written through to the Colorist
  ctx.emit({k:"act", t:"Reading the story, writing the look statement, gathering references…"});
  let res;
  try{ res = await lb.research(); }
  catch(e){ ctx.emit({k:"flag", t:"Research hit an error: "+((e&&e.message)||e)}); }
  if(res && res.statement) ctx.emit({k:"observe", t:"Look statement — "+res.statement.slice(0,150)});
  ctx.emit({k:"observe", t:(res&&res.added ? ("Gathered "+res.added+" reference"+(res.added!==1?"s":"")) : "References already gathered")+" — the colour system (the Styles tab) reads these directly when it designs the palette."});
  if(ctx.cancelled()) return;

  // 2) RENDER STYLE — the researcher also proposes the film's MEDIUM (one unified pick
  // from the shared style registry, grounded in the story). Approval-gated: a yes sets
  // the style dropdown on every character, prop and location in one pass; per-card
  // dropdowns stay available as the override afterwards.
  if(res && res.renderStyle && res.renderStyle.key && typeof lb.applyRenderStyle==="function"){
    const rs = res.renderStyle;
    const before = (typeof lb.currentStyleLabel==="function") ? lb.currentStyleLabel() : "current per-card picks";
    ctx.emit({k:"observe", t:"Render style proposal — “"+rs.label+"”: "+(rs.why||"grounded in the story's tone and world.")});
    const ok = await ctx.propose({
      title:"Render style — "+rs.label,
      reason:"One unified visual MEDIUM for the whole film, proposed from the story (a different axis from palette/grade — the Colorist still grades every scene on top of it).",
      rationale: rs.why || "Grounded in the story's tone and world.",
      before: "Style dropdowns now: "+before,
      after: "Every character, prop and location set to “"+rs.label+"” — sheets, plates and shot frames all speak this language; any card's dropdown can still override it.",
    });
    if(ctx.cancelled()) return;
    if(ok){
      const n = lb.applyRenderStyle(rs.key) || {};
      ctx.emit({k:"ok", t:"Render style “"+rs.label+"” applied — "+(n.characters||0)+" character"+((n.characters||0)!==1?"s":"")+", "+(n.props||0)+" prop"+((n.props||0)!==1?"s":"")+", "+(n.locations||0)+" location"+((n.locations||0)!==1?"s":"")+". Regenerate sheets and plates to see it."});
    } else {
      ctx.emit({k:"flag", t:"Render style proposal declined — every style dropdown stays as it is."});
    }
  }

  let todo=[];
  try{ todo = await lb.toGenerate(); }catch(e){}
  ctx.emit({k:"done", t:"Lookbook researched — "+((res&&res.added)||0)+" new reference"+((res&&res.added)===1?"":"s")+" added. "+(todo.length?("Generate all frames will render "+todo.length+" missing mood frame"+(todo.length!==1?"s":"")+"."):"Every mood frame is already rendered.")});
}

async function agentDepartmentCoordinator(ctx){
  // The meta-agent: chains the six Art Room agents in dependency order. The four
  // autonomous ones (Props, Characters, Locations, Storyboard) run hands-off; the two
  // approval-gated ones (Colour, Shots) pause at their proposal cards and resume on your yes.
  const steps = [
    ["Lookbook",   agentVisualResearcher],
    ["Characters", agentCastingDirector],
    ["Props",      agentPropsMaster],
    ["Wear props", agentWearProps],
    ["Locations",  agentLocationScout],
    ["Colour",     agentColorist],
    ["Shots",      agentShotDesigner],
    ["Storyboard", agentStoryboardDirector],
  ];
  ctx.emit({k:"plan", t:"Running the whole pre-production pipeline in dependency order — the lookbook first (it steers the look), then the CAST, then the PROPS (each worn/owned prop references its owner's sheet so it matches that character), then DRESSING the cast in their finalized worn props, then locations, then the colour system, then shot coverage, then the storyboard. It runs end to end WITHOUT stopping — the colour and shot-coverage steps are applied automatically, no approval needed. Press Stop anytime."});
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
   CONSISTENT set of frames — renders the shots in order as a rolling chain
   (each seeded by the previous shot's frame), visually QCs each result
   against its seed, and repairs drift with bounded corrective regens. A plan
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
    +" — per scene: render every shot IN ORDER as a rolling chain (each seeded by the previous frame), visually inspect each result against its seed, repair drift (max "+MAX_REPAIRS+" per shot). Capped at "+MAX_GENS+" generations this run."});
  for(const grp of art.scenes){
    if(ctx.cancelled()) return;
    const { scene, shots } = grp, sctx = grp.ctx;
    const ordered = (typeof sceneShotsOrdered==="function") ? sceneShotsOrdered(shots) : shots;
    const idxOf = (s)=> ordered.indexOf(s);
    const no = (i)=> scene.no+"."+(i+1);
    const seedOf = async (s)=>{ const p=(typeof prevShotOf==="function")?prevShotOf(s, ordered):null; return p ? await art.frameOf(p.id) : null; };
    const missing = [];
    for(const s of ordered){ if(!(await art.frameOf(s.id))) missing.push(s); }
    const planned = missing.length;
    // PLAN GATE — generation costs money; ask before spending on this scene
    const ok = await ctx.propose({
      title:"Direct Scene "+scene.no+" — "+(scene.title||"Untitled"),
      reason: missing.length+" frame"+(missing.length!==1?"s":"")+" to render in chain order (each seeded by the previous frame) · then visual QC of every shot with up to "+MAX_REPAIRS+" repairs per drifted frame.",
      rationale:"Roughly "+Math.max(planned,1)+"–"+(planned+Math.min(ordered.length,4))+" image generations. Every frame is version-committed — each change is revertible on its card.",
      before: shots.length+" shots · "+(shots.length-missing.length)+" frame"+((shots.length-missing.length)!==1?"s":"")+" already exist",
      after:  "All "+shots.length+" frames rendered in order, each inspected against its seed, drifted ones repaired",
    });
    if(ctx.cancelled()) return;
    if(!ok){ ctx.emit({k:"flag", t:"Skipped Scene "+scene.no+"."}); continue; }
    // 1) RENDER the missing frames IN ORDER — each chains from the previous shot's frame
    for(const s of missing){
      if(ctx.cancelled()) return;
      if(gens>=MAX_GENS){ ctx.emit({k:"flag", t:"Generation cap reached — stopping."}); break; }
      const head = !((typeof prevShotOf==="function") && prevShotOf(s, ordered));
      ctx.emit({k:"act", t:(head ? "Scene "+scene.no+": rendering the opening key frame — " : "Rendering "+no(idxOf(s))+" seeded by the previous frame — ")+(typeof shotGrammarLabel==="function"?shotGrammarLabel(s):"")+"…"});
      try{ await art.shotFrame(s, shots, sctx, {}); gens++; }
      catch(e){ ctx.emit({k:"flag", t:no(idxOf(s))+" failed: "+((e&&e.message)||e)+". Moving on."}); }
    }
    // 2) QC — inspect each frame against its SEED (the previous shot's frame)
    const flagged = []; let repaired = 0;
    if(!qcDown && art.qc){
      for(const s of ordered){
        if(ctx.cancelled()) return;
        const u = await art.frameOf(s.id); if(!u) continue;
        const seedUrl = await seedOf(s);
        ctx.emit({k:"act", t:"QC: inspecting "+no(idxOf(s))+(seedUrl?" against its seed frame":"")+"…"});
        let v = null; try{ v = await art.qc(s, u, seedUrl); }catch(e){}
        if(v && v.unsupported){ qcDown = true;
          ctx.emit({k:"flag", t:"Visual QC unavailable — the image-proxy needs a redeploy to accept image inputs on its text task (supabase functions deploy image-proxy). Frames are generated; QC and repair skipped."});
          break; }
        if(!v){ ctx.emit({k:"flag", t:"No QC verdict for "+no(idxOf(s))+" — leaving the frame as is."}); continue; }
        if(v.overall==="fail"){ flagged.push({ s, v });
          ctx.emit({k:"observe", t:"Drift in "+no(idxOf(s))+": "+(v.issues||[]).slice(0,2).map(i=>i.dim+" — "+i.reason).join("; ")}); }
        else ctx.emit({k:"ok", t:no(idxOf(s))+" consistent"+(v.overall==="minor"?" (minor notes)":"")+"."});
      }
    }
    // 3) REPAIR — bounded corrective regenerations
    for(const f of flagged){
      let fixed = false;
      for(let r=0; r<MAX_REPAIRS && !fixed; r++){
        if(ctx.cancelled()) return;
        if(gens>=MAX_GENS){ ctx.emit({k:"flag", t:"Generation cap reached — stopping repairs."}); break; }
        ctx.emit({k:"act", t:"Repairing "+no(idxOf(f.s))+" — "+(f.v.fix||"re-rendering to match the seed and sheets")+"…"});
        try{ await art.shotFrame(f.s, shots, sctx, { correction:f.v.fix||"match the previous frame's grade, lighting and established state, and the character/location sheets, exactly" }); gens++; }
        catch(e){ ctx.emit({k:"flag", t:"Repair failed: "+((e&&e.message)||e)}); break; }
        const u2 = await art.frameOf(f.s.id);
        const seed2 = await seedOf(f.s);
        let v2 = null; try{ v2 = await art.qc(f.s, u2, seed2); }catch(e){}
        if(!v2 || v2.unsupported || v2.overall!=="fail"){ fixed = true; repaired++; ctx.emit({k:"ok", t:no(idxOf(f.s))+" repaired."}); }
        else f.v = v2;
      }
      if(!fixed) ctx.emit({k:"flag", t:no(idxOf(f.s))+" still drifts after "+MAX_REPAIRS+" repairs — needs your eye (its card has Edit frame / Render without the previous frame, and every version is revertible)."});
    }
    ctx.emit({k:"ok", t:"Scene "+scene.no+" directed — "+shots.length+" frames"
      +(repaired?(", "+repaired+" repaired"):"")
      +((flagged.length-repaired)>0?(", "+(flagged.length-repaired)+" still flagged"):"")+"."});
  }
  ctx.emit({k:"done", t:"Direction complete — "+gens+" generation"+(gens!==1?"s":"")+" spent"
    +(qcDown?" (visual QC was unavailable — redeploy the image-proxy to enable it)":"")
    +". Review flagged frames in the Shot List; every change is revertible per card."});
}

/* ---- Consistency Check — the scene-progression auditor. Rule-based and FREE
   (no model calls): the script/beats are canon, so every downstream layer —
   prop cards, the location bible, staging, render styles, pronouns — is diffed
   against them. Unambiguous repairs become approval cards; judgement calls are
   flagged for the writer. ---- */

const _consEsc = (s)=> String(s||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const _consCap = (s)=> s.charAt(0).toUpperCase()+s.slice(1);
/* verb agreement for they→he/she rewrites: present-tense verbs gain -s; past
   tense (regular -ed + common irregulars) passes through. Every rewrite is
   approval-gated with before/after shown, so a rare miss is rejectable. */
const _CONS_PAST = new Set(("went ran sat stood fell rose came left took drew held kept knelt lay said saw sank spoke froze crept slid swung threw clung dug hid shrank bent leant meant wept swept caught fought brought thought bought stole broke chose wore tore bore drove strode struck stuck sprang spun flung hung found ground wound bound heard made had did got gave put set let cut shut hit split spread burst cast felt dealt met led fed fled bled sped read").split(" "));
function _consConj(v){
  const w = v.toLowerCase();
  if(w==="are") return "is"; if(w==="were") return "was"; if(w==="have") return "has";
  if(w==="do") return "does"; if(w==="don't") return "doesn't"; if(w==="aren't") return "isn't";
  if(/ed$/.test(w) || _CONS_PAST.has(w)) return v;
  if(/(s|x|z|ch|sh)$/.test(w)) return v+"es";
  if(/[^aeiou]y$/.test(w)) return v.replace(/y$/,"ies");
  return v+"s";
}
const _CONS_GENDER = { "he/him":{subj:"he",obj:"him",poss:"his",self:"himself"},
                       "she/her":{subj:"she",obj:"her",poss:"her",self:"herself"} };
function _consRewriteSentence(s, g){
  let t = s;
  t = t.replace(/\bThey\b\s+([A-Za-z']+)/g, (m,v)=> _consCap(g.subj)+" "+_consConj(v));
  t = t.replace(/\bthey\b\s+([A-Za-z']+)/g, (m,v)=> g.subj+" "+_consConj(v));
  t = t.replace(/\bTheir\b/g, _consCap(g.poss)).replace(/\btheir\b/g, g.poss);
  t = t.replace(/\bthemselves\b/g, g.self).replace(/\bThemselves\b/g, _consCap(g.self));
  t = t.replace(/\bthem\b/g, g.obj).replace(/\bThem\b/g, _consCap(g.obj));
  return t;
}
/* rewrite one action block: track the running subject (the last sentence that
   named exactly ONE cast member); they/them under a gendered subject is
   rewritten, under a genuinely-they/them character it's left alone, with no
   resolvable subject it's flagged. */
function _consFixBlockPronouns(text, cast){
  const sentences = String(text||"").split(/(?<=[.!?…])\s+/);
  let subject = null, changed = false, ambiguous = 0;
  const out = sentences.map(s=>{
    const named = cast.filter(c=> new RegExp("\\b"+_consEsc(c.name)+"(?:'s)?\\b","i").test(s));
    if(named.length===1) subject = named[0];
    else if(named.length>1) subject = null;
    if(!/\b(they|them|their|theirs|themselves)\b/i.test(s)) return s;
    if(/\b(both|two of them|all of them)\b/i.test(s)) return s;
    if(!subject){ ambiguous++; return s; }
    if(!subject.g) return s;                       // character IS they/them — correct as written
    changed = true;
    return _consRewriteSentence(s, subject.g);
  });
  return { text: out.join(" "), changed, ambiguous };
}
const _CONS_CARRY = /\b(cups?|cupped|holds?|held|lifts?|lifted|carries|carried|cradles?|cradled|grips?|gripped|clutch(?:es)?|clutched|draws?|drew|pockets?|pocketed|clasps?|clasped|raises?|raised|snatch(?:es)?|snatched|grabs?|grabbed)\b/i;
const _CONS_FIXTURE = /\b(strung|hung|hangs?|hanging|mounted|nailed|bolted|anchored|staked|planted|stands|built into|embedded|fixed to)\b/i;
const _consWords = (name)=> String(name||"").toLowerCase().split(/[^a-z0-9-]+/).filter(w=>w.length>3);
function _consMentions(text, prop){
  const t = String(text||"").toLowerCase();
  const head = (typeof propHeadNoun==="function" ? propHeadNoun(prop.name) : "");
  return (head && t.indexOf(head)>=0) || _consWords(prop.name).some(w=> t.indexOf(w)>=0);
}
const _consTruncated = (v)=> { const t=String(v||"").trim(); return t.length>=180 && /[A-Za-z]$/.test(t) && !/(etc|vs|no)\.$/.test(t); };

/* optimal-string-alignment distance (Levenshtein + adjacent transposition) —
   tiny strings only; powers the cast-name spelling lint ("Plamer"→"Palmer"=1). */
function _consOSA(a,b){
  const m=a.length,n=b.length; if(Math.abs(m-n)>2) return 9;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    const c = a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+c);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j], d[i-2][j-2]+1);
  }
  return d[m][n];
}
async function agentConsistency(ctx){
  const MAX_CARDS = 12;
  const bible = ctx.bible || { props:[], locations:[], shots:[], patchProp:()=>{}, patchLocation:()=>{} };
  const cast = ctx.model.characters.map(c=>({ id:c.id, name:c.name, styleKey:c.renderStyleKey||"",
    g:_CONS_GENDER[String(c.pronouns||"").toLowerCase().trim()]||null, pronouns:c.pronouns||"" }));
  const drafted = ctx.model.scenes.slice().sort((a,b)=>(a.no||0)-(b.no||0))
    .filter(s=> ctx.model.drafts[s.id] && (ctx.model.drafts[s.id].blocks||[]).length);
  ctx.emit({k:"plan", t:"Auditing "+drafted.length+" drafted scene"+(drafted.length===1?"":"s")+" — the script and beats are canon; props, locations, staging, styles and pronouns are diffed against them. No model calls, so this pass is free."});
  if(!drafted.length){ ctx.emit({k:"done", t:"No drafted scenes to audit yet — write or draft a scene first."}); return; }
  let cards = 0, flags = 0, fixes = 0;

  /* 0.4 — TIME-OF-DAY CONTINUITY: consecutive scenes whose sluglines hard-flip the
     clock (DAY→NIGHT or back) with no time-passage cue in either scene read as a
     continuity error on screen — professional scripts either signal the jump
     ("LATER", "the next morning") or keep the clock. Conservative: only DAY-class ↔
     NIGHT-class flips are flagged, and any passage cue in either scene's slugline,
     summary or script clears it. Flag-only (a judgement call, never auto-fixed). */
  (function(){
    const cls = (loc)=>{ const m=String(loc||"").toUpperCase();
      if(/\b(NIGHT|EVENING|DUSK|MIDNIGHT)\b/.test(m)) return "NIGHT";
      if(/\b(DAY|MORNING|DAWN|NOON|AFTERNOON)\b/.test(m)) return "DAY";
      return null; };
    const cue = /\b(later|earlier|next (morning|day|night|evening)|that (night|evening|morning|afternoon)|hours?|dawn|sunset|sunrise|nightfall|midnight|the following|by (night|day|morning|evening)|after dark|days? (pass|later)|weeks? (pass|later)|months? (pass|later)|meanwhile|same time|continuous)\b/i;
    let n=0;
    for(let i=1; i<drafted.length && n<5; i++){
      const a=drafted[i-1], b=drafted[i];
      const ca=cls(a.loc), cb=cls(b.loc);
      if(!ca || !cb || ca===cb) continue;
      const textA=((ctx.model.drafts[a.id]||{}).blocks||[]).map(x=>x.text).join(" ").slice(-400);
      const textB=((ctx.model.drafts[b.id]||{}).blocks||[]).map(x=>x.text).join(" ").slice(0,600);
      const hay=[a.loc,b.loc,a.summary||"",b.summary||"",textA,textB].join(" · ");
      if(cue.test(hay)) continue;
      n++; flags++;
      ctx.emit({k:"flag", t:"Sc "+a.no+" ("+ca+") → Sc "+b.no+" ("+cb+"): the clock hard-flips with no time-passage cue in either scene. Signal the jump (“LATER”, “the next morning” in the slugline or action) or align the sluglines’ time of day."});
    }
  })();

  for(const scene of drafted){
    if(ctx.cancelled()) return;
    const draft = ctx.model.drafts[scene.id];
    const blocks = draft.blocks||[];
    const scriptText = blocks.map(b=>b.text).join(" ");
    const sceneProps = bible.props.filter(p=> Array.isArray(p.scenes) && p.scenes.indexOf(scene.id)>=0);
    const loc = (typeof locationForScene==="function") ? locationForScene(bible.locations, scene.id) : null;
    const sceneShots = bible.shots.filter(sh=> sh.sceneId===scene.id);
    const rosterIds = (typeof sceneRoster==="function") ? sceneRoster(scene, ctx.model.characters, ctx.model.drafts, sceneShots) : [];
    const sceneIssues = [];

    /* 0.2 — CAST-NAME SPELLING: hand edits misspell names ("Winson", "PLAMER"),
       and a misspelled name silently breaks scene-roster detection, identity
       references and renders. A capitalized token that NEAR-matches one cast
       name part (edit distance 1, or 2 for 7+ letters, same first letter) and
       exactly matches NO cast/prop/location word is almost certainly a typo —
       one approval fixes every occurrence in the scene's script AND beats.
       Deterministic, no model calls. */
    if(cards < MAX_CARDS){
      const bmSp = ctx.model.beats[scene.id] || {};
      const beatText = [bmSp.desire,bmSp.obstacle,bmSp.driverLabel,bmSp.reactorLabel]
        .concat((bmSp.rows||[]).reduce((a,r)=>a.concat([r.drive&&r.drive.a,r.drive&&r.drive.d,r.react&&r.react.a,r.react&&r.react.d]),[]))
        .filter(Boolean).join(" ");
      const hay = scriptText+" "+beatText;
      const legit = new Set();
      const addParts=(nm)=>String(nm||"").split(/[^A-Za-z']+/).forEach(w=>{ if(w) legit.add(w.toLowerCase()); });
      cast.forEach(c=>addParts(c.name));
      bible.props.forEach(pp=>addParts(pp.name));
      bible.locations.forEach(l=>addParts(l.name));
      addParts(scene.loc); addParts(scene.title);
      const nameParts=[]; cast.forEach(c=>String(c.name||"").split(/[^A-Za-z']+/).forEach(w=>{ if(w.length>=4) nameParts.push({ part:w, name:c.name }); }));
      // common capitalized-at-sentence-start words that sit one letter from many
      // names — never propose these ("Water" is not a typo of WALTER)
      const STOP=new Set(("water,walter,there,their,then,than,them,they,when,where,what,while,which,would,could,should,about,after,before,"+
        "again,against,under,over,other,every,never,going,being,doing,having,taking,making,coming,leaving,looking,turning,morning,"+
        "night,light,right,street,shop,door,counter,first,last,still,while,white,black,brown,green,grey,gray,stone,house,hands,"+
        "watch,watches,words,world,thing,things,place,front,behind,beside,inside,outside,through,across,around,toward,towards").split(","));
      const seenTok=new Set(); const typos=[];
      (hay.match(/\b[A-Za-z][A-Za-z']{3,}\b/g)||[]).forEach(tok=>{
        const low=tok.toLowerCase();
        if(seenTok.has(low)) return; seenTok.add(low);
        if(legit.has(low) || STOP.has(low)) return;
        for(const pd of nameParts){
          const pl=pd.part.toLowerCase();
          if(pl[0]!==low[0]) continue;
          const dist=_consOSA(low,pl);
          if(dist>0 && dist<=(pl.length>=7?2:1)){ typos.push({ tok, part:pd.part, name:pd.name }); break; }
        }
      });
      for(const t of typos.slice(0,3)){
        if(ctx.cancelled()) return;
        if(cards>=MAX_CARDS) break;
        cards++;
        const rx = new RegExp("\\b"+t.tok.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","g");
        const rep = (t.tok===t.tok.toUpperCase()) ? t.part.toUpperCase() : t.part;
        const count=(hay.match(rx)||[]).length;
        const ok = await ctx.propose({ title:"Sc "+scene.no+" \u2014 \u201c"+t.tok+"\u201d looks like a misspelling of "+t.name.toUpperCase(),
          reason:"\u201c"+t.tok+"\u201d appears "+count+"\u00d7 in this scene's script/beats but exactly matches no cast, prop or location name \u2014 a letter away from "+t.name.toUpperCase()+". A misspelled name breaks roster detection, identity references and renders.",
          rationale:"Approve to replace every \u201c"+t.tok+"\u201d in Sc "+scene.no+"'s script and beats with \u201c"+rep+"\u201d. Reject if it's intentional (a nickname or different person) \u2014 then add them properly in the Writers' Room instead.",
          before:t.tok+" \u00d7"+count, after:rep });
        if(ctx.cancelled()) return;
        if(ok){
          const fix=(x)=> typeof x==="string" ? x.replace(rx,rep) : x;
          ctx.model.drafts[scene.id] = { ...draft, blocks: blocks.map(b=>({ ...b, text:fix(b.text) })) };
          const nb = ctx.model.beats[scene.id];
          if(nb){ ctx.model.beats[scene.id] = { ...nb, desire:fix(nb.desire), obstacle:fix(nb.obstacle),
            driverLabel:fix(nb.driverLabel), reactorLabel:fix(nb.reactorLabel),
            rows:(nb.rows||[]).map(r=>({ ...r,
              drive:{ ...(r.drive||{}), a:fix(r.drive&&r.drive.a), d:fix(r.drive&&r.drive.d) },
              react:{ ...(r.react||{}), a:fix(r.react&&r.react.a), d:fix(r.react&&r.react.d) } })) }; }
          ctx.sync(); fixes++;
          ctx.emit({k:"ok", t:"Sc "+scene.no+": \u201c"+t.tok+"\u201d \u2192 \u201c"+rep+"\u201d \u2014 "+count+" occurrence"+(count===1?"":"s")+" fixed."});
        }
      }
    }

    /* 0 — BEAT MAPPING: the drafting model sometimes tags script blocks by POSITION
       (one beat per block, tail unmapped) instead of content. Shots, storyboards and
       dialogue-speaker lookups all read the script through these tags, so drift here
       skews everything downstream. Free, deterministic re-alignment (realignBlockBeats)
       — content match, story order preserved, script text untouched. */
    const bmEntry = ctx.model.beats[scene.id] || {};
    if(typeof window.realignBlockBeats==="function" && (bmEntry.rows||[]).length && blocks.length && cards<MAX_CARDS){
      const fixed = window.realignBlockBeats(blocks, bmEntry);
      const moved = fixed.reduce((a,b,i)=> a + ((blocks[i] && Number(blocks[i].beat)!==Number(b.beat)) ? 1 : 0), 0);
      if(moved >= 2){
        cards++;
        const ok = await ctx.propose({ title:"Sc "+scene.no+" — script blocks mis-mapped to beats",
          reason: moved+" of "+blocks.length+" script blocks carry the wrong beat number, so shot cards, storyboards and dialogue-speaker lookups read the wrong script excerpt for their beat.",
          rationale:"Re-maps every block to the beat whose drive/reaction it actually dramatizes (content match, story order preserved). The script text itself is untouched — only the margin mapping changes.",
          before:"beat tags: "+blocks.map(b=> b.beat==null ? "—" : b.beat).join(" · "),
          after:"beat tags: "+fixed.map(b=>b.beat).join(" · ") });
        if(ctx.cancelled()) return;
        if(ok){ ctx.model.drafts[scene.id] = { ...draft, blocks:fixed }; ctx.sync(); fixes++;
          ctx.emit({k:"ok", t:"Sc "+scene.no+": beat mapping re-aligned — "+moved+" block"+(moved===1?"":"s")+" re-tagged."}); }
      }
    }

    /* 1 — PRONOUNS: they/them action lines under a gendered character starve the
       image & video models of usable info. */
    let pronounBlocks = [], ambiguous = 0;
    blocks.forEach((b,i)=>{
      if(b.type!=="action") return;
      const r = _consFixBlockPronouns(b.text, cast);
      ambiguous += r.ambiguous;
      if(r.changed) pronounBlocks.push({ i, before:b.text, after:r.text });
    });
    if(pronounBlocks.length && cards<MAX_CARDS){
      cards++;
      const ok = await ctx.propose({
        title:"Scene "+scene.no+" — use the cast's real pronouns",
        reason:pronounBlocks.length+" action line"+(pronounBlocks.length===1?"":"s")+" say they/them for a character whose sheet is gendered — ambiguous for the image and video models.",
        rationale:"Rewritten from the cast bible ("+cast.filter(c=>c.g).map(c=>c.name+" "+c.pronouns).join(", ")+"). Characters whose pronouns really are they/them are left untouched.",
        before:pronounBlocks.map(p=>p.before).join("\n\n"),
        after:pronounBlocks.map(p=>p.after).join("\n\n") });
      if(ok){
        const nb = blocks.map((b,i)=>{ const p = pronounBlocks.find(x=>x.i===i); return p ? {...b, text:p.after} : b; });
        ctx.model.drafts[scene.id] = {...draft, blocks:nb, edited:true};
        ctx.sync(); fixes++;
        ctx.emit({k:"ok", t:"Scene "+scene.no+": pronouns now match the cast bible."});
      }
    }
    if(ambiguous){ flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · "+ambiguous+" sentence"+(ambiguous===1?"":"s")+" use they/them with no clear subject — name who acts so the shot prompts stay unambiguous."}); }

    if(ctx.cancelled()) return;

    /* 2 — PROP TYPE vs the script's verbs: cupped/lifted/carried by someone ⇒ a
       carried prop with that owner; strung/mounted/planted ⇒ set dressing. */
    for(const p of sceneProps){
      if(ctx.cancelled()) return;
      const sentences = scriptText.split(/(?<=[.!?…])\s+/).filter(s=> _consMentions(s,p));
      if(!sentences.length){
        flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · \""+p.name+"\" is mapped to this scene but the script never names it — stale mapping, or the script lost it."});
        continue;
      }
      let carrier = null, fixture = false;
      // the carry verb must act ON THIS PROP (verb directly before its noun) — a shared
      // sentence isn't evidence ("Morwen lifts the flower toward the lantern" must never
      // flag the LANTERN as carried)
      const heads = [(typeof propHeadNoun==="function" ? propHeadNoun(p.name) : ""), ..._consWords(p.name)].filter(Boolean);
      const carryOnProp = new RegExp(_CONS_CARRY.source.replace(/^\\b|\\b$/g,"")+"\\s+(?:\\w+\\s+){0,3}?(?:"+heads.map(_consEsc).join("|")+")","i");
      sentences.forEach(s=>{
        if(carryOnProp.test(s)){ const who = cast.find(c=> new RegExp("\\b"+_consEsc(c.name)+"\\b","i").test(s)); if(who) carrier = carrier||who; }
        if(_CONS_FIXTURE.test(s)) fixture = true;
      });
      if(carrier && fixture){ flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · \""+p.name+"\": the script shows it both handled and fixed in place — decide its home yourself."}); }
      else if(carrier && (p.kind!=="carried" || p.ownerId!==carrier.id) && cards<MAX_CARDS){
        cards++;
        const ok = await ctx.propose({
          title:"Scene "+scene.no+" — \""+p.name+"\" is carried by "+carrier.name,
          reason:"The script shows "+carrier.name+" handling it (“"+sentences.find(s=>_CONS_CARRY.test(s)).trim().slice(0,110)+"”) but the card says "+(p.kind==="dressing"?"set dressing":(p.kind||"carried")+(p.ownerName?" · "+p.ownerName:" · unassigned"))+".",
          rationale:"An object a character handles is a prop with an owner — never part of the location. Its sheet will reference "+carrier.name+"'s look.",
          before:(p.kind==="dressing"?"Set dressing":_consCap(p.kind||"carried"))+(p.ownerName?" · "+p.ownerName:p.kind==="dressing"?"":" · unassigned"),
          after:"Carried · "+carrier.name });
        if(ok){ bible.patchProp(p.id, { kind:"carried", kindSet:true, ownerId:carrier.id, ownerName:carrier.name, locationId:"" }); fixes++;
          ctx.emit({k:"ok", t:"\""+p.name+"\" → carried · "+carrier.name+"."}); }
      }
      else if(!carrier && fixture && p.kind!=="dressing" && cards<MAX_CARDS){
        cards++;
        const ok = await ctx.propose({
          title:"Scene "+scene.no+" — \""+p.name+"\" is part of the set",
          reason:"The script shows it fixed in place, but the card says "+(p.kind||"carried")+(p.ownerName?" · "+p.ownerName:"")+".",
          rationale:"Fixtures render into the location plate and inherit its style — they don't need a hand or an owner.",
          before:_consCap(p.kind||"carried")+(p.ownerName?" · "+p.ownerName:""),
          after:"Set dressing"+(loc?(" · fixture of "+loc.name):"") });
        if(ok){ bible.patchProp(p.id, { kind:"dressing", kindSet:true, ownerId:"", ownerName:"", locationId:(loc&&loc.id)||"" }); fixes++;
          ctx.emit({k:"ok", t:"\""+p.name+"\" → set dressing"+(loc?(" at "+loc.name):"")+"."}); }
      }
      /* dressing prop with no home, in a scene that resolves to one location */
      if(p.kind==="dressing" && !p.locationId && loc && cards<MAX_CARDS){
        cards++;
        const ok = await ctx.propose({
          title:"\""+p.name+"\" — pin its location",
          reason:"It's set dressing with no place to live, so it can't bake into any plate.",
          rationale:"Scene "+scene.no+" resolves to "+loc.name+" — the obvious home.",
          before:"Set dressing · no location", after:"Set dressing · fixture of "+loc.name });
        if(ok){ bible.patchProp(p.id, { locationId:loc.id }); fixes++; ctx.emit({k:"ok", t:"\""+p.name+"\" pinned to "+loc.name+"."}); }
      }
      /* owner not in the scene */
      if((p.kind==="carried"||p.kind==="worn") && p.ownerId && rosterIds.length && rosterIds.indexOf(p.ownerId)<0){
        flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · \""+p.name+"\" belongs to "+(p.ownerName||"someone")+", who isn't in this scene — check who actually has it here."});
      }
    }

    /* 3 — HANDHELD PROP BAKED INTO THE LOCATION: the giant-Moonpetal bug. */
    if(loc){
      const held = sceneProps.filter(p=> p.kind==="carried"||p.kind==="worn");
      const stg = (typeof stagingOf==="function") ? stagingOf(loc) : (loc.staging||{});
      const fields = [["architecture",loc.architecture],["materials",loc.materials],["lighting",loc.lighting],["significance",loc.significance],
        ["staging · background center",stg.bg&&stg.bg.center],["staging · background left",stg.bg&&stg.bg.left],["staging · background right",stg.bg&&stg.bg.right],
        ["staging · midground left",stg.mid&&stg.mid.left],["staging · midground right",stg.mid&&stg.mid.right]];
      held.forEach(p=>{
        const hits = fields.filter(([lab,v])=> v && _consMentions(v,p));
        if(hits.length){ flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · "+loc.name+"'s "+hits.map(h=>h[0]).join(", ")+" mention"+(hits.length===1?"s":"")+" \""+p.name+"\" — but the script shows it "+(p.kind==="worn"?"worn":"in a character's hands")+". Re-draft the location (the drafter now knows the rule) or edit the field so the prop isn't baked into the set at the wrong scale."}); }
      });
      /* truncated bible fields */
      [["architecture",loc.architecture],["materials",loc.materials],["lighting",loc.lighting],["significance",loc.significance]].forEach(([lab,v])=>{
        if(_consTruncated(v)){ flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · "+loc.name+"'s "+lab+" ends mid-sentence (“…"+String(v).trim().slice(-40)+"”) — an old draft cap cut it off; re-draft or finish the line."}); }
      });
    } else {
      flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · no location card resolves to this scene — the Location Scout can pull it from the slugline."});
    }

    /* 4 — RENDER-STYLE agreement: one film, one language. */
    const styled = []
      .concat(loc?[{kind:"loc", id:loc.id, name:loc.name, key:loc.renderStyleKey||""}]:[])
      .concat(rosterIds.map(id=>{ const c=cast.find(x=>x.id===id); return c&&{kind:"char", id:c.id, name:c.name, key:c.styleKey}; }).filter(Boolean))
      .concat(sceneProps.filter(p=>p.kind!=="worn").map(p=>({kind:"prop", id:p.id, name:p.name, key:p.renderStyleKey||""})))
      .filter(e=>e.key);
    const tally = {}; styled.forEach(e=>{ tally[e.key]=(tally[e.key]||0)+1; });
    const majority = Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    const odd = styled.filter(e=>e.key!==majority);
    if(majority && odd.length && cards<MAX_CARDS){
      cards++;
      const lab = (k)=>{ const o=(window.CHAR_RENDER_STYLE_OPTIONS||[]).find(x=>x.key===k); return o?o.label.replace(/^[🔒🌐]\s*/,""):k; };
      const ok = await ctx.propose({
        title:"Scene "+scene.no+" — "+odd.length+" card"+(odd.length===1?"":"s")+" speak a different render style",
        reason:"Most of this scene renders as \""+lab(majority)+"\", but "+odd.map(e=>e.name).join(", ")+" "+(odd.length===1?"is":"are")+" set to something else — frames will clash.",
        rationale:"Align the odd ones to the scene's majority. Pick a different style anytime from any card's dropdown.",
        before:odd.map(e=>e.name+" · "+lab(e.key)).join("\n"),
        after:odd.map(e=>e.name+" · "+lab(majority)).join("\n") });
      if(ok){
        odd.forEach(e=>{
          const styleText = (typeof window.renderStyleText==="function") ? window.renderStyleText(e.kind==="loc"?"loc":e.kind==="prop"?"prop":"char", majority) : "";
          if(e.kind==="prop") bible.patchProp(e.id, { renderStyleKey:majority, renderStyle:styleText });
          else if(e.kind==="loc") bible.patchLocation(e.id, { renderStyleKey:majority, renderStyle:styleText });
          else { const ch = ctx.model.characters.find(c=>c.id===e.id); if(ch){ ch.renderStyleKey=majority; ch.renderStyle=styleText; } }
        });
        if(odd.some(e=>e.kind==="char")) ctx.sync();
        fixes++; ctx.emit({k:"ok", t:"Scene "+scene.no+" now renders in one style."});
      }
    }

    /* 4b — WARDROBE DRIFT: a garment the script puts ON a character ("slides the
       knife back into his apron pocket") that the sheet's wardrobe doesn't carry —
       the sheet then renders the scene's continuity home missing. Deterministic:
       possessive + garment lexicon, attributed to the nearest PRECEDING cast name
       whose gender matches the possessive (the explicit-pronoun house rule makes
       that reliable). Approval appends the garment to the wardrobe field(s);
       regenerating the sheet stays the user's call (credits). */
    {
      const GARMENT_RX = /\b(his|her)\s+(?:[a-z][a-z-]*\s+){0,2}?(apron|hood|scarf|glove|gloves|mittens?|cap|hat|beanie|coat|overcoat|jacket|vest|waistcoat|boots|helmet|uniform|veil|cardigan|jumper|sweater|hoodie|overalls?|robe|cloak|gown|belt|sash|shawl|balaclava)\b/gi;
      // name forms per cast member: full name + tokens UNIQUE to them (a shared
      // family name must never claim the garment — the surname-safe rule)
      const _tok = (n)=>String(n||"").toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>=3);
      const _tokCount = {}; cast.forEach(c=> Array.from(new Set(_tok(c.name))).forEach(w=>{ _tokCount[w]=(_tokCount[w]||0)+1; }));
      const _forms = (c)=>{ const full=String(c.name||"").toLowerCase().trim();
        return Array.from(new Set([full, ..._tok(full).filter(w=>_tokCount[w]===1)])).filter(Boolean); };
      const lowText = scriptText.toLowerCase();
      const seenWd = new Set();
      let m2;
      GARMENT_RX.lastIndex = 0;
      while((m2 = GARMENT_RX.exec(scriptText))){
        const wantG = m2[1].toLowerCase()==="his" ? "m" : "f";
        const garment = m2[2].toLowerCase();
        // nearest preceding cast name with the matching gender
        let best = null;
        cast.forEach(c=>{
          if(!c.g || c.g!==wantG) return;
          _forms(c).forEach(nm=>{
            let from = 0, at = -1;
            while(true){ const i = lowText.indexOf(nm, from); if(i<0 || i>=m2.index) break; at = i; from = i+1; }
            if(at>=0 && (!best || at>best.at)) best = { at, c };
          });
        });
        if(!best) continue;
        const ch = ctx.model.characters.find(x=>x.id===best.c.id);
        if(!ch) continue;
        const stem = garment.replace(/s$/,"");
        const key = ch.id+"#"+stem;
        if(seenWd.has(key)) continue; seenWd.add(key);
        const have = ((ch.wardrobe||"")+" "+(ch.wardrobeMask||"")+" "+(ch.accessories||"")+" "+(ch.look||"")).toLowerCase();
        if(have.indexOf(stem)>=0) continue;
        if(cards>=MAX_CARDS) break;
        cards++;
        const excerpt = scriptText.slice(Math.max(0,m2.index-60), m2.index+m2[0].length+20).trim();
        const ok = await ctx.propose({
          title:"Wardrobe drift — "+ch.name+" has no "+stem,
          reason:"Sc "+scene.no+" puts a "+stem+" on "+ch.name+" (\u201c\u2026"+excerpt.slice(0,110)+"\u2026\u201d) but their sheet's wardrobe doesn't carry one — the sheet renders the script's continuity home missing.",
          rationale:"Approve to append \u201ca worn "+stem+"\u201d to "+ch.name+"'s wardrobe so every future sheet and shot includes it. Regenerate the sheet when ready (not done automatically — it spends credits). Reject if the "+stem+" is scene-specific — then add it as an APPEARANCE STATE on the card instead.",
          before:(ch.wardrobeMask||ch.wardrobe||"(no wardrobe yet)").slice(0,90),
          after:"+ a worn "+stem });
        if(ctx.cancelled()) return;
        if(ok){
          const add = ", a worn "+stem;
          const i = ctx.model.characters.findIndex(x=>x.id===ch.id);
          if(i>=0){
            const cur = ctx.model.characters[i];
            const patch = {};
            if((cur.wardrobe||"").trim()) patch.wardrobe = cur.wardrobe.replace(/\.?\s*$/,"") + add;
            else patch.wardrobe = "a worn "+stem;
            if((cur.wardrobeMask||"").trim()) patch.wardrobeMask = cur.wardrobeMask.replace(/\.?\s*$/,"") + add;
            ctx.model.characters[i] = { ...cur, ...patch };
            ctx.sync(); fixes++;
            ctx.emit({k:"ok", t:ch.name+"'s wardrobe now carries the "+stem+" — regenerate their sheet to see it."});
          }
        }
      }
    }

    /* 5 — SHOTS vs the script: the scene-3 stale-coverage bug. A shot's subjects come
       from who its action text names, so coverage drafted against an OLD script can
       silently drop a character, keep dead dialogue, or dress the wrong body. */
    if(sceneShots.length){
      const subj = new Set(); sceneShots.forEach(sh=>(sh.subjects||[]).forEach(x=>subj.add(x)));
      const speakers = new Set(blocks.filter(b=>b.type==="char").map(b=>String(b.text||"").trim().toUpperCase().replace(/\s*\(.*\)$/,"")));
      rosterIds.forEach(id=>{
        if(subj.has(id)) return;
        const ch = cast.find(x=>x.id===id); if(!ch) return;
        const speaks = speakers.has(String(ch.name||"").toUpperCase());
        flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · "+ch.name+" is in this scene"+(speaks?" — with DIALOGUE —":"")+" but appears in none of its "+sceneShots.length+" shots. The coverage likely predates the script; re-draft this scene's shots."});
      });
      const _norm = (s)=> String(s||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
      const scriptDia = blocks.filter(b=>b.type==="dia").map(b=>_norm(b.text));
      const stale = sceneShots.filter(sh=>{ const d=_norm(sh.dialogue); if(!d || d.length<8) return false;
        return !scriptDia.some(x=> x.includes(d) || d.includes(x)); });
      if(stale.length){ flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · "+stale.length+" of "+sceneShots.length+" shots carry dialogue that isn't in the current script (e.g. “"+String(stale[0].dialogue||"").slice(0,60)+"”) — the shot list predates the script; re-draft the scene's coverage."}); }
      bible.props.filter(p=>p.kind==="worn" && p.ownerId).forEach(p=>{
        const hits = sceneShots.filter(sh=> _consMentions(String(sh.action||"")+" "+String(sh.composition||""), p) && (sh.subjects||[]).indexOf(p.ownerId)<0);
        if(hits.length){ flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · "+hits.length+" shot"+(hits.length===1?"":"s")+" describe \""+p.name+"\" without its owner "+(p.ownerName||"its owner")+" in frame — the item may be rendered on the wrong character; re-draft or edit those shots."}); }
        // a CLOSE-UP featuring a worn item, with no macro sheet generated: the frame
        // will invent the item's design at magnification (the owner sheet's few pixels
        // can't hold it). Report-only — generating spends credits, so it's the user's call.
        const tight = sceneShots.filter(sh=> /^(CU|MCU|ECU|INSERT)$/i.test(String(sh.size||""))
          && _consMentions(String(sh.action||"")+" "+String(sh.composition||""), p));
        if(tight.length){
          let hasSheet=false; try{ hasSheet = !!(typeof nbGetImage==="function" && nbGetImage(p.id)); }catch(e){}
          if(!hasSheet){ flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · a close-up features \""+p.name+"\" but it has no macro sheet — at CU size the frame will re-invent its design. Generate one on its prop card (built against "+(p.ownerName||"its owner")+"'s sheet) so tight shots lock the item."}); }
        }
      });
    }

    /* 6 — beat-level lint (the existing checker) */
    if(typeof beatContinuityLint==="function" && ctx.model.beats[scene.id]){
      const rosterChars = ctx.model.characters.filter(c=> rosterIds.indexOf(c.id)>=0);
      (beatContinuityLint(scene, ctx.model.beats[scene.id], sceneProps, rosterChars)||[]).forEach(f=>{
        flags++; ctx.emit({k:"flag", t:"Sc "+scene.no+" · beats · "+f.msg});
      });
    }

    if(!sceneIssues.length && !pronounBlocks.length) ctx.emit({k:"observe", t:"Scene "+scene.no+" — checked."});
  }

  /* prop spec truncation + missing sizes — film-wide, one summary flag each */
  const cut = bible.props.filter(p=> _consTruncated(p.form)||_consTruncated(p.material));
  if(cut.length){ flags++; ctx.emit({k:"flag", t:cut.length+" prop spec"+(cut.length===1?"":"s")+" end mid-sentence ("+cut.slice(0,4).map(p=>p.name).join(", ")+(cut.length>4?"…":"")+") — re-draft the card or finish the line."}); }
  const sizeless = bible.props.filter(p=> p.kind!=="worn" && !String(p.size||"").trim());
  if(sizeless.length){ flags++; ctx.emit({k:"flag", t:sizeless.length+" prop"+(sizeless.length===1?" has":"s have")+" no physical size — the scale system can't hold them steady across shots. \"Design all props\" drafts real dimensions in one pass."}); }

  if(cards>=MAX_CARDS) ctx.emit({k:"flag", t:"Stopped at "+MAX_CARDS+" proposals this run — run me again after applying to pick up the rest."});
  ctx.emit({k:"done", t:"Audit complete — "+fixes+" fix"+(fixes===1?"":"es")+" applied, "+flags+" thing"+(flags===1?"":"s")+" flagged for your judgement."+(fixes||flags?"":" Every layer agrees with the script.")});
}

const AGENTS = [
  { id:"doctor", name:"Story Doctor", icon:"stethoscope", kind:"fix",
    blurb:"Scans the spine for the weakest link \u2014 scenes that don't turn, soft peaks, flat runs \u2014 and proposes a fix for each, re-auditing until the spine holds.",
    run:agentStoryDoctor },
  { id:"consistency", name:"Consistency Check", icon:"check", kind:"fix",
    blurb:"The script and beats are canon \u2014 this audits every drafted scene's other layers against them: prop cards that contradict the script's verbs, handheld props baked into location plates, render styles that clash mid-scene, they/them action lines that starve the image models, cut-off bible fields and stale scene mappings. Free \u2014 no model calls; unambiguous repairs come back as one-click approvals.",
    run:agentConsistency },
  { id:"continuity", name:"Continuity Repair", icon:"link", kind:"fix",
    blurb:"Runs the continuity check, then plants missing setups and pays off dangling threads \u2014 re-checking after each repair until it's clean.",
    run:agentContinuityRepair },
  { id:"adapt", name:"Adaptation", icon:"flask", kind:"build", needsInput:true, ideaStarters:true,
    inputLabel:"Logline or synopsis", inputPlaceholder:"e.g. A lighthouse keeper discovers the fog is erasing the town's memories \u2014 including her own.",
    blurb:"Give it a logline and it architects the whole spine in your chosen framework \u2014 scenes, charges, beats, and screenplay, all written automatically. Blank page \u2192 finished draft.",
    run:agentAdaptation },
  { id:"tableread", name:"Table-Read", icon:"film", kind:"report",
    blurb:"Reads every drafted scene end-to-end and reports pacing, tone, and voice issues across the whole script \u2014 not scene by scene.",
    run:agentTableRead },
  { id:"breakdown", name:"Script Breakdown", icon:"clipboard", kind:"fix",
    blurb:"The 1st-AD pass: reads every written scene beat by beat and tags each character's physical details, appearance changes, props and set dressing \u2014 then enriches the cast sheets with script-only details, flags where the script's pronouns contradict a character's sheet (one-click reconcile), and warns about beats whose text isn't self-contained (an ambiguous pronoun, or a prop that drops out) before you generate. Tagged props are listed for the Props Master.",
    run:agentScriptBreakdown },
  { id:"director", name:"Storyboard Director", icon:"board", kind:"build", room:"art", autonomous:true,
    blurb:"Boards your film scene by scene \u2014 it thinks through each sheet's panels with the writing model, then renders the whole storyboard sheet with GPT Image 2. Runs on its own; press Stop anytime.",
    run:agentStoryboardDirector },
  { id:"colorist", name:"Cinematographer", icon:"palette", kind:"build", room:"art",
    blurb:"Designs your film's colour system \u2014 a bespoke palette + film stock from the story and your visual references \u2014 then color-scripts every scene along the value-charge spine and shows you why, for your approval.",
    run:agentColorist },
  { id:"shotdesigner", name:"Shot Designer", icon:"film", kind:"build", room:"art",
    blurb:"Audits your coverage scene by scene \u2014 does each scene establish wide, tighten, and land its turn on its most expressive size? \u2014 and proposes the shots to fix it, for your approval. Then hand off to \u2018Generate all shots\u2019.",
    run:agentShotDesigner },
  { id:"casting", name:"Casting Director", icon:"userScan", kind:"build", room:"art", autonomous:true,
    blurb:"Designs your whole cast on its own \u2014 drafts each character's look, finds their appearance changes, then generates the master sheet (with prop + cameo references) and every state variant. Runs autonomously; press Stop anytime.",
    run:agentCastingDirector },
  { id:"propsmaster", name:"Props Master", icon:"box", kind:"build", room:"art", autonomous:true,
    blurb:"Derives every prop the script names \u2014 worn/carried by the cast plus the set dressing in the action \u2014 drafts each spec, dedups near-duplicates, and generates the reference sheets, each owned prop referencing its owner's character sheet so it matches that character's look (runs after the cast). Runs autonomously; press Stop anytime.",
    run:agentPropsMaster },
  { id:"researcher", name:"Visual Researcher", icon:"image", kind:"build", room:"art", autonomous:true,
    blurb:"Builds the film's lookbook brief — writes the visual statement, gathers/dedupes reference touchstones (palette, lighting, lens, texture), and proposes the film's RENDER STYLE from the story (your approval sets every character/prop/location style dropdown in one pass). Use Generate all frames afterwards to render the mood frames. The colour system (the Styles tab) reads these references when it designs the palette.",
    run:agentVisualResearcher },
  { id:"locscout", name:"Location Scout", icon:"globe", kind:"build", room:"art", autonomous:true,
    blurb:"Scouts your film's locations on its own \u2014 pulls every place from the sluglines, drafts each one's staging + depth-grid spec, generates the plate, and adds the time-of-day variants the script calls for. Also flags any scene whose slugline location has no card yet. Runs autonomously; press Stop anytime.",
    run:agentLocationScout },
  { id:"scenedirector", name:"Scene Director", icon:"clapper", kind:"build", room:"art",
    blurb:"Takes a scene from shot list to a CONSISTENT set of frames: renders the shots in order as a rolling chain (each seeded by the previous frame), visually inspects each result against its seed, and repairs the drifted ones — asking before it spends on each scene.",
    run:agentSceneDirector },
  { id:"coordinator", name:"Art Department Coordinator", icon:"robot", kind:"build", room:"art", autonomous:true,
    blurb:"Runs your whole pre-production in the right order, on its own \u2014 props, then the cast that references them, then locations, then the colour system, then shot coverage, then the storyboard. One click = 'do my pre-production', end to end with no stops: the colour and shot-coverage steps are applied automatically rather than waiting for approval. Press Stop anytime.",
    run:agentDepartmentCoordinator },
];
window.AGENTS = AGENTS;
window.auditSpine = auditSpine;
window.auditCoverage = auditCoverage;
