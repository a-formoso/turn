/* props.jsx — The Art Room ▸ Props tab.
   Continuity objects (worn or carried) get their own reference sheet so an object
   looks identical in every shot it appears in. Mirrors the Character Sheets flow:
   each prop card has Draft (AI fills form/material/detail from the script) and
   Generate (Nano Banana → a multi-view product sheet). Reuses the shared
   useImageGen hook + SheetFrame so the generation machinery stays in one place. */

/* deterministic prop reference prompt — a 6-panel product turnaround */
function buildPropRefPrompt(p, project){
  const P = project || (window.TURN_DATA||{}).PROJECT || {};
  const form = (p.form||"").replace(/\.$/,"").trim();
  const material = (p.material||"").replace(/\.$/,"").trim();
  const detail = (p.detail||"").replace(/\.$/,"").trim();
  const style = p.renderStyle || "photoreal product reference, 85mm, soft even studio lighting, sharp focus";
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  const owner = p.ownerName ? ("Belongs to "+p.ownerName+(p.kind?(" \u2014 "+p.kind):"")+". ") : "";
  let s = "Master prop / object design reference sheet \u2014 "+(p.name||"Object")+". ";
  s += form ? ("OBJECT: "+form+". ") : "";
  s += material ? ("Material & finish: "+material+". ") : "";
  s += detail ? ("Significance: "+detail+". ") : "";
  s += owner;
  if(tone) s += tone+" tone. ";
  s += "RENDER STYLE: "+style.replace(/\.$/,"")+". ";
  s += "6-panel 3\u00d72 grid on a solid neutral light-grey background: front view, 3/4 view, side profile, "
     + "back view, top-down view, and one extreme close-up detail shot. ";
  s += "Consistent scale across panels, soft even studio product lighting, no people, no hands, "
     + "the SAME identical object in every panel, crisp edge detail, sharp focus. --ar 16:9";
  return s;
}
window.buildPropRefPrompt = buildPropRefPrompt;

/* ---- derive standalone prop cards from the cast's existing per-character
   "Props & accessories" fields (c.accessories = worn, c.props = carried),
   which the visual bible already fills during a build. Splits multi-item
   fields, assigns the owner, and dedups against props already in the tab so
   re-running never creates duplicates. No AI / no pipeline step — it just
   surfaces data the character sheets already hold. */
function propSlug(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40); }
function splitPropItems(text){
  let s = String(text||"");
  // Protect parenthetical clauses so the delimiters INSIDE them (commas, dashes,
  // "and", etc.) don't shred one item into fragments like "Aud" or "possessive)".
  const stash = [];
  s = s.replace(/\([^()]*\)/g, m=>{ stash.push(m); return "\u0000"+(stash.length-1)+"\u0000"; });
  return s
    .split(/\s*(?:,|;|·|•|\n)\s*/)
    .map(part=> part.replace(/\u0000(\d+)\u0000/g, (_,i)=> stash[+i]||"") )   // restore parens
    .map(x=> x.replace(/\.$/,"").trim())
    .map(x=> x.replace(/^[)\]\u2014\u2013\-\s]+/,"").trim())                  // drop leading stray bracket/dash debris
    .map(x=> /^\([^)]*$/.test(x) ? x+")" : x)                                 // close a dangling "(unfinished"
    .filter(x=> x && x.replace(/[^a-z0-9]/gi,"").length>1                     // need real content, not just punctuation
      && !/^(none|n\/a|nil|various|misc\.?|etc\.?)$/i.test(x));
}
/* classify a prop as worn vs carried FROM ITS NAME, independent of which character
   field it was filed under. The visual-bible AI sometimes mis-files a handheld object
   (a phone, a gun) under a character's worn "accessories", or vice-versa; this is the
   sanity check propsFromCast lacked. Returns "carried" | "worn" | "" (unsure → keep
   the source field's kind). Only fires on UNAMBIGUOUS nouns so a deliberate choice is
   never second-guessed. */
const PROP_CARRIED_WORDS = ["phone","mobile","cellphone","cell phone","smartphone","iphone","handset","gun","pistol",
  "revolver","rifle","shotgun","firearm","weapon","knife","blade","dagger","sword","machete","axe","bottle","flask",
  "canteen","cup","mug","glass","tumbler","bag","handbag","briefcase","suitcase","backpack","rucksack","satchel",
  "purse","wallet","key","keys","keycard","book","notebook","journal","ledger","folder","binder","file","dossier",
  "document","paper","letter","envelope","note","pen","pencil","marker","camera","torch","flashlight","lantern",
  "umbrella","cane","walking stick","staff","wand","baton","club","tool","wrench","hammer","screwdriver","cigarette",
  "cigar","lighter","money","cash","banknote","coin","ticket","map","tablet","ipad","laptop","controller","remote",
  "microphone","bouquet","flowers","gift","present","parcel","package","box","crate","plate","tray","syringe","vial","jar"];
const PROP_WORN_WORDS = ["watch","wristwatch","ring","bracelet","bangle","necklace","chain","pendant","locket","amulet",
  "earring","earrings","glasses","sunglasses","spectacles","eyeglasses","monocle","goggles","hat","cap","beanie",
  "helmet","hood","scarf","muffler","tie","necktie","bowtie","cravat","badge","brooch","insignia","medal","ribbon",
  "belt","sash","glove","gloves","mask","veil","crown","tiara","circlet","coat","jacket","cloak","cape","mantle",
  "robe","uniform","gown","dress","suit","shirt","blouse","vest","waistcoat","boots","boot","shoe","shoes","armband",
  "holster","apron","epaulette","collar","cufflink","cufflinks","bandana","headband","wig"];
function _propWordHit(name, words){
  const n = " "+String(name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ")+" ";
  return words.some(w=> n.indexOf(" "+w+" ")>=0);
}
function classifyPropKind(name){
  const carried = _propWordHit(name, PROP_CARRIED_WORDS);
  const worn = _propWordHit(name, PROP_WORN_WORDS);
  if(carried && !worn) return "carried";
  if(worn && !carried) return "worn";
  return "";   // unknown or conflicting -> defer to the source
}
window.classifyPropKind = classifyPropKind;

/* the PRIMARY object noun of a prop name, with synonyms folded together, so two
   descriptions of the same object collapse to one head ("Mobile phone" and "Phone
   screen cracked in bottom corner" → "phone"). Returns "" when no known object noun
   is found (then only an exact-name match counts as a duplicate). Used to detect /
   prevent duplicate prop cards for one owner's one object. */
const PROP_NOUN_SYNONYMS = { mobile:"phone", cellphone:"phone", smartphone:"phone", iphone:"phone", handset:"phone",
  wristwatch:"watch", spectacles:"glasses", eyeglasses:"glasses", sunglasses:"glasses", monocle:"glasses",
  revolver:"gun", pistol:"gun", firearm:"gun", shotgun:"gun", rifle:"gun", handgun:"gun",
  blade:"knife", dagger:"knife", earrings:"earring", keys:"key", gloves:"glove", boots:"boot", shoes:"shoe",
  flowers:"bouquet", banknote:"money", cash:"money", coin:"money" };
function propHeadNoun(name){
  const n = " "+String(name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ")+" ";
  const all = PROP_CARRIED_WORDS.concat(PROP_WORN_WORDS);
  for(const w of all){ if(n.indexOf(" "+w+" ")>=0) return PROP_NOUN_SYNONYMS[w] || w; }
  return "";
}
window.propHeadNoun = propHeadNoun;

/* group props into duplicate sets — same owner + same object (head noun, or exact
   name when the object is unknown). Returns a map: signature -> array of prop ids
   (only signatures with 2+ props, i.e. actual duplicates). */
function findDuplicateProps(props){
  const groups = {};
  (props||[]).forEach(p=>{
    const head = propHeadNoun(p.name) || ("name:"+propSlug(p.name));
    const key = (p.ownerId||"")+"##"+head;
    (groups[key] = groups[key] || []).push(p.id);
  });
  const dups = {};
  Object.keys(groups).forEach(k=>{ if(groups[k].length>1) dups[k] = groups[k]; });
  return dups;
}
window.findDuplicateProps = findDuplicateProps;

function propsFromCast(characters, existing){
  const have = existing || [];
  // signature = ownerId + normalised name, so a prop already on the tab isn't re-added
  const sig = (ownerId,name)=> (ownerId||"")+"::"+propSlug(name);
  const seen = new Set(have.map(p=> sig(p.ownerId, p.name)));
  // also dedup on owner + OBJECT (head noun) so one owner doesn't get two cards for
  // the same object described differently ("Mobile phone" vs "Cracked phone")
  const objSig = (ownerId,name)=>{ const h=propHeadNoun(name); return h?((ownerId||"")+"##"+h):""; };
  const seenObj = new Set(have.map(p=> objSig(p.ownerId, p.name)).filter(Boolean));
  const out = [];
  (characters||[]).forEach(c=>{
    const add = (text, sourceKind)=> splitPropItems(text).forEach(item=>{
      const s = sig(c.id, item);
      if(seen.has(s)) return;
      const os = objSig(c.id, item);
      if(os && seenObj.has(os)) return;   // same owner already has this object
      seen.add(s); if(os) seenObj.add(os);
      const kind = classifyPropKind(item) || sourceKind;   // name-based truth wins over the source field
      out.push({
        id: "prop-"+(c.id||"x")+"-"+kind+"-"+propSlug(item)+"-"+(out.length),
        name: item.replace(/^\w/, m=>m.toUpperCase()),
        kind, ownerId: c.id||"", ownerName: c.name||"",
        form:"", material:"", detail:"", renderStyle:"", negativePrompt:"",
        fromCast:true,
      });
    });
    add(c.accessories, "worn");
    add(c.props, "carried");
  });
  return out;
}
window.propsFromCast = propsFromCast;

/* true when the cast carries any worn/carried items we could pull into the tab */
function castHasProps(characters){
  return (characters||[]).some(c=> splitPropItems(c.accessories).length || splitPropItems(c.props).length);
}
window.castHasProps = castHasProps;

function propDefaults(p){
  return {
    negativePrompt: p.negativePrompt || "text, watermark, label, branding, blurry, low resolution, distorted, extra objects, people, hands",
    renderStyle: p.renderStyle || "photoreal product reference, 85mm, soft even studio lighting, sharp focus",
  };
}

function combinedPropPrompt(p, project){
  const master = buildPropRefPrompt(p, project);
  const neg = (p.negativePrompt || propDefaults(p).negativePrompt || "").trim();
  return neg ? (master + " AVOID: " + neg.replace(/\.$/,"") + ".") : master;
}
window.combinedPropPrompt = combinedPropPrompt;

/* simplified fallback — fewer words, less likely to trip a content filter */
function buildSimplePropPrompt(p){
  const form = (p.form||"").replace(/\.$/,"").trim();
  const material = (p.material||"").replace(/\.$/,"").trim();
  const parts = [
    "Prop reference \u2014 "+(p.name||"object"),
    form||"",
    material ? (material) : "",
    "front view, side view, and close-up detail",
    "plain light grey background, studio product lighting, photoreal, sharp focus, no people"
  ].filter(Boolean);
  return parts.join(". ")+".";
}
window.buildSimplePropPrompt = buildSimplePropPrompt;

/* Headless prop-sheet generation — render + persist a prop's reference sheet WITHOUT
   the Props tab being mounted. Mirrors what a prop card's generate does (combined
   prompt → Nano Banana → commit as a 'prop' asset, with the same simplified retry on
   an empty result). Used by the character card's "generate props first" flow so the
   user can fill missing prop references without switching tabs. Resolves true on
   success, throws on a hard failure. */
async function generatePropSheet(p, project){
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const prompt = (typeof combinedPropPrompt==="function") ? combinedPropPrompt(p, project) : (p.name||"prop reference");
  const model  = (typeof nbGetModel==="function")  ? nbGetModel()  : "";
  const aspect = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  const size   = (typeof nbGetRes==="function")    ? nbGetRes()    : "2K";
  // register in the shared inflight registry so a mounted prop card shows the spinner
  // and the operation survives an Art Room tab switch (same infra as useImageGen).
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[p.id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, {}); }
    catch(e){
      // same fallback the card uses: an empty/"no image" result retries simplified
      if(/no image/i.test((e&&e.message)||"") && typeof buildSimplePropPrompt==="function"){
        url = await nbGenerate(buildSimplePropPrompt(p), {});
      } else { throw e; }
    }
    const now = new Date();
    const mEntry = (window.NB_MODELS||[]).find(m=>m.id===model) || {};
    const meta = { modelLabel: mEntry.label||"Nano Banana", modelId: model, aspect, size,
      date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
      time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
      iso: now.toISOString(), prompt, mode:"final", version:1 };
    await nbCommit(p.id, url, meta, [], "prop");
    // let any mounted card (the prop's own, or a char card watching its props) adopt it
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:p.id, url } })); }catch(e){}
    return true;
  } finally {
    window.__nbGenInflight[p.id] = false;
  }
}
window.generatePropSheet = generatePropSheet;

/* image-to-image from a dropped reference photo of the real object */
function buildPropFromPhotoPrompt(p, project){
  const style = p.renderStyle || "photoreal product reference, 85mm, soft even studio lighting";
  let s = "Master prop reference sheet \u2014 "+(p.name||"Object")+". ";
  s += "BASE OBJECT: reproduce EXACTLY the object shown in the reference photo \u2014 its shape, ";
  s += "proportions, colour, material and finish. Do not redesign or stylise it. ";
  s += (p.detail ? ("Significance: "+p.detail.replace(/\.$/,"")+". ") : "");
  s += "RENDER STYLE: "+style.replace(/\.$/,"")+". ";
  s += "6-panel 3\u00d72 grid on a solid neutral light-grey background: front, 3/4, side, back, top-down, "
     + "and an extreme close-up detail. Consistent scale, soft even studio product lighting, no people, "
     + "the SAME identical object in every panel, sharp focus. --ar 16:9";
  return s;
}
window.buildPropFromPhotoPrompt = buildPropFromPhotoPrompt;

function propVisualsDrafted(p){
  return !!((p.form||"").trim() && (p.material||"").trim());
}

/* a soft, neutral object swatch for the avatar dot (props have no character colour) */
function propSwatch(kind){
  return kind==="worn"
    ? "linear-gradient(135deg,#6a6cae,#26243f)"
    : "linear-gradient(135deg,#b8412e,#5a2018)";
}

function PropSheet({ p, project, characters, scenes, onUpdate, onDelete, onDraft, drafting, onView, batchActiveId, onBatchDone, onChipClick, onTagOne, taggingScene, dupIds, onMerge }){
  const d = propDefaults(p);
  const finalPrompt = combinedPropPrompt(p, project);
  const drafted = propVisualsDrafted(p);
  const initials = (p.name||"?").replace(/^the\s+/i,"").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();

  const gen = useImageGen({
    id: p.id, slotId: "propref-"+p.id,
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildPropFromPhotoPrompt(p, project),
    buildSimple: ()=> buildSimplePropPrompt(p),
    buildEdit: (instr)=>
      "Edit this prop reference sheet for "+(p.name||"the object")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else without alteration \u2014 the exact same object shape, proportions and identity "
      +"across all panels. Keep the same 3\u00d72 grid of views on a neutral grey background. "
      +"Do not replace or re-imagine the object.",
  });

  /* ---- batch generation: when the parent activates this card (its id == the
     batch's current id), kick off a generation and report completion so the
     queue advances. Watches gen.gening for the true->false transition. ---- */
  const batchStarted = React.useRef(false);
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===p.id;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){
      batchStarted.current = true; wasGening.current = false;
      gen.generate();                       // master prompt; works drafted or not
      return;
    }
    if(batchStarted.current && wasGening.current && !gen.gening){
      batchStarted.current = false;
      onBatchDone && onBatchDone(p.id);
    }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, p.id]);

  // scenes this prop appears in, as {no,id} sorted by story order
  const sceneById = React.useMemo(()=>{ const m={}; (scenes||[]).forEach(s=>{ m[s.id]=s; }); return m; },[scenes]);
  const propScenes = (p.scenes||[]).map(id=>sceneById[id]).filter(Boolean);

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===p.id?" batch-on":""),"data-prop-card":p.id},
    React.createElement(SheetFrame,{ gen, slotId:"propref-"+p.id, name:p.name, avatarColor:propSwatch(p.kind),
      initials, drafted, drafting, onDraft:()=>onDraft(p), entity:p, onView,
      slotPlaceholder:"Drop a photo of the object", noun:"prop sheet",
      specGate:{ ready:(drafted || !p.manual), hint:"Draft the design spec first \u2014 form & material are what the sheet is built from." },
      onDelete:()=>onDelete(p.id), deleteLabel:"Delete prop" }),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"sheet-name"},
            React.createElement(EditText,{value:p.name,placeholder:"Prop name\u2026",onCommit:val=>onUpdate(p.id,{name:val})})),
          React.createElement("div",{className:"sheet-role"},
            React.createElement("span",{className:"prop-kind-badge "+(p.kind==="worn"?"worn":"carried")},p.kind||"carried"),
            p.ownerName ? (" \u00b7 "+p.ownerName) : " \u00b7 unassigned"),
          (p.scenes!==undefined) && React.createElement("div",{className:"prop-scenes"},
            propScenes.length
              ? [ React.createElement("span",{key:"lab",className:"prop-scenes-lab"},"Scenes"),
                  ...propScenes.map(s=>React.createElement("button",{key:s.id,className:"prop-scene-chip",
                    title:s.title||("Scene "+s.no),onClick:()=>onChipClick&&onChipClick(s.id)},
                    String(s.no).padStart(2,"0"))) ]
              : React.createElement("span",{className:"prop-scenes-none"},"No scene appearances found"))),
        React.createElement("div",{className:"sheet-head-actions"},
          React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(p)},
            React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"),
          onTagOne && React.createElement("button",{className:"char-draft-btn ghost"+(taggingScene?" busy":""),disabled:!!taggingScene,onClick:()=>onTagOne(p),
            title:"Re-map which scenes this prop appears in \u2014 without re-drafting its spec. Use after the script changes."},
            React.createElement(Icon.layers,{s:12}), taggingScene?"Mapping\u2026":"Re-map scenes"))),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"Details not drafted yet \u2014 click ",
          React.createElement("b",null,"Draft details")," to fill the object's form & material.")),

      (dupIds && dupIds.length>1) && React.createElement("div",{className:"prop-dup-warn"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"Looks like the same object as ",
          React.createElement("b",null,(dupIds.length-1)+" other "+(dupIds.length>2?"cards":"card")),
          (p.ownerName?(" for "+p.ownerName):"")," \u2014 merge into one to combine their scenes."),
        React.createElement("button",{className:"prop-dup-merge",onClick:()=>onMerge&&onMerge(dupIds)},
          React.createElement(Icon.layers,{s:12}),"Merge "+dupIds.length)),

      React.createElement(CardFold,{label:"Object",defaultOpen:(!drafted && !!p.manual)},
        React.createElement("div",{className:"sheet-2col"},
          React.createElement("div",{className:"sheet-field"},
            React.createElement("div",{className:"obj-lab"},"Owner"),
            React.createElement("select",{className:"prop-select",value:p.ownerId||"",
              onChange:e=>{ const id=e.target.value; const ch=(characters||[]).find(c=>c.id===id);
                onUpdate(p.id,{ownerId:id, ownerName: ch?ch.name:""}); }},
              React.createElement("option",{value:""},"Unassigned"),
              (characters||[]).map(c=>React.createElement("option",{key:c.id,value:c.id},c.name)))),
          React.createElement("div",{className:"sheet-field"},
            React.createElement("div",{className:"obj-lab"},"Type"),
            React.createElement("select",{className:"prop-select",value:p.kind||"carried",
              onChange:e=>onUpdate(p.id,{kind:e.target.value, kindSet:true})},
              React.createElement("option",{value:"carried"},"Carried"),
              React.createElement("option",{value:"worn"},"Worn")))),
        React.createElement(SheetField,{label:"Form \u2014 shape & silhouette",value:p.form,multiline:true,
          placeholder:"What it is and what it looks like \u2014 shape, size, silhouette\u2026",onCommit:val=>onUpdate(p.id,{form:val})}),
        React.createElement(SheetField,{label:"Material & finish",value:p.material,multiline:true,
          placeholder:"What it's made of \u2014 metal, plastic, fabric; sheen, wear, texture\u2026",onCommit:val=>onUpdate(p.id,{material:val})})),

      React.createElement(CardFold,{label:"Significance",defaultOpen:false},
        React.createElement(SheetField,{label:"What it means in the story",value:p.detail,multiline:true,
          placeholder:"Why this object matters \u2014 what it represents, how it's used\u2026",onCommit:val=>onUpdate(p.id,{detail:val})})),

      React.createElement(CardFold,{label:"Look dev",defaultOpen:false},
        React.createElement(SheetField,{label:"Render style",value:p.renderStyle||d.renderStyle,multiline:true,
          placeholder:"photoreal product reference, 85mm, soft studio lighting\u2026",onCommit:val=>onUpdate(p.id,{renderStyle:val})})),

      React.createElement(CardFold,{label:"Master reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"6-panel turnaround \u2014 feed to your image tool",text:buildPropRefPrompt(p,project)}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:p.negativePrompt||d.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(p.id,{negativePrompt:val})}),
        React.createElement(CopyBox,{label:"Final prompt \u2014 master + negative (sent to Nano Banana)",text:finalPrompt}))));
}

function PropSheets({ project, props, characters, scenes, onUpdate, onDraft, onDraftAll, onAdd, onDelete, draftingId, draftingAll, onSeedFromCast, castHasProps, onTagScenes, taggingScenes, onTagOne, taggingSceneId, onMergeProps, onPropsMaster, lookbookStale, onApplyLookbook }){
  const [view, setView] = React.useState(null);   // {url, character/prop}
  const [sceneFilter, setSceneFilter] = React.useState("");   // "" = all
  const [query, setQuery] = React.useState("");               // free-text name/owner search
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = props || [];
  const sceneList = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const tagged = list.some(p=>p.scenes!==undefined);
  const inScene = (p, sid)=> Array.isArray(p.scenes) && p.scenes.indexOf(sid)>=0;
  // free-text search matches a prop's name or its owner's name (whitespace-trimmed,
  // case-insensitive). Stacks on top of the scene filter so the two narrow together.
  const q = query.trim().toLowerCase();
  const matchesQuery = (p)=> !q
    || (p.name||"").toLowerCase().indexOf(q)>=0
    || (p.ownerName||"").toLowerCase().indexOf(q)>=0;
  const shown = (sceneFilter ? list.filter(p=>inScene(p, sceneFilter)) : list).filter(matchesQuery);
  // 9-up pagination; suspended while a batch runs so the queue can reach every card
  const pager = usePager(shown.length, !!batchActiveId);
  // duplicate detection: map each prop id -> the set of ids it duplicates (same owner + object)
  const dupSets = (typeof findDuplicateProps==="function") ? findDuplicateProps(list) : {};
  const dupForId = {}; Object.values(dupSets).forEach(ids=> ids.forEach(id=>{ dupForId[id]=ids; }));

  // one-time sanity pass: correct props whose NAME unambiguously contradicts their
  // worn/carried kind (e.g. a phone mis-filed as "worn"). Skips any the user has
  // deliberately set (kindSet) so a manual choice is never overridden.
  const kindFixed = React.useRef(false);
  React.useEffect(()=>{
    if(kindFixed.current || typeof classifyPropKind!=="function" || !list.length) return;
    kindFixed.current = true;
    list.forEach(p=>{
      if(p.kindSet) return;
      const k = classifyPropKind(p.name);
      if(k && k!==(p.kind||"carried")) onUpdate(p.id, { kind:k });
    });
  },[list.length]);

  // When a prop is added BY HAND (manual flag), bring it into view: clear any scene
  // filter that would hide a scene-less new prop, then smooth-scroll the Art Room
  // scroller to the new card. Cast-pull / derived props are not manual, so a bulk
  // pull never yanks the viewport around.
  const prevIdsRef = React.useRef(null);
  React.useEffect(()=>{
    const ids = list.map(p=>p.id);
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if(!prev) return;                                  // first render — nothing to compare
    const added = list.find(p=>prev.indexOf(p.id)<0);
    if(!added || !added.manual) return;                // only react to a hand-added prop
    if(sceneFilter) setSceneFilter("");                // make sure the new (scene-less) card renders
    let tries = 0;
    const tick = ()=>{
      const el = document.querySelector('[data-prop-card="'+added.id+'"]');
      const scroller = el && el.closest('.artroom');
      if(el && scroller){
        const target = Math.max(0, scroller.scrollTop + (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - 16);
        // smooth tween — scrollTo({behavior:"smooth"}) is a no-op in this runtime
        const start = scroller.scrollTop, dist = target - start, t0 = performance.now(), dur = 420;
        const ease = x => 1 - Math.pow(1 - x, 3);
        const step = (now)=>{
          const k = Math.min(1, (now - t0) / dur);
          scroller.scrollTop = start + dist * ease(k);
          if(k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        return;
      }
      if(tries++ < 10) requestAnimationFrame(tick);    // wait for the card to mount
    };
    requestAnimationFrame(tick);
  },[list]);

  // ---- batch generation ----
  // eligible = drafted props (so a hand-added, undrafted/gated card never makes a
  // generic image). Cards that already have a sheet are caught by the begin() partition.
  const draftedIds = (subset)=> subset.filter(p=>propVisualsDrafted(p)).map(p=>p.id);
  const startSceneBatch = ()=>{
    if(!sceneFilter || batchActiveId) return;
    const eligible = draftedIds(shown);
    if(!eligible.length){ batch.setMsg("Draft these props first \u2014 nothing in this scene is ready to generate."); return; }
    batch.begin(eligible, shown.length - eligible.length);
  };
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Draft the props first \u2014 nothing is ready to generate yet."); return; }
    if(sceneFilter) setSceneFilter("");            // mount every card so the queue can reach each one
    batch.begin(eligible, list.length - eligible.length);
  };
  const eligibleAll = list.filter(p=>propVisualsDrafted(p)).length;
  const sceneNoOf = (sid)=>{ const s=(scenes||[]).find(x=>x.id===sid); return s?s.no:sid; };

  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Props Master",
            React.createElement(window.InfoTip,{label:"About Props",
              text:"Continuity objects \u2014 the things characters wear and carry, plus the set dressing the camera sees. Each gets its own multi-view reference sheet so the object stays identical in every shot. 'Design all props' builds every prop from the story in one pass \u2014 pulls missing items from the cast, drafts each spec, and maps every prop to its scenes; 'Generate all props' then renders the sheets."}))),
        React.createElement("div",{className:"art-intro-actions"},
          React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
            React.createElement(Icon.plus,{s:14}),"Add prop"),
          React.createElement("button",{className:"art-draftall",disabled:draftingAll||(!list.length&&!castHasProps),onClick:onDraftAll,
            title:"Build every prop from the story in one pass \u2014 pull missing items from the cast, draft each spec (object, significance, look dev) from the script, and map every prop to the scenes it appears in"},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Design all props"),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the reference sheet for every drafted prop \u2014 you choose whether to redo ones that already have a sheet"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all props")))),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,label:"these props",dept:"props"}),
    BatchBar && React.createElement(BatchBar,{batch,noun:"prop"}),
    // free-text search — filter prop cards by name or owner as you type
    (list.length>0 || (tagged && sceneList.length>0)) && React.createElement("div",{className:"prop-toolbar"},
      list.length>0 && React.createElement("div",{className:"prop-searchbar"},
      React.createElement(Icon.search,{s:14}),
      React.createElement("input",{className:"prop-search-input",type:"text",value:query,
        placeholder:"Search props by name or owner…",
        onChange:e=>setQuery(e.target.value),
        onKeyDown:e=>{ if(e.key==="Escape") setQuery(""); }}),
      q && React.createElement("span",{className:"prop-search-count"},
        shown.length+" of "+list.length),
      q && React.createElement("button",{className:"prop-search-clear",title:"Clear search",
        onClick:()=>setQuery("")},React.createElement(Icon.x,{s:13}))),
    // scene filter + per-scene batch generate
    tagged && sceneList.length>0 && React.createElement("div",{className:"prop-scenebar"},
      React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.layers,{s:13}),"Focus a scene"),
      React.createElement("select",{className:"prop-select prop-scenebar-select",value:sceneFilter,
        onChange:e=>setSceneFilter(e.target.value)},
        React.createElement("option",{value:""},"All scenes \u2014 show every prop"),
        sceneList.map(s=>{
          const n = list.filter(p=>inScene(p,s.id)).length;
          return React.createElement("option",{key:s.id,value:s.id},
            "Scene "+String(s.no).padStart(2,"0")+" \u00b7 "+(s.title||"")+"  ("+n+" prop"+(n!==1?"s":"")+")");
        })),
      sceneFilter && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId,onClick:startSceneBatch,
        title:"Generate reference sheets for the props in this scene \u2014 you choose whether to redo ones that already have a sheet"},
        React.createElement(Icon.sparkles,{s:14}),
        batchActiveId?"Generating\u2026":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0"))))),
    list.length
      ? (shown.length
          ? React.createElement(React.Fragment,null,
              React.createElement("div",{className:"sheet-grid"},
                pager.slice(shown).map(p=>React.createElement(PropSheet,{key:p.id,p,project,characters,scenes,onUpdate,onDelete,onDraft,
                  drafting:draftingId===p.id||draftingAll,onView:(url,pr)=>setView({url,character:pr}),
                  batchActiveId,onBatchDone:batch.advance,onChipClick:(sid)=>setSceneFilter(sid),
                  onTagOne,taggingScene:taggingSceneId===p.id,
                  dupIds:dupForId[p.id],onMerge:onMergeProps}))),
              React.createElement(PagerBar,{pager,noun:"prop"}))
          : q
            ? React.createElement("div",{className:"prop-empty"},
                React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon.search,{s:28})),
                React.createElement("div",{className:"art-soon-t"},"No props match \u201c"+query.trim()+"\u201d"),
                React.createElement("div",{className:"art-soon-d"}, sceneFilter
                  ? "Nothing in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")+" matches that search. Clear the search or pick another scene."
                  : "No prop name or owner matches that search."),
                React.createElement("button",{className:"art-draftall",style:{marginTop:16},onClick:()=>setQuery("")},"Clear search"))
            : React.createElement("div",{className:"prop-empty"},
                React.createElement("div",{className:"art-soon-t"},"No props appear in this scene"),
                React.createElement("div",{className:"art-soon-d"},"Nothing the cast wears or carries was found in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")+". Try another scene, or run \u201cDesign all props\u201d to re-map."),
                React.createElement("button",{className:"art-draftall",style:{marginTop:16},onClick:()=>setSceneFilter("")},"Show all props")))
      : React.createElement("div",{className:"prop-empty"},
          React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon.box,{s:30})),
          React.createElement("div",{className:"art-soon-t"},"No props yet"),
          React.createElement("div",{className:"art-soon-d"}, castHasProps
            ? "Your cast already lists worn & carried items on their character sheets \u2014 \u201cDesign all props\u201d pulls them in, drafts each spec, and maps their scenes in one pass. Or add one by hand."
            : "Add a prop to start building its reference sheet \u2014 a weapon, a phone, a talisman, anything that recurs across scenes."),
          React.createElement("div",{style:{display:"flex",gap:8,marginTop:16}},
            castHasProps && React.createElement("button",{className:"art-draftall",disabled:draftingAll,onClick:onDraftAll},
              React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Design all props"),
            React.createElement("button",{className:castHasProps?"art-draftall ghost":"art-draftall",onClick:onAdd},
              React.createElement(Icon.plus,{s:14}),castHasProps?"Add by hand":"Add your first prop"))));
}
window.PropSheets = PropSheets;
