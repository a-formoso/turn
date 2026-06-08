/* storyboard.jsx — The Art Room ▸ Storyboard.
   Each SCENE becomes one 3×3 storyboard PAGE: a single composite image of up to 9
   numbered panels, generated in one pass with GPT Image 2 (the shots' grammar +
   action + dialogue become the per-panel prompt, and the scene's character sheets +
   location plate ride along as references so people/place stay consistent across
   panels). Until generated, the page shows a 3×3 grid of LABELLED panel guides so you
   know what each panel should depict; click a guide to edit that shot in the Shot
   List. A scene with >9 shots paginates into extra pages. */

const _sbEl = React.createElement;
const SB_PAGE_SIZE = 9;

/* the project's frame aspect, as a CSS aspect-ratio string (a 3×3 of 16:9 panels is itself 16:9) */
function sbAspectRatio(){
  const a = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  if(a==="9:16") return "9 / 16";
  if(a==="21:9") return "21 / 9";
  return "16 / 9";
}
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

/* the GPT Image 2 prompt for one 3×3 storyboard page — folds in the Shot List fields
   (composition, dialogue, who's in frame, the shot's framing) AND the Writers' Room
   beat subtext (driver/reactor, desire, antagonism, the reactor's subtext). */
function buildStoryboardPagePrompt(scene, shots, ctx, beatsMap){
  const loc = ctx && ctx.location;
  const bm = sbBeatMeta(beatsMap, scene.id);
  const dlab = bm.driverLabel || "Driver", rlab = bm.reactorLabel || "Reactor";
  const panels = (shots||[]).map((sh,i)=>{
    const g = (typeof shotGrammarLabel==="function") ? shotGrammarLabel(sh) : "";
    const who = sbInFrame(sh, ctx).join(", ");
    const act = (sh.action||"").replace(/\s+/g," ").trim();
    const comp = (sh.composition||"").replace(/\s+/g," ").trim();
    const dlg = (sh.dialogue||"").trim();
    const row = sbBeatRow(beatsMap, sh);
    let line = "Panel "+(i+1)+" — "+g+(who?" — in frame: "+who:"")+": "+act+".";
    if(comp) line += " Composition: "+comp+".";
    if(dlg)  line += " Spoken: “"+dlg+"”.";
    if(row && row.drive) line += " "+dlab+" subtext — "+(row.drive.a||"")+(row.drive.d?(": "+row.drive.d):"")+".";
    if(row && row.react) line += " "+rlab+" subtext — "+(row.react.a||"")+(row.react.d?(": "+row.react.d):"")+".";
    return line;
  });
  let s = "A single CINEMATIC STORYBOARD PAGE as ONE image: a clean 3×3 grid of nine equal rectangular panels "
    + "separated by thin white gutters, each panel a film storyboard frame. Number each panel small in its top-left "
    + "corner 1–9, left-to-right then top-to-bottom. ";
  s += "SCENE: "+(scene.title||("Scene "+scene.no))+". ";
  if(loc) s += "Setting: "+(loc.name||"")+". ";
  if(bm.desire)   s += "Driver "+(bm.driverLabel?("("+bm.driverLabel+") "):"")+"wants: "+bm.desire+". ";
  if(bm.obstacle) s += "Antagonism (what blocks it): "+bm.obstacle+". ";
  s += "Let that desire and antagonism colour the emotion and body language in every panel. ";
  s += "Draw these panels in order:\n"+panels.join("\n")+"\n";
  if((shots||[]).length < SB_PAGE_SIZE) s += "Leave panels "+(shots.length+1)+"–9 as empty blank frames. ";
  s += "Keep every recurring character IDENTICAL across panels (same face, hair and wardrobe) and the location "
    + "consistent — use the attached character reference sheets and location plate. Frame each panel to the "
    + "stated size, angle and lens, and stage it per its composition note. Cohesive cinematic storyboard look, "
    + "clear staging, legible at a glance. ONE single image, 3×3 grid, no captions or text other than the small panel numbers.";
  return s;
}
window.buildStoryboardPagePrompt = buildStoryboardPagePrompt;

/* one scene page = one generated 3×3 image (or the labelled-guide placeholder) */
function StoryboardPage({ scene, page, pageCount, ctx, beatsMap, onView, jumpToShot, batchActiveId, onBatchDone }){
  const gen = useImageGen({
    id: page.id, slotId: "sbpage-"+page.id,
    buildFinal: ()=> buildStoryboardPagePrompt(scene, page.shots, ctx, beatsMap),
    buildSimple: ()=> buildStoryboardPagePrompt(scene, page.shots, ctx, beatsMap),
    attachments: async ()=>{
      const grab = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
        if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; };
      const out=[], seen=new Set();
      if(ctx.location){ const u=await grab(ctx.location.id); if(u) out.push({url:u, note:(ctx.location.name||"location")+" plate"}); }
      const ids=[]; (page.shots||[]).forEach(sh=>(sh.subjects||[]).forEach(id=>{ if(!seen.has(id)){ seen.add(id); ids.push(id); } }));
      for(const id of ids){ const c=ctx.charById[id]; if(!c) continue; const u=await grab(id); if(u) out.push({url:u, note:c.name+" sheet"}); }
      return out;
    },
    attachmentsText: ()=> "Reference images (the character sheets and the location plate): keep the same people and place "
      + "across EVERY panel — match faces, wardrobe and the location exactly.",
  });

  const GPT2 = (window.NB_MODELS||[]).find(m=>/gpt-image/i.test(m.id));
  const doGen = ()=> gen.generate({ model: GPT2 ? GPT2.id : undefined });

  // batch: auto-generate when this page is the active queue member
  const batchStarted = React.useRef(false);
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===page.id;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){ batchStarted.current=true; wasGening.current=false; doGen(); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(page.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, page.id]);

  const aspect = sbAspectRatio();
  const cells = []; for(let i=0;i<SB_PAGE_SIZE;i++) cells.push(page.shots[i]||null);
  const sceneName = (scene.title||("Scene "+scene.no))+" — storyboard";
  const lab = pageCount>1 ? ("Page "+(page.index+1)+" / "+pageCount) : "Storyboard page";

  return _sbEl("div",{className:"sb-page"+(batchActiveId===page.id?" batch-on":""),"data-sbpage":page.id},
    _sbEl("div",{className:"sb-page-head"},
      _sbEl("span",{className:"sb-page-lab"},lab),
      _sbEl("span",{className:"sb-page-range"}, page.shots.length+" panel"+(page.shots.length!==1?"s":"")),
      _sbEl("div",{className:"sb-page-acts"},
        gen.genUrl && _sbEl("button",{className:"sb-mini",onClick:()=>onView({url:gen.genUrl,character:{name:sceneName}})},
          _sbEl(Icon.eye,{s:12}),"View"),
        _sbEl("button",{className:"sb-mini accent",disabled:gen.gening,onClick:doGen,
          title:(GPT2?"Generate this page with GPT Image 2":"Generate this page")},
          _sbEl(Icon.sparkles,{s:12}), gen.gening?"Generating…":(gen.genUrl?"Regenerate":"Generate page")),
        gen.genUrl && _sbEl("button",{className:"sb-mini danger",onClick:gen.clearGen},
          _sbEl(Icon.trash,{s:12}),"Clear"))),
    gen.genErr && _sbEl("div",{className:"sb-page-err"}, _sbEl(Icon.alert,{s:12}), _sbEl("span",null,gen.genErr)),
    _sbEl("div",{className:"sb-page-frame",style:{aspectRatio:aspect}},
      gen.genUrl
        ? _sbEl("img",{className:"sb-page-img",src:gen.genUrl,alt:"",loading:"lazy",
            onClick:()=>onView({url:gen.genUrl,character:{name:sceneName}})})
        : _sbEl("div",{className:"sb-panels"},
            cells.map((sh,i)=>{
              if(!sh) return _sbEl("div",{key:i,className:"sb-panel empty"}, _sbEl("span",{className:"sb-panel-no dim"}, i+1));
              const who = sbInFrame(sh, ctx);
              return _sbEl("button",{key:i,className:"sb-panel",onClick:()=>jumpToShot(sh),
                  title:"Edit shot "+scene.no+"."+(i+1)+" in the Shot List"},
                _sbEl("span",{className:"sb-panel-no"}, i+1),
                _sbEl("span",{className:"sb-panel-gram"}, (typeof shotGrammarLabel==="function")?shotGrammarLabel(sh):""),
                who.length>0 && _sbEl("span",{className:"sb-panel-who"}, who.join(", ")),
                _sbEl("span",{className:"sb-panel-act"}, sh.action||""),
                sh.composition && _sbEl("span",{className:"sb-panel-comp"}, sh.composition),
                sh.dialogue && _sbEl("span",{className:"sb-panel-dlg"}, "“"+sh.dialogue+"”"));
            })),
      gen.gening && _sbEl("div",{className:"sb-page-spin"}, _sbEl("span",{className:"ns-spin"}), "Generating page…")),

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

function StoryboardView({ project, scenes, shots, characters, props, locations, beatsMap, setArtView }){
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
  const allPageIds = React.useMemo(()=> pagesByScene.flatMap(g=>g.pages.map(p=>p.id)), [pagesByScene]);

  // load page image urls (for the X-of-Y progress) + adopt freshly generated ones
  React.useEffect(()=>{
    let alive = true;
    (async ()=>{
      const map = {};
      for(const id of allPageIds){
        let u = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
        if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(id); }catch(e){} }
        if(u) map[id] = u;
      }
      if(alive) setFrames(map);
    })();
    return ()=>{ alive=false; };
  }, [allPageIds.join(",")]);
  React.useEffect(()=>{
    const onDone = (e)=>{ const d=e.detail||{}; if(d.id && d.url && d.id.indexOf("sbpage-")===0) setFrames(f=>({ ...f, [d.id]: d.url })); };
    window.addEventListener("nb-gen-done", onDone);
    return ()=> window.removeEventListener("nb-gen-done", onDone);
  }, []);

  const totalPages = allPageIds.length;
  const readyPages = allPageIds.filter(id=>frames[id]).length;

  const startAll = ()=>{ if(batchActiveId || !allPageIds.length) return; batch.begin(allPageIds, 0); };

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
                text:"Each scene becomes one 3×3 storyboard page — a single image of up to nine panels, generated with GPT Image 2."}))))),
      _sbEl("div",{className:"prop-empty"},
        _sbEl("div",{className:"art-soon-ic"},_sbEl(Icon.board,{s:30})),
        _sbEl("div",{className:"art-soon-t"},"No shots to board yet"),
        _sbEl("div",{className:"art-soon-d"},
          "Break your scenes into shots in the Shot List — each scene then becomes a 3×3 storyboard page you can generate here."),
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
              text:"Each scene is one 3×3 storyboard page — a single image of up to nine panels, generated in one pass with GPT Image 2. Until a page is generated it shows labelled panel guides; click a guide to edit that shot."})),
          _sbEl("div",{style:{fontFamily:"var(--f-mono)",fontSize:11,letterSpacing:".03em",color:"var(--txt-3)",marginTop:4}},
            readyPages+" of "+totalPages+" page"+(totalPages!==1?"s":"")+" generated")),
        _sbEl("div",{className:"art-intro-actions"},
          _sbEl("button",{className:"art-draftall",disabled:!!batchActiveId||!totalPages,onClick:startAll,
            title:"Generate (or regenerate) every scene's storyboard page, one at a time"},
            _sbEl(Icon.sparkles,{s:14}), batchActiveId?"Generating…":"Generate all pages"),
          _sbEl("button",{className:"art-draftall ghost",disabled:!readyPages,
            onClick:()=> exportStoryboard(pagesByScene, frames, project),
            title:"Export the generated storyboard pages as a printable sheet (open & Save as PDF)"},
            _sbEl(Icon.download,{s:14}),"Export storyboard"))) ),
    (typeof BatchBar!=="undefined") && BatchBar && _sbEl(BatchBar,{batch,noun:"page"}),

    pagesByScene.map(({scene,pages})=>{
      const ctx = ctxFor(scene);
      const ln = ctx.location ? ctx.location.name : "";
      return _sbEl("div",{className:"sb-scene",key:scene.id},
        _sbEl("div",{className:"sb-scene-head"},
          _sbEl("span",{className:"sb-scene-no"},String(scene.no).padStart(2,"0")),
          _sbEl("span",{className:"sb-scene-title"},scene.title||"Untitled scene"),
          ln && _sbEl("span",{className:"sb-scene-loc"},_sbEl(Icon.globe,{s:11}),ln),
          _sbEl("span",{className:"sb-scene-count"}, pages.length>1 ? (pages.length+" pages") : (shotsByScene[scene.id].length+" shots"))),
        pages.map(page=> _sbEl(StoryboardPage,{key:page.id,scene,page,pageCount:pages.length,ctx,beatsMap,
          onView:setView,jumpToShot,batchActiveId,onBatchDone:batch.advance})));
    }));
}
window.StoryboardView = StoryboardView;

/* ---- export: printable storyboard (the generated page images), open → Save as PDF ---- */
function exportStoryboard(pagesByScene, frames, project){
  const esc = (s)=> String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const title = (project && project.title) || "Storyboard";
  let body = "";
  pagesByScene.forEach(({scene,pages})=>{
    pages.forEach((page)=>{
      const url = frames[page.id];
      if(!url) return;  // only export generated pages
      const lab = "SC "+esc(String(scene.no).padStart(2,"0"))+" — "+esc(scene.title||"")
        + (pages.length>1 ? (" &middot; page "+(page.index+1)+"/"+pages.length) : "");
      body += '<div class="pg"><div class="lab">'+lab+'</div><img src="'+esc(url)+'"></div>';
    });
  });
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+' — Storyboard</title>'
    + '<style>'
    + 'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16181d;margin:30px;}'
    + 'h1{font-size:20px;margin:0 0 16px;}'
    + '.pg{break-inside:avoid;margin:0 0 22px;}'
    + '.lab{font-size:12px;font-weight:600;background:#1b1e26;color:#fff;padding:6px 10px;border-radius:5px;display:inline-block;margin-bottom:8px;}'
    + '.pg img{display:block;width:100%;border:1px solid #d7dae0;border-radius:8px;}'
    + '@media print{body{margin:12mm;}}'
    + '</style></head><body>'
    + '<h1>'+esc(title)+' &mdash; Storyboard</h1>'+ (body||'<p>No pages generated yet.</p>')
    + '<script>setTimeout(function(){try{window.print();}catch(e){}},450);<\/script>'
    + '</body></html>';
  const w = window.open("", "_blank");
  if(w){ w.document.open(); w.document.write(html); w.document.close(); }
}
window.exportStoryboard = exportStoryboard;
