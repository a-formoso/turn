/* stylebible-ui.jsx — The Style Bible viewer (modal).
   Shows every style preset in the film as a graded STILL, its 60/30/10 palette,
   a before→after on a neutral reference frame, the raw grade/lighting/lens/texture
   values, and a film-strip of which scene uses which preset. The "stills" are not
   AI renders — they're a neutral cinematic reference frame colour-GRADED live with
   CSS mix-blend-mode (luminance from the frame, hue/sat from the preset palette),
   so you can judge the looks instantly and offline. */

/* relative luminance of a hex colour (0=black,1=white) */
function hexLum(hex){
  const m = String(hex||"").replace("#","");
  if(m.length<6) return 0.5;
  const r=parseInt(m.slice(0,2),16)/255, g=parseInt(m.slice(2,4),16)/255, b=parseInt(m.slice(4,6),16)/255;
  return 0.2126*r+0.7152*g+0.0722*b;
}
/* contrast/brightness/saturation derived from the grade keywords AND the dominant
   colour's luminance (so a near-black dominant actually darkens the frame). */
function gradeFilter(preset){
  const g = ((preset&&preset.grade)||"").toLowerCase() + " " + ((preset&&preset.lighting)||"").toLowerCase();
  let contrast=1, bright=1, sat=1;
  if(/high.?contrast|crushed|hard/.test(g)){ contrast=1.45; bright=0.96; }
  if(/lifted|honey|warm|golden|soft|bloom|halation/.test(g)){ bright=1.08; contrast=0.95; }
  if(/desaturat|clinical|flat|clean/.test(g)){ contrast=1.02; }
  if(/monochrome/.test(g)){ sat=0.6; }
  // pull brightness toward the dominant colour's luminance: dark palettes go dark
  const lum = hexLum((preset&&preset.palette&&preset.palette[0])||"#888");
  bright *= (0.72 + lum*0.7);                 // dominant ~black -> ~0.72x, ~white -> ~1.4x
  return "contrast("+contrast.toFixed(2)+") brightness("+bright.toFixed(2)+") saturate("+sat+")";
}
/* the grading overlay: a top→bottom palette ramp (highlights=accent, mids=secondary,
   shadows=dominant) blended onto the frame's luminance. Honors the 60/30/10 split. */
function gradeOverlay(preset){
  const p = (preset&&preset.palette)||[];
  if(p.length<3) return "transparent";
  return "linear-gradient(180deg, "+p[2]+" 0%, "+p[2]+" 10%, "+p[1]+" 34%, "+p[0]+" 70%, "+p[0]+" 100%)";
}
/* a neutral, grayscale cinematic reference frame (interior-with-window comp);
   when `preset` is given it is colour-graded, otherwise shown ungraded. */
function StyleStill({ preset, label }){
  const graded = !!preset;
  return React.createElement("div",{className:"sb-still"},
    React.createElement("div",{className:"sb-still-base",style:{filter: graded?gradeFilter(preset):"contrast(1) saturate(0.18)"}},
      React.createElement("div",{className:"sb-sky"}),
      React.createElement("div",{className:"sb-glow"}),
      React.createElement("div",{className:"sb-floor"}),
      React.createElement("div",{className:"sb-window"}),
      React.createElement("div",{className:"sb-figure"}),
      React.createElement("div",{className:"sb-furn"}),
      React.createElement("div",{className:"sb-vig"})),
    graded && React.createElement("div",{className:"sb-grade",style:{background:gradeOverlay(preset)}}),
    graded && React.createElement("div",{className:"sb-grade-mult",style:{background:gradeOverlay(preset)}}),
    label && React.createElement("span",{className:"sb-still-tag"},label));
}

/* the 60/30/10 proportion bar with hex + role labels */
function PaletteBar({ preset }){
  const p = preset.palette||[];
  if(p.length<3) return null;
  const segs = [
    { w:60, c:p[0], lab:preset.dominantLabel||"dominant", pct:"60%" },
    { w:30, c:p[1], lab:preset.secondaryLabel||"secondary", pct:"30%" },
    { w:10, c:p[2], lab:preset.accentLabel||"accent", pct:"10%" },
  ];
  return React.createElement("div",{className:"sb-pal"},
    React.createElement("div",{className:"sb-pal-bar"},
      segs.map((s,i)=>React.createElement("div",{key:i,className:"sb-pal-seg",style:{flex:s.w,background:s.c},title:s.c}))),
    React.createElement("div",{className:"sb-pal-keys"},
      segs.map((s,i)=>React.createElement("div",{key:i,className:"sb-pal-key"},
        React.createElement("span",{className:"sb-pal-sw",style:{background:s.c}}),
        React.createElement("span",{className:"sb-pal-pct"},s.pct),
        React.createElement("span",{className:"sb-pal-lab"},s.lab),
        React.createElement("span",{className:"sb-pal-hex"},(s.c||"").toUpperCase())))));
}

function PresetCard({ preset, sceneList, count }){
  return React.createElement("div",{className:"sb-card"},
    React.createElement("div",{className:"sb-card-head"},
      React.createElement("div",{className:"sb-card-title"},
        React.createElement("span",{className:"sb-card-dot",style:{background:(preset.palette||[])[0]||"#888"}}),
        preset.name),
      React.createElement("span",{className:"sb-card-count"+(count?"":" zero")},
        count? (count+" scene"+(count!==1?"s":"")) : "unused")),
    // before -> after on the abstract reference still (CSS grade preview, no real frames)
    React.createElement("div",{className:"sb-beforeafter"},
      React.createElement(StyleStill,{label:"Ungraded"}),
      React.createElement("div",{className:"sb-arrow"},React.createElement(Icon.send?Icon.send:Icon.sparkles,{s:16})),
      React.createElement(StyleStill,{preset,label:preset.name})),
    React.createElement(PaletteBar,{preset}),
    // under the hood — raw values
    React.createElement("div",{className:"sb-meta"},
      React.createElement(SbMetaRow,{k:"Grade",v:preset.grade}),
      React.createElement(SbMetaRow,{k:"Lighting",v:preset.lighting}),
      React.createElement(SbMetaRow,{k:"Lens",v:preset.lens}),
      React.createElement(SbMetaRow,{k:"Texture",v:preset.texture})),
    // where applied
    sceneList && sceneList.length>0 && React.createElement("div",{className:"sb-scenes"},
      React.createElement("span",{className:"sb-scenes-lab"},"Applied to"),
      sceneList.map(s=>React.createElement("span",{key:s.id,className:"sb-scene-chip",title:s.title||("Scene "+s.no)},
        String(s.no).padStart(2,"0")))));
}
function SbMetaRow({ k, v }){
  if(!v) return null;
  return React.createElement("div",{className:"sb-meta-row"},
    React.createElement("span",{className:"sb-meta-k"},k),
    React.createElement("span",{className:"sb-meta-v"},v));
}

/* a strip of every scene in story order, each cell tinted by its assigned preset,
   plus a LEGEND naming each preset and the scenes it covers \u2014 the at-a-glance answer
   to "which preset is set where". Cells use the preset's full 60/30/10 palette as a
   gradient (its dominant alone is often near-black, so cells would look identical). */
function StyleFilmStrip({ scenes, project, presets, onSetScenePreset }){
  const { sceneStyles } = styleBibleOf(project);
  const sorted = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const presetOf = (pid)=> presets.find(x=>x.id===pid) || null;
  const swatchOf = (p)=>{ const pal=(p&&p.palette)||[]; return pal.length>=3
    ? `linear-gradient(135deg, ${pal[0]} 0%, ${pal[1]} 55%, ${pal[2]} 100%)` : (pal[0]||null); };
  const nameOf = (pid)=>{ const p=presetOf(pid); return p?p.name:"Unassigned"; };
  const pad = (no)=> String(no).padStart(2,"0");
  const unassigned = sorted.filter(s=>!sceneStyles[s.id]).length;
  // presets actually in use, each with the scenes it covers \u2014 this IS the colour key
  const used = presets.map(p=>({ p, scs: sorted.filter(s=>sceneStyles[s.id]===p.id) })).filter(x=>x.scs.length);
  // manual per-scene override: click a cell to open a preset picker
  const editable = typeof onSetScenePreset==="function";
  const [pick, setPick] = React.useState(null);  // sceneId of the open picker
  React.useEffect(()=>{ if(!pick) return;
    const close = (e)=>{ if(!e.target.closest || !e.target.closest(".sb-pick")) setPick(null); };
    document.addEventListener("mousedown", close); return ()=>document.removeEventListener("mousedown", close); },[pick]);
  const choose = (sid, pid)=>{ onSetScenePreset(sid, pid); setPick(null); };
  return React.createElement("div",{className:"sb-strip-wrap"},
    React.createElement("div",{className:"sb-strip-head"},
      React.createElement("span",{className:"sb-strip-title"},"Across the film",
        React.createElement("span",{className:"sb-strip-count"},
          " · "+presets.length+" preset"+(presets.length!==1?"s":"")+" · "+(sorted.length-unassigned)+" of "+sorted.length+" scenes styled"),
        editable && React.createElement("span",{className:"sb-strip-hint"}," — click a scene to set its style")),
      unassigned>0 && React.createElement("span",{className:"sb-strip-warn"},
        React.createElement(Icon.alert,{s:12}), unassigned+" scene"+(unassigned!==1?"s":"")+" with no style yet")),
    React.createElement("div",{className:"sb-strip"},
      sorted.map((s,idx)=>{
        const pid = sceneStyles[s.id]; const bg = swatchOf(presetOf(pid));
        const open = pick===s.id; const alignRight = idx > sorted.length/2;
        return React.createElement("div",{key:s.id,
          className:"sb-strip-cell"+(bg?"":" none")+(editable?" editable":"")+(open?" picking":""),
          style:bg?{background:bg}:undefined,
          onClick: editable ? ()=>setPick(open?null:s.id) : undefined,
          title:"Scene "+pad(s.no)+" \u00b7 "+(s.title||"")+"  \u2014  "+nameOf(pid)+(editable?"   \u00b7   click to change":"")},
          React.createElement("span",{className:"sb-strip-no"},pad(s.no)),
          open && React.createElement("div",{className:"sb-pick"+(alignRight?" right":""),onClick:(e)=>e.stopPropagation()},
            React.createElement("div",{className:"sb-pick-h"},"Scene "+pad(s.no)+(s.title?" \u00b7 "+s.title:"")),
            presets.map(p=>React.createElement("button",{key:p.id,className:"sb-pick-item"+(p.id===pid?" on":""),onClick:()=>choose(s.id,p.id)},
              React.createElement("span",{className:"sb-pick-sw",style:{background:swatchOf(p)||"#555"}}),
              React.createElement("span",{className:"sb-pick-nm"},p.name),
              p.id===pid && React.createElement(Icon.check,{s:13}))),
            React.createElement("button",{className:"sb-pick-item"+(!pid?" on":""),onClick:()=>choose(s.id,null)},
              React.createElement("span",{className:"sb-pick-sw none"}),
              React.createElement("span",{className:"sb-pick-nm"},"Unassigned"),
              !pid && React.createElement(Icon.check,{s:13}))));
      })),
    used.length>0 && React.createElement("div",{className:"sb-strip-legend"},
      used.map(({p,scs})=>
        React.createElement("div",{key:p.id,className:"sb-legend-item",
          title:p.name+" \u2014 scenes "+scs.map(s=>pad(s.no)).join(", ")},
          React.createElement("span",{className:"sb-legend-sw",style:{background:swatchOf(p)||"#555"}}),
          React.createElement("span",{className:"sb-legend-nm"},p.name),
          React.createElement("span",{className:"sb-legend-ct"},scs.length)))));
}

function StyleBibleModal({ project, scenes, onClose, onAssign, assigning }){
  const { presets, sceneStyles } = styleBibleOf(project);
  const scenesFor = (pid)=> (scenes||[]).filter(s=>sceneStyles[s.id]===pid).sort((a,b)=>(a.no||0)-(b.no||0));
  const assignedCount = (scenes||[]).filter(s=>sceneStyles[s.id]).length;
  return React.createElement("div",{className:"lb-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"sb-panel"},
      React.createElement("div",{className:"sb-panel-head"},
        React.createElement("div",null,
          React.createElement("div",{className:"sb-panel-title"},"Style Bible"),
          React.createElement("div",{className:"sb-panel-sub"},
            presets.length+" preset"+(presets.length!==1?"s":"")+" \u00b7 "+assignedCount+" of "+(scenes||[]).length+" scenes assigned",
            " \u00b7 stills are CSS colour-grade previews, not AI renders")),
        React.createElement("div",{style:{display:"flex",gap:8,alignItems:"center"}},
          onAssign && React.createElement("button",{className:"art-draftall",disabled:assigning,onClick:onAssign,
            title:"Design a bespoke palette for this film, then color-script each scene along the value-charge spine (replaces the current looks)"},
            React.createElement(Icon.layers,{s:14}), assigning?"Assigning\u2026":"Assign from script"),
          React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17})))),
      React.createElement("div",{className:"sb-panel-body"},
        React.createElement(StyleFilmStrip,{scenes,project,presets}),
        React.createElement("div",{className:"sb-grid"},
          presets.map(p=>React.createElement(PresetCard,{key:p.id,preset:p,sceneList:scenesFor(p.id),count:scenesFor(p.id).length}))))));
}
window.StyleBibleModal = StyleBibleModal;

/* Sample a small palette from an uploaded image, entirely client-side. The model is
   text-only, so we can't send it the image — instead we feed the sampled COLOURS into
   the design prompt. Returns { id, thumb (small JPEG dataURL), colors:[hex] }. */
function extractImageRef(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onerror=()=>reject(new Error("read failed"));
    fr.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("decode failed"));
      img.onload=()=>{
        try{
          const W=img.width||1, H=img.height||1;
          const hex=(r,g,b)=>"#"+[r,g,b].map(x=>Math.max(0,Math.min(255,x|0)).toString(16).padStart(2,"0")).join("");
          // small thumbnail
          const ts=Math.min(1,72/Math.max(W,H)), tc=document.createElement("canvas");
          tc.width=Math.max(1,Math.round(W*ts)); tc.height=Math.max(1,Math.round(H*ts));
          tc.getContext("2d").drawImage(img,0,0,tc.width,tc.height);
          const thumb=tc.toDataURL("image/jpeg",0.6);
          // palette from a ~40px sample, quantised by frequency
          const ss=Math.min(1,40/Math.max(W,H)), sc=document.createElement("canvas");
          sc.width=Math.max(1,Math.round(W*ss)); sc.height=Math.max(1,Math.round(H*ss));
          const cx=sc.getContext("2d"); cx.drawImage(img,0,0,sc.width,sc.height);
          const d=cx.getImageData(0,0,sc.width,sc.height).data, q=v=>Math.round(v/24)*24, buckets={};
          for(let i=0;i<d.length;i+=4){ if(d[i+3]<125) continue;
            const k=q(d[i])+","+q(d[i+1])+","+q(d[i+2]); buckets[k]=(buckets[k]||0)+1; }
          const colors=Object.keys(buckets).sort((a,b)=>buckets[b]-buckets[a]).slice(0,6)
            .map(k=>{ const p=k.split(",").map(Number); return hex(p[0],p[1],p[2]); });
          resolve({ id:"ri_"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36), thumb, colors });
        }catch(err){ reject(err); }
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* the uploaded reference-image thumbnails: each shows its sampled swatches + a remove ×.
   (The upload trigger lives in the reference bar itself — see StyleRefsField.) */
function StyleRefImages({ refImages, onRemoveRefImage }){
  const imgs = refImages||[];
  if(!imgs.length) return null;
  return React.createElement("div",{className:"sb-refimgs"},
    imgs.map(ri=>React.createElement("div",{key:ri.id,className:"sb-refimg",title:"Reference still — sampled palette"},
      React.createElement("img",{src:ri.thumb,alt:"reference still"}),
      React.createElement("div",{className:"sb-refimg-sw"},
        (ri.colors||[]).slice(0,5).map((c,i)=>React.createElement("span",{key:i,style:{background:c}}))),
      onRemoveRefImage && React.createElement("button",{className:"sb-refimg-x",title:"Remove",
        onClick:()=>onRemoveRefImage(ri.id)},React.createElement(Icon.x,{s:11})))));
}

/* Reference-driven look-dev: a free-text field where the user names films,
   photographers or paintings whose look they want. 'Assign from script' then
   translates that cinematography into this film's bespoke palette. Local state so
   typing is smooth; commits on blur / Enter. */
function StyleRefsField({ value, onCommit, onAssign, assigning, assignDisabled, refImages, onAddRefImages, onRemoveRefImage }){
  const [v, setV] = React.useState(value||"");
  const [saved, setSaved] = React.useState(false);
  const tRef = React.useRef(null);
  React.useEffect(()=>{ setV(value||""); },[value]);
  React.useEffect(()=>()=>{ if(tRef.current) clearTimeout(tRef.current); },[]);
  const commit = ()=>{ const t=(v||"").trim(); if(t!==((value||"").trim())) onCommit && onCommit(t);
    setSaved(true); if(tRef.current) clearTimeout(tRef.current); tRef.current = setTimeout(()=>setSaved(false), 2400); };
  const imgs = refImages||[];
  const fileRef = React.useRef(null);
  const onFiles = async (e)=>{
    const files=[...((e.target&&e.target.files)||[])]; if(e.target) e.target.value="";
    if(!files.length || !onAddRefImages) return;
    const room=Math.max(0, 8-imgs.length), out=[];
    for(const f of files.slice(0,room)){ try{ out.push(await extractImageRef(f)); }catch(err){} }
    if(out.length) onAddRefImages(out);
  };
  return React.createElement("div",{style:{margin:"0 0 16px"}},
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,fontFamily:"var(--f-mono)",fontSize:11,
      letterSpacing:".06em",textTransform:"uppercase",color:"var(--txt-3)",marginBottom:6}},
      React.createElement(Icon.sparkles,{s:12}),"Visual references — optional look targets",
      React.createElement(InfoTip,{label:"About visual references",
        text:"Auto-filled from your Lookbook (and re-synced when it changes) until you edit it — then your version wins. Add films, photographers or paintings you love, then Save and click “Light the film” above — the Colorist translates their cinematography (palette, light, lens, texture) into this film's looks."})),
    React.createElement("div",{className:"sb-refbar"},
      React.createElement("textarea",{value:v,rows:3,
        placeholder:"Auto-filled from your Lookbook as you research the look — or write your own (films, photographers, paintings: e.g. Her, Blade Runner 2049, Gregory Crewdson)",
        onChange:e=>{ setV(e.target.value); if(saved) setSaved(false); }, onBlur:commit,
        onKeyDown:e=>{ if(e.key==="Enter" && (e.metaKey||e.ctrlKey)){ e.preventDefault(); commit(); e.target.blur(); } }}),
      onAddRefImages && React.createElement("button",{className:"sb-refbar-btn",disabled:imgs.length>=8,
        onClick:()=>fileRef.current&&fileRef.current.click(),
        title:imgs.length>=8?"Up to 8 reference images":"Add reference image(s) — TURN samples their palette to steer the film's grade"},
        React.createElement(Icon.image,{s:14}), "Image"),
      React.createElement("button",{className:"sb-refbar-btn secondary"+(saved?" on":""),onClick:commit,
        title:"Save these references — they steer the palette when you run 'Light the film'"},
        saved && React.createElement(Icon.check,{s:14}), saved?"Saved":"Save")),
    React.createElement("input",{type:"file",accept:"image/*",multiple:true,ref:fileRef,style:{display:"none"},onChange:onFiles}),
    imgs.length>0 && React.createElement(StyleRefImages,{refImages,onRemoveRefImage}),
    saved && React.createElement("div",{style:{fontSize:11.5,color:"var(--pos)",marginTop:6,lineHeight:1.5}},
      "Saved — now click “Light the film” above to design the palette from these references."));
}

/* InfoTip — a small "i" icon that reveals help text on hover (desktop) or tap
   (touch). Keeps long explainers out of the header without losing them. */
function InfoTip({ text, label }){
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(()=>{ if(!open) return;
    const close=(e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close); return ()=>document.removeEventListener("mousedown", close); },[open]);
  const show = open || hover;
  return React.createElement("span",{className:"infotip",ref:ref,
    onMouseEnter:()=>setHover(true), onMouseLeave:()=>setHover(false)},
    React.createElement("button",{type:"button",className:"infotip-btn"+(show?" on":""),
      "aria-label":label||"More information","aria-expanded":show?"true":"false",
      onClick:(e)=>{ e.stopPropagation(); setOpen(o=>!o); }},
      React.createElement(Icon.info,{s:13})),
    show && React.createElement("span",{className:"infotip-pop",role:"tooltip"},text));
}
window.InfoTip = InfoTip;

/* StyleBibleView — the Style Bible as a full Art Room TAB (not a modal). Reuses the
   film-strip + preset cards. "Assign from script" writes the scene→preset map
   (scene-level, the source of truth); characters / locations / shots merely READ it. */
function StyleBibleView({ project, scenes, onAssign, assigning, onSetRefs, onSetScenePreset, onAddRefImages, onRemoveRefImage, onColorist, lookbookStale, onApplyLookbook }){
  const { presets, sceneStyles, refs, refImages } = styleBibleOf(project);
  const scenesFor = (pid)=> (scenes||[]).filter(s=>sceneStyles[s.id]===pid).sort((a,b)=>(a.no||0)-(b.no||0));
  const assignedCount = (scenes||[]).filter(s=>sceneStyles[s.id]).length;
  return React.createElement("div",{className:"art-scroll"},
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},
            "Cinematographer (Colorist)",
            React.createElement(InfoTip,{label:"About the Style Bible",
              text:"Your film's own cinematic look system \u2014 each a 60/30/10 colour grade with its own lighting, lens and texture. Click 'Light the film' and the Cinematographer / Colorist designs a BESPOKE palette + film stock for this film (from the story and your visual references), color-scripts every scene along the value-charge spine \u2014 so the look tracks the emotional arc \u2014 and PROPOSES it for your approval, showing the swatches and a per-scene 'why'. Styles are assigned per SCENE; characters, locations and shots read the assigned look so every frame stays on-palette. You can still fine-tune any scene by clicking it in the film-strip. The stills below are live CSS grade previews, not AI renders."}))),
        onColorist && React.createElement("div",{className:"art-intro-actions"},
          React.createElement("button",{className:"art-draftall",disabled:!(scenes||[]).length,onClick:onColorist,
            title:"Cinematographer / Colorist \u2014 designs your colour system and color-scripts every scene, with a rationale, for your approval"},
            React.createElement(Icon.palette,{s:14}),"Light the film")))),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,label:"this palette",dept:"colorist"}),
    onSetRefs && React.createElement(StyleRefsField,{value:refs,onCommit:onSetRefs,onAssign,assigning,assignDisabled:assigning||!(scenes||[]).length,
      refImages,onAddRefImages,onRemoveRefImage}),
    React.createElement(StyleFilmStrip,{scenes,project,presets,onSetScenePreset}),
    React.createElement("div",{className:"sb-grid",style:{marginTop:16}},
      presets.map(p=>React.createElement(PresetCard,{key:p.id,preset:p,sceneList:scenesFor(p.id),count:scenesFor(p.id).length}))));
}
window.StyleBibleView = StyleBibleView;
