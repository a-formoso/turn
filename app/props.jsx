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
  const d1 = detail   ? ("its signature feature \u2014 "+((typeof clipWords==="function")?clipWords(detail,90):detail.slice(0,90)))   : "its most story-relevant feature";
  const d2 = material ? ("the material & finish in macro \u2014 "+((typeof clipWords==="function")?clipWords(material,90):material.slice(0,90))) : "the material & finish in macro";
  const d3 = "its construction \u2014 fastenings, joins, edges and wear marks";
  let s = "Prop concept art sheet, "+name+(form?(", "+form):"")
    +", full 360-degree turnaround, front view center, side view middle, back view right, "+bg
    +", no text, no labels, no watermarks, no annotations";
  if(material) s += ", made of "+material;
  s += ", approximately "+scale;
  s += ", right side: 3 close-up detail shots in a vertical grid showing "+d1+", "+d2+", "+d3;
  s += ", no text, no labels, "+styleText+", accurate material rendering, natural surface textures, soft studio lighting, "
    + bg + ", ultra detailed, clean layout, no typography, no captions";
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
    "front view, side view, and close-up detail",
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
  return (p && p.kind==="worn")
    ? "Reference image: "+who+"'s character sheet. This prop is WORN by "+who+" — render it in the SAME visual style, materials, colour palette, surface wear and finish as that character, so it looks like it belongs on their body."
    : "Reference image: "+who+"'s character sheet. Render this prop in the SAME visual style, palette and world as that character so it reads as theirs.";
}
window.propOwnerNote = propOwnerNote;

async function generatePropSheet(p, project){
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const basePrompt = (typeof combinedPropPrompt==="function") ? combinedPropPrompt(p, project) : (p.name||"prop reference");
  // reference the OWNER's character sheet (if generated) so the prop matches their look
  const ownerUrl = await propOwnerSheetUrl(p);
  const prompt = basePrompt + (ownerUrl ? (" "+propOwnerNote(p)) : "");
  const refOpts = ownerUrl ? { extraImages:[ownerUrl] } : {};
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
    const now = new Date();
    const mEntry = (window.NB_MODELS||[]).find(m=>m.id===model) || {};
    const meta = { modelLabel: mEntry.label||"Nano Banana", modelId: model, aspect, size,
      // match the per-card sheet caption: GPT Image carries its quality (low/medium/high)
      quality: (typeof window.providerOfModel==="function" && window.providerOfModel(model)==="openai")
        ? ((typeof window.nbGetOaiQuality==="function") ? window.nbGetOaiQuality() : "medium") : undefined,
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

function PropSheet({ p, project, characters, scenes, onUpdate, onDelete, onDraft, onEnsureOwner, drafting, onView, batchActiveId, onBatchDone, onChipClick, onTagOne, taggingScene, dupIds, dupProps, onMerge, derivedScenes, onKindClick }){
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

  const gen = useImageGen({
    id: p.id, slotId: "propref-"+p.id,
    entity: p,
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildPropFromPhotoPrompt(p, project),
    buildSimple: ()=> buildSimplePropPrompt(p),
    // reference the OWNER's character sheet so the prop matches their look (worn props
    // especially must read as part of THAT body, not a generic grey object).
    attachments: async ()=>{ const u = (typeof propOwnerSheetUrl==="function") ? await propOwnerSheetUrl(p) : "";
      return u ? [{ url:u, note:(p.ownerName||"owner")+" character sheet" }] : []; },
    attachmentsText: ()=> (typeof propOwnerNote==="function") ? propOwnerNote(p) : "",
    buildEdit: (instr)=>
      "Edit this prop reference sheet for "+(p.name||"the object")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else without alteration \u2014 the exact same object shape, proportions and identity "
      +"across all panels. Keep the same 3\u00d72 grid of views on a neutral grey background. "
      +"Do not replace or re-imagine the object.",
  });

  // Guarantee the prop is generated WITH its owner's character sheet: if the owner has no
  // sheet yet, generate it first (drafting the owner's spec if needed), THEN the prop —
  // so the owner sheet is present as a reference. No-op for ownerless / already-sheeted.
  const genWithOwner = React.useCallback(async (...a)=>{
    if(onEnsureOwner){ try{ await onEnsureOwner(p); }catch(e){} }
    return gen.generate(...a);
  },[gen, onEnsureOwner, p]);
  const genForFrame = onEnsureOwner ? { ...gen, generate: genWithOwner } : gen;

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

  // scenes this prop appears in, as {no,id} sorted by story order. A stored map wins;
  // an OWNED but never-mapped prop shows its derived owner-presence scenes instead
  // (passed in as derivedScenes), flagged "auto" — Re-map scenes pins the exact list.
  const sceneById = React.useMemo(()=>{ const m={}; (scenes||[]).forEach(s=>{ m[s.id]=s; }); return m; },[scenes]);
  const sceneIds = Array.isArray(p.scenes) ? p.scenes : (Array.isArray(derivedScenes) ? derivedScenes : undefined);
  const scenesDerived = !Array.isArray(p.scenes) && Array.isArray(derivedScenes);
  const propScenes = (sceneIds||[]).map(id=>sceneById[id]).filter(Boolean);

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===p.id?" batch-on":""),"data-prop-card":p.id},
    React.createElement(SheetFrame,{ gen:genForFrame, slotId:"propref-"+p.id, name:p.name, avatarColor:propSwatch(p.kind),
      initials, drafted, drafting, onDraft:()=>onDraft(p), entity:p, onView,
      slotPlaceholder:"Drop a photo of the object", noun:"prop sheet",
      // The empty slot is also the finished-image importer (full resolution, like the Locations
      // plate), so the separate "Upload a finished sheet" button is intentionally omitted.
      dropToImport:true,
      specGate:{ ready:(drafted || !p.manual), hint:"Draft the design spec first \u2014 form & material are what the sheet is built from." },
      // WORN items: the character sheet stays their default canon (wides/mediums).
      // A separate CLOSE-UP macro sheet is OPTIONAL, generated per-card on demand
      // against the OWNER's sheet (so the designs agree); it attaches to shots only
      // at CU/MCU/ECU/INSERT sizes where the item reads large. Batch generation
      // still skips worn items.
      onDelete:()=>onDelete(p.id), deleteLabel:"Delete prop" }),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"sheet-name",title:p.name||""},
            React.createElement(EditText,{value:p.name,placeholder:"Prop name\u2026",onCommit:val=>onUpdate(p.id,{name:val})})),
          React.createElement("div",{className:"sheet-role"},
            React.createElement("span",{className:"prop-kind-badge clickable "+(p.kind==="worn"?"worn":p.kind==="dressing"?"dressing":"carried"),
              role:"button",tabIndex:0,
              title:"Show only "+(p.kind==="dressing"?"set-dressing":(p.kind||"carried"))+" props",
              onClick:()=> onKindClick && onKindClick(p.kind||"carried"),
              onKeyDown:(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onKindClick && onKindClick(p.kind||"carried"); } }},
              p.kind==="dressing" ? "set dressing" : (p.kind||"carried")),
            p.kind==="dressing"
              ? (" \u00b7 "+(((typeof propHomeLocation==="function") && (propHomeLocation(p)||{}).name) || "no location yet"))
              : (p.ownerName ? (" \u00b7 "+p.ownerName) : " \u00b7 unassigned")),
          p.kind==="worn" && React.createElement("div",{className:"prop-worn-note",
            title:"Worn items are baked into "+(p.ownerName||"the owner")+"'s character-sheet prompt (with this card's form & material) and rendered there \u2014 that stays the canon for wide and medium shots. Generate here ONLY if this item gets a CLOSE-UP: the macro sheet is built against "+(p.ownerName||"the owner")+"'s sheet so the two designs agree, and it attaches to CU/MCU/ECU/INSERT shots where the item reads large. Batch buttons still skip worn items \u2014 this is per-card, on demand."},
            React.createElement(Icon.sparkles,{s:11}),
            React.createElement("span",null,"Rendered on ",React.createElement("b",null,p.ownerName||"the character"),"'s sheet \u2014 generate a separate macro sheet only for CLOSE-UPS")),
          p.kind==="dressing" && React.createElement("div",{className:"prop-worn-note",
            title:"Two ways to place this fixture into its location's plate: open the plate's Edit panel and click this fixture's Set-dressing chip (inserts an edit instruction built from this card's spec), or \u2014 once this sheet is generated \u2014 use the chip's attach button to ALSO ride this sheet along as a reference image, locking the exact design."},
            React.createElement(Icon.sparkles,{s:11}),
            React.createElement("span",null,"Placed into ",React.createElement("b",null,((typeof propHomeLocation==="function") && (propHomeLocation(p)||{}).name) || "its location"),"'s plate via the plate's Edit panel \u2014 by prompt, or prompt + this sheet as reference")),
          (sceneIds!==undefined) && React.createElement("div",{className:"prop-scenes"},
            React.createElement("span",{className:"prop-scenes-lab",
                title: scenesDerived ? "Auto-derived from "+(p.ownerName||"the owner")+"'s scene presence \u2014 click \u201cRe-map scenes\u201d to pin the exact appearances" : undefined},
                "Scenes"+(scenesDerived?" (auto)":"")),
            React.createElement(SceneChipPager,{ none:"No scene appearances found",
              items: propScenes.map(s=>({ key:s.id, label:String(s.no).padStart(2,"0"), className:"prop-scene-chip",
                title:s.title||("Scene "+s.no), onClick:()=>onChipClick&&onChipClick(s.id) })) }))),
        React.createElement("div",{className:"sheet-head-actions"},
          React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(p)},
            React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"),
          window.QaCheckButton && React.createElement(window.QaCheckButton,{ gen:genForFrame, name:p.name, noun:"prop sheet",
            specFields:()=>({ form:(p.form||""), material:(p.material||""), detail:(p.detail||""), size:(p.size||"") }),
            onApplySpec:(patch)=>onUpdate(p.id, patch) }),
          onTagOne && React.createElement("button",{className:"char-draft-btn ghost"+(taggingScene?" busy":""),disabled:!!taggingScene,onClick:()=>onTagOne(p),
            title:"Re-map which scenes this prop appears in \u2014 without re-drafting its spec. Use after the script changes."},
            React.createElement(Icon.layers,{s:12}), taggingScene?"Mapping\u2026":"Re-map scenes"))),

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
          placeholder:"~1.2 m tall \u00d7 ~60 cm wide \u00d7 ~45 cm deep \u00b7 or ~18 cm long \u00d7 ~7 cm diameter\u2026",onCommit:val=>onUpdate(p.id,{size:val})})),

      React.createElement(CardFold,{label:"Significance",defaultOpen:false},
        React.createElement(SheetField,{label:"What it means in the story",value:p.detail,multiline:true,
          placeholder:"Why this object matters \u2014 what it represents, how it's used\u2026",onCommit:val=>onUpdate(p.id,{detail:val})})),

      React.createElement(CardFold,{label:"Look dev",defaultOpen:false},
        React.createElement(SheetField,{label:"Render style \u2014 edit freely",value:p.renderStyle||d.renderStyle,multiline:true,
          placeholder:"photoreal product reference, 85mm, soft studio lighting\u2026",onCommit:val=>onUpdate(p.id,{renderStyle:val})})),

      React.createElement(CardFold,{label:"Master reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"Turnaround sheet (front/side/back + detail column) \u2014 feed to your image tool",text:buildPropRefPrompt(p,project)}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:p.negativePrompt||d.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(p.id,{negativePrompt:val})}),
        React.createElement(CopyBox,{label:(genForFrame.genUrl && genForFrame.genMeta && genForFrame.genMeta.prompt)
            ? "Final prompt \u2014 generated the CURRENT sheet" : "Final prompt \u2014 master + negative (sent at generation)",
          text:(genForFrame.genUrl && genForFrame.genMeta && genForFrame.genMeta.prompt) || finalPrompt}),
        (genForFrame.genUrl && genForFrame.genMeta && genForFrame.genMeta.prompt && genForFrame.genMeta.prompt!==finalPrompt) &&
          React.createElement("div",{className:"prompt-drift-note"},
            "The spec has changed since this sheet was generated \u2014 Regenerate to bring the sheet back in step with it."))));
}

function PropSheets({ project, props, characters, scenes, drafts, onUpdate, onDraft, onDraftAll, onAdd, onDelete, draftingId, draftingIds, draftingAll, onSeedFromCast, castHasProps, onTagScenes, taggingScenes, onTagOne, taggingSceneId, onMergeProps, onPropsMaster, trashItems, onRestore, onPurge, onEnsureOwner, lookbookStale, onApplyLookbook, onApplyLookbookDraftOnly }){
  const [view, setView] = React.useState(null);   // {url, character/prop}
  if(window.useRenderStyleVersion) window.useRenderStyleVersion();   // re-render dropdowns when a style is locked/unlocked
  const [sceneFilter, setSceneFilter] = React.useState("");   // "" = all
  const [kindFilter, setKindFilter] = React.useState("");     // "" | worn | carried | dressing
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
  const sceneList = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  // EFFECTIVE scene map. A prop seeded from the cast may never have been scene-mapped
  // (p.scenes === undefined) — those used to silently vanish from every scene focus
  // and from the dropdown counts, while still showing under "All scenes" (the
  // filter-vs-character-sheet mismatch). Fallback: an OWNED, unmapped prop derives
  // its scenes from its owner's presence — the same deterministic rule the mapper
  // itself uses for worn items. "Re-map scenes" / "Design all props" replaces the
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
      // NAME it, and stays out of scene focus entirely if none do — "Re-map scenes"
      // / "Design all props" stores the AI-narrowed map.
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
  // base for the SHOW chip counts: scene focus + search applied, but NOT the kind
  // filter (each chip counts its own kind WITHIN that base). So the numbers re-scope
  // to the focused scene — they match the scene dropdown's "(N props)" — instead of
  // always showing the whole-film totals.
  const kindCountBase = (sceneFilter ? list.filter(p=>inScene(p, sceneFilter)) : list).filter(matchesQuery);
  const shown = kindCountBase.filter(p=> !kindFilter || kindOf(p)===kindFilter);
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
  const startSceneBatch = ()=>{
    if(!sceneFilter || batchActiveId) return;
    if(kindFilter) setKindFilter("");   // the scene batch covers ALL kinds in the scene
    const eligible = draftedIds(shown);
    if(!eligible.length){
      const nonWorn = shown.filter(p=>p.kind!=="worn");
      batch.setMsg(!nonWorn.length
        ? "Every prop mapped to this scene is WORN \u2014 worn items render on their owner\u2019s character sheet (Characters tab), not here. Nothing separate to generate."
        : "Draft these props first (\u201cDraft details\u201d on each card) \u2014 nothing in this scene is ready to generate yet.");
      return;
    }
    batch.begin(eligible, shown.length - eligible.length);
  };
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Draft the props first \u2014 nothing is ready to generate yet."); return; }
    if(sceneFilter) setSceneFilter("");            // mount every card so the queue can reach each one
    if(kindFilter) setKindFilter("");
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
    BatchBar && React.createElement(BatchBar,{batch,noun:"prop"}),
    window.RecentlyDeleted && React.createElement(window.RecentlyDeleted,{items:trashItems,kind:"prop",onRestore,onPurge}),
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
    // worn/carried/dressing filter — one chip per kind, styled like the cards' kind
    // badges; the badge on any card is clickable to the same filter
    list.length>1 && React.createElement("div",{className:"kind-filterbar"},
      React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.box,{s:13}),"Show"),
      [["","All"],["worn","Worn"],["carried","Carried"],["dressing","Set dressing"]].map(kv=>{
        const k=kv[0], lab=kv[1];
        // hide a chip only for a kind the FILM never has (structural), so the chip
        // set stays stable across scenes; the COUNT is scene-scoped (kindCountBase)
        if(k && !list.some(p=>kindOf(p)===k)) return null;
        const n = k ? kindCountBase.filter(p=>kindOf(p)===k).length : kindCountBase.length;
        return React.createElement("button",{key:k||"all",
          className:"kind-chip"+(k?(" "+k):"")+(kindFilter===k?" on":"")+(n?"":" empty"),
          title: k ? ("Show only "+lab.toLowerCase()+" props"+(sceneFilter?" in this scene":"")) : ("Show every prop"+(sceneFilter?" in this scene":"")),
          onClick:()=>setKindFilter(k)}, lab, React.createElement("i",null,n));
      })),
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
        batchActiveId?"Generating\u2026":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")), typeof window.nbCostChip==="function" && window.nbCostChip(1)))),
    list.length
      ? (shown.length
          ? React.createElement(React.Fragment,null,
              React.createElement("div",{className:"sheet-grid"},
                pager.slice(shown).map(p=>React.createElement(PropSheet,{key:p.id,p,project,characters,scenes,onUpdate,onDelete,onDraft,onEnsureOwner,
                  onKindClick:(k)=>setKindFilter(x=>x===k?"":k),
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
            : kindFilter && !sceneFilter
              ? React.createElement("div",{className:"prop-empty"},
                  React.createElement("div",{className:"art-soon-t"},"No "+(kindFilter==="dressing"?"set-dressing":kindFilter)+" props"),
                  React.createElement("div",{className:"art-soon-d"},"Nothing on the tab is filed as "+(kindFilter==="dressing"?"set dressing":kindFilter)+" right now."),
                  React.createElement("button",{className:"art-draftall",style:{marginTop:16},onClick:()=>setKindFilter("")},"Show all props"))
            : React.createElement("div",{className:"prop-empty"},
                React.createElement("div",{className:"art-soon-t"},"No props appear in this scene"+(kindFilter?(" ("+(kindFilter==="dressing"?"set dressing":kindFilter)+" only)"):"")),
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
