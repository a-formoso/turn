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
    // before -> after
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

/* a strip of every scene in story order, each cell tinted by its assigned preset */
function StyleFilmStrip({ scenes, project, presets }){
  const { sceneStyles } = styleBibleOf(project);
  const sorted = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const colorOf = (pid)=>{ const p=presets.find(x=>x.id===pid); return p?((p.palette||[])[0]||"#555"):null; };
  const nameOf = (pid)=>{ const p=presets.find(x=>x.id===pid); return p?p.name:"Unassigned"; };
  const unassigned = sorted.filter(s=>!sceneStyles[s.id]).length;
  return React.createElement("div",{className:"sb-strip-wrap"},
    React.createElement("div",{className:"sb-strip-head"},
      React.createElement("span",{className:"sb-strip-title"},"Across the film"),
      unassigned>0 && React.createElement("span",{className:"sb-strip-warn"},
        React.createElement(Icon.alert,{s:12}), unassigned+" scene"+(unassigned!==1?"s":"")+" with no style yet")),
    React.createElement("div",{className:"sb-strip"},
      sorted.map(s=>{
        const pid = sceneStyles[s.id];
        const c = colorOf(pid);
        return React.createElement("div",{key:s.id,className:"sb-strip-cell"+(c?"":" none"),
          style:c?{background:c}:undefined, title:"Scene "+String(s.no).padStart(2,"0")+" \u00b7 "+(s.title||"")+"  \u2014  "+nameOf(pid)},
          React.createElement("span",{className:"sb-strip-no"},String(s.no).padStart(2,"0")));
      })));
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
            title:"Read the whole film and (re)assign each scene a preset"},
            React.createElement(Icon.layers,{s:14}), assigning?"Assigning\u2026":"Assign from script"),
          React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17})))),
      React.createElement("div",{className:"sb-panel-body"},
        React.createElement(StyleFilmStrip,{scenes,project,presets}),
        React.createElement("div",{className:"sb-grid"},
          presets.map(p=>React.createElement(PresetCard,{key:p.id,preset:p,sceneList:scenesFor(p.id),count:scenesFor(p.id).length}))))));
}
window.StyleBibleModal = StyleBibleModal;

/* StyleBibleView — the Style Bible as a full Art Room TAB (not a modal). Reuses the
   film-strip + preset cards. "Assign from script" writes the scene→preset map
   (scene-level, the source of truth); characters / locations / shots merely READ it. */
function StyleBibleView({ project, scenes, onAssign, assigning }){
  const { presets, sceneStyles } = styleBibleOf(project);
  const scenesFor = (pid)=> (scenes||[]).filter(s=>sceneStyles[s.id]===pid).sort((a,b)=>(a.no||0)-(b.no||0));
  const assignedCount = (scenes||[]).filter(s=>sceneStyles[s.id]).length;
  return React.createElement("div",{className:"art-scroll"},
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t"},"Style Bible"),
          React.createElement("div",{className:"art-intro-d"},
            "Your film's reusable cinematic looks \u2014 each a 60/30/10 colour grade with its own lighting, lens and texture. ",
            "Styles are assigned per SCENE; characters, locations and shots read the assigned look so every frame stays on-palette. ",
            "The stills below are live CSS grade previews, not AI renders.")),
        React.createElement("div",{className:"art-intro-actions"},
          onAssign && React.createElement("button",{className:"art-draftall",disabled:assigning||!(scenes||[]).length,onClick:onAssign,
            title:"Read the whole film and (re)assign each scene a preset"},
            React.createElement(Icon.layers,{s:14}), assigning?"Assigning\u2026":"Assign from script")))),
    React.createElement("div",{style:{fontFamily:"var(--f-mono)",fontSize:11,letterSpacing:".03em",color:"var(--txt-3)",margin:"2px 0 14px"}},
      presets.length+" preset"+(presets.length!==1?"s":"")+" \u00b7 "+assignedCount+" of "+(scenes||[]).length+" scenes assigned"),
    React.createElement(StyleFilmStrip,{scenes,project,presets}),
    React.createElement("div",{className:"sb-grid",style:{marginTop:16}},
      presets.map(p=>React.createElement(PresetCard,{key:p.id,preset:p,sceneList:scenesFor(p.id),count:scenesFor(p.id).length}))));
}
window.StyleBibleView = StyleBibleView;
