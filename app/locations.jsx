/* locations.jsx — The Art Room ▸ Locations tab (data layer).
   Locations are DERIVED from the script's sluglines (scene.loc, e.g.
   "INT. HEART O' THE CITY HOTEL · NIGHT") so every shot set in a place can match
   one canonical reference plate. Mirrors the Props flow: derive → draft → generate.
   This file owns slugline parsing / derivation / defaults + the deterministic
   plate prompts; the React tab lives in locations-ui.jsx. */

function locSlug(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48); }

function titleCaseTime(t){ t=String(t||"").trim(); return t ? t.replace(/\b\w/g,c=>c.toUpperCase()) : ""; }

/* canonical time-of-day buckets (Continuous/Later are NOT times — excluded) */
const TIME_OF_DAY = ["Dawn","Morning","Day","Afternoon","Dusk","Evening","Night"];
window.TIME_OF_DAY = TIME_OF_DAY;
/* map a worded time / synonym to a canonical bucket ("" if not a real time of day) */
function normalizeTOD(w){
  w = String(w||"").toLowerCase().trim();
  if(/sunrise|dawn|daybreak/.test(w)) return "Dawn";
  if(/morning/.test(w)) return "Morning";
  if(/noon|midday|daytime|^day$/.test(w)) return "Day";
  if(/afternoon/.test(w)) return "Afternoon";
  if(/dusk|sunset|twilight|golden hour|magic hour/.test(w)) return "Dusk";
  if(/evening/.test(w)) return "Evening";
  if(/night|midnight|nighttime/.test(w)) return "Night";
  return "";   // continuous / later / moments later / unknown → not a time of day
}
/* map a clock time string ("18:06", "6 pm", "07:30 am") to a time-of-day bucket.
   NOTE: clock time alone can't determine dusk/dawn reliably (season + latitude),
   so we only emit broad, defensible buckets here — Dawn/Morning/Day/Evening/Night.
   Dusk/Afternoon are reserved for sluglines that say so in words. */
function clockToTimeOfDay(str){
  const m = String(str).match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
  if(!m) return "";
  let h = parseInt(m[1],10); const ap = (m[3]||"").toLowerCase();
  if(ap==="pm" && h<12) h+=12; if(ap==="am" && h===12) h=0;
  if(h<0||h>23) return "";
  if(h>=5 && h<7) return "Dawn";
  if(h>=7 && h<11) return "Morning";
  if(h>=11 && h<17) return "Day";
  if(h>=17 && h<21) return "Evening";
  return "Night";
}
window.normalizeTOD = normalizeTOD; window.clockToTimeOfDay = clockToTimeOfDay;
/* Derive ALL real times-of-day for a location, accurately, FROM THE SCRIPT ONLY.
   Source of truth = each scene's slugline trailing tag ("· NIGHT" / "· DAY"),
   read via parseSlugline so we never pick up a time-word buried in a PLACE name.
   Also honours a clock time baked into a slugline or the location name.
   Scene SUMMARIES are deliberately NOT used — they are prose ("by day a programmer,
   by night the hacker…") and produce false times. Returns the distinct buckets in
   canonical day order; [] when no scene states a real time (Continuous / Loading
   Program / Later / unknown), which correctly shows as "time unset". */
function deriveLocationTimes(l, scenes){
  const set = new Set();
  // a clock time embedded in the location name itself (e.g. "… - 18:06")
  const nameClock = String((l&&l.name)||"").match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
  if(nameClock){ const t = clockToTimeOfDay(nameClock[1]); if(t) set.add(t); }
  for(const sid of ((l&&l.scenes)||[])){
    const s = (scenes||[]).find(x=>x.id===sid);
    if(!s) continue;
    const parsed = parseSlugline(s.loc);
    if(!parsed) continue;
    let t = parsed.time ? normalizeTOD(parsed.time) : "";   // worded tag → bucket ("" for Continuous etc.)
    if(!t){                                                  // no worded time → maybe a clock time in the slug tail
      const c = String(s.loc||"").match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
      if(c) t = clockToTimeOfDay(c[1]);
    }
    if(t) set.add(t);
  }
  return TIME_OF_DAY.filter(t=>set.has(t));   // canonical order: never "Night / Day"
}
window.deriveLocationTimes = deriveLocationTimes;

/* single-value convenience (used for prompt defaults): the earliest-in-the-day time. */
function deriveLocationTime(l, scenes){ return deriveLocationTimes(l, scenes)[0] || ""; }
window.deriveLocationTime = deriveLocationTime;

/* normalise a place into a canonical display name: title-case-ish but keep short
   ALL-CAPS acronyms (FBI, CIA); collapse whitespace. Common short words (the, of,
   a, o') are lower/title-cased normally, not treated as acronyms. */
const LOC_LOWER_WORDS = /^(the|of|a|an|and|to|in|on|at|by|o'|de|la|le)$/i;
function tidyPlace(p){
  return String(p||"").trim().replace(/\s+/g," ")
    .split(" ").map((w,i)=>{
      if(LOC_LOWER_WORDS.test(w)) return i===0 ? (w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()) : w.toLowerCase();
      // genuine short acronym (all caps, no lowercase, ≤3) -> keep as-is
      if(/^[A-Z0-9'’.\-]+$/.test(w) && w.length<=3 && /[A-Z]/.test(w)) return w;
      return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();
    }).join(" ");
}

/* Parse one slugline into { intExt, place, time }.
   "INT. HEART O' THE CITY HOTEL · NIGHT" -> {intExt:"INT", place:"Heart o' the City Hotel", time:"Night"} */
function parseSlugline(raw){
  let s = String(raw||"").trim();
  if(!s) return null;
  s = s.replace(/^\s*\d+[\.\)]?\s+/,"");                 // strip a leading scene number
  let intExt = "";
  const m = s.match(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?)\s*/i);
  if(m){ intExt = m[1].toUpperCase().replace(/\./g,"").replace(/I\/E/,"INT/EXT"); s = s.slice(m[0].length); }
  // time of day: trailing segment after the LAST separator, if it reads like a time
  let time = "";
  const tm = s.match(/[\u00b7\u2014,\-]\s*([A-Za-z][A-Za-z'\s]{1,22})\s*$/);
  if(tm && /\b(night|day|dawn|dusk|morning|evening|afternoon|continuous|later|moments?\s+later|sunset|sunrise|magic\s+hour|golden\s+hour|loading\s+program)\b/i.test(tm[1])){
    time = tm[1].trim(); s = s.slice(0, tm.index).trim();
  }
  let place = s.replace(/[\u00b7\u2014,\-\s]+$/,"").trim();
  if(!place) return null;
  return { intExt, place, time: titleCaseTime(time) };
}

/* split a compound slugline place into its segments: "APARTMENT / NIGHTCLUB" -> two */
function splitCompoundPlace(place){
  return String(place||"").split(/\s*\/\s*/).map(x=>x.trim()).filter(Boolean);
}

/* Derive canonical locations from every scene's slugline.
   Groups scenes by a normalised key on the PRIMARY place so "NEBUCHADNEZZAR · CORE"
   and "NEBUCHADNEZZAR · TRAINING" land under one "Nebuchadnezzar" (areas recorded).
   Returns new location objects only (deduped against `existing`). */
function deriveLocations(scenes, existing, drafts){
  const have = existing || [];
  const seen = new Set(have.map(l=>l.key || locSlug(l.name)));
  const order = []; const byKey = {};
  (scenes||[]).forEach(sc=>{
    // the scene's own slugline, PLUS any secondary (mid-scene) sluglines the draft
    // carries — a chase that cuts INT. HALL → EXT. ROOF names real places that need
    // location cards too. INTERCUT lines are skipped (they reference already-slugged
    // places, they don't introduce one).
    const slugTexts = [sc.loc];
    const dBlocks = drafts && drafts[sc.id] && drafts[sc.id].blocks;
    if(Array.isArray(dBlocks)) dBlocks.forEach(b=>{
      if(b && b.type==="scene" && b.text && !/^\s*INTERCUT\b/i.test(b.text) && String(b.text).trim().toUpperCase()!==String(sc.loc||"").trim().toUpperCase())
        slugTexts.push(b.text);
    });
    slugTexts.forEach(slugText=>{
    const parsed = parseSlugline(slugText);
    if(!parsed) return;
    const places = splitCompoundPlace(parsed.place);
    const primary = tidyPlace(places[0]);
    const key = locSlug(primary.split(/[\u00b7\u2014,]/)[0]).split("-").slice(0,4).join("-");
    if(!key) return;
    if(!byKey[key]){ byKey[key] = {
      key, name: primary.split(/[\u00b7\u2014]/)[0].trim(),
      intExt: parsed.intExt, times: new Set(), areas: new Set(), scenes: [],
    }; order.push(key); }
    const L = byKey[key];
    if(parsed.time) L.times.add(parsed.time);
    const areaTail = primary.split(/\u00b7/).slice(1).join(" \u00b7 ").trim();
    if(areaTail) L.areas.add(areaTail);
    places.slice(1).forEach(p=> L.areas.add(tidyPlace(p)));
    if(sc.id && L.scenes.indexOf(sc.id)<0) L.scenes.push(sc.id);
    if(parsed.intExt && L.intExt && parsed.intExt!==L.intExt) L.intExt = "INT/EXT";
    });
  });
  const out = [];
  order.forEach(key=>{
    if(seen.has(key)) return;
    const L = byKey[key];
    out.push({
      id: "loc-"+key+"-"+out.length,
      key, name: L.name, intExt: L.intExt || "INT",
      times: [...L.times], areas: [...L.areas], scenes: L.scenes,
      architecture:"", materials:"", lighting:"", significance:"",
      renderStyle:"", negativePrompt:"",
      variants:[],            // time-of-day / weather variant plates
      fromScript:true,
    });
  });
  return out;
}
window.deriveLocations = deriveLocations;
window.parseSlugline = parseSlugline;
window.locSlug = locSlug;

function locationSceneText(scene, drafts){
  const bits = [scene&&scene.loc, scene&&scene.title, scene&&scene.summary, scene&&scene.objective, scene&&scene.turningPoint];
  const d = drafts && scene && drafts[scene.id];
  if(d && Array.isArray(d.blocks)) d.blocks.forEach(b=>{ if(b && b.text) bits.push(b.text); });
  return bits.filter(Boolean).join(" ").replace(/\s+/g," ").trim();
}
function locationSceneScriptText(scene, drafts){
  if(!scene) return "";
  const d = drafts && drafts[scene.id];
  if(d && Array.isArray(d.blocks) && d.blocks.length){
    return d.blocks.map(b=>{
      const t = String(b&&b.text||"").replace(/\s+/g," ").trim(); if(!t) return "";
      if(b.type==="scene") return t.toUpperCase();
      if(b.type==="char") return "\n"+t.toUpperCase();
      if(b.type==="dia") return "  "+t;
      if(b.type==="paren") return "  ("+t.replace(/^\(|\)$/g,"")+")";
      return t;
    }).filter(Boolean).join("\n");
  }
  return [scene.loc, scene.summary, scene.objective, scene.turningPoint].filter(Boolean).join("\n");
}
function locationScriptExcerpt(scene, drafts, index, radius){
  const txt = locationSceneScriptText(scene, drafts).replace(/\s+/g," ").trim();
  if(!txt) return "";
  const r = radius || 420;
  const at = Math.max(0, Math.min(Number(index)||0, txt.length));
  const start = Math.max(0, at-r);
  const end = Math.min(txt.length, at+r);
  return (start>0?"... ":"") + txt.slice(start,end).trim() + (end<txt.length?" ...":"");
}
function locationScreenplayContext(l, scenes, drafts, limit){
  const locScenes = (Array.isArray(l&&l.scenes) && l.scenes.length)
    ? (scenes||[]).filter(s=>l.scenes.indexOf(s.id)>=0)
    : (scenes||[]);
  const chunks = locScenes.map(s=>locationSceneScriptText(s, drafts)).filter(Boolean);
  const text = chunks.join("\n\n").replace(/\n{3,}/g,"\n\n").trim();
  const max = limit || 2600;
  return text.length>max ? text.slice(0,max).replace(/\s+\S*$/,"").trim()+" ..." : text;
}
window.locationSceneScriptText = locationSceneScriptText;
window.locationScreenplayContext = locationScreenplayContext;
function locationSceneForCoverageSheet(l, sheet, scenes){
  const nos = Array.isArray(sheet&&sheet.sceneNos) ? sheet.sceneNos.map(Number).filter(Number.isFinite) : [];
  const list = scenes||[];
  if(nos.length){
    const byNo = list.find(s=>nos.indexOf(Number(s.no))>=0);
    if(byNo) return byNo;
  }
  const sid = l && Array.isArray(l.scenes) && l.scenes[0];
  return list.find(s=>s.id===sid) || list[0] || null;
}
function locationScreenplayBlocks(scene, drafts){
  if(!scene) return [];
  const d = drafts && drafts[scene.id];
  if(d && Array.isArray(d.blocks) && d.blocks.length) return d.blocks.map(b=>({ ...b }));
  const out = [];
  if(scene.loc) out.push({ type:"scene", text:scene.loc });
  if(scene.summary) out.push({ type:"action", text:scene.summary });
  if(scene.objective) out.push({ type:"action", text:scene.objective });
  if(scene.turningPoint) out.push({ type:"action", text:scene.turningPoint });
  return out;
}
function locationScreenplayReferenceImages(l, sheet, scenes, drafts){
  if(typeof document==="undefined") return [];
  const scene = locationSceneForCoverageSheet(l, sheet, scenes);
  const blocks = locationScreenplayBlocks(scene, drafts);
  if(!blocks.length) return [];
  const W = 1000, H = 1294, padX = 78, padTop = 62, padBottom = 64, lineH = 20;
  const font = "15px Courier New, monospace";
  const boldFont = "700 15px Courier New, monospace";
  const lineUnits = (b)=>{
    const type = String(b&&b.type||"action");
    const text = String(b&&b.text||"").replace(/\s+/g," ").trim();
    if(!text) return [];
    const cfg = type==="char" ? { x:378, w:220, bold:true, upper:true, before:12, after:0 }
      : type==="dia" ? { x:250, w:390, before:0, after:10 }
      : type==="paren" ? { x:305, w:310, before:0, after:0 }
      : type==="trans" ? { x:650, w:230, upper:true, before:10, after:10 }
      : type==="scene" ? { x:padX, w:760, bold:true, upper:true, before:8, after:12 }
      : { x:padX, w:760, before:8, after:12 };
    const sample = document.createElement("canvas").getContext("2d");
    sample.font = cfg.bold ? boldFont : font;
    const words = (cfg.upper ? text.toUpperCase() : text).split(/\s+/);
    const lines = []; let line = "";
    words.forEach(w=>{
      const t = line ? line+" "+w : w;
      if(sample.measureText(t).width > cfg.w && line){ lines.push(line); line = w; }
      else line = t;
    });
    if(line) lines.push(line);
    return [{ blank:cfg.before }, ...lines.map(s=>({ text:s, ...cfg })), { blank:cfg.after }];
  };
  const units = [];
  const slug = blocks.find(b=>b.type==="scene");
  if(slug && !String(slug.text||"").match(/^\s*\d+\s+/) && scene && scene.no!=null)
    units.push(...lineUnits({ type:"scene", text:String(scene.no)+"  "+slug.text }));
  blocks.forEach(b=>{ if(slug && b===slug) return; units.push(...lineUnits(b)); });
  const pages = [];
  let page = [], y = padTop;
  const pushPage = ()=>{ if(page.length){ pages.push(page); page = []; y = padTop; } };
  units.forEach(u=>{
    const h = u.blank!=null ? Number(u.blank)||0 : lineH;
    if(y + h > H - padBottom){ pushPage(); }
    page.push(u); y += h;
  });
  pushPage();
  const sceneNo = scene&&scene.no!=null ? scene.no : "";
  const title = "SCENE "+sceneNo+" - "+(((scene&&scene.title)||((l&&l.name)||"LOCATION"))).toUpperCase();
  const imgs = pages.slice(0,6).map((items,pi)=>{
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"); if(!ctx) return "";
    ctx.fillStyle = "#f4f0e6"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "#151515"; ctx.font = boldFont;
    ctx.fillText(title.slice(0,86), padX, 42);
    ctx.fillText(String(pi+1), W-padX-8, 42);
    let cy = padTop;
    items.forEach(u=>{
      if(u.blank!=null){ cy += Number(u.blank)||0; return; }
      ctx.font = u.bold ? boldFont : font;
      ctx.fillStyle = "#151515";
      ctx.fillText(u.text, u.x, cy);
      cy += lineH;
    });
    ctx.fillStyle = "#8a8177"; ctx.font = "12px Courier New, monospace";
    ctx.fillText("FULL SCENE SCREENPLAY SNAPSHOT - WRITERS' ROOM TEXT", padX, H-34);
    ctx.fillText("PAGE "+(pi+1)+" OF "+pages.length, W-padX-92, H-34);
    try{ return canvas.toDataURL("image/png"); }catch(e){ return ""; }
  }).filter(Boolean);
  return imgs;
}
function locationScreenplayReferenceImage(l, sheet, scenes, drafts){
  const imgs = locationScreenplayReferenceImages(l, sheet, scenes, drafts);
  return imgs[0] || "";
}
window.locationSceneForCoverageSheet = locationSceneForCoverageSheet;
window.locationScreenplayReferenceImages = locationScreenplayReferenceImages;
window.locationScreenplayReferenceImage = locationScreenplayReferenceImage;
function locationMasterPanelPlan(l, scenes, drafts){
  const sheets = (typeof deriveLocationCoverageSheets==="function") ? deriveLocationCoverageSheets(l, scenes||[], drafts||{}) : [];
  const roles = sheets.map(s=>String(s.role||"").toUpperCase());
  const mixed = roles.indexOf("INT")>=0 && roles.indexOf("EXT")>=0;
  if(!mixed) return null;
  const firstRole = String((sheets[0]&&sheets[0].role)||"EXT").toUpperCase();
  const extName = (sheets.find(s=>String(s.role).toUpperCase()==="EXT")||{}).name || ((l&&l.name)||"Location")+" Exterior";
  const intName = (sheets.find(s=>String(s.role).toUpperCase()==="INT")||{}).name || ((l&&l.name)||"Location")+" Interior";
  const threshold = "the visible threshold/sightline relationship between "+extName+" and "+intName+" — windows, glass, doors, booth walls, openings, approach path and eyeline geometry must line up";
  if(firstRole==="INT") return {
    layout: "exactly 4 views in a 2x2 grid, planned from the screenplay's first playable space",
    top_left: "INTERIOR establishing view of "+intName+" because the action starts inside — show the empty working room, floor, walls, openings and usable blocking space",
    top_right: "INTERIOR key action station from the screenplay — desk/terminal/counter/work surface or the practical area where the first business plays",
    bottom_left: "EXTERIOR context of "+extName+" seen from the connected approach or through the relevant opening, matching the interior's sightlines",
    bottom_right: "THRESHOLD CONNECTION view: "+threshold,
    rule: "the four panels are one coherent real location with matched scale, materials, light direction and geography; no actors, no action, no text",
  };
  return {
    layout: "exactly 4 views in a 2x2 grid, planned from the screenplay's first playable space",
    top_left: "EXTERIOR wide establishing view of "+extName+" because the scene opens outside — show the whole playable geography, approach, ground plane, weather and major landmarks",
    top_right: "EXTERIOR-to-INTERIOR relationship view: "+threshold,
    bottom_left: "INTERIOR establishing view of "+intName+" — the empty room/subspace the script later plays inside, with working surfaces and openings",
    bottom_right: "key close/detail from the screenplay that proves the location can stage the action: terminal, desk, counter, rack, window/glass, doorway or other named functional feature",
    rule: "the four panels are one coherent real location with matched scale, materials, light direction and geography; no actors, no action, no text",
  };
}
window.locationMasterPanelPlan = locationMasterPanelPlan;
function _locSheetId(role, name){
  const k = locSlug(name).split("-").slice(0,4).join("-") || role.toLowerCase();
  return "cov-"+role.toLowerCase()+"-"+k;
}
function _locSideCueIndex(text, role){
  const s = String(text||"");
  const re = role==="INT"
    ? /\b(inside|interior|within|booth|room|office|building|kiosk|cab|cabin|car|vehicle|lobby|hall|shop|store|terminal|control room|desk|counter|console|lamp)\b/i
    : /\b(outside|exterior|facade|front|street|yard|parking|rain|pavement|road|approach|rack|racks)\b/i;
  const i = s.search(re);
  return i>=0 ? i : 999999;
}
function deriveLocationCoverageSheets(l, scenes, drafts){
  if(!l) return [];
  const clean = (s,n)=>{ const x=String(s||"").replace(/\s+/g," ").trim();
    return (typeof clipWords==="function") ? clipWords(x,n||180) : x.slice(0,n||180); };
  const locScenes = (Array.isArray(l.scenes) && l.scenes.length)
    ? (scenes||[]).filter(s=>l.scenes.indexOf(s.id)>=0)
    : (scenes||[]);
  const sceneTexts = locScenes.map((s,i)=>{
    const script = locationSceneScriptText(s, drafts);
    const bodyScan = locationScreenplayBlocks(s, drafts).filter(b=>b&&b.type!=="scene").map(b=>b.text).join(" ").replace(/\s+/g," ").trim();
    const prose = locationSceneText(s, drafts);
    return { scene:s, i, text:prose, script, bodyScan, scan:script || prose };
  });
  const text = sceneTexts.map(s=>s.scan).join(" ").replace(/\s+/g," ").trim();
  if(!text) return [];
  const baseName = l.name || "Location";
  const out = [];
  const add = (role, name, summary, triggers, order, scene, scriptExcerpt)=>{
    const id = _locSheetId(role, name);
    const sceneNo = scene && scene.no;
    const existing = out.find(v=>v.id===id);
    if(existing){
      if(Number(order)<Number(existing.order||999999)) existing.order = order;
      if(scriptExcerpt && !existing.scriptExcerpt) existing.scriptExcerpt = clean(scriptExcerpt,720);
      if(sceneNo!=null && existing.sceneNos.indexOf(sceneNo)<0) existing.sceneNos.push(sceneNo);
      return;
    }
    out.push({ id, role, name:clean(name,64), summary:clean(summary,260), order:Number(order)||0,
      sceneNos: sceneNo!=null ? [sceneNo] : [],
      scriptExcerpt: clean(scriptExcerpt,720),
      triggerWords:Array.from(new Set((triggers||[]).map(x=>String(x||"").toLowerCase()).filter(Boolean))).slice(0,10),
      fromScript:true });
  };
  const intExt = String(l.intExt||"").toUpperCase();
  const mentionsSubspace = /\b(?:inside|within|in)\s+(?:the\s+|a\s+|an\s+)?[A-Za-z0-9'’ -]{2,44}?\b(?:booth|room|office|building|kiosk|cab|cabin|car|vehicle|lobby|hall|shop|store|terminal|control room|desk|counter)\b/i.test(text)
    || (/\bbooth\b/i.test(text) && /\b(?:glass|window|terminal|desk|counter|keyboard|monitor|console|lamp)\b/i.test(text));
  const mixedSides = intExt==="INT/EXT" || (/(^|\/)INT(\/|$)/.test(intExt) && /(^|\/)EXT(\/|$)/.test(intExt)) || mentionsSubspace;
  sceneTexts.forEach(entry=>{
    const s = entry.scene;
    const baseOrder = entry.i * 100000;
    const parsed = parseSlugline(s&&s.loc);
    const sceneRole = String(parsed&&parsed.intExt||intExt).toUpperCase();
    const body = entry.bodyScan || entry.scan || "";
    const firstInt = _locSideCueIndex(body, "INT");
    const firstExt = _locSideCueIndex(body, "EXT");
    const cueOrder = (role)=>{
      const own = role==="INT" ? firstInt : firstExt;
      const other = role==="INT" ? firstExt : firstInt;
      if(own<999999) return baseOrder + own + 1;
      // A slugline side still needs a sheet, but if the first playable action cues
      // the opposite side, let that opposite side lead the list.
      if(other<999999) return baseOrder + other + 2;
      return baseOrder + (role==="EXT" ? 0 : 1);
    };
    if(mixedSides && /EXT/.test(sceneRole)){
      add("EXT", baseName+" Exterior",
        "Exterior side required by the screenplay: render the empty outside of "+baseName+" with its approach, openings, weather, ground plane and sightline toward any interior side named by the scene.",
        ["outside","exterior","facade","front","street","yard","rain","window","glass"],
        cueOrder("EXT"), s, locationScriptExcerpt(s, drafts, firstExt<999999?firstExt:0));
    }
    if(mixedSides && /INT/.test(sceneRole)){
      add("INT", baseName+" Interior",
        "Interior side required by the screenplay: render the empty inside of "+baseName+" with the working areas, fixtures, openings and sightlines the scene plays through.",
        ["inside","interior","room","booth","window","glass","terminal","desk","counter"],
        cueOrder("INT"), s, locationScriptExcerpt(s, drafts, firstInt<999999?firstInt:0));
    }
    const insideM = entry.scan.match(/\b(?:inside|within|in)\s+(?:the\s+|a\s+|an\s+)?([A-Za-z0-9'’ -]{2,44}?\b(?:booth|room|office|building|kiosk|cab|cabin|car|vehicle|lobby|hall|shop|store|terminal|control room|desk|counter))\b/i);
    const throughGlass = /\b(?:through|behind|inside|beyond)\s+(?:the\s+)?(?:glass|window|windshield|door|booth glass)\b/i.test(entry.scan);
    const boothish = /\bbooth\b/i.test(entry.scan);
    const terminalish = /\bterminal|desk|counter|keyboard|monitor|console|lamp\b/i.test(entry.scan);
    if((/EXT/.test(sceneRole) || /EXT/.test(intExt)) && (insideM || (boothish && (throughGlass || terminalish)))){
      const hitIndex = insideM ? insideM.index : Math.max(0, entry.scan.search(/\bbooth\b/i));
      const sub = insideM ? tidyPlace(insideM[1]) : (boothish ? "Booth" : "Interior");
      const name = /intake/i.test(baseName) && !/intake/i.test(sub) ? ("Intake "+sub) : sub;
      add("INT", name+" Interior",
        "Interior coverage required by the screenplay even if the prose only names the space: action plays inside "+name+" while the parent scene is staged from "+baseName+". Infer the empty interior from the screenplay page, the parent exterior, working surfaces, glass/window relationship, controls and sightline to the exterior.",
        ["inside","interior","booth","glass","window","terminal","desk","counter","console"],
        baseOrder + hitIndex + 1, s, locationScriptExcerpt(s, drafts, hitIndex));
    }
    const exteriorCueIdx = entry.scan.search(/\b(?:outside|exterior|facade|front|street|yard|parking|through\s+(?:the\s+)?window|through\s+(?:the\s+)?glass)\b/i);
    if(/INT/.test(sceneRole) && exteriorCueIdx>=0){
      add("EXT", baseName+" Exterior",
        "Exterior coverage required by the screenplay: the scene looks out from the interior or cuts to the outside of this place. Render the empty exterior/facade, approach, openings and sightline back toward the interior.",
        ["outside","exterior","facade","front","street","yard","window","glass"],
        baseOrder + exteriorCueIdx + 1, s, locationScriptExcerpt(s, drafts, exteriorCueIdx));
    }
  });
  return out.sort((a,b)=>(Number(a.order||0)-Number(b.order||0)) || String(a.name).localeCompare(String(b.name)));
}
window.locationSceneText = locationSceneText;
window.deriveLocationCoverageSheets = deriveLocationCoverageSheets;

/* true when the script has any parseable slugline we could pull into the tab */
function scriptHasLocations(scenes){ return (scenes||[]).some(s=> !!parseSlugline(s.loc)); }
window.scriptHasLocations = scriptHasLocations;

function locVisualDefaults(l){
  const livingNeg = (typeof locationCharacterNegative==="function") ? locationCharacterNegative(null, l) : "people, characters, animals, creatures, wildlife, insects";
  return {
    renderStyle: (l && l.renderStyle)
      || ((typeof window.renderStyleText==="function") ? window.renderStyleText("loc", l && l.renderStyleKey) : "")
      || "photoreal cinematic establishing photography, wide lens, natural depth, sharp focus",
    negativePrompt: (l && l.negativePrompt) || (livingNeg+", watermark, logo, distorted perspective, warped architecture, low resolution, blurry, cgi look, fisheye"),
  };
}
window.locVisualDefaults = locVisualDefaults;

const LOCATION_AMBIENT_SPECIES = [
  { key:"moth", label:"moths", aliases:["moth","moths"], charRe:/\b(moth|lepidopteran)\b/i },
  { key:"firefly", label:"fireflies", aliases:["firefly","fireflies","glowworm","glowworms"], charRe:/\b(firefly|lampyrid|glowworm)\b/i },
  { key:"frog", label:"frogs", aliases:["frog","frogs","toad","toads"], charRe:/\b(frog|toad|anuran)\b/i },
  { key:"spider", label:"spiders", aliases:["spider","spiders","arachnid","arachnids"], charRe:/\b(spider|arachnid)\b/i },
  { key:"beetle", label:"beetles", aliases:["beetle","beetles"], charRe:/\b(beetle|coleopteran)\b/i },
  { key:"bird", label:"birds", aliases:["bird","birds"], charRe:/\b(bird|avian)\b/i },
];
function locationAmbientSpecies(l){
  const clean = (x)=>String(x||"").replace(/\s+/g," ").trim();
  const text = [l&&l.name, l&&l.architecture, l&&l.materials, l&&l.lighting, l&&l.significance].map(clean).join(" ").toLowerCase();
  if(!text) return [];
  const groupish = /\b(swarm|colony|hive|nest|roost|flock|school|shoal|cloud|cluster|congregation|migration|mass|horde|rookery)\b/i.test(text);
  return LOCATION_AMBIENT_SPECIES.filter(sp=>{
    const hit = sp.aliases.some(a=>new RegExp("\\b"+a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(text));
    const inName = sp.aliases.some(a=>new RegExp("\\b"+a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(String(l&&l.name||"")));
    return hit && (groupish || inName);
  });
}
function ambientSpeciesCharacterGuidance(species){
  const C = window.turnContinuity || {};
  const chars = (C.characters||[]).filter(c=>{
    const blob = [c&&c.name,c&&c.role,c&&c.ethnicity,c&&c.build,c&&c.hair,c&&c.skin,c&&c.eyes,c&&c.texture,c&&c.materialTexture,c&&c.look].filter(Boolean).join(" ");
    return species.charRe.test(blob);
  }).slice(0,3);
  if(!chars.length) return "";
  return chars.map(c=>{
    const scale = (typeof canonicalScaleLabel==="function") ? canonicalScaleLabel(c) : (c.name||"related character");
    const cues0 = [c.skin,c.hair,c.eyes,c.materialTexture,c.texture,c.build].filter(Boolean).join("; ").replace(/\s+/g," ");
    const cues = (typeof clipWords==="function") ? clipWords(cues0, 220) : cues0.slice(0,220);
    return "Broad species canon may echo "+(c.name||"the related character")+" ("+scale+(cues?("; "+cues):"")+
      "), but anonymous background "+species.label+" must NOT copy that named character's exact face, costume, pendant, unique markings, pose or hero silhouette.";
  }).join(" ");
}
function ambientSpeciesSourceCharacters(species){
  const C = window.turnContinuity || {};
  return (C.characters||[]).filter(c=>{
    const blob = [
      c&&c.name, c&&c.role, c&&c.ethnicity, c&&c.build, c&&c.hair,
      c&&c.skin, c&&c.eyes, c&&c.texture, c&&c.materialTexture,
      c&&c.look, c&&c.rationale, c&&c.scaleClass
    ].filter(Boolean).join(" ");
    return species.charRe.test(blob);
  }).slice(0,3);
}
function speciesCanonCue(c){
  const clean = (x,n)=>{ const s=String(x||"").replace(/\s+/g," ").trim();
    return (typeof clipWords==="function") ? clipWords(s, n||160) : s.slice(0,n||160); };
  const scale = (typeof canonicalScaleLabel==="function") ? canonicalScaleLabel(c) : clean(c&&c.scaleClass,80);
  const height = (typeof scaleMeasurementOf==="function") ? scaleMeasurementOf(c) : clean(c&&c.height,40);
  const traits = [
    c&&c.ethnicity ? ("taxonomy/world read: "+clean(c.ethnicity,120)) : "",
    c&&c.build ? ("body language: "+clean(c.build,160)) : "",
    c&&c.skin ? ("surface/palette: "+clean(c.skin,160)) : "",
    c&&c.hair ? ("antennae/hair/crest: "+clean(c.hair,140)) : "",
    c&&c.eyes ? ("eye/glow family: "+clean(c.eyes,120)) : "",
    c&&c.materialTexture ? ("material texture: "+clean(c.materialTexture,160)) : "",
    c&&c.texture ? ("texture: "+clean(c.texture,160)) : "",
  ].filter(Boolean);
  return {
    source_character: clean(c&&c.name,80) || "related character",
    source_scale: [scale, height].filter(Boolean).join(" · ") || undefined,
    broad_species_traits: traits.length ? traits.join("; ") : undefined,
  };
}
function locationSpeciesCanon(l){
  return locationAmbientSpecies(l).map(species=>{
    const sources = ambientSpeciesSourceCharacters(species).map(speciesCanonCue);
    return {
      species: species.label,
      source: sources.length ? sources : "no matching named character found; use only the location's own species wording",
      allowed_use: "anonymous background population / environmental extras only",
      may_echo: "broad taxonomy, scale class, size logic, palette family, wing/skin/fur/chitin/material language, and non-unique glow behaviour",
      must_vary: "individuals should differ in pose, markings, proportions and grouping so they read as a population, not copies",
      never_copy: "no named-character face, no unique costume/accessory/pendant, no exact markings, no hero silhouette, no foreground performance, no character portrait",
      staging: "keep the species as set dressing at environmental scale unless a later shot explicitly introduces the named character from its own character sheet",
    };
  }).filter(Boolean);
}
function locationSpeciesCanonText(l){
  const canon = locationSpeciesCanon(l);
  if(!canon.length) return "";
  return "AMBIENT SPECIES CANON: "+canon.map(c=>{
    const src = Array.isArray(c.source)
      ? c.source.map(s=>[s.source_character, s.source_scale, s.broad_species_traits].filter(Boolean).join(" — ")).join(" | ")
      : c.source;
    return c.species+": "+src+". "+c.allowed_use+". May echo "+c.may_echo+". Must vary: "+c.must_vary+". Never copy: "+c.never_copy+".";
  }).join(" ");
}
function locationNoCharactersRules(project, l){
  const C = window.turnContinuity || {};
  const names = (C.characters||[]).map(c=>String(c&&c.name||"").trim()).filter(Boolean).slice(0,12);
  const named = names.length ? (" Do not depict any cast member by name: "+names.join(", ")+".") : "";
  const ambient = locationAmbientSpecies(l);
  const ambientRule = ambient.length
    ? "Anonymous ambient "+ambient.map(s=>s.label).join(" / ")+" may appear ONLY because this location explicitly calls for them: treat them as environmental extras/set dressing at the location's scale, repeated small background forms or silhouettes, never hero figures. Follow the ambient_species_canon / AMBIENT SPECIES CANON block when present. "+ambient.map(ambientSpeciesCharacterGuidance).filter(Boolean).join(" ")
    : "No animals, no creatures, no wildlife, no insects, no frogs, no fireflies, no moths, no visible living bodies.";
  return [
    "EMPTY SET ONLY: this is a location reference plate, not a story shot.",
    "No people, no named characters, no actors, no cast members, no readable character faces, no expressive eyes, no hero bodies, no foreground character silhouettes.",
    ambientRule,
    "Bioluminescence is allowed as environmental glow, reflections, haze or light traces; if ambient species are allowed, their glow must stay anonymous and environmental, not character-identifying.",
    "Show traces of habitation only as empty environmental set dressing, tracks, scale cues, surfaces, props or light; the actual characters will be added later from character sheets during shot generation."+named
  ];
}
function locationCharacterNegative(project, l){
  const C = window.turnContinuity || {};
  const names = (C.characters||[]).map(c=>String(c&&c.name||"").trim()).filter(Boolean);
  const ambient = locationAmbientSpecies(l);
  const allowed = new Set(ambient.flatMap(s=>s.aliases.map(a=>a.toLowerCase())));
  const genericLiving = ambient.length ? [] : ["animals","creatures","wildlife","insects"];
  const speciesTerms = ["moths","moth","fireflies","firefly","flies","bugs","frogs","frog","toads","toad","birds","bird","spiders","spider","beetles","beetle"].filter(x=>!allowed.has(x));
  const base = ["people","characters","actors","cast","crowds","faces","eyes","bodies","foreground silhouettes","hero creature","character portrait"].concat(genericLiving, speciesTerms);
  return Array.from(new Set(base.concat(names))).join(", ");
}
window.locationNoCharactersRules = locationNoCharactersRules;
window.locationCharacterNegative = locationCharacterNegative;
window.locationAmbientSpecies = locationAmbientSpecies;
window.locationSpeciesCanon = locationSpeciesCanon;
window.locationSpeciesCanonText = locationSpeciesCanonText;

/* Render-style text per key — location cards use the SAME dropdown options as the cast
   (window.CHAR_RENDER_STYLE_OPTIONS, incl. "Surprise me ✨"); picking a concrete key
   writes this place-tuned recipe into l.renderStyle, which the plate builder feeds into
   render.style. "surprise" is AI-invented per location (aiSurpriseStyleText). */
const LOC_RENDER_TEXT = {
  photoreal: "photoreal cinematic establishing photography, wide lens, natural depth, sharp focus, realistic light",
  graphicNovelNoir: "high-contrast black-and-white graphic-novel environment, bold ink shadows and screentone midtones, hard single-source noir light, deep pooled blacks, strictly monochrome",
  ukiyoe: "ukiyo-e woodblock landscape print, flat mineral-pigment colour planes, calligraphic keyblock outlines, bokashi sky gradation, washi paper texture, Edo-period palette, no Western light-and-shadow modelling",
  paperCutout: "layered paper cut-out environment, flat scissor-cut paper shapes stacked in shallow physical depth layers, real drop shadows between layers, visible paper grain, handmade collage charm",
  photorealNatural: "natural-history macro habitat photography, real biological scale cues, believable tiny-world anatomy context, skin/fur/scales/chitin-compatible environment detail, moisture, realistic light, minimal stylization",
  photorealCreature: "cinematic photoreal creature-film environment, practical/VFX set realism, believable creature-shop material world, realistic depth, controlled live-action lighting",
  photorealOrnamental: "photoreal ornamental creature-world environment, couture/ceremonial/jewelry-like production design, iridescent and armor-like materials, premium cinematic studio realism",
  render3d:  "stylized 3D environment render, cinematic lighting, physically-based materials, atmospheric depth",
  anime:     "anime background art, painterly cel-shaded environment, clean linework, soft gradient skies, no photoreal texture",
  flat:      "flat vector landscape, bold geometric shapes, minimal flat shading, limited palette, no photoreal texture",
  horror:    "low-key cinematic horror cinematography of the place, hard cold side light, deep atmospheric blacks, fog and haze, desaturated cold green-teal grade",
  ghibli:    "soft hand-painted Studio Ghibli-style 2D background, fine warm linework, gentle painterly cel shading, warm earthy naturalistic palette, nostalgic light",
  animated3d:"polished animated-feature 3D environment render, soft warm global illumination, appealing clean PBR materials, idealized finish, no noise",
  pixar:     "Pixar-style animated-feature 3D environment, soft warm global illumination, appealing rounded stylized forms, clean tactile PBR materials, 'every frame a painting' warmth, idealized charming finish, no noise",
  storyboardconcept:"clean storyboard / production concept environment, expressive linework, clear cinematic staging, restrained color wash, readable layout and mood",
  texturedcomic:"textured contemporary comic-art environment, bold ink contours, etched hatching, limited palette, dramatic graphic light, visible grain",
  whimsicalwatercolor:"whimsical watercolor and fine-ink environment, transparent washes, paper grain, delicate hand-drawn line, soft storybook charm",
  stopmotion:"photograph of a real handmade miniature stop-motion set, felt/wood/clay at tiny scale, soft practical studio light, faint tilt-shift miniature depth",
  claymation:"photograph of a real plasticine claymation miniature set, rounded clay forms with tool marks, soft practical light, faint tilt-shift miniature depth",
  adv1960s:  "1960s painted commercial illustration of the place, airbrushed gouache, vintage halftone print texture, mid-century mustard/avocado/teal palette",
  gaganime:  "1990s gag-anime 2D cartoon background, thick bold black outlines, flat high-saturation colors, simple graphic shapes, sticker-poster finish",
  pixelart:  "retro 16/32-bit pixel-art environment, hard square pixels, no anti-aliasing, limited indexed palette, dithered skies and shadows, crisp pixel grid",
};
Object.assign(LOC_RENDER_TEXT, {
  modernAnime:"modern cinematic anime background art, clean sharp linework, polished cel shadows, vibrant contemporary colour and dramatic sky/light",
  digitalAnime:"polished digital anime environment illustration, smooth refined rendering, luminous colour, clean linework, atmospheric finish",
  roughSketchAnime:"rough sketch anime environment concept, visible pencil/ink strokes, flat colour, light hatching, immediate layout energy",
  painterlyAnime:"painterly anime environment, delicate line, soft blended brushwork, dreamy atmospheric colour wash",
  cartoon3d:"stylized 3D cartoon environment render, bold readable forms, clean animated-feature lighting, rounded appeal",
  textured3dCartoon:"textured 3D cartoon environment, felt/clay/fabric/fuzzy tactile surfaces, soft studio/miniature lighting",
  stylizedCartoon:"stylized cartoon environment illustration, bold outlines, flat colour areas, theatrical graphic shape design",
  grittyDigital:"gritty digital illustration environment, expressive linework, harsh light, textured shadows, moody high contrast",
  softPainterly:"soft painterly environment illustration, visible brushstrokes, blended colour, warm handmade atmosphere",
  realisticDigitalDrawing:"realistic digital drawing environment, believable light, detailed surface texture, illustrated not photographic",
  flatDesign:"flat design environment illustration, simplified geometric shapes, bold colour, minimal shading",
  minimalistLine:"minimalist line-art environment, sparse elegant contour, warm paper, abundant negative space, one small accent colour",
  vintageChildrensBook:"vintage children’s book environment illustration, loose ink outline, limited spot colour, aged paper print texture",
  tactileMixedMedia:"tactile mixed-media environment, handmade fabric/felt/paper/paint/sculpted miniature set, photographed craft",
  texturedPaperSculpture:"textured paper sculpture environment, folded layered paper, visible fibres, photographed tabletop diorama",
  texturedPaperIllustration:"textured paper illustration environment, collage layers, stippled print grain, cut-paper edges",
  tropicalArtNouveau:"tropical Art Nouveau environment, flowing organic lines, lush botanical motifs, flat ornamental colour",
});
window.LOC_RENDER_TEXT = LOC_RENDER_TEXT;

function locVisualsDrafted(l){ return !!((l.architecture||"").trim() && (l.lighting||"").trim()); }
window.locVisualsDrafted = locVisualsDrafted;

/* ---- DEPTH-GRID STAGING ----------------------------------------------------
   A location's canonical staging: a 3×3 depth grid (rows BG/MID/FG × cols L/C/R)
   plus Floor, Scale Class and Camera/Lens. Each cell is OPTIONAL — an empty cell
   means "open space" (so linear/open locations aren't forced into a box). Named
   landmark roles, per your spec:
     bg.center = Wall A (primary backdrop landmark)
     mid.left  = Wall B (primary framing element)
     mid.right = Wall C (secondary framing element)
     mid.center= the SUBJECT position (where a character stands) — usually left blank
     fg.left/fg.right = L1 / R1 foreground veils; fg.center = camera (implicit)
   Shots will later inherit this and vary it. */
function emptyStaging(){
  return { scaleClass:"", lens:"",
    bg:{ left:"", center:"", right:"" },
    mid:{ left:"", center:"", right:"" },
    fg:{ left:"", right:"" },
    floor:"" };
}
window.emptyStaging = emptyStaging;
function stagingOf(l){
  const s = (l && l.staging) || {};
  const e = emptyStaging();
  return { scaleClass:s.scaleClass||"", lens:s.lens||"",
    bg:{...e.bg, ...(s.bg||{})}, mid:{...e.mid, ...(s.mid||{})}, fg:{...e.fg, ...(s.fg||{})},
    floor:s.floor||"" };
}
window.stagingOf = stagingOf;
/* true when the staging has at least one filled cell (worth showing / prompting) */
function stagingHasContent(l){
  const s = stagingOf(l);
  return !!(s.scaleClass||s.lens||s.floor||s.bg.left||s.bg.center||s.bg.right
    ||s.mid.left||s.mid.center||s.mid.right||s.fg.left||s.fg.right);
}
window.stagingHasContent = stagingHasContent;

/* turn a filled depth grid into spatially-explicit prompt language. Empty cells
   are skipped (read as open space). Returns "" when nothing is staged. */
function buildStagingClause(l){
  const s = stagingOf(l);
  if(!stagingHasContent(l)) return "";
  const bits = [];
  if(s.scaleClass) bits.push("SCALE: "+s.scaleClass.replace(/\.$/,""));
  const plane = [];
  if(s.bg.center) plane.push("center background, the primary landmark \u2014 "+s.bg.center.replace(/\.$/,""));
  if(s.bg.left)   plane.push("left background "+s.bg.left.replace(/\.$/,""));
  if(s.bg.right)  plane.push("right background "+s.bg.right.replace(/\.$/,""));
  if(s.mid.left)  plane.push("left midground framing element \u2014 "+s.mid.left.replace(/\.$/,""));
  if(s.mid.right) plane.push("right midground framing element \u2014 "+s.mid.right.replace(/\.$/,""));
  if(s.mid.center)plane.push("midground center "+s.mid.center.replace(/\.$/,""));
  if(s.fg.left)   plane.push("left foreground "+s.fg.left.replace(/\.$/,""));
  if(s.fg.right)  plane.push("right foreground "+s.fg.right.replace(/\.$/,""));
  if(s.floor)     plane.push("ground plane underfoot \u2014 "+s.floor.replace(/\.$/,""));
  let out = "DEPTH STAGING (layer the space for parallax): "+plane.join("; ")+". ";
  if(bits.length) out = bits.join(". ")+". "+out;
  if(s.lens) out += "Framed on a "+s.lens.replace(/\.$/,"")+". ";
  return out;
}
window.buildStagingClause = buildStagingClause;

/* the dominant style preset for a location = the preset assigned to the first
   scene it appears in that has one. Retained for back-compat; the location plate no
   longer bakes in a grade (grade is a per-scene/per-shot decision). */
function locDominantPreset(l, project){
  if(typeof scenePreset!=="function") return null;
  for(const sid of (l.scenes||[])){ const p = scenePreset(project, sid); if(p) return p; }
  return null;
}
window.locDominantPreset = locDominantPreset;

/* every DISTINCT Style Bible preset the location's scenes use, in scene order.
   Informational only: a location can span scenes with different grades, so we show
   them all rather than collapsing to one. The reference plate itself stays
   grade-neutral — the grade is applied downstream at the shot. */
function locScenePresets(l, project){
  if(typeof scenePreset!=="function") return [];
  const out = []; const seen = new Set();
  for(const sid of (l.scenes||[])){ const p = scenePreset(project, sid); if(p && !seen.has(p.id)){ seen.add(p.id); out.push(p); } }
  return out;
}
window.locScenePresets = locScenePresets;

/* The effective SCALE CLASS of a location's WORLD: the project-wide "world scale" toggle
   (project.worldScale = A/B/C/D) wins; otherwise it's derived from the scale of the characters
   who DRIVE the scenes set here (a critter film's drivers are all Class B → the place renders
   at critter scale). Returns A when nobody non-human occupies it (so it stays inert). */
function locationScaleClass(l, project){
  const wRaw = String((project && project.worldScale) || "").trim();
  // project-wide override: any explicit value (A/B/C/D, or free text like "critter"/"giant")
  // resolves; only empty or "auto" falls through to per-location derivation.
  if(wRaw && !/^auto$/i.test(wRaw)) return (typeof scaleClassOf==="function") ? scaleClassOf({scaleClass:wRaw}) : "A";
  if(typeof scaleClassOf!=="function") return "A";
  const C = window.turnContinuity || {};
  const chars = C.characters || [], scenes = C.scenes || [];
  if(!chars.length || !scenes.length) return "A";
  const byId = {}; chars.forEach(c=>{ if(c&&c.id) byId[c.id]=c; });
  const sids = Array.isArray(l && l.scenes) ? l.scenes : [];
  const counts = { A:0, B:0, C:0 };
  sids.forEach(sid=>{ const sc=scenes.find(s=>s.id===sid); const drv=sc&&sc.driver&&byId[sc.driver]; if(drv) counts[scaleClassOf(drv)]++; });
  const nonA = [["B",counts.B],["C",counts.C]].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  return nonA.length ? nonA[0][0] : "A";
}
window.locationScaleClass = locationScaleClass;

/* deterministic LOCATION coverage plate — full view of the place from several
   angles on one grid, so any shot set here matches geometry, materials & light.
   `opts.preset` applies a Style Bible look; `opts.time` specialises a variant. */
function buildLocationRefPrompt(l, project, opts){
  opts = opts || {};
  const P = project || (window.TURN_DATA||{}).PROJECT || {};
  const v = locVisualDefaults(l);
  const arch = (l.architecture||"").replace(/\.$/,"").trim();
  const materials = (l.materials||"").replace(/\.$/,"").trim();
  const lighting = (l.lighting||"").replace(/\.$/,"").trim();
  const significance = (l.significance||"").replace(/\.$/,"").trim();
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  const intExt = l.intExt || "INT";
  const time = opts.time || (l.times&&l.times[0]) || "";

  /* JSON environment spec (the director's template as a key:value spec, 2026-06):
     EXACTLY 4 views in a 2\u00d72 grid \u2014 wide establishing front, high-angle three-quarter
     overview, two close-ups of the key stations \u2014 no text baked in. The depth grid's
     landmarks fill `fixtures`; ownerless set dressing LINKED to this location (the
     fixture-of relationship: explicit locationId, or every mapped scene resolves here)
     renders as `environment_props`, so abandoned objects & furniture live in the plate.
     Owned or multi-location objects are NEVER baked in \u2014 they travel with people.
     Stays GRADE-NEUTRAL: the scene's Style Bible grade applies downstream at the shot. */
  const st = stagingOf(l);
  const clean = (x)=>String(x||"").replace(/\.$/,"").trim();
  const fixtures = [];
  if(clean(st.bg.center)) fixtures.push({ what: clean(st.bg.center), position: "center background \u2014 the primary landmark" });
  if(clean(st.mid.left))  fixtures.push({ what: clean(st.mid.left),  position: "along the left side" });
  if(clean(st.mid.right)) fixtures.push({ what: clean(st.mid.right), position: "along the right side" });
  if(clean(st.fg.left))   fixtures.push({ what: clean(st.fg.left),   position: "near foreground left" });
  if(clean(st.fg.right))  fixtures.push({ what: clean(st.fg.right),  position: "near foreground right" });
  const mainStation = clean(st.bg.center) || "the space's primary, most story-relevant feature";
  const secondStation = clean(st.mid.left) || clean(st.mid.right) || clean(st.fg.left) || clean(st.fg.right) || "a signature material detail of the space";
  const _C0 = window.turnContinuity || {};
  const screenplayContext = (typeof locationScreenplayContext==="function") ? locationScreenplayContext(l, _C0.scenes||[], _C0.drafts||{}, 2600) : "";
  const panelPlan = (typeof locationMasterPanelPlan==="function") ? locationMasterPanelPlan(l, _C0.scenes||[], _C0.drafts||{}) : null;
  const envProps = locationEnvironmentProps(l).map(p=>({
    name: p.name,
    description: [clean(p.form), clean(p.material)].filter(Boolean).join("; ") || undefined,
    // real-world measurement — the plate must render the object at its true physical
    // size relative to the space (the shot scale system reuses the same number)
    physical_size: clean(p.size) || undefined,
  }));
  /* THE SCRIPT USES THIS SPACE FOR — functional AFFORDANCES aggregated across every
     scene the script sets here (user ruling 2026-07-18): the plate must provide the
     working positions and clearances the beats rely on (a till position on the
     counter, queue room to the door, an operable shutter) WITHOUT staging any
     action, people, or ephemeral state — the plate stays canonical for the whole
     film. Deterministic: a lexicon scan over this location's scenes' summaries and
     script text, plus a capacity ceiling from cast presence. */
  const _AFFORD = [
    [/\btill\b|cash register/i, "a working service counter with a clear till position"],
    [/\bqueue|queuing|queueing\b/i, "open queueing room between the service point and the entrance"],
    [/\bshutter/i, "the entrance's roller shutter readable from inside the space"],
    [/\bdoor(way)?\b|entrance/i, "an unobstructed entrance / doorway sightline"],
    [/\bwindow/i, "windows that read from inside the space"],
    [/\bshel(f|ves)/i, "stocked shelving runs with aisle clearance"],
    [/\bstairs?\b/i, "a stair connection"],
    [/\bphone box|telephone|payphone\b/i, "a phone position"],
    [/\bcounter\b/i, "a service counter with working room behind it"],
  ];
  const _C = window.turnContinuity || {};
  const _locScenes = (Array.isArray(l.scenes) && l.scenes.length && Array.isArray(_C.scenes))
    ? _C.scenes.filter(sc=> l.scenes.indexOf(sc.id)>=0) : [];
  let _affordances = [], _capacity = 0;
  if(_locScenes.length){
    const _txt = _locScenes.map(sc=> [sc.summary, sc.objective, sc.turningPoint,
      (typeof sceneScriptText==="function" && _C.drafts) ? sceneScriptText(sc.id, _C.drafts) : ""
    ].filter(Boolean).join(" ")).join(" ");
    _AFFORD.forEach(af=>{ if(af[0].test(_txt) && _affordances.indexOf(af[1])<0) _affordances.push(af[1]); });
    _affordances = _affordances.slice(0,5);
    if(_C.drafts && Array.isArray(_C.characters) && typeof scenesWhereCharacterAppears==="function"){
      _locScenes.forEach(sc=>{ let n=0;
        _C.characters.forEach(ch=>{ try{ if(scenesWhereCharacterAppears(ch.id, ch.name, [sc], _C.drafts).length) n++; }catch(e){} });
        if(n>_capacity) _capacity=n; });
    }
  }
  const speciesCanon = (typeof locationSpeciesCanon==="function") ? locationSpeciesCanon(l) : [];
  const emptySetRules = (typeof locationNoCharactersRules==="function") ? locationNoCharactersRules(project, l) : ["no people","no characters","no animals"];
  const spec = {
    task: "professional environment reference sheet \u2014 ONE single real space rendered from 4 angles",
    location: {
      name: l.name||"Location",
      type: intExt==="EXT" ? "exterior" : "interior",
      space: arch || undefined,
      walls_surfaces_palette: materials || undefined,
      floor_ground_plane: clean(st.floor) || undefined,
      lighting: lighting || undefined,
      time_of_day: time ? time.toLowerCase() : undefined,
      scale: clean(st.scaleClass) || undefined,
      reads_as: significance || undefined,
      script_requirements: (_affordances.length || _capacity>1) ? {
        note: "aggregated from every scene the script sets here — the space must AFFORD these working positions and clearances (present or clearly implied) while staging NO action, NO people and NO temporary state",
        affordances: _affordances.length ? _affordances : undefined,
        capacity: _capacity>1 ? ("the space must comfortably hold up to "+_capacity+" people at once when scenes play") : undefined,
      } : undefined,
      screenplay_context: screenplayContext || undefined,
      tone: tone || undefined,
    },
    fixtures: fixtures.length ? fixtures : undefined,
    environment_props: envProps.length ? envProps : undefined,
    // SHELL LINK (text-only, no reference image — the plate generates clean): this
    // space is the hollow inside of a designed object; its materials are binding
    interior_of: (()=>{ const sp = (typeof locShellProp==="function") ? locShellProp(l) : null;
      if(!sp) return undefined;
      return { object: sp.name,
        shell: [clean(sp.form), clean(sp.material)].filter(Boolean).join("; ") || undefined,
        physical_size: clean(sp.size) || undefined,
        rule: "this location IS the hollow interior of that object — every wall, the bore, the openings and their edges must read as the inside of that exact shell (same material palette and construction), and any opening frames the outside world beyond" };
    })(),
    ambient_species_canon: speciesCanon.length ? speciesCanon : undefined,
    views: {
      ...(panelPlan || {
        layout: "exactly 4 views in a 2x2 grid",
        top_left: "wide establishing front shot at eye level with symmetrical centered composition",
        top_right: "high-angle three-quarter overview shot from an elevated corner perspective looking down into the space showing depth and spatial layout",
        bottom_left: "close-up of "+mainStation,
        bottom_right: "close-up of "+secondStation,
        rule: "each view a distinctly different camera angle and composition \u2014 the SAME identical space, consistent architecture, scale, materials and light across all views",
      }),
    },
    render: {
      style: v.renderStyle.replace(/\.$/,""),
      /* quality rules must AGREE with the picked style: pushing "photorealistic /
         hyper realistic" under a stylized style (cartoon, anime, Pixar…) contradicts
         the style line and the model resolves toward photoreal — the plate then drags
         every downstream shot off-style. Photoreal wording only for photoreal-family
         picks; style-faithful quality rules otherwise. */
      rules: emptySetRules.concat(
        ["no text, no labels, no typography, no captions, no watermarks"],
        /^(photoreal|horror)/.test(String(l.renderStyleKey||"photoreal"))
          ? ["photorealistic commercial photography","8k ultra detailed","consistent lighting across all views","clean layout","hyper realistic"]
          : ["render every view strictly in the ONE render style named above — do not drift into any other style",
             "high-resolution, clean crisp detail in that style","consistent lighting and style across all views","clean layout"]),
    },
  };
  // WORLD SCALE — when this place is inhabited by a non-human-scale cast (critter / giant),
  // render the SPACE ITSELF at that scale (gigantism / miniaturization), so a bug's-world
  // location doesn't default to a human-scale room. Inert (Class A) for ordinary films.
  const _wcls = (typeof locationScaleClass==="function") ? locationScaleClass(l, P) : "A";
  const _wclause = (typeof worldScaleClause==="function") ? worldScaleClause(_wcls) : "";
  if(_wclause) spec.world_scale = _wclause;
  return "Render this environment reference sheet EXACTLY as specified by this JSON spec (continuity fields are binding):\n"+JSON.stringify(spec, null, 1);
}
window.buildLocationRefPrompt = buildLocationRefPrompt;

/* the set dressing a location OWNS (the fixture-of relationship): ownerless, not worn,
   and either explicitly linked (p.locationId) or every mapped scene resolves to this
   location. Objects whose scenes span locations are mobile (someone moves them) and
   are excluded \u2014 they belong at the shot, not baked into the set. */
function locationEnvironmentProps(l){
  const C = window.turnContinuity || {};
  const props = C.props||[], locations = C.locations||[];
  const charNames = (C.characters||[]).map(c=>String(c&&c.name||"").trim().toLowerCase()).filter(Boolean);
  const allowedSpecies = new Set((typeof locationAmbientSpecies==="function" ? locationAmbientSpecies(l) : []).flatMap(s=>s.aliases.map(a=>a.toLowerCase())));
  const livingRe = /\b(character|cast|person|people|animal|creature|wildlife|insect|bug|fly|firefly|frog|toad|bird|moth|beetle|spider|mouse|rat|face|eye|body|silhouette)\b/i;
  const locIdOf = (sid)=>{ const m=(typeof locationForScene==="function")?locationForScene(locations, sid):null; return m?m.id:""; };
  return props.filter(p=>{
    if(p.ownerId || p.ownerName) return false;
    if((p.kind||"carried")==="worn") return false;
    const blob = [p.name,p.form,p.material,p.detail].filter(Boolean).join(" ");
    if(livingRe.test(blob)){
      const lowBlob = blob.toLowerCase();
      const allowedHit = Array.from(allowedSpecies).some(a=>new RegExp("\\b"+a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(lowBlob));
      if(!allowedHit) return false;
    }
    const low = String(p.name||"").toLowerCase();
    if(low && charNames.some(n=>n && (low===n || low.includes(n)))) return false;
    if(p.locationId) return p.locationId===l.id;
    const sc = Array.isArray(p.scenes) ? p.scenes : [];
    if(!sc.length) return false;
    const ids = Array.from(new Set(sc.map(locIdOf).filter(Boolean)));
    return ids.length===1 && ids[0]===l.id;
  }).slice(0,6);
}
window.locationEnvironmentProps = locationEnvironmentProps;

function combinedLocationPrompt(l, project, opts){
  const master = buildLocationRefPrompt(l, project, opts);
  const extra = (typeof locationCharacterNegative==="function") ? locationCharacterNegative(project, l) : "";
  const neg = [l.negativePrompt || locVisualDefaults(l).negativePrompt || "", extra].filter(Boolean).join(", ").trim();
  return neg ? (master + " AVOID: " + neg.replace(/\.$/,"") + ".") : master;
}
window.combinedLocationPrompt = combinedLocationPrompt;

/* single establishing variant (used for time-of-day / style variant plates) */
function buildLocationVariantPrompt(l, project, opts){
  opts = opts || {};
  const v = locVisualDefaults(l);
  const lighting = (l.lighting||"").replace(/\.$/,"").trim();
  const rules = (typeof locationNoCharactersRules==="function") ? locationNoCharactersRules(project, l).join(" ") : "empty of people and characters.";
  const speciesCanon = (typeof locationSpeciesCanonText==="function") ? locationSpeciesCanonText(l) : "";
  let s = "Establishing shot \u2014 "+(l.name||"Location")+" ("+(l.intExt||"INT")+")";
  s += opts.time ? (", "+opts.time) : "";
  s += ". ";
  s += (l.architecture ? (l.architecture.replace(/\.$/,"")+". ") : "");
  s += lighting ? (lighting+". ") : "";
  // grade-neutral, like the master plate — the scene grade is applied at the shot.
  s += "RENDER STYLE: "+v.renderStyle.replace(/\.$/,"")+". ";
  if(speciesCanon) s += speciesCanon+" ";
  s += "Single wide cinematic frame, the same space and architecture. "+rules+" Photoreal, sharp focus.";
  const extra = (typeof locationCharacterNegative==="function") ? locationCharacterNegative(project, l) : "";
  const neg = [l.negativePrompt||v.negativePrompt||"", extra].filter(Boolean).join(", ").trim();
  return neg ? (s+" AVOID: "+neg.replace(/\.$/,"")+".") : s;
}
window.buildLocationVariantPrompt = buildLocationVariantPrompt;

function buildLocationCoveragePrompt(l, sheet, project){
  sheet = sheet || {};
  const v = locVisualDefaults(l);
  const role = String(sheet.role||"INT").toUpperCase();
  const rules = (typeof locationNoCharactersRules==="function") ? locationNoCharactersRules(project, l).join(" ") : "empty of people and characters.";
  const speciesCanon = (typeof locationSpeciesCanonText==="function") ? locationSpeciesCanonText(l) : "";
  const clean = (x)=>String(x||"").replace(/\s+/g," ").trim().replace(/\.$/,"");
  const parent = clean(l&&l.name) || "the parent location";
  const name = clean(sheet.name) || (parent+" "+role);
  const summary = clean(sheet.summary);
  const spec = {
    task: "single full-frame location coverage sheet derived from the screenplay",
    coverage: {
      role: role==="EXT" ? "exterior side" : "interior side",
      name,
      parent_location: parent+" ("+(l.intExt||"INT")+")",
      screenplay_basis: summary || undefined,
      screenplay_excerpt: clean(sheet.scriptExcerpt) || undefined,
      screenplay_order: sheet.order!=null ? Number(sheet.order) : undefined,
      scenes: Array.isArray(sheet.sceneNos) && sheet.sceneNos.length ? sheet.sceneNos : undefined,
      rule: "render ONLY the space the screenplay needs for shots; no actors, no story action, no temporary performance moment",
    },
    relationship_to_parent: role==="INT"
      ? "This is the inside/subspace of the parent location; preserve any glass, doorway, booth, window or threshold relationship back to the exterior when the script states it."
      : "This is the outside/facade/context of the parent location; preserve entrances, windows, thresholds and approach geometry that connect to the interior when the script states it.",
    environment_spec: {
      architecture: clean(l.architecture) || undefined,
      materials: clean(l.materials) || undefined,
      lighting: clean(l.lighting) || undefined,
      dramatic_use: clean(l.significance) || undefined,
    },
    ambient_species_canon: speciesCanon || undefined,
    render: {
      style: clean(v.renderStyle),
      format: "ONE 16:9 cinematic environment reference image, not a grid, not a storyboard panel",
      rules: [rules, "empty set only", "if the screenplay names a subspace without fully describing it, infer the missing architecture from the attached screenplay-page reference plus the parent location reference while staying conservative", "no text, no labels, no typography, no captions, no watermarks", "consistent with the parent location's materials, scale and light"],
    },
  };
  const neg = [l.negativePrompt || v.negativePrompt || "", (typeof locationCharacterNegative==="function") ? locationCharacterNegative(project, l) : ""].filter(Boolean).join(", ").trim();
  return "Render this screenplay-derived location coverage sheet EXACTLY as specified by this JSON spec:\n"
    + JSON.stringify(spec, null, 1)
    + (neg ? ("\nAVOID: "+neg.replace(/\.$/,"")+".") : "");
}
window.buildLocationCoveragePrompt = buildLocationCoveragePrompt;

/* simplified fallback — fewer words, less likely to trip a content filter */
function buildSimpleLocationPrompt(l){
  const rules = (typeof locationNoCharactersRules==="function") ? locationNoCharactersRules(null, l).join(" ") : "empty of people and characters";
  const speciesCanon = (typeof locationSpeciesCanonText==="function") ? locationSpeciesCanonText(l) : "";
  // retry keeps the location's PICKED render style — never silently photoreal
  const styleLine = String(locVisualDefaults(l).renderStyle||"").split(/[;,]/)[0].trim();
  const parts = [
    "Location reference \u2014 "+(l.name||"place")+" ("+(l.intExt||"INT")+")",
    (l.architecture||"").replace(/\.$/,"").trim(),
    (l.lighting||"").replace(/\.$/,"").trim(),
    speciesCanon,
    "establishing wide, reverse angle, and a detail view",
    "the same space from a few angles, "+rules+", "+(styleLine||"photoreal")+", sharp focus"
  ].filter(Boolean);
  const neg = (typeof locationCharacterNegative==="function") ? locationCharacterNegative(null, l) : "";
  return parts.join(". ")+"."+(neg?(" AVOID: "+neg+"."):"");
}
window.buildSimpleLocationPrompt = buildSimpleLocationPrompt;

/* image-to-image from a dropped reference photo of a real place */
function buildLocationFromPhotoPrompt(l, project){
  const v = locVisualDefaults(l);
  const rules = (typeof locationNoCharactersRules==="function") ? locationNoCharactersRules(project, l).join(" ") : "empty of people and characters.";
  const speciesCanon = (typeof locationSpeciesCanonText==="function") ? locationSpeciesCanonText(l) : "";
  let s = "Master location reference plate \u2014 "+(l.name||"Location")+". ";
  s += "BASE SPACE: reproduce EXACTLY the place shown in the reference photo \u2014 its architecture, ";
  s += "proportions, materials, colour and light. Do not redesign or restyle it. ";
  s += (l.significance ? ("Dramatic role: "+l.significance.replace(/\.$/,"")+". ") : "");
  s += "RENDER STYLE: "+v.renderStyle.replace(/\.$/,"")+". ";
  if(speciesCanon) s += speciesCanon+" ";
  s += "Compose it as a 3\u00d72 grid of six panels of that same space. "
     + "Top row: (1) establishing wide; (2) reverse angle; (3) view toward the LEFT side of the frame. "
     + "Bottom row: (4) view toward the RIGHT side of the frame; (5) looking down; (6) a material detail. "
     + "(\u2018Left\u2019/\u2018right\u2019 mean the camera-frame side, not a character's.) "
     + "Print a small caption in the top-left of each panel with its number and title. "
     + "Consistent architecture and light across all panels. "+rules+" Photoreal, sharp focus.";
  return s;
}
window.buildLocationFromPhotoPrompt = buildLocationFromPhotoPrompt;

/* ---- Headless location generation (for the Location Scout agent) ----
   Mirrors generatePropSheet: build the prompt, generate (retry a simplified prompt on a
   "no image" safety refusal), commit to the location's slot, and dispatch nb-gen-done so
   the live card adopts it. The base plate commits to l.id ("locref-"+l.id); a time-of-day
   variant commits to l.id+"-"+v.id ("locvar-"+l.id+"-"+v.id). ---- */
function _nbLocMeta(prompt){
  const model = (typeof nbGetModel==="function") ? nbGetModel() : "";
  const aspect = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  const size = (typeof nbGetRes==="function") ? nbGetRes() : "2K";
  const now = new Date();
  const mEntry = (window.NB_MODELS||[]).find(m=>m.id===model) || {};
  return { modelLabel:mEntry.label||"Nano Banana", modelId:model, aspect, size,
    // match the per-card sheet caption: GPT Image carries its quality (low/medium/high)
    quality: (typeof window.isGptImageModel==="function" && window.isGptImageModel(model))
      ? ((typeof window.nbGetOaiQuality==="function") ? window.nbGetOaiQuality() : "medium") : undefined,
    date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
    time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
    iso: now.toISOString(), prompt, mode:"final", version:1 };
}
/* SET DRESSING — painted INTO the plate by an EDIT, never attached as reference
   sheets at generation. (Reference sheets at generation time had no anchor image
   yet, so their studio look bled into the plate's lighting and palette; an edit
   pass keeps the finished plate as the style anchor and only installs the object.)
   Dressing props are spec-only cards: locDressingProps lists a location's fixtures,
   locDressingEditText turns one prop's spec into a ready plate-edit instruction. */
function locDressingProps(l){
  if(!l) return [];
  const props = ((window.turnContinuity||{}).props)||[];
  const homeId = (p)=>{
    if(p.locationId) return p.locationId;
    const home = (typeof propHomeLocation==="function") ? propHomeLocation(p) : null;
    return (home && home.id) || "";
  };
  return props.filter(p=> p && p.kind==="dressing" && homeId(p)===l.id);
}
window.locDressingProps = locDressingProps;
function locDressingEditText(p){
  const spec = [p.form, p.material, p.detail].map(x=>String(x||"").trim().replace(/\.$/,"")).filter(Boolean).join("; ");
  const size = String(p.size||"").trim();
  return "Add the set-dressing fixture \""+(p.name||"object")+"\" into the space: "
    +(spec||"as specified on its prop card")
    +(size?(" — physical size about "+size.replace(/\.$/,"")):"")
    +". Place it ONCE, where the staging spec positions it, at true physical scale — never repeat or tile it."
    +" Match the plate's EXISTING lighting, palette and render style exactly; change nothing else in the space.";
}
window.locDressingEditText = locDressingEditText;
/* the SHELL edge — this location IS the hollow interior of that prop (hollow log,
   hive, seed pod: the building/apartment relationship — the object can't be set
   dressing of its own inside). Set on the location card ("Interior of"); drives a
   text-only `interior_of` block in the plate prompt, the Match-shell edit chip,
   and blocks the shell's exterior sheet from attaching to shots inside itself. */
function locShellProp(l){
  if(!l || !l.interiorOfPropId) return null;
  return (((window.turnContinuity||{}).props)||[]).find(p=>p && p.id===l.interiorOfPropId) || null;
}
window.locShellProp = locShellProp;
function locShellMatchEditText(p){
  const spec = [p.form, p.material].map(x=>String(x||"").trim().replace(/\.$/,"")).filter(Boolean).join("; ");
  return "This location IS the hollow INTERIOR of \""+(p.name||"the object")+"\""
    +(spec?(" ("+spec+")"):"")
    +". Correct the plate so the walls, bore and openings read as the inside of that exact object — same material palette, same shell construction, same mouth and knot openings"
    +" — while keeping the plate's EXISTING lighting, palette, render style and camera views. Change nothing else.";
}
window.locShellMatchEditText = locShellMatchEditText;
async function generateLocationPlate(l, project){
  const _ep = (typeof nbEpoch==="function") ? nbEpoch() : null;   // asset scope at generation start
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  // no set-dressing refs here — the clean plate anchors the look; fixtures are
  // painted in afterwards via the Edit panel's Set-dressing buttons
  const prompt = (typeof combinedLocationPrompt==="function") ? combinedLocationPrompt(l, project, {}) : (l.name||"location reference");
  const gopts = {};
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[l.id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, gopts); }
    catch(e){ if(/no image/i.test((e&&e.message)||"") && typeof buildSimpleLocationPrompt==="function"){ url = await nbGenerate(buildSimpleLocationPrompt(l), {}); } else throw e; }
    await nbCommit(l.id, url, _nbLocMeta(prompt), [], "location", _ep);
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:l.id, url } })); }catch(e){}
    return true;
  } finally { window.__nbGenInflight[l.id] = false; }
}
window.generateLocationPlate = generateLocationPlate;

async function generateLocationVariant(l, v, project){
  const _ep = (typeof nbEpoch==="function") ? nbEpoch() : null;   // asset scope at generation start
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const id = l.id+"-"+v.id;
  const prompt = (typeof buildLocationVariantPrompt==="function") ? buildLocationVariantPrompt(l, project, { time:v.time }) : (l.name||"location reference");
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, {}); }
    catch(e){ if(/no image/i.test((e&&e.message)||"") && typeof buildSimpleLocationPrompt==="function"){ url = await nbGenerate(buildSimpleLocationPrompt(l), {}); } else throw e; }
    await nbCommit(id, url, _nbLocMeta(prompt), [], "location", _ep);
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id, url } })); }catch(e){}
    return true;
  } finally { window.__nbGenInflight[id] = false; }
}
window.generateLocationVariant = generateLocationVariant;

/* coverage audit — scenes whose slugline names a place that isn't linked to any Location
   card yet (e.g. an unparseable or brand-new slug). After a pull every parseable scene is
   covered, so this surfaces the genuine gaps. */
function locationCoverage(scenes, locations){
  const covered = new Set();
  (locations||[]).forEach(l=> (l.scenes||[]).forEach(id=> covered.add(id)));
  const out = [];
  (scenes||[]).forEach(s=>{
    if(!s || !(s.loc||"").trim()) return;     // no slugline → not a location-bearing scene
    if(covered.has(s.id)) return;
    const p = (typeof parseSlugline==="function") ? parseSlugline(s.loc) : null;
    out.push({ id:s.id, no:s.no, title:s.title||"", slug:(s.loc||"").trim(), place:(p&&p.place)||"" });
  });
  return out;
}
window.locationCoverage = locationCoverage;
