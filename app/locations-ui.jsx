/* locations-ui.jsx — The Art Room ▸ Locations tab (React).
   Mirrors PropSheets: derive-from-screenplay → draft fields → generate a multi-angle
   coverage plate → screenplay-derived INT/EXT side sheets → per-scene batch. Adds
   time-of-day / weather VARIANT plates and reads the Style Bible preset assigned to
   each location's scenes. */

function locSwatch(intExt){
  return /EXT/.test(intExt||"")
    ? "linear-gradient(135deg,#3f7a52,#1d3326)"      // exterior — green
    : "linear-gradient(135deg,#4a5a78,#222c3e)";     // interior — slate
}

function LocationSheet({ l, project, scenes, drafts, onUpdate, onDelete, onDraft, drafting, onView, batchActiveId, onBatchDone, onChipClick, onDraftStaging, draftingStage, sluglineUnits, onUpdateUnit, onRemoveUnit }){
  const d = locVisualDefaults(l);
  const scenePresets = (typeof locScenePresets==="function") ? locScenePresets(l, project) : [];
  const finalPrompt = combinedLocationPrompt(l, project, {});
  const drafted = locVisualsDrafted(l);
  const initials = (l.name||"?").replace(/^the\s+/i,"").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();

  // render style — same dropdown + "Surprise me" behaviour as the character cards
  const [styling, setStyling] = React.useState(false);
  // transient "saved · unlock" chip — visible ~4s after landing on the user's own locked style
  const [unlockVisible, setUnlockVisible] = React.useState(false);
  React.useEffect(()=>{
    if(window.turnIsUserStyle && window.turnIsUserStyle(l.renderStyleKey)){
      setUnlockVisible(true); const t=setTimeout(()=>setUnlockVisible(false),4000); return ()=>clearTimeout(t);
    }
    setUnlockVisible(false);
  },[l.renderStyleKey]);
  const locBible = ()=> [l.name&&("Name: "+l.name), l.architecture&&("Architecture: "+l.architecture),
    l.materials&&("Materials: "+l.materials), l.lighting&&("Lighting: "+l.lighting), l.significance&&("Significance: "+l.significance),
    (project&&project.genre)&&("Genre: "+project.genre)].filter(Boolean).join("\n");
  const LOC_TEXT = window.LOC_RENDER_TEXT || {};
  const rollSurprise = async ()=>{
    if(!(typeof aiSurpriseStyleText==="function" && typeof aiAvailable==="function" && aiAvailable())) return;
    setStyling(true);
    try{ const r = await aiSurpriseStyleText({ name:l.name, kind:"location", bible:locBible() }, project);
      if(r) onUpdate(l.id, { surpriseRender:r, renderStyle:r.style }); }catch(e){}
    setStyling(false);
  };
  const pickLocStyle = async (key)=>{
    if(key!=="surprise"){ onUpdate(l.id, { renderStyleKey:key, renderStyle:(typeof window.renderStyleText==="function" ? window.renderStyleText("loc", key) : (LOC_TEXT[key]||LOC_TEXT.photoreal)) }); return; }
    onUpdate(l.id, { renderStyleKey:"surprise" });
    if(l.surpriseRender && l.surpriseRender.style){ onUpdate(l.id, { renderStyle:l.surpriseRender.style }); return; }
    await rollSurprise();
  };
  // LOCK a surprise style → a reusable named style. Location surprise is a STRING, wrapped into
  // a minimal render block the shared registry resolves on every tab.
  const lockSurprise = async ()=>{
    if(!(l.surpriseRender && l.surpriseRender.style) || typeof window.turnLockRenderStyle!=="function") return;
    const block = { rendering:String(l.surpriseRender.style), rules:["no text, labels, watermarks, annotations, typography or captions"] };
    const key = await window.turnLockRenderStyle(l.surpriseRender.label, block);
    if(key){ onUpdate(l.id, { renderStyleKey:key, renderStyle:(typeof window.renderStyleText==="function"?window.renderStyleText("loc",key):l.surpriseRender.style) });
      if(typeof window.appToast==="function") window.appToast("Style locked — now reusable across Characters, Props & Locations"); }
  };
  const unlockCurrent = async ()=>{
    if(!(window.turnIsUserStyle && window.turnIsUserStyle(l.renderStyleKey))) return;
    const ok = window.appConfirm ? await window.appConfirm({ title:"Unlock this saved style?",
      body:"It's removed from your saved styles. Cards still using it fall back to Photoreal." }) : true;
    if(!ok) return; const k=l.renderStyleKey; window.turnUnlockRenderStyle(k);
    onUpdate(l.id,{ renderStyleKey:"photoreal", renderStyle:(typeof window.renderStyleText==="function"?window.renderStyleText("loc","photoreal"):"") });
  };

  // time-of-day is script-derived (no manual control): keep it in sync with the
  // current derivation. Reads ONLY the scenes' slugline time tags (not prose
  // summaries), keeps every distinct real time, and CLEARS values when the script
  // states no real time (Continuous / Loading Program → "time unset").
  React.useEffect(()=>{
    if(typeof deriveLocationTimes!=="function") return;
    const next = deriveLocationTimes(l, scenes);
    const cur = l.times || [];
    const same = next.length===cur.length && next.every((t,i)=>t===cur[i]);
    if(!same) onUpdate(l.id, { times: next });
  },[l.id, scenes]);

  React.useEffect(()=>{
    if(typeof deriveLocationCoverageSheets!=="function") return;
    const C = window.turnContinuity || {};
    // units passed EXPLICITLY (not read off window.turnContinuity) and in the deps,
    // so the unit-precedence skip rule always recalculates when units change —
    // a side sheet must never slip in before the latest units are visible.
    const derived = deriveLocationCoverageSheets(l, scenes, drafts||C.drafts||{}, undefined, sluglineUnits);
    const cur = l.coverageSheets || [];
    const curById = {}; cur.forEach(v=>{ if(v&&v.id) curById[v.id]=v; });
    const merged = derived.map(v=>({ ...(curById[v.id]||{}), ...v }));
    const same = JSON.stringify(cur)===JSON.stringify(merged);
    if(!same) onUpdate(l.id, { coverageSheets: merged });
  },[l.id, l.intExt, (l.scenes||[]).join(","), scenes, drafts, sluglineUnits]);

  const [masterRefs, setMasterRefs] = React.useState([]);
  const [masterRefOff, setMasterRefOff] = React.useState([]);
  const buildMasterRefs = ()=>{
    const out = [];
    const C = window.turnContinuity || {};
    const list = (Array.isArray(l.scenes) && l.scenes.length)
      ? scenesInStoryOrder((scenes||C.scenes||[]).filter(s=>l.scenes.indexOf(s.id)>=0))
      : scenesInStoryOrder(scenes||C.scenes);
    for(const sc of list){
      const imgs = (typeof locationScreenplayReferenceImages==="function")
        ? locationScreenplayReferenceImages(l, { name:l.name, sceneNos:[sc.no] }, scenes||C.scenes||[], drafts||C.drafts||{})
        : [];
      imgs.forEach((url,i)=>{ if(out.length<6) out.push({ url, kind:"script", ready:true, required:false,
        refId:"script-main-"+l.id+"-"+(sc.no||sc.id)+"-"+i,
        label:"Scene "+String(sc.no||"?").padStart(2,"0")+" p"+(i+1),
        note:"full-scene screenplay page "+(i+1)+" for Scene "+(sc.no||"?")+" — use this to design the location's 2x2 geography from what is actually filmed; do not render page text or borders" }); });
      if(out.length>=6) break;
    }
    return out;
  };
  const masterScriptSig = JSON.stringify((l.scenes||[]).map(sid=>(((drafts||{})[sid]||{}).blocks||[])));
  const masterRefsKey = [l.id, (l.scenes||[]).join(","), scenes&&scenes.length, masterScriptSig].join("|");
  React.useEffect(()=>{ setMasterRefs(buildMasterRefs()); },[masterRefsKey]);
  const toggleMasterRef = (rid)=> setMasterRefOff(off=> off.indexOf(rid)>=0 ? off.filter(x=>x!==rid) : [...off, rid]);

  const gen = useImageGen({
    id: l.id, slotId: "locref-"+l.id,
    entity: l,
    /* Clear cascades to this location's time-of-day variant plates so they aren't
       orphaned in storage. */
    relatedClearIds: ()=> [...(l.variants||[]), ...(l.coverageSheets||[])].map(v=> l.id+"-"+v.id),
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildLocationFromPhotoPrompt(l, project),
    buildSimple: ()=> buildSimpleLocationPrompt(l),
    attachments: async ()=> buildMasterRefs()
      .filter(r=>r.url && masterRefOff.indexOf(r.refId)<0)
      .map(r=>({ url:r.url, kind:"script", refId:r.refId, note:r.note })),
    attachmentsText: (refs)=> refs && refs.length
      ? "REFERENCE IMAGES are attached: "+refs.map((r,i)=>"Image "+(i+1)+" = "+r.note).join("; ")
        +". Read ALL pages together as evidence for the permanent geography of ONE location. "
        +"They are NOT a quadrant map: do not make one panel per page or per scene. The 2x2 is four different camera views of the same coherent space, following the prompt's panel plan. "
        +"Aggregate architecture, fixtures, sightlines and action affordances only. Do NOT bake in scene-specific time of day, weather or progression (for example NIGHT/rain versus DAWN); those belong to each slugline unit's appearance plate. "
        +"Never copy screenplay typography, page borders, text, captions or layout."
      : "",
    /* NO set-dressing refs at generation — the clean plate anchors the look;
       fixtures are painted in afterwards via the Edit panel's Set-dressing buttons */
    buildEdit: (instr)=>
      "Edit this location reference plate for "+(l.name||"the place")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else \u2014 the SAME architecture, proportions, materials and light "
      +"across all panels. Keep the same multi-angle grid of the same empty space. "
      +"Do not redesign or re-imagine the location.",
  });
  const promptStale = !!(gen.genUrl && gen.genMeta && gen.genMeta.prompt && gen.genMeta.prompt!==finalPrompt);
  const [propDependencyTick,setPropDependencyTick]=React.useState(0);
  React.useEffect(()=>{ const onDone=e=>{ const id=e&&e.detail&&e.detail.id;
      if(id&&((gen.genMeta&&gen.genMeta.propDependencies)||[]).some(r=>r&&r.propId===id)) setPropDependencyTick(t=>t+1); };
    window.addEventListener("nb-gen-done",onDone); return ()=>window.removeEventListener("nb-gen-done",onDone);
  },[gen.genMeta&&gen.genMeta.version]);
  const changedPropDependencies=(typeof propReferenceDependenciesChanged==="function")
    ? propReferenceDependenciesChanged((gen.genMeta&&gen.genMeta.propDependencies)||[],window.turnContinuity||{}) : [];
  const propReferencesStale=changedPropDependencies.length>0;

  // this location's set-dressing props — offered as one-click edit instructions in
  // the plate's Edit panel.
  const dressProps = (typeof locDressingProps==="function") ? locDressingProps(l) : [];
  const sheetRefOf = (p)=> async ()=>{ let u = (typeof nbGetImage==="function") ? nbGetImage(p.id) : "";
    if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(p.id); }catch(e){} }
    return u||""; };

  // batch generation: parent activates this card by id; generate then report done.
  // REMOUNT-SAFE (see CharacterSheet): seed batchStarted from the in-flight registry so
  // a card remounting mid-generation doesn't fire a second generate on completion.
  const _lslot = "locref-"+l.id;
  const batchStarted = React.useRef(!!(window.__nbGenInflight && window.__nbGenInflight[_lslot]));
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===l.id;
    const inflight = !!(window.__nbGenInflight && window.__nbGenInflight[_lslot]);
    if(!mine){ batchStarted.current=inflight; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening && !inflight){ batchStarted.current=true; wasGening.current=false; gen.generate(); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(l.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, l.id]);

  // ---- per-PANEL edit (like the Storyboard's "Edit a panel") -----------------
  // A plate is a 2×2 grid of views of ONE space. Edit ONE quadrant via a position-
  // scoped instruction on the whole image (image-edit off the current plate, so it
  // works for generated AND uploaded plates alike). Position-scoped, so it's robust
  // even for legacy 6-panel plates.
  const LOC_PANELS = [
    { grid:"TOP-LEFT",     label:"Top-left",     hint:"wide establishing" },
    { grid:"TOP-RIGHT",    label:"Top-right",    hint:"high overview" },
    { grid:"BOTTOM-LEFT",  label:"Bottom-left",  hint:"close-up" },
    { grid:"BOTTOM-RIGHT", label:"Bottom-right", hint:"close-up" },
  ];
  const [panelEdit, setPanelEdit] = React.useState(null);   // { idx:int|null, text:string } | null
  const applyPanelEdit = ()=>{
    if(!panelEdit || panelEdit.idx==null || !panelEdit.text.trim() || gen.gening) return;
    const p = LOC_PANELS[panelEdit.idx];
    const instr = "In the "+p.grid+" panel of the multi-view grid ONLY (the "+p.hint+" view), "
      + panelEdit.text.trim() + ". Leave the OTHER panels of the grid EXACTLY as they are — same framing and content.";
    gen.generate({ editInstruction: instr });
    setPanelEdit(null);
  };

  const sceneById = React.useMemo(()=>{ const m={}; (scenes||[]).forEach(s=>{ m[s.id]=s; }); return m; },[scenes]);
  const locScenes = scenesInStoryOrder((l.scenes||[]).map(id=>sceneById[id]).filter(Boolean));
  const coverageSheets = (l.coverageSheets || []).slice().sort((a,b)=>(Number(a.order||0)-Number(b.order||0)) || String(a.name||"").localeCompare(String(b.name||"")));
  // Units arrive in first screenplay-appearance order from deriveSluglineUnits.
  // Preserve that order here; only move preserved, no-longer-scripted orphans last.
  const units = (sluglineUnits||[]).filter(u=>u && u.locationKey===String(l.key||""))
    .sort((a,b)=> (a.orphan?1:0)-(b.orphan?1:0));

  // time-of-day / weather variants
  const addVariant = ()=>{
    const used = (l.variants||[]).map(v=>v.time);
    const suggest = (l.times||[]).find(t=>used.indexOf(t)<0) || "Night";
    onUpdate(l.id,{ variants:[...(l.variants||[]), { id:"v"+Date.now().toString(36), time:suggest }] });
  };
  const updateVariant = (vid,patch)=> onUpdate(l.id,{ variants:(l.variants||[]).map(v=>v.id===vid?{...v,...patch}:v) });
  const removeVariant = (vid)=> onUpdate(l.id,{ variants:(l.variants||[]).filter(v=>v.id!==vid) });

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===l.id?" batch-on":""),"data-location-card":l.id},
    React.createElement(SheetFrame,{ gen, slotId:"locref-"+l.id, name:l.name, avatarColor:locSwatch(l.intExt),
      initials, drafted, drafting, onDraft:()=>onDraft(l), entity:l, onView,
      slotPlaceholder:"Drop a photo of the place", noun:"location plate",
      // The empty plate is also the finished-image importer, so the separate
      // "Upload a finished location plate" button is intentionally omitted.
      dropToImport:true,
      // one-click edit instructions: place each set-dressing fixture INTO the plate.
      // Chip label = prompt-only (built from the prop's spec); the clip button ALSO
      // attaches the fixture's generated sheet (if any) as an edit reference image.
      editSuggestions: [
        ...dressProps.map(p=>({ label:p.name||"fixture", refId:p.id,
          text:(typeof locDressingEditText==="function") ? locDressingEditText(p) : ("Add "+(p.name||"the fixture")+" into the space."),
          title:"Insert the ready edit instruction for this fixture — built from its prop card's spec (form, material, size). Apply edit paints it into the plate, matching the plate's look. Use the clip button beside it to also attach the fixture's sheet as a reference.",
          getRef: sheetRefOf(p) })),
      ],
      specGate:{ ready:(drafted || !l.manual), hint:"Draft the design spec first \u2014 architecture, materials & light are what the plate is built from." },
      // edit ONE view of the plate (works on generated or uploaded plates)
      menuExtra: gen.genUrl ? [{ label: panelEdit?"Close panel edit":"Edit a panel\u2026", placement:"beforeEdit",
        title:"Change just ONE view of the multi-angle plate, leaving the others untouched",
        onClick:()=> setPanelEdit(pe=> pe ? null : { idx:null, text:"" }) }] : null,
      referenceControls: masterRefs.length>0 && React.createElement(CoverageReferenceStrip,{ refs:masterRefs, excludedIds:masterRefOff, onToggle:toggleMasterRef, onView }),
      onDelete:()=>onDelete(l.id), deleteLabel:"Delete location" }),
    panelEdit && gen.genUrl && React.createElement("div",{className:"sheet-edit-panel loc-panel-edit"},
      React.createElement("div",{className:"loc-panel-pick"},
        LOC_PANELS.map((p,i)=>React.createElement("button",{key:i,
          className:"loc-panel-btn"+(panelEdit.idx===i?" on":""),title:p.label+" \u2014 "+p.hint,
          onClick:()=>setPanelEdit(pe=>({ ...pe, idx:i }))},
          React.createElement("span",{className:"loc-panel-btn-pos"},p.label),
          React.createElement("span",{className:"loc-panel-btn-hint"},p.hint)))),
      React.createElement("input",{className:"sheet-edit-input",type:"text",autoFocus:true,
        placeholder: panelEdit.idx==null ? "Pick a panel above, then describe the change\u2026"
          : ("Change the "+LOC_PANELS[panelEdit.idx].label.toLowerCase()+" view only\u2026"),
        value:panelEdit.text, onChange:e=>setPanelEdit(pe=>({ ...pe, text:e.target.value })),
        onKeyDown:e=>{ if(e.key==="Enter") applyPanelEdit(); if(e.key==="Escape") setPanelEdit(null); }}),
      React.createElement("div",{className:"sheet-edit-acts"},
        React.createElement("button",{className:"sheet-edit-apply",
          disabled:panelEdit.idx==null||!panelEdit.text.trim()||gen.gening,onClick:applyPanelEdit},
          gen.gening?"Editing\u2026":"Apply panel edit"),
        React.createElement("button",{className:"sheet-edit-cancel",onClick:()=>setPanelEdit(null)},"Cancel"))),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"sheet-name loc-name-row",title:l.name||""},
            React.createElement("span",{className:"loc-intext-badge "+(/EXT/.test(l.intExt||"")?"ext":"int"),
              title:(l.intExt||"INT")+" location"},
              l.intExt||"INT"),
            // resolved WORLD SCALE badge — makes the Auto derivation legible per card
            // (hidden at plain human scale; tooltip says what set it)
            (typeof locationScaleClass==="function") && (()=>{
              const cls = locationScaleClass(l, project||{});
              if(cls==="A") return null;
              const M = ({B:["\ud83d\udc01","Critter world"],C:["\ud83d\uddff","Giant world"],D:["\ud83d\udd2c","Microscopic world"]})[cls]||["",("Class "+cls)];
              return React.createElement("span",{className:"loc-scale-badge",
                title:M[1]+" (Class "+cls+") \u2014 derived automatically from the characters who drive this place's scenes. Plates here render at this scale."},
                M[0]+" "+cls); })(),
            React.createElement(EditText,{value:l.name,placeholder:"Location name\u2026",onCommit:val=>onUpdate(l.id,{name:val})})),
          null),
        // one flex row (like Props' head actions) \u2014 otherwise .sheet-head's column
        // layout stacks each button on its own full-width line
        React.createElement("div",{className:"sheet-head-actions"},
          React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(l)},
            React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"),
          window.QaCheckButton && React.createElement(window.QaCheckButton,{ gen, name:l.name, noun:"location plate",
            specFields:()=>({ architecture:(l.architecture||""), materials:(l.materials||""), lighting:(l.lighting||"") }),
            onApplySpec:(patch)=>onUpdate(l.id, patch) }))),

      (promptStale||propReferencesStale) && React.createElement("div",{className:"prompt-drift-banner",role:"status"},
        React.createElement(Icon.alert,{s:14}),
        React.createElement("span",null,
          React.createElement("b",null,"Reference out of date"),
          propReferencesStale
            ? (" · "+changedPropDependencies.map(r=>r.name||"A set-dressing prop").join(", ")+" changed after being used in this plate. The approved plate stays pinned until you intentionally update it.")
            : " · The location spec changed after this plate was generated. Use Regenerate location plate above to update it.")),

      React.createElement("div",{className:"char-style-row"},
        React.createElement("span",{className:"char-style-lab"},"Render style"),
        React.createElement("div",{className:"char-style-pick"},
          React.createElement(window.RenderStylePicker,{value:l.renderStyleKey||(window.turnDefaultRenderStyleKey?window.turnDefaultRenderStyleKey():"photoreal"),disabled:styling,onPick:pickLocStyle}),
          (window.turnCanLockStyles && window.turnCanLockStyles()) && React.createElement("span",{className:"char-style-count"+(((window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)>=(window.turnGlobalStyleCap||40))?" full":""),title:"Global render styles ("+(window.turnGlobalStyleCap||40)+" max, admin-managed). You can save up to "+(window.turnPersonalStyleCap||10)+" personal render styles. Manage via Styles in the top bar."}, (window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)+"/"+(window.turnGlobalStyleCap||40))),
        styling && React.createElement("span",{className:"char-style-busy"},React.createElement("span",{className:"ns-spin"}),"Inventing\u2026"),
        (!styling && l.renderStyleKey==="surprise" && l.surpriseRender && l.surpriseRender.label) &&
          React.createElement("span",{className:"char-style-name",title:"Re-roll a new surprise style",onClick:rollSurprise},
            l.surpriseRender.label," \u21bb"),
        (!styling && l.renderStyleKey==="surprise" && l.surpriseRender && l.surpriseRender.style && window.turnCanLockStyles && window.turnCanLockStyles()) &&
          React.createElement("button",{className:"char-style-lock",title:"Lock this style \u2014 keep it and reuse it across Characters, Props & Locations",onClick:lockSurprise},"\ud83d\udd12 Lock this style"),
        (!styling && unlockVisible && window.turnIsUserStyle && window.turnIsUserStyle(l.renderStyleKey)) &&
          React.createElement("span",{className:"char-style-name char-style-locked",title:"Your saved style \u2014 reusable everywhere. Click to unlock.",onClick:unlockCurrent},"\ud83d\udd12 saved \u00b7 unlock")),

      React.createElement("div",{className:"prop-scenes location-scenes"},
        React.createElement("span",{className:"prop-scenes-lab"},"SCENES"),
        React.createElement(SceneChipPager,{ none:"No scenes reference this place",
          items: locScenes.map(s=>({ key:s.id, label:String(s.no).padStart(2,"0"), className:"prop-scene-chip",
            title:s.title||("Scene "+s.no), onClick:()=>onChipClick&&onChipClick(s.id) })) })),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"Details not drafted yet \u2014 click ",
          React.createElement("b",null,"Draft details")," to design the space's architecture & light.")),

      React.createElement(CardFold,{label:"The space",defaultOpen:(!drafted && !!l.manual)},
        React.createElement("div",{className:"sheet-field"},
          React.createElement("div",{className:"obj-lab"},"INT / EXT"),
          React.createElement("select",{className:"prop-select",value:l.intExt||"INT",
            onChange:e=>onUpdate(l.id,{intExt:e.target.value})},
            ["INT","EXT","INT/EXT"].map(o=>React.createElement("option",{key:o,value:o},o)))),
        React.createElement(SheetField,{label:"Architecture & layout",value:l.architecture,multiline:true,
          placeholder:"The space's layout, scale, structure and defining built features\u2026",onCommit:val=>onUpdate(l.id,{architecture:val})}),
        React.createElement(SheetField,{label:"Materials & palette",value:l.materials,multiline:true,
          placeholder:"Surfaces, colours, textures, wear, set dressing\u2026",onCommit:val=>onUpdate(l.id,{materials:val})}),
        React.createElement(SheetField,{label:"Lighting & atmosphere",value:l.lighting,multiline:true,
          placeholder:"Light sources, quality, colour, mood \u2014 and how it shifts by time of day\u2026",onCommit:val=>onUpdate(l.id,{lighting:val})})),

      React.createElement(CardFold,{label:"Significance",defaultOpen:false},
        React.createElement(SheetField,{label:"What this place means in the story",value:l.significance,multiline:true,
          placeholder:"Its dramatic role \u2014 what happens here, what it represents\u2026",onCommit:val=>onUpdate(l.id,{significance:val})})),

      React.createElement(CardFold,{label:"Staging \u2014 Depth Grid",defaultOpen:false},
        React.createElement(StagingGrid,{l,onUpdate,onDraftStaging,draftingStage})),

      React.createElement(CardFold,{label:"Slugline units",defaultOpen:units.length>0},
        React.createElement("div",{className:"loc-variants"},
          units.length
            ? units.map(u=>React.createElement(SluglineUnitCard,{key:u.key, l, u, project, scenes, drafts,
                parentGenUrl:gen.genUrl, onUpdateUnit, onRemoveUnit, onView}))
            : React.createElement("div",{className:"loc-variants-empty"},"No slugline units derive for this place from the current screenplay."))),

      React.createElement(CardFold,{label:"Screenplay coverage sheets",defaultOpen:coverageSheets.length>0},
        React.createElement("div",{className:"loc-variants"},
          coverageSheets.length
            ? coverageSheets.map((v,i)=>React.createElement(LocationCoverageSheet,{key:v.id, l, v, project, scenes, drafts, previousSheets:coverageSheets.slice(0,i), parentGenUrl:gen.genUrl, onView}))
            : React.createElement("div",{className:"loc-variants-empty"},"No separate INT / EXT sheet is needed from the current screenplay text."))),

      React.createElement(CardFold,{label:"Time-of-day variants",defaultOpen:false},
        React.createElement("div",{className:"loc-variants"},
          (l.variants||[]).length
            ? (l.variants||[]).map(v=>React.createElement(LocationVariant,{key:v.id, l, v, project,
                onTime:(t)=>updateVariant(v.id,{time:t}), onRemove:()=>removeVariant(v.id), onView}))
            : React.createElement("div",{className:"loc-variants-empty"},"No variants yet \u2014 add a Night / Day / weather version of this plate."),
          React.createElement("button",{className:"art-draftall ghost loc-variant-add",onClick:addVariant},
            React.createElement(Icon.plus,{s:13}),"Add variant"))),

      React.createElement(CardFold,{label:"Look dev",defaultOpen:false},
        scenePresets.length ? React.createElement("div",{className:"loc-style-note"},
          React.createElement(Icon.layers,{s:12}),
          React.createElement("span",null,"Scenes here use ",
            React.createElement("b",null,scenePresets.map(p=>p.name).join(", ")),
            " in the Styles tab. This reference plate is rendered grade-neutral on purpose \u2014 that scene grade is applied per shot, not baked into the plate.")) : null,
        React.createElement(SheetField,{label:"Render style \u2014 edit freely",value:l.renderStyle||d.renderStyle,multiline:true,
          placeholder:"photoreal architectural cinematography, wide lens, natural light\u2026",onCommit:val=>onUpdate(l.id,{renderStyle:val})})),

      React.createElement(CardFold,{label:"Final prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:(gen.genUrl && gen.genMeta && gen.genMeta.prompt)
            ? "Final prompt \u2014 generated the CURRENT plate" : "Final prompt \u2014 sent to the image model",
          text:(gen.genUrl && gen.genMeta && gen.genMeta.prompt) || finalPrompt}),
        promptStale &&
          React.createElement("div",{className:"prompt-drift-note"},
            "The spec has changed since this plate was generated \u2014 Regenerate to bring it back in step."),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:l.negativePrompt||d.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(l.id,{negativePrompt:val})}))));
}

/* the 3×3 depth-grid staging editor — a top-down map of the space. Each cell is
   an EditText (empty = open space). Rows: Background / Midground / Foreground;
   cols: Left / Center / Right. Plus Floor, Scale Class and Camera/Lens. */
function StageCell({ label, sub, role, value, placeholder, onCommit, accent, wide }){
  const filled = !!(value||"").trim();
  return React.createElement("div",{className:"stage-cell"+(filled?" filled":"")+(accent?" "+accent:"")+(wide?" wide":"")},
    React.createElement("div",{className:"stage-cell-lab"},
      React.createElement("span",{className:"stage-cell-zone"},label,
        sub && React.createElement("span",{className:"stage-cell-sub"},sub)),
      role && React.createElement("span",{className:"stage-cell-role"},role)),
    React.createElement(EditText,{value:value||"",multiline:true,placeholder:placeholder||"open space\u2026",onCommit}));
}
function StagingGrid({ l, onUpdate, onDraftStaging, draftingStage }){
  const s = (typeof stagingOf==="function") ? stagingOf(l) : (l.staging||{bg:{},mid:{},fg:{}});
  const set = (patch)=>{
    const next = { scaleClass:s.scaleClass, lens:s.lens, floor:s.floor,
      bg:{...s.bg}, mid:{...s.mid}, fg:{...s.fg} };
    // patch is a path like {plane:'bg',col:'left',val:'...'} or {key:'scaleClass',val}
    if(patch.key){ next[patch.key] = patch.val; }
    else { next[patch.plane][patch.col] = patch.val; }
    onUpdate(l.id,{ staging: next });
  };
  return React.createElement("div",{className:"stage-wrap"},
    React.createElement("div",{className:"stage-toolbar"},
      React.createElement("div",{className:"stage-meta-fields"},
        React.createElement("label",{className:"stage-meta-field"},
          React.createElement("span",{className:"stage-meta-lab"},"Scale class"),
          React.createElement(EditText,{value:s.scaleClass||"",placeholder:"Human scale / Gigantism\u2026",onCommit:val=>set({key:"scaleClass",val})})),
        React.createElement("label",{className:"stage-meta-field"},
          React.createElement("span",{className:"stage-meta-lab"},"Camera / lens"),
          React.createElement(EditText,{value:s.lens||"",placeholder:"35mm wide / 100mm macro\u2026",onCommit:val=>set({key:"lens",val})}))),
      onDraftStaging && React.createElement("button",{className:"art-draftall",disabled:draftingStage,onClick:()=>onDraftStaging(l),
        title:"Let AI stage this location's depth grid from the script"},
        React.createElement(Icon.sparkles,{s:13}), draftingStage?"Staging\u2026":"Draft staging")),
    React.createElement("div",{className:"stage-legend"},
      React.createElement(Icon.layers?Icon.layers:Icon.eye,{s:12}),
      React.createElement("span",null,"Top-down view of the frame \u2014 rows are depth (background \u2192 foreground), columns are screen position (left \u2192 right). Leave a cell blank for open space.")),
    React.createElement("div",{className:"stage-grid"},
      // BACKGROUND row (farthest from camera)
      React.createElement(StageCell,{label:"Background left",sub:"L3",value:s.bg.left,onCommit:val=>set({plane:"bg",col:"left",val})}),
      React.createElement(StageCell,{label:"Background center",role:"Wall A",accent:"wallA",value:s.bg.center,
        placeholder:"primary landmark\u2026",onCommit:val=>set({plane:"bg",col:"center",val})}),
      React.createElement(StageCell,{label:"Background right",sub:"R3",value:s.bg.right,onCommit:val=>set({plane:"bg",col:"right",val})}),
      // MIDGROUND row (subject plane)
      React.createElement(StageCell,{label:"Midground left",role:"Wall B",accent:"wallB",value:s.mid.left,
        placeholder:"primary framing element\u2026",onCommit:val=>set({plane:"mid",col:"left",val})}),
      React.createElement(StageCell,{label:"Midground center",role:"Subject",accent:"subject",value:s.mid.center,
        placeholder:"where the character stands \u2014 usually left empty",onCommit:val=>set({plane:"mid",col:"center",val})}),
      React.createElement(StageCell,{label:"Midground right",role:"Wall C",accent:"wallC",value:s.mid.right,
        placeholder:"secondary framing element\u2026",onCommit:val=>set({plane:"mid",col:"right",val})}),
      // FOREGROUND row (closest to camera)
      React.createElement(StageCell,{label:"Foreground left",sub:"L1",value:s.fg.left,placeholder:"foreground veil\u2026",onCommit:val=>set({plane:"fg",col:"left",val})}),
      React.createElement("div",{className:"stage-cell camera"},
        React.createElement("div",{className:"stage-cell-lab"},
          React.createElement("span",{className:"stage-cell-zone"},"Foreground center"),
          React.createElement("span",{className:"stage-cell-role"},"camera")),
        React.createElement("div",{className:"stage-camera-mark"},React.createElement(Icon.camera?Icon.camera:Icon.eye,{s:18}),
          React.createElement("span",null,s.lens||"viewer / lens"))),
      React.createElement(StageCell,{label:"Foreground right",sub:"R1",value:s.fg.right,placeholder:"foreground veil\u2026",onCommit:val=>set({plane:"fg",col:"right",val})})),
    // FLOOR strip
    React.createElement(StageCell,{label:"Floor \u2014 ground plane",value:s.floor,wide:true,
      placeholder:"surface texture underfoot\u2026",onCommit:val=>set({key:"floor",val})}));
}

/* screenplay-derived INT/EXT side plates. These are not time/weather variants:
   they are extra empty-set anchors for subspaces the screenplay actually films
   inside a broader scene location (e.g. EXT yard + INT booth). */
function LocationCoverageSheet({ l, v, project, scenes, drafts, previousSheets, parentGenUrl, onView }){
  const id = l.id+"-"+v.id;
  const sceneNos = Array.isArray(v.sceneNos) ? v.sceneNos.filter(n=>n!=null) : [];
  const sourceLabel = sceneNos.length
    ? ((sceneNos.length>1 ? "Scenes " : "Scene ")+sceneNos.map(n=>String(n)).join(", "))
    : "Scene";
  const [refPreview, setRefPreview] = React.useState([]);
  const [coverageRefOff, setCoverageRefOff] = React.useState([]);
  const _C0 = window.turnContinuity || {};
  const _sheetScene = (typeof locationSceneForCoverageSheet==="function") ? locationSceneForCoverageSheet(l, v, scenes||_C0.scenes||[]) : null;
  const _sheetDraft = _sheetScene && (drafts||_C0.drafts||{})[_sheetScene.id];
  const _scriptSig = JSON.stringify((_sheetDraft&&_sheetDraft.blocks)||[]);
  const refsKey = [l.id, id, v.id, v.order, v.scriptExcerpt, parentGenUrl, _scriptSig, (previousSheets||[]).map(p=>p&&p.id).join(","), scenes&&scenes.length].join("|");
  const buildCoverageRefs = async ()=>{
    const out = [];
    const C = window.turnContinuity || {};
    const scriptImgs = (typeof locationScreenplayReferenceImages==="function")
      ? locationScreenplayReferenceImages(l, v, scenes||C.scenes||[], drafts||C.drafts||{})
      : ((typeof locationScreenplayReferenceImage==="function") ? [locationScreenplayReferenceImage(l, v, scenes||C.scenes||[], drafts||C.drafts||{})].filter(Boolean) : []);
    scriptImgs.forEach((scriptImg, i)=> out.push({ url:scriptImg, kind:"script", refId:"script-"+id+"-"+i, required:false, ready:true,
      label:"Screenplay p"+(i+1), note:"full-scene screenplay page "+(i+1)+" for "+(v.name||l.name||"this coverage sheet")+" — use it to infer what the script implies, but do not render any text from it" }));
    const grab = async (rid)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(rid):"";
      if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(rid); }catch(e){} } return u||""; };
    const parent = parentGenUrl || await grab(l.id);
    out.push({ url:parent, kind:"location", refId:l.id, required:true, ready:!!parent,
      label:(l.name||"Parent location"), note:(l.name||"parent location")+" master plate — preserve the same exterior/interior world, materials, scale and light" });
    for(const p of (previousSheets||[])){
      if(!p || !p.id) continue;
      const rid = l.id+"-"+p.id;
      const u = await grab(rid);
      out.push({ url:u, kind:"location previous", refId:rid, required:true, ready:!!u,
        label:p.name||"Previous coverage", note:(p.name||"previous coverage sheet")+" — earlier screenplay coverage; keep geometry and thresholds consistent" });
    }
    return out;
  };
  React.useEffect(()=>{
    let alive = true;
    (async ()=>{
      const refs = await buildCoverageRefs();
      if(!alive) return;
      setRefPreview(refs);
    })();
    const onDone = (e)=>{
      const rid = e && e.detail && e.detail.id;
      if(rid===l.id || rid===id || (previousSheets||[]).some(p=>rid===l.id+"-"+p.id)){
        buildCoverageRefs().then(refs=>{ if(alive) setRefPreview(refs); });
      }
    };
    window.addEventListener("nb-gen-done", onDone);
    return ()=>{ alive=false; window.removeEventListener("nb-gen-done", onDone); };
  },[refsKey]);
  const missingRequiredRefs = refPreview.filter(r=>r.required && !r.ready);
  const canGenerateCoverage = refPreview.length>0 && missingRequiredRefs.length===0;
  const missingPrev = missingRequiredRefs.some(r=>String(r.refId||"").indexOf(l.id+"-")===0);
  const toggleCoverageRef = (rid)=> setCoverageRefOff(off=> off.indexOf(rid)>=0 ? off.filter(x=>x!==rid) : [...off, rid]);
  const collectCoverageRefs = async ()=>{
    return (await buildCoverageRefs())
      .filter(r=>r.ready && r.url && coverageRefOff.indexOf(r.refId)<0)
      .map(r=>({ url:r.url, kind:r.kind==="script"?"script":"location", refId:r.refId, note:r.note }));
  };
  const gen = useImageGen({
    id, slotId: "loccov-"+id,
    entity: l,
    buildFinal: ()=> buildLocationCoveragePrompt(l, v, project),
    buildSimple: ()=> buildSimpleLocationPrompt(l),
    beforeGenerate: async ()=>{
      const refs = await buildCoverageRefs();
      const missing = refs.filter(r=>r.required && !r.ready);
      const ok = missing.length===0;
      if(!ok && typeof window.appToast==="function"){
        const prev = missing.some(r=>String(r.refId||"").indexOf(l.id+"-")===0);
        window.appToast(prev
          ? "Generate the earlier coverage sheet first — this one depends on it."
          : "Generate the parent location plate first — this coverage sheet needs it as a reference.");
      }
      return ok;
    },
    attachments: collectCoverageRefs,
    attachmentsText: (refs)=> refs && refs.length
      ? "REFERENCE IMAGES are attached in this order: "+refs.map((r,i)=>"Image "+(i+1)+" = "+r.note).join("; ")+". The screenplay page snapshots are context only: read the scene geography from them, but never copy their typography, page border, text, captions or layout into the location sheet."
      : "",
    buildEdit: (instr)=> "Edit this "+(v.role||"INT")+" coverage sheet for "+(v.name||l.name||"the location")+". Apply ONLY: "+instr+". Keep it consistent with the parent location's architecture, materials and light.",
  });
  const viewerEntity = {
    ...l,
    id,
    name:(v.name||l.name||"Location")+" · "+(v.role||"INT")
  };
  return React.createElement("div",{className:"loc-variant loc-coverage-sheet"},
    React.createElement("div",{className:"loc-variant-head"},
      React.createElement("div",{className:"loc-coverage-title"},
        React.createElement("span",{className:"loc-intext-badge "+(/EXT/.test(v.role||"")?"ext":"int")},v.role||"INT"),
        React.createElement("b",null,v.name||"Coverage sheet")),
      React.createElement("span",{className:"loc-coverage-source",title:v.summary||""},sourceLabel)),
    v.summary && React.createElement("div",{className:"loc-variants-empty loc-coverage-summary"},v.summary),
    React.createElement(SheetFrame,{ gen, slotId:"loccov-"+id, name:(v.name||l.name||"Location")+" \u00b7 "+(v.role||"INT"),
      avatarColor:locSwatch(v.role), initials:(v.role||"?").slice(0,2).toUpperCase(), drafted:true, drafting:false,
      entity:viewerEntity, onView, slotPlaceholder:"Drop a finished side plate", noun:"coverage sheet", compact:true,
      // match the unit-plate card: the empty slot itself imports on drop/click, which also
      // drops the redundant "Upload a finished coverage sheet" button below the generate CTA
      dropToImport:true,
      referenceControls: React.createElement(CoverageReferenceStrip,{ refs:refPreview, excludedIds:coverageRefOff, onToggle:toggleCoverageRef, onView }),
      generateDisabled:!canGenerateCoverage,
      generateDisabledLabel: missingPrev ? "Generate earlier coverage first" : "Generate parent plate first",
      generateDisabledTitle: missingPrev
        ? "This coverage sheet depends on an earlier coverage sheet. Generate that sheet first so the geometry and sightlines can carry forward."
        : "This coverage sheet needs the parent location plate as a visual reference before it can generate." }),
    gen.genUrl && window.QaCheckButton && React.createElement("div",{className:"card-qa-row"},
      React.createElement(window.QaCheckButton,{ gen, name:(v.name||l.name||"")+" \u00b7 "+(v.role||"INT"), noun:"location coverage sheet" })));
}

function CoverageReferenceStrip({ refs, excludedIds, onToggle, onView }){
  refs = refs || [];
  excludedIds = excludedIds || [];
  return React.createElement("div",{className:"coverage-refs"},
    React.createElement("div",{className:"shot-refs-lab"},
      React.createElement(Icon.layers,{s:11}),"Reference images"),
    React.createElement("div",{className:"shot-refs-row coverage-refs-row"},
      refs.map((r,i)=>{
        const canToggle = !!(onToggle && r.refId!=null);
        const off = canToggle && excludedIds.indexOf(r.refId)>=0;
        if(r.ready && r.url) return React.createElement("div",{key:i,role:"button",tabIndex:0,
            className:"shot-ref-thumb "+(r.kind==="script"?"script":"location")+(off?" off":""),
            title:(r.required?"Needed to unlock":"Optional")+" — "+(r.note||r.label||"Reference image")+(off?" — excluded from generation":""),
            onClick:()=>onView&&onView(r.url,{name:r.label||"Reference image"}),
            onKeyDown:(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onView&&onView(r.url,{name:r.label||"Reference image"}); } }},
            React.createElement("img",{src:r.url,alt:r.label||"Reference",loading:"lazy"}),
            r.required && React.createElement("span",{className:"coverage-ref-req"},"need"),
            canToggle && React.createElement("button",{className:"shot-ref-tick"+(off?"":" on"),
              title: off ? "Excluded — click to include this reference image in generation."
                : "Included — click to exclude this reference image from generation.",
              onClick:(e)=>{ e.stopPropagation(); onToggle(r.refId); }},
              off ? "\u00d7" : "\u2713"));
        return React.createElement("div",{key:i,className:"shot-ref-thumb missing "+(r.kind==="script"?"script":"location"),
            title:(r.required?"Required missing":"Optional missing")+" — "+(r.label||"Reference image")},
            React.createElement("span",{className:"coverage-ref-missing"},r.required?"needed":"later"),
            React.createElement("span",{className:"coverage-ref-cap"},r.label||"Reference"));
      })));
}

/* one time-of-day variant: its own image slot + a small establishing-frame generator */
function LocationVariant({ l, v, project, onTime, onRemove, onView }){
  const id = l.id+"-"+v.id;
  const gen = useImageGen({
    id, slotId: "locvar-"+l.id+"-"+v.id,
    entity: l,
    buildFinal: ()=> buildLocationVariantPrompt(l, project, { time:v.time }),
    buildSimple: ()=> buildSimpleLocationPrompt(l),
    buildEdit: (instr)=> "Edit this establishing frame of "+(l.name||"the place")+" ("+v.time+"). Apply ONLY: "+instr+". Keep the same space and architecture.",
  });
  const viewerEntity = {
    ...l,
    id,
    name:(l.name||"Location")+" · "+(v.time||"Variant")
  };
  return React.createElement("div",{className:"loc-variant"},
    React.createElement("div",{className:"loc-variant-head"},
      React.createElement(EditText,{value:v.time,placeholder:"Night / Day / Rain\u2026",onCommit:onTime}),
      React.createElement("button",{className:"loc-variant-x",title:"Remove variant",onClick:onRemove},React.createElement(Icon.x,{s:12}))),
    React.createElement(SheetFrame,{ gen, slotId:"locvar-"+l.id+"-"+v.id, name:(l.name||"")+" \u00b7 "+v.time,
      avatarColor:locSwatch(l.intExt), initials:(v.time||"?").slice(0,2).toUpperCase(), drafted:true, drafting:false,
      entity:viewerEntity, onView, slotPlaceholder:"Drop a photo", noun:"variant", compact:true }),
    gen.genUrl && window.QaCheckButton && React.createElement("div",{className:"card-qa-row"},
      React.createElement(window.QaCheckButton,{ gen, name:(l.name||"")+" \u00b7 "+v.time, noun:"time-of-day plate" })));
}

/* SLUGLINE UNIT card — the atomic filmable unit of this master location
   (place × INT/EXT × time-of-day), with its own appearance state and coverage
   plate. Reuses the coverage-sheet machinery: the unit shapes like a sheet
   (sceneNos / scriptExcerpt / role) so the screenplay-snapshot references and
   SheetFrame work unchanged. Generation is per-unit click ONLY (never batched,
   never auto) and requires the parent master plate as its visual anchor. Orphan
   units (slugline edited away) stay visible so their plate and notes aren't
   silently lost; the user removes them explicitly. */
function SluglineUnitCard({ l, u, project, scenes, drafts, parentGenUrl, onUpdateUnit, onRemoveUnit, onView }){
  // collision-safe id: readable slug + djb2 hash of the FULL key (locations.jsx)
  const imgId = (typeof sluglineUnitImageId==="function")
    ? sluglineUnitImageId(u.key)
    : "locunit-"+String(u.key||"").replace(/[^a-z0-9-]+/gi,"-");
  const slotId = imgId.replace(/^locunit-/,"luslot-");
  const role = String(u.intExt||"INT").toUpperCase();
  const sceneNos = Array.isArray(u.sceneNos) ? u.sceneNos.filter(n=>n!=null) : [];
  const sourceLabel = sceneNos.length
    ? ((sceneNos.length>1 ? "Scenes " : "Scene ")+sceneNos.map(n=>String(n)).join(", "))
    : "Scene";
  const pseudo = { id:imgId, name:u.name, role, sceneNos,
    scriptExcerpt:String(u.scriptText||"").slice(0,720),
    summary:"Slugline unit: "+(u.sluglines||[]).join(" \u00b7 ") };
  const [refPreview, setRefPreview] = React.useState([]);
  const [refOff, setRefOff] = React.useState([]);
  const refsKey = [l.id, imgId, u.scriptText, parentGenUrl, (scenes&&scenes.length)].join("|");
  const buildUnitRefs = async ()=>{
    const out = [];
    const C = window.turnContinuity || {};
    const scriptImgs = (typeof locationScreenplayReferenceImages==="function")
      ? locationScreenplayReferenceImages(l, pseudo, scenes||C.scenes||[], drafts||C.drafts||{})
      : [];
    scriptImgs.forEach((scriptImg, i)=> out.push({ url:scriptImg, kind:"script", refId:"script-"+imgId+"-"+i, required:false, ready:true,
      label:"Screenplay p"+(i+1), note:"screenplay page "+(i+1)+" for "+(u.name||"this unit")+" \u2014 use it to infer what the script implies, but do not render any text from it" }));
    const grab = async (rid)=>{ let u2=(typeof nbGetImage==="function")?nbGetImage(rid):"";
      if(!u2 && typeof nbLoadImage==="function"){ try{ u2=await nbLoadImage(rid); }catch(e){} } return u2||""; };
    const parent = parentGenUrl || await grab(l.id);
    out.push({ url:parent, kind:"location", refId:l.id, required:true, ready:!!parent,
      label:(l.name||"Parent location"), note:(l.name||"parent location")+" master plate \u2014 preserve the same world, materials, scale and light" });
    return out;
  };
  React.useEffect(()=>{
    let alive = true;
    (async ()=>{ const refs = await buildUnitRefs(); if(alive) setRefPreview(refs); })();
    const onDone = (e)=>{ const rid = e && e.detail && e.detail.id;
      if(rid===l.id || rid===imgId) buildUnitRefs().then(refs=>{ if(alive) setRefPreview(refs); }); };
    window.addEventListener("nb-gen-done", onDone);
    return ()=>{ alive=false; window.removeEventListener("nb-gen-done", onDone); };
  },[refsKey]);
  const missingRequired = refPreview.filter(r=>r.required && !r.ready);
  const canGenerate = !u.orphan && refPreview.length>0 && missingRequired.length===0;
  const toggleRef = (rid)=> setRefOff(off=> off.indexOf(rid)>=0 ? off.filter(x=>x!==rid) : [...off, rid]);
  const collectRefs = async ()=> (await buildUnitRefs())
    .filter(r=>r.ready && r.url && refOff.indexOf(r.refId)<0)
    .map(r=>({ url:r.url, kind:r.kind==="script"?"script":"location", refId:r.refId, note:r.note }));
  const gen = useImageGen({
    id: imgId, slotId, entity: l,
    buildFinal: ()=> (typeof buildSluglineUnitPrompt==="function")
      ? buildSluglineUnitPrompt(l, u, project)
      : buildLocationCoveragePrompt(l, pseudo, project),
    buildSimple: ()=> buildSimpleLocationPrompt(l),
    beforeGenerate: async ()=>{
      const refs = await buildUnitRefs();
      const missing = refs.filter(r=>r.required && !r.ready);
      const ok = missing.length===0;
      if(!ok && typeof window.appToast==="function")
        window.appToast("Generate the parent location plate first \u2014 this unit needs it as a reference.");
      return ok;
    },
    attachments: collectRefs,
    attachmentsText: (refs)=> refs && refs.length
      ? "REFERENCE IMAGES are attached in this order: "+refs.map((r,i)=>"Image "+(i+1)+" = "+r.note).join("; ")+". The screenplay page snapshots are context only: read the scene geography from them, but never copy their typography, page border, text, captions or layout into the location sheet."
      : "",
    buildEdit: (instr)=> "Edit this "+role+" coverage plate for "+(u.name||l.name||"the location")+(u.time?(" at "+u.time):"")+". Apply ONLY: "+instr+". Keep it consistent with the parent location's architecture, materials and light.",
  });
  const viewerEntity = {
    ...l,
    id:imgId,
    name:(u.name||l.name||"Location")+" · "+role+(u.time?(" · "+u.time):"")
  };
  return React.createElement("div",{className:"loc-variant loc-coverage-sheet loc-unit-card"+(u.orphan?" orphan":"")},
    React.createElement("div",{className:"loc-variant-head"},
      React.createElement("div",{className:"loc-coverage-title"},
        React.createElement("span",{className:"loc-intext-badge "+(/EXT/.test(role)?"ext":"int")},role),
        React.createElement("b",null,u.name||"Slugline unit"),
        u.time && React.createElement("span",{className:"loc-time-badge"},u.time)),
      React.createElement("span",{className:"loc-coverage-source",title:(u.sluglines||[]).join("\n")},sourceLabel)),
    u.orphan && React.createElement("div",{className:"loc-unit-orphan"},
      React.createElement(Icon.alert,{s:12}),
      React.createElement("span",null,"No longer in the script \u2014 kept so its plate and notes aren't lost."),
      onRemoveUnit && React.createElement("button",{className:"loc-unit-remove",
        title:"Delete this unit's stored data and generated plate",
        onClick:async ()=>{ if(typeof nbClearAsset==="function"){ try{ await nbClearAsset(imgId); }catch(e){} } onRemoveUnit(u.key); }},"Remove")),
    React.createElement(SheetField,{label:"Appearance state",value:u.appearance||"",multiline:true,
      // per-unit prompt built from THIS unit's own slugline facts (name, TOD, scenes) —
      // a static example ("dawn and raining") read as if every location should be dawn
      // and raining. Mirrors how character appearance state is framed: what THIS unit
      // looks like at THIS point in the story.
      placeholder:"How "+(u.name||l.name||"this space")+" looks"
        +(u.time?(" at "+String(u.time).toLowerCase()):"")
        +(sceneNos.length?(" in "+sourceLabel.toLowerCase()):"")
        +" \u2014 weather, light, wear, and what's changed here by this point in the story\u2026",
      onCommit:(val)=>onUpdateUnit && onUpdateUnit(u.key,{ appearance:val })}),
    React.createElement(UnitDressing,{ u, onUpdateUnit: u.orphan ? null : onUpdateUnit }),
    React.createElement(SheetFrame,{ gen, slotId, name:(u.name||l.name||"Location")+" \u00b7 "+role+(u.time?(" \u00b7 "+u.time):""),
      avatarColor:locSwatch(role), initials:role.slice(0,2), drafted:true, drafting:false,
      entity:viewerEntity, onView, slotPlaceholder:"Drop a finished unit plate", noun:"unit plate", compact:true,
      dropToImport:true,
      referenceControls: React.createElement(CoverageReferenceStrip,{ refs:refPreview, excludedIds:refOff, onToggle:toggleRef, onView }),
      generateDisabled:!canGenerate,
      generateDisabledLabel: u.orphan ? "No longer in script" : "Generate parent plate first",
      generateDisabledTitle: u.orphan
        ? "This unit's slugline is no longer in the screenplay, so it can't generate new plates. Its existing plate and notes are kept until you Remove it."
        : "This unit needs the parent location plate as a visual reference before it can generate." }),
    gen.genUrl && window.QaCheckButton && React.createElement("div",{className:"card-qa-row"},
      React.createElement(window.QaCheckButton,{ gen, name:(u.name||l.name||"")+" \u00b7 "+role, noun:"location unit plate" })));
}

/* per-unit SET DRESSING — the user's curated list (overlay `dressing`) plus
   deterministic suggestions pulled from the unit's own action prose (skeleton
   `dressingDerived`). Click a suggestion to accept it into the list; the curated
   list is what the generation prompt binds. Orphans render read-only. */
function UnitDressing({ u, onUpdateUnit }){
  const [draft, setDraft] = React.useState("");
  const list = Array.isArray(u.dressing) ? u.dressing : [];
  const editable = !!onUpdateUnit;
  if(!editable && !list.length) return null;
  const lower = {}; list.forEach(x=>{ lower[String(x).toLowerCase()] = true; });
  const sugg = editable
    ? (Array.isArray(u.dressingDerived) ? u.dressingDerived : []).filter(x=>!lower[String(x).toLowerCase()])
    : [];
  const commit = (next)=> onUpdateUnit && onUpdateUnit(u.key, { dressing: next });
  const add = (val)=>{ const v = String(val||"").replace(/\s+/g," ").trim();
    setDraft("");
    if(!v || lower[v.toLowerCase()]) return;
    commit(list.concat([v])); };
  return React.createElement("div",{className:"loc-dress"},
    React.createElement("div",{className:"loc-dress-lab"},"Set dressing"),
    React.createElement("div",{className:"loc-dress-row"},
      list.map((x,i)=>React.createElement("span",{className:"loc-dress-chip",key:"d"+i},x,
        editable && React.createElement("button",{title:"Remove",onClick:()=>commit(list.slice(0,i).concat(list.slice(i+1)))},"\u00d7"))),
      editable && React.createElement("span",{className:"loc-dress-add"},
        React.createElement("input",{value:draft,placeholder:"add item\u2026",
          onChange:(e)=>setDraft(e.target.value),
          onBlur:()=>add(draft),
          onKeyDown:(e)=>{ if(e.key==="Enter"){ e.preventDefault(); add(draft); } }}),
        React.createElement("button",{className:"loc-dress-sugg",title:"Add to set dressing",onClick:()=>add(draft)},"+"))),
    sugg.length>0 && React.createElement("div",{className:"loc-dress-row sugg"},
      React.createElement("span",{className:"loc-dress-sugg-lab"},"from the script:"),
      sugg.map((x,i)=>React.createElement("button",{className:"loc-dress-sugg",key:"s"+i,
        title:"Mentioned in this unit's action prose \u2014 click to add",onClick:()=>add(x)},"+ "+x))));
}

function LocationSheets({ project, locations, scenes, drafts, onUpdate, onDraft, onDraftAll, onAdd, onDelete, draftingId, draftingIds, draftingAll, onPullFromScript, scriptHasLocs, onDraftStaging, draftingStageId, onScout, trashItems, onRestore, onPurge, lookbookStale, onApplyLookbook, onApplyLookbookDraftOnly, sluglineUnits, onUpdateUnit, onRemoveUnit }){
  const [view, setView] = React.useState(null);
  if(window.useRenderStyleVersion) window.useRenderStyleVersion();   // re-render dropdowns when a style is locked/unlocked
  const [sceneFilter, setSceneFilter] = React.useState("");
  const [query, setQuery] = React.useState("");               // free-text name search
  const [searchOpen, setSearchOpen] = React.useState(false);  // collapsible search: icon-only until clicked
  const searchRef = React.useRef(null);
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = locations || [];
  // STYLE · ALL LOCATIONS — apply one render style to every location at once (mirrors the
  // cast's 'Style · all cast'); each location can still be overridden on its own card.
  const [allStyling, setAllStyling] = React.useState(null);   // null | {i,total} (surprise progress)
  const LOC_TEXT = window.LOC_RENDER_TEXT || {};
  const defaultStyleKey = window.turnDefaultRenderStyleKey ? window.turnDefaultRenderStyleKey() : "photoreal";
  const allStyleKey = (list.length && list.every(l=>(l.renderStyleKey||defaultStyleKey)===(list[0].renderStyleKey||defaultStyleKey)))
    ? (list[0].renderStyleKey||defaultStyleKey) : "";
  const locBibleOf = (l)=> [l.name&&("Name: "+l.name), l.architecture&&("Architecture: "+l.architecture),
    l.materials&&("Materials: "+l.materials), l.lighting&&("Lighting: "+l.lighting), l.significance&&("Significance: "+l.significance),
    (project&&project.genre)&&("Genre: "+project.genre)].filter(Boolean).join("\n");
  const applyStyleAll = async (key)=>{
    if(!key || allStyling) return;
    if(key!=="surprise"){ const t=(typeof window.renderStyleText==="function" ? window.renderStyleText("loc", key) : (LOC_TEXT[key]||LOC_TEXT.photoreal)); list.forEach(l=> onUpdate(l.id, { renderStyleKey:key, renderStyle:t })); return; }
    list.forEach(l=> onUpdate(l.id, { renderStyleKey:"surprise" }));
    if(!(typeof aiSurpriseStyleText==="function" && typeof aiAvailable==="function" && aiAvailable())) return;
    const need = list.filter(l=>!(l.surpriseRender && l.surpriseRender.style));
    if(!need.length) return;
    let ok = true;
    if(typeof window.appConfirm==="function") ok = await window.appConfirm({
      title:"Invent a surprise style for "+need.length+" location"+(need.length!==1?"s":"")+"?",
      body:"Each location gets its OWN bespoke fused style invented from its bible — that's "+need.length+" AI call"+(need.length!==1?"s":"")+".",
      confirmLabel:"Invent styles" });
    if(!ok) return;
    setAllStyling({ i:0, total:need.length });
    for(let i=0;i<need.length;i++){ setAllStyling({ i:i+1, total:need.length });
      try{ const r = await aiSurpriseStyleText({ name:need[i].name, kind:"location", bible:locBibleOf(need[i]) }, project);
        if(r) onUpdate(need[i].id, { surpriseRender:r, renderStyle:r.style }); }catch(e){} }
    setAllStyling(null);
  };
  const sceneList = scenesInStoryOrder(scenes);
  const inScene = (l, sid)=> Array.isArray(l.scenes) && l.scenes.indexOf(sid)>=0;
  const q = query.trim().toLowerCase();
  const matchesQuery = (l)=> (typeof searchWordMatch==="function") ? searchWordMatch((l.name||"")+" "+(l.intExt||""), q) : (!q || (l.name||"").toLowerCase().indexOf(q)>=0);
  const shown = (sceneFilter ? list.filter(l=>inScene(l, sceneFilter)) : list).filter(matchesQuery);
  // 9-up pagination; suspended while a batch runs so the queue can reach every card
  const pager = usePager(shown.length, !!batchActiveId);
  const sceneNoOf = (sid)=>{ const s=(scenes||[]).find(x=>x.id===sid); return s?s.no:sid; };

  // ---- batch generation ---- (eligible = drafted locations only; the spec is what
  // the plate is built from, so an undrafted/hand-added card never makes a generic plate)
  const draftedIds = (subset)=> subset.filter(l=> (typeof locVisualsDrafted==="function") ? locVisualsDrafted(l) : true).map(l=>l.id);
  const startSceneBatch = ()=>{
    if(!sceneFilter || batchActiveId) return;
    const eligible = draftedIds(shown);
    if(!eligible.length){ batch.setMsg("Draft these locations first \u2014 nothing in this scene is ready to generate."); return; }
    batch.begin(eligible, shown.length - eligible.length);
  };
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Draft the locations first \u2014 nothing is ready to generate yet."); return; }
    // clear the SEARCH too, not just the scene/kind filters: the queue advances only
    // when the target CARD is mounted, so a batch whose first target was filtered out
    // by a search box never generated anything and hung until Cancel
    if(sceneFilter) setSceneFilter("");
    if(query) setQuery("");
    batch.begin(eligible, list.length - eligible.length);
  };
  const eligibleAll = list.filter(l=> (typeof locVisualsDrafted==="function") ? locVisualsDrafted(l) : true).length;

  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Production Designer (Location Scout)",
            React.createElement(window.InfoTip,{label:"About Locations",
              text:"Every place the film stages gets a multi-angle coverage plate so any shot set there matches its geometry, materials and light. Scene headings and secondary headings anchor the master location cards; the screenplay body can imply additional INT / EXT sides, rooms, booths, thresholds or views, and those become screenplay coverage sheets using full-scene page snapshots as image references.\n\nLOCATIONS DERIVE FROM THE SCREENPLAY \u2014 there's no arbitrary hand-adding here: write the place or implied space into the Writers' Room scene, and 'Design all locations' pulls the staged geography into the Art Room."}))),
        React.createElement("div",{className:"art-intro-actions"},
          window.RecentlyDeleted && React.createElement(window.RecentlyDeleted,{
            items:trashItems,kind:"location",onRestore,onPurge,compact:true}),
          // NO arbitrary hand-adding: master cards anchor to screenplay headings, while
          // implied side spaces (booths, rooms, interiors seen through glass, etc.) are
          // derived as coverage sheets from screenplay body text + page snapshots.
          React.createElement("label",{className:"char-style-all",
            title:"Read only. Each location's plate scale is derived automatically from the characters who drive its scenes."},
            React.createElement("span",{className:"char-style-all-lab"},"World scale"),
            React.createElement("select",{className:"char-style-select",value:"",disabled:true,"aria-label":"World scale (read only)"},
              React.createElement("option",{value:""},"\u2728 Auto (by occupant)"))),
          React.createElement("button",{className:"art-draftall ghost",disabled:draftingAll||(!list.length&&!scriptHasLocs),onClick:onDraftAll,
            title:"Build every location from the screenplay in one pass \u2014 pull missing master places from scene headings, derive implied INT/EXT coverage from scene text, draft each spec, and stage its depth grid"},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Design all locations"),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the coverage plate for every drafted location \u2014 you choose whether to redo ones that already have a plate"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all locations", typeof window.nbCostChip==="function" && window.nbCostChip(1)))),),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,onDraftOnly:onApplyLookbookDraftOnly,label:"these locations",dept:"locations"}),
    BatchBar && React.createElement(BatchBar,{batch,noun:"location"}),
    list.length>0 && React.createElement("div",{className:"prop-toolbar"},
      React.createElement("div",{className:"prop-searchbar collapsible"+((searchOpen||q)?" open":""),
        title:(searchOpen||q)?"":"Search locations",
        onClick:()=>{ if(!searchOpen && !q){ setSearchOpen(true); setTimeout(()=>{ if(searchRef.current) searchRef.current.focus(); },0); } }},
        React.createElement(Icon.search,{s:14}),
        React.createElement("input",{className:"prop-search-input",type:"text",value:query,ref:searchRef,
          placeholder:"Search locations by name…",tabIndex:(searchOpen||q)?0:-1,
          onChange:e=>setQuery(e.target.value),
          onBlur:()=>{ if(!query) setSearchOpen(false); },
          onKeyDown:e=>{ if(e.key==="Escape"){ setQuery(""); setSearchOpen(false); if(searchRef.current) searchRef.current.blur(); } }}),
        q && React.createElement("span",{className:"prop-search-count"}, shown.length+" of "+list.length),
        q && React.createElement("button",{className:"prop-search-clear",title:"Clear search",onClick:(e)=>{ e.stopPropagation(); setQuery(""); setSearchOpen(false); }},React.createElement(Icon.x,{s:13}))),
      // Render style stays editable; world scale is always resolved from the scene's occupants.
      React.createElement("div",{className:"char-style-all",
        title:"Apply one render style to ALL locations at once. Each location can still be overridden on its own card."},
        React.createElement("span",{className:"char-style-all-lab"},
          allStyling ? ("Inventing… "+allStyling.i+"/"+allStyling.total) : "Style · all locations"),
        React.createElement(window.RenderStylePicker,{value:allStyleKey,disabled:!!allStyling,
          placeholderLabel:"Mixed — per location",onPick:applyStyleAll})),
      sceneList.length>0 && React.createElement("div",{className:"prop-scenebar"},
        React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.layers,{s:13}),"Focus a scene"),
        React.createElement("select",{className:"prop-select prop-scenebar-select",value:sceneFilter,
          onChange:e=>setSceneFilter(e.target.value)},
          React.createElement("option",{value:""},"All scenes \u2014 show every location"),
          sceneList.map(s=>{
            const n = list.filter(l=>inScene(l,s.id)).length;
            return React.createElement("option",{key:s.id,value:s.id},
              "Scene "+String(s.no).padStart(2,"0")+" \u00b7 "+(s.title||"")+"  ("+n+" location"+(n!==1?"s":"")+")");
          })),
        sceneFilter && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId,onClick:startSceneBatch,
          title:"Generate coverage plates for the locations in this scene"},
          React.createElement(Icon.sparkles,{s:14}),
          batchActiveId?"Generating\u2026":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")), typeof window.nbCostChip==="function" && window.nbCostChip(1)))),
    list.length
      ? (shown.length
          ? React.createElement(React.Fragment,null,
              React.createElement("div",{className:"sheet-grid"},
                pager.slice(shown).map(l=>React.createElement(LocationSheet,{key:l.id,l,project,scenes,drafts,onUpdate,onDelete,onDraft,
                  drafting:draftingId===l.id||(draftingIds||[]).indexOf(l.id)>=0||draftingAll,onView:(url,pr)=>setView({url,character:pr}),
                  batchActiveId,onBatchDone:batch.advance,onChipClick:(sid)=>setSceneFilter(sid),
                  onDraftStaging,draftingStage:draftingStageId===l.id,sluglineUnits,onUpdateUnit,onRemoveUnit}))),
              React.createElement(PagerBar,{pager,noun:"location"}))
          : React.createElement("div",{className:"prop-empty"},
              React.createElement("div",{className:"art-soon-t"}, sceneFilter ? "No locations in this scene" : "No matching locations"),
              React.createElement("button",{className:"art-draftall",style:{marginTop:16},
                onClick:()=>{ setSceneFilter(""); setQuery(""); }},"Show all locations")))
      : React.createElement("div",{className:"prop-empty"},
          React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon.layers,{s:30})),
          React.createElement("div",{className:"art-soon-t"},"No locations yet"),
          React.createElement("div",{className:"art-soon-d"}, scriptHasLocs
            ? "Your screenplay names the main staged places in scene headings, and may imply extra rooms, interiors, exteriors or thresholds in the scene body. \u201cDesign all locations\u201d builds the master plates and screenplay coverage sheets from that text."
            : "Write the scene's staged place in the Writers' Room first. Extra implied spaces can live in the scene action; the Locations tab reads the full screenplay page when it creates coverage sheets."),
          scriptHasLocs
            ? React.createElement("div",{style:{display:"flex",gap:8,marginTop:16}},
                React.createElement("button",{className:"art-draftall",disabled:draftingAll,onClick:onDraftAll},
                  React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Design all locations"))
            : React.createElement("div",{className:"art-soon-d",style:{marginTop:12}},"No screenplay-staged location anchor yet.")));
}
window.LocationSheets = LocationSheets;
