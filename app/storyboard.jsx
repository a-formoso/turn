/* storyboard.jsx — The Art Room ▸ Storyboard.
   Each SCENE becomes one 2×2 storyboard PAGE: a single composite image of up to 4
   numbered panels, generated in one pass with GPT Image 2 (the shots' grammar +
   action + dialogue become the per-panel prompt, and the scene's character sheets,
   prop sheets + location plate ride along as references so people/place/objects stay consistent across
   panels). Until generated, the page shows a 2×2 grid of LABELLED panel guides so you
   know what each panel should depict; click a guide to edit that shot in the Shot
   List. A scene with >4 shots paginates into extra pages. */

const _sbEl = React.createElement;
/* Sheet GRID format. GPT Image 2's 16:9 request actually returns a 1536×1024 (3:2) canvas,
   so the only grids whose panels come out EXACTLY 16:9 (after the annotation strip) are:
     "2x2" — 4 cells of 768×512: panel image 768×432 (exact 16:9) + 80px strip. Default —
             best per-panel resolution; halves of the sheet are its two panel rows
             (made for video generators that condition on frames, e.g. Seedance).
   Storyboards are fixed to 2×2 so each panel keeps the strongest 16:9 consistency.
   window.SB_PAGE_SIZE tracks the live value for the Storyboard Director (app.jsx). */
const SB_GRIDS = { "2x2":4 };
function sbGridSaved(){ return "2x2"; }
window.SB_PAGE_SIZE = 4;

/* the grid shape a page paints to: the chosen grid when known, else derived from the
   panel count (≤4 panels read best as 2 columns; 1 panel needs no grid at all) */
function sbGridShape(N, grid){
  if(grid==="2x2") return { cols:2, rows:2 };
  const cols = N<=1 ? 1 : (N<=4 ? 2 : 3);
  return { cols, rows:Math.ceil(Math.max(1,N)/cols) };
}

/* Storyboard pages are always 16:9, rendered at 2K. */
function sbAspectRatio(){ return "16 / 9"; }
function sbChunk(arr, n){ const out=[]; for(let i=0;i<(arr||[]).length;i+=n) out.push(arr.slice(i,i+n)); return out; }

/* the scene's beat/subtext map (driver/reactor/desire/antagonism + per-beat rows) */
function sbBeatMeta(beatsMap, sceneId){ return (beatsMap||{})[sceneId] || {}; }
/* the beat row that a shot came from (one beat = one shot) */
function sbBeatRow(beatsMap, sh){
  const bm = (beatsMap||{})[sh.sceneId]; if(!bm) return null;
  return (bm.rows||[]).find(r=> String(r.n)===String(sh.beatN)) || null;
}
/* the names of the characters in a shot's frame */
function sbInFrame(sh, ctx){
  const ids = (typeof inFrameCast==="function") ? inFrameCast(sh, ctx.scene, Object.values(ctx.charById||{})) : (sh.subjects||[]);
  return ids.map(id=>ctx.charById[id]).filter(Boolean).map(c=>c.name);
}

function sbPropIdsForPage(scene, shots, ctx){
  const out=[], seen=new Set();
  let ledger = {};
  try{ ledger = (typeof sceneContinuityLedger==="function")
    ? sceneContinuityLedger(scene, shots, ctx.charById, ctx.propById) : {}; }catch(e){}
  (shots||[]).forEach(sh=>{
    const own = (typeof inFrameProps==="function") ? inFrameProps(sh, scene, ctx.charById, ctx.propById) : ((sh&&sh.props)||[]);
    const ids = [].concat(own||[], (ledger && ledger[sh.id]) || []);
    ids.forEach(id=>{ if(id && !seen.has(id)){ seen.add(id); out.push(id); } });
  });
  return out;
}

/* a brief beat title for the panel label: prefer the beat's dramatic intention
   (drive.a from the beat map), else the first clause of the action, else "Beat n". */
function sbBeatTitle(sh, i, row){
  if(row && row.drive && row.drive.a){
    const title = String(row.drive.a).replace(/\s+/g," ").trim();
    return (typeof clipWords==="function") ? clipWords(title,46) : title.slice(0,46);
  }
  const a = (sh && sh.action||"").replace(/\s+/g," ").trim();
  const first = (a.split(/[,;.]/)[0]||"").trim();
  return first ? first.split(" ").slice(0,6).join(" ") : ("Beat "+((sh&&sh.beatN)||(i+1)));
}
/* a mood phrase from the scene's closing value charge */
function sbMood(scene){
  const c = (scene&&scene.closeCharge)||0;
  return c<=-2 ? "stark, urgent, high-tension" : c<0 ? "tense, dramatic"
    : c>=2 ? "hopeful, warm, uplifting" : c>0 ? "lifting, warmer" : "even, observational";
}

/* one tight CHARACTER-LOCK sentence (Template 2): only the tokens that lock the look
   across panels — age/build, hair, key wardrobe colour, key prop — NOT the full sheet
   (the Character Sheet holds the canonical spec; this just anchors continuity). */
function sbCharLock(c){
  if(!c) return "";
  const p = c.physique||{};
  const idc  = [p.age, p.ethnicity, p.build].filter(Boolean).join(", ");
  const ward = (c.wardrobeMask || c.wardrobe || "").replace(/\.$/,"");
  const extra = (c.accessories && !/^none$/i.test(c.accessories)) ? c.accessories
              : ((c.props && !/^none$/i.test(c.props)) ? c.props : "");
  let s = [idc, (p.hair||""), ward, extra].map(x=>(x||"").replace(/\s+/g," ").trim()).filter(Boolean).join("; ");
  if(s.length>180) s = (typeof clipWords==="function") ? clipWords(s,180) : s.slice(0,178).replace(/[;,]\s*\S*$/,"");
  return (c.name||"Character").toUpperCase()+": "+(s||"as in the attached reference sheet")+".";
}

/* a panel's grid position label (top-left … bottom-right) for an R×C grid. */
function sbGridPos(i, cols, rows){
  const r=Math.floor(i/cols), c=i%cols;
  const colSet = cols<=1?[""] : cols===2?["left","right"] : ["left","center","right"];
  const rowSet = rows<=1?[""] : rows===2?["top","bottom"] : rows===3?["top","middle","bottom"]
               : ["top","upper-middle","lower-middle","bottom"];
  const cN=colSet[Math.min(c,colSet.length-1)], rN=rowSet[Math.min(r,rowSet.length-1)];
  return [rN,cN].filter(Boolean).join("-") || ("panel "+(i+1));
}

/* the FOUR production-note slug lines under a panel — CAMERA / MOTION / ACTION /
   PERFORMANCE — each short (2–9 words). PERFORMANCE carries the spoken line on a
   dialogue panel, else the beat's behavioural note (how it's played), else the mood. */
/* `full` = the canvas-composed sheet, which draws REAL text and can word-wrap —
   so it gets the whole first sentence / line. Without it (the GPT-painted sheet)
   values stay capped at 9 words: baked-in text must be short to render legibly. */
function sbStrip(sh, scene, row, full){
  const camera = [
    (typeof shotSizeOf==="function")  ? shotSizeOf(sh.size).label   : sh.size,
    (typeof shotAngleOf==="function") ? shotAngleOf(sh.angle).label : sh.angle,
    (typeof shotLensOf==="function")  ? shotLensOf(sh.lens).label   : sh.lens,
  ].filter(Boolean).join(" · ");
  const motion = ((typeof shotMoveOf==="function") ? shotMoveOf(sh.move).label : (sh.move||"Static")) || "Static";
  let action = (sh.action||"").replace(/\s+/g," ").trim();
  const m = action.match(/^[^.!?]*[.!?]/); if(m) action=m[0];
  action = action.replace(/[.!?]+$/,"");
  if(!full) action = action.split(" ").slice(0,9).join(" ");
  const dlg = (sh.dialogue||"").trim().replace(/^["“]|["”]$/g,"").replace(/[.!?]+$/,"");
  const beh = ((row && ((row.drive&&row.drive.d)||(row.react&&row.react.d)))||"").replace(/\s+/g," ").trim();
  const performance = dlg ? ('"'+((typeof clipWords==="function") ? clipWords(dlg, full?160:60) : dlg.slice(0, full?160:60))+'"')
    : (beh ? (full ? beh : beh.split(" ").slice(0,9).join(" ")) : sbMood(scene));
  return { camera, motion, action, performance };
}

/* The GPT Image 2 prompt for the SINGLE-SHEET composite (Template 2 — Cinematic
   Storyboard Grid): ONE image, an R×C grid of N sequential panels read as one
   continuous take, with locked characters + geography, and a baked off-white
   annotation strip (CAM / MOVE / MOOD|VOICE) under each panel. Character sheets +
   the location plate ride along as identity anchors. */
function buildStoryboardPagePrompt(scene, shots, ctx, beatsMap, opts){
  opts = opts || {};
  // the format's native frame (16:9, or 9:16 for vertical micro-drama)
  const asp = (typeof aspectFor==="function") ? aspectFor(ctx && ctx.project) : "16:9";
  const vertical = asp==="9:16";
  const loc = ctx && ctx.location;
  const bm = sbBeatMeta(beatsMap, scene.id);
  const N = (shots||[]).length;
  const { cols, rows } = sbGridShape(N, opts.grid);
  const genre = (ctx && ctx.project && ctx.project.genre) || "";
  const mood = sbMood(scene);
  const todM = String(scene.loc||"").match(/\b(NIGHT|DAY|DAWN|DUSK|MORNING|EVENING|AFTERNOON|NOON|MIDNIGHT|CONTINUOUS|LATER|SUNSET|SUNRISE)\b/i);
  const tod = ((typeof parseSlug==="function" && scene.loc) ? (parseSlug(scene.loc).time||"") : "") || (todM ? todM[1] : "");
  // shared SETTING — one place across the whole sheet
  const setBits=[];
  if(loc){ setBits.push(loc.name||"the location"); if(loc.intExt) setBits.push(loc.intExt); }
  if(tod) setBits.push(tod.toLowerCase());
  if(loc && loc.materials) setBits.push(loc.materials.replace(/\.$/,""));
  const setting = setBits.join(", ");
  const light = (loc && loc.lighting) ? loc.lighting.replace(/\.$/,"") : "motivated naturalistic light";
  // scene GRADE + film stock — so the composite matches the per-panel frames
  let grade="";
  if(typeof scenePreset==="function" && typeof buildStyleClause==="function"){ const pr=scenePreset(ctx.project,scene.id); if(pr) grade += buildStyleClause(pr); }
  if(typeof filmStockClause==="function") grade += filmStockClause(ctx.project);

  // characters present across the page (deduped, in first-appearance order)
  const seen=new Set(), cast=[];
  const _chars = Object.values(ctx.charById||{});
  (shots||[]).forEach(sh=>{ const ids=(typeof inFrameCast==="function")?inFrameCast(sh, scene, _chars):(sh.subjects||[]);
    ids.forEach(id=>{ if(seen.has(id)) return; seen.add(id); const c=ctx.charById[id]; if(c) cast.push(c); }); });

  // continuity ledger across the page's panels — a prop established in an earlier panel
  // (the doll) that a later panel's text doesn't re-name is carried forward, so it stays
  // in the cut across the sheet and across pages instead of popping out.
  let _ledger = {};
  try{ _ledger = (typeof sceneContinuityLedger==="function")
    ? sceneContinuityLedger(scene, shots, ctx.charById, ctx.propById) : {}; }catch(e){}
  const panels = (shots||[]).map((sh,i)=>{
    const row  = sbBeatRow(beatsMap, sh);
    const pos  = sbGridPos(i, cols, rows);
    const beat = sbBeatTitle(sh, i, row);
    const who  = sbInFrame(sh, ctx).join(" & ");
    const st   = sbStrip(sh, scene, row);
    // FULL first-sentence action — the complete "what's happening", so a prop named past the
    // short 9-word annotation caption (e.g. the doll) is still DEPICTED. The short st.action
    // stays the legible baked-in caption; `staging` carries the full content for the drawing.
    let fullAction = (sh.action||"").replace(/\s+/g," ").trim();
    const _am = fullAction.match(/^[^.!?]*[.!?]/); if(_am) fullAction = _am[0]; fullAction = fullAction.replace(/[.!?]+$/,"");
    // props this panel must SHOW — named in the FULL action, plus any carried forward (ledger)
    const ownProps = ((typeof inFrameProps==="function") ? inFrameProps(sh, scene, ctx.charById, ctx.propById) : (sh.props||[]))
      .map(id=>(ctx.propById||{})[id]).filter(Boolean).map(p=> p.name + (p.ownerName?(" ("+p.ownerName+"'s)"):""));
    const carried = (_ledger[sh.id]||[]).map(pid=>(ctx.propById||{})[pid]).filter(Boolean)
      .map(p=> p.name + (p.ownerName?(" ("+p.ownerName+"'s)"):""));
    const propsInFrame = Array.from(new Set([...ownProps, ...carried]));
    return { panel:i+1, position:pos, beat:beat, in_frame:who||undefined,
      camera:st.camera, motion:st.motion, action:st.action,
      staging: (fullAction && fullAction!==st.action) ? fullAction : undefined,
      performance:st.performance,
      props_in_frame: propsInFrame.length ? propsInFrame : undefined };
  });

  const _lb = (ctx && (ctx._lookbookBrief||"")).trim();
  const locName = (loc && loc.name) ? loc.name : (setting || "the location");
  const _clean = (x)=>String(x||"").replace(/\.$/,"").trim();
  const spec = {
    task: "a cinematic STORYBOARD SHEET as ONE single image \u2014 a "+rows+"\u00d7"+cols+" grid of "+N+" sequential panels (read left-to-right, top-to-bottom) depicting ONE CONTINUOUS scene",
    setting: setting || undefined,
    continuous_take: "the panels are one continuous take broken into "+N+" sequential frames \u2014 the camera moves naturally around the action, same place, one unbroken flow of time \u2014 NOT "+N+" unrelated images",
    video_clip: opts.clip ? ("THIS SHEET BOARDS ONE SINGLE VIDEO CLIP of about "+(opts.clip.dur||window.CLIP_MAX_SECONDS||15)+" seconds \u2014 stage the action and camera so motion flows seamlessly from panel to panel, one unbroken take, no time jumps") : undefined,
    style: {
      base: "cinematic"+(genre?(", "+genre+" tone"):"")+", live-action, photorealistic, lifelike, subtle 35mm film grain",
      grade: _clean(grade) || undefined,
      page_layout: vertical
        ? "a 2:3 PORTRAIT sheet (1024×1536 canvas) that is a GRID of separate 9:16 panels — the SHEET is 2:3; each PANEL is 9:16; do NOT make the whole sheet a single 9:16 image"
        : "a 3:2 LANDSCAPE sheet (1536×1024 canvas) that is a GRID of separate 16:9 panels — the SHEET is 3:2; each PANEL is 16:9; do NOT squeeze the whole sheet into 16:9 (that distorts the panels)",
    },
    atmosphere_light: light+"; "+mood,
    visual_references: _lb ? ("translate their look (framing, composition, atmosphere), NOT their content: "+_lb.replace(/\s+/g," ")) : undefined,
    grid: {
      layout: "strict "+rows+"\u00d7"+cols+" grid; all panels exactly the same size, aligned to the grid; thin clean separators between panels; NO text or panel numbers INSIDE the panels",
      panel_frame: vertical
        ? "every panel's IMAGE is a VERTICAL 9:16 phone frame \u2014 clearly TALLER than it is wide \u2014 NEVER square, landscape or 4:3"
        : "every panel's IMAGE is a WIDESCREEN 16:9 cinematic frame \u2014 clearly WIDER than it is tall, like a film still \u2014 NEVER square, portrait or 4:3",
      canvas_geometry: (!vertical && cols===2 && rows===2)
        ? "the canvas is 1536\u00d71024 \u2014 divide it into four equal 768\u00d7512 cells; each cell holds a 768\u00d7432 panel image (exactly 16:9) with its 80px annotation strip directly below"
        : (!vertical && cols===3 && rows===3)
        ? "the canvas is 1536\u00d71024 \u2014 divide it into nine equal 512\u00d7341 cells; each cell holds a 512\u00d7288 panel image (exactly 16:9) with its 53px annotation strip directly below"
        : undefined,
      empty_cells: rows*cols>N
        ? ("the grid has "+(rows*cols)+" cells but only "+N+" panels: fill the FIRST "+N+" cells in reading order; the remaining "+(rows*cols-N)+" stay completely EMPTY \u2014 solid matte black, no image, no annotation strip; NEVER stretch, enlarge or re-arrange panels to fill the empty space")
        : undefined,
    },
    annotation_strip: "UNDER EACH panel a thin off-white annotation strip carrying FOUR short lines of production notes in a clean, high-contrast sans-serif font (legible at the rendered grid size), formatted as screenplay slug lines: CAMERA (framing, angle & lens), MOTION (the camera movement), ACTION (what the subject does), PERFORMANCE (how the moment is played \u2014 or the spoken line on dialogue panels); 2\u20139 words per line, NEVER full sentences",
    panels_rule: "DRAW each panel from its `staging` (the full description of what happens) — the `camera`/`motion`/`action`/`performance` lines are ONLY the short text for the baked annotation strip, not the limit of what to depict. Every object listed in a panel's `props_in_frame` MUST be clearly visible, held and used EXACTLY as the staging says (e.g. a doll clutched to the chest). Once a prop is established with an in-frame character, keep it present in later panels with that character unless that panel explicitly says it is dropped, destroyed, handed off, taken away, hidden, stowed, or leaves frame.",
    panels: panels,
    character_lock: cast.length ? {
      rule: "every character appears IDENTICAL across all "+N+" panels (same face, build, hair, wardrobe, key props); the attached reference sheets are additional identity anchors \u2014 match them precisely",
      characters: cast.map(sbCharLock),
    } : undefined,
    drama: (bm.desire||bm.obstacle) ? {
      driver_wants: bm.desire ? ((bm.driverLabel?("("+bm.driverLabel+") "):"")+bm.desire) : undefined,
      antagonism: bm.obstacle || undefined,
    } : undefined,
    location_lock: "EVERY panel is the SAME single physical place \u2014 "+locName+": identical architecture, walls, surfaces"+(loc&&loc.materials?(" ("+_clean(loc.materials)+")"):"")+", signage, fixtures, props, layout and lighting in every panel; only the camera framing/angle and the subject's action change from beat to beat \u2014 never relocate, redesign, re-decorate or re-light the space between panels; treat the ATTACHED LOCATION PLATE as ONE real set seen from different angles: reproduce its EXACT tiling pattern, wall colour, floor, edge markings, fixtures and any SIGNAGE TEXT in the SAME spelling and SAME positions in every panel; when the camera angle changes, show THAT SAME set from the new viewpoint",
    narrative: scene.title||("Scene "+scene.no),
    exclude: ["comic-book line art","speech bubbles","captions inside the frames","watermark","duplicate or inconsistent characters","blank panels"],
    finish: "photoreal frames, sharp focus, legible annotation strips, "+asp,
  };
  return "Create ONE single storyboard-sheet image EXACTLY as specified by this JSON spec (continuity fields are binding):\n"+JSON.stringify(spec, null, 1);
  return s;
}
window.buildStoryboardPagePrompt = buildStoryboardPagePrompt;

/* ============================================================================
   COMPOSE FROM SHOT FRAMES — the zero-cost path. The Shot List already renders
   per-shot frames with the anchor-consistency machinery; the sheet is then just
   a VIEW over work already paid for: the frames laid into a 2×2 grid on a
   canvas, with the CAMERA / MOTION / ACTION / PERFORMANCE strips drawn as REAL
   text (always legible, always correct — the thing image models can't do).
   Per-panel repair comes free: regenerate one shot in the Shot List, recompose.
   The single-pass GPT Image 2 composite remains as the painterly fallback. */
async function sbLoadBitmap(url){
  if(!url) return null;
  let revoke = null;
  try{
    if(/^https?:/.test(url)){   // cross-origin signed URL would TAINT the canvas — pull bytes first
      const res = await fetch(url, { mode:"cors" }); if(!res.ok) return null;
      url = URL.createObjectURL(await res.blob()); revoke = url;
    }
    const img = new Image(); img.decoding = "async"; img.src = url;
    if(img.decode) await img.decode();
    else await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; });
    return { img, revoke };
  }catch(e){ if(revoke){ try{ URL.revokeObjectURL(revoke); }catch(_){} } return null; }
}
/* greedy word-wrap for the canvas strips; overflow past maxLines ellipsizes the
   last line (so ACTION / PERFORMANCE read whole, not chopped mid-thought). */
function sbWrapText(g, text, maxW, maxLines){
  const words = String(text||"").replace(/\s+/g," ").trim().split(" ").filter(Boolean);
  if(!words.length) return ["—"];
  const lines = []; let cur = words[0];
  for(let i=1;i<words.length;i++){
    const t = cur+" "+words[i];
    if(g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);
  if(lines.length > maxLines){
    let last = lines[maxLines-1];
    while(last && g.measureText(last+" …").width > maxW) last = last.replace(/\s*\S+$/,"");
    lines.length = maxLines; lines[maxLines-1] = (last?last+" ":"")+"…";
  }
  return lines;
}

async function composeStoryboardSheet(scene, page, ctx, beatsMap){
  const shots = page.shots || [];
  const N = shots.length; if(!N) return null;
  const off = page.start || 0;   // scene-relative shot numbering (page 2+ / clip boards)
  // gather the shots' generated frames (cache-first; cloud byte-cache makes this instant)
  const urls = [];
  for(const sh of shots){
    let u = (typeof nbGetImage==="function") ? nbGetImage(sh.id) : "";
    if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(sh.id); }catch(e){} }
    urls.push(u || "");
  }
  if(!urls.some(Boolean)) return null;
  // layout — same 2×2 grid shape as the painted sheet in the FORMAT's native frame (16:9, or vertical 9:16 for
  // micro-drama), an annotation strip under each: CAMERA + MOTION one line each,
  // ACTION + PERFORMANCE up to TWO wrapped lines (fixed slots — 6 rows — so every
  // panel's strip is the same height)
  const _asp = (typeof aspectFor==="function") ? aspectFor(ctx && ctx.project) : "16:9";
  const _ap = _asp.split(":").map(Number);
  const _vert = _ap[1] > _ap[0];
  const PAD=8, GAP=8, CELL_W=_vert?400:632, IMG_H=Math.round(CELL_W*_ap[1]/_ap[0]), STRIP_H=148, CELL_H=IMG_H+STRIP_H;
  const { cols, rows } = sbGridShape(N, page.grid);
  const W = PAD*2 + cols*CELL_W + (cols-1)*GAP;
  const H = PAD*2 + rows*CELL_H + (rows-1)*GAP;
  const canvas = document.createElement("canvas"); canvas.width=W; canvas.height=H;
  const g = canvas.getContext("2d");
  g.fillStyle = "#101012"; g.fillRect(0,0,W,H);
  const bitmaps = await Promise.all(urls.map(u=>sbLoadBitmap(u)));
  // [label, key, line slots] — ACTION and PERFORMANCE get two wrapped lines
  const SLOTS = [["CAMERA","camera",1],["MOTION","motion",1],["ACTION","action",2],["PERFORMANCE","performance",2]];
  for(let i=0;i<N;i++){
    const sh = shots[i], row = sbBeatRow(beatsMap, sh);
    const x = PAD + (i%cols)*(CELL_W+GAP), y = PAD + Math.floor(i/cols)*(CELL_H+GAP);
    // frame (cover-fit; shot frames are 16:9 so this is exact in practice)
    const bm = bitmaps[i];
    if(bm && bm.img){
      const im=bm.img, s=Math.max(CELL_W/im.naturalWidth, IMG_H/im.naturalHeight);
      const dw=im.naturalWidth*s, dh=im.naturalHeight*s;
      g.save(); g.beginPath(); g.rect(x,y,CELL_W,IMG_H); g.clip();
      g.drawImage(im, x+(CELL_W-dw)/2, y+(IMG_H-dh)/2, dw, dh); g.restore();
    } else {
      g.fillStyle="#17171a"; g.fillRect(x,y,CELL_W,IMG_H);
      g.strokeStyle="rgba(255,255,255,.14)"; g.setLineDash([6,6]); g.strokeRect(x+8.5,y+8.5,CELL_W-17,IMG_H-17); g.setLineDash([]);
      g.fillStyle="#6f6a60"; g.font="500 15px 'Hanken Grotesk', sans-serif"; g.textAlign="center";
      g.fillText("Frame not generated — Shot "+scene.no+"."+(off+i+1), x+CELL_W/2, y+IMG_H/2-8);
      g.font="500 12px 'Space Mono', monospace";
      g.fillText("generate it in the Shot List, then recompose", x+CELL_W/2, y+IMG_H/2+14);
      g.textAlign="left";
    }
    // annotation strip — real text, exact content
    const sy = y + IMG_H;
    g.fillStyle = "#f2eee4"; g.fillRect(x, sy, CELL_W, STRIP_H);
    g.strokeStyle = "#d8d2c2"; g.beginPath(); g.moveTo(x, sy+.5); g.lineTo(x+CELL_W, sy+.5); g.stroke();
    const st = sbStrip(sh, scene, row, true);   // full text — the canvas wraps it
    const LABEL_X = x+12, VALUE_X = x+128, MAX_W = CELL_W-(VALUE_X-x)-12;
    let rowI = 0;
    SLOTS.forEach(([lab,key,maxL])=>{
      const ly = sy + 22 + rowI*20;
      g.fillStyle = "#8a8474"; g.font = "700 11px 'Space Mono', monospace";
      g.fillText(lab, LABEL_X, ly);
      g.fillStyle = "#1b1a16"; g.font = "500 14px 'Hanken Grotesk', sans-serif";
      sbWrapText(g, String(st[key]||"—"), MAX_W, maxL)
        .forEach((ln,k)=> g.fillText(ln, VALUE_X, ly + k*20));
      rowI += maxL;
    });
    // panel number, top-right of the strip
    g.fillStyle = "#8a8474"; g.font = "700 11px 'Space Mono', monospace"; g.textAlign="right";
    g.fillText(scene.no+"."+(off+i+1), x+CELL_W-12, sy+22); g.textAlign="left";
  }
  bitmaps.forEach(bm=>{ if(bm && bm.revoke){ try{ URL.revokeObjectURL(bm.revoke); }catch(e){} } });
  return canvas.toDataURL("image/jpeg", 0.92);
}
window.composeStoryboardSheet = composeStoryboardSheet;

/* the whole SHEET as ONE composite image — GPT Image 2 draws every numbered panel
   (frames + captions) in a single 16:9 pass (buildStoryboardPagePrompt), with the
   scene's character sheets + location plate riding along as references. Same card
   menu as a panel (View / Details / Edit / Regenerate / Clear). */
function StoryboardComposite({ scene, page, ctx, beatsMap, onView, batchActiveId, onBatchDone, prevSheetId }){
  const sid = "sbsheet-"+page.id;
  const gen = useImageGen({
    id: sid, slotId: sid,
    buildFinal: ()=> (typeof buildStoryboardPagePrompt==="function")
      ? buildStoryboardPagePrompt(scene, page.shots, ctx, beatsMap, { grid:page.grid, ...(page.clip?{clip:{dur:page.dur}}:{}) }) : "",
    // A composite is one heavy image (a whole panel grid) — keep the reference set LEAN
    // so the proxy doesn't time out. GPT Image 2 should paint the sheet as one cohesive
    // pass, so Shot List frames are intentionally NOT used as GPT reference images.
    attachments: async (gopts)=>{
      const grab = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
        if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; };
      const out=[], seen=new Set(); let chars=0, props=0;
      // PREV-SHEET CHAINING (Part 3): the previous page's rendered sheet leads the reference
      // set as the continuity anchor, so a manually-generated sheet continues the same cast
      // looks, world and grade across pages/scenes — matching the Storyboard Director agent.
      // Only for fresh generation (an edit flow rides its own refs); skipped if it's missing.
      if(prevSheetId && !(gopts && Array.isArray(gopts.refIds) && gopts.refIds.length)){
        const pu = await grab(prevSheetId); if(pu){ out.push({ url:pu, note:"the PREVIOUS sheet — continue its cast looks, world and colour grade; do NOT copy its panels or layout" }); seen.add(prevSheetId); }
      }
      // user-requested edit references ride FIRST (the edit panels' Reference chips)
      const requested = (gopts && Array.isArray(gopts.refIds)) ? gopts.refIds : [];
      for(const rid of requested){
        const u = await grab(rid); if(!u) continue;
        const opt = editRefOptions.find(o=>o.id===rid);
        out.push({ url:u, note:(opt && opt.note) || "requested reference" }); seen.add(rid);
      }
      if(ctx.location && !seen.has(ctx.location.id)){ const u=await grab(ctx.location.id); if(u) out.push({url:u, note:(ctx.location.name||"the location")+" plate"}); }
      // everyone in frame across the page's shots — derived from each shot's action
      // text (inFrameCast), capped to keep the reference set lean.
      // SCENE-WIDE: derive cast/props from ALL the scene's shots (not just this page's),
      // so paginated pages 2,3… of the same scene attach the SAME referent input.
      const shots = (ctx.sceneShots && ctx.sceneShots.length) ? ctx.sceneShots : (page.shots||[]);
      const ids = [];
      const _chars = Object.values(ctx.charById||{});
      shots.forEach(sh=>{ const inc=(typeof inFrameCast==="function")?inFrameCast(sh, scene, _chars):(sh.subjects||[]);
        inc.forEach(id=>{ if(ids.indexOf(id)<0) ids.push(id); }); });
      for(const id of ids){ if(chars>=4) break; if(seen.has(id)) continue; seen.add(id);
        const c=ctx.charById[id]; if(!c) continue;
        const u=await grab(id); if(u){ out.push({url:u, note:c.name+"'s character sheet"}); chars++; } }
      for(const id of sbPropIdsForPage(scene, shots, ctx)){ if(props>=4) break; if(seen.has(id)) continue; seen.add(id);
        const p=ctx.propById[id]; if(!p) continue;
        const u=await grab(id); if(u){ out.push({url:u, note:(p.name||"Prop")+" prop sheet"}); props++; } }
      return out;
    },
    // the model receives the images as an ORDERED list with no captions — identify each
    // reference by purpose so the prompt can keep location and character identity stable
    attachmentsText: (attach)=> "REFERENCE IMAGES, IN ORDER: "
      +(attach||[]).map((a,i)=>"image "+(i+1)+" = "+(a.note||"reference")).join("; ")+". "
      +"Use these only as identity and location anchors. Paint the storyboard sheet as ONE cohesive single-pass image; "
      +"the location plate, character sheets and prop sheets keep the place, recurring characters and carried objects IDENTICAL across all panels.",
  });
  const GPT2 = (window.NB_MODELS||[]).find(m=>/gpt-image/i.test(m.id));
  // quality:"medium" is the timeout fix — a whole-grid composite at the default "high"
  // routinely exceeds the ~150s proxy timeout. (imageSize is ignored by the proxy for
  // OpenAI; size is fixed by aspect, so quality is the real lever.) A board isn't final art.
  // the sheet's aspect follows the format's panel frame (a near-square grid of
  // 9:16 panels reads as a 9:16 sheet; of 16:9 panels as a 16:9 sheet)
  const sheetAsp = (typeof aspectFor==="function") ? aspectFor(ctx && ctx.project) : "16:9";
  const doGen  = ()=> gen.generate({ model: GPT2?GPT2.id:undefined, aspectRatio:sheetAsp, quality:"medium" });
  const doEdit = (t)=> gen.generate({ model: GPT2?GPT2.id:undefined, aspectRatio:sheetAsp, quality:"medium", editInstruction:t, refIds:editRefSel.slice() });

  // ---- compose-from-frames: how many of this page's shots already have frames ----
  const shotIds = (page.shots||[]).map(s=>s.id);
  const [ready, setReady] = React.useState({ n:0, total:shotIds.length });
  const [composing, setComposing] = React.useState(false);
  const [composeErr, setComposeErr] = React.useState("");

  // split the sheet into halves and save both to the project's image store (cloud) —
  // the Stage's video-generation hand-off; no local files to manage. Saved halves are
  // shown under the sheet with View / Restore previous / Delete, and re-saving is a
  // guarded no-op while the halves already match the sheet's current version.
  const [halvesBusy, setHalvesBusy] = React.useState(false);
  const [halvesDone, setHalvesDone] = React.useState(false);
  const [halvesErr, setHalvesErr] = React.useState("");
  const [halves, setHalves] = React.useState({});   // { top:{url,meta}, bottom:{url,meta} }
  const [halvesOpen, setHalvesOpen] = React.useState(false);   // collapsed by default — keeps the sheet area tidy
  const loadHalves = async ()=>{
    const out = {};
    for(const h of ["top","bottom"]){
      const id = sid+":half-"+h;
      let u = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
      if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(id); }catch(e){} }
      if(u) out[h] = { url:u, meta:(typeof nbGetMeta==="function") ? (nbGetMeta(id)||null) : null };
    }
    setHalves(out);
  };
  React.useEffect(()=>{ let alive=true; (async()=>{ if(alive) await loadHalves(); })(); return ()=>{ alive=false; }; },[sid]);

  // WHAT WENT INTO THIS SHEET — the reference images recorded when the displayed
  // image was generated (location plate, character sheets, prop sheets), shown
  // as chips so the prompt's ingredients are visible at a glance.
  const [usedRefs, setUsedRefs] = React.useState(null);
  React.useEffect(()=>{
    let alive = true;
    (async()=>{
      if(!gen.genUrl){ if(alive) setUsedRefs(null); return; }
      try{ const d = await gen.loadDetails(); if(alive) setUsedRefs((d && d.refs) || []); }
      catch(e){ if(alive) setUsedRefs([]); }
    })();
    return ()=>{ alive=false; };
  },[gen.genUrl]);

  // BUILT FROM — the reference images this sheet locks to, as small thumbnails (click to
  // enlarge): the location plate, in-frame character sheets and prop sheets, plus any user-ADDED
  // references. Recomputed live so they're always displayable.
  const [refImgs, setRefImgs] = React.useState([]);   // auto influences, DERIVED from Characters/Props/Locations
  const _sbRefKey = [page.id, gen.genUrl||"", (page.shots||[]).map(s=>s.id).join(","),
    (ctx.location&&ctx.location.id)||"", prevSheetId||""].join("|");
  React.useEffect(()=>{
    let alive = true;
    (async()=>{
      const grab = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
        if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u||""; };
      const out=[], seen=new Set();
      // PREVIOUS sheet (e.g. page 1 → page 2 of the same scene) leads as the continuity
      // anchor — the same sheet the generation chains in (see attachments prevSheetId).
      if(prevSheetId){ const pu=await grab(prevSheetId); if(pu){ out.push({ url:pu, label:"Previous sheet — continuity anchor", kind:"anchor" }); seen.add(prevSheetId); } }
      const shots = (ctx.sceneShots && ctx.sceneShots.length) ? ctx.sceneShots : (page.shots||[]);   // scene-wide refs (same across pages)
      if(ctx.location){ const u=await grab(ctx.location.id); if(u){ out.push({ url:u, label:(ctx.location.name||"Location")+" plate", kind:"location" }); seen.add(ctx.location.id); } }
      const ids=[]; const _chars=Object.values(ctx.charById||{});
      shots.forEach(sh=>{ const inc=(typeof inFrameCast==="function")?inFrameCast(sh, scene, _chars):(sh.subjects||[]); inc.forEach(id=>{ if(ids.indexOf(id)<0) ids.push(id); }); });
      for(const id of ids){ if(seen.has(id)) continue; const c=ctx.charById[id]; if(!c) continue; const u=await grab(id); if(u){ out.push({ url:u, label:c.name, kind:"character" }); seen.add(id); } }
      for(const id of sbPropIdsForPage(scene, shots, ctx)){ if(seen.has(id)) continue; const p=ctx.propById[id]; if(!p) continue; const u=await grab(id); if(u){ out.push({ url:u, label:p.name||"Prop", kind:"prop" }); seen.add(id); } }
      if(alive){ setRefImgs(out); }
    })();
    return ()=>{ alive=false; };
  },[_sbRefKey]);

  // optional EXTRA REFERENCES for sheet/panel edits — the scene's characters, props
  // and location plate, opt-in chips on the edit panels so an edit can be pinned to
  // the canon designs.
  const [editRefSel, setEditRefSel] = React.useState([]);
  const editRefOptions = React.useMemo(()=>{
    const seen = new Set(), out = [];
    const refShots = (ctx.sceneShots && ctx.sceneShots.length) ? ctx.sceneShots : (page.shots||[]);
    const _chars = Object.values(ctx.charById||{});
    refShots.forEach(sh=> ((typeof inFrameCast==="function")?inFrameCast(sh, scene, _chars):(sh.subjects||[])).forEach(cid=>{
      if(seen.has(cid)) return; seen.add(cid);
      const c = ctx.charById[cid]; if(c) out.push({ id:c.id, label:c.name, note:c.name+"'s character sheet" });
    }));
    sbPropIdsForPage(scene, refShots, ctx).forEach(pid=>{
      if(seen.has(pid)) return; seen.add(pid);
      const p = ctx.propById[pid]; if(p) out.push({ id:p.id, label:p.name||"Prop", note:(p.name||"Prop")+" prop sheet" });
    });
    if(ctx.location) out.push({ id:ctx.location.id, label:(ctx.location.name||"Location")+" plate", note:(ctx.location.name||"the location")+" location plate" });
    return out;
  },[scene, page.shots, ctx]);
  const toggleEditRef = (rid)=> setEditRefSel(sel=> sel.indexOf(rid)>=0 ? sel.filter(x=>x!==rid) : [...sel, rid]);
  const editRefChips = (key)=> editRefOptions.length>0 && _sbEl("div",{key, className:"sb-editrefs"},
    _sbEl("span",{className:"sb-editrefs-lab"},"Reference:"),
    editRefOptions.map(o=> _sbEl("button",{key:o.id, className:"sb-editref-chip"+(editRefSel.indexOf(o.id)>=0?" on":""),
      title:"Attach "+o.note+" to this edit so the model matches that design exactly",
      onClick:()=>toggleEditRef(o.id)}, o.label)));
  // the sheet version the halves must match to count as "already saved"
  const sheetVersion = ()=>{ const m = gen.genMeta || ((typeof nbGetMeta==="function") ? nbGetMeta(sid) : null) || {};
    return String(m.iso||m.ts||m.version||""); };
  const halvesCurrent = !!(halves.top && halves.bottom && (()=>{ const v = sheetVersion();
    const tv = String(((halves.top||{}).meta||{}).sourceVersion||""), bv = String(((halves.bottom||{}).meta||{}).sourceVersion||"");
    return v ? (tv===v && bv===v) : true; })());
  const saveHalves = async ()=>{
    if(halvesBusy || !gen.genUrl || halvesCurrent) return;   // duplicate guard
    setHalvesBusy(true); setHalvesDone(false); setHalvesErr("");
    try{
      await sbSaveHalves(gen.genUrl, sid, page, sheetVersion());
      await loadHalves();
      setHalvesDone(true);
      setTimeout(()=>{ setHalvesDone(false); setMenuOpen(false); }, 1600);
    }catch(e){ setMenuOpen(false); setHalvesErr("Saving the halves failed — "+((e&&e.message)||e)); }
    setHalvesBusy(false);
  };
  const restoreHalf = async (h)=>{
    if(typeof nbRevertAsset!=="function") return;
    setHalvesErr("");
    try{
      const r = await nbRevertAsset(sid+":half-"+h, 0);
      if(!r){ setHalvesErr("No earlier version of the "+h+" half to restore."); return; }
      await loadHalves();
      // sync the DISPLAYED SHEET to the version this half was cut from, so there's no
      // ambiguity about which sheet the restored half belongs to
      const srcVer = String(((r && r.meta)||{}).sourceVersion||"");
      if(!srcVer){ setHalvesErr("Half restored — but it predates version stamps, so the matching sheet version couldn't be shown."); return; }
      if(srcVer === sheetVersion()) return;   // the matching sheet is already on display
      const det = await gen.loadDetails();
      const hist = (det && det.history) || [];
      const idx = hist.findIndex(e=>{ const m=(e && e.meta)||{}; return String(m.iso||m.ts||m.version||"")===srcVer; });
      if(idx < 0){ setHalvesErr("Half restored — but the sheet version it was cut from is no longer in the sheet's history."); return; }
      await gen.revertTo(idx);
    }catch(e){ setHalvesErr("Couldn't restore the "+h+" half — "+((e&&e.message)||e)); }
  };
  const deleteHalf = async (h)=>{
    let ok = true;
    if(typeof window.appConfirm==="function"){
      ok = await window.appConfirm({ title:"Delete the "+h+" half?",
        body:"Removes this saved half from your project (the Stage won't see it). The sheet itself is untouched — you can re-save halves anytime.",
        confirmLabel:"Delete", danger:true });
    }
    if(!ok) return;
    setHalvesErr("");
    try{ if(typeof nbClearAsset==="function") await nbClearAsset(sid+":half-"+h); }
    catch(e){ setHalvesErr("Couldn't delete the "+h+" half — "+((e&&e.message)||e)); return; }
    await loadHalves();
  };
  React.useEffect(()=>{
    let alive = true;
    const count = async ()=>{
      let n=0;
      for(const id of shotIds){
        let u = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
        if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(id); }catch(e){} }
        if(u) n++;
      }
      if(alive) setReady({ n, total:shotIds.length });
    };
    count();
    // a shot frame generated elsewhere (Shot List) or warmed by prefetch updates the count
    const onChange = (e)=>{ const d=(e&&e.detail)||{};
      if(d.id ? shotIds.indexOf(d.id)>=0 : true) count(); };
    window.addEventListener("nb-gen-done", onChange);
    window.addEventListener("nb-prefetched", onChange);
    return ()=>{ alive=false; window.removeEventListener("nb-gen-done", onChange); window.removeEventListener("nb-prefetched", onChange); };
  },[shotIds.join(",")]);

  // ---- per-panel edit -------------------------------------------------------
  // Composed sheet → edit the underlying SHOT FRAME (same language as the Shot
  // List's edit), then recompose; the Shot List card adopts the new frame too.
  // GPT-painted sheet → a panel-scoped edit instruction on the whole image.
  const [panelEdit, setPanelEdit] = React.useState(null);   // {idx:int|null, text:string} | null
  const [panelBusy, setPanelBusy] = React.useState(false);
  const [panelErr, setPanelErr] = React.useState("");
  const isComposed = !!((gen.genMeta && gen.genMeta.composed) || ((typeof nbGetMeta==="function") && (nbGetMeta(sid)||{}).composed));
  const applyPanelEdit = async ()=>{
    if(!panelEdit || panelEdit.idx==null || !panelEdit.text.trim() || panelBusy || gen.gening || composing) return;
    const text = panelEdit.text.trim();
    const i = panelEdit.idx, sh = page.shots[i];
    setPanelErr("");
    if(isComposed){
      // edit the shot's frame itself, then recompose the sheet around it
      setPanelBusy(true);
      try{
        let frame = (typeof nbGetImage==="function") ? nbGetImage(sh.id) : "";
        if(!frame && typeof nbLoadImage==="function"){ try{ frame = await nbLoadImage(sh.id); }catch(e){} }
        if(!frame) throw new Error("This panel has no frame yet — generate it in the Shot List first.");
        const prompt = "Edit this film frame. Apply ONLY this change: "+text+". "
          +"Everything the instruction does NOT name stays IDENTICAL to the reference — the same characters "
          +"(identical faces & wardrobe), the same location and set, the same lighting and colour grade, and "
          +"(unless the instruction changes them) the same shot size, lens and staging. Do not re-imagine the frame.";
        // quality:"medium" is the GPT Image 2 timeout lever (a frame edit at the default
        // "high" routinely exceeds the ~150s proxy timeout); other models ignore it.
        const extra = [];
        for(const rid of editRefSel){ let u=(typeof nbGetImage==="function")?nbGetImage(rid):"";
          if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(rid); }catch(e){} } if(u) extra.push(u); }
        const url = await nbGenerate(prompt + (extra.length?" Additional reference images are attached (character sheets / location plate) — match those identities and that exact set faithfully.":""),
          { referenceImage:frame, aspectRatio:sheetAsp, quality:"medium", ...(extra.length?{extraImages:extra}:{}) });
        const prior = (typeof nbGetMeta==="function") ? (nbGetMeta(sh.id)||{}) : {};
        const now = new Date();
        const meta = { ...prior, mode:"edit", editInstruction:text, prompt,
          date:now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
          time:now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
          iso:now.toISOString(), version:((prior.version||1)+1) };
        const r = (typeof nbCommit==="function") ? await nbCommit(sh.id, url, meta, [{kind:"edit",label:"Previous frame (edited)",url:frame}], "shot") : null;
        window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:sh.id, url:(r&&r.url)||url } }));
        setPanelEdit(null);
        await doCompose();   // rebuild the sheet with the repaired panel
      }catch(e){ setPanelErr((e&&e.message)||"Edit failed."); }
      setPanelBusy(false);
    } else {
      // painted sheet: scope the edit to the one panel by its grid position
      const N = page.shots.length, { cols, rows } = sbGridShape(N, page.grid);
      const pos = sbGridPos(i, cols, rows);
      setPanelEdit(null);
      doEdit("PANEL "+(i+1)+" ONLY (the "+pos+" panel of the grid): "+text
        +". Change ONLY that panel — every other panel, the grid layout, separators and ALL annotation strips remain EXACTLY as in the reference image.");
    }
  };

  // lay the existing shot frames into the sheet grid with REAL text strips —
  // instant, zero generation cost, per-panel repair via the Shot List
  const doCompose = async ()=>{
    if(gen.gening || composing || !ready.n) return;
    setComposing(true); setComposeErr("");
    try{
      const dataUrl = await composeStoryboardSheet(scene, page, ctx, beatsMap);
      if(!dataUrl) throw new Error("The sheet couldn't be drawn from the shot frames — try regenerating the frames in the Shot List, then compose again.");
      const meta = { model:"Composited from shot frames", composed:true, panels:page.shots.length,
        missing: ready.total-ready.n, aspect:"3-col grid", ts:Date.now() };
      const r = (typeof nbCommit==="function") ? await nbCommit(sid, dataUrl, meta, []) : null;
      const url = (r && r.url) || dataUrl;
      window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:sid, url } }));
    }catch(e){ setComposeErr("Compose failed — "+((e&&e.message)||e)); }
    setComposing(false);
  };

  // batch ("Generate all sheets") — when this sheet is the active id, generate it,
  // then advance the queue when it finishes (mirrors the Shot List batch).
  const batchStarted=React.useRef(false), wasGening=React.useRef(false);
  React.useEffect(()=>{ const mine=batchActiveId===sid;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){ batchStarted.current=true; wasGening.current=false; doGen(); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(sid); }
    wasGening.current=gen.gening;
  },[batchActiveId, gen.gening, sid]);

  const [menuOpen,setMenuOpen]=React.useState(false);
  const [detailsOpen,setDetailsOpen]=React.useState(false);
  const menuRef=React.useRef(null);
  React.useEffect(()=>{ if(!menuOpen) return;
    const h=(e)=>{ if(menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h); },[menuOpen]);

  const name = (scene.title||("Scene "+scene.no))+" — storyboard sheet";
  // upload a finished storyboard sheet from the machine (made elsewhere, e.g. GPT Image 2)
  // — reuses the shared importSheet so it commits to this sheet's slot at full resolution.
  const sbUploadRef = React.useRef(null);
  const pickUpload = ()=>{ if(sbUploadRef.current) sbUploadRef.current.click(); };
  const onUploadPicked = (e)=>{ const f=e.target.files&&e.target.files[0]; if(f && gen.importSheet) gen.importSheet(f); e.target.value=""; };
  return _sbEl("div",{className:"sb-comp"+(batchActiveId===sid?" batch-on":""),"data-sbsheet":page.id},
    _sbEl("input",{type:"file",accept:"image/png,image/jpeg,image/webp,image/avif",ref:sbUploadRef,style:{display:"none"},onChange:onUploadPicked}),
    _sbEl("div",{className:"sb-comp-frame"},
      gen.genUrl && _sbEl("div",{className:"sheet-tools-menu sb-tpanel-menu",ref:menuRef},
        _sbEl("button",{className:"sb-tpanel-opts"+(menuOpen?" on":""),onClick:()=>setMenuOpen(m=>!m),title:"Options"}, _sbEl(Icon.moreV,{s:14})),
        menuOpen && _sbEl("div",{className:"sheet-tools-dropdown"},
          _sbEl("button",{className:"sheet-tools-item",onClick:()=>{ onView({url:gen.genUrl,character:{name}}); setMenuOpen(false); }}, _sbEl(Icon.eye,{s:13}),"View full"),
          _sbEl("button",{className:"sheet-tools-item",onClick:()=>{ setDetailsOpen(true); setMenuOpen(false); }}, _sbEl(Icon.info,{s:13}),"Details"),
          _sbEl("button",{className:"sheet-tools-item "+(gen.editMode?"on":""),onClick:()=>{ gen.setEditMode(m=>!m); gen.setEditText(""); setMenuOpen(false); }}, _sbEl(Icon.wand,{s:13}), gen.editMode?"Close edit":"Edit sheet"),
          _sbEl("button",{className:"sheet-tools-item "+(panelEdit?"on":""),
            title: isComposed ? "Edit one panel — the change is applied to that shot's frame, then the sheet recomposes"
                              : "Edit one panel of the painted sheet by its grid position",
            onClick:()=>{ setPanelEdit(panelEdit?null:{idx:null,text:""}); setPanelErr(""); setMenuOpen(false); }},
            _sbEl(Icon.grid,{s:13}), panelEdit?"Close panel edit":"Edit a panel…"),
          _sbEl("button",{className:"sheet-tools-item",disabled:gen.gening||composing||!ready.n,
            title: ready.n ? "Recompose the sheet from the shots' current frames" : "No shot frames to compose from",
            onClick:()=>{ doCompose(); setMenuOpen(false); }}, _sbEl(Icon.board,{s:13}),"Recompose from frames"),
          _sbEl("button",{className:"sheet-tools-item",disabled:gen.gening||composing,onClick:()=>{ doGen(); setMenuOpen(false); }}, _sbEl(Icon.sparkles,{s:13}),"Regenerate (GPT Image 2)", typeof window.nbCostChip==="function" && window.nbCostChip(1,{model:GPT2&&GPT2.id,quality:"medium"})),
          _sbEl("button",{className:"sheet-tools-item",disabled:gen.gening||composing,onClick:()=>{ setMenuOpen(false); pickUpload(); }}, _sbEl(Icon.image,{s:13}),"Replace with upload"),
          _sbEl("button",{className:"sheet-tools-item"+((halvesDone||halvesCurrent)?" on":""),disabled:!gen.genUrl||halvesBusy||halvesCurrent,
            title: halvesCurrent
              ? "Both halves of this sheet version are already saved — regenerate or edit the sheet to re-save"
              : "Split the sheet horizontally and save BOTH halves to your project (cloud) — on a 2×2 sheet each half is one panel row (two 16:9 frames side by side), ready for the Stage's video generation (e.g. Seedance)",
            onClick:saveHalves},
            _sbEl(Icon.download,{s:13}),
            halvesBusy?"Saving halves…"
              :halvesDone?"Halves saved ✓"
              :halvesCurrent?"Halves saved (current)"
              :(halves.top||halves.bottom)?"Re-save halves (sheet changed)"
              :"Save halves (for the Stage)"),
          _sbEl("div",{className:"sheet-tools-divider"}),
          _sbEl("button",{className:"sheet-tools-item danger",onClick:()=>{ setMenuOpen(false); gen.clearGen(); }}, _sbEl(Icon.x,{s:13}),"Clear"))),
      gen.genUrl
        ? _sbEl("img",{className:"sb-comp-img",src:gen.genUrl,alt:"",loading:"lazy",onClick:()=>onView({url:gen.genUrl,character:{name}})})
        : (gen.gening || composing)
          ? _sbEl("div",{className:"sb-comp-empty",style:{cursor:"default"}},
              _sbEl("span",{className:"ns-spin"}),_sbEl("span",null, composing?"Composing sheet…":"Generating sheet…"))
          : _sbEl("div",{className:"sb-comp-choices"},
              _sbEl("button",{className:"sb-comp-choice primary",onClick:doCompose,disabled:!ready.n,
                title: ready.n ? "Lay the shots' generated frames into the sheet — instant, free, real text strips"
                               : "No shot frames yet — generate frames in the Shot List first"},
                _sbEl(Icon.board,{s:16}),_sbEl("span",null,"Compose from shot frames"),
                _sbEl("span",{className:"sb-comp-empty-sub"}, ready.n+" of "+ready.total+" frames ready · instant · free")),
              _sbEl("button",{className:"sb-comp-choice",onClick:doGen,
                title:"Paint the whole sheet as one image with GPT Image 2 (single pass)"},
                _sbEl(Icon.sparkles,{s:16}),_sbEl("span",null,"Generate single sheet"), typeof window.nbCostChip==="function" && window.nbCostChip(1,{model:GPT2&&GPT2.id,quality:"medium"}),
                _sbEl("span",{className:"sb-comp-empty-sub"}, page.shots.length+" panels · GPT Image 2 · 16:9")),
              _sbEl("button",{className:"sb-comp-choice",onClick:pickUpload,
                title:"Import a finished storyboard sheet you made elsewhere (e.g. ChatGPT / GPT Image 2) at full resolution"},
                _sbEl(Icon.image,{s:16}),_sbEl("span",null,"Upload a sheet"),
                _sbEl("span",{className:"sb-comp-empty-sub"}, "from your computer · full resolution"))),
      (gen.gening||composing||panelBusy) && gen.genUrl && _sbEl("div",{className:"sb-tpanel-spin"},
        _sbEl("span",{className:"ns-spin"}),
        _sbEl("span",{className:"sb-spin-lab"},
          panelBusy ? "Editing panel — regenerating that shot's frame…"
          : composing ? "Composing sheet from shot frames…"
          : "Repainting sheet with GPT Image 2 — this can take a minute or two…")),
      /* generation/compose/halves failed: show the REAL error on the sheet (not a
         hover-only icon) plus the way out — retry the failed action, or fall back to
         the free compose when frames exist */
      (gen.genErr || composeErr || (halvesErr && !(halves.top||halves.bottom))) && !gen.gening && !composing && !halvesBusy && _sbEl("div",{className:"sb-sheet-err"},
        _sbEl(Icon.alert,{s:14}),
        _sbEl("span",{className:"sb-sheet-err-msg"}, (!(halves.top||halves.bottom) && halvesErr) || composeErr || gen.genErr),
        _sbEl("div",{className:"sb-sheet-err-acts"},
          _sbEl("button",{className:"sb-sheet-err-btn primary",
            onClick:()=>{ if(halvesErr){ saveHalves(); } else if(composeErr){ doCompose(); } else { doGen(); } }},
            "Try again"),
          !composeErr && !halvesErr && ready.n>0 && _sbEl("button",{className:"sb-sheet-err-btn",
            onClick:()=>doCompose(),
            title:"Lay the shots' already-generated frames into the sheet — instant, no image model involved"},
            "Compose from frames instead")))),
    /* BUILT FROM — reference images this sheet locks to, as small thumbnails (click to
       enlarge); DERIVED from the in-frame Characters, Props and Locations, without Shot-frame keyframes */
    refImgs.length>0 && _sbEl("div",{className:"shot-refs sb-refs"},
      _sbEl("div",{className:"shot-refs-lab"}, _sbEl(Icon.layers,{s:11}),"Built from — derived from Characters, Props & Locations"),
      _sbEl("div",{className:"shot-refs-row"},
        refImgs.map((r,i)=> _sbEl("button",{key:"a"+i,className:"shot-ref-thumb "+r.kind,
          title:r.label+" — click to enlarge", onClick:()=>onView&&onView({ url:r.url, character:{ name:r.label } })},
          _sbEl("img",{src:r.url,alt:r.label,loading:"lazy"}))))),

    /* saved halves — the Stage's video-gen hand-off, managed in place: view, restore
       the previous saved version, or delete. Stale halves (cut from an older sheet
       version) say so and point at the ⋮ menu's re-save. */
    gen.genUrl && window.QaCheckButton && _sbEl("div",{className:"card-qa-row sb-qa-row"},
      _sbEl(window.QaCheckButton,{ gen, name:name, noun:"storyboard sheet" })),
    (halves.top||halves.bottom) && _sbEl("div",{className:"sb-halves"},
      _sbEl("button",{className:"sb-halves-head",onClick:()=>setHalvesOpen(o=>!o),
        "aria-expanded":halvesOpen?"true":"false",
        title: halvesOpen?"Hide the saved halves":"Show the saved halves"},
        _sbEl("span",{className:"sb-halves-chev"+(halvesOpen?" open":"")}, _sbEl(Icon.chevR,{s:12})),
        _sbEl(Icon.board,{s:11}),
        "Saved halves ("+["top","bottom"].filter(h=>halves[h]).length+") — the Stage's video-gen hand-off",
        !halvesCurrent && _sbEl("span",{className:"sb-halves-stale"},"· cut from an older sheet version — re-save from the ⋮ menu")),
      halvesOpen && _sbEl("div",{className:"sb-halves-row"},
        ["top","bottom"].map(h=> halves[h] && _sbEl("div",{key:h,className:"sb-half"},
          _sbEl("img",{src:halves[h].url,alt:h+" half",loading:"lazy",
            onClick:()=>onView({url:halves[h].url,character:{name:name+" — "+h+" half"}})}),
          _sbEl("div",{className:"sb-half-meta"},
            _sbEl("span",{className:"sb-half-tag"},h.toUpperCase()),
            halves[h].meta && halves[h].meta.date && _sbEl("span",null,halves[h].meta.date),
            _sbEl("button",{className:"sb-half-btn",onClick:()=>restoreHalf(h),
              title:"Restore this half's previous saved version — the sheet on display switches to the sheet version that half was cut from"},"Restore"),
            _sbEl("button",{className:"sb-half-btn danger",onClick:()=>deleteHalf(h),
              title:"Delete this saved half from the project — the sheet itself is untouched"},"Delete"))))),
      halvesOpen && halvesErr && _sbEl("div",{className:"sb-halves-err"}, _sbEl(Icon.alert,{s:12}), halvesErr)),

    gen.editMode && gen.genUrl && _sbEl("div",{className:"sheet-edit-panel"},
      _sbEl("input",{className:"sheet-edit-input",type:"text",autoFocus:true,placeholder:"Describe a change to the whole sheet…  e.g. tighter panels, warmer grade",
        value:gen.editText,onChange:e=>gen.setEditText(e.target.value),
        onKeyDown:e=>{ if(e.key==="Enter"&&gen.editText.trim()) doEdit(gen.editText.trim()); if(e.key==="Escape"){ gen.setEditMode(false); gen.setEditText(""); } }}),
      editRefChips("sheet-edit-refs"),
      _sbEl("div",{className:"sheet-edit-acts"},
        _sbEl("button",{className:"sheet-edit-apply",disabled:!gen.editText.trim()||gen.gening,onClick:()=>doEdit(gen.editText.trim())}, _sbEl(Icon.wand,{s:12}),"Apply edit"),
        _sbEl("button",{className:"sheet-edit-cancel",onClick:()=>{ gen.setEditMode(false); gen.setEditText(""); }},"Cancel"))),

    // per-panel edit: pick the panel, describe the change
    panelEdit && gen.genUrl && _sbEl("div",{className:"sheet-edit-panel sb-panel-edit"},
      _sbEl("div",{className:"sb-panel-chips"},
        page.shots.map((sh,i)=> _sbEl("button",{key:sh.id,
          className:"sb-panel-chip"+(panelEdit.idx===i?" on":""),
          title:(typeof shotGrammarLabel==="function")?shotGrammarLabel(sh):"",
          onClick:()=>{ setPanelEdit(p=>({ ...p, idx:i })); setPanelErr(""); }},
          scene.no+"."+((page.start||0)+i+1),
          _sbEl("span",{className:"sb-panel-chip-sub"},(typeof shotSizeOf==="function")?shotSizeOf(sh.size).label:(sh.size||""))))),
      panelEdit.idx!=null && _sbEl("input",{className:"sheet-edit-input",type:"text",autoFocus:true,
        placeholder: isComposed
          ? "Change panel "+scene.no+"."+((page.start||0)+panelEdit.idx+1)+" — edits that shot's frame, then recomposes…"
          : "Change panel "+scene.no+"."+((page.start||0)+panelEdit.idx+1)+" only — the rest of the sheet stays…",
        value:panelEdit.text,onChange:e=>setPanelEdit(p=>({ ...p, text:e.target.value })),
        onKeyDown:e=>{ if(e.key==="Enter") applyPanelEdit(); if(e.key==="Escape") setPanelEdit(null); }}),
      panelErr && _sbEl("div",{className:"sb-panel-err"}, _sbEl(Icon.alert,{s:12}), panelErr),
      editRefChips("panel-edit-refs"),
      _sbEl("div",{className:"sheet-edit-acts"},
        _sbEl("button",{className:"sheet-edit-apply",disabled:panelEdit.idx==null||!panelEdit.text.trim()||panelBusy||gen.gening||composing,
          onClick:applyPanelEdit},
          _sbEl(Icon.wand,{s:12}), panelBusy?"Editing panel…":"Apply to panel"),
        _sbEl("button",{className:"sheet-edit-cancel",onClick:()=>setPanelEdit(null)},"Cancel"))),
    detailsOpen && ReactDOM.createPortal(_sbEl(window.SheetDetails,{ gen, name, noun:"sheet",
      onClose:()=>setDetailsOpen(false), onView:(url)=>onView({url,character:{name}}) }), document.body));
}

/* one scene PAGE = a storyboard SHEET: a header bar + the composite single-sheet image
   (the whole page drawn in one pass), plus a beat-briefs expander. */
function StoryboardPage({ project, scene, page, pageCount, ctx, beatsMap, onView, jumpToShot, batchActiveId, onBatchDone, prevSheetId }){
  const clipMax = (typeof clipMaxFor==="function") ? clipMaxFor(project) : 15;
  return _sbEl("div",{className:"sb-sheet","data-sbpage":page.id},
    _sbEl("div",{className:"sb-sheet-head"},
      _sbEl("span",{className:"sb-sheet-hi"}, _sbEl("b",null,"PROJECT: "), (project&&project.title)||"Untitled film"),
      _sbEl("span",{className:"sb-sheet-hi"}, _sbEl("b",null,"SCENE: "), String(scene.no).padStart(2,"0")),
      _sbEl("span",{className:"sb-sheet-hi"}, _sbEl("b",null,"TITLE: "), scene.title||"Untitled scene"),
      page.clip
        ? _sbEl("span",{className:"sb-sheet-hi page"+((page.dur||0)>clipMax?" clip-over":""),
            title:(page.dur||0)>clipMax
              ? "≈"+page.dur+"s — over the "+clipMax+"s clip budget; split it in the Shot List's Clips strip"
              : "One generated video clip — ≈"+page.dur+"s of the "+clipMax+"s budget"},
            _sbEl("b",null,"CLIP: "), (page.index+1)+" of "+pageCount+" · ≈"+(page.dur||0)+"s")
        : _sbEl("span",{className:"sb-sheet-hi page"}, _sbEl("b",null,"PAGE: "), (page.index+1)+" of "+pageCount)),
    _sbEl(StoryboardComposite,{ scene, page, ctx, beatsMap, onView, batchActiveId, onBatchDone, prevSheetId }),

    // the exact prompt GPT Image 2 paints the WHOLE sheet from in one pass (the
    // 'Generate single sheet' / 'Regenerate (GPT Image 2)' path), read-only + copyable
    (typeof buildStoryboardPagePrompt==="function") && _sbEl(CardFold,{label:"Sheet prompt — GPT Image 2 single pass",defaultOpen:false},
      _sbEl(CopyBox,{label:"The prompt sent to GPT Image 2 to paint this whole sheet in one pass",
        text: buildStoryboardPagePrompt(scene, page.shots, ctx, beatsMap, { grid:page.grid, ...(page.clip?{clip:{dur:page.dur}}:{}) }) })),

    // full per-panel detail — Shot List fields + Writers' Room beat subtext + the final frame prompt
    _sbEl(CardFold,{label:"Beat & shot briefs",defaultOpen:false},
      (()=>{ const bm = sbBeatMeta(beatsMap, scene.id);
        return (bm.driverLabel || bm.reactorLabel || bm.desire || bm.obstacle)
          ? _sbEl("div",{className:"sb-brief-scene"},
              (bm.driverLabel||bm.reactorLabel) && _sbEl("div",{className:"sb-brief-pair"},
                _sbEl("span",null,_sbEl("b",null,"Driver: "), bm.driverLabel||"—"),
                _sbEl("span",null,_sbEl("b",null,"Reactor: "), bm.reactorLabel||"—")),
              bm.desire && _sbEl("div",{className:"sb-brief-line"},_sbEl("b",null,"Desire — "), bm.desire),
              bm.obstacle && _sbEl("div",{className:"sb-brief-line"},_sbEl("b",null,"Antagonism — "), bm.obstacle))
          : null;
      })(),
      page.shots.map((sh,i)=>{
        const bm = sbBeatMeta(beatsMap, scene.id);
        const row = sbBeatRow(beatsMap, sh);
        const who = sbInFrame(sh, ctx);
        return _sbEl("div",{className:"sb-brief",key:sh.id},
          _sbEl("div",{className:"sb-brief-head"},
            _sbEl("span",{className:"sb-brief-no"}, scene.no+"."+((page.start||0)+i+1)),
            _sbEl("span",{className:"sb-brief-gram"}, (typeof shotGrammarLabel==="function")?shotGrammarLabel(sh):""),
            _sbEl("button",{className:"sb-brief-jump",onClick:()=>jumpToShot(sh),title:"Edit in Shot List"},
              _sbEl(Icon.film,{s:10}),"Edit")),
          _sbEl("div",{className:"sb-brief-line"},_sbEl("b",null,"In frame — "), who.length?who.join(", "):"—"),
          sh.action && _sbEl("div",{className:"sb-brief-line"},_sbEl("b",null,"Action — "), sh.action),
          sh.composition && _sbEl("div",{className:"sb-brief-line"},_sbEl("b",null,"Composition — "), sh.composition),
          sh.dialogue && _sbEl("div",{className:"sb-brief-line dlg"},_sbEl("b",null,"Dialogue — "), "“"+sh.dialogue+"”"),
          row && row.drive && _sbEl("div",{className:"sb-brief-line"},_sbEl("b",null,(bm.driverLabel||"Driver")+" ▸ "), (row.drive.a||"")+(row.drive.d?(" — "+row.drive.d):"")),
          row && row.react && _sbEl("div",{className:"sb-brief-line"},_sbEl("b",null,(bm.reactorLabel||"Reactor")+" ▸ "), (row.react.a||"")+(row.react.d?(" — "+row.react.d):"")),
          (typeof combinedShotPrompt==="function") && _sbEl(CopyBox,{label:"Final frame prompt — as in the Shot List",text:combinedShotPrompt(sh, ctx)}));
      })));
}

function StoryboardView({ project, scenes, shots, characters, props, locations, beatsMap, setArtView, onDirect }){
  const [view, setView]   = React.useState(null);   // lightbox {url, character}
  const [frames, setFrames] = React.useState({});    // pageId -> url (for the progress count)
  const batch = (typeof useBatchGen==="function") ? useBatchGen() : { activeId:null, begin:()=>{}, advance:()=>{}, setMsg:()=>{} };
  const batchActiveId = batch.activeId;

  const ordered = React.useMemo(()=> (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0)), [scenes]);
  const shotsByScene = React.useMemo(()=>{
    const m={}; (shots||[]).forEach(s=>{ (m[s.sceneId]=m[s.sceneId]||[]).push(s); });
    Object.values(m).forEach(arr=>arr.sort((a,b)=>(a.order||0)-(b.order||0) || (a.beatN||0)-(b.beatN||0)));
    return m;
  }, [shots]);
  const charById = React.useMemo(()=>{ const m={}; (characters||[]).forEach(c=>m[c.id]=c); return m; },[characters]);
  const propById = React.useMemo(()=>{ const m={}; (props||[]).forEach(p=>m[p.id]=p); return m; },[props]);
  const ctxFor = (scene)=>({ scene, location:(typeof locationForScene==="function")?locationForScene(locations,scene.id):null, charById, propById, project, locations:locations||[], sceneShots:(shotsByScene[scene.id]||[]) });

  // Storyboards are fixed to scene sheets in a 2×2 grid. This keeps every panel in
  // the strongest 16:9 geometry.
  const sbGrid = "2x2";
  const pageSize = 4;
  React.useEffect(()=>{ window.SB_PAGE_SIZE = 4; },[]);

  // scene -> its pages (scene mode: chunks of the grid's page size; clip mode: one page per sequence)
  const pagesByScene = React.useMemo(()=> ordered
    .filter(s=>(shotsByScene[s.id]||[]).length)
    .map(scene=>({
      scene,
      pages: sbChunk(shotsByScene[scene.id]||[], pageSize).map((shots,index)=>({
        id:"sbpage-"+scene.id+"-2x2-"+index, index, shots, start:index*pageSize, grid:sbGrid }))
    })), [ordered, shotsByScene, pageSize, sbGrid]);
  const allSheetIds = React.useMemo(()=> pagesByScene.flatMap(g=>g.pages.map(p=>"sbsheet-"+p.id)), [pagesByScene]);
  // prev-sheet chaining (Part 3): each sheet's continuity anchor is the one before it in
  // story order (across pages AND scenes), so manual per-card generation continues the look.
  const prevSheetOf = React.useMemo(()=>{ const m={}; allSheetIds.forEach((id,i)=>{ m[id]= i>0 ? allSheetIds[i-1] : null; }); return m; }, [allSheetIds]);

  // one scene at a time — ← / → pager instead of one long scroll
  const [pIdx, setPIdx] = useScenePager(pagesByScene.length);

  // load sheet image urls (for the X-of-Y progress) + adopt freshly generated ones
  React.useEffect(()=>{
    let alive = true;
    (async ()=>{
      const map = {};
      for(const id of allSheetIds){
        let u = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
        if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(id); }catch(e){} }
        if(u) map[id] = u;
      }
      if(alive) setFrames(map);
    })();
    return ()=>{ alive=false; };
  }, [allSheetIds.join(",")]);
  React.useEffect(()=>{
    const onDone = (e)=>{ const d=e.detail||{}; if(d.id && d.url && d.id.indexOf("sbsheet-")===0) setFrames(f=>({ ...f, [d.id]: d.url })); };
    window.addEventListener("nb-gen-done", onDone);
    return ()=> window.removeEventListener("nb-gen-done", onDone);
  }, []);

  const totalSheets = allSheetIds.length;
  const readySheets = allSheetIds.filter(id=>frames[id]).length;

  // per-scene fold state (persisted) — long boards collapse to their scene headers.
  // DEFAULT: every scene starts open; folding is manual and remembered per-scene.
  const [collapsed, setCollapsed] = React.useState(()=>{ try{ return JSON.parse(localStorage.getItem("turn_sb_collapsed")||"{}")||{}; }catch(e){ return {}; } });
  React.useEffect(()=>{ try{ localStorage.setItem("turn_sb_collapsed", JSON.stringify(collapsed)); }catch(e){} },[collapsed]);
  const toggleScene = (id)=> setCollapsed(c=>({ ...c, [id]: !c[id] }));

  // "Generate all sheets" advances by watching MOUNTED sheet cards — expand all first
  const startAll = ()=>{ if(batchActiveId || !allSheetIds.length) return; setCollapsed({}); batch.begin(allSheetIds, 0); };

  // compose every sheet whose shots have frames — instant per sheet, no generation cost
  const [composingAll, setComposingAll] = React.useState(null);   // {i,total} | null
  const composeAll = async ()=>{
    if(composingAll || batchActiveId) return;
    const jobs = pagesByScene.flatMap(g=>g.pages.map(p=>({ scene:g.scene, page:p })));
    setComposingAll({ i:0, total:jobs.length });
    let made = 0;
    for(let i=0;i<jobs.length;i++){
      setComposingAll({ i:i+1, total:jobs.length });
      const { scene, page } = jobs[i];
      try{
        const dataUrl = await composeStoryboardSheet(scene, page, ctxFor(scene), beatsMap);
        if(!dataUrl) continue;   // no frames for this scene yet — skip, don't blank it
        const meta = { model:"Composited from shot frames", composed:true, panels:page.shots.length, ts:Date.now() };
        const r = (typeof nbCommit==="function") ? await nbCommit("sbsheet-"+page.id, dataUrl, meta, []) : null;
        window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:"sbsheet-"+page.id, url:(r&&r.url)||dataUrl } }));
        made++;
      }catch(e){}
    }
    setComposingAll(null);
  };

  // jump to a shot in the Shot List (pre-expand its scene, switch tab, scroll + flash)
  const jumpToShot = (sh)=>{
    try{ const c = JSON.parse(localStorage.getItem("turn_shots_collapsed")||"{}")||{}; c[sh.sceneId]=false;
      localStorage.setItem("turn_shots_collapsed", JSON.stringify(c)); }catch(e){}
    if(setArtView) setArtView("shots");
    let tries=0;
    const tick=()=>{
      const el = document.querySelector('[data-shot-card="'+sh.id+'"]');
      const scroller = el && el.closest('.art-scroll');
      if(el && scroller){ el.scrollIntoView({block:"center"}); el.classList.add("sb-flash"); setTimeout(()=>el.classList.remove("sb-flash"),1200); return; }
      if(tries++<30) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // ---- empty state ----
  if(!pagesByScene.length){
    return _sbEl("div",{className:"art-scroll"},
      _sbEl(NbKeyBar,null), _sbEl(NbControls,null),
      _sbEl("div",{className:"art-intro"},
        _sbEl("div",{className:"art-intro-row"},
          _sbEl("div",{style:{flex:1}},
            _sbEl("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Storyboard Director",
              _sbEl(window.InfoTip,{label:"About the Storyboard",
                text:"Each scene becomes one storyboard sheet — a single composite image of the scene's panels, drawn by GPT Image 2 in one pass."}))))),
      _sbEl("div",{className:"prop-empty"},
        _sbEl("div",{className:"art-soon-ic"},_sbEl(Icon.board,{s:30})),
        _sbEl("div",{className:"art-soon-t"},"No shots to board yet"),
        _sbEl("div",{className:"art-soon-d"},
          "Break your scenes into shots in the Shot List — each scene then becomes a storyboard sheet you can generate here."),
        _sbEl("button",{className:"art-draftall",style:{marginTop:16},onClick:()=> setArtView && setArtView("shots")},
          _sbEl(Icon.film,{s:14}),"Go to Shot List")));
  }

  return _sbEl("div",{className:"art-scroll"},
    view && _sbEl(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    _sbEl(NbKeyBar,null), _sbEl(NbControls,null),
    _sbEl("div",{className:"art-intro"},
      _sbEl("div",{className:"art-intro-row"},
        _sbEl("div",{style:{flex:1}},
          _sbEl("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Storyboard Director",
            _sbEl(window.InfoTip,{label:"About the Storyboard",
              text:"Each scene becomes storyboard SHEETS — 2×2 pages of four exact 16:9 panels drawn by GPT Image 2 in one cohesive pass. The sheet uses the location plate, in-frame character sheets and prop sheets for identity, geography and object continuity, while the shot text supplies action, camera and performance notes. Scenes paginate every four shots: a 5-beat scene becomes one full 2×2 page plus a second chained 2×2 page with beat 5 in the first cell and the remaining cells matte-empty, preserving every panel's 16:9 frame. Each 2×2 sheet can be split into top/bottom halves for the Stage."})),
          _sbEl("div",{style:{fontFamily:"var(--f-mono)",fontSize:11,letterSpacing:".03em",color:"var(--txt-3)",marginTop:4}},
            readySheets+" of "+totalSheets+" sheet"+(totalSheets!==1?"s":"")+" generated")),
        _sbEl("div",{className:"art-intro-actions"},
          onDirect && _sbEl("button",{className:"art-draftall ghost",disabled:!!batchActiveId||!totalSheets,onClick:onDirect,
            title:"Storyboard Director — an agent thinks through each scene's panels with the writing model, then renders every sheet with GPT Image 2"},
            _sbEl(Icon.robot,{s:14}),"Direct storyboard"),
          _sbEl("button",{className:"art-draftall ghost",disabled:!!batchActiveId||!!composingAll||!totalSheets,onClick:composeAll,
            title:"Lay each scene's generated shot frames into its sheet — instant and free; scenes with no frames yet are skipped"},
            _sbEl(Icon.board,{s:14}), composingAll?("Composing "+composingAll.i+"/"+composingAll.total+"…"):"Compose all from frames"),
          _sbEl("button",{className:"art-draftall",disabled:!!batchActiveId||!!composingAll||!totalSheets,onClick:startAll,
            title:"Generate (or regenerate) every scene's storyboard sheet, one at a time"},
            _sbEl(Icon.sparkles,{s:14}), batchActiveId?"Generating…":"Generate all sheets", typeof window.nbCostChip==="function" && window.nbCostChip(1,{model:(window.NB_MODELS||[]).filter(function(m){return /gpt-image/i.test(m.id)}).map(function(m){return m.id})[0],quality:"medium"})),
          _sbEl("button",{className:"art-draftall ghost",disabled:!readySheets,
            onClick:()=> exportStoryboard(pagesByScene, frames, project),
            title:"Preview the storyboard as a printable document (sheet images inlined for keeps), then print / save as PDF or download the HTML"},
            _sbEl(Icon.download,{s:14}),"Export storyboard"))) ),
    (typeof BatchBar!=="undefined") && BatchBar && _sbEl(BatchBar,{batch,noun:"sheet"}),

    (typeof ScenePager!=="undefined") && pagesByScene.length>0 && (()=>{ const cs=pagesByScene[Math.min(pIdx,pagesByScene.length-1)]; const cl=cs&&ctxFor(cs.scene).location;
      return _sbEl(ScenePager,{ idx:Math.min(pIdx,pagesByScene.length-1), total:pagesByScene.length,
        title:cs&&cs.scene.title, sub:cl&&cl.name, scenes:pagesByScene.map(p=>p.scene), onJump:setPIdx,
        onPrev:()=>setPIdx(i=>Math.max(0,i-1)), onNext:()=>setPIdx(i=>Math.min(pagesByScene.length-1,i+1)) }); })(),

    pagesByScene.slice(Math.min(pIdx,pagesByScene.length-1), Math.min(pIdx,pagesByScene.length-1)+1).map(({scene,pages})=>{
      const ctx = ctxFor(scene);
      const ln = ctx.location ? ctx.location.name : "";
      const open = !collapsed[scene.id];
      return _sbEl("div",{className:"sb-scene"+(open?"":" collapsed"),key:scene.id},
        _sbEl("div",{className:"sb-scene-head"},
          _sbEl("button",{className:"shot-scene-fold",onClick:()=>toggleScene(scene.id),
            title:open?"Collapse this scene":"Expand this scene","aria-expanded":open?"true":"false"},
            _sbEl(Icon.chevR,{s:15})),
          _sbEl("span",{className:"sb-scene-no"},String(scene.no).padStart(2,"0")),
          _sbEl("span",{className:"sb-scene-title",onClick:()=>toggleScene(scene.id),style:{cursor:"pointer"}},scene.title||"Untitled scene"),
          ln && _sbEl("span",{className:"sb-scene-loc"},_sbEl(Icon.globe,{s:11}),ln),
          _sbEl("span",{className:"sb-scene-count"},
            pages.length>1 ? (pages.length+" pages") : (shotsByScene[scene.id].length+" shots"))),
        open && pages.map(page=> _sbEl(StoryboardPage,{key:page.id,project,scene,page,pageCount:pages.length,ctx,beatsMap,
          onView:setView,jumpToShot,batchActiveId,onBatchDone:batch.advance,prevSheetId:prevSheetOf["sbsheet-"+page.id]})));
    }));
}
window.StoryboardView = StoryboardView;

/* ---- split a sheet into TOP / BOTTOM halves and SAVE BOTH to the project's image
   store (Supabase in cloud mode, local otherwise) — no file downloads to manage.
   Each half becomes its own asset, `<sheetId>:half-top` / `<sheetId>:half-bottom`,
   ready for the Stage's video generation (frame-conditioning, e.g. Seedance). On a
   2×2 sheet each half is one panel ROW — two exact 16:9 frames side by side. The
   image is inlined first (sbToDataUrl) so cropping a cloud sheet's signed URL
   doesn't taint the canvas. Re-saving after a sheet regenerates overwrites the
   halves (the previous pair stays in each asset's version history). */
async function sbSaveHalves(url, sid, page, sourceVersion){
  const data = await sbToDataUrl(url);
  const img = new Image();
  await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=data; });
  const mid = Math.floor(img.height/2);
  for(const [half, sy, sh] of [["top",0,mid],["bottom",mid,img.height-mid]]){
    const c = document.createElement("canvas"); c.width=img.width; c.height=sh;
    c.getContext("2d").drawImage(img, 0,sy,img.width,sh, 0,0,img.width,sh);
    const now = new Date();
    // sourceVersion = the sheet version these halves were cut from — the duplicate guard:
    // while it matches the sheet's current version, re-saving is blocked as a no-op
    const meta = { kind:"sheet-half", half, source:sid, sourceVersion:String(sourceVersion||""),
      grid:(page&&page.grid)||"", model:"Cropped from the storyboard sheet",
      date:now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
      time:now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}), iso:now.toISOString() };
    if(typeof nbCommit!=="function") throw new Error("the image store isn't available");
    const r = await nbCommit(sid+":half-"+half, c.toDataURL("image/png"), meta, []);
    if(!r || r.tier==="error") throw new Error("the "+half+" half didn't save");
  }
}

/* ---- export: printable storyboard SHEETS (header + the composite sheet image), Save as PDF ----
   DURABLE: every sheet image is inlined as a data URL before the document is written —
   cloud sheets are served on SIGNED URLs that expire within the hour, so an export that
   merely links them goes blank as soon as it's saved or printed later. */
async function sbToDataUrl(url){
  if(!url || /^data:/.test(url)) return url || "";
  try{
    const res = await fetch(url, { mode:"cors" }); if(!res.ok) return url;
    const blob = await res.blob();
    return await new Promise((resolve)=>{ const r = new FileReader();
      r.onload = ()=>resolve(String(r.result||url)); r.onerror = ()=>resolve(url); r.readAsDataURL(blob); });
  }catch(e){ return url; }
}
async function exportStoryboard(pagesByScene, frames, project){
  const esc = (s)=> String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const title = (project && project.title) || "Storyboard";
  const placeholder = '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)
    +' — Storyboard</title></head><body style="background:#000;color:#9a958b;font:13px -apple-system,Segoe UI,sans-serif;'
    +'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Preparing a durable export — inlining sheet images…</body></html>';
  // in-app PREVIEW (same overlay as the screenplay export): opens instantly on the
  // placeholder, swaps in the finished document once the images are inlined —
  // print/download from there, nothing prints uninvited.
  const prev = (typeof window.docPreview==="function")
    ? window.docPreview({ title:"Storyboard preview", sub:title,
        fileName:(title||"storyboard").replace(/[^\w\-]+/g,"_").toUpperCase()+"_STORYBOARD.html", html:placeholder,
        hint:"Sheet images are inlined as data URLs — the saved file stays viewable after image links expire." })
    : null;
  // fallback tab (overlay unavailable) — open NOW, inside the click: popup blockers
  // kill a window opened after an await
  const w = prev ? null : window.open("", "_blank");
  if(w){ w.document.open(); w.document.write(placeholder); w.document.close(); }
  // inline every sheet image (cache-keyed by page id; data URLs pass straight through)
  const inline = {};
  for(const g of pagesByScene){ for(const page of g.pages){
    const k = "sbsheet-"+page.id;
    if(frames[k]) inline[k] = await sbToDataUrl(frames[k]);
  } }
  let body = "";
  pagesByScene.forEach(({scene,pages})=>{
    pages.forEach((page)=>{
      const url = inline["sbsheet-"+page.id];
      const img = url ? '<img src="'+esc(url)+'">' : '<div class="ph"></div>';
      body += '<section class="sheet"><div class="sheet-h">'
        + '<span><b>PROJECT:</b> '+esc(title)+'</span>'
        + '<span><b>SCENE:</b> '+esc(String(scene.no).padStart(2,"0"))+'</span>'
        + '<span><b>TITLE:</b> '+esc(scene.title||"")+'</span>'
        + '<span><b>'+(page.clip?'CLIP':'PAGE')+':</b> '+(page.index+1)+' of '+pages.length
        + (page.clip?(' &middot; &asymp;'+(page.dur||0)+'s'):'')+'</span>'
        + '</div><div class="sheet-img">'+img+'</div></section>';
    });
  });
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+' — Storyboard</title>'
    + '<style>'
    + 'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#000;color:#eee;margin:24px;}'
    + '.sheet{break-inside:avoid;margin:0 0 32px;}'
    + '.sheet-h{display:flex;gap:26px;flex-wrap:wrap;font-size:12px;letter-spacing:.04em;border-bottom:1px solid #444;padding-bottom:8px;margin-bottom:14px;}'
    + '.sheet-h b{color:#999;font-weight:600;}'
    + '.sheet-img{aspect-ratio:16/9;background:#111;border:1px solid #333;border-radius:6px;overflow:hidden;}'
    + '.sheet-img img{width:100%;height:100%;object-fit:contain;display:block;background:#000;}'
    + '.sheet-img .ph{width:100%;height:100%;background:repeating-linear-gradient(135deg,#111,#111 6px,#181818 6px,#181818 12px);}'
    + '@media print{body{margin:10mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}'
    + '</style></head><body>'
    + (body||'<p>No sheets generated yet.</p>')
    + '</body></html>';
  if(prev){ prev.setHtml(html); return; }
  if(w){ w.document.open();
    w.document.write(html.replace('</body>','<script>setTimeout(function(){try{window.print();}catch(e){}},450);<\/script></body>'));
    w.document.close(); }
}
window.exportStoryboard = exportStoryboard;
