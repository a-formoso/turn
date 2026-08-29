/* props.jsx — The Art Room ▸ Props tab.
   Continuity objects (worn or carried) get their own reference sheet so an object
   looks identical in every shot it appears in. Mirrors the Character Sheets flow:
   each prop card has Draft (AI fills form/material/detail from the script) and
   Generate (Nano Banana → a multi-view product sheet). Reuses the shared
   useImageGen hook + SheetFrame so the generation machinery stays in one place. */

/* PROSE prop prompt (2026-06-15, reverted from JSON at the user's request): a single
   descriptive line \u2014 "Prop concept art sheet, <name + description>, full 360-degree
   turnaround (front center / side middle / back right), <off-white background + soft
   contact shadow>, made of <material>, ~<scale>, right side: 3 detail shots, <render
   style>, \u2026". The render style comes from the card's dropdown (photoreal default). Owner
   matching is no longer carried in the prompt text \u2014 a worn/owned prop's OWNER character
   sheet rides in as a REFERENCE IMAGE (see generatePropSheet / the card's attachments)
   plus propOwnerNote, which matches the prop to the character far better than a text tag. */
/* the style KEY a prop inherits when its card has NO explicit pick: its OWNER's style
   (a worn/carried object lives in the owner's world — the owner-sheet reference image
   already says "match this character", so the TEXT must agree), else — for ownerless
   set dressing — the style of the location it's a fixture of (explicit locationId, or
   every mapped scene resolving to one place), else "" (the shared default applies).
   Explicit picks (p.renderStyleKey) and hand-edited text (p.renderStyle) always win. */
function propInheritedStyleKey(p){
  try{
    const C = window.turnContinuity || {};
    if(p && p.ownerId){
      const c = (C.characters||[]).find(x=>x && x.id===p.ownerId);
      if(c){
        const k = (typeof inferCharacterRenderStyleKey==="function") ? inferCharacterRenderStyleKey(c) : (c.renderStyleKey||"");
        if(k && k!=="surprise") return k;
      }
      return "";
    }
    const loc = propHomeLocation(p);
    if(loc && loc.renderStyleKey && loc.renderStyleKey!=="surprise") return loc.renderStyleKey;
  }catch(e){}
  return "";
}
window.propInheritedStyleKey = propInheritedStyleKey;

function buildPropRefPrompt(p, project){
  const clean = (x)=>String(x||"").replace(/\.$/,"").trim();
  const name = p.name || "Object";
  const form = clean(p.form);
  const material = clean(p.material);
  const detail = clean(p.detail);
  const relation = clean(p.relation);   // how the owner relates to it — drives wear & condition
  const externalRefs = Array.isArray(p.referenceImages) ? p.referenceImages.filter(r=>r&&r.url) : [];
  const _size = clean(p.size);
  const scale = p.kind==="worn" ? ("wearable, true-to-body scale"+(_size?(", "+_size):""))
              : p.kind==="carried" ? ("handheld scale"+(_size?(", "+_size):""))
              : p.kind==="dressing" ? ("environment fixture at true physical scale"+(_size?(": "+_size):" as described"))
              : (_size ? ("true physical size: "+_size) : "true real-world scale as described");
  // render style: card dropdown / Surprise me → hand-edited text → INHERITED from the
  // owner (or fixture location) when the card was never touched → shared default
  const _styleKey = p.renderStyleKey || propInheritedStyleKey(p);
  const styleText = (p.renderStyleKey==="surprise" && p.surpriseRender && p.surpriseRender.style)
    ? p.surpriseRender.style
    : (clean(p.renderStyle)
       || (typeof window.renderStyleText==="function" ? window.renderStyleText("prop", _styleKey) : (window.PROP_RENDER_TEXT||{})[_styleKey||(window.turnDefaultRenderStyleKey?window.turnDefaultRenderStyleKey():"photoreal")])
       || (window.PROP_RENDER_TEXT||{}).photoreal || "hyper realistic photography, photorealistic 8k");
  // off-white / light-neutral background with a soft contact shadow (matches the cast sheets)
  const bg = "flat off-white / very light neutral panel background, even and clean, with a simple soft contact shadow beneath the object";
  // 4-PANEL object reference sheet: hero, front, side and detail, thin dividers,
  // 16:9, no baked text. The old "360 turnaround + 3-up detail column" is folded
  // into binding CONTINUITY fields (material / signature feature) so every panel
  // stays faithful without extra panels.
  const spec = {
    subject: name + (form ? (", "+form) : ""),
    object: {
      form: form || undefined,
      material: material || undefined,
      signature_feature: detail || undefined,
      owner_relationship: relation || undefined,
      scale: scale,
      scale_against_owner: (p.ownerId && clean(p.scale)) || undefined,
    },
    layout: {
      format: "a 4-panel object reference sheet in 16:9 landscape: four EQUAL-width tall vertical panels divided by thin clean vertical lines \u2014 hero, front, side and detail; the SAME object throughout",
      panels_left_to_right: [
        "PANEL 1 \u2014 large HERO three-quarter view of the object, its most identifying angle, filling the panel, the exact identity anchor (approximately "+scale+")",
        "PANEL 2 \u2014 straight-on FRONT elevation of the whole object, sharing a baseline with the side view in panel 3",
        "PANEL 3 \u2014 SIDE PROFILE view rotated 90\u00b0 from the front, showing the object's true depth and thickness, at the SAME size and baseline as the front view",
        "PANEL 4 \u2014 DETAIL macro close-up "+(detail?("of its signature feature \u2014 "+((typeof clipWords==="function")?clipWords(detail,70):detail.slice(0,70))+" \u2014 and its "):"of the object's ")+"material & construction: fastenings, joins, edges, surface finish and wear"
      ],
      panel_widths: "all four panels are EQUAL width \u2014 a clean, evenly divided turnaround, NOT a wider hero panel (each whole-object view needs comparable readable space)",
      one_object_rule: "EXACTLY ONE object per panel \u2014 no duplicates, no exploded parts, no alternate colourways, no accessories that aren't part of the object itself",
      scale_rule: "the FRONT (panel 2) and SIDE (panel 3) views are the SAME size and share a baseline; the hero and detail panels may frame the object differently",
      no_extra_views: "do not add a BACK view, extra turnaround angles, exploded diagrams, rulers, dimension lines, captions, labels, title text, measurement text, or ANY info box (no name, size or material printed on the image \u2014 that metadata travels in the prompt, never baked into pixels)",
      background: bg
    },
    continuity: {
      identity_rule: "the SAME identical object \u2014 form, colour, materials, wear and construction \u2014 in every view",
      material_rule: material ? ("rendered in "+material+", with accurate surface texture and finish in every panel") : "accurate, consistent material and finish in every panel",
      feature_rule: detail ? ("its signature feature \u2014 "+((typeof clipWords==="function")?clipWords(detail,90):detail.slice(0,90))+" \u2014 present and consistent in every view") : undefined,
      relationship_rule: relation ? ("the owner's relationship to it \u2014 "+((typeof clipWords==="function")?clipWords(relation,90):relation.slice(0,90))+" \u2014 is visible in its condition: wear, repairs, handling marks and how carefully it has been kept") : undefined,
      harvested_reference_rule: externalRefs.length ? ("Use the attached selected-item/whole-sheet reference image"+(externalRefs.length>1?"s":"")+" as world-consistency guidance for this object's design language, material wear, likeness when the prop depicts a person, lighting feel and belonging in the same film world; do not copy unrelated surrounding scenery from the source image.") : undefined,
    },
    render: {
      style: styleText,
      aspect: "16:9",
      rules: ["no text, labels, watermarks, annotations, typography or captions",
              "accurate material rendering, natural surface textures, soft studio lighting",
              "consistent object design, materials and lighting across all panels",
              "clean, evenly divided panel layout"],
    },
    style_name: ((p.renderStyleKey==="surprise" && p.surpriseRender && p.surpriseRender.label)
      ? p.surpriseRender.label
      : ((window.RENDER_STYLE_LABELS||{})[_styleKey||"photoreal"] || undefined)),
  };
  return "Render this object reference sheet EXACTLY as specified by this JSON spec (continuity fields are binding):\n"+JSON.stringify(spec, null, 1);
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
    .map(x=> x.replace(/^(?:and|then|&)\s+/i,"").trim())                      // a prose split leaves "and a ..." — drop the conjunction
    .map(x=> /^\([^)]*$/.test(x) ? x+")" : x)                                 // close a dangling "(unfinished"
    .filter(x=> x && x.replace(/[^a-z0-9]/gi,"").length>1                     // need real content, not just punctuation
      && !/^(none|n\/a|nil|various|misc\.?|etc\.?)$/i.test(x))
    .reduce(_mergeDanglingFragment, []);
}
/* "A thin, unpolished silver band" splits into "A thin" + "unpolished silver band" —
   the first fragment is an article + bare descriptor with no object in it, so it
   belongs to the item that follows. Re-join it. */
function _mergeDanglingFragment(acc, x, i, arr){
  const prev = acc[acc.length-1];
  const dangling = (s)=> /^(?:a|an|the)\s+\w+$/i.test(String(s||"").trim())
    && !(typeof propHeadNoun==="function" && propHeadNoun(s));
  if(prev!==undefined && dangling(prev)){ acc[acc.length-1] = prev+", "+x; return acc; }
  acc.push(x); return acc;
}
window._mergeDanglingFragment = _mergeDanglingFragment;
/* classify a prop as worn vs carried FROM ITS NAME, independent of which character
   field it was filed under. The visual-bible AI sometimes mis-files a handheld object
   (a phone, a gun) under a character's worn "accessories", or vice-versa; this is the
   sanity check propsFromCast lacked. Returns "carried" | "worn" | "" (unsure → keep
   the source field's kind). Only fires on UNAMBIGUOUS nouns so a deliberate choice is
   never second-guessed. */
/* word-boundary search match — the query must begin a WORD in the text (case-insensitive),
   so single letters / mid-word fragments don't match noise (e.g. "h" ≠ "throat"). Shared by
   the Props / Characters / Locations search boxes. */
function searchWordMatch(text, q){
  q = String(q||"").trim().toLowerCase(); if(!q) return true;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try{ return new RegExp("\\b"+esc, "i").test(String(text||"")); }
  catch(e){ return String(text||"").toLowerCase().indexOf(q)>=0; }
}
window.searchWordMatch = searchWordMatch;

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
/* SET DRESSING nouns — furniture and fixtures that live in a place rather than on a
   body: a hollow log, a bench, an apartment's wardrobe. Deliberately unambiguous words
   only (no "lamp"/"mirror"/"clock", which are as often handheld). Only consulted for
   OWNERLESS objects — an owned item is by definition worn or carried. */
const PROP_DRESSING_WORDS = ["log","stump","trunk","branch","bough","root","bloom","blossom","flower","plant","tree",
  "bush","shrub","reed","reeds","moss","mushroom","toadstool","rock","boulder","stone","pebble","bench","table","chair",
  "armchair","sofa","couch","settee","bed","cot","bunk","desk","shelf","shelves","bookcase","cabinet","cupboard",
  "wardrobe","dresser","nightstand","stool","door","doorway","gate","fence","picket","railing","sign","signpost",
  "signage","statue","sculpture","fountain","altar","throne","fireplace","hearth","stove","oven","counter","countertop",
  "workbench","booth","curtain","curtains","drapes","rug","carpet","tapestry","chandelier","web","cobweb","nest","hive",
  "pillar","column","arch","archway","bridge","well","anvil","forge","loom","barrel","cauldron","trough","manger",
  "pew","podium","lectern","monument","obelisk","totem","scaffold","awning","canopy","trellis","planter","pond","pool"];
function classifyPropKind(name, opts){
  // FIXTURE PHRASING beats the noun: "a lantern STRUNG on a thread" is installed at a
  // place, not carried — the mounting words say more than the object word does
  if(/\b(strung|hung|hanging|mounted|nailed|bolted|anchored|staked|planted|fixed to|built into|embedded)\b/i.test(String(name||""))
     && !!(opts && opts.ownerless)) return "dressing";
  const carried = _propWordHit(name, PROP_CARRIED_WORDS);
  const worn = _propWordHit(name, PROP_WORN_WORDS);
  // dressing only competes for OWNERLESS objects (opts.ownerless) — existing callers
  // that classify a character's own items keep the original worn/carried behaviour
  const dressing = !!(opts && opts.ownerless) && _propWordHit(name, PROP_DRESSING_WORDS);
  const hits = [carried&&"carried", worn&&"worn", dressing&&"dressing"].filter(Boolean);
  return hits.length===1 ? hits[0] : "";   // unknown or conflicting -> defer to the source
}
window.classifyPropKind = classifyPropKind;
window.propSlug = propSlug;

/* the location an ownerless object is a FIXTURE OF: the explicit link, else the one
   location every mapped scene resolves to (mobile objects spanning places get none). */
function propHomeLocation(p){
  try{
    const C = window.turnContinuity || {};
    const locs = C.locations||[];
    if(p && p.locationId) return locs.find(l=>l && l.id===p.locationId) || null;
    if(p && !p.ownerId && (p.scenes||[]).length && typeof locationForScene==="function"){
      const homes = [...new Set(p.scenes.map(sid=>{ const l=locationForScene(locs, sid); return l&&l.id; }).filter(Boolean))];
      if(homes.length===1) return locs.find(l=>l && l.id===homes[0]) || null;
    }
  }catch(e){}
  return null;
}
window.propHomeLocation = propHomeLocation;

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
  const list = props || [];
  const head0 = (n)=> propHeadNoun(n) || ("name:"+propSlug(n));
  const dups = {};
  // OWNED props: same owner + same object noun is the same prop (reliable).
  const groups = {};
  list.forEach(p=>{ if(!p.ownerId) return; const key = p.ownerId+"##"+head0(p.name);
    (groups[key]=groups[key]||[]).push(p.id); });
  Object.keys(groups).forEach(k=>{ if(groups[k].length>1) dups[k]=groups[k]; });
  // OWNERLESS set dressing: the same head noun is NOT enough — "Forearm maintenance latch"
  // and "Seized door latch" are different objects that share "latch". Cluster only names
  // that ALSO share a significant modifier word, or where one name's words are a subset of
  // the other (so the two dolls merge, the three latches don't).
  const sigWords = (name)=> new Set(String(name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ")
    .split(/\s+/).filter(w=>w.length>=4 && !/^[0-9]+$/.test(w)));
  // a head noun even for objects outside propHeadNoun's vocabulary (doll, latch, box…):
  // the recognised noun, else the LAST significant word of the name.
  const headNoun = (name)=>{ const h=propHeadNoun(name); if(h) return h;
    const w=String(name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(x=>x.length>=3 && !/^[0-9]+$/.test(x));
    return w.length ? w[w.length-1] : ("name:"+propSlug(name)); };
  const ownerless = list.filter(p=>!p.ownerId);
  const used = new Set();
  ownerless.forEach((p,i)=>{
    if(used.has(p.id)) return;
    const head = headNoun(p.name); const pw = sigWords(p.name); const cluster=[p.id];
    ownerless.slice(i+1).forEach(q=>{
      if(used.has(q.id) || headNoun(q.name)!==head) return;
      const qw = sigWords(q.name);
      const shareMod = [...pw].some(w=> w!==head && qw.has(w));
      const subset = ([...pw].length && [...pw].every(w=>qw.has(w))) || ([...qw].length && [...qw].every(w=>pw.has(w)));
      if(shareMod || subset){ cluster.push(q.id); used.add(q.id); }
    });
    if(cluster.length>1){ used.add(p.id); dups["set##"+head+"##"+i] = cluster; }
  });
  return dups;
}
window.findDuplicateProps = findDuplicateProps;

function propsFromCast(characters, existing, scenes, drafts){
  const have = existing || [];
  // WORN items belong to their owner, so they're present wherever the owner is — map them
  // to owner-presence at seed time (carried items stay unmapped; the AI pins those exactly
  // later). Without this the bible showed worn props with an empty scene list.
  const wornScenes = (ownerId, name)=> (scenes && scenes.length && typeof scenesWhereCharacterAppears==="function")
    ? scenesWhereCharacterAppears(ownerId, name, scenes, drafts) : null;
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
      const card = {
        id: "prop-"+(c.id||"x")+"-"+kind+"-"+propSlug(item)+"-"+(out.length),
        name: item.replace(/^\w/, m=>m.toUpperCase()),
        kind, ownerId: c.id||"", ownerName: c.name||"",
        form:"", material:"", detail:"", renderStyle:"", negativePrompt:"",
        fromCast:true,
      };
      if(kind==="worn"){ const sc = wornScenes(c.id, c.name); if(sc) card.scenes = sc; }
      out.push(card);
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
    // empty style text falls back through the card's PICKED renderStyleKey, then the
    // INHERITED owner/location style — never straight to photoreal over a stylized world
    renderStyle: p.renderStyle || ((typeof window.renderStyleText==="function")
      ? window.renderStyleText("prop", p.renderStyleKey || propInheritedStyleKey(p))
      : "photoreal product reference, 85mm, soft even studio lighting, sharp focus"),
  };
}

/* Render-style text per key — the prop card uses the SAME dropdown options as the cast
   (window.CHAR_RENDER_STYLE_OPTIONS, incl. "Surprise me ✨"); picking a concrete key
   writes this prop-tuned recipe into p.renderStyle, which buildPropRefPrompt feeds into
   the sheet's render.style. "surprise" is AI-invented per prop (aiSurpriseStyleText). */
const PROP_RENDER_TEXT = {
  photoreal: "photoreal product reference, 85mm macro, soft even studio lighting, sharp focus, true-to-life materials",
  graphicNovelNoir: "black-and-white graphic-novel object illustration, bold ink contours, heavy spot blacks and screentone shading, hard noir side light, strictly monochrome",
  ukiyoe: "ukiyo-e woodblock print of the object, flat mineral-pigment colour, calligraphic keyblock outline, washi paper texture, Edo-period palette, no Western shading",
  paperCutout: "paper cut-out object, flat scissor-cut paper shapes in shallow stacked layers, real drop shadows between layers, visible construction-paper grain, handmade collage feel",
  photorealNatural: "natural-history macro photoreal reference, real-world biological materials, believable anatomy-adjacent texture, skin/fur/scales/chitin/wing micro-detail, moisture, soft specimen-studio light, minimal stylization",
  photorealCreature: "cinematic photoreal creature-shop prop/object reference, practical effects and VFX maquette realism, tactile prosthetic materials, controlled studio light, physically plausible screen design",
  photorealOrnamental: "photoreal ornamental object reference, couture/ceremonial/jewelry-like or armor-like detailing, iridescent surfaces, polished metal/glass/crystal accents, premium studio light",
  render3d:  "stylized 3D product render, clean studio HDRI lighting, physically-based materials, soft ambient occlusion, subtle bevels",
  anime:     "anime cel-shaded product illustration, clean confident linework, flat shading with soft gradients, no photoreal texture",
  flat:      "flat vector graphic, bold clean shapes, minimal flat shading, limited palette, no gradients, no photoreal texture",
  horror:    "low-key cinematic horror photography of the object, hard cold side light, deep crushed shadows, desaturated cold green-teal grade, damp grimy detail",
  ghibli:    "soft hand-painted Studio Ghibli-style 2D object, fine warm hand-drawn linework, gentle painterly cel shading, warm earthy naturalistic palette",
  animated3d:"polished animated-feature 3D product render, soft warm flattering light, appealing clean PBR materials, idealized finish, no noise",
  pixar:     "Pixar-style animated-feature 3D object, soft warm flattering light, appealing rounded stylized form, clean tactile PBR materials, idealized charming finish, no noise",
  storyboardconcept:"clean storyboard / production concept object reference, expressive linework, clear silhouette, restrained color wash, readable production-board detail",
  texturedcomic:"textured contemporary comic-art object reference, bold ink contours, etched hatching, limited palette, dramatic graphic light, visible grain",
  whimsicalwatercolor:"whimsical watercolor and fine-ink object reference, transparent washes, paper grain, delicate hand-drawn line, soft storybook charm",
  stopmotion:"photograph of a real handmade stop-motion prop, sculpted silicone/felt/wood at miniature scale, soft practical macro light, shallow depth of field",
  claymation:"photograph of a real plasticine claymation prop, rounded clay forms with thumbprints and tool marks, soft practical macro light, shallow depth of field",
  adv1960s:  "1960s painted commercial illustration of the object, smooth airbrushed gouache, vintage halftone print texture, mid-century mustard/avocado/teal palette",
  gaganime:  "1990s gag-anime 2D cel cartoon object, thick bold black outlines, flat high-saturation colors, simple graphic shadows, sticker-poster finish",
  pixelart:  "retro 16/32-bit pixel-art object, hard square pixels, no anti-aliasing, limited indexed palette, dithered shading, crisp pixel outlines",
};
Object.assign(PROP_RENDER_TEXT, {
  modernAnime:"modern cinematic anime object reference, clean sharp linework, polished cel shadows, vibrant contemporary colour",
  digitalAnime:"polished digital anime object illustration, smooth refined rendering, clean line art, luminous colour, glossy highlights",
  roughSketchAnime:"rough sketch anime object concept, visible pencil/ink strokes, flat colour, light hatching, production-design energy",
  painterlyAnime:"painterly anime object reference, delicate line, soft blended brushwork, dreamy atmospheric colour wash",
  cartoon3d:"stylized 3D cartoon object render, bold simplified forms, clean animated-feature lighting, rounded appeal",
  textured3dCartoon:"textured 3D cartoon object render, felt/clay/fabric/fuzzy tactile surfaces, soft studio light",
  stylizedCartoon:"stylized cartoon object illustration, bold outlines, flat colour areas, theatrical graphic shape design",
  grittyDigital:"gritty digital illustration object reference, expressive linework, harsh light, textured shadows, high contrast",
  softPainterly:"soft painterly object illustration, visible brushstrokes, blended colour, warm handmade texture",
  realisticDigitalDrawing:"realistic digital drawing object reference, believable light, detailed material texture, illustrated not photographic",
  flatDesign:"flat design object illustration, simplified geometric shapes, bold colour, minimal shading",
  minimalistLine:"minimalist line-art object reference, sparse elegant contour, warm paper, one small accent colour",
  vintageChildrensBook:"vintage children’s book object illustration, loose ink outline, limited spot colour, aged paper print texture",
  tactileMixedMedia:"tactile mixed-media object reference, handmade fabric/felt/paper/paint/sculpted materials, miniature photographed craft",
  texturedPaperSculpture:"textured paper sculpture object reference, folded layered paper, visible fibres, photographed tabletop craft",
  texturedPaperIllustration:"textured paper illustration object reference, collage layers, stippled print grain, cut-paper edges",
  tropicalArtNouveau:"tropical Art Nouveau object illustration, flowing organic lines, botanical motifs, flat ornamental colour",
});
window.PROP_RENDER_TEXT = PROP_RENDER_TEXT;

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
    "4-panel object sheet: hero three-quarter view, front elevation, side profile, and detail macro",
    "plain light grey background, studio product lighting, "
      +((String(p.renderStyle||((typeof window.renderStyleText==="function")?window.renderStyleText("prop",p.renderStyleKey||propInheritedStyleKey(p)):"")).split(/[;,]/)[0].trim())||"photoreal")
      +", sharp focus, no people"
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
/* the owner's generated character sheet — a worn/owned prop references it so the prop
   matches that character's style, materials, palette and wear (they belong to the same
   world / the same body). Returns "" if the owner has no generated sheet yet. */
async function propOwnerSheetUrl(p){
  if(!p || !p.ownerId) return "";
  let u = (typeof nbGetImage==="function") ? nbGetImage(p.ownerId) : "";
  if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(p.ownerId); }catch(e){} }
  return u || "";
}
window.propOwnerSheetUrl = propOwnerSheetUrl;
/* the instruction that tells the model to match the referenced character sheet. */
function propOwnerNote(p){
  const who = (p && p.ownerName) || "the owner";
  const rel = (p && p.relation) ? String(p.relation).replace(/\.$/,"").trim() : "";
  const relNote = rel ? (" "+who+"'s relationship to this object: "+rel+" \u2014 let that history show in its condition, wear and repairs.") : "";
  return ((p && p.kind==="worn")
    ? "Reference image: "+who+"'s character sheet. This prop is WORN by "+who+" — render it in the SAME visual style, materials, colour palette, surface wear and finish as that character, so it looks like it belongs on their body."
    : "Reference image: "+who+"'s character sheet. Render this prop in the SAME visual style, palette and world as that character so it reads as theirs.") + relNote;
}
window.propOwnerNote = propOwnerNote;

/* shared useImageGen plumbing for prop sheets (the base card AND state variants):
   the owner's character sheet rides as the style/belonging anchor, tagged refId so
   anchor recording stays transaction-derived. */
function propOwnerAttachments(p){
  return async ()=>{
    const out = [];
    const u = (typeof propOwnerSheetUrl==="function") ? await propOwnerSheetUrl(p) : "";
    if(u) out.push({ url:u, note:(p.ownerName||"owner")+" character sheet", refId:p.ownerId });
    for(const r of (Array.isArray(p.referenceImages)?p.referenceImages:[]).filter(Boolean).slice(0,6)){
      // A linked sheet may have been regenerated since it was attached. Resolve the
      // canonical entity now instead of reusing the URL captured at attach time.
      let refUrl = "";
      if(r.sourceEntityId){
        try{ refUrl = (typeof nbGetImage==="function") ? nbGetImage(r.sourceEntityId) : ""; }catch(e){}
        if(!refUrl && typeof nbLoadImage==="function"){
          try{ refUrl = await nbLoadImage(r.sourceEntityId); }catch(e){}
        }
      }
      refUrl = refUrl || r.url || r.sourceUrl || "";
      if(!refUrl) continue;
      out.push({ url:refUrl, kind:"prop-reference-image",
        note:(r.note||"visual reference")+" \u2014 from "+(r.sourceName||"another Art Room sheet")+" as a consistency reference",
        refId:r.sourceEntityId || r.id });
    }
    return out;
  };
}
/* the reference sentence for prop generation, aware of WHICH refs actually attached:
   the owner-sheet note only when the owner sheet rode in. */
function propAttachmentsText(p){
  return (attach)=>{
    const hasOwner  = (attach||[]).some(a=>a && a.refId===p.ownerId);
    const visualRefs = (attach||[]).filter(a=>a && (a.kind==="prop-reference-image" || a.kind==="prop-reference-crop"));
    let t = hasOwner ? ((typeof propOwnerNote==="function") ? propOwnerNote(p) : "") : "";
    if(visualRefs.length)
      t += (t?" ":"") + "Additional consistency reference image"+(visualRefs.length>1?"s":"")+" show how this prop should belong inside the film's existing character/location/prop world. Use selected crops for item-specific design, and whole sheets for likeness, owner taste, materials, patina, colour and texture continuity; ignore unrelated surrounding objects or background.";
    return t;
  };
}
window.propAttachmentsText = propAttachmentsText;
/* records WHICH owner-sheet version a prop sheet (base or state variant) was anchored
   against — ONLY when the owner ref verifiably rode in THIS generation (refsUsed).
   Simple-mode / ref-less generations record nothing → never false-stale. */
function propAnchorMetaExtra(p){
  return async ({ refsUsed })=>{
    if(!p.ownerId || typeof nbLoadDetailsAsset!=="function") return undefined;
    const used = (refsUsed||[]).some(r=> r && r.refId===p.ownerId);
    if(!used) return undefined;
    try{
      const d = await nbLoadDetailsAsset(p.ownerId);
      const iso = d && d.meta && d.meta.iso;
      return iso ? { anchorOwnerId:p.ownerId, anchorOwnerName:(p.ownerName||""), anchorIso:iso } : undefined;
    }catch(e){ return undefined; }
  };
}
window.propOwnerAttachments = propOwnerAttachments;
window.propAnchorMetaExtra = propAnchorMetaExtra;

/* Resolve the most specific visual sheet available at this story moment. Condition
   variants now belong to sparse continuity events; legacy appearance-state sheets are
   retained through the same event contract. Fail-safe: any doubt → the base sheet. */
function shotPropSheetId(p, scene, scenes, beatId, microBeatId, shotId, context){
  const base = { id: p.id, state: null };
  try{
    if(!p || !scene || typeof propStateAt!=="function") return base;
    const resolverContext={...(window.turnContinuity||{}),...(context||{}),scenes:scenes||((context||{}).scenes)||((window.turnContinuity||{}).scenes)||[]};
    const resolved=propStateAt(p,scene.id,beatId,microBeatId,shotId,resolverContext);
    const gid=resolved&&resolved.referenceAssetId;
    if(gid && typeof nbGetImage==="function" && nbGetImage(gid)){
      const event=resolved.event||{};
      return { id:gid, state:{
        id:event.referenceStateId||event.id||gid,
        label:event.referenceStateLabel||event.condition||resolved.condition||"changed condition",
        change:event.note||event.condition||resolved.condition||"",
      }, event };
    }
  }catch(e){}
  return base;
}
window.shotPropSheetId = shotPropSheetId;

/* PROP CONTINUITY CONTRACT -------------------------------------------------------
   A prop has one canonical identity; its relationship to the story changes through
   sparse events. `kind` remains the DEFAULT binding used by existing projects, never
   a permanent restriction. Every downstream room asks this resolver for the state at
   its precise story moment instead of inventing its own custody/placement rules. */
const PROP_BINDING_MODES = ["worn","carried","dressing"];
const PROP_EVENT_TYPES = ["acquired","handed_over","placed","removed","damaged","destroyed","consumed","recovered"];
window.PROP_BINDING_MODES = PROP_BINDING_MODES;
window.PROP_EVENT_TYPES = PROP_EVENT_TYPES;

function _propNum(v, fallback){
  if(v==null || v==="") return fallback;
  const n = Number(v); if(Number.isFinite(n)) return n;
  const m = String(v).match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : fallback;
}
function _propSceneIndex(sceneId, scenes){
  const list=(scenes||[]).slice().sort((a,b)=>(_propNum(a&&a.no,9999)-_propNum(b&&b.no,9999)));
  const i=list.findIndex(s=>s&&s.id===sceneId); return i<0 ? 999999 : i;
}
function _propBeatIndex(sceneId, beatId, beatsMap){
  const rows=((beatsMap&&beatsMap[sceneId]&&beatsMap[sceneId].rows)||[]);
  const i=rows.findIndex((b,n)=> b && (b.id===beatId || b.beatId===beatId || String(n+1)===String(beatId)));
  return i>=0 ? i : _propNum(beatId,0);
}
function _propShotIndex(sceneId, shotId, shots){
  const list=(shots||[]).filter(s=>s&&s.sceneId===sceneId).slice()
    .sort((a,b)=>(_propNum(a.order,0)-_propNum(b.order,0))||(_propNum(a.beatN,0)-_propNum(b.beatN,0)));
  const i=list.findIndex(s=>s&&s.id===shotId); return i>=0 ? i : _propNum(shotId,0);
}
function _propMomentTuple(moment, ctx, target){
  moment=moment||{}; ctx=ctx||{};
  const hi=target ? 999999 : 0;
  return [
    _propSceneIndex(moment.sceneId,ctx.scenes),
    moment.beatId!=null||moment.beatN!=null ? _propBeatIndex(moment.sceneId,moment.beatId!=null?moment.beatId:moment.beatN,ctx.beatsMap) : hi,
    moment.microBeatId!=null||moment.microBeatN!=null ? _propNum(moment.microBeatId!=null?moment.microBeatId:moment.microBeatN,hi) : hi,
    moment.shotId ? _propShotIndex(moment.sceneId,moment.shotId,ctx.shots) : hi,
  ];
}
function _propTupleLTE(a,b){ for(let i=0;i<Math.max(a.length,b.length);i++){ const x=a[i]||0,y=b[i]||0; if(x<y)return true;if(x>y)return false; } return true; }
function _propLegacyStateType(st){
  const text=String((st&&st.label)||"")+" "+String((st&&st.change)||"");
  if(/destroy|shatter|burn(?:ed|t)?\s+away/i.test(text)) return "destroyed";
  if(/consum|empty|spent|used\s+up/i.test(text)) return "consumed";
  if(/repair|restor|recover|cleaned|mended/i.test(text)) return "recovered";
  if(/remove|discard|lost|missing/i.test(text)) return "removed";
  return "damaged";
}
function _propLegacyStateEvent(p,st,i){
  const condition=String((st&&st.change)||(st&&st.label)||"changed condition").trim();
  return {
    id:"legacy-state-"+((st&&st.id)||i), type:_propLegacyStateType(st),
    sceneId:(st&&st.sceneId)||"", note:condition, condition,
    referenceAssetId:(p&&p.id)+":"+((st&&st.id)||i),
    referenceStateId:(st&&st.id)||String(i),
    referenceStateLabel:(st&&st.label)||"changed condition",
    migratedFromAppearanceState:true, _legacy:true, _seq:5000+i,
  };
}
function _propEventList(p){
  const events=(Array.isArray(p&&p.continuityEvents)?p.continuityEvents:[]).filter(Boolean).map((e,i)=>({...e,_legacy:false,_seq:i}));
  // Older projects stored visible condition changes in a separate Appearance States
  // array. Read those as Story Events until the card migrates them, preserving the
  // generated variant asset at propId:stateId.
  (Array.isArray(p&&p.states)?p.states:[]).forEach((st,i)=>{
    const legacy=_propLegacyStateEvent(p,st,i);
    const represented=events.some(e=>e&&(e.referenceAssetId===legacy.referenceAssetId||e.referenceStateId===legacy.referenceStateId));
    if(!represented) events.push(legacy);
  });
  // Read old scene-level custody handovers as sparse events. They remain editable in
  // older saved projects and can coexist with the richer event list without data loss.
  (Array.isArray(p&&p.custody)?p.custody:[]).forEach((e,i)=>{
    if(!e||!e.charId) return;
    events.push({id:e.id||("legacy-custody-"+i),type:"handed_over",sceneId:e.fromSceneId,
      holderId:e.charId,holderName:e.charName,note:e.note,_legacy:true,_seq:10000+i});
  });
  return events;
}
function propIdentityOf(p){
  p=p||{};
  return { id:p.id||"", name:p.name||"", ownerId:p.ownerId||"", ownerName:p.ownerName||"",
    origin:p.origin||p.ownerName||"", associationType:p.associationType||(p.ownerId?"character":p.locationId?"location":""),
    associationId:p.associationId||p.ownerId||p.locationId||"", associationName:p.associationName||p.ownerName||"" };
}
window.propIdentityOf = propIdentityOf;

function propStateAt(propOrId, sceneId, beatId, microBeatId, shotId, context){
  const C=context||window.turnContinuity||{};
  const p=typeof propOrId==="string" ? (C.props||[]).find(x=>x&&x.id===propOrId) : propOrId;
  if(!p) return null;
  const identity=propIdentityOf(p), mode=PROP_BINDING_MODES.includes(p.bindingMode)?p.bindingMode:(p.kind||"carried");
  const mapped=Array.isArray(p.scenes)?p.scenes:[];
  const hasEvents=_propEventList(p).length>0;
  const firstMapped=mapped.length ? Math.min(...mapped.map(id=>_propSceneIndex(id,C.scenes))) : -1;
  const targetSceneIndex=_propSceneIndex(sceneId,C.scenes);
  let state={
    propId:p.id, identity, bindingMode:mode,
    ownerId:identity.ownerId, ownerName:identity.ownerName,
    custodianId:p.custodianId||identity.ownerId||"", custodianName:p.custodianName||identity.ownerName||"",
    holderId:p.holderId||((mode==="worn"||mode==="carried")?identity.ownerId:"")||"",
    holderName:p.holderName||((mode==="worn"||mode==="carried")?identity.ownerName:"")||"",
    placement:{ locationId:p.placementLocationId||p.locationId||"", unitId:p.placementUnitId||"", note:p.placement||"" },
    condition:p.condition||"intact", visibility:p.visibility||"visible",
    present: sceneId ? (hasEvents ? (firstMapped<0 || targetSceneIndex>=firstMapped) : (!mapped.length || mapped.indexOf(sceneId)>=0)) : true,
    association:{ type:identity.associationType,id:identity.associationId,name:identity.associationName },
    referenceAssetId:"",
    event:null,
  };
  const target=_propMomentTuple({sceneId,beatId,microBeatId,shotId},C,true);
  const events=_propEventList(p).map(e=>({...e,_tuple:_propMomentTuple(e,C,false)}))
    .filter(e=>e.sceneId && _propTupleLTE(e._tuple,target))
    .sort((a,b)=>{ for(let i=0;i<4;i++){ if(a._tuple[i]!==b._tuple[i]) return a._tuple[i]-b._tuple[i]; } return (a._seq||0)-(b._seq||0); });
  events.forEach(e=>{
    const type=String(e.type||"").replace(/\s+/g,"_").toLowerCase();
    if(e.bindingMode && PROP_BINDING_MODES.includes(e.bindingMode)) state.bindingMode=e.bindingMode;
    if(type==="acquired"||type==="handed_over"||type==="recovered"){
      state.present=true; state.visibility=e.visibility||"visible"; state.bindingMode=e.bindingMode||"carried";
      state.holderId=e.holderId||e.toCharacterId||e.charId||state.holderId;
      state.holderName=e.holderName||e.toCharacterName||e.charName||state.holderName;
      state.custodianId=e.custodianId||e.toCharacterId||e.charId||state.custodianId;
      state.custodianName=e.custodianName||e.toCharacterName||e.charName||state.custodianName;
      if(type!=="recovered"){ state.placement={locationId:"",unitId:"",note:""}; }
      else { state.condition=e.condition||"intact"; state.referenceAssetId=e.referenceAssetId||""; }
    }else if(type==="placed"){
      state.present=true; state.visibility=e.visibility||"visible"; state.bindingMode=e.bindingMode||"dressing";
      state.holderId=""; state.holderName="";
      state.placement={locationId:e.locationId||e.placementLocationId||state.placement.locationId,
        unitId:e.unitId||e.placementUnitId||"",note:e.placement||e.note||""};
    }else if(type==="removed"){
      const movedToHolder=!!(e.holderId||e.toCharacterId);
      state.present=movedToHolder||e.present===true; state.visibility=e.visibility||(movedToHolder?"visible":"offscreen");
      if(movedToHolder){ state.holderId=e.holderId||e.toCharacterId; state.holderName=e.holderName||e.toCharacterName||""; state.bindingMode="carried"; }
      else state.placement={locationId:"",unitId:"",note:e.note||""};
    }else if(type==="damaged"){
      state.condition=e.condition||"damaged"; state.referenceAssetId=e.referenceAssetId||"";
    }else if(type==="destroyed"||type==="consumed"){
      state.present=false; state.visibility="absent"; state.condition=type; state.referenceAssetId=e.referenceAssetId||"";
    }
    if(e.condition) state.condition=e.condition;
    if(e.visibility) state.visibility=e.visibility;
    if(e.custodianId){ state.custodianId=e.custodianId; state.custodianName=e.custodianName||state.custodianName; }
    if(e.referenceAssetId) state.referenceAssetId=e.referenceAssetId;
    state.event=e;
  });
  state.active=!!(state.present && state.visibility!=="absent" && state.visibility!=="hidden" && state.visibility!=="offscreen");
  return state;
}
window.propStateAt = propStateAt;
function propsActiveAt(props, sceneId, beatId, microBeatId, shotId, context){
  return (props||[]).filter(p=>{ const s=propStateAt(p,sceneId,beatId,microBeatId,shotId,context); return s&&s.active; });
}
window.propsActiveAt = propsActiveAt;
function propAssetRevision(propOrId){
  const id=typeof propOrId==="string" ? propOrId : propOrId&&propOrId.id;
  if(!id) return "";
  const meta=(typeof nbGetMeta==="function"&&nbGetMeta(id))||{};
  const hasImage=typeof nbGetImage==="function"&&!!nbGetImage(id);
  return hasImage ? (meta.iso||meta.createdAt||meta.date||meta.version||"sheet") : "text";
}
function propReferenceSnapshot(propIds, context){
  const C=context||window.turnContinuity||{};
  return Array.from(new Set((propIds||[]).filter(Boolean))).map(id=>{
    const p=(C.props||[]).find(x=>x&&x.id===id);
    return { propId:id, name:(p&&p.name)||"Prop", revision:propAssetRevision(id) };
  });
}
function propReferenceDependenciesChanged(snapshot, context){
  if(!Array.isArray(snapshot)||!snapshot.length) return [];
  const C=context||window.turnContinuity||{};
  return snapshot.filter(row=>{
    const exists=(C.props||[]).some(p=>p&&p.id===row.propId);
    return !exists || String(row.revision||"")!==String(propAssetRevision(row.propId)||"");
  });
}
window.propAssetRevision = propAssetRevision;
window.propReferenceSnapshot = propReferenceSnapshot;
window.propReferenceDependenciesChanged = propReferenceDependenciesChanged;
function propDependencySignature(props, sceneId, beatId, microBeatId, shotId, context){
  return propsActiveAt(props,sceneId,beatId,microBeatId,shotId,context).map(p=>{
    const s=propStateAt(p,sceneId,beatId,microBeatId,shotId,context)||{};
    // The canonical asset id is intentionally stable across regeneration, so include
    // the committed revision stamp. Re-rendering the same prop can then invalidate
    // only consumers that used its previous pixels.
    const visualRevision=propAssetRevision(s.referenceAssetId||p);
    return [p.id,s.bindingMode,s.holderId,s.placement&&s.placement.locationId,s.placement&&s.placement.unitId,s.condition,s.visibility,
      visualRevision].join(":");
  }).sort().join("|");
}
window.propDependencySignature = propDependencySignature;

/* CUSTODY — who holds the object AT a scene. p.custody = ordered handovers
   [{id, charId, charName, fromSceneId, note}]; the canonical owner (p.ownerId) holds it
   from the start. Resolution mirrors activeStateForScene: the latest handover pinned at
   or before the scene in story order wins; fail-safe = the canonical owner. The card,
   sheets and style anchor stay with the canonical owner — custody only moves the HOLDER. */
function custodyOwnerAt(p, scene, scenes){
  if(typeof propStateAt==="function"){
    const s=propStateAt(p,scene&&scene.id,null,null,null,{...(window.turnContinuity||{}),scenes:scenes||[]});
    if(s) return { id:s.holderId||s.custodianId||"", name:s.holderName||s.custodianName||"", handover:s.event&&s.event.type==="handed_over"?s.event:null, state:s };
  }
  const base = { id: p.ownerId||"", name: p.ownerName||"", handover: null };
  try{
    const chain = Array.isArray(p.custody) ? p.custody : [];
    if(!chain.length || !scene || !Array.isArray(scenes)) return base;
    const idx = scenes.findIndex(s=>s && s.id===scene.id);
    if(idx<0) return base;
    let best = null, bestIdx = -1;
    for(const e of chain){
      if(!e || !e.charId) continue;
      const ei = scenes.findIndex(s=>s && s.id===e.fromSceneId);
      // >= so a LATER chain entry wins a same-scene tie (chain order is the handover order)
      if(ei>=0 && ei<=idx && ei>=bestIdx){ best = e; bestIdx = ei; }
    }
    if(best) return { id: best.charId||"", name: best.charName||"", handover: best };
  }catch(e){}
  return base;
}
window.custodyOwnerAt = custodyOwnerAt;
/* "Marisol \u2192 Diego (Sc 12)" chain label for UI + bibles. */
function custodyChainLabel(p, scenes){
  const chain = (Array.isArray(p.custody)?p.custody:[]).filter(e=>e && e.charName);
  if(!chain.length) return "";
  const names = [p.ownerName||"?"];
  chain.forEach(e=>{
    const sc = (scenes||[]).find(s=>s && s.id===e.fromSceneId);
    names.push(e.charName + (sc && sc.no!=null ? (" (Sc "+sc.no+")") : ""));
  });
  return names.join(" \u2192 ");
}
window.custodyChainLabel = custodyChainLabel;

/* FITTING CRITIQUE prompt — vision judge for "does this object belong to this character".
   The exact reply shape keeps the verdict machine-readable; notes stay human prose. */
function buildPropFittingPrompt(p, hasOwner){
  const clean = (x)=>String(x||"").replace(/\.$/,"").trim();
  let s = hasOwner
    ? "Image 1 is the character reference sheet for "+(p.ownerName||"the owner")+". Image 2 is the reference sheet for "+(p.name||"their object")+" ("+(p.kind||"carried")+"). "
    : "This is the reference sheet for "+(p.name||"an object")+" belonging to "+(p.ownerName||"a character")+" ("+(p.kind||"carried")+"). ";
  s += "SPEC \u2014 form: "+(clean(p.form)||"unspecified")+"; material: "+(clean(p.material)||"unspecified")
    +"; significance: "+(clean(p.detail)||"unspecified")
    +(clean(p.relation)?("; relationship: "+clean(p.relation)):"")
    +(clean(p.scale)?("; scale against the owner: "+clean(p.scale)):"")+". ";
  s += "Judge whether this object BELONGS to this character: (1) render style & medium match, (2) material and finish coherent with their wardrobe and world, (3) scale plausibility against their body, (4) the stated relationship readable in its condition. ";
  s += "Reply in EXACTLY this shape:\nVERDICT: belongs | drifted | mismatch\nNOTES: 3\u20136 short observations, one per line\nFIX: one sentence \u2014 the single most valuable change to the OBJECT (or 'none').";
  return s;
}
window.buildPropFittingPrompt = buildPropFittingPrompt;

async function generatePropSheet(p, project){
  const _ep = (typeof nbEpoch==="function") ? nbEpoch() : null;   // asset scope at generation start
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const basePrompt = (typeof combinedPropPrompt==="function") ? combinedPropPrompt(p, project) : (p.name||"prop reference");
  // reference the OWNER's character sheet (if generated) so the prop matches their look
  const ownerUrl = await propOwnerSheetUrl(p);
  const prompt = basePrompt + (ownerUrl ? (" "+propOwnerNote(p)) : "");
  const refImgs = [ownerUrl].filter(Boolean);
  const refOpts = refImgs.length ? { extraImages:refImgs } : {};
  const model  = (typeof nbGetModel==="function")  ? nbGetModel()  : "";
  const aspect = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  const size   = (typeof nbGetRes==="function")    ? nbGetRes()    : "2K";
  // register in the shared inflight registry so a mounted prop card shows the spinner
  // and the operation survives an Art Room tab switch (same infra as useImageGen).
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[p.id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, refOpts); }
    catch(e){
      // same fallback the card uses: an empty/"no image" result retries simplified
      if(/no image/i.test((e&&e.message)||"") && typeof buildSimplePropPrompt==="function"){
        url = await nbGenerate(buildSimplePropPrompt(p) + (ownerUrl?(" "+propOwnerNote(p)):""), refOpts);
      } else { throw e; }
    }
    // record WHICH owner-sheet version this sheet is anchored against — the card's
    // "anchored to a previous plate" badge compares it against the owner's current meta
    let anchorIso = "";
    if(ownerUrl && p.ownerId && typeof nbLoadDetailsAsset==="function"){
      try{ const d = await nbLoadDetailsAsset(p.ownerId); anchorIso = (d && d.meta && d.meta.iso) || ""; }catch(e){}
    }
    const now = new Date();
    const mEntry = (window.NB_MODELS||[]).find(m=>m.id===model) || {};
    const meta = { modelLabel: mEntry.label||"Nano Banana", modelId: model, aspect, size,
      // match the per-card sheet caption: GPT Image carries its quality (low/medium/high)
      quality: (typeof window.isGptImageModel==="function" && window.isGptImageModel(model))
        ? ((typeof window.nbGetOaiQuality==="function") ? window.nbGetOaiQuality() : "medium") : undefined,
      date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
      time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
      iso: now.toISOString(), prompt, mode:"final", version:1,
      anchorOwnerId: (ownerUrl && p.ownerId) ? p.ownerId : undefined,
      anchorOwnerName: (ownerUrl && p.ownerId) ? (p.ownerName||"") : undefined,
      anchorIso: anchorIso || undefined };
    await nbCommit(p.id, url, meta, [], "prop", _ep);
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
  const style = p.renderStyle || ((typeof window.renderStyleText==="function")
    ? window.renderStyleText("prop", p.renderStyleKey || propInheritedStyleKey(p))
    : "photoreal product reference, 85mm, soft even studio lighting");
  let s = "Master prop reference sheet \u2014 "+(p.name||"Object")+". ";
  s += "BASE OBJECT: reproduce EXACTLY the object shown in the reference photo \u2014 its shape, ";
  s += "proportions, colour, material and finish. Do not redesign or stylise it. ";
  s += (p.detail ? ("Significance: "+p.detail.replace(/\.$/,"")+". ") : "");
  s += "RENDER STYLE: "+style.replace(/\.$/,"")+". ";
  s += "LAYOUT: prop concept art sheet \u2014 full 360-degree turnaround, front view center, side view middle, back view right; ";
  s += "right side: 3 close-up detail shots in a vertical grid (signature feature, material & finish in macro, construction & wear). ";
  s += "Flat off-white / very light neutral panel background, even and clean, with a simple soft contact shadow beneath the object, no text, no labels, no annotations, soft studio lighting, no people, no hands, ";
  s += "the SAME identical object in every view, sharp focus.";
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

/* PropStateRow — one appearance-state variant of a prop (mirrors the character StateRow):
   its own v2+ sheet at p.id+":"+st.id, built FROM the base sheet when one exists so the
   object stays identical except the described change. The owner's character sheet rides
   as the same belonging anchor, so a state variant never drifts from the character. */
function PropStateRow({ p, st, index, project, scenes, baseGenUrl, onView, onChange, onDelete }){
  const vtag = "v"+(index+2);
  const gid = p.id+":"+st.id;
  const baseFinal = (typeof combinedPropPrompt==="function") ? combinedPropPrompt(p, project) : buildPropRefPrompt(p, project);
  const changeText = ()=> (st.change||"").replace(/\.$/,"").trim();
  const buildFromBase = ()=>
    "Edit this prop reference sheet for "+(p.name||"the object")+". "
    +"Apply this appearance change: "+(changeText()||"(no specific change given)")+". "
    +"Keep the EXACT same object \u2014 shape, proportions, materials and identity \u2014 in every panel; only the described change should differ. "
    +"Maintain the sheet's EXISTING 4-panel layout (hero \u00b7 front \u00b7 side \u00b7 detail), render style and framing. Do not re-imagine the object.";
  const buildFinal = ()=> baseFinal + " APPEARANCE STATE \u2014 "+(st.label||"variant")+": "
    + (changeText()||"") + ". Render the object in THIS changed state consistently across every panel \u2014 same identity, new condition.";
  const buildSimple = ()=> ((typeof buildSimplePropPrompt==="function") ? buildSimplePropPrompt(p) : (p.name||"prop reference"))
    + ". " + (changeText()||"");

  const gen = useImageGen({
    id: gid, slotId: "propref-"+gid,
    entity: p,
    buildFinal: buildFinal,
    buildFromBase: baseGenUrl ? buildFromBase : null,
    referenceFallback: baseGenUrl ? (()=>baseGenUrl) : null,
    buildFromPhoto: ()=> buildFromBase(),
    buildSimple: buildSimple,
    // the SAME belonging anchor as the base sheet — a state variant still belongs to the owner
    attachments: propOwnerAttachments(p),
    attachmentsText: propAttachmentsText(p),
    metaExtra: propAnchorMetaExtra(p),
    buildEdit: (instr)=>
      "Edit this prop reference sheet for "+(p.name||"the object")+" ("+(st.label||"variant")+" state). "
      +"Apply ONLY this change: "+instr+". Preserve the same object identity and the "+(st.label||"variant")
      +" appearance otherwise, in every panel. Keep the sheet's existing layout. Do not re-imagine the object.",
  });
  const viewEntity = { ...p, name: p.name+" \u2014 "+(st.label||"variant") };

  return React.createElement("div",{className:"state-row"},
    React.createElement("div",{className:"state-row-head"},
      React.createElement("span",{className:"state-vtag"},vtag),
      React.createElement("div",{className:"state-label"},
        React.createElement(EditText,{value:st.label,placeholder:"State name\u2026",onCommit:val=>onChange({label:val})})),
      React.createElement("button",{className:"state-del",title:"Remove state",onClick:onDelete},React.createElement(Icon.x,{s:13}))),
    React.createElement(SheetFrame,{ gen, slotId:"propref-"+gid, name:viewEntity.name,
      avatarColor:propSwatch(p.kind), initials:vtag, drafted:true, drafting:false, onDraft:()=>{}, entity:viewEntity,
      onView, slotPlaceholder:"Drop reference art for this state", noun:vtag+" sheet" }),
    gen.genUrl && window.QaCheckButton && React.createElement("div",{className:"card-qa-row"},
      React.createElement(window.QaCheckButton,{ gen, name:(viewEntity.name||"")+" \u00b7 "+(st.label||vtag), noun:vtag+" sheet",
        specFields:()=>({ what_changed:(st.change||"") }),
        onApplySpec:(patch)=>{ if(patch.what_changed!=null) onChange({ change:patch.what_changed }); } })),
    !baseGenUrl && React.createElement("div",{className:"state-hint"},
      React.createElement(Icon.alert,{s:11}),
      "Generate the base sheet above for design-locked results \u2014 until then this builds from the text spec."),
    React.createElement(SheetField,{label:"What changed",value:st.change,multiline:true,
      placeholder:"The visible difference from the base object \u2014 crumpled, taped repair, scorched, bloodied, emptied\u2026",
      onCommit:val=>onChange({change:val})}),
    React.createElement("div",{className:"sheet-field"},
      React.createElement("div",{className:"obj-lab"},"First appears in"),
      React.createElement("select",{className:"prop-select",value:st.sceneId||"",onChange:e=>onChange({sceneId:e.target.value})},
        React.createElement("option",{value:""},"Not pinned"),
        (scenes||[]).map(s=>React.createElement("option",{key:s.id,value:s.id},"Sc "+s.no+" \u00b7 "+s.title)))));
}

/* PropFittingModal — the FITTING view: owner sheet and prop sheet side by side, with an
   optional vision critique ("does this object belong to this character?"). Read-only;
   fixes stay manual (Regenerate / the QA apply flow). */
function PropFittingModal({ p, propUrl, onClose }){
  const [ownerUrl, setOwnerUrl] = React.useState("");
  const [crt, setCrt] = React.useState(null);   // null | {busy:true} | {text,verdict} | {error}
  React.useEffect(()=>{ let live=true;
    (async()=>{
      try{ const u = (typeof propOwnerSheetUrl==="function") ? await propOwnerSheetUrl(p) : "";
        if(live) setOwnerUrl(u||""); }catch(e){}
    })();
    return ()=>{ live=false; };
  },[p.id, p.ownerId]);
  const runCritique = async ()=>{
    if(typeof aiVisionComplete!=="function" || (crt && crt.busy)) return;
    setCrt({busy:true});
    try{
      const r = await aiVisionComplete(
        [{ role:"user", content: buildPropFittingPrompt(p, !!ownerUrl) }],
        [ownerUrl, propUrl].filter(Boolean));
      // fail safe like the other QA paths: a text-only (blind) response gets NO verdict
      if(r && r.vision===false){
        setCrt({ error:"The vision model didn\u2019t receive the images \u2014 no verdict. Check the writing engine / image-proxy and try again." });
        return;
      }
      const m = /^VERDICT:\s*(belongs|drifted|mismatch)\s*$/im.exec((r && r.text) || "");
      setCrt({ text:(r&&r.text)||"", verdict: m ? m[1].toLowerCase() : "" });
    }catch(e){ setCrt({ error:(e&&e.message)||"Critique failed" }); }
  };
  const fig = (url, lab)=> React.createElement("figure",{style:{margin:0,flex:1,minWidth:160}},
    url
      ? React.createElement("img",{src:url,alt:lab,style:{width:"100%",borderRadius:10,display:"block"}})
      : React.createElement("div",{className:"state-empty"},"No sheet yet"),
    React.createElement("figcaption",{className:"obj-lab",style:{margin:"4px 0 0"}},lab));
  const RD = (typeof ReactDOM!=="undefined") ? ReactDOM : window.ReactDOM;
  return RD.createPortal(
    React.createElement("div",{style:{position:"fixed",inset:0,zIndex:90,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(6,6,10,.72)"},
      onClick:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
      React.createElement("div",{className:"qa-modal",style:{width:"min(880px,94vw)"}},
        React.createElement("div",{className:"qa-head"},
          React.createElement("span",{className:"qa-orb"},React.createElement(Icon.box,{s:18})),
          React.createElement("div",{style:{flex:1}},
            React.createElement("div",{style:{fontWeight:600}},(p.name||"Object")+" \u00b7 fitting"),
            React.createElement("div",{className:"obj-lab"},"against "+(p.ownerName||"its owner"))),
          React.createElement("button",{className:"ag-x",title:"Close",onClick:onClose},React.createElement(Icon.x,{s:14}))),
        React.createElement("div",{style:{display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap"}},
          fig(ownerUrl, (p.ownerName||"Owner")+" \u2014 character sheet"),
          fig(propUrl, (p.name||"Object")+" \u2014 prop sheet")),
        !ownerUrl && React.createElement("div",{className:"state-hint",style:{marginTop:10}},
          React.createElement(Icon.alert,{s:11}),
          "Generate "+(p.ownerName||"the owner")+"\u2019s sheet for a true fitting \u2014 the critique then judges against their actual look."),
        React.createElement("div",{style:{display:"flex",gap:10,alignItems:"center",marginTop:12}},
          React.createElement("button",{className:"state-add-btn",disabled:!!(crt&&crt.busy),onClick:runCritique},
            crt&&crt.busy ? "Judging\u2026" : (crt&&(crt.text||crt.error) ? "Re-run critique" : "Critique the fit")),
          crt && crt.verdict && React.createElement("span",{className:"obj-lab",style:{margin:0,display:"inline-flex",alignItems:"center",gap:6}},
            React.createElement("span",{className:"qa-dot "+(crt.verdict==="belongs"?"minor":"major")}),crt.verdict)),
        crt && crt.error && React.createElement("div",{className:"state-hint",style:{marginTop:8}},
          React.createElement(Icon.alert,{s:11}),crt.error),
        crt && crt.text && React.createElement("pre",{style:{whiteSpace:"pre-wrap",font:"inherit",fontSize:12,margin:"10px 0 0",opacity:.92}},crt.text))),
    document.body);
}

function PropSheet({ p, project, characters, scenes, onUpdate, onDelete, onDraft, onEnsureOwner, drafting, onView, batchActiveId, onBatchDone, onChipClick, onTagOne, taggingScene, dupIds, dupProps, onMerge, derivedScenes }){
  const d = propDefaults(p);
  const finalPrompt = combinedPropPrompt(p, project);
  const drafted = propVisualsDrafted(p);

  // render style — same dropdown + "Surprise me" behaviour as the character cards
  const [styling, setStyling] = React.useState(false);
  // transient "saved · unlock" chip — visible ~4s after landing on the user's own locked style
  const [unlockVisible, setUnlockVisible] = React.useState(false);
  React.useEffect(()=>{
    if(window.turnIsUserStyle && window.turnIsUserStyle(p.renderStyleKey)){
      setUnlockVisible(true); const t=setTimeout(()=>setUnlockVisible(false),4000); return ()=>clearTimeout(t);
    }
    setUnlockVisible(false);
  },[p.renderStyleKey]);
  const propBible = ()=> [p.name&&("Name: "+p.name), p.ownerName&&("Owner: "+p.ownerName),
    p.form&&("Form: "+p.form), p.material&&("Material: "+p.material), p.detail&&("Significance: "+p.detail),
    p.relation&&("Relationship: "+p.relation), p.scale&&("Scale against owner: "+p.scale),
    (typeof custodyChainLabel==="function" && custodyChainLabel(p, scenes)) && ("Custody: "+custodyChainLabel(p, scenes)),
    (project&&project.genre)&&("Genre: "+project.genre)].filter(Boolean).join("\n");
  const rollSurprise = async ()=>{
    if(!(typeof aiSurpriseStyleText==="function" && typeof aiAvailable==="function" && aiAvailable())) return;
    setStyling(true);
    try{ const r = await aiSurpriseStyleText({ name:p.name, kind:"prop", bible:propBible() }, project);
      if(r) onUpdate(p.id, { surpriseRender:r, renderStyle:r.style }); }catch(e){}
    setStyling(false);
  };
  const pickPropStyle = async (key)=>{
    if(key!=="surprise"){ onUpdate(p.id, { renderStyleKey:key, renderStyle:(typeof window.renderStyleText==="function" ? window.renderStyleText("prop", key) : (PROP_RENDER_TEXT[key]||PROP_RENDER_TEXT.photoreal)) }); return; }
    onUpdate(p.id, { renderStyleKey:"surprise" });
    if(p.surpriseRender && p.surpriseRender.style){ onUpdate(p.id, { renderStyle:p.surpriseRender.style }); return; }
    await rollSurprise();
  };
  // LOCK a surprise style → a reusable named style. The prop surprise is a STRING, so wrap it
  // into a minimal render block ({rendering, rules}) the shared registry can resolve everywhere.
  const lockSurprise = async ()=>{
    if(!(p.surpriseRender && p.surpriseRender.style) || typeof window.turnLockRenderStyle!=="function") return;
    const block = { rendering:String(p.surpriseRender.style), rules:["no text, labels, watermarks, annotations, typography or captions"] };
    const key = await window.turnLockRenderStyle(p.surpriseRender.label, block);
    if(key){ onUpdate(p.id, { renderStyleKey:key, renderStyle:(typeof window.renderStyleText==="function"?window.renderStyleText("prop",key):p.surpriseRender.style) });
      if(typeof window.appToast==="function") window.appToast("Style locked — now reusable across Characters, Props & Locations"); }
  };
  const unlockCurrent = async ()=>{
    if(!(window.turnIsUserStyle && window.turnIsUserStyle(p.renderStyleKey))) return;
    const ok = window.appConfirm ? await window.appConfirm({ title:"Unlock this saved style?",
      body:"It's removed from your saved styles. Cards still using it fall back to Photoreal." }) : true;
    if(!ok) return; const k=p.renderStyleKey; window.turnUnlockRenderStyle(k);
    onUpdate(p.id,{ renderStyleKey:"photoreal", renderStyle:(typeof window.renderStyleText==="function"?window.renderStyleText("prop","photoreal"):"") });
  };
  const initials = (p.name||"?").replace(/^the\s+/i,"").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const referenceImages = Array.isArray(p.referenceImages) ? p.referenceImages.filter(r=>r&&r.url) : [];

  const gen = useImageGen({
    id: p.id, slotId: "propref-"+p.id,
    entity: p,
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildPropFromPhotoPrompt(p, project),
    buildSimple: ()=> buildSimplePropPrompt(p),
    // reference the OWNER's character sheet so the prop matches their look (worn props
    // especially must read as part of THAT body, not a generic grey object).
    attachments: propOwnerAttachments(p),
    attachmentsText: propAttachmentsText(p),
    // record WHICH owner-sheet version this sheet was anchored against (transaction-derived)
    metaExtra: propAnchorMetaExtra(p),
    // clearing the base sheet also clears this prop's state variants (no orphans)
    relatedClearIds: ()=> (Array.isArray(p.states)?p.states:[]).map(s=> p.id+":"+s.id),
    buildEdit: (instr)=>
      "Edit this prop reference sheet for "+(p.name||"the object")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else without alteration \u2014 the exact same object shape, proportions and identity "
      +"across all panels. Keep the same 4-panel layout (hero \u00b7 front \u00b7 side \u00b7 detail) on a neutral grey background. "
      +"Do not replace or re-imagine the object.",
  });

  // Guarantee the prop is generated WITH its owner's character sheet: if the owner has no
  // sheet yet, generate it first (drafting the owner's spec if needed), THEN the prop —
  // so the owner sheet is present as a reference. No-op for ownerless / already-sheeted.
  const genWithOwner = React.useCallback(async (...a)=>{
    // no silent WORLD-GENERIC sheets: an ownerless carried prop has no character
    // anchor, so confirm before generating one by hand (batch skips these outright)
    if((p.kind||"carried")==="carried" && !p.ownerId && typeof window.appConfirm==="function"){
      const ok = await window.appConfirm({
        title:"No owner \u2014 generate world-generic?",
        body:(p.name||"This prop")+" isn't assigned to a character, so its sheet will be generated with no character anchor \u2014 generic world style, nothing that ties it to a person. Assign an owner first for a prop that belongs to someone.",
        confirmLabel:"Generate anyway", cancelLabel:"Cancel" });
      if(!ok) return false;
    }
    if(onEnsureOwner){ try{ await onEnsureOwner(p); }catch(e){} }
    return gen.generate(...a);
  },[gen, onEnsureOwner, p]);
  const genForFrame = onEnsureOwner ? { ...gen, generate: genWithOwner } : gen;
  const promptStale = !!(genForFrame.genUrl && genForFrame.genMeta && genForFrame.genMeta.prompt && genForFrame.genMeta.prompt!==finalPrompt);

  /* ---- batch generation: when the parent activates this card (its id == the
     batch's current id), kick off a generation and report completion so the
     queue advances. Watches gen.gening for the true->false transition. ---- */
  // REMOUNT-SAFE (see CharacterSheet): seed batchStarted from the in-flight registry so a
  // card remounting mid-generation doesn't fire a second generate on completion.
  const _pslot = "propref-"+p.id;
  const batchStarted = React.useRef(!!(window.__nbGenInflight && window.__nbGenInflight[_pslot]));
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===p.id;
    const inflight = !!(window.__nbGenInflight && window.__nbGenInflight[_pslot]);
    if(!mine){ batchStarted.current=inflight; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening && !inflight){
      batchStarted.current = true; wasGening.current = false;
      genWithOwner();                       // owner sheet first, then this prop's master
      return;
    }
    if(batchStarted.current && wasGening.current && !gen.gening){
      batchStarted.current = false;
      onBatchDone && onBatchDone(p.id);
    }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, p.id]);

  const [fitOpen, setFitOpen] = React.useState(false);   // the fitting view (owner sheet · prop sheet side by side)
  const [bindingOpen, setBindingOpen] = React.useState(false);

  // CUSTODY — ordered handovers of this object between characters. The canonical owner
  // (Owner field) holds it from the start; shots resolve the holder per scene
  // (custodyOwnerAt) so one object can pass hands without rewriting its identity.
  const custody = Array.isArray(p.custody) ? p.custody : [];
  const addCustody = ()=> onUpdate(p.id, { custody:[...custody, { id:"cu-"+Date.now().toString(36), charId:"", charName:"", fromSceneId:"", note:"" }] });
  const updateCustody = (id,patch)=> onUpdate(p.id, { custody: custody.map(e=>e.id===id?{...e,...patch}:e) });
  const deleteCustody = (id)=> onUpdate(p.id, { custody: custody.filter(e=>e.id!==id) });
  const continuityEvents = Array.isArray(p.continuityEvents) ? p.continuityEvents : [];
  const legacyAppearanceStates = Array.isArray(p.states) ? p.states : [];
  const legacyStateSignature = legacyAppearanceStates.map(st=>[st&&st.id,st&&st.sceneId,st&&st.label,st&&st.change].join(":" )).join("|");
  React.useEffect(()=>{
    if(!legacyAppearanceStates.length) return;
    const merged=continuityEvents.slice();
    legacyAppearanceStates.forEach((st,i)=>{
      const legacy=_propLegacyStateEvent(p,st,i);
      const { _legacy, _seq, ...event }=legacy;
      if(!merged.some(e=>e&&(e.referenceAssetId===event.referenceAssetId||e.referenceStateId===event.referenceStateId))){
        merged.push(event);
      }
    });
    // Keep the generated propId:stateId image in storage; the migrated event points to
    // it. Only the redundant data/UI model is retired.
    onUpdate(p.id,{continuityEvents:merged,states:[]});
  },[p.id,legacyStateSignature]);
  const addContinuityEvent = ()=> onUpdate(p.id,{continuityEvents:[...continuityEvents,{id:"pe-"+Date.now().toString(36),type:"handed_over",sceneId:"",beatId:"",microBeatId:"",shotId:"",note:""}]});
  const updateContinuityEvent = (id,patch)=> onUpdate(p.id,{continuityEvents:continuityEvents.map(e=>e.id===id?{...e,...patch}:e)});
  const deleteContinuityEvent = (id)=> onUpdate(p.id,{continuityEvents:continuityEvents.filter(e=>e.id!==id)});
  const continuityLocations = ((window.turnContinuity||{}).locations)||[];

  // scenes this prop appears in, as {no,id} sorted by story order. A stored map wins;
  // an OWNED but never-mapped prop shows its derived owner-presence scenes instead.
  // Stored mappings refresh automatically when the screenplay or scene set changes.
  const sceneById = React.useMemo(()=>{ const m={}; (scenes||[]).forEach(s=>{ m[s.id]=s; }); return m; },[scenes]);
  const sceneIds = Array.isArray(p.scenes) ? p.scenes : (Array.isArray(derivedScenes) ? derivedScenes : undefined);
  const scenesDerived = !Array.isArray(p.scenes) && Array.isArray(derivedScenes);
  const propScenes = (sceneIds||[]).map(id=>sceneById[id]).filter(Boolean);
  const cardRefsLoader = React.useMemo(()=>propOwnerAttachments(p),[
    p.id,p.ownerId,p.ownerName,referenceImages.map(r=>r.id||r.url).join(",")
  ]);
  const renderContinuityEvent = (e,i)=>React.createElement("div",{key:e.id,className:"state-row prop-event-row"},
    React.createElement("div",{className:"state-row-head"},
      React.createElement("span",{className:"state-vtag base"},String(i+1)),
      React.createElement("select",{className:"prop-select",value:e.type||"handed_over",onChange:ev=>updateContinuityEvent(e.id,{type:ev.target.value})},
        PROP_EVENT_TYPES.map(t=>React.createElement("option",{key:t,value:t},t.replace(/_/g," ")))),
      React.createElement("button",{className:"state-del",title:"Remove event",onClick:()=>deleteContinuityEvent(e.id)},React.createElement(Icon.x,{s:13}))),
    React.createElement("div",{className:"sheet-2col prop-event-moment"},
      React.createElement("div",{className:"sheet-field"},React.createElement("div",{className:"obj-lab"},"From scene"),
        React.createElement("select",{className:"prop-select",value:e.sceneId||"",onChange:ev=>updateContinuityEvent(e.id,{sceneId:ev.target.value})},
          React.createElement("option",{value:""},"Choose scene..."),(scenes||[]).map(s=>React.createElement("option",{key:s.id,value:s.id},"Sc "+s.no+" - "+s.title)))),
      React.createElement("div",{className:"sheet-field"},React.createElement("div",{className:"obj-lab"},"Beat / micro / shot"),
        React.createElement("div",{className:"prop-event-inline"},
          ["beatId","microBeatId","shotId"].map((k,n)=>React.createElement("input",{key:k,className:"prop-event-input",value:e[k]||"",placeholder:["Beat","Micro","Shot"][n],onChange:ev=>updateContinuityEvent(e.id,{[k]:ev.target.value})}))))),
    (["acquired","handed_over","recovered"].includes(e.type||"handed_over")) && React.createElement("div",{className:"sheet-field"},
      React.createElement("div",{className:"obj-lab"},"Holder / user after event"),
      React.createElement("select",{className:"prop-select",value:e.holderId||e.toCharacterId||"",onChange:ev=>{const ch=(characters||[]).find(x=>x.id===ev.target.value);updateContinuityEvent(e.id,{holderId:ev.target.value,holderName:ch?ch.name:""});}},
        React.createElement("option",{value:""},"Unassigned"),(characters||[]).map(c=>React.createElement("option",{key:c.id,value:c.id},c.name)))),
    e.type==="placed" && React.createElement("div",{className:"sheet-field"},
      React.createElement("div",{className:"obj-lab"},"Physical placement"),
      React.createElement("select",{className:"prop-select",value:e.locationId||"",onChange:ev=>updateContinuityEvent(e.id,{locationId:ev.target.value})},
        React.createElement("option",{value:""},"Choose location..."),continuityLocations.map(l=>React.createElement("option",{key:l.id,value:l.id},l.name)))),
    React.createElement(SheetField,{label:"Event note / condition",value:e.note||e.condition||"",placeholder:"Placed on the dashboard / cracked during the struggle...",onCommit:val=>updateContinuityEvent(e.id,{note:val,...(e.type==="damaged"?{condition:val||"damaged"}:{})})}),
    e.referenceAssetId && typeof nbGetImage==="function" && nbGetImage(e.referenceAssetId) &&
      React.createElement("div",{className:"state-hint"},React.createElement(Icon.image,{s:11}),
        "Visual condition reference retained from the earlier Appearance State.")
  );

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===p.id?" batch-on":""),"data-prop-card":p.id},
    React.createElement(SheetFrame,{ gen:genForFrame, slotId:"propref-"+p.id, name:p.name, avatarColor:propSwatch(p.kind),
      initials, drafted, drafting, onDraft:()=>onDraft(p), entity:p, onView,
      slotPlaceholder:"Drop a photo of the object", noun:"prop sheet",
      // The empty slot is also the finished-image importer (full resolution, like the Locations
      // plate), so the separate "Upload a finished sheet" button is intentionally omitted.
      dropToImport:true,
      specGate:{ ready:(drafted || !p.manual), hint:"Draft the design spec first \u2014 form & material are what the sheet is built from." },
      referenceControls: window.SheetReferenceStrip && React.createElement(window.SheetReferenceStrip,{
        gen, loadRefs:cardRefsLoader, onView,
        refreshKey:[p.id,p.ownerId,referenceImages.map(r=>r.id||r.url).join(",")].join("|")
      }),
      // WORN items: the character sheet stays their default canon (wides/mediums).
      // A separate CLOSE-UP macro sheet is OPTIONAL, generated per-card on demand
      // against the OWNER's sheet (so the designs agree); it attaches to shots only
      // at CU/MCU/ECU/INSERT sizes where the item reads large. Batch generation
      // still skips worn items.
      onDelete:()=>onDelete(p.id), deleteLabel:"Delete prop" }),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"prop-name-row"},
            React.createElement("button",{type:"button",
              className:"prop-kind-badge prop-binding-badge "+(p.kind==="worn"?"worn":p.kind==="dressing"?"dressing":"carried")+(bindingOpen?" open":""),
              "aria-label":(p.kind==="dressing"?"Set dressing location: ":"Prop owner: ")+(p.kind==="dressing"
                ? (((typeof propHomeLocation==="function") && (propHomeLocation(p)||{}).name) || "No location assigned")
                : (p.ownerName||"Unassigned")),
              "aria-expanded":bindingOpen?"true":"false",
              onClick:(e)=>{ e.stopPropagation(); setBindingOpen(v=>!v); },
              onBlur:()=>setBindingOpen(false)},
              React.createElement("span",{className:"prop-binding-label"},p.kind==="dressing" ? "set dressing" : (p.kind||"carried")),
              React.createElement("span",{className:"prop-binding-owner-icon","aria-hidden":"true"},
                React.createElement(p.kind==="dressing"?Icon.globe:Icon.user,{s:8})),
              React.createElement("span",{className:"prop-binding-pop",role:"tooltip"},
                React.createElement("b",null,p.kind==="dressing"?"Location":"Owner"),
                React.createElement("span",null,p.kind==="dressing"
                  ? (((typeof propHomeLocation==="function") && (propHomeLocation(p)||{}).name) || "No location assigned")
                  : (p.ownerName||"Unassigned")))),
            React.createElement("div",{className:"sheet-name",title:p.name||""},
              React.createElement(EditText,{value:p.name,placeholder:"Prop name\u2026",onCommit:val=>onUpdate(p.id,{name:val})})),
            p.kind==="worn" && window.InfoTip && React.createElement(window.InfoTip,{
              label:"How worn prop sheets work",
              text:"Worn items are rendered on "+(p.ownerName||"the character")+"'s character sheet and that remains the canon for wide and medium shots. Generate a separate macro sheet here only when the item needs to read clearly in a close-up. The macro sheet uses the owner sheet as visual context and attaches to CU, MCU, ECU and INSERT shots. Batch generation skips these optional macro sheets."
            })),
          p.kind==="dressing" && React.createElement("div",{className:"prop-worn-note",
            title:"Two ways to place this fixture into its location's plate: open the plate's Edit panel and click this fixture's Set-dressing chip (inserts an edit instruction built from this card's spec), or \u2014 once this sheet is generated \u2014 use the chip's attach button to ALSO ride this sheet along as a reference image, locking the exact design."},
            React.createElement(Icon.sparkles,{s:11}),
            React.createElement("span",null,"Placed into ",React.createElement("b",null,((typeof propHomeLocation==="function") && (propHomeLocation(p)||{}).name) || "its location"),"'s plate via the plate's Edit panel \u2014 by prompt, or prompt + this sheet as reference"))),
        React.createElement("div",{className:"sheet-head-actions"},
          React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(p)},
            React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"),
          window.QaCheckButton && React.createElement(window.QaCheckButton,{ gen:genForFrame, name:p.name, noun:"prop sheet",
            specFields:()=>({ form:(p.form||""), material:(p.material||""), detail:(p.detail||""), size:(p.size||""), scale:(p.scale||"") }),
            onApplySpec:(patch)=>onUpdate(p.id, patch) }),
          // FITTING — side-by-side owner sheet · prop sheet with an optional vision critique
          (p.ownerId && gen.genUrl) && React.createElement("button",{className:"char-draft-btn ghost",
            title:"Fitting view \u2014 "+(p.name||"the object")+" side by side with "+(p.ownerName||"its owner")+"\u2019s sheet, with an optional AI critique of whether they belong together",
            onClick:()=>setFitOpen(true)},
            React.createElement(Icon.box,{s:12}),"Fitting")),
          fitOpen && React.createElement(PropFittingModal,{ p, propUrl:gen.genUrl, onClose:()=>setFitOpen(false) })),

      promptStale && React.createElement("div",{className:"prompt-drift-banner",role:"status"},
        React.createElement(Icon.alert,{s:14}),
        React.createElement("span",null,
          React.createElement("b",null,"Reference out of date"),
          " · The prop spec changed after this sheet was generated. Use Regenerate prop sheet above to update it.")),

      React.createElement("div",{className:"char-style-row"},
        React.createElement("span",{className:"char-style-lab"},"Render style"),
        React.createElement("div",{className:"char-style-pick"},
          React.createElement(window.RenderStylePicker,{value:p.renderStyleKey||propInheritedStyleKey(p)||(window.turnDefaultRenderStyleKey?window.turnDefaultRenderStyleKey():"photoreal"),disabled:styling,onPick:pickPropStyle}),
          (window.turnCanLockStyles && window.turnCanLockStyles()) && React.createElement("span",{className:"char-style-count"+(((window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)>=(window.turnGlobalStyleCap||40))?" full":""),title:"Global render styles ("+(window.turnGlobalStyleCap||40)+" max, admin-managed). You can save up to "+(window.turnPersonalStyleCap||10)+" personal render styles. Manage via Styles in the top bar."}, (window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)+"/"+(window.turnGlobalStyleCap||40))),
        styling && React.createElement("span",{className:"char-style-busy"},React.createElement("span",{className:"ns-spin"}),"Inventing\u2026"),
        (!styling && p.renderStyleKey==="surprise" && p.surpriseRender && p.surpriseRender.label) &&
          React.createElement("span",{className:"char-style-name",title:"Re-roll a new surprise style",onClick:rollSurprise},
            p.surpriseRender.label," \u21bb"),
        (!styling && p.renderStyleKey==="surprise" && p.surpriseRender && p.surpriseRender.style && window.turnCanLockStyles && window.turnCanLockStyles()) &&
          React.createElement("button",{className:"char-style-lock",title:"Lock this style \u2014 keep it and reuse it across Characters, Props & Locations",onClick:lockSurprise},"\ud83d\udd12 Lock this style"),
        (!styling && unlockVisible && window.turnIsUserStyle && window.turnIsUserStyle(p.renderStyleKey)) &&
          React.createElement("span",{className:"char-style-name char-style-locked",title:"Your saved style \u2014 reusable everywhere. Click to unlock.",onClick:unlockCurrent},"\ud83d\udd12 saved \u00b7 unlock")),

      (sceneIds!==undefined) && React.createElement("div",{className:"prop-scenes"},
        React.createElement("span",{className:"prop-scenes-lab",
            title: scenesDerived ? "Automatically derived from "+(p.ownerName||"the owner")+"'s scene presence" : "Automatically refreshed when the screenplay changes"},
            "SCENES"),
        React.createElement(SceneChipPager,{ none:"No scene appearances found",
          items: propScenes.map(s=>({ key:s.id, label:String(s.no).padStart(2,"0"), className:"prop-scene-chip",
            title:s.title||("Scene "+s.no), onClick:()=>onChipClick&&onChipClick(s.id) })) })),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"Details not drafted yet \u2014 click ",
          React.createElement("b",null,"Draft details")," to fill the object's form & material.")),

      (dupIds && dupIds.length>1) && React.createElement("div",{className:"prop-dup-warn"},
        React.createElement("div",{className:"prop-dup-head"},
          React.createElement(Icon.alert,{s:13}),
          React.createElement("span",null,"This looks like the same object as ",
            React.createElement("b",null,(dupProps||[]).map(d=>d.name).join(", ")||((dupIds.length-1)+" other")),
            ". Merging combines their scenes \u2014 keep the card whose art & spec you prefer.")),
        // show the OTHER duplicate(s) so you can see what you're merging, each with its thumbnail
        React.createElement("div",{className:"prop-dup-cards"},
          (dupProps||[]).map(d=>{
            const u = (typeof nbGetImage==="function") ? nbGetImage(d.id) : "";
            return React.createElement("div",{key:d.id,className:"prop-dup-card"},
              u ? React.createElement("img",{src:u,alt:d.name,onClick:()=>onView&&onView(u,d)})
                : React.createElement("div",{className:"prop-dup-noimg"},React.createElement(Icon.image,{s:14})),
              React.createElement("span",{className:"prop-dup-name",title:d.name},d.name));
          })),
        React.createElement("div",{className:"prop-dup-acts"},
          React.createElement("button",{className:"prop-dup-merge",onClick:()=>onMerge&&onMerge(dupIds, p.id),
            title:"Merge all of these into THIS card \u2014 this card's art & spec are kept, their scenes are combined"},
            React.createElement(Icon.layers,{s:12}),"Merge \u2014 keep this card"))),

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
              React.createElement("option",{value:"worn"},"Worn"),
              React.createElement("option",{value:"dressing"},"Set dressing")))),
        React.createElement("div",{className:"sheet-props-note"},
          React.createElement(Icon.layers,{s:11}),
          "Type is the default binding only. Story events can move this canonical prop between a body, a hand and a set without duplicating it."),
        React.createElement("div",{className:"sheet-2col"},
          React.createElement("div",{className:"sheet-field"},
            React.createElement("div",{className:"obj-lab"},"Custodian"),
            React.createElement("select",{className:"prop-select",value:p.custodianId||p.ownerId||"",
              onChange:e=>{const ch=(characters||[]).find(c=>c.id===e.target.value);onUpdate(p.id,{custodianId:e.target.value,custodianName:ch?ch.name:""});}},
              React.createElement("option",{value:""},"Unassigned"),
              (characters||[]).map(c=>React.createElement("option",{key:c.id,value:c.id},c.name)))),
          React.createElement("div",{className:"sheet-field"},
            React.createElement("div",{className:"obj-lab"},"Design association"),
            React.createElement("select",{className:"prop-select",value:(p.associationType||"")+":"+(p.associationId||p.ownerId||p.locationId||""),
              onChange:e=>{const parts=e.target.value.split(":");const type=parts[0],id=parts[1]||"";const item=type==="character"?(characters||[]).find(x=>x.id===id):continuityLocations.find(x=>x.id===id);onUpdate(p.id,{associationType:type,associationId:id,associationName:item?item.name:""});}},
              React.createElement("option",{value:":"},"Project world"),
              React.createElement("optgroup",{label:"Characters"},(characters||[]).map(c=>React.createElement("option",{key:"c"+c.id,value:"character:"+c.id},c.name))),
              React.createElement("optgroup",{label:"Locations"},continuityLocations.map(l=>React.createElement("option",{key:"l"+l.id,value:"location:"+l.id},l.name)))))),
        React.createElement(SheetField,{label:"Owner / origin — canonical provenance",value:p.origin||p.ownerName||"",
          placeholder:"Originally Yusuf's · stolen police issue · found in the Minicab…",onCommit:val=>onUpdate(p.id,{origin:val})}),
        // RELATIONSHIP — one line on how the owner relates to this object; feeds the
        // sheet prompt (condition/wear/repairs express it) and bakes into the owner's
        // character sheet for worn items. Belonging = character truth, not just style.
        p.ownerId && React.createElement(SheetField,{label:"Relationship \u2014 how "+(p.ownerName||"the owner")+" relates to it",value:p.relation,
          placeholder:"treasured \u2014 a gift from her mother \u00b7 resented \u00b7 stolen \u00b7 inherited \u00b7 borrowed \u00b7 made it themselves\u2026",
          title:"Feeds this prop's sheet prompt \u2014 its condition, wear and repairs express the relationship \u2014 and bakes into "+(p.ownerName||"the owner")+"'s character sheet for worn items.",
          onCommit:val=>onUpdate(p.id,{relation:val})}),
        // FIXTURE OF — a set-dressing object belongs to a PLACE (it bakes into that
        // location's plate and inherits its render style). Auto = the one location
        // every mapped scene resolves to; pick explicitly for e.g. apartment furniture.
        p.kind==="dressing" && React.createElement("div",{className:"sheet-field"},
          React.createElement("div",{className:"obj-lab"},"Fixture of"),
          React.createElement("select",{className:"prop-select",value:p.locationId||"",
            onChange:e=>onUpdate(p.id,{locationId:e.target.value})},
            React.createElement("option",{value:""},
              "Auto — "+(((typeof propHomeLocation==="function") && (propHomeLocation({...p, locationId:""})||{}).name) || "no single location from scenes")),
            (((window.turnContinuity||{}).locations)||[]).map(l=>React.createElement("option",{key:l.id,value:l.id},l.name||"Location")))),
        React.createElement(SheetField,{label:"Form \u2014 shape & silhouette",value:p.form,multiline:true,
          placeholder:"What it is and what it looks like \u2014 shape, size, silhouette\u2026",onCommit:val=>onUpdate(p.id,{form:val})}),
        React.createElement(SheetField,{label:"Material & finish",value:p.material,multiline:true,
          placeholder:"What it's made of \u2014 metal, plastic, fabric; sheen, wear, texture\u2026",onCommit:val=>onUpdate(p.id,{material:val})}),
        // real-world measurement \u2014 the scale system sizes the object against the cast
        // in every shot from this ('Design all props' drafts it; edit to correct)
        React.createElement(SheetField,{label:"Physical size \u2014 full real-world dimensions",value:p.size,
          placeholder:"~1.2 m tall \u00d7 ~60 cm wide \u00d7 ~45 cm deep \u00b7 or ~18 cm long \u00d7 ~7 cm diameter\u2026",onCommit:val=>onUpdate(p.id,{size:val})}),
        // SCALE AGAINST THE OWNER — proportions relative to the body ("hangs to mid-
        // thigh"); shot prompts carry it so the object never shrinks or grows next to them
        p.ownerId && React.createElement(SheetField,{label:"Scale against "+(p.ownerName||"the owner"),value:p.scale,
          placeholder:"hangs from her shoulder to mid-thigh \u00b7 the size of his forearm \u00b7 fills both hands\u2026",
          title:"Proportions relative to the owner\u2019s body \u2014 shot prompts carry this so the object keeps its size next to them.",
          onCommit:val=>onUpdate(p.id,{scale:val})})),

      React.createElement(CardFold,{label:"Significance",defaultOpen:false},
        React.createElement(SheetField,{label:"What it means in the story",value:p.detail,multiline:true,
          placeholder:"Why this object matters \u2014 what it represents, how it's used\u2026",onCommit:val=>onUpdate(p.id,{detail:val})})),

      React.createElement(CardFold,{label:"Continuity \u00b7 story events",count:continuityEvents.length||null,defaultOpen:false},
        React.createElement("div",{className:"sheet-props-note"},
          React.createElement(Icon.layers,{s:11}),
          "Record changes only. Holder, placement, condition and visibility persist automatically until the next event; Shots and Stage resolve the state at their exact moment."),
        React.createElement("div",{className:"state-actions"},
          React.createElement("button",{className:"state-add-btn",onClick:addContinuityEvent},React.createElement(Icon.plus,{s:12}),"Add event")),
        /* legacy inline renderer retained for saved-card compatibility; replaced below.
        false ? React.createElement("div",{className:"state-list prop-event-list"},continuityEvents.map((e,i)=>
          React.createElement("div",{key:e.id,className:"state-row prop-event-row"},
            React.createElement("div",{className:"state-row-head"},
              React.createElement("span",{className:"state-vtag base"},String(i+1)),
              React.createElement("select",{className:"prop-select",value:e.type||"handed_over",onChange:ev=>updateContinuityEvent(e.id,{type:ev.target.value})},
                PROP_EVENT_TYPES.map(t=>React.createElement("option",{key:t,value:t},t.replace(/_/g," ")))),
              React.createElement("button",{className:"state-del",title:"Remove event",onClick:()=>deleteContinuityEvent(e.id)},React.createElement(Icon.x,{s:13}))),
            React.createElement("div",{className:"sheet-2col prop-event-moment"},
              React.createElement("div",{className:"sheet-field"},React.createElement("div",{className:"obj-lab"},"From scene"),
                React.createElement("select",{className:"prop-select",value:e.sceneId||"",onChange:ev=>updateContinuityEvent(e.id,{sceneId:ev.target.value})},
                  React.createElement("option",{value:""},"Choose scene\u2026"),(scenes||[]).map(s=>React.createElement("option",{key:s.id,value:s.id},"Sc "+s.no+" \u00b7 "+s.title)))),
              React.createElement("div",{className:"sheet-field"},React.createElement("div",{className:"obj-lab"},"Beat \u00b7 micro \u00b7 shot"),
                React.createElement("div",{className:"prop-event-inline"},
                  ["beatId","microBeatId","shotId"].map((k,n)=>React.createElement("input",{
                    key:k,className:"prop-event-input",value:e[k]||"",placeholder:["Beat","Micro","Shot"][n],
                    onChange:ev=>updateContinuityEvent(e.id,{[k]:ev.target.value})
                  })))
              )),
            (["acquired","handed_over","recovered"].includes(e.type||"handed_over")) && React.createElement("div",{className:"sheet-field"},
              React.createElement("div",{className:"obj-lab"},"Holder / user after event"),
              React.createElement("select",{className:"prop-select",value:e.holderId||e.toCharacterId||"",onChange:ev=>{const ch=(characters||[]).find(x=>x.id===ev.target.value);updateContinuityEvent(e.id,{holderId:ev.target.value,holderName:ch?ch.name:""});}},
                React.createElement("option",{value:""},"Unassigned"),(characters||[]).map(c=>React.createElement("option",{key:c.id,value:c.id},c.name)))),
            (e.type==="placed") && React.createElement("div",{className:"sheet-field"},
              React.createElement("div",{className:"obj-lab"},"Physical placement"),
              React.createElement("select",{className:"prop-select",value:e.locationId||"",onChange:ev=>updateContinuityEvent(e.id,{locationId:ev.target.value})},
                React.createElement("option",{value:""},"Choose location\u2026"),continuityLocations.map(l=>React.createElement("option",{key:l.id,value:l.id},l.name)))),
            React.createElement(SheetField,{label:"Event note / condition",value:e.note||e.condition||"",placeholder:"Placed on the Minicab dashboard \u00b7 cracked during the struggle\u2026",onCommit:val=>updateContinuityEvent(e.id,{note:val,...(e.type==="damaged"?{condition:val||"damaged"}:{})})})))
        )) : React.createElement("div",{className:"state-empty"},"No changes recorded. The default binding persists wherever the screenplay maps this prop.")), */
        continuityEvents.length
          ? React.createElement("div",{className:"state-list prop-event-list"},continuityEvents.map(renderContinuityEvent))
          : React.createElement("div",{className:"state-empty"},"No changes recorded. The default binding persists wherever the screenplay maps this prop.")),

      custody.length>0 && React.createElement(CardFold,{label:"Legacy custody handovers",count:custody.length||null,defaultOpen:false},
        React.createElement("div",{className:"sheet-props-note"},
          React.createElement(Icon.sparkles,{s:11}),
          "Objects that CHANGE HANDS along the story \u2014 the letter passed to Diego at Sc 12. Shots resolve who actually holds it in each scene; the design, its sheets and its wear states stay anchored to the owner above."),
        p.ownerId
          ? React.createElement("div",{className:"state-actions"},
              React.createElement("button",{className:"state-add-btn",onClick:addCustody},
                React.createElement(Icon.plus,{s:12}),"Add handover"))
          : React.createElement("div",{className:"state-hint"},
              React.createElement(Icon.alert,{s:11}),
              "Assign an owner above first \u2014 custody tracks where the object goes FROM them."),
        React.createElement("div",{className:"state-row state-base"},
          React.createElement("span",{className:"state-vtag base"},"start"),
          React.createElement("span",{className:"state-base-lab"},(p.ownerName||"Unassigned")+" \u2014 holds it from the start")),
        custody.map(e=>React.createElement("div",{key:e.id,className:"state-row"},
          React.createElement("div",{className:"state-row-head"},
            React.createElement(Icon.box,{s:12}),
            React.createElement("select",{className:"prop-select",value:e.charId||"",
              onChange:ev=>{ const ch=(characters||[]).find(x=>x.id===ev.target.value);
                updateCustody(e.id,{charId:ev.target.value, charName:ch?ch.name:""}); }},
              React.createElement("option",{value:""},"New holder\u2026"),
              (characters||[]).filter(ch=>ch && ch.id!==p.ownerId)
                .map(ch=>React.createElement("option",{key:ch.id,value:ch.id},ch.name||"Unnamed"))),
            React.createElement("button",{className:"state-del",title:"Remove handover",onClick:()=>deleteCustody(e.id)},
              React.createElement(Icon.x,{s:13}))),
          React.createElement("div",{className:"sheet-field"},
            React.createElement("div",{className:"obj-lab"},"Takes it from scene"),
            React.createElement("select",{className:"prop-select",value:e.fromSceneId||"",onChange:ev=>updateCustody(e.id,{fromSceneId:ev.target.value})},
              React.createElement("option",{value:""},"Not pinned"),
              (scenes||[]).map(s=>React.createElement("option",{key:s.id,value:s.id},"Sc "+s.no+" \u00b7 "+s.title)))),
          React.createElement(SheetField,{label:"How it changes hands",value:e.note,
            placeholder:"Diego finds it on the desk \u00b7 Marisol presses it into his hands\u2026",
            onCommit:val=>updateCustody(e.id,{note:val})})))),

      React.createElement(CardFold,{label:"Look dev",defaultOpen:false},
        React.createElement(SheetField,{label:"Render style \u2014 edit freely",value:p.renderStyle||d.renderStyle,multiline:true,
          placeholder:"photoreal product reference, 85mm, soft studio lighting\u2026",onCommit:val=>onUpdate(p.id,{renderStyle:val})})),

      React.createElement(CardFold,{label:"Master reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"4-panel object sheet (hero \u00b7 front \u00b7 side \u00b7 detail) \u2014 feed to your image tool",text:buildPropRefPrompt(p,project)}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:p.negativePrompt||d.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(p.id,{negativePrompt:val})}),
        React.createElement(CopyBox,{label:(genForFrame.genUrl && genForFrame.genMeta && genForFrame.genMeta.prompt)
            ? "Final prompt \u2014 generated the CURRENT sheet" : "Final prompt \u2014 master + negative (sent at generation)",
          text:(genForFrame.genUrl && genForFrame.genMeta && genForFrame.genMeta.prompt) || finalPrompt}),
        promptStale &&
          React.createElement("div",{className:"prompt-drift-note"},
            "The spec has changed since this sheet was generated \u2014 Regenerate to bring the sheet back in step with it."))));
}

function PropSheets({ project, props, characters, scenes, drafts, onUpdate, onDraft, onDraftAll, onAdd, onDelete, draftingId, draftingIds, draftingAll, onSeedFromCast, castHasProps, onTagScenes, taggingScenes, onTagOne, taggingSceneId, onMergeProps, onPropsMaster, trashItems, onRestore, onPurge, onEnsureOwner, lookbookStale, onApplyLookbook, onApplyLookbookDraftOnly }){
  const [view, setView] = React.useState(null);   // {url, character/prop}
  if(window.useRenderStyleVersion) window.useRenderStyleVersion();   // re-render dropdowns when a style is locked/unlocked
  const [sceneFilter, setSceneFilter] = React.useState("");   // "" = all
  const [query, setQuery] = React.useState("");               // free-text name/owner search
  const [searchOpen, setSearchOpen] = React.useState(false);  // collapsible search: icon-only until clicked
  const searchRef = React.useRef(null);
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = props || [];
  // STYLE · ALL PROPS — apply one render style to every prop at once (mirrors the cast's
  // 'Style · all cast'); each prop can still be overridden on its own card.
  const [allStyling, setAllStyling] = React.useState(null);   // null | {i,total} (surprise progress)
  const PROP_TEXT = window.PROP_RENDER_TEXT || {};
  const defaultStyleKey = window.turnDefaultRenderStyleKey ? window.turnDefaultRenderStyleKey() : "photoreal";
  const allStyleKey = (list.length && list.every(p=>(p.renderStyleKey||defaultStyleKey)===(list[0].renderStyleKey||defaultStyleKey)))
    ? (list[0].renderStyleKey||defaultStyleKey) : "";
  const propBibleOf = (p)=> [p.name&&("Name: "+p.name), p.ownerName&&("Owner: "+p.ownerName),
    p.form&&("Form: "+p.form), p.material&&("Material: "+p.material), p.detail&&("Significance: "+p.detail),
    p.relation&&("Relationship: "+p.relation), p.scale&&("Scale against owner: "+p.scale),
    (typeof custodyChainLabel==="function" && custodyChainLabel(p, ((window.turnContinuity||{}).scenes)||[])) && ("Custody: "+custodyChainLabel(p, ((window.turnContinuity||{}).scenes)||[])),
    (project&&project.genre)&&("Genre: "+project.genre)].filter(Boolean).join("\n");
  const applyStyleAll = async (key)=>{
    if(!key || allStyling) return;
    if(key!=="surprise"){ const t=(typeof window.renderStyleText==="function" ? window.renderStyleText("prop", key) : (PROP_TEXT[key]||PROP_TEXT.photoreal)); list.forEach(p=> onUpdate(p.id, { renderStyleKey:key, renderStyle:t })); return; }
    list.forEach(p=> onUpdate(p.id, { renderStyleKey:"surprise" }));
    if(!(typeof aiSurpriseStyleText==="function" && typeof aiAvailable==="function" && aiAvailable())) return;
    const need = list.filter(p=>!(p.surpriseRender && p.surpriseRender.style));
    if(!need.length) return;
    let ok = true;
    if(typeof window.appConfirm==="function") ok = await window.appConfirm({
      title:"Invent a surprise style for "+need.length+" prop"+(need.length!==1?"s":"")+"?",
      body:"Each prop gets its OWN bespoke fused style invented from its bible — that's "+need.length+" AI call"+(need.length!==1?"s":"")+".",
      confirmLabel:"Invent styles" });
    if(!ok) return;
    setAllStyling({ i:0, total:need.length });
    for(let i=0;i<need.length;i++){ setAllStyling({ i:i+1, total:need.length });
      try{ const r = await aiSurpriseStyleText({ name:need[i].name, kind:"prop", bible:propBibleOf(need[i]) }, project);
        if(r) onUpdate(need[i].id, { surpriseRender:r, renderStyle:r.style }); }catch(e){} }
    setAllStyling(null);
  };
  const sceneList = scenesInStoryOrder(scenes);
  // EFFECTIVE scene map. A prop seeded from the cast may never have been scene-mapped
  // (p.scenes === undefined) — those used to silently vanish from every scene focus
  // and from the dropdown counts, while still showing under "All scenes" (the
  // filter-vs-character-sheet mismatch). Fallback: an OWNED, unmapped prop derives
  // its scenes from its owner's presence — the same deterministic rule the mapper
  // itself uses for worn items. The automatic screenplay remapper replaces the
  // fallback with a stored (AI-narrowed) map; unowned + unmapped props stay out.
  const effMap = React.useMemo(()=>{
    const m = {};
    if(typeof scenesWhereCharacterAppears!=="function") return m;
    // does THIS scene's script/summary actually name the object? (head noun, or a
    // meaningful word of its name — 4+ letters so "of"/"the" never match)
    const namesIt = (p, s)=>{
      const hay = (((typeof window.sceneScriptText==="function") ? window.sceneScriptText(s.id, drafts) : "")
        +" "+(s.summary||"")).toLowerCase();
      if(!hay.trim()) return false;
      const head = propHeadNoun(p.name);
      if(head && hay.indexOf(head)>=0) return true;
      return String(p.name||"").toLowerCase().split(/[^a-z0-9]+/)
        .filter(w=>w.length>=4).some(w=> hay.indexOf(w)>=0);
    };
    list.forEach(p=>{
      if(Array.isArray(p.scenes)) return;
      if(!(p.ownerId || p.ownerName)) return;
      // WORN: the owner's presence IS the prop's presence (it's on their body).
      // CARRIED: owner presence only OVER-counts (a briefcase isn't in every scene
      // its owner walks through — that once ballooned one scene's count to 36 of 43
      // props); an unmapped carried object is pinned to the scenes that actually
      // NAME it, and stays out of scene focus entirely if none do. The automatic
      // screenplay remapper stores the AI-narrowed map.
      if((p.kind||"carried")==="worn"){
        const ids = scenesWhereCharacterAppears(p.ownerId, p.ownerName, scenes, drafts) || [];
        if(ids.length) m[p.id] = ids;
      } else {
        const ids = (scenes||[]).filter(s=>namesIt(p,s)).map(s=>s.id);
        if(ids.length) m[p.id] = ids;
      }
    });
    return m;
  },[list, scenes, drafts]);
  const effScenes = (p)=> Array.isArray(p.scenes) ? p.scenes : effMap[p.id];
  const tagged = list.some(p=>p.scenes!==undefined) || Object.keys(effMap).length>0;
  const inScene = (p, sid)=>{ const sc = effScenes(p); return Array.isArray(sc) && sc.indexOf(sid)>=0; };
  // free-text search matches a prop's name or owner — at a WORD BOUNDARY, not anywhere,
  // so typing "h" surfaces words that START with h (Heavy, Handmade…) instead of matching
  // the "h" buried in "throat". Stacks on top of the scene filter.
  const q = query.trim().toLowerCase();
  const matchesQuery = (p)=> searchWordMatch((p.name||"")+" "+(p.ownerName||""), q);
  const kindOf = (p)=> (p && p.kind) || "carried";
  // Search and scene focus are the only grid filters.
  const kindCountBase = (sceneFilter ? list.filter(p=>inScene(p, sceneFilter)) : list).filter(matchesQuery);
  // carried props with no owner — they'd generate WORLD-GENERIC (no character anchor)
  const unassignedCarried = list.filter(p=> kindOf(p)==="carried" && !p.ownerId);
  const shown = kindCountBase;
  // 9-up pagination; suspended while a batch runs so the queue can reach every card
  const pager = usePager(shown.length, !!batchActiveId);
  // duplicate detection: map each prop id -> the set of ids it duplicates (same owner + object)
  const dupSets = (typeof findDuplicateProps==="function") ? findDuplicateProps(list) : {};
  const dupForId = {}; Object.values(dupSets).forEach(ids=> ids.forEach(id=>{ dupForId[id]=ids; }));
  const byId = {}; list.forEach(p=>{ byId[p.id]=p; });

  // one-time sanity pass: correct props whose NAME unambiguously contradicts their
  // worn/carried kind (e.g. a phone mis-filed as "worn"). Skips any the user has
  // deliberately set (kindSet) so a manual choice is never overridden.
  const kindFixed = React.useRef(false);
  React.useEffect(()=>{
    if(kindFixed.current || typeof classifyPropKind!=="function" || !list.length) return;
    kindFixed.current = true;
    list.forEach(p=>{
      if(p.kindSet) return;
      // ownerless objects may also classify as SET DRESSING (a hollow log, a bench) —
      // heals cards created before the dressing kind existed
      const k = classifyPropKind(p.name, { ownerless: !p.ownerId && !p.ownerName });
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
  // WORN props are rendered ON their owner's character sheet (their spec is baked into the
  // character prompt), so ONLY CARRIED and DRESSING props are generated as separate sheets
  // (a dressing sheet is optional — it can ride plate edits as a reference image).
  const draftedIds = (subset)=> subset.filter(p=>propVisualsDrafted(p) && p.kind!=="worn").map(p=>p.id);
  // batch never makes a WORLD-GENERIC carried prop: an owned object needs its owner's
  // sheet as the style anchor, so ownerless carried props are skipped (assign first)
  const anchorReady = (p)=> !!(p && !((p.kind||"carried")==="carried" && !p.ownerId));
  const startSceneBatch = ()=>{
    if(!sceneFilter || batchActiveId) return;
    if(query) setQuery("");             // ...and every prop in it, not just search matches
    const inSceneAll = list.filter(p=>inScene(p, sceneFilter));   // scene only — search cleared above
    const draftedScene = draftedIds(inSceneAll);
    const eligible = draftedScene.filter(id=> anchorReady(byId[id]));
    if(!eligible.length){
      const nonWorn = inSceneAll.filter(p=>p.kind!=="worn");
      batch.setMsg(draftedScene.length
        ? "The drafted carried props in this scene have no owner \u2014 assign one on each card first (batch generation won't make world-generic sheets)."
        : (!nonWorn.length
          ? "Every prop mapped to this scene is WORN \u2014 worn items render on their owner\u2019s character sheet (Characters tab), not here. Nothing separate to generate."
          : "Draft these props first (\u201cDraft details\u201d on each card) \u2014 nothing in this scene is ready to generate yet."));
      return;
    }
    batch.begin(eligible, inSceneAll.length - eligible.length);
  };
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const draftedAll = draftedIds(list);
    const eligible = draftedAll.filter(id=> anchorReady(byId[id]));
    if(!eligible.length){
      batch.setMsg(draftedAll.length
        ? "Every drafted carried prop has no owner \u2014 assign one on each card first (batch generation won't make world-generic sheets)."
        : "Draft the props first \u2014 nothing is ready to generate yet.");
      return;
    }
    // Clear filters before the batch: the queue advances only
    // when the target CARD is mounted, so a batch whose first target was filtered out
    // by a search box never generated anything and hung until Cancel
    if(sceneFilter) setSceneFilter("");
    if(query) setQuery("");
    batch.begin(eligible, list.length - eligible.length);
  };
  const eligibleAll = list.filter(p=>propVisualsDrafted(p) && p.kind!=="worn").length;
  const sceneNoOf = (sid)=>{ const s=(scenes||[]).find(x=>x.id===sid); return s?s.no:sid; };

  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},
            ((typeof roomCopy==="function" && roomCopy(project,"props").title) || "Props Master"),
            React.createElement(window.InfoTip,{label:"About Props",
              text:((typeof roomCopy==="function" && roomCopy(project,"props").tip) ||
                "Continuity objects \u2014 the things characters wear and carry, plus the set dressing the camera sees. Carried and set-dressing props get their own multi-view reference sheet (worn items render on their owner's character sheet instead); a set-dressing sheet can then ride the location plate's Edit panel as a reference image so the fixture lands exactly as designed. 'Design all props' builds every prop from the story in one pass \u2014 pulls missing items from the cast, drafts each spec, and maps every prop to its scenes; 'Generate all props' then renders the sheets.\n\nPROPS DERIVE FROM THE SCRIPT \u2014 there's no hand-adding here: name the object in the screenplay (worn, carried or set dressing) and 'Design all props' pulls it in.")}))),
        React.createElement("div",{className:"art-intro-actions"},
          window.RecentlyDeleted && React.createElement(window.RecentlyDeleted,{items:trashItems,kind:"prop",onRestore,onPurge,compact:true}),
          // NO hand-adding (product rule 2026-07-13): props derive from the script —
          // name an object in the screenplay (worn, carried or set dressing) and
          // 'Design all props' pulls it in; the Art Room never invents story objects.
          React.createElement("button",{className:"art-draftall ghost",disabled:draftingAll||(!list.length&&!castHasProps),onClick:onDraftAll,
            title:"Build every prop from the story in one pass \u2014 pull missing items from the cast, draft each spec (object, significance, look dev) from the script, and map every prop to the scenes it appears in"},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Design all props"),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the reference sheet for every drafted prop \u2014 you choose whether to redo ones that already have a sheet"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all props", typeof window.nbCostChip==="function" && window.nbCostChip(1))))),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,onDraftOnly:onApplyLookbookDraftOnly,label:"these props",dept:"props"}),
    unassignedCarried.length>0 && React.createElement("div",{className:"prompt-drift-note",style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}},
      React.createElement("span",{style:{flex:1,minWidth:220}},
        React.createElement("b",null,unassignedCarried.length+" carried prop"+(unassignedCarried.length!==1?"s":"")),
        " ha"+(unassignedCarried.length!==1?"ve":"s")+" no owner \u2014 assign one on each card so its sheet is anchored to a character, not generated world-generic.")),
    BatchBar && React.createElement(BatchBar,{batch,noun:"prop"}),
    // free-text search — filter prop cards by name or owner as you type
    (list.length>0 || (tagged && sceneList.length>0)) && React.createElement("div",{className:"prop-toolbar"},
      list.length>0 && React.createElement("div",{className:"prop-searchbar collapsible"+((searchOpen||q)?" open":""),
        title:(searchOpen||q)?"":"Search props",
        onClick:()=>{ if(!searchOpen && !q){ setSearchOpen(true); setTimeout(()=>{ if(searchRef.current) searchRef.current.focus(); },0); } }},
      React.createElement(Icon.search,{s:14}),
      React.createElement("input",{className:"prop-search-input",type:"text",value:query,ref:searchRef,
        placeholder:"Search props by name or owner…",tabIndex:(searchOpen||q)?0:-1,
        onChange:e=>setQuery(e.target.value),
        onBlur:()=>{ if(!query) setSearchOpen(false); },
        onKeyDown:e=>{ if(e.key==="Escape"){ setQuery(""); setSearchOpen(false); if(searchRef.current) searchRef.current.blur(); } }}),
      q && React.createElement("span",{className:"prop-search-count"},
        shown.length+" of "+list.length),
      q && React.createElement("button",{className:"prop-search-clear",title:"Clear search",
        onClick:(e)=>{ e.stopPropagation(); setQuery(""); setSearchOpen(false); }},React.createElement(Icon.x,{s:13}))),
      list.length>0 && React.createElement("div",{className:"char-style-all",
        title:"Apply one render style to ALL props at once. Each prop can still be overridden on its own card."},
        React.createElement("span",{className:"char-style-all-lab"},
          allStyling ? ("Inventing… "+allStyling.i+"/"+allStyling.total) : "Style · all props"),
        React.createElement(window.RenderStylePicker,{value:allStyleKey,disabled:!!allStyling,
          placeholderLabel:"Mixed — per prop",onPick:applyStyleAll})),
    // scene filter + per-scene batch generate
    tagged && sceneList.length>0 && React.createElement("div",{className:"prop-scenebar"},
      React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.layers,{s:13}),"Focus a scene"),
      React.createElement("select",{className:"prop-select prop-scenebar-select",value:sceneFilter,
        onChange:e=>setSceneFilter(e.target.value)},
        React.createElement("option",{value:""},"All scenes \u2014 show every prop"),
        sceneList.map(s=>{
          // Scene counts respect the active search so the dropdown and visible grid agree.
          const n = list.filter(p=>inScene(p,s.id)).filter(matchesQuery).length;
          return React.createElement("option",{key:s.id,value:s.id},
            "Scene "+String(s.no).padStart(2,"0")+" \u00b7 "+(s.title||"")+"  ("+n+" prop"+(n!==1?"s":"")+")");
        })),
      sceneFilter && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId,onClick:startSceneBatch,
        title:"Generate reference sheets for the props in this scene \u2014 you choose whether to redo ones that already have a sheet"},
        React.createElement(Icon.sparkles,{s:14}),
        batchActiveId?"Generating\u2026":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")), typeof window.nbCostChip==="function" && window.nbCostChip(1)))),
    list.length
      ? (shown.length
          ? React.createElement(React.Fragment,null,
              React.createElement("div",{className:"sheet-grid"},
                pager.slice(shown).map(p=>React.createElement(PropSheet,{key:p.id,p,project,characters,scenes,onUpdate,onDelete,onDraft,onEnsureOwner,
                  drafting:draftingId===p.id||(draftingIds||[]).indexOf(p.id)>=0||draftingAll,onView:(url,pr)=>setView({url,character:pr}),
                  batchActiveId,onBatchDone:batch.advance,onChipClick:(sid)=>setSceneFilter(sid),
                  onTagOne,taggingScene:taggingSceneId===p.id,derivedScenes:effMap[p.id],
                  dupIds:dupForId[p.id],dupProps:(dupForId[p.id]||[]).filter(id=>id!==p.id).map(id=>byId[id]).filter(Boolean),onMerge:onMergeProps}))),
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
                React.createElement("div",{className:"art-soon-d"},"Nothing the cast wears or carries was found in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")+". Try another scene; prop appearances refresh automatically when the screenplay changes."),
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
