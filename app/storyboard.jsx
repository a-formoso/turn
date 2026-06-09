/* storyboard.jsx — The Art Room ▸ Storyboard.
   Each SCENE becomes one 3×3 storyboard PAGE: a single composite image of up to 9
   numbered panels, generated in one pass with GPT Image 2 (the shots' grammar +
   action + dialogue become the per-panel prompt, and the scene's character sheets +
   location plate ride along as references so people/place stay consistent across
   panels). Until generated, the page shows a 3×3 grid of LABELLED panel guides so you
   know what each panel should depict; click a guide to edit that shot in the Shot
   List. A scene with >9 shots paginates into extra pages. */

const _sbEl = React.createElement;
const SB_PAGE_SIZE = 12;   // 4-column × 3-row storyboard sheet
window.SB_PAGE_SIZE = SB_PAGE_SIZE;   // shared with the Storyboard Director ctx factory (app.jsx)

/* Storyboard pages are always 16:9 (a 3×3 of 16:9 panels is itself 16:9), rendered at 2K. */
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
function sbInFrame(sh, ctx){ return (sh.subjects||[]).map(id=>ctx.charById[id]).filter(Boolean).map(c=>c.name); }

/* a brief beat title for the panel label: prefer the beat's dramatic intention
   (drive.a from the beat map), else the first clause of the action, else "Beat n". */
function sbBeatTitle(sh, i, row){
  if(row && row.drive && row.drive.a) return String(row.drive.a).replace(/\s+/g," ").trim().slice(0,46);
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
  if(s.length>180) s = s.slice(0,178).replace(/[;,]\s*\S*$/,"");
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

/* the three production-note slug lines under a panel: CAM / MOVE / (MOOD|VOICE),
   each short (2–8 words). VOICE replaces MOOD on a panel that carries dialogue. */
function sbStrip(sh, scene){
  const cam = (typeof shotGrammarLabel==="function") ? shotGrammarLabel(sh).toUpperCase() : "";
  let mv = (sh.action||"").replace(/\s+/g," ").trim();
  const m = mv.match(/^[^.!?]*[.!?]/); if(m) mv=m[0];
  mv = mv.replace(/[.!?]+$/,"").split(" ").slice(0,9).join(" ");
  const dlg = (sh.dialogue||"").trim().replace(/^["“]|["”]$/g,"").replace(/[.!?]+$/,"");
  const third = dlg ? { k:"VOICE", v:'"'+dlg.slice(0,60)+'"' } : { k:"MOOD", v:sbMood(scene) };
  return { cam, move:mv, third };
}

/* The GPT Image 2 prompt for the SINGLE-SHEET composite (Template 2 — Cinematic
   Storyboard Grid): ONE image, an R×C grid of N sequential panels read as one
   continuous take, with locked characters + geography, and a baked off-white
   annotation strip (CAM / MOVE / MOOD|VOICE) under each panel. Character sheets +
   the location plate ride along as identity anchors. */
function buildStoryboardPagePrompt(scene, shots, ctx, beatsMap){
  const loc = ctx && ctx.location;
  const bm = sbBeatMeta(beatsMap, scene.id);
  const N = (shots||[]).length;
  const cols = Math.min(3, Math.max(1,N));
  const rows = Math.ceil(N/cols);
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
  (shots||[]).forEach(sh=> (sh.subjects||[]).forEach(id=>{ if(seen.has(id)) return; seen.add(id); const c=ctx.charById[id]; if(c) cast.push(c); }));

  const panels = (shots||[]).map((sh,i)=>{
    const pos  = sbGridPos(i, cols, rows);
    const beat = sbBeatTitle(sh, i, sbBeatRow(beatsMap, sh));
    const who  = sbInFrame(sh, ctx).join(" & ");
    const st   = sbStrip(sh, scene);
    let line = "Panel "+(i+1)+" ("+pos+"): "+beat + (who?(" — "+who):"") + ".";
    line += "  CAM: "+st.cam+".  MOVE: "+st.move+".  "+st.third.k+": "+st.third.v+".";
    return line;
  });

  let s = "Create a cinematic STORYBOARD SHEET as ONE single image: a "+rows+"×"+cols+" grid of "+N+" sequential panels "
    + "(read left-to-right, top-to-bottom) depicting ONE CONTINUOUS scene"+(setting?(" in "+setting):"")+". ";
  s += "Treat the panels as one continuous take broken into "+N+" sequential frames — the camera moves naturally around the action, "
    + "same place, one unbroken flow of time — NOT "+N+" unrelated images. ";
  s += "STYLE: cinematic"+(genre?(", "+genre+" tone"):"")+", live-action, photorealistic, lifelike, subtle 35mm film grain. "+(grade||"")+"16:9 page layout. ";
  s += "ATMOSPHERE / LIGHT: "+light+"; "+mood+". ";
  s += "LAYOUT: thin clean separators between panels; NO text or panel numbers INSIDE the panels. "
    + "UNDER EACH panel a thin off-white annotation strip carrying three short lines of production notes in a clean, "
    + "high-contrast sans-serif font (must stay legible at the rendered grid size), formatted as screenplay slug lines: "
    + "CAM (framing & camera movement), MOVE (what the subject does), and a third line — MOOD (atmosphere) by default, or "
    + "VOICE (the spoken line) on dialogue panels. Notes read as short declarative slug lines, 2–8 words, NEVER full sentences. ";
  if(cast.length){
    s += "CHARACTER LOCK — every character appears IDENTICAL across all "+N+" panels (same face, build, hair, wardrobe, key props). "
      + "Use these as the source of truth, and treat the attached reference sheets as additional identity anchors to match precisely:\n";
    s += cast.map(sbCharLock).join("\n") + "\n";
  }
  if(bm.desire)   s += "Driver "+(bm.driverLabel?("("+bm.driverLabel+") "):"")+"wants: "+bm.desire+". ";
  if(bm.obstacle) s += "Antagonism (what blocks it): "+bm.obstacle+". ";
  // strong LOCATION LOCK — the same physical place beat to beat, not just "consistent"
  const locName = (loc && loc.name) ? loc.name : (setting || "the location");
  s += "LOCATION LOCK — EVERY panel is the SAME single physical place"+(locName?(" — "+locName):"")+": identical architecture, walls, "
    + "surfaces"+(loc && loc.materials?(" ("+loc.materials.replace(/\.$/,"")+")"):"")+", signage, fixtures, props, layout and lighting in every panel. "
    + "Only the camera framing/angle and the subject's action change from beat to beat — never relocate, redesign, re-decorate or re-light the space between panels. "
    + "The attached location plate is the canonical look of this place; match it EXACTLY in every panel. ";
  s += "\nNARRATIVE — "+(scene.title||("Scene "+scene.no))+" (each panel: a cinematic frame above its annotation strip):\n";
  s += panels.join("\n")+"\n";
  s += "EXCLUDE: no comic-book line art, no speech bubbles, no captions inside the frames, no watermark, "
    + "no duplicate or inconsistent characters, no blank panels. Photoreal frames, sharp focus, legible annotation strips, 16:9.";
  return s;
}
window.buildStoryboardPagePrompt = buildStoryboardPagePrompt;

/* the whole SHEET as ONE composite image — GPT Image 2 draws every numbered panel
   (frames + captions) in a single 16:9 pass (buildStoryboardPagePrompt), with the
   scene's character sheets + location plate riding along as references. Same card
   menu as a panel (View / Details / Edit / Regenerate / Clear). */
function StoryboardComposite({ scene, page, ctx, beatsMap, onView, batchActiveId, onBatchDone }){
  const sid = "sbsheet-"+page.id;
  const gen = useImageGen({
    id: sid, slotId: sid,
    buildFinal: ()=> (typeof buildStoryboardPagePrompt==="function") ? buildStoryboardPagePrompt(scene, page.shots, ctx, beatsMap) : "",
    // A composite is one heavy image (a whole panel grid) — keep the reference set
    // LEAN (location plate + at most 4 character sheets) so the proxy doesn't time out.
    attachments: async ()=>{
      const grab = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
        if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; };
      const out=[], seen=new Set(); let chars=0;
      if(ctx.location){ const u=await grab(ctx.location.id); if(u) out.push({url:u, note:(ctx.location.name||"location")+" plate"}); }
      for(const sh of (page.shots||[])){ if(chars>=4) break; for(const id of (sh.subjects||[])){
        if(chars>=4 || seen.has(id)) continue; seen.add(id); const c=ctx.charById[id]; if(!c) continue;
        const u=await grab(id); if(u){ out.push({url:u, note:c.name+" sheet"}); chars++; } } }
      return out;
    },
    attachmentsText: ()=> "Reference images (character sheets + location plate): keep every recurring character and the location IDENTICAL across all panels.",
  });
  const GPT2 = (window.NB_MODELS||[]).find(m=>/gpt-image/i.test(m.id));
  // quality:"medium" is the timeout fix — a whole-grid composite at the default "high"
  // routinely exceeds the ~150s proxy timeout. (imageSize is ignored by the proxy for
  // OpenAI; size is fixed by aspect, so quality is the real lever.) A board isn't final art.
  const doGen  = ()=> gen.generate({ model: GPT2?GPT2.id:undefined, aspectRatio:"16:9", quality:"medium" });
  const doEdit = (t)=> gen.generate({ model: GPT2?GPT2.id:undefined, aspectRatio:"16:9", quality:"medium", editInstruction:t });

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
  return _sbEl("div",{className:"sb-comp"+(batchActiveId===sid?" batch-on":""),"data-sbsheet":page.id},
    _sbEl("div",{className:"sb-comp-frame"},
      gen.genUrl && _sbEl("div",{className:"sheet-tools-menu sb-tpanel-menu",ref:menuRef},
        _sbEl("button",{className:"sb-tpanel-opts"+(menuOpen?" on":""),onClick:()=>setMenuOpen(m=>!m),title:"Options"}, _sbEl(Icon.moreV,{s:14})),
        menuOpen && _sbEl("div",{className:"sheet-tools-dropdown"},
          _sbEl("button",{className:"sheet-tools-item",onClick:()=>{ onView({url:gen.genUrl,character:{name}}); setMenuOpen(false); }}, _sbEl(Icon.eye,{s:13}),"View full"),
          _sbEl("button",{className:"sheet-tools-item",onClick:()=>{ setDetailsOpen(true); setMenuOpen(false); }}, _sbEl(Icon.info,{s:13}),"Details"),
          _sbEl("button",{className:"sheet-tools-item "+(gen.editMode?"on":""),onClick:()=>{ gen.setEditMode(m=>!m); gen.setEditText(""); setMenuOpen(false); }}, _sbEl(Icon.wand,{s:13}), gen.editMode?"Close edit":"Edit sheet"),
          _sbEl("button",{className:"sheet-tools-item",disabled:gen.gening,onClick:()=>{ doGen(); setMenuOpen(false); }}, _sbEl(Icon.sparkles,{s:13}),"Regenerate"),
          _sbEl("div",{className:"sheet-tools-divider"}),
          _sbEl("button",{className:"sheet-tools-item danger",onClick:()=>{ setMenuOpen(false); gen.clearGen(); }}, _sbEl(Icon.x,{s:13}),"Clear"))),
      gen.genUrl
        ? _sbEl("img",{className:"sb-comp-img",src:gen.genUrl,alt:"",loading:"lazy",onClick:()=>onView({url:gen.genUrl,character:{name}})})
        : _sbEl("button",{className:"sb-comp-empty",onClick:doGen,disabled:gen.gening,title:"Generate the whole sheet as one image"},
            gen.gening ? _sbEl(React.Fragment,null,_sbEl("span",{className:"ns-spin"}),_sbEl("span",null,"Generating sheet…"))
                       : _sbEl(React.Fragment,null,_sbEl(Icon.sparkles,{s:20}),_sbEl("span",null,"Generate single sheet"),
                           _sbEl("span",{className:"sb-comp-empty-sub"}, page.shots.length+" panels · GPT Image 2 · 16:9"))),
      gen.gening && gen.genUrl && _sbEl("div",{className:"sb-tpanel-spin"}, _sbEl("span",{className:"ns-spin"})),
      gen.genErr && _sbEl("div",{className:"sb-tpanel-err",title:gen.genErr}, _sbEl(Icon.alert,{s:13}))),
    gen.editMode && gen.genUrl && _sbEl("div",{className:"sheet-edit-panel"},
      _sbEl("input",{className:"sheet-edit-input",type:"text",autoFocus:true,placeholder:"Describe a change to the whole sheet…  e.g. tighter panels, warmer grade",
        value:gen.editText,onChange:e=>gen.setEditText(e.target.value),
        onKeyDown:e=>{ if(e.key==="Enter"&&gen.editText.trim()) doEdit(gen.editText.trim()); if(e.key==="Escape"){ gen.setEditMode(false); gen.setEditText(""); } }}),
      _sbEl("div",{className:"sheet-edit-acts"},
        _sbEl("button",{className:"sheet-edit-apply",disabled:!gen.editText.trim()||gen.gening,onClick:()=>doEdit(gen.editText.trim())}, _sbEl(Icon.wand,{s:12}),"Apply edit"),
        _sbEl("button",{className:"sheet-edit-cancel",onClick:()=>{ gen.setEditMode(false); gen.setEditText(""); }},"Cancel"))),
    detailsOpen && ReactDOM.createPortal(_sbEl(window.SheetDetails,{ gen, name, noun:"sheet",
      onClose:()=>setDetailsOpen(false), onView:(url)=>onView({url,character:{name}}) }), document.body));
}

/* one scene PAGE = a storyboard SHEET: a header bar + the composite single-sheet image
   (the whole page drawn in one pass), plus a beat-briefs expander. */
function StoryboardPage({ project, scene, page, pageCount, ctx, beatsMap, onView, jumpToShot, batchActiveId, onBatchDone }){
  return _sbEl("div",{className:"sb-sheet","data-sbpage":page.id},
    _sbEl("div",{className:"sb-sheet-head"},
      _sbEl("span",{className:"sb-sheet-hi"}, _sbEl("b",null,"PROJECT: "), (project&&project.title)||"Untitled film"),
      _sbEl("span",{className:"sb-sheet-hi"}, _sbEl("b",null,"SCENE: "), String(scene.no).padStart(2,"0")),
      _sbEl("span",{className:"sb-sheet-hi"}, _sbEl("b",null,"TITLE: "), scene.title||"Untitled scene"),
      _sbEl("span",{className:"sb-sheet-hi page"}, _sbEl("b",null,"PAGE: "), (page.index+1)+" of "+pageCount)),
    _sbEl(StoryboardComposite,{ scene, page, ctx, beatsMap, onView, batchActiveId, onBatchDone }),

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
            _sbEl("span",{className:"sb-brief-no"}, scene.no+"."+(i+1)),
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
  const ctxFor = (scene)=>({ scene, location:(typeof locationForScene==="function")?locationForScene(locations,scene.id):null, charById, propById, project });

  // scene -> its pages (chunks of 9)
  const pagesByScene = React.useMemo(()=> ordered
    .filter(s=>(shotsByScene[s.id]||[]).length)
    .map(scene=>({
      scene,
      pages: sbChunk(shotsByScene[scene.id]||[], SB_PAGE_SIZE).map((shots,index)=>({ id:"sbpage-"+scene.id+"-"+index, index, shots }))
    })), [ordered, shotsByScene]);
  const allSheetIds = React.useMemo(()=> pagesByScene.flatMap(g=>g.pages.map(p=>"sbsheet-"+p.id)), [pagesByScene]);

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

  const startAll = ()=>{ if(batchActiveId || !allSheetIds.length) return; batch.begin(allSheetIds, 0); };

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
            _sbEl("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Storyboard",
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
          _sbEl("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Storyboard",
            _sbEl(window.InfoTip,{label:"About the Storyboard",
              text:"Each scene becomes one storyboard SHEET — a header bar (project · scene · title · page) over a single composite image drawn by GPT Image 2 in one pass (the 'Cinematic Storyboard Grid'): a grid of the scene's panels rendered as one continuous take, with locked characters + location and a baked CAM / MOVE / MOOD·VOICE annotation strip under each panel. References (character sheets + location plate) ride along for consistency. Scenes with more than 12 shots paginate. 'Direct storyboard' hands the whole board to the Storyboard Director agent: it thinks through each scene's panels with the writing model, then renders every sheet with GPT Image 2 on its own."})),
          _sbEl("div",{style:{fontFamily:"var(--f-mono)",fontSize:11,letterSpacing:".03em",color:"var(--txt-3)",marginTop:4}},
            readySheets+" of "+totalSheets+" sheet"+(totalSheets!==1?"s":"")+" generated")),
        _sbEl("div",{className:"art-intro-actions"},
          onDirect && _sbEl("button",{className:"art-draftall",disabled:!!batchActiveId||!totalSheets,onClick:onDirect,
            title:"Storyboard Director — an agent thinks through each scene's panels with the writing model, then renders every sheet with GPT Image 2"},
            _sbEl(Icon.robot,{s:14}),"Direct storyboard"),
          _sbEl("button",{className:"art-draftall ghost",disabled:!!batchActiveId||!totalSheets,onClick:startAll,
            title:"Generate (or regenerate) every scene's storyboard sheet, one at a time"},
            _sbEl(Icon.sparkles,{s:14}), batchActiveId?"Generating…":"Generate all sheets"),
          _sbEl("button",{className:"art-draftall ghost",disabled:!readySheets,
            onClick:()=> exportStoryboard(pagesByScene, frames, project),
            title:"Export the generated storyboard sheets as a printable document (open & Save as PDF)"},
            _sbEl(Icon.download,{s:14}),"Export storyboard"))) ),
    (typeof BatchBar!=="undefined") && BatchBar && _sbEl(BatchBar,{batch,noun:"sheet"}),

    pagesByScene.map(({scene,pages})=>{
      const ctx = ctxFor(scene);
      const ln = ctx.location ? ctx.location.name : "";
      return _sbEl("div",{className:"sb-scene",key:scene.id},
        _sbEl("div",{className:"sb-scene-head"},
          _sbEl("span",{className:"sb-scene-no"},String(scene.no).padStart(2,"0")),
          _sbEl("span",{className:"sb-scene-title"},scene.title||"Untitled scene"),
          ln && _sbEl("span",{className:"sb-scene-loc"},_sbEl(Icon.globe,{s:11}),ln),
          _sbEl("span",{className:"sb-scene-count"}, pages.length>1 ? (pages.length+" pages") : (shotsByScene[scene.id].length+" shots"))),
        pages.map(page=> _sbEl(StoryboardPage,{key:page.id,project,scene,page,pageCount:pages.length,ctx,beatsMap,
          onView:setView,jumpToShot,batchActiveId,onBatchDone:batch.advance})));
    }));
}
window.StoryboardView = StoryboardView;

/* ---- export: printable storyboard SHEETS (header + the composite sheet image), Save as PDF ---- */
function exportStoryboard(pagesByScene, frames, project){
  const esc = (s)=> String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const title = (project && project.title) || "Storyboard";
  let body = "";
  pagesByScene.forEach(({scene,pages})=>{
    pages.forEach((page)=>{
      const url = frames["sbsheet-"+page.id];
      const img = url ? '<img src="'+esc(url)+'">' : '<div class="ph"></div>';
      body += '<section class="sheet"><div class="sheet-h">'
        + '<span><b>PROJECT:</b> '+esc(title)+'</span>'
        + '<span><b>SCENE:</b> '+esc(String(scene.no).padStart(2,"0"))+'</span>'
        + '<span><b>TITLE:</b> '+esc(scene.title||"")+'</span>'
        + '<span><b>PAGE:</b> '+(page.index+1)+' of '+pages.length+'</span>'
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
    + '<script>setTimeout(function(){try{window.print();}catch(e){}},450);<\/script>'
    + '</body></html>';
  const w = window.open("", "_blank");
  if(w){ w.document.open(); w.document.write(html); w.document.close(); }
}
window.exportStoryboard = exportStoryboard;
