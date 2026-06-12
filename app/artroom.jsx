/* artroom.jsx — The Art Room (pre-production).
   Path A: TURN generates the prompts & specs and holds the asset slots; the user
   runs the image/video tools and drops results back in. Everything derives from
   the script so characters/locations/shots stay consistent.

   Character Sheets are pro consistency anchors: identity tokens + render texture,
   two wardrobe states (public mask / private self), accessories, scale & height,
   a colour palette (incl. a climax-state colour), a negative prompt, and a
   10-panel master-grid reference prompt — all auto-populated when a story is
   generated. Locations / Shots / Storyboard are subsequent increments. */

const ART_TABS = [
  { id:"lookbook",   label:"Lookbook",   icon:"image" },
  { id:"props",      label:"Props",      icon:"box" },
  { id:"characters", label:"Characters", icon:"user" },
  { id:"locations",  label:"Locations",  icon:"globe" },
  { id:"stylebible", label:"Presets", icon:"layers" },
  { id:"shots",      label:"Shots",  icon:"film" },
  { id:"storyboard", label:"Storyboards", icon:"board" },
];
window.ART_TABS = ART_TABS;

/* pull hex colours out of a CSS gradient and seed a palette (key / shadow / climax) */
function paletteFromGradient(g){
  const hexes = (String(g||"").match(/#[0-9a-fA-F]{6}/g)) || ["#7a6cae","#2a2440"];
  return [
    { name:"Key", hex:hexes[0] },
    { name:"Shadow", hex:hexes[1]||hexes[0] },
    { name:"Climax", hex:"#b8412e" },
  ];
}
window.paletteFromGradient = paletteFromGradient;

/* deterministic visual defaults — so a sheet is never empty even before any
   model call. Generation applies these instantly; the sheet falls back to them. */
function charVisualDefaults(c){
  return {
    scaleClass: c.scaleClass || "Class A \u00b7 Human",
    height: c.height || "approx. 175 cm",
    negativePrompt: c.negativePrompt || "plastic skin, waxy texture, 3d render, cgi look, low resolution, blurry, deformed hands, extra fingers, warped face, text, watermark",
    palette: (c.palette && c.palette.length) ? c.palette : paletteFromGradient(c.color),
  };
}
window.charVisualDefaults = charVisualDefaults;

/* resolve a visual field with legacy fallback (old sheets used look/wardrobe) */
function vfield(c, key, legacy){ return (c[key] && c[key].trim()) ? c[key] : (legacy && c[legacy] ? c[legacy] : ""); }

/* deterministic 10-panel master-grid reference prompt, assembled from the fields */
function buildCharRefPrompt(c, project){
  const P = project || {};
  const v = charVisualDefaults(c);
  const body = vfield(c,"coreBody","look");
  const texture = c.materialTexture || "natural skin pore texture, subsurface scattering, soft cinematic studio lighting, high detail";
  const style = c.renderStyle || "photoreal cinematic, 35mm, natural film grain, shallow depth of field";
  const mask = vfield(c,"wardrobeMask","wardrobe");
  const acc = (c.accessories && !/^none$/i.test(c.accessories.trim())) ? (", accessories: "+c.accessories.replace(/\.$/,"")) : "";
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  // role descriptor connects the look back to who the character is
  const who = [c.role, c.conscious && c.conscious.replace(/\.$/,"")].filter(Boolean).join(" \u00b7 ");
  let s = "Master character design reference sheet \u2014 "+(c.name||"Character")+". ";
  s += "PHYSICAL IDENTITY: "+(who?who+". ":"")+(body?(body.replace(/\.$/,"")+". "):"")
     +(c.bodyRationale?("("+c.bodyRationale.replace(/\.$/,"")+"). "):"");
  s += "Skin & texture: "+texture.replace(/\.$/,"")+". ";
  s += mask ? ("Wearing "+mask.replace(/\.$/,"")+acc+". ") : "";
  if(tone) s += tone+" tone. ";
  s += "Character is "+v.height+" tall ("+v.scaleClass+"). ";
  s += "RENDER STYLE: "+style.replace(/\.$/,"")+". ";
  s += "10-panel 5x2 grid. Top row: full-body front (0\u00b0), 3/4 front (45\u00b0), profile (90\u00b0), 3/4 back (135\u00b0), back (180\u00b0). ";
  s += "Bottom row: close-up headshots \u2014 neutral front, neutral profile, joy, anger, grief. ";
  s += "Solid light grey background, a vertical height-measurement bar on the left, soft even studio lighting, the SAME identical face and identity across every panel, sharp focus. --ar 16:9";
  return s;
}
window.buildCharRefPrompt = buildCharRefPrompt;

/* has this character's descriptive (model-drafted) visual layer been filled? */
function charVisualsDrafted(c){
  return !!((vfield(c,"coreBody","look")||"").trim() && (vfield(c,"wardrobeMask","wardrobe")||"").trim());
}
window.charVisualsDrafted = charVisualsDrafted;

/* prompt for image-to-image generation from a dropped reference photo.
   Unlike the master text prompt this one explicitly instructs the model to
   reproduce the face/build it sees in the reference image faithfully. */
function buildRefFromPhotoPrompt(c, project){
  const P = project || {};
  const v = charVisualDefaults(c);
  const mask = ((c.wardrobeMask||c.wardrobe)||"").replace(/\.$/,"").trim();
  const acc = (c.accessories && !/^none$/i.test(c.accessories.trim()))
    ? (", accessories: "+c.accessories.replace(/\.$/,"")) : "";
  const style = c.renderStyle || "photoreal cinematic, 35mm, natural film grain, shallow depth of field";
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  let s = "Master character design reference sheet \u2014 "+(c.name||"Character")+". ";
  s += "BASE APPEARANCE: match EXACTLY the face, hair colour & style, skin tone, and physical build ";
  s += "as shown in the reference photo. Do not alter or idealise the subject's appearance. ";
  if(c.role) s += "Role: "+c.role+". ";
  s += mask ? ("Wearing "+mask.replace(/\.$/,"")+acc+". ") : "";
  if(tone) s += tone+" tone. ";
  s += "Character is "+v.height+" tall ("+v.scaleClass+"). ";
  s += "RENDER STYLE: "+style.replace(/\.$/,"")+". ";
  s += "10-panel 5\u00d72 grid. Top row: full-body front (0\u00b0), 3/4 front (45\u00b0), profile (90\u00b0), 3/4 back (135\u00b0), back (180\u00b0). ";
  s += "Bottom row: close-up headshots \u2014 neutral front, neutral profile, joy, anger, grief. ";
  s += "Solid light grey background, height-measurement bar on the left, soft even studio lighting, ";
  s += "the SAME identical face across every panel, sharp focus. --ar 16:9";
  return s;
}
window.buildRefFromPhotoPrompt = buildRefFromPhotoPrompt;

/* ============================================================
   useImageGen — shared Nano Banana generation engine for any
   "sheet" entity (characters, props, …). Owns image state, the
   reference-photo slot watcher, edit mode, auto-retry, grounding,
   and tiered persistence. Parameterized by prompt builders so the
   same machinery drives every kind of reference sheet.
   ============================================================ */
function useImageGen(opts){
  const { id, slotId } = opts;
  // module-level registry of in-flight generations, so a generation survives the
  // owning card unmounting (e.g. switching Art Room tabs mid-generate). A remounted
  // card reads this to restore the spinner, and a global "nb-gen-done" event lets it
  // adopt the committed result even though the original card instance is gone.
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  const allModels = window.NB_MODELS || [];
  const [genUrl, setGenUrl] = React.useState(()=> (typeof nbGetImage==="function") ? nbGetImage(id) : "");
  const [genMeta, setGenMeta] = React.useState(()=> (typeof nbGetMeta==="function") ? nbGetMeta(id) : null);
  const [genTier, setGenTier] = React.useState("local");
  const [gening, setGening] = React.useState(()=> !!(window.__nbGenInflight && window.__nbGenInflight[id]));
  const [genErr, setGenErr] = React.useState("");
  const [retrying, setRetrying] = React.useState(false);
  const [slotHasRef, setSlotHasRef] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [layers, setLayers] = React.useState(0);   // count of prior versions (edit layers) you can revert to

  const genUrlRef = React.useRef(genUrl); genUrlRef.current = genUrl;

  const refreshLayers = React.useCallback(async ()=>{
    if(typeof nbGetHistory!=="function"){ return; }
    try{ const h = await nbGetHistory(id); setLayers((h&&h.length)||0); }catch(e){ setLayers(0); }
  },[id]);
  React.useEffect(()=>{ refreshLayers(); },[refreshLayers, genUrl]);

  /* hydrate from IndexedDB / cloud on mount (large sheets live there, not localStorage) */
  React.useEffect(()=>{
    let alive = true;
    if(!genUrl && typeof nbLoadImage==="function"){
      nbLoadImage(id).then(u=>{ if(alive && u){ setGenUrl(u); if(typeof nbGetMeta==="function") setGenMeta(nbGetMeta(id)); setGenTier("idb"); } });
    }
    // a background prefetch may warm this id's url AFTER we mounted empty — adopt it
    const onPrefetched = (e)=>{
      if(!alive || genUrlRef.current || !e.detail || !e.detail.ids || e.detail.ids.indexOf(id)<0) return;
      const u = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
      if(u){ setGenUrl(u); if(typeof nbGetMeta==="function") setGenMeta(nbGetMeta(id)); setGenTier("idb"); }
    };
    window.addEventListener("nb-prefetched", onPrefetched);
    // if a generation for THIS id is in flight (started before this mount, e.g. a tab
    // switch), reflect the spinner; and listen for its completion to adopt the result.
    if(window.__nbGenInflight && window.__nbGenInflight[id]) setGening(true);
    const onDone = (e)=>{
      if(!alive || !e.detail || e.detail.id!==id) return;
      setGening(false); setRetrying(false);
      const u = e.detail.url;
      if(u){ setGenUrl(u); if(typeof nbGetMeta==="function") setGenMeta(nbGetMeta(id)); setGenTier("idb"); }
      else if(typeof nbLoadImage==="function"){ nbLoadImage(id).then(x=>{ if(alive && x){ setGenUrl(x); setGenTier("idb"); } }); }
    };
    window.addEventListener("nb-gen-done", onDone);
    return ()=>{ alive=false; window.removeEventListener("nb-gen-done", onDone); window.removeEventListener("nb-prefetched", onPrefetched); };
  },[id]);

  /* watch the reference-photo slot for drops */
  React.useEffect(()=>{
    const check = ()=>{ const url=typeof nbGetSlotImage==="function"?nbGetSlotImage(slotId):null; setSlotHasRef(!!url); };
    check();
    const el = document.getElementById(slotId);
    if(!el) return;
    const mo = new MutationObserver(check);
    mo.observe(el,{attributes:true,attributeFilter:["data-filled"]});
    return ()=>mo.disconnect();
  },[slotId]);

  const generate = async (gopts)=>{
    gopts = gopts || {};
    if(gening) return;
    if(typeof nbHasKeyForCurrent==="function" && !nbHasKeyForCurrent()){ setGenErr("Set your "+((typeof nbProviderLabel==="function"&&typeof providerOfModel==="function"&&typeof nbGetModel==="function")?nbProviderLabel(providerOfModel(nbGetModel())):"image")+" API key first (top of this tab)."); return; }
    /* Mark this entity busy UP FRONT — before the optional pre-generate gate — and in
       the module-level inflight registry, not just local state. This makes a
       multi-step pre-step (e.g. generating linked props first, which can take a while)
       survive the card unmounting/remounting on an Art Room tab switch: a remounted
       card reads __nbGenInflight and shows the spinner throughout, and adopts the
       result via the "nb-gen-done" event. */
    setGenErr(""); setGening(true); setRetrying(false);
    window.__nbGenInflight[id] = true;
    /* optional pre-generate gate (e.g. warn + optionally generate linked props first).
       Skipped for batch runs, in-place edits, and the simplified retry — those
       shouldn't pop a modal (a batch would pop one per card). */
    if(typeof opts.beforeGenerate==="function" && !(gopts.batch||gopts.editInstruction||gopts.simple)){
      let proceed=true;
      try{ proceed = await opts.beforeGenerate(gopts); }catch(e){ proceed=true; }
      if(proceed===false){ setGening(false); window.__nbGenInflight[id] = false; return; }
    }
    let committedUrl = "";
    const overrideModel = gopts.model || null;
    const usedModel = overrideModel || (typeof nbGetModel==="function" ? nbGetModel() : "");
    /* a model chosen via a fallback button ("Try <model>" / "Switch to <model>"
       after a failed generation) becomes the ACTIVE selection, so the model picker
       highlight, mobile summary, and key bar all reflect the switch. */
    if(overrideModel && typeof nbSetModel==="function"
       && (typeof nbGetModel!=="function" || nbGetModel()!==overrideModel)){
      nbSetModel(overrideModel);
      try{ window.dispatchEvent(new CustomEvent("nb-model-changed")); }catch(_){}
    }
    const isEditMode = !!(gopts.editInstruction && genUrl);
    const useSimple = !!gopts.simple;

    /* reference image: existing sheet (edit) or dropped reference art.
       Cameo (locked likeness) sits at the end of the priority chain — an
       explicit drop or a base sheet still wins, but otherwise the cameo
       face becomes the primary reference so identity stays locked. */
    let refImage = null;
    let mode = "final";
    let cameoUrl = "";
    let cameoAngles = [];
    if(opts.cameoId && typeof nbLoadCameoAngles==="function"){
      try{ cameoAngles = (nbGetCameoAngles&&nbGetCameoAngles(opts.cameoId))||[]; }catch(e){}
      if(!cameoAngles.length){ try{ cameoAngles = await nbLoadCameoAngles(opts.cameoId); }catch(e){} }
      cameoUrl = cameoAngles[0] || "";
    } else if(opts.cameoId && typeof nbGetCameo==="function"){
      cameoUrl = nbGetCameo(opts.cameoId);
      if(!cameoUrl && typeof nbLoadCameo==="function"){ try{ cameoUrl = await nbLoadCameo(opts.cameoId); }catch(e){} }
      cameoAngles = cameoUrl ? [cameoUrl] : [];
    }
    if(isEditMode){ refImage = genUrl; mode = "edit"; }
    else if(useSimple){ mode = "simple"; }
    else if(slotHasRef && typeof nbGetSlotImage==="function"){ refImage = nbGetSlotImage(slotId); mode = "photo"; }
    else if(opts.referenceFallback){ const b = opts.referenceFallback(gopts); if(b){ refImage = b; mode = "base"; } }
    else if(cameoUrl){ refImage = cameoUrl; mode = "cameo"; }

    /* prompt: edit | simplified fallback | from-photo/cameo | from-base | master */
    let genPrompt;
    if(mode==="edit") genPrompt = opts.buildEdit ? opts.buildEdit(gopts.editInstruction) : gopts.editInstruction;
    else if(mode==="simple") genPrompt = opts.buildSimple ? opts.buildSimple() : opts.buildFinal();
    else if(mode==="photo"||mode==="cameo") genPrompt = opts.buildFromPhoto ? opts.buildFromPhoto() : opts.buildFinal();
    else if(mode==="base") genPrompt = opts.buildFromBase ? opts.buildFromBase() : opts.buildFinal();
    else genPrompt = opts.buildFinal();

    /* grounding (Nano Banana 2 only) */
    const groundEnabled = typeof nbGetGroundSearch==="function" && nbGetGroundSearch();
    const isFlash = usedModel === "gemini-3.1-flash-image";
    const genOpts = { metaOut:{} };
    if(overrideModel) genOpts.model = overrideModel;
    if(gopts.aspectRatio) genOpts.aspectRatio = gopts.aspectRatio;   // caller can force aspect…
    if(gopts.imageSize)   genOpts.imageSize   = gopts.imageSize;     // …and resolution (e.g. storyboard: 16:9 / 2K)
    if(gopts.quality)     genOpts.quality     = gopts.quality;       // …and GPT Image 2 quality (low/medium/high — lower = far faster, dodges the proxy timeout)
    if(refImage) genOpts.referenceImage = refImage;
    if(groundEnabled){ genOpts.groundSearch = true; if(isFlash) genOpts.groundImageSearch = true; }

    /* attachments: extra reference images (e.g. generated prop sheets the character
       carries) so the model SEES the object, not just its name. Resolved async. */
    let attachCount = 0;
    let attachList = [];
    if(opts.attachments && mode!=="simple"){
      let attach = [];
      try{ attach = (await opts.attachments(gopts, mode)) || []; }catch(e){ attach = []; }
      attach = attach.filter(a=>a && a.url);
      if(attach.length){
        attachList = attach;
        genOpts.extraImages = attach.map(a=>a.url);
        attachCount = attach.length;
        const notes = attach.map(a=>a.note).filter(Boolean).join(", ");
        if(typeof opts.attachmentsText==="function"){
          const extra = opts.attachmentsText(attach);   // caller supplies the reference sentence
          if(extra) genPrompt += " "+extra;
        } else {
        genPrompt += " The additional reference image"+(attach.length>1?"s":"")+" provided show"
          +(attach.length>1?"":"s")+" item"+(attach.length>1?"s":"")+" this character carries or wears"
          +(notes?(": "+notes):"")+". Render the character WITH "+(attach.length>1?"these exact items":"this exact item")
          +", matching the reference design"+(attach.length>1?"s":"")+" faithfully.";
        }
      }
    }

    /* cameo face-lock: attach EVERY captured angle so the model has the most
       to anchor identity to. For a base sheet driving a state variant the
       angles ride along as extra references (the base sheet alone can drift). */
    let cameoUsed = (mode==="cameo");
    if(mode==="cameo" && cameoAngles.length>1){
      /* primary angle is the reference image; the rest are extra views */
      genOpts.extraImages = (genOpts.extraImages||[]).concat(cameoAngles.slice(1));
      genPrompt += " Additional reference images show the SAME person from other angles \u2014"
        + " use them to keep the face identical across views.";
    }
    if(cameoAngles.length && mode==="base"){
      genOpts.extraImages = (genOpts.extraImages||[]).concat(cameoAngles);
      genPrompt += " The additional reference image"+(cameoAngles.length>1?"s show":" shows")
        + " the character's locked facial likeness (a cameo"+(cameoAngles.length>1?", multiple angles":"")+")."
        + " Keep the FACE, bone structure and skin tone identical to this likeness; only the wardrobe,"
        + " styling or condition should change as described.";
      cameoUsed = true;
    }

    /* collect the reference images actually used, for the details view.
       PRIVACY: the cameo face is biometric + local-only. Never persist its
       image into cloud-stored refs (that would upload it); keep meta.cameo
       so the badge still shows. In local mode it's fine to keep for Details. */
    const isCloud = (typeof nbBackend==="function" && nbBackend()==="cloud");
    const refLabel = mode==="edit" ? "Previous sheet (edited)" : (mode==="photo"||mode==="cameo") ? (mode==="cameo"?"Cameo likeness":"Reference photo")
      : mode==="base" ? "Base sheet" : null;
    const refsUsed = [];
    if(refImage && refLabel && !(mode==="cameo" && isCloud)) refsUsed.push({ kind:mode, label:refLabel, url:refImage });
    attachList.forEach(a=>refsUsed.push({ kind:"prop", label:a.note||"Prop sheet", url:a.url }));
    if(cameoUrl && mode==="base" && !isCloud) refsUsed.push({ kind:"cameo", label:"Cameo likeness", url:cameoUrl });

    try{
      let url;
      try{
        url = await nbGenerate(genPrompt, genOpts);
      }catch(e){
        if(!useSimple && !isEditMode && e.message && /no image/i.test(e.message) && opts.buildSimple){
          setRetrying(true);
          url = await nbGenerate(opts.buildSimple(), genOpts);
        } else { throw e; }
      }
      /* version number from existing history (nbCommit rolls history internally) */
      let priorCount = 0;
      try{
        const histLen = (typeof nbGetHistory==="function") ? (await nbGetHistory(id)).length : 0;
        priorCount = genUrl ? Math.min(histLen+1, 12) : histLen;
      }catch(e){}
      const mEntry = allModels.find(m=>m.id===usedModel) || allModels[0] || {};
      const now = new Date();
      const meta = {
        modelLabel: mEntry.label || "Nano Banana",
        modelId: usedModel,
        aspect: genOpts.aspectRatio || ((typeof nbGetAspect==="function") ? nbGetAspect() : "16:9"),
        size: genOpts.imageSize || ((typeof nbGetRes==="function") ? nbGetRes() : "2K"),
        date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
        time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
        iso: now.toISOString(),
        grounded: !!(groundEnabled && genOpts.metaOut && genOpts.metaOut.grounded),
        groundImages: !!(groundEnabled && isFlash && genOpts.metaOut && genOpts.metaOut.grounded),
        cameo: !!cameoUsed,
        propRefs: attachCount,
        refCount: refsUsed.length,
        prompt: genPrompt,
        mode: mode,
        editInstruction: isEditMode ? (gopts.editInstruction||"") : "",
        version: priorCount + 1
      };
      const assetKind = (typeof slotAssetKind==="function") ? slotAssetKind(slotId) : "character";
      const saveResult = await nbCommit(id, url, meta, refsUsed, assetKind);
      committedUrl = (saveResult && saveResult.url) || url;
      setGenUrl(committedUrl);
      setGenTier((saveResult && saveResult.tier) || "local");
      setGenMeta(meta);
      if(isEditMode){ setEditMode(false); setEditText(""); }
    }catch(e){ setGenErr((e && e.message) || "Generation failed."); }
    setGening(false); setRetrying(false);
    delete window.__nbGenInflight[id];
    // notify any (re)mounted card for this id so it adopts the result even if the
    // card that started the generation has since unmounted (tab switch mid-generate)
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id, url: committedUrl } })); }catch(e){}
  };
  const clearGen = async ()=>{
    if(typeof nbClearAsset==="function") await nbClearAsset(id);
    // cascade: also clear this entity's variant sub-sheets (a character's appearance
    // states, a location's time-of-day plates) so they aren't orphaned. Cameo, linked
    // props, and the written spec are deliberately left intact.
    if(typeof opts.relatedClearIds==="function" && typeof nbClearAsset==="function"){
      let extra=[]; try{ extra=opts.relatedClearIds()||[]; }catch(e){}
      for(const xid of extra){ if(xid && xid!==id){ try{ await nbClearAsset(xid); }catch(e){} } }
    }
    setGenUrl(""); setGenErr(""); setGenTier("local"); setGenMeta(null);
  };
  /* how many variant sub-sheets a Clear would also remove (for the confirm message) */
  const relatedClearCount = (typeof opts.relatedClearIds==="function")
    ? (()=>{ try{ return (opts.relatedClearIds()||[]).length; }catch(e){ return 0; } })() : 0;
  /* details + version control for the info panel */
  const loadDetails = async ()=>{
    if(typeof nbLoadDetailsAsset==="function") return await nbLoadDetailsAsset(id, genUrl);
    return { id, url:genUrl, meta:genMeta, refs:[], history:[] };
  };
  const revertTo = async (index)=>{
    if(typeof nbRevertAsset!=="function") return;
    const r = await nbRevertAsset(id, index);
    if(r){ setGenUrl(r.url); setGenMeta(r.meta||null); }
    refreshLayers();
  };
  /* one-tap "undo last edit": restore the most recent prior version (layer 0) */
  const revertPrevious = async ()=>{ await revertTo(0); };
  /* delete a single version from history */
  const deleteVersion = async (index)=>{
    if(typeof nbDeleteHistoryEntry!=="function") return;
    await nbDeleteHistoryEntry(id, index);
    refreshLayers();
  };

  return { genUrl, genMeta, genTier, gening, genErr, retrying, slotHasRef,
    editMode, setEditMode, editText, setEditText, generate, clearGen, relatedClearCount, loadDetails, revertTo, revertPrevious, deleteVersion, layers, allModels };
}
window.useImageGen = useImageGen;

/* ---- shared BATCH GENERATION engine (Props / Characters / Locations) ----------
   One queue at a time. Setting `activeId` to a card id makes THAT card auto-generate
   (each SheetFrame card watches activeId and fires gen.generate when it's its turn),
   then calls advance() to move to the next. begin() first partitions the ids into
   those that already have a sheet vs. not, and surfaces a choice (generate missing /
   regenerate all) when some already exist. Drives both the per-scene batch and the
   tab-wide "Generate all". */
function useBatchGen(){
  const [queue, setQueue] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [total, setTotal] = React.useState(0);
  const [msg, setMsg] = React.useState("");
  const [prompt, setPrompt] = React.useState(null);   // {missing:[ids], existing:[ids]}
  const advance = React.useCallback((doneId)=>{
    setQueue(q=>{
      const rest = q.filter(id=>id!==doneId);
      if(rest.length){ setActiveId(rest[0]); setMsg("Generating "+(total-rest.length+1)+" of "+total+"\u2026"); }
      else { setActiveId(null); setMsg(""); setTotal(0); }
      return rest;
    });
  },[total]);
  const run = (ids, skipped)=>{
    if(!ids.length) return;
    setPrompt(null);
    setTotal(ids.length); setQueue(ids); setActiveId(ids[0]);
    setMsg("Generating 1 of "+ids.length+(skipped?(" \u00b7 skipped "+skipped+" already done"):"")+"\u2026");
  };
  const begin = async (ids, undraftedSkipped)=>{
    if(activeId) return;
    if(typeof nbHasKeyForCurrent==="function" && !nbHasKeyForCurrent()){ setMsg("Set your image-model API key first (top of this tab)."); return; }
    if(!ids.length){ setMsg(undraftedSkipped ? "Draft the cards first \u2014 nothing is ready to generate yet." : "Nothing to generate yet."); return; }
    setPrompt(null);
    setMsg("Checking which already have a sheet\u2026");
    const missing=[], existing=[];
    for(const id of ids){
      let has = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
      if(!has && typeof nbLoadImage==="function"){ try{ has = await nbLoadImage(id); }catch(e){} }
      (has?existing:missing).push(id);
    }
    if(!existing.length){ setMsg(""); run(missing, 0); return; }
    if(!missing.length){ setMsg(""); setPrompt({ missing:[], existing:ids }); return; }
    setMsg(""); setPrompt({ missing, existing });
  };
  const cancel = ()=>{ setQueue([]); setActiveId(null); setTotal(0); setMsg("Cancelled."); setPrompt(null); };
  return { activeId, msg, prompt, setPrompt, setMsg, advance, run, begin, cancel, total };
}
window.useBatchGen = useBatchGen;

/* ---- shared 9-up PAGINATION for the sheet grids (Props / Characters / Locations).
   `suspend` (e.g. while a batch is running) shows EVERYTHING — the batch queue
   advances by watching mounted cards, so paging mustn't unmount its targets. */
const SHEETS_PER_PAGE = 9;
function usePager(total, suspend){
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(total/SHEETS_PER_PAGE));
  React.useEffect(()=>{ if(page > pages-1) setPage(Math.max(0, pages-1)); },[pages, page]);
  const slice = (arr)=> (suspend || total<=SHEETS_PER_PAGE) ? arr
    : arr.slice(page*SHEETS_PER_PAGE, (page+1)*SHEETS_PER_PAGE);
  return { page, setPage, pages, slice, active: !suspend && total>SHEETS_PER_PAGE, total };
}
function PagerBar({ pager, noun }){
  if(!pager || !pager.active) return null;
  const { page, setPage, pages, total } = pager;
  const go = (p)=> setPage(Math.max(0, Math.min(pages-1, p)));
  const nums = [];
  for(let i=0;i<pages;i++) nums.push(i);
  return React.createElement("div",{className:"pager"},
    React.createElement("button",{className:"pager-btn",disabled:page===0,onClick:()=>go(page-1),"aria-label":"Previous page"},
      React.createElement(Icon.chevL,{s:13})),
    pages<=9
      ? nums.map(i=>React.createElement("button",{key:i,className:"pager-num"+(i===page?" on":""),onClick:()=>go(i)}, i+1))
      : React.createElement("span",{className:"pager-count"},(page+1)+" / "+pages),
    React.createElement("button",{className:"pager-btn",disabled:page===pages-1,onClick:()=>go(page+1),"aria-label":"Next page"},
      React.createElement(Icon.chevR,{s:13})),
    React.createElement("span",{className:"pager-note"}, total+" "+(noun||"card")+(total!==1?"s":"")));
}
window.usePager = usePager; window.PagerBar = PagerBar;

/* shared batch status / choice strip — render just under a tab's toolbar. `noun`
   is the singular card noun ("prop" / "character" / "location"). */
function BatchBar({ batch, noun }){
  const { activeId, msg, prompt, run, cancel, setPrompt, setMsg } = batch;
  // the bar lives at the TOP of the tab, but its triggers (e.g. a card's generate
  // button) can sit far down the page — scroll the bar into view when it has a
  // question or status, or the click looks like it did nothing.
  const barRef = React.useRef(null);
  React.useEffect(()=>{
    if((prompt || msg) && barRef.current && barRef.current.scrollIntoView)
      barRef.current.scrollIntoView({ block:"nearest", behavior:"smooth" });
  },[!!prompt, msg]);
  if(!activeId && !prompt && !msg) return null;
  const N = noun || "card";
  return React.createElement("div",{className:"art-batchbar",ref:barRef},
    prompt && React.createElement("div",{className:"batch-choice"},
      React.createElement("span",{className:"batch-choice-q"},
        prompt.missing.length>0
          ? (prompt.existing.length+" of these "+N+"s already have a sheet. What would you like to do?")
          : ("All "+prompt.existing.length+" "+N+"s already have a sheet. Regenerate them?")),
      prompt.missing.length>0 && React.createElement("button",{className:"art-draftall",
        onClick:()=>run(prompt.missing, prompt.existing.length),
        title:"Generate only the "+N+"s that don't have a sheet yet"},
        React.createElement(Icon.sparkles,{s:13}),"Generate "+prompt.missing.length+" missing"),
      React.createElement("button",{className:"art-draftall"+(prompt.missing.length?" ghost":""),
        onClick:()=>run([...prompt.missing, ...prompt.existing], 0),
        title:"Generate every "+N+", regenerating ones that already have a sheet"},
        React.createElement(Icon.sparkles,{s:13}),"Regenerate all "+(prompt.missing.length+prompt.existing.length)),
      React.createElement("button",{className:"art-draftall ghost",onClick:()=>{ setPrompt(null); setMsg(""); }},"Cancel")),
    activeId && React.createElement("button",{className:"art-draftall ghost",onClick:cancel},"Cancel"),
    msg && React.createElement("span",{className:"prop-scenebar-msg"},msg));
}
window.BatchBar = BatchBar;

/* SheetDetails — a modal exposing everything about a generated sheet: id, model,
   resolution, aspect, timestamp, grounding, the exact prompt sent, the reference
   images used, and the full version history (preview + restore any prior version). */
function SheetDetails({ gen, name, noun, onClose, onView, extraMeta }){
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(null);
  const [preview, setPreview] = React.useState(null);   // hero zoom overlay (full-screen)
  const [selVer, setSelVer] = React.useState(null);     // {url, meta} of a history version being inspected IN PLACE (null = current)
  const scrollRef = React.useRef(null);                 // dt-scroll container
  const promptRef = React.useRef(null);                 // the "Prompt sent to the model" section
  const reload = React.useCallback(async ()=>{ const d = await gen.loadDetails(); setData(d); },[gen]);
  React.useEffect(()=>{ reload(); setSelVer(null); },[reload, gen.genUrl]);

  const curMeta = (data && data.meta) || gen.genMeta || {};
  // when inspecting an earlier version, the whole form (hero, metadata, prompt) reflects IT
  const meta = selVer ? (selVer.meta || {}) : curMeta;
  const heroUrl = selVer ? selVer.url : gen.genUrl;
  const refs = (data && data.refs) || [];
  const history = (data && data.history) || [];
  /* Reference-image resolution tied to the ANCHORED version (selected or current).
     For an EDIT, the reference IS the prior sheet — which exists in the version
     chain with a working URL — so we resolve it there instead of the (often
     broken / unsigned) stored ref blob. For an original/photo generation we fall
     back to the stored refs (current only; history entries don't carry refs). */
  const versions = [{ url: gen.genUrl, meta: curMeta }].concat(
    history.map(h=>({ url: h.url, meta: h.meta||{} })));
  const anchorPos = selVer ? (selVer.idx + 1) : 0;
  const anchorMeta = (versions[anchorPos] || versions[0] || {}).meta || {};
  let displayRefs = [];
  if(anchorMeta.mode === "edit"){
    const src = versions[anchorPos + 1];
    if(src && src.url){
      const sv = (src.meta && src.meta.version) || (versions.length - anchorPos - 1);
      displayRefs = [{ url: src.url, label: "Edited from v"+sv+" sheet" }];
    }
  } else if(!selVer){
    displayRefs = refs.map(r=>({ url:r.url, label:r.label }));
  }
  /* clipboard copy with a fallback for sandboxed iframes where the async
     Clipboard API is blocked (same fix as CopyBox). key tracks which button copied. */
  const copyText = async (text, key)=>{
    let ok=false;
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text||""); ok=true; } }catch(e){ ok=false; }
    if(!ok){
      try{
        const ta=document.createElement("textarea"); ta.value=text||""; ta.setAttribute("readonly","");
        ta.style.cssText="position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0,(text||"").length);
        ok=document.execCommand("copy"); document.body.removeChild(ta);
      }catch(e){ ok=false; }
    }
    setCopiedKey(key); setTimeout(()=>setCopiedKey(null),1400);
  };
  const restore = async (i)=>{ setBusy(true); try{ await gen.revertTo(i); await reload(); }catch(e){} setBusy(false); };
  const delVersion = async (i)=>{ setBusy(true); try{ await gen.deleteVersion(i); await reload(); }catch(e){} setBusy(false); };
  /* select a history version IN PLACE — clicking a row shows that version's image
     and ALL its properties (model, resolution, aspect, generated, version, image
     id, prompt, reference images). Click again on the banner's "Back to current". */
  const selectVersion = (h, i)=>{ setSelVer({ url:h.url, meta:h.meta||{}, idx:i, mode:"preview" }); };

  const field = (label,val)=> val ? React.createElement("div",{className:"dt-field"},
    React.createElement("div",{className:"dt-flab"},label),
    React.createElement("div",{className:"dt-fval"},val)) : null;

  return React.createElement("div",{className:"lb-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"dt-panel"},
      React.createElement("div",{className:"dt-head"},
        React.createElement("div",null,
          React.createElement("div",{className:"dt-title"},name),
          React.createElement("div",{className:"dt-sub"},"Image details")),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),
      React.createElement("div",{className:"dt-scroll",ref:scrollRef},
        /* image preview — current OR the earlier version being inspected. If the
           file is gone from storage (dangling path → empty/failed URL), fall back
           to a placeholder instead of a broken image. */
        heroUrl && React.createElement("img",{className:"dt-hero",src:heroUrl,alt:name,
          onClick:()=>setPreview(heroUrl),
          onError:(e)=>{ e.target.style.display="none"; const ph=document.querySelector(".dt-scroll .dt-hero-missing"); if(ph) ph.style.display="flex"; }}),
        React.createElement("div",{className:"dt-hero-missing",style:{display:heroUrl?"none":"flex"}},
          React.createElement(Icon.image,{s:20}),
          React.createElement("span",null,selVer?"This version's image is no longer available in storage.":"Image unavailable.")),
        /* banner shown while inspecting an earlier version in place */
        selVer && React.createElement("div",{className:"dt-viewing"},
          React.createElement(Icon.history,{s:13}),
          React.createElement("span",{className:"dt-viewing-t"},"Viewing an earlier version"
            +(meta.version?(" \u00b7 v"+meta.version):"")+" \u2014 not the current image"),
          React.createElement("button",{className:"dt-viewing-back",onClick:()=>setSelVer(null)},"Back to current")),
        /* metadata grid */
        React.createElement("div",{className:"dt-grid"},
          field("Model", meta.modelId || meta.modelLabel || null),
          field("Resolution", meta.size),
          field("Aspect ratio", meta.aspect),
          field("Generated", (meta.date||"")+(meta.time?(" \u00b7 "+meta.time):"")),
          ...((extraMeta||[]).filter(m=>m&&m.v).map((m,i)=>React.createElement("div",{key:"em"+i,className:"dt-field"},
            React.createElement("div",{className:"dt-flab"},m.k),
            React.createElement("div",{className:"dt-fval"},m.v)))),
          field("Version", meta.version ? ("v"+meta.version) : null),
          field("Grounding", meta.grounded ? (meta.groundImages?"Google Search (web + images)":"Google Search") : null),
          field("Prop references", meta.propRefs ? (meta.propRefs+" prop sheet"+(meta.propRefs>1?"s":"")) : null),
          field("Image ID", data && data.id)),
        /* prompt */
        meta.prompt && React.createElement("div",{className:"dt-section",ref:promptRef},
          React.createElement("div",{className:"dt-sec-head"},
            React.createElement("span",{className:"dt-sec-lab"},selVer?"Prompt sent to the model \u00b7 viewing earlier version":"Prompt sent to the model"),
            React.createElement("button",{className:"dt-copy",onClick:()=>copyText(meta.prompt||"","main")},
              React.createElement(Icon[copiedKey==="main"?"check":"copy"],{s:12}), copiedKey==="main"?"Copied":"Copy")),
          React.createElement("div",{className:"dt-prompt"},meta.prompt)),
        /* reference images used */
        (displayRefs.length>0 || selVer) && React.createElement("div",{className:"dt-section"},
          React.createElement("div",{className:"dt-sec-lab"},"Reference images used"+(displayRefs.length?(" ("+displayRefs.length+")"):"")),
          displayRefs.length>0
            ? React.createElement("div",{className:"dt-thumbs"},
                displayRefs.map((r,i)=>React.createElement("div",{key:i,className:"dt-thumb",onClick:()=>r.url&&setPreview(r.url)},
                  r.url ? React.createElement("img",{src:r.url,alt:r.label,
                    onError:(e)=>{ e.target.style.display="none"; const ph=e.target.parentNode.querySelector(".dt-thumb-ph"); if(ph) ph.style.display="grid"; }}) : null,
                  React.createElement("div",{className:"dt-thumb-ph",style:{display:r.url?"none":"grid"}},
                    React.createElement(Icon.image,{s:18})),
                  React.createElement("span",{className:"dt-thumb-lab"},r.label))))
            : React.createElement("div",{className:"dt-noref"},"No reference images for this version \u2014 generated from the prompt alone.")),
        /* version history — each prior version is an edit "layer" you can preview or restore */
        history.length>0 && React.createElement("div",{className:"dt-section"},
          React.createElement("div",{className:"dt-sec-lab"},
            React.createElement(Icon.history,{s:12}),"Earlier versions ("+history.length+")"),
          React.createElement("div",{className:"dt-hist"},
            history.map((h,i)=>{
              const hm = h.meta||{};
              const isEdit = hm.mode==="edit";
              const layerLabel = isEdit
                ? ("Edit: "+(hm.editInstruction||"adjustment"))
                : (hm.mode==="photo" ? "From reference photo" : hm.mode==="cameo" ? "From cameo likeness" : "Original generation");
              const modelName = hm.modelId || hm.modelLabel || "unknown model";
              const active = selVer && selVer.idx===i;
              return React.createElement("div",{key:i,className:"dt-hist-item"+(active?" active":"")},
                React.createElement("div",{className:"dt-hist-row"},
                  /* the whole row (thumb + info) is the click target: select this
                     version to view its image + all its properties in place. */
                  React.createElement("button",{className:"dt-hist-main",type:"button",
                    onClick:()=>selectVersion(h,i),title:active?"Viewing this version":"View this version"},
                    React.createElement("div",{className:"dt-hist-thumb-wrap"},
                      h.url ? React.createElement("img",{className:"dt-hist-thumb",src:h.url,alt:"version",
                        onError:(e)=>{ e.target.style.display="none"; const ph=e.target.parentNode.querySelector(".dt-hist-thumb-ph"); if(ph) ph.style.display="grid"; }}) : null,
                      React.createElement("div",{className:"dt-hist-thumb-ph",style:{display:h.url?"none":"grid"},
                        title:"Image no longer in storage"},React.createElement(Icon.image,{s:15}))),
                    React.createElement("div",{className:"dt-hist-info"},
                      React.createElement("div",{className:"dt-hist-layer"+(isEdit?" edit":" base")},
                        React.createElement(Icon[isEdit?"wand":"image"]||Icon.sparkles,{s:11}),
                        React.createElement("span",{className:"dt-hist-layer-t"},layerLabel)),
                      React.createElement("div",{className:"dt-hist-meta"},
                        modelName,
                        (hm.date)?(" \u00b7 "+hm.date):"",
                        (hm.time)?(" "+hm.time):""))),
                  React.createElement("div",{className:"dt-hist-acts"},
                    React.createElement("button",{className:"dt-hist-btn restore",disabled:busy,onClick:()=>restore(i)},"Restore"),
                    React.createElement("button",{className:"dt-hist-btn del",disabled:busy,title:"Delete this version",
                      onClick:()=>delVersion(i)},React.createElement(Icon.trash,{s:12})))));
            })))) ),
    preview && React.createElement("div",{className:"dt-preview",onMouseDown:(e)=>{ if(e.target===e.currentTarget) setPreview(null); }},
      React.createElement("img",{className:"dt-preview-img",src:preview,alt:"version preview"}),
      React.createElement("button",{className:"dt-preview-x",title:"Close preview",onClick:()=>setPreview(null)},React.createElement(Icon.x,{s:18}))));
}

/* SheetFrame — the visual half of any reference-sheet card: generated image (with
   options menu + inline AI edit), or the reference-photo drop slot, then the
   Generate button, error recovery, and the metadata caption. Driven by useImageGen. */
function SheetFrame({ gen, slotId, name, avatarColor, initials, drafted, drafting, onDraft, entity, onView, slotPlaceholder, noun, onDelete, deleteLabel, specGate, extraMeta, menuExtra }){
  const { genUrl, genMeta, genTier, gening, genErr, retrying, slotHasRef,
    editMode, setEditMode, editText, setEditText, generate, clearGen, relatedClearCount, revertPrevious, layers, allModels } = gen;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  const [pendingGenerate, setPendingGenerate] = React.useState(false);
  const sawDraftingRef = React.useRef(false);
  noun = noun || "sheet";

  React.useEffect(()=>{
    if(!menuOpen) return;
    const handler = e=>{ if(menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return ()=>document.removeEventListener("mousedown", handler);
  },[menuOpen]);

  /* draft-then-generate: when generating an undrafted card, run Draft first then auto-generate */
  React.useEffect(()=>{
    if(!pendingGenerate) return;
    if(drafting){ sawDraftingRef.current = true; return; }
    if(sawDraftingRef.current){ sawDraftingRef.current = false; setPendingGenerate(false); generate(); }
  },[pendingGenerate, drafting]);

  const handleGenerateClick = ()=>{
    if(gening) return;
    if(specGate && !specGate.ready && !genUrl && !slotHasRef) return; // gated: draft the spec first
    if(!drafted && !genUrl && !slotHasRef){ setPendingGenerate(true); onDraft(); return; }
    generate();
  };
  // spec-first gate (opt-in via specGate; Props/Characters pass nothing → ungated):
  // block plate generation until the written design spec exists, so it's reviewed first
  const specBlocked = !!(specGate && !specGate.ready && !genUrl && !slotHasRef);

  return React.createElement("div",{className:"sheet-frame"},
    genUrl
      ? React.createElement("div",{className:"sheet-genwrap"},
          React.createElement("img",{className:"sheet-genimg",src:genUrl,alt:name+" "+noun,
            decoding:"async",loading:"lazy",
            onClick:()=>onView&&onView(genUrl, entity)}))
      : React.createElement(React.Fragment,null,
          React.createElement("image-slot",{id:slotId,className:"sheet-slot",
            shape:"rounded",radius:"10",placeholder:slotPlaceholder||"Drop reference art"}),
          slotHasRef && React.createElement("div",{className:"sheet-ref-pill"},
            React.createElement(Icon.bolt,{s:10,sw:2}),"Reference art active \u00b7 guides generation")),
    (genUrl || onDelete) && React.createElement("div",{className:"sheet-gen-tools"},
      React.createElement("div",{className:"sheet-tools-menu",ref:menuRef},
        React.createElement("button",{className:"sheet-gen-tool",onClick:()=>setMenuOpen(m=>!m),title:"Options"},
          React.createElement(Icon.moreV,{s:14})),
        menuOpen && React.createElement("div",{className:"sheet-tools-dropdown"},
          genUrl && React.createElement("button",{className:"sheet-tools-item",onClick:()=>{ onView&&onView(genUrl,entity); setMenuOpen(false); }},
            React.createElement(Icon.eye,{s:13}),"View full"),
          genUrl && React.createElement("button",{className:"sheet-tools-item",onClick:()=>{ setDetailsOpen(true); setMenuOpen(false); }},
            React.createElement(Icon.info,{s:13}),"Details"),
          genUrl && React.createElement("button",{className:"sheet-tools-item "+(editMode?"on":""),
            onClick:()=>{ setEditMode(m=>!m); setEditText(""); setMenuOpen(false); }},
            React.createElement(Icon.wand,{s:13}),editMode?"Close edit":"Edit "+noun),
          genUrl && React.createElement("button",{className:"sheet-tools-item",disabled:gening,
            onClick:()=>{ generate(); setMenuOpen(false); }},
            React.createElement(Icon.sparkles,{s:13}),"Regenerate"),
          // caller-specific menu items (e.g. Shots: "Generate fresh sample")
          ...(menuExtra||[]).filter(Boolean).map((m,i)=>
            React.createElement("button",{key:"mx"+i,className:"sheet-tools-item",disabled:gening||m.disabled,title:m.title,
              onClick:()=>{ setMenuOpen(false); m.onClick&&m.onClick(); }},
              React.createElement(m.icon||Icon.sparkles,{s:13}), m.label)),
          genUrl && React.createElement("div",{className:"sheet-tools-divider"}),
          genUrl && React.createElement("button",{className:"sheet-tools-item danger",onClick:async ()=>{
              setMenuOpen(false);
              const vN = relatedClearCount||0;
              const extra = vN>0 ? (", plus "+vN+" variant sheet"+(vN>1?"s":"")+",") : "";
              const ok = await window.appConfirm({
                title: "Clear "+(name||"this")+"’s "+(noun||"sheet")+"?",
                body: "This permanently deletes the generated image and ALL earlier versions"+extra+" from cloud storage. The "+(noun||"sheet")+" can be regenerated — the written spec is kept.",
                note: vN>0 ? "Your cameo and linked props are kept. This can’t be undone."
                           : "This can’t be undone.",
                confirmLabel: "Clear", cancelLabel: "Cancel", danger: true,
              });
              if(ok) clearGen();
            }},
            React.createElement(Icon.x,{s:13}),"Clear"),
          onDelete && React.createElement("button",{className:"sheet-tools-item danger",onClick:()=>{ setMenuOpen(false); onDelete(); }},
            React.createElement(Icon.trash,{s:13}),deleteLabel||"Delete")))),
    editMode && React.createElement("div",{className:"sheet-edit-panel"},
      React.createElement("input",{className:"sheet-edit-input",type:"text",autoFocus:true,
        placeholder:"Describe changes\u2026  e.g. "+(noun==="prop sheet"?"make the metal brushed steel":"change jacket to black, add glasses"),
        value:editText,onChange:e=>setEditText(e.target.value),
        onKeyDown:e=>{ if(e.key==="Enter"&&editText.trim()) generate({editInstruction:editText.trim()});
                       if(e.key==="Escape"){ setEditMode(false); setEditText(""); } }}),
      React.createElement("div",{className:"sheet-edit-acts"},
        React.createElement("button",{className:"sheet-edit-apply",
          onClick:()=>generate({editInstruction:editText.trim()}),disabled:!editText.trim()||gening},
          React.createElement(Icon.wand,{s:12}),"Apply edit"),
        layers>0 && React.createElement("button",{className:"sheet-edit-undo",disabled:gening,
          title:"Restore the version before your last edit",onClick:()=>revertPrevious&&revertPrevious()},
          React.createElement(Icon.undo,{s:12}),"Undo last edit"),
        React.createElement("button",{className:"sheet-edit-cancel",
          onClick:()=>{ setEditMode(false); setEditText(""); }},"Cancel")),
      layers>0 && React.createElement("div",{className:"sheet-edit-layers"},
        React.createElement(Icon.history,{s:10}),
        layers+" earlier version"+(layers!==1?"s":"")+" \u00b7 see all in the \u2026 menu \u203a Details")),
    React.createElement("button",{className:"sheet-gen-btn",onClick:handleGenerateClick,disabled:gening||(drafting&&pendingGenerate)||specBlocked,
      title:(!drafted && !genUrl && !slotHasRef)
        ? "Fills the text spec from the script first, then generates the sheet in one step"
        : (genUrl ? "Generate a fresh sheet from the current spec" : "Generate the sheet from the current spec")},
      (gening || (drafting && pendingGenerate))
        ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),
            pendingGenerate ? "Drafting\u2026" :
            retrying ? "Retrying simplified\u2026" : "Generating\u2026")
        : React.createElement(React.Fragment,null,React.createElement(Icon.sparkles,{s:13}),
            specBlocked ? "Draft the spec first" :
            genUrl ? ("Regenerate "+noun) :
            (slotHasRef ? "Generate from photo" :
            (!drafted ? "Draft & Generate" : ("Generate "+noun))))),
    specBlocked && React.createElement("div",{className:"sheet-gen-gate"},
      React.createElement(Icon.alert,{s:12}),
      React.createElement("span",null,(specGate&&specGate.hint)||"Draft the design spec first — it's what the plate is built from.")),
    genErr && (()=>{
      const keyGate = /API key/i.test(genErr||"");
      // CORS / browser-unreachable (GPT Image): the ONLY real fix is switching
      // to the in-browser model, so make that the primary action and drop the
      // useless "simplified prompt" retry.
      const browserGate = /can't be generated directly in the browser|cross-origin/i.test(genErr||"");
      const cur = (typeof nbGetModel==="function") ? nbGetModel() : "";
      const other = allModels.find(m=>m.id!==cur);
      return React.createElement("div",{className:"sheet-gen-err"},
      React.createElement("div",{className:"sheet-gen-err-msg"},genErr),
      React.createElement("div",{className:"sheet-gen-err-acts"},
        /* missing/rejected key: jump straight to the key bar (it's at the top of
           the tab — on mobile that's a long scroll up, so do it for them) and
           focus the input. The simplified-prompt retry can't help without a key. */
        keyGate
          ? React.createElement("button",{className:"sheet-gen-err-btn primary",onClick:(e)=>{
              const sc = (e.target.closest && e.target.closest(".art-scroll")) || document.querySelector(".art-scroll");
              if(sc) sc.scrollTop = 0;
              const inp = document.querySelector(".nb-keybar .nb-key-input");
              if(inp){ try{ inp.focus({preventScroll:true}); }catch(_){ inp.focus(); } }
            }},"Set API key")
          : (browserGate
              ? (other && React.createElement("button",{className:"sheet-gen-err-btn primary",onClick:()=>generate({model:other.id})},"Switch to "+other.label))
              : React.createElement("button",{className:"sheet-gen-err-btn",onClick:()=>generate({simple:true})},"Try simplified prompt")),
        !browserGate && other && React.createElement("button",{className:"sheet-gen-err-btn",onClick:()=>generate({model:other.id})},"Try "+other.label))); })(),
    React.createElement("div",{className:"sheet-frame-cap"},
      slotHasRef && React.createElement("span",{className:"sheet-ref-chip"},
        React.createElement(Icon.bolt,{s:9,sw:2.2}),"Ref"),
      (genTier==="session"||genTier==="memory") && React.createElement("span",{
        className:"sheet-tier-warn",
        title:"Image is too large to save permanently — download it before closing or refreshing this tab"},
        React.createElement(Icon.warn,{s:10,sw:2}),"Session only \u00b7 download to keep"),
      genUrl && genMeta && genMeta.grounded && React.createElement("span",{
        className:"sheet-ground-chip",
        title:genMeta.groundImages ? "Generated with Google Search grounding (web + images)" : "Generated with Google Search grounding"},
        React.createElement(Icon.globe,{s:9,sw:2}),"Grounded"),
      genUrl && genMeta && genMeta.cameo && React.createElement("span",{
        className:"sheet-cameo-chip",
        title:"Face-locked to a cameo likeness"},
        React.createElement(Icon.userScan,{s:9,sw:1.8}),"Cameo"),
      genUrl && genMeta
        ? React.createElement("span",{className:"sheet-frame-meta"},
            React.createElement("span",{className:"sheet-meta-item",title:"Model: "+((genMeta.modelLabel||"")+(genMeta.modelId?(" ("+genMeta.modelId+")"):""))},
              React.createElement(Icon.sparkles,{s:10,sw:1.8}),
              /* show the commercial name (e.g. "GPT Image 2"), not the raw model id.
                 prefer the stored label, else look it up by id, else fall back to id. */
              genMeta.modelLabel || ((window.NB_MODELS||[]).find(m=>m.id===genMeta.modelId)||{}).label || genMeta.modelId),
            React.createElement("span",{className:"sheet-meta-item",title:"Aspect ratio"},
              React.createElement(Icon.image,{s:10,sw:1.8}),genMeta.aspect),
            React.createElement("span",{className:"sheet-meta-item",title:"Resolution"},
              React.createElement(Icon.monitor,{s:10,sw:1.8}),genMeta.size),
            React.createElement("span",{className:"sheet-meta-item",title:"Generated"},
              React.createElement(Icon.clock,{s:10,sw:1.8}),genMeta.date))
        : React.createElement("span",{className:"sheet-frame-cap-label"},genUrl?"Generated":"Reference frame")),
    /* Portal to <body>: the card has content-visibility:auto (paint/layout
       containment), which would otherwise make this card the containing block for
       the modal's position:fixed — trapping the overlay inside the card instead of
       covering the viewport (broken/clipped on small screens). */
    detailsOpen && ReactDOM.createPortal(React.createElement(SheetDetails,{ gen, name, noun, extraMeta,
      onClose:()=>setDetailsOpen(false), onView:(url)=>onView&&onView(url, entity) }), document.body));
}
window.SheetFrame = SheetFrame;
window.SheetDetails = SheetDetails;

/* ---- continuity surfacing: which appearance version of each character applies in a
   given scene. A state applies from its pinned scene onward (story order) until a
   later state supersedes it; before any pinned state a character is at base (v1). ---- */
function activeStateForScene(character, scene, scenes){
  const states = character.states || [];
  if(!states.length || !scene) return { version:1, state:null };
  const idxOf = (id)=> scenes.findIndex(s=>s.id===id);
  const sceneIdx = idxOf(scene.id);
  if(sceneIdx<0) return { version:1, state:null };
  let best=null, bestPos=-1, bestVersion=1;
  states.forEach((st,i)=>{
    if(!st.sceneId) return;
    const pos = idxOf(st.sceneId);
    if(pos>=0 && pos<=sceneIdx && pos>=bestPos){ best=st; bestPos=pos; bestVersion=i+2; }
  });
  return { version:bestVersion, state:best };
}
window.activeStateForScene = activeStateForScene;

/* SceneContinuity — a compact per-scene panel: the appearance version of every character
   that has states, with a flag when the applicable state has no generated sheet yet. */
function SceneContinuity({ scene, scenes, characters }){
  const tracked = (characters||[]).filter(c=>(c.states||[]).length);
  const [sheets, setSheets] = React.useState({});   // stateGlobalId -> bool
  React.useEffect(()=>{
    let alive = true;
    const probe = async ()=>{
      const out = {};
      for(const c of tracked){
        const { state } = activeStateForScene(c, scene, scenes);
        if(state){
          const gid = c.id+":"+state.id;
          let has = (typeof nbGetImage==="function" && !!nbGetImage(gid));
          if(!has && typeof nbLoadImage==="function"){ try{ has = !!(await nbLoadImage(gid)); }catch(e){} }
          out[gid] = has;
        }
      }
      if(alive) setSheets(out);
    };
    probe();
    return ()=>{ alive=false; };
  },[scene && scene.id, tracked.map(c=>c.id+":"+(c.states||[]).map(s=>s.id+s.sceneId).join()).join("|")]);

  if(!tracked.length) return null;
  return React.createElement("div",{className:"insp-block"},
    React.createElement("div",{className:"insp-block-head"},
      React.createElement("span",{className:"eyebrow"},React.createElement(Icon.user,{s:12}),"Continuity \u00b7 appearance")),
    React.createElement("div",{className:"cont-list"},
      tracked.map(c=>{
        const { version, state } = activeStateForScene(c, scene, scenes);
        const gid = state ? (c.id+":"+state.id) : null;
        const missing = state && sheets[gid]===false;
        return React.createElement("div",{key:c.id,className:"cont-row"},
          React.createElement("span",{className:"cont-av",style:{background:c.color}},
            c.name.split(" ").map(w=>w[0]).slice(0,2).join("")),
          React.createElement("div",{className:"cont-info"},
            React.createElement("div",{className:"cont-name"},c.name),
            React.createElement("div",{className:"cont-state"},
              state ? state.label : "Base look")),
          React.createElement("span",{className:"cont-vtag"+(state?"":" base")},"v"+version),
          missing && React.createElement("span",{className:"cont-warn",title:"This appearance state has no generated sheet yet"},
            React.createElement(Icon.warn,{s:11,sw:2})));
      })));
}
window.SceneContinuity = SceneContinuity;

function CopyBox({ label, text }){
  const [copied, setCopied] = React.useState(false);
  const copy = async ()=>{
    let ok = false;
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text); ok = true;
      }
    }catch(e){ ok = false; }
    if(!ok){
      // fallback for sandboxed iframes / non-secure contexts where the async
      // Clipboard API is blocked: select a hidden textarea and execCommand('copy')
      try{
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly","");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      }catch(e){ ok = false; }
    }
    setCopied(true); setTimeout(()=>setCopied(false), 1400);
  };
  return React.createElement("div",{className:"copybox"},
    React.createElement("div",{className:"copybox-head"},
      React.createElement("span",{className:"copybox-lab"},label),
      React.createElement("button",{className:"copybox-btn",onClick:copy},
        React.createElement(Icon[copied?"check":"copy"]||Icon.check,{s:12}), copied?"Copied":"Copy")),
    React.createElement("div",{className:"copybox-text"},text));
}

/* drop a dangling, mid-word fragment left by an older hard-truncation (e.g.
   "...broken things. N") back to the last complete sentence. Display-only and
   safe: text that already ends cleanly is returned unchanged. */
function tidyTruncated(s){
  s = String(s||"").trim();
  if(!s || /[.!?\u2026"')\]]$/.test(s)) return s;   // already ends cleanly
  const m = s.match(/^[\s\S]*[.!?\u2026]/);          // cut back to the last sentence end
  return m ? m[0].trim() : s;
}

function SheetField({ label, value, placeholder, multiline, list, onCommit, onItemRemoved, ownerName }){
  return React.createElement("div",{className:"sheet-field"},
    React.createElement("div",{className:"obj-lab"},label),
    list
      ? React.createElement(EditableItemList,{value,placeholder,onCommit,onItemRemoved,ownerName})
      : React.createElement(EditText,{value,placeholder,multiline,onCommit}));
}

function PaletteRow({ palette }){
  return React.createElement("div",{className:"pal-row"},
    palette.map((p,i)=>React.createElement("div",{key:i,className:"pal-chip",title:p.name+" "+p.hex},
      React.createElement("span",{className:"pal-sw",style:{background:p.hex}}),
      React.createElement("span",{className:"pal-name"},p.name))));
}

function CardFold({ label, count, defaultOpen, children }){
  const [open, setOpen] = React.useState(!!defaultOpen);
  return React.createElement("div",{className:"sheet-fold "+(open?"open":"")},
    React.createElement("button",{className:"sheet-fold-head",onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"sheet-fold-ic"},React.createElement(open?Icon.chevD:Icon.chevR,{s:12})),
      React.createElement("span",{className:"sheet-sec",style:{margin:0,border:0,padding:0}},label),
      count!=null && React.createElement("span",{className:"sheet-fold-count"},count)),
    open && React.createElement("div",{className:"sheet-fold-body"},children));
}

/* StateRow — one appearance state (continuity variant) as its own v2+ sheet, generated
   as an identity-locked edit of the base character sheet so the variant is provably the
   same character. Falls back to a text spec when no base image exists yet. */
function StateRow({ c, st, index, project, scenes, baseGenUrl, onView, onChange, onDelete }){
  const vtag = "v"+(index+2);
  const stateId = c.id+":"+st.id;
  const baseFinal = (typeof combinedImagePrompt==="function") ? combinedImagePrompt(c, project) : buildCharRefPrompt(c, project);
  const changeText = ()=> (st.change||"").replace(/\.$/,"").trim();

  const buildFromBase = ()=>
    "Edit this character design sheet for "+(c.name||"the character")+". "
    +"Apply this appearance change: "+(changeText()||"(no specific change given)")+". "
    +"Keep the EXACT same face, hair colour and style, skin tone, body proportions and identity across all 10 panels \u2014 "
    +"only the described change should differ from the reference. "
    +"Maintain the same 5\u00d72 grid layout (full-body views on top row, close-up headshots on bottom row), "
    +"the same render style and framing. Do not re-imagine the character.";
  const buildFinal = ()=> baseFinal + " APPEARANCE STATE \u2014 "+(st.label||"variant")+": "
    + (changeText()||"") + ". Render the character in THIS changed state consistently across every panel.";
  const buildSimple = ()=> ((typeof buildSimpleCharPrompt==="function") ? buildSimpleCharPrompt(c) : "Character reference")
    + ". " + (changeText()||"");

  const gen = useImageGen({
    id: stateId, slotId: "charref-"+stateId,
    cameoId: c.id,
    buildFinal: buildFinal,
    buildFromBase: baseGenUrl ? buildFromBase : null,
    referenceFallback: baseGenUrl ? (()=>baseGenUrl) : null,
    buildFromPhoto: ()=> buildFromBase(),
    buildSimple: buildSimple,
    buildEdit: (instr)=>
      "Edit this character design sheet for "+(c.name||"the character")+" ("+(st.label||"variant")+" state). "
      +"Apply ONLY this change: "+instr+". Preserve the same face, identity and the "+(st.label||"variant")
      +" appearance otherwise, across all 10 panels. Keep the 5\u00d72 grid layout. Do not re-imagine the character.",
  });
  const viewEntity = { ...c, name: c.name+" \u2014 "+(st.label||"variant") };

  return React.createElement("div",{className:"state-row"},
    React.createElement("div",{className:"state-row-head"},
      React.createElement("span",{className:"state-vtag"},vtag),
      React.createElement("div",{className:"state-label"},
        React.createElement(EditText,{value:st.label,placeholder:"State name\u2026",onCommit:val=>onChange({label:val})})),
      st.suggested && React.createElement("span",{className:"state-ai-chip",title:"Suggested by MUSE from the script"},"AI"),
      React.createElement("button",{className:"state-del",title:"Remove state",onClick:onDelete},React.createElement(Icon.x,{s:13}))),
    React.createElement(SheetFrame,{ gen, slotId:"charref-"+stateId, name:viewEntity.name,
      avatarColor:c.color, initials:vtag, drafted:true, drafting:false, onDraft:()=>{}, entity:viewEntity,
      onView, slotPlaceholder:"Drop reference art for this state", noun:vtag+" sheet" }),
    !baseGenUrl && React.createElement("div",{className:"state-hint"},
      React.createElement(Icon.alert,{s:11}),
      "Generate the base sheet above for identity-locked results \u2014 until then this uses the text spec."),
    React.createElement(SheetField,{label:"What changed",value:st.change,multiline:true,
      placeholder:"The visible difference from the base look \u2014 torn shirt, cut brow, dried blood\u2026",
      onCommit:val=>onChange({change:val,suggested:false})}),
    React.createElement("div",{className:"sheet-field"},
      React.createElement("div",{className:"obj-lab"},"First appears in"),
      React.createElement("select",{className:"prop-select",value:st.sceneId||"",onChange:e=>onChange({sceneId:e.target.value})},
        React.createElement("option",{value:""},"Not pinned"),
        scenes.map(s=>React.createElement("option",{key:s.id,value:s.id},"Sc "+s.no+" \u00b7 "+s.title)))));
}

function CharacterSheet({ c, project, scenes, props, onUpdate, onDraft, drafting, onView, onSuggestStates, suggestingStates, onRemoveOwnedItem, batchActiveId, onBatchDone, onDelete }){
  const drivenScenes = scenes.filter(s=>s.driver===c.id);
  const driven = drivenScenes.length;
  // role packs FUNCTION · ARCHETYPE — IDENTITY in one string; show & edit each
  // part as its own labelled line, re-composed back into c.role on every edit.
  const roleParts = parseRole(c.role);
  const setRolePart = (patch)=> onUpdate(c.id, { role: composeRole({ ...roleParts, ...patch }) });
  // Role, Archetype and Identity are all always shown, in that order. Archetype
  // sits before Identity; an empty one reveals its placeholder only on focus (CSS).
  const [roleOpen, setRoleOpen] = React.useState(false);   // collapsed by default to keep the card compact
  const roleSummary = composeRole({ ...roleParts, identity: capFirst(roleParts.identity) }) || "Role";
  const v = charVisualDefaults(c);
  const promptText = buildCharRefPrompt(c, project);
  const finalPrompt = (typeof combinedImagePrompt==="function") ? combinedImagePrompt(c, project) : promptText;
  const drafted = charVisualsDrafted(c);
  const initials = c.name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const palette = (c.palette && c.palette.length) ? c.palette : v.palette;

  /* props this character owns (carried/worn) — their generated sheets become extra
     visual references when generating this character's sheet */
  const ownedProps = (props||[]).filter(p=>p.ownerId===c.id);
  // Only WORN props become part of the character SHEET (glasses, coat, watch — the
  // permanent look). CARRIED props (phone, gun, pills) are situational, so they're
  // attached at the SHOT level instead, never baked into the neutral turnaround.
  const wornProps = ownedProps.filter(p=> p.kind!=="carried");
  /* "orphans" = prop cards that were DERIVED from the cast (fromCast) but whose name
     no longer matches any worn/carried bullet above — i.e. leftovers from an old bad
     text-split like "Aud" or "Possessive)". Curated / hand-added props (fromCast not
     set) are never flagged, since they're allowed to exist without a matching bullet. */
  // "And a silver ring" and "a silver ring" are the same item — strip the conjunction too
  const normName = s=> String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/^(?:and-|then-)/,"").slice(0,40);
  /* Resolve each WORN/CARRIED bullet to its prop card. Exact normalised-name match
     first; when that fails (a re-draft re-worded the item, or the card was drafted
     from older text) fall back to the OBJECT — same head noun, then strong word
     overlap — so the link survives re-phrasings. Each card matches at most once. */
  const linkInfo = React.useMemo(()=>{
    const split = (typeof splitListItems==="function") ? splitListItems : (v=>String(v||"").split(","));
    const byNorm = {};
    ownedProps.forEach(p=>{ const n=normName(p.name); if(!(n in byNorm)) byNorm[n]=p; });
    const claimed = new Set();
    /* descriptor words shared by MANY different objects — never evidence two
       names mean the same thing (the object words have to do that) */
    const STOP = new Set(["worn","carried","with","without","around","behind","over","under","left","right",
      "thin","small","large","heavy","wide","long","short","black","white","grey","gray","dark","pale",
      "vintage","simple","plain","portable","battered","tarnished","brushed","polished","unpolished",
      "subtle","filled","wrapped","showing","holding","their","there","that","this","into","onto"]);
    const wordsOf = (s)=> (String(s||"").toLowerCase().match(/[a-z]{4,}/g) || []).filter(w=>!STOP.has(w));
    /* score every unclaimed card and take the best: shared object-words count
       double, the card's head noun appearing in the bullet adds one. A score
       under 3 (i.e. less than 2 shared words, or 1 word + the object noun) is
       not evidence — better an honest "no sheet yet" than a wrong link. */
    const fuzzyProp = (item)=>{
      const toks = new Set(wordsOf(item));
      const low = " "+String(item).toLowerCase()+" ";
      let best=null, bestScore=0;
      ownedProps.forEach(p=>{ if(claimed.has(p.id)) return;
        const shared = wordsOf(p.name).filter(t=>toks.has(t)).length;
        const candHead = (typeof propHeadNoun==="function") ? propHeadNoun(p.name) : "";
        const headHit = candHead && low.indexOf(" "+candHead)>=0 ? 1 : 0;
        const score = shared*2 + headHit;
        if(score>=3 && score>bestScore){ best=p; bestScore=score; } });
      return best;
    };
    /* two passes: every EXACT match claims its card first, then re-phrasings
       fall back to the object — so a fuzzy match can never steal a card whose
       exact bullet appears later in the list */
    const bullets = [...split(c.accessories), ...split(c.props)].filter(it=>normName(it));
    const match = bullets.map(it=>{
      const exact = byNorm[normName(it)];
      if(exact && !claimed.has(exact.id)){ claimed.add(exact.id); return exact; }
      return null;
    });
    bullets.forEach((it,i)=>{ if(match[i]) return;
      const m = fuzzyProp(it); if(m){ claimed.add(m.id); match[i]=m; } });
    const rows = bullets.map((it,i)=>(
      { key:"b-"+normName(it)+"-"+i, name: match[i]?match[i].name:it, prop: match[i]||null, orphan:false }));
    /* orphans = cast-derived cards no bullet claimed (even fuzzily) — true leftovers */
    const orphans = ownedProps.filter(p=> p.fromCast && !claimed.has(p.id));
    orphans.forEach(p=> rows.push({ key:"o-"+p.id, name:p.name, prop:p, orphan:true }));
    return { rows, orphans };
  },[c.accessories, c.props, ownedProps.map(p=>p.id).join(",")]);
  const linkedRows = linkInfo.rows;
  const orphanProps = linkInfo.orphans;
  const collectAttachments = async ()=>{
    const out = [];
    for(const p of wornProps){
      let url = (typeof nbGetImage==="function") ? nbGetImage(p.id) : "";
      if(!url && typeof nbLoadImage==="function"){ try{ url = await nbLoadImage(p.id); }catch(e){} }
      if(url) out.push({ url, note: p.name+(p.kind?(" ("+p.kind+")"):"") });
    }
    return out;
  };
  /* which owned props currently have a generated sheet (for the linked-props indicator) */
  const [ownedSheetMap, setOwnedSheetMap] = React.useState({});
  const [sheetTick, setSheetTick] = React.useState(0);   // bump to re-check sheet presence
  const [prepProps, setPrepProps] = React.useState(null);   // {done,total,name} while generating props inline
  const preparingRef = React.useRef(false);
  React.useEffect(()=>{
    let alive=true;
    (async()=>{
      const m={};
      for(const p of ownedProps){
        let url=(typeof nbGetImage==="function")?nbGetImage(p.id):"";
        if(!url && typeof nbLoadImage==="function"){ try{ url=await nbLoadImage(p.id);}catch(e){} }
        m[p.id]=!!url;
      }
      if(alive) setOwnedSheetMap(m);
    })();
    return ()=>{alive=false;};
  },[ownedProps.map(p=>p.id).join(","), ownedProps.length, sheetTick]);
  /* legit linked props (excluding orphan cards) that have NO generated sheet yet —
     used to warn before generating a character that would miss those references. */
  const orphanIds = React.useMemo(()=> new Set(orphanProps.map(p=>p.id)), [orphanProps]);
  const missingPropSheets = wornProps.filter(p=> !orphanIds.has(p.id) && !ownedSheetMap[p.id]);
  /* refresh prop-readiness when one of THIS character's props finishes generating
     (e.g. the inline "generate props first" flow completing after a tab switch). */
  React.useEffect(()=>{
    const ids = new Set(ownedProps.map(p=>p.id));
    const onDone = (e)=>{ const did = e && e.detail && e.detail.id; if(did && ids.has(did)) setSheetTick(t=>t+1); };
    window.addEventListener("nb-gen-done", onDone);
    return ()=>window.removeEventListener("nb-gen-done", onDone);
  },[ownedProps.map(p=>p.id).join(",")]);

  /* appearance states (continuity variants) */
  const states = c.states || [];
  const updateStates = (next)=> onUpdate(c.id, { states: next });

  /* cameo (locked likeness) — Increment A */
  const [cameoOpen, setCameoOpen] = React.useState(false);
  const [cameoMeta, setCameoMeta] = React.useState(()=> (typeof nbCameoMeta==="function") ? nbCameoMeta(c.id) : null);
  const refreshCameo = ()=>{ if(typeof nbCameoMeta==="function") setCameoMeta(nbCameoMeta(c.id)); };
  const removeCameo = async ()=>{
    const ok = await window.appConfirm({
      title: "Remove "+c.name+"'s cameo likeness?",
      body: "Future generations won't be face-locked to it.",
      confirmLabel: "Remove", danger: true,
    });
    if(!ok) return;
    if(typeof nbClearCameo==="function") await nbClearCameo(c.id);
    refreshCameo();
  };
  const addState = ()=> updateStates([...states, { id:"st-"+Date.now().toString(36), label:"New state", change:"", sceneId:"" }]);
  const updateState = (id,patch)=> updateStates(states.map(s=>s.id===id?{...s,...patch}:s));
  const deleteState = (id)=>{
    if(typeof nbClearAsset==="function") nbClearAsset(c.id+":"+id);
    updateStates(states.filter(s=>s.id!==id));
  };
  const gen = useImageGen({
    id: c.id, slotId: "charref-"+c.id,
    cameoId: c.id,
    /* Clear cascades to this character's appearance-state variant sheets so they
       aren't orphaned (cameo + linked props are preserved). */
    relatedClearIds: ()=> (c.states||[]).map(s=> c.id+":"+s.id),
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildRefFromPhotoPrompt(c, project),
    buildSimple: ()=> (typeof buildSimpleCharPrompt==="function") ? buildSimpleCharPrompt(c) : finalPrompt,
    attachments: wornProps.length ? collectAttachments : null,
    /* warn-and-confirm: if any linked prop has no sheet, it'll be drawn from text
       only (not a locked reference). Three choices: generate the missing prop sheets
       inline first (no tab switch), continue without, or cancel. */
    beforeGenerate: async ()=>{
      if(preparingRef.current) return false;          // re-entry guard while prepping
      if(!missingPropSheets.length) return true;
      const list = missingPropSheets.slice();          // freeze the set for this run
      const n = list.length;
      const choice = await window.appConfirm({
        title: n+" linked prop"+(n>1?"s have":" has")+" no reference sheet yet",
        body: "Generating "+(c.name||"this character")+" now would render "+(n>1?"these items":"this item")
          +" from the text description only — not a locked prop sheet — so "+(n>1?"they":"it")
          +" may not match "+(n>1?"their":"its")+" final design.",
        items: list.map(p=>p.name||"Prop"),
        note: "Generate the missing sheet"+(n>1?"s":"")+" now (no tab switch), or continue without.",
        confirmLabel: "Generate "+n+" prop"+(n>1?"s":"")+" first",
        altLabel: "Generate without",
        cancelLabel: "Cancel",
      });
      if(choice===false) return false;                 // Cancel → abort
      if(choice==="alt") return true;                  // continue without prop sheets
      // primary: generate the missing prop sheets inline, then continue (the fresh
      // sheets are picked up by collectAttachments at character-generate time).
      if(typeof window.generatePropSheet==="function"){
        preparingRef.current = true;
        for(let i=0;i<list.length;i++){
          setPrepProps({ done:i, total:n, name:list[i].name||"prop" });
          try{ await window.generatePropSheet(list[i], project); }catch(e){}
        }
        setPrepProps(null);
        preparingRef.current = false;
        setSheetTick(t=>t+1);                          // refresh the "has sheet" indicators
      }
      return true;
    },
    buildEdit: (instr)=>
      "Edit this character design sheet for "+(c.name||"the character")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else without alteration \u2014 the exact same face, hair colour and style, "
      +"skin tone, body proportions, and physical identity across all 10 panels. "
      +"Keep the same 5\u00d72 grid layout: full-body views on top row, close-up headshots on bottom row. "
      +"Do not replace or re-imagine the character.",
  });

  // batch generation: when this card is the active queue member, fire one generate
  // and report back when it settles (mirrors the Props/Locations cards).
  const batchStarted = React.useRef(false);
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===c.id;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){ batchStarted.current=true; wasGening.current=false; gen.generate({ batch:true }); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(c.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, c.id]);

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===c.id?" batch-on":""),"data-char-card":c.id},
    React.createElement(SheetFrame,{ gen, slotId:"charref-"+c.id, name:c.name, avatarColor:c.color,
      initials, drafted, drafting, onDraft:()=>onDraft(c), entity:c, onView,
      slotPlaceholder:"Drop reference art", noun:"sheet",
      specGate:{ ready:(drafted || !c.manual), hint:"Draft the design spec first \u2014 look & wardrobe are what the sheet is built from." },
      onDelete:(onDelete && c.manual)?(()=>onDelete(c.id)):null, deleteLabel:"Delete character" }),
    React.createElement("div",{className:"sheet-body"},
      (drafting && !drafted) && React.createElement("div",{className:"char-drafting-strip"},
        React.createElement("span",{className:"ns-spin"}),"Drafting from script\u2026"),
      prepProps && React.createElement("div",{className:"char-drafting-strip"},
        React.createElement("span",{className:"ns-spin"}),
        "Generating prop sheet "+(prepProps.done+1)+"/"+prepProps.total+"\u2026 "+(prepProps.name||"")),
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{className:"sheet-head-top"},
          React.createElement("div",{className:"sheet-name"},c.name),
          React.createElement("div",{className:"sheet-head-acts"},
            React.createElement("button",{className:"char-cameo-btn"+(cameoMeta?" on":""),disabled:drafting,
              onClick:()=>setCameoOpen(true),
              title:cameoMeta?"Likeness locked \u2014 recapture or manage cameo":"Cast a real face \u2014 lock this character's likeness"},
              React.createElement(Icon.userScan,{s:12}), cameoMeta?"Cameo":"Cast"),
            React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(c)},
              React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"))),
        React.createElement("div",{className:"sheet-role-block"+(roleOpen?" open":"")},
          React.createElement("button",{className:"role-toggle",onClick:()=>setRoleOpen(o=>!o),
            title:roleOpen?"Collapse":"Expand role details"},
            React.createElement(Icon[roleOpen?"chevD":"chevR"],{s:12}),
            roleOpen
              ? React.createElement("span",{className:"role-toggle-lab"},"Role & scenes")
              : React.createElement("span",{className:"role-summary"},roleSummary)),
          roleOpen && React.createElement("div",{className:"role-fields"},
          // ROLE (function) — always shown
          React.createElement("div",{className:"role-line"},
            React.createElement("span",{className:"role-lab"},"Role"),
            React.createElement("div",{className:"sheet-role"},
              React.createElement(EditText,{value:roleParts.role,placeholder:"Function\u2014e.g. Antagonist",
                onCommit:val=>setRolePart({role:val})}))),
          // ARCHETYPE (the "·" aspect) — always shown, before Identity
          React.createElement("div",{className:"role-line"},
            React.createElement("span",{className:"role-lab"},"Archetype"),
            React.createElement("div",{className:"sheet-role-desc"},
              React.createElement(EditText,{value:roleParts.archetype,multiline:true,
                placeholder:"What they embody \u2014 e.g. ideology, the system\u2026",onCommit:val=>setRolePart({archetype:val})}))),
          // IDENTITY (who they are) — always shown
          React.createElement("div",{className:"role-line"},
            React.createElement("span",{className:"role-lab"},"Identity"),
            React.createElement("div",{className:"sheet-role-desc"},
              React.createElement(EditText,{value:capFirst(roleParts.identity),multiline:true,
                placeholder:"Who they are \u2014 e.g. A Somali-British trauma nurse\u2026",onCommit:val=>setRolePart({identity:val})}))),
          React.createElement("div",{className:"sheet-scenes"},
            React.createElement("span",{className:"sheet-scenes-lab"},"Scenes"),
            drivenScenes.length
              ? drivenScenes.map(s=>React.createElement("span",{key:s.id,className:"sheet-scene-chip",
                  title:s.title||("Scene "+s.no)},String(s.no).padStart(2,"0")))
              : React.createElement("span",{className:"sheet-scenes-none"},"none yet"))))),

      cameoMeta && React.createElement("div",{className:"sheet-cameo-status"},
        React.createElement(Icon.userScan,{s:13}),
        React.createElement("span",{className:"scs-t"},"Likeness locked"),
        React.createElement("span",{className:"scs-meta"},
          ((cameoMeta.angleCount||1)+" angle"+((cameoMeta.angleCount||1)!==1?"s":""))+" \u00b7 "
          +(cameoMeta.sync?"Synced":"On this device")+" \u00b7 "+(cameoMeta.date||"")),
        React.createElement("button",{className:"scs-act",onClick:()=>setCameoOpen(true)},"Recapture"),
        React.createElement("button",{className:"scs-act danger",onClick:removeCameo},"Remove")),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"Visuals not drafted yet \u2014 click ",
          React.createElement("b",null,"Draft details")," to fill the physical identity.")),

      React.createElement(CardFold,{label:"Identity",defaultOpen:false},
        React.createElement(SheetField,{label:"Body \u2014 fixed physical tokens",value:vfield(c,"coreBody","look"),multiline:true,
          placeholder:"Apparent age, ethnicity, skin tone & condition, eye colour, hair, face shape, body type, defining features\u2026",onCommit:val=>onUpdate(c.id,{coreBody:val})}),
        c.bodyRationale && React.createElement("div",{className:"sheet-rationale"},
          React.createElement(Icon.sparkles,{s:11}),"Why this look: "+tidyTruncated(c.bodyRationale)),
        React.createElement(SheetField,{label:"Texture \u2014 skin & material detail",value:c.materialTexture,multiline:true,
          placeholder:"Pore texture, subsurface scattering, blemishes, lighting\u2026",onCommit:val=>onUpdate(c.id,{materialTexture:val})}),
        React.createElement("div",{className:"sheet-2col"},
          React.createElement(SheetField,{label:"Scale",value:c.scaleClass||v.scaleClass,
            onCommit:val=>onUpdate(c.id,{scaleClass:val})}),
          React.createElement(SheetField,{label:"Height",value:c.height||v.height,
            onCommit:val=>onUpdate(c.id,{height:val})}))),

      React.createElement(CardFold,{label:"Wardrobe",defaultOpen:false},
        React.createElement(SheetField,{label:"Public \u2014 the mask",value:vfield(c,"wardrobeMask","wardrobe"),multiline:true,
          placeholder:"Armour / public clothes \u2014 the social persona\u2026",onCommit:val=>onUpdate(c.id,{wardrobeMask:val})}),
        React.createElement(SheetField,{label:"Private \u2014 the true self",value:c.wardrobeInner,multiline:true,
          placeholder:"Softer, personal clothing \u2014 who they really are\u2026",onCommit:val=>onUpdate(c.id,{wardrobeInner:val})})),

      React.createElement(CardFold,{label:"Props & accessories",defaultOpen:false},
        React.createElement("div",{className:"sheet-props-note"},
          React.createElement(Icon.sparkles,{s:11}),
          "Continuity objects \u2014 worn or carried items that recur across scenes."),
        React.createElement("div",{className:"sheet-2col"},
          React.createElement(SheetField,{label:"Accessories \u2014 worn",value:c.accessories,list:true,ownerName:c.name,
            onItemRemoved: onRemoveOwnedItem ? (txt=>onRemoveOwnedItem(c.id,txt)) : null,
            placeholder:"Fixed worn items \u2014 watch, glasses, jewellery\u2026",onCommit:val=>onUpdate(c.id,{accessories:val})}),
          React.createElement(SheetField,{label:"Props \u2014 carried",value:c.props,list:true,ownerName:c.name,
            onItemRemoved: onRemoveOwnedItem ? (txt=>onRemoveOwnedItem(c.id,txt)) : null,
            placeholder:"Recurring objects \u2014 phone, weapon, talisman\u2026",onCommit:val=>onUpdate(c.id,{props:val})})),
        linkedRows.length>0 && React.createElement("div",{className:"linked-props"},
          React.createElement("div",{className:"linked-props-head"},
            React.createElement("div",{className:"obj-lab",style:{margin:0}},
              "Linked prop sheets \u2014 worn items attach to this sheet; carried attach at the shot"),
            orphanProps.length>0 && onRemoveOwnedItem && React.createElement("button",{className:"linked-props-clean",
              title:"Remove the prop cards below that aren't in the worn/carried lists above",
              onClick:async ()=>{
                const ok = await window.appConfirm({
                  title: "Remove "+orphanProps.length+" orphaned prop"+(orphanProps.length>1?"s":"")+"?",
                  body: "These aren't listed in this character's worn/carried items \u2014 likely leftovers from an old text split.",
                  items: orphanProps.map(p=>p.name),
                  note: "This deletes their prop cards and reference sheets. This can't be undone.",
                  confirmLabel: "Remove", danger: true,
                });
                if(ok) orphanProps.forEach(p=>onRemoveOwnedItem(c.id, p.name));
              }},
              React.createElement(Icon.x,{s:11}),"Remove "+orphanProps.length+" orphaned")),
          React.createElement("div",{className:"linked-prop-list"},
            linkedRows.map(row=>{
              // carried props don't attach to the character SHEET \u2014 they ride in at
              // the shot level, so show them as deferred rather than "missing".
              const carried = !!(row.prop && row.prop.kind==="carried");
              const ready = row.prop ? !!ownedSheetMap[row.prop.id] : false;
              // carried props stay neutral (they bind at the shot, not here) but still
              // show whether their sheet has been generated \u2014 a green tick when ready,
              // so a generated and an ungenerated carried prop don't look identical.
              const cls = "linked-prop "+(carried?("shot"+(ready?" genned":"")):(ready?"ready":"missing"))+(row.orphan?" orphan":"");
              const status = carried
                ? (ready ? "sheet ready \u2713 \u00b7 at shot" : "no sheet yet \u00b7 at shot")
                : (ready ? "sheet ready \u2713" : "no sheet yet");
              return React.createElement("div",{key:row.key,className:cls,
                title: carried
                  ? (ready ? "Reference sheet generated \u2014 it attaches at the shot, not on this character sheet."
                           : "No reference sheet generated yet \u2014 it will attach at the shot once you generate it in the Props tab.")
                  : (ready ? "Reference sheet generated and attached to this character sheet."
                           : "No reference sheet generated yet \u2014 generate it in the Props tab.")},
                React.createElement(Icon.box,{s:12}),
                React.createElement("span",{className:"linked-prop-name"},row.name),
                row.orphan && React.createElement("span",{className:"linked-prop-orphan-tag",
                  title:"Not in the worn/carried lists above \u2014 likely a leftover. Use \u201cRemove orphaned\u201d to clean up."},"not listed"),
                React.createElement("span",{className:"linked-prop-status"},status));
            })))),

      React.createElement(CardFold,{label:"Continuity \u00b7 appearance states",count:states.length||null,defaultOpen:false},
        React.createElement("div",{className:"sheet-props-note"},
          React.createElement(Icon.sparkles,{s:11}),
          "Moments where this character's look changes \u2014 wounds, costume shifts, time jumps. Each can become its own v2 sheet."),
        React.createElement("div",{className:"state-actions"},
          React.createElement("button",{className:"state-suggest-btn",disabled:suggestingStates,onClick:()=>onSuggestStates&&onSuggestStates(c)},
            suggestingStates
              ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin"}),"Scanning script\u2026")
              : React.createElement(React.Fragment,null,React.createElement(Icon.sparkles,{s:12}),"Suggest from script")),
          React.createElement("button",{className:"state-add-btn",onClick:addState},
            React.createElement(Icon.plus,{s:12}),"Add state")),
        states.length
          ? React.createElement("div",{className:"state-list"},
              React.createElement("div",{className:"state-row state-base"},
                React.createElement("span",{className:"state-vtag base"},"v1"),
                React.createElement("span",{className:"state-base-lab"},"Base look \u2014 the canonical sheet above")),
              states.map((st,i)=>React.createElement(StateRow,{key:st.id,c,st,index:i,project,scenes,
                baseGenUrl:gen.genUrl,onView,
                onChange:(patch)=>updateState(st.id,patch),onDelete:()=>deleteState(st.id)})))
          : React.createElement("div",{className:"state-empty"},
              "No appearance states yet \u2014 the base sheet covers the whole film. ",
              "Use \u201cSuggest from script\u201d to find where the look changes, or add one by hand.")),

      React.createElement(CardFold,{label:"Look dev",defaultOpen:false},
        React.createElement(SheetField,{label:"Render style",value:c.renderStyle,multiline:true,
          placeholder:"photoreal cinematic, 35mm, film grain, shallow depth of field\u2026",onCommit:val=>onUpdate(c.id,{renderStyle:val})}),
        React.createElement("div",{className:"sheet-field"},
          React.createElement("div",{className:"obj-lab"},"Colour palette \u00b7 base \u2192 climax"),
          React.createElement(PaletteRow,{palette}))),

      React.createElement(CardFold,{label:"Master reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"10-panel grid \u2014 feed to your image tool",text:promptText}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:c.negativePrompt||v.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(c.id,{negativePrompt:val})}),
        React.createElement(CopyBox,{label:"Final prompt \u2014 master + negative (sent to Nano Banana)",text:finalPrompt})),

      cameoOpen && React.createElement(CameoModal,{ character:c,
        onClose:()=>setCameoOpen(false),
        onSaved:()=>{ refreshCameo(); } })));
}

function NbKeyBar(){
  const [model, setModelState] = React.useState(()=> (typeof nbGetModel==="function") ? nbGetModel() : "");
  React.useEffect(()=>{
    const h = ()=> setModelState((typeof nbGetModel==="function") ? nbGetModel() : "");
    window.addEventListener("nb-model-changed", h);
    return ()=>window.removeEventListener("nb-model-changed", h);
  },[]);
  const provider = (typeof providerOfModel==="function") ? providerOfModel(model) : "google";
  const isOAI = provider==="openai";
  // proxied: this provider's generation runs server-side (no browser key). Always
  // true for GPT Image; true for Nano Banana too when the image proxy is enabled.
  const proxied = isOAI || (typeof imageProxyOn==="function" && imageProxyOn());
  const getKeyFn = isOAI ? oaiGetKey : nbGetKey;
  const setKeyFn = isOAI ? oaiSetKey : nbSetKey;
  const label = isOAI ? "GPT Image" : "Nano Banana";
  const placeholder = isOAI ? "sk-\u2026" : "AIza\u2026 or AQ.\u2026";
  const help = isOAI ? "Paste your OpenAI API key to generate with GPT Image"
                     : "Paste your Google AI Studio API key to generate images";
  const deviceNote = "Stored on this device only \u2014 keys don't sync across devices, even when your story is synced.";
  const [key, setKey] = React.useState(()=> getKeyFn());
  const [editing, setEditing] = React.useState(()=> !getKeyFn());
  const [val, setVal] = React.useState("");
  const [warn, setWarn] = React.useState("");
  // re-sync when the selected provider changes
  React.useEffect(()=>{ setKey(getKeyFn()); setEditing(!getKeyFn()); setVal(""); setWarn(""); },[provider]);
  // plausibility check — catches partial pastes / wrong text BEFORE a failed call
  const keyHint = (k)=>{
    const clean = (typeof sanitizeKey==="function") ? sanitizeKey(k) : k.trim();
    if(isOAI){
      if(!/^sk-/.test(clean)) return "OpenAI keys start with \u201csk-\u201d. This doesn't \u2014 paste the full secret key from platform.openai.com.";
      if(clean.length < 40) return "That looks too short for an OpenAI key. Paste the whole key (it's ~50+ characters).";
    } else {
      // Google issues TWO key formats: legacy "AIza\u2026" and newer "AQ.\u2026".
      // Don't hard-block on prefix (it was rejecting valid AQ. keys) \u2014 just a
      // light length sanity check; the API gives a precise message if it's wrong.
      if(clean.length < 20) return "That looks too short. Paste the whole Google AI Studio key.";
    }
    return "";
  };
  // a previously-saved key that fails the check is NOT really connected — drop
  // into edit mode and say why, instead of showing a false "connected" badge.
  React.useEffect(()=>{
    const k = getKeyFn();
    if(k && keyHint(k)){ setEditing(true); setWarn(keyHint(k)); }
  },[provider]);
  const save = ()=>{
    const k = (typeof sanitizeKey==="function") ? sanitizeKey(val) : val.trim();
    if(!k) return;
    const h = keyHint(k);
    if(h){ setWarn(h); return; }   // block obviously-malformed keys, explain why
    setKeyFn(k); setKey(k); setVal(""); setWarn(""); setEditing(false);
  };
  const clear = ()=>{ setKeyFn(""); setKey(""); setVal(""); setWarn(""); setEditing(true); };
  // Proxied providers run server-side — the browser holds no key. Show an
  // informational strip instead of a key input. (Always for GPT Image; for Nano
  // Banana only when the image proxy is enabled.)
  // operator info only — the admin account sees the strip; everyone else nothing
  if(proxied) return window.turnIsAdmin ? React.createElement("div",{className:"nb-keybar set"},
    React.createElement(Icon.check,{s:13}),
    React.createElement("span",null,label+" runs on your server"),
    React.createElement("span",{className:"nb-key-note"},"\u00b7 no key needed in the browser; sign in to use it")) : null;
  if(!editing && key) return React.createElement("div",{className:"nb-keybar set"},
    React.createElement(Icon.check,{s:13}),
    React.createElement("span",null,label+" connected"),
    React.createElement("span",{className:"nb-key-note"},"\u00b7 this device only"),
    React.createElement("button",{className:"nb-key-link",onClick:clear},"Change key"));
  return React.createElement("div",{className:"nb-keybar"+(warn?" warn":"")},
    React.createElement(Icon.alert,{s:13}),
    React.createElement("div",{className:"nb-key-help"},
      React.createElement("span",{className:"nb-key-lab"},help),
      React.createElement("span",{className:"nb-key-note"}, warn || deviceNote)),
    React.createElement("input",{className:"nb-key-input",type:"password",placeholder:placeholder,value:val,
      onChange:e=>{ setVal(e.target.value); if(warn) setWarn(""); },onKeyDown:e=>{ if(e.key==="Enter") save(); }}),
    React.createElement("button",{className:"nb-key-save",onClick:save,disabled:!val.trim()},"Save"));
}

function NbControls(){
  const [model, setModel] = React.useState(()=> (typeof nbGetModel==="function") ? nbGetModel() : "");
  const [aspect, setAspect] = React.useState(()=> (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9");
  const [resv, setResv] = React.useState(()=> (typeof nbGetRes==="function") ? nbGetRes() : "2K");
  const [ground, setGround] = React.useState(()=> (typeof nbGetGroundSearch==="function") ? nbGetGroundSearch() : false);
  const [groundTip, setGroundTip] = React.useState(false);
  const [mOpen, setMOpen] = React.useState(false);   // mobile dropdown open
  const tipRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const models = window.NB_MODELS || [];
  const aspects = window.NB_ASPECTS || ["16:9","21:9"];
  const isFlash = model === "gemini-3.1-flash-image";
  const modelLabel = (models.find(m=>m.id===model)||{}).label || model || "Model";

  /* close tooltip on outside click */
  React.useEffect(()=>{
    if(!groundTip) return;
    const h = e=>{ if(tipRef.current && !tipRef.current.contains(e.target)) setGroundTip(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[groundTip]);
  /* close the mobile settings dropdown on outside click */
  React.useEffect(()=>{
    if(!mOpen) return;
    const h = e=>{ if(wrapRef.current && !wrapRef.current.contains(e.target)) setMOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[mOpen]);
  /* reflect external model switches (e.g. a "Try <model>" fallback after a failed
     generation) in the picker highlight + mobile summary. */
  React.useEffect(()=>{
    const h = ()=>{ if(typeof nbGetModel==="function") setModel(nbGetModel()); };
    window.addEventListener("nb-model-changed", h);
    return ()=>window.removeEventListener("nb-model-changed", h);
  },[]);

  return React.createElement("div",{className:"nb-controls"+(mOpen?" mopen":""),ref:wrapRef},
    /* mobile-only: collapse all three controls into a dropdown */
    React.createElement("button",{className:"nb-ctl-mtoggle",onClick:()=>setMOpen(o=>!o)},
      React.createElement(Icon.layers,{s:13}),
      React.createElement("span",{className:"nb-ctl-msum"}, modelLabel+" \u00b7 "+aspect+" \u00b7 "+resv),
      React.createElement(Icon[mOpen?"chevU":"chevD"],{s:12})),
    React.createElement("div",{className:"nb-ctl-body"},
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Model"),
      React.createElement("div",{className:"nb-ctl-row"},
        React.createElement("div",{className:"nb-seg"},
          models.map(m=>React.createElement("button",{key:m.id,className:"nb-seg-btn "+(model===m.id?"on":""),
            title:m.note,onClick:()=>{ setModel(m.id); nbSetModel(m.id); window.dispatchEvent(new CustomEvent("nb-model-changed")); }},m.label))),
        /* grounding toolkit — only when Nano Banana 2 is selected */
        isFlash && React.createElement("div",{className:"nb-ground-wrap",ref:tipRef},
          React.createElement("button",{
            className:"nb-ground-btn "+(ground?"on":"")+(groundTip?" open":""),
            onMouseEnter:()=>setGroundTip(true),
            onMouseLeave:(e)=>{ if(!tipRef.current||!tipRef.current.contains(e.relatedTarget)) setGroundTip(false); },
            onClick:()=>setGroundTip(t=>!t),
            title:"Grounding"},
            React.createElement(Icon.bolt,{s:11,sw:2.2}),ground?"On":""),
          groundTip && React.createElement("div",{className:"nb-ground-tip"},
            React.createElement("div",{className:"nb-ground-tip-head"},
              React.createElement(Icon.bolt,{s:11,sw:2.2}),
              "Grounding",
              React.createElement("span",{className:"nb-ground-tip-badge"},"Nano Banana 2"),
              React.createElement("span",{className:"nb-ground-tip-sub"},"real-world visual references")),
            React.createElement("div",{className:"nb-ground-tip-body"},
              "When on, the model searches Google Images to anchor generation to real-world ",
              "references \u2014 period costumes, locations, props."),
            React.createElement("div",{className:"nb-seg nb-ground-seg"},
              React.createElement("button",{className:"nb-seg-btn "+(!ground?"on":""),
                onClick:()=>{ setGround(false); nbSetGroundSearch&&nbSetGroundSearch(false); }},
                "Off"),
              React.createElement("button",{className:"nb-seg-btn "+(ground?"on":""),
                onClick:()=>{ setGround(true); nbSetGroundSearch&&nbSetGroundSearch(true); }},
                "Web + images")))))),
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Aspect"),
      React.createElement("div",{className:"nb-seg"},
        aspects.map(a=>React.createElement("button",{key:a,className:"nb-seg-btn "+(aspect===a?"on":""),
          onClick:()=>{ setAspect(a); nbSetAspect(a); }},a)))),
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Resolution"),
      React.createElement("div",{className:"nb-seg"},
        (window.NB_RESOLUTIONS||["1K","2K","4K"]).map(r=>React.createElement("button",{key:r,className:"nb-seg-btn "+(resv===r?"on":""),
          onClick:()=>{ setResv(r); nbSetRes(r); }},r))))));
}

/* ENGINE DOCK — a compact floating widget in the MUSE bubble's 54px right-edge
   column, vertically centered, floating ABOVE the layout (no content clearance).
   Collapsed: three stacked chips summarising Model / Aspect / Resolution.
   Click: a flyout panel (opens leftward) with the full NbControls. */
function NbDock(){
  const [open, setOpen] = React.useState(false);
  const [, force] = React.useState(0);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    const h = ()=> force(x=>x+1);
    window.addEventListener("nb-model-changed", h);
    return ()=>window.removeEventListener("nb-model-changed", h);
  },[]);
  React.useEffect(()=>{
    if(!open) return;
    const h = e=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[open]);
  const model  = (typeof nbGetModel==="function") ? nbGetModel() : "";
  const aspect = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  const resv   = (typeof nbGetRes==="function") ? nbGetRes() : "2K";
  const short  = /pro/i.test(model) ? "PRO" : /gpt/i.test(model) ? "GPT" : "NB2";
  return React.createElement("div",{className:"nb-dock"+(open?" open":""),ref:ref,"aria-label":"Image engine settings"},
    React.createElement("button",{className:"nb-dock-toggle","aria-expanded":open?"true":"false",
      title:"Image engine — model, aspect & resolution",onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"nb-dock-chip model"},short),
      React.createElement("span",{className:"nb-dock-chip"},aspect),
      React.createElement("span",{className:"nb-dock-chip"},resv)),
    // clicks inside the panel re-render the dock so the summary chips stay fresh
    open && React.createElement("div",{className:"nb-dock-panel",onClick:()=>force(x=>x+1)},
      React.createElement(NbControls,null)));
}

function ImageLightbox({ url, character, onClose }){
  const [res, setRes] = React.useState(()=> (typeof nbGetRes==="function") ? nbGetRes() : "2K");
  const [busy, setBusy] = React.useState(false);
  const resolutions = window.NB_RESOLUTIONS || ["1K","2K","4K"];
  const download = async ()=>{
    if(busy) return; setBusy(true);
    const fn = (character && character.name ? character.name.replace(/[^\w]+/g,"_") : "character")+"_sheet_"+res+".png";
    try{ await nbDownload(url, res, fn); }catch(e){}
    setBusy(false);
  };
  return React.createElement("div",{className:"lb-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"lb-panel"},
      React.createElement("div",{className:"lb-head"},
        React.createElement("span",{className:"lb-title"},character?character.name:"Character sheet"),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),
      React.createElement("div",{className:"lb-imgwrap"},
        React.createElement("img",{className:"lb-img",src:url,alt:"full view"})),
      React.createElement("div",{className:"lb-foot"},
        React.createElement("span",{className:"lb-foot-lab"},"Download"),
        React.createElement("div",{className:"nb-seg"},
          resolutions.map(r=>React.createElement("button",{key:r,className:"nb-seg-btn "+(res===r?"on":""),
            onClick:()=>setRes(r)},r))),
        React.createElement("button",{className:"lb-dl",onClick:download,disabled:busy},
          busy?React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),"Preparing\u2026")
              :React.createElement(React.Fragment,null,React.createElement(Icon.download,{s:14}),"Download "+res)))));
}

function CharacterSheets({ project, characters, scenes, props, shots, beatsMap, onUpdate, onDraft, onDraftAll, draftingId, draftingAll, draftingIds, onSuggestStates, suggestingStatesId, onRemoveOwnedItem, onAdd, onDelete, onCast, lookbookStale, onApplyLookbook }){
  const [view, setView] = React.useState(null);   // {url, character}
  const [mgrOpen, setMgrOpen] = React.useState(false);
  const [sceneFilter, setSceneFilter] = React.useState("");   // "" = all scenes
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = characters || [];
  const sceneList = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  // which characters appear in each scene — DERIVED (characters have no `scenes` field):
  // the scene's driver + everyone in its shots' subjects + the beats' reactor (by name).
  const charsInSceneMap = React.useMemo(()=>{
    const shotsBy = {}; (shots||[]).forEach(s=>{ (shotsBy[s.sceneId]=shotsBy[s.sceneId]||[]).push(s); });
    const m = {};
    (scenes||[]).forEach(s=>{
      const ids = new Set();
      if(s.driver) ids.add(s.driver);
      (shotsBy[s.id]||[]).forEach(sh=> (sh.subjects||[]).forEach(id=>ids.add(id)));
      const b = (beatsMap||{})[s.id];
      if(b && b.reactorLabel){ const rl=String(b.reactorLabel).toLowerCase();
        const mm = list.find(c=> (c.name||"").toLowerCase()===rl || rl.includes((c.name||"").toLowerCase())); if(mm) ids.add(mm.id); }
      m[s.id] = ids;
    });
    return m;
  }, [scenes, shots, beatsMap, list]);
  const inScene = (c, sid)=> !!(charsInSceneMap[sid] && charsInSceneMap[sid].has(c.id));
  const shown = sceneFilter ? list.filter(c=>inScene(c, sceneFilter)) : list;
  // 9-up pagination; suspended while a batch runs so the queue can reach every card
  const charPager = usePager(shown.length, !!batchActiveId);
  const sceneNoOf = (sid)=>{ const s=(scenes||[]).find(x=>x.id===sid); return s?s.no:sid; };
  const draftedIds = (subset)=> subset.filter(c=>charVisualsDrafted(c)).map(c=>c.id);
  // eligible = drafted characters only (so a card with no look/wardrobe never makes a generic sheet)
  const eligibleAll = list.filter(c=>charVisualsDrafted(c)).length;
  // some cast still has no spec (e.g. a hand-added character, or auto-draft didn't
  // finish) — only THEN do we surface the manual "Draft" button; otherwise it's
  // noise. The cast is auto-drafted once on first Art Room entry.
  const someUndrafted = eligibleAll < list.length;
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Draft the characters first \u2014 nothing is ready to generate yet."); return; }
    if(sceneFilter) setSceneFilter("");            // mount every card so the queue can reach each one
    batch.begin(eligible, list.length - eligible.length);
  };
  // generate just the cast in the focused scene (mirrors Props / Locations)
  const startSceneBatch = ()=>{
    if(!sceneFilter || batchActiveId) return;
    const eligible = draftedIds(shown);
    if(!eligible.length){ batch.setMsg("Draft the characters in this scene first \u2014 nothing here is ready to generate."); return; }
    batch.begin(eligible, shown.length - eligible.length);
  };
  // when a character is added BY HAND, smooth-scroll it into view (parity with Props)
  const prevIdsRef = React.useRef(null);
  React.useEffect(()=>{
    const ids = list.map(c=>c.id);
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if(!prev) return;
    const added = list.find(c=>prev.indexOf(c.id)<0);
    if(!added || !added.manual) return;
    let tries = 0;
    const tick = ()=>{
      const el = document.querySelector('[data-char-card="'+added.id+'"]');
      const scroller = el && el.closest('.artroom');
      if(el && scroller){
        const target = Math.max(0, scroller.scrollTop + (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - 16);
        const start = scroller.scrollTop, dist = target - start, t0 = performance.now(), dur = 420;
        const ease = x => 1 - Math.pow(1 - x, 3);
        const step = (now)=>{ const k = Math.min(1, (now - t0) / dur); scroller.scrollTop = start + dist * ease(k); if(k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
        return;
      }
      if(tries++ < 10) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },[list]);
  const [cameoCount, setCameoCount] = React.useState(()=> (typeof nbListCameos==="function") ? nbListCameos().length : 0);
  const refreshCount = ()=>{ if(typeof nbListCameos==="function") setCameoCount(nbListCameos().length); };
  const nameOf = (id)=>{ const c=(characters||[]).find(x=>x.id===id); return c?c.name:id; };
  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    mgrOpen && React.createElement(CameoManager,{nameOf,onClose:()=>setMgrOpen(false),onChanged:refreshCount}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},
            ((typeof roomCopy==="function" && roomCopy(project,"characters").title) || "Casting Director (Character Designer)"),
            React.createElement(window.InfoTip,{label:"About Character Sheets",
              text:((typeof roomCopy==="function" && roomCopy(project,"characters").tip) ||
                "A canonical visual reference for every character \u2014 the consistency anchor you feed into each shot so they look identical in every frame. 'Design the cast' runs the Casting Director agent: on its own it drafts each character's look, finds their appearance changes (wounds, dirt, costume shifts), then generates the master sheet (pulling in their prop sheets + any cameo) and every appearance-state variant. 'Draft all' + 'Generate all characters' stay as the manual paths.")}))),
        React.createElement("div",{className:"art-intro-actions"},
          cameoCount>0 && React.createElement("button",{className:"art-cameo-mgr",onClick:()=>setMgrOpen(true),
            title:"Review & manage locked likenesses"},
            React.createElement(Icon.userScan,{s:14}),"Cameos \u00b7 "+cameoCount),
          onAdd && React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
            React.createElement(Icon.plus,{s:14}),"Add character"),
          onCast && React.createElement("button",{className:"art-draftall",disabled:!characters.length,onClick:onCast,
            title:"Casting Director — drafts each character's look, finds their appearance changes, and generates the master sheet + every state variant, on its own"},
            React.createElement(Icon.robot,{s:14}),"Design the cast"),
          someUndrafted && React.createElement("button",{className:"art-draftall",disabled:draftingAll,onClick:onDraftAll,
            title:"Draft the spec for any character that doesn't have one yet \u2014 identity, wardrobe, props & accessories, continuity and look dev (the master reference prompt builds from these)"},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":(eligibleAll>0?"Draft remaining":"Draft all characters")),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the reference sheet for every drafted character \u2014 you choose whether to redo ones that already have a sheet"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all characters")))),
    sceneList.length>0 && list.length>0 && React.createElement("div",{className:"prop-scenebar"},
      React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.layers,{s:13}),"Focus a scene"),
      React.createElement("select",{className:"prop-select prop-scenebar-select",value:sceneFilter,onChange:e=>setSceneFilter(e.target.value)},
        React.createElement("option",{value:""},"All scenes — show every character"),
        sceneList.map(s=>{ const n=(charsInSceneMap[s.id]?charsInSceneMap[s.id].size:0);
          return React.createElement("option",{key:s.id,value:s.id},
            "Scene "+String(s.no).padStart(2,"0")+" · "+(s.title||"")+"  ("+n+" character"+(n!==1?"s":"")+")"); })),
      sceneFilter && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId,onClick:startSceneBatch,
        title:"Generate the reference sheets for the characters in this scene — you choose whether to redo ones that already have a sheet"},
        React.createElement(Icon.sparkles,{s:14}),
        batchActiveId?"Generating…":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")))),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,label:"these characters",dept:"characters"}),
    BatchBar && React.createElement(BatchBar,{batch,noun:"character"}),
    React.createElement("div",{className:"sheet-grid"},
      charPager.slice(shown).map(c=>React.createElement(CharacterSheet,{key:c.id,c,project,scenes,props,onUpdate,onDraft,
        drafting:draftingId===c.id||(draftingIds||[]).indexOf(c.id)>=0,onView:(url,ch)=>setView({url,character:ch}),
        batchActiveId,onBatchDone:batch.advance,onDelete:onDelete,
        onSuggestStates,suggestingStates:suggestingStatesId===c.id,onRemoveOwnedItem}))),
    React.createElement(PagerBar,{pager:charPager,noun:"character"}));
}

function ArtComingSoon({ tab }){
  const map = {
    locations:["Locations","Pulled from every slugline in your script \u2014 each environment gets a reference plate prompt and an asset slot, so every shot in a place matches.","globe"],
    shots:["Shot List","Derived from each scene's beats \u2014 every beat becomes a shot with a generated prompt that pulls in the right character sheet and location plate for consistency.","film"],
    storyboard:["Storyboard","Your shots laid out in sequence with their reference frames \u2014 the visual blueprint of the film, ready to hand to the Stage.","board"],
  };
  const [title,desc,icon] = map[tab]||["Coming next","",""];
  return React.createElement("div",{className:"art-soon"},
    React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon[icon]||Icon.sparkles,{s:30})),
    React.createElement("div",{className:"art-soon-t"},title),
    React.createElement("div",{className:"art-soon-d"},desc),
    React.createElement("div",{className:"art-soon-tag"},"Next increment"));
}

function ArtRoom({ artView, setArtView, project, characters, scenes, props, onUpdateChar, onDraftVisuals, onDraftAllVisuals, draftingVisualId, draftingAllVisuals, draftingVisualIds,
  onSuggestStates, suggestingStatesId, onRemoveOwnedItem, onAddCharacter, onDeleteCharacter,
  onUpdateProp, onDraftProp, onDraftAllProps, onAddProp, onDeleteProp, draftingPropId, draftingAllProps, onMergeProps, onSeedFromCast, castHasProps, onTagScenes, taggingScenes, onTagOne, taggingSceneId,
  locations, onUpdateLocation, onDraftLocation, onDraftAllLocs, onAddLocation, onDeleteLocation, draftingLocId, draftingAllLocs, onPullFromScript, scriptHasLocs, onScout, onAssignStyles, assigningStyles, onSetStyleRefs, onSetScenePreset, onAddStyleRefImages, onRemoveStyleRefImage, onDraftStaging, draftingStageId,
  shots, beatsMap, onUpdateShot, onAddShot, onDeleteShot, onDraftSceneShots, draftingSceneShots, onDraftAllShots, draftingAllShots, onDirectStoryboard, onDirectScene, onColorist, onShoot, onCast, onPropsMaster,
  lookbook, lookbookNote, onUpdateLookbook, onAddLookbook, onDeleteLookbook, onSetLookbookNote, onResearch, onClearLookbook,
  staleTabs, onApplyLookbook }){
  const _stale = staleTabs || {};
  const PropSheets = window.PropSheets;
  const LocationSheets = window.LocationSheets;
  const LookbookView = window.LookbookView;

  // Pre-warm EVERY asset URL in the project in ONE batched round-trip the moment the Art Room
  // opens, so any tab (Characters, Props, Locations, Shot List) paints with no per-card DB +
  // signed-URL call. Then preload the BYTES of whichever tab is on screen so it's instant;
  // other tabs still load bytes on click, but with no round-trip first.
  const projId = project && project.id;
  React.useEffect(()=>{ if(typeof nbPrefetchAll==="function") nbPrefetchAll(); },[projId]);
  const tabPreloadIds = ()=>{
    if(artView==="lookbook") return (lookbook||[]).map(c=>c&&c.id).filter(Boolean);
    if(artView==="characters") return (characters||[]).flatMap(c=> (c&&c.id) ? [c.id, ...(c.states||[]).map(s=>c.id+":"+s.id)] : []);
    if(artView==="props") return (props||[]).map(p=>p&&p.id).filter(Boolean);
    if(artView==="locations") return (locations||[]).flatMap(l=> (l&&l.id) ? [l.id, ...(l.variants||[]).map(v=>l.id+"-"+v.id)] : []);
    if(artView==="shots") return (shots||[]).map(s=>s&&s.id).filter(Boolean);
    return [];
  };
  React.useEffect(()=>{
    if(typeof nbPreloadFor!=="function") return;
    const ids = tabPreloadIds();
    if(!ids.length) return;
    if(typeof nbPrefetchAll==="function") nbPrefetchAll().then(()=>nbPreloadFor(ids)); else nbPreloadFor(ids);
  },[artView, projId, (characters||[]).length, (props||[]).length, (locations||[]).length, (shots||[]).length, (lookbook||[]).length]);

  return React.createElement("div",{className:"artroom"},
    // fixed engine dock — Model / Aspect / Resolution, always reachable while
    // scrolling (desktop only; below 1100px the in-flow controls remain)
    React.createElement(NbDock,null),
    artView==="lookbook" && LookbookView
      ? React.createElement(LookbookView,{project,lookbook,note:lookbookNote,
          onUpdate:onUpdateLookbook,onAdd:onAddLookbook,onDelete:onDeleteLookbook,onSetNote:onSetLookbookNote,onResearch,onClear:onClearLookbook})
    : artView==="characters"
      ? React.createElement(CharacterSheets,{project,characters,scenes,props,shots,beatsMap,onUpdate:onUpdateChar,
          onDraft:onDraftVisuals,onDraftAll:onDraftAllVisuals,draftingId:draftingVisualId,draftingAll:draftingAllVisuals,draftingIds:draftingVisualIds,
          onSuggestStates,suggestingStatesId,onRemoveOwnedItem,onAdd:onAddCharacter,onDelete:onDeleteCharacter,onCast,
          lookbookStale:!!_stale.characters,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("characters")})
    : artView==="props" && PropSheets
      ? React.createElement(PropSheets,{project,props,characters,scenes,onUpdate:onUpdateProp,onDraft:onDraftProp,
          onDraftAll:onDraftAllProps,onAdd:onAddProp,onDelete:onDeleteProp,draftingId:draftingPropId,draftingAll:draftingAllProps,
          onSeedFromCast,castHasProps,onTagScenes,taggingScenes,onTagOne,taggingSceneId,onMergeProps,onPropsMaster,
          lookbookStale:!!_stale.props,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("props")})
      : artView==="locations" && LocationSheets
      ? React.createElement(LocationSheets,{project,locations,scenes,onUpdate:onUpdateLocation,onDraft:onDraftLocation,
          onDraftAll:onDraftAllLocs,onAdd:onAddLocation,onDelete:onDeleteLocation,draftingId:draftingLocId,draftingAll:draftingAllLocs,
          onPullFromScript,scriptHasLocs,onDraftStaging,draftingStageId,onScout,
          lookbookStale:!!_stale.locations,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("locations")})
      : artView==="stylebible" && window.StyleBibleView
      ? React.createElement(window.StyleBibleView,{project,scenes,onAssign:onAssignStyles,assigning:assigningStyles,onSetRefs:onSetStyleRefs,onSetScenePreset,onAddRefImages:onAddStyleRefImages,onRemoveRefImage:onRemoveStyleRefImage,onColorist,
          lookbookStale:!!_stale.stylebible,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("colorist")})
      : artView==="shots" && window.ShotList
      ? React.createElement(window.ShotList,{project,scenes,characters,props,locations,shots,beatsMap,
          onUpdateShot,onAddShot,onDeleteShot,onDraftSceneShots,draftingSceneShots,onDraftAllShots,draftingAllShots,onShoot,onDirectScene})
      : artView==="storyboard" && window.StoryboardView
      ? React.createElement(window.StoryboardView,{project,scenes,shots,characters,props,locations,beatsMap,setArtView,onDirect:onDirectStoryboard})
      : React.createElement(ArtComingSoon,{tab:artView}));
}
window.ArtRoom = ArtRoom;
