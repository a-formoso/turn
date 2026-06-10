/* lookbook.jsx — The Art Room ▸ Lookbook (References).
   The front-of-pipeline visual brief: a north-star "visual statement" plus a grid of
   reference cards (palette / lighting / lens / texture touchstones), each with an
   AI-rendered mood frame. The Visual Researcher agent fills it from the story and writes
   its references through to the Colorist (Presets) so the look propagates downstream.
   Mirrors props.jsx / locations.jsx; reuses SheetFrame / SheetField / CardFold / useImageGen. */

const LOOKBOOK_CATEGORIES = ["Palette","Lighting","Lens & format","Texture & grain","Composition","Production design","Wardrobe","Atmosphere"];
window.LOOKBOOK_CATEGORIES = LOOKBOOK_CATEGORIES;

/* a reference is generatable once it has a "what to borrow" note — the note (the abstract
   visual quality) is what the mood frame is built from, never the named source IP. */
function lookbookCardDrafted(c){ return !!((c && (c.note||"")).trim()); }
window.lookbookCardDrafted = lookbookCardDrafted;

/* Mood-frame prompt: an ORIGINAL frame that captures the reference's visual LANGUAGE only
   (palette / lighting / lens / texture) — deliberately NOT a depiction of any named film,
   scene, character or logo, so it stays copyright-clean (same principle as the Colorist). */
function buildLookbookPrompt(c, project){
  const P = project || (window.TURN_DATA||{}).PROJECT || {};
  const note = (c.note||"").replace(/\.$/,"").trim();
  const cat = (c.category||"Palette");
  const period = P.setting && P.setting.period ? P.setting.period.split(/[—,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  let s = "Cinematic visual-reference frame — a "+cat.toLowerCase()+" study. ";
  s += note ? (note+". ") : "";
  if(tone) s += tone+" tone. ";
  s += "An ORIGINAL frame that captures this visual LANGUAGE only — palette, lighting, lens, texture, atmosphere. ";
  s += "Do NOT depict any specific recognizable film, scene, character, real person, logo or on-screen text; no words in the image. ";
  s += "Photoreal, evocative, filmic, shallow depth of field. --ar 16:9";
  return s;
}
window.buildLookbookPrompt = buildLookbookPrompt;

function combinedLookbookPrompt(c, project){
  const master = buildLookbookPrompt(c, project);
  const neg = (c.negativePrompt || "text, words, captions, logo, watermark, recognizable real film still, celebrity likeness, distorted faces").trim();
  return master + " AVOID: " + neg.replace(/\.$/,"") + ".";
}
window.combinedLookbookPrompt = combinedLookbookPrompt;

function buildSimpleLookbookPrompt(c){
  const note = (c.note||"").replace(/\.$/,"").trim();
  return ["Cinematic reference frame", (c.category||"").toLowerCase(), note||"",
    "original, no text, no recognizable film, photoreal, atmospheric"].filter(Boolean).join(". ")+".";
}
window.buildSimpleLookbookPrompt = buildSimpleLookbookPrompt;

/* compose the lookbook into the free-text references the Colorist reads (styleBible.refs) */
function composeLookbookRefs(statement, cards){
  return [statement, ...(cards||[]).filter(c=>(c.note||"").trim())
    .map(c=> (c.source?c.source+" — ":"")+c.note)].filter(Boolean).join("\n");
}
window.composeLookbookRefs = composeLookbookRefs;

/* headless mood-frame generation for the Visual Researcher agent (mirrors generatePropSheet) */
async function generateLookbookFrame(c, project){
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const prompt = (typeof combinedLookbookPrompt==="function") ? combinedLookbookPrompt(c, project) : (c.source||"reference frame");
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[c.id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, {}); }
    catch(e){ if(/no image/i.test((e&&e.message)||"") && typeof buildSimpleLookbookPrompt==="function"){ url = await nbGenerate(buildSimpleLookbookPrompt(c), {}); } else throw e; }
    const model = (typeof nbGetModel==="function") ? nbGetModel() : "";
    const now = new Date();
    const mEntry = (window.NB_MODELS||[]).find(m=>m.id===model) || {};
    const meta = { modelLabel:mEntry.label||"Nano Banana", modelId:model,
      aspect:(typeof nbGetAspect==="function"?nbGetAspect():"16:9"), size:(typeof nbGetRes==="function"?nbGetRes():"2K"),
      iso:now.toISOString(), prompt, mode:"final", version:1 };
    await nbCommit(c.id, url, meta, [], "asset");
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:c.id, url } })); }catch(e){}
    return true;
  } finally { window.__nbGenInflight[c.id] = false; }
}
window.generateLookbookFrame = generateLookbookFrame;

/* ---- one reference card ---- */
function LookbookCard({ c, project, onUpdate, onDelete, onView, batchActiveId, onBatchDone }){
  const finalPrompt = combinedLookbookPrompt(c, project);
  const drafted = lookbookCardDrafted(c);
  const initials = (c.source||"Ref").replace(/^the\s+/i,"").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const gen = useImageGen({
    id: c.id, slotId: "lookref-"+c.id,
    buildFinal: ()=> finalPrompt,
    buildSimple: ()=> buildSimpleLookbookPrompt(c),
    buildEdit: (instr)=>
      "Edit this reference frame. Apply ONLY this change: "+instr+". "
      +"Keep the same visual language — palette, lighting, lens, texture — in the same single 16:9 frame. "
      +"No text, no recognizable film or person.",
  });

  const batchStarted = React.useRef(false);
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===c.id;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){ batchStarted.current=true; wasGening.current=false; gen.generate(); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(c.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, c.id]);

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===c.id?" batch-on":""),"data-look-card":c.id},
    React.createElement(SheetFrame,{ gen, slotId:"lookref-"+c.id, name:c.source||"Reference", avatarColor:"#6b7280",
      initials, drafted, drafting:false, onDraft:()=>{}, entity:c, onView,
      slotPlaceholder:"Drop a reference image", noun:"reference frame",
      specGate:{ ready:drafted, hint:"Add a ‘what to borrow’ note first — it's what the frame is built from." },
      onDelete:()=>onDelete(c.id), deleteLabel:"Delete reference" }),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"sheet-name"},
            React.createElement(EditText,{value:c.source,placeholder:"Reference — film, cinematographer, palette…",onCommit:val=>onUpdate(c.id,{source:val})})),
          React.createElement("div",{className:"sheet-role"}, c.category||"Palette"))),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"No ‘what to borrow’ note yet — add one below, then generate its mood frame.")),

      React.createElement(CardFold,{label:"Reference",defaultOpen:true},
        React.createElement("div",{className:"sheet-field"},
          React.createElement("div",{className:"obj-lab"},"Category"),
          React.createElement("select",{className:"prop-select",value:c.category||"Palette",
            onChange:e=>onUpdate(c.id,{category:e.target.value})},
            (window.LOOKBOOK_CATEGORIES||[]).map(cat=>React.createElement("option",{key:cat,value:cat},cat)))),
        React.createElement(SheetField,{label:"What to borrow — the visual quality",value:c.note,multiline:true,
          placeholder:"The palette / lighting / lens / texture to draw from — abstract qualities, not the source's scenes…",
          onCommit:val=>onUpdate(c.id,{note:val})})),

      React.createElement(CardFold,{label:"Reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"Mood frame — feed to your image tool",text:finalPrompt}),
        React.createElement(SheetField,{label:"Negative prompt — exclude",value:c.negativePrompt||"",
          onCommit:val=>onUpdate(c.id,{negativePrompt:val})}))));
}

/* ---- the Lookbook tab ---- */
function LookbookView({ project, lookbook, note, onUpdate, onAdd, onDelete, onSetNote, onResearch }){
  const [view, setView] = React.useState(null);
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = lookbook || [];
  const draftedIds = (subset)=> subset.filter(c=>lookbookCardDrafted(c)).map(c=>c.id);
  const eligibleAll = list.filter(c=>lookbookCardDrafted(c)).length;
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Add a ‘what to borrow’ note to a reference first — nothing is ready to render yet."); return; }
    batch.begin(eligible, list.length - eligible.length);
  };

  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Visual Researcher",
            React.createElement(window.InfoTip,{label:"About the Lookbook",
              text:"The film's visual north star, built first so it can steer everything downstream. A short visual statement plus reference touchstones — palette, lighting, lens, texture — each with a mood frame in that visual language (original frames, never copies of the named films). 'Research the look' runs the Visual Researcher agent: it writes the statement, gathers the references, and renders a mood frame for each — then writes those references through to the Presets (Colorist), so the colour system is built from the same brief."}))),
        React.createElement("div",{className:"art-intro-actions"},
          React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
            React.createElement(Icon.plus,{s:14}),"Add reference"),
          onResearch && React.createElement("button",{className:"art-draftall",onClick:onResearch,
            title:"Visual Researcher — writes the look statement, gathers reference touchstones, and renders a mood frame for each, on its own"},
            React.createElement(Icon.robot,{s:14}),"Research the look"),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Render (or re-render) the mood frame for every reference that has a note"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Rendering…":"Generate all frames")))),

    // the north-star visual statement
    React.createElement("div",{className:"lb-statement"},
      React.createElement(SheetField,{label:"Visual statement — the film's north star",value:note||"",multiline:true,
        placeholder:"How the whole film should LOOK and FEEL — palette, light, texture — in two or three sentences. Run ‘Research the look’ to draft it.",
        onCommit:val=>onSetNote&&onSetNote(val)})),

    BatchBar && React.createElement(BatchBar,{batch,noun:"frame"}),

    list.length
      ? React.createElement("div",{className:"sheet-grid"},
          list.map(c=>React.createElement(LookbookCard,{key:c.id,c,project,onUpdate,onDelete,
            onView:(url,ent)=>setView({url,character:ent}),batchActiveId,onBatchDone:batch.advance})))
      : React.createElement("div",{className:"prop-empty"},
          React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon.image,{s:30})),
          React.createElement("div",{className:"art-soon-t"},"No references yet"),
          React.createElement("div",{className:"art-soon-d"},"Build the film's visual brief first — ‘Research the look’ writes the statement and gathers reference touchstones (palette, lighting, lens, texture) with a mood frame each. Or add one by hand."),
          React.createElement("div",{style:{display:"flex",gap:8,marginTop:16}},
            onResearch && React.createElement("button",{className:"art-draftall",onClick:onResearch},
              React.createElement(Icon.robot,{s:14}),"Research the look"),
            React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
              React.createElement(Icon.plus,{s:14}),"Add by hand"))));
}
window.LookbookView = LookbookView;
