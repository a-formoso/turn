/* stage.jsx — The Stage (Production), Step 10.

   The SEEDANCE 2.0 DIRECTOR CONSOLE. The unit of work is the CLIP (one
   sceneSequences group, the <=15s render unit) = exactly one Seedance generation.
   Each clip's START FRAME (its first shot's rendered frame) + a composed multi-beat
   prompt + the locked-voice line audio + derived reference sheets are assembled into
   a multimodal Seedance job (see app/videogen.jsx seedanceGenerate / useSeedanceGen,
   bytedance/seedance-2.0 via the fal.ai proxy). Generation is deploy-gated exactly
   like voice — without the proxy route + FAL_KEY it shows a friendly message.

   Layout: a left STORY-SPINE rail (acts → scenes → clips), a CENTER (player +
   shot-take filmstrip + prompt box + input assets) and a RIGHT Seedance panel
   (capability card + mode selector + assets summary + controls + Generate). Reuses
   the same window helpers as the Shot List / Storyboard so the partition matches. */

const _stEl = React.createElement;

function _pad2(n){ return String(n||0).padStart(2,"0"); }
function _clipLetter(i){ return (i<26) ? String.fromCharCode(65+i) : String(i+1); }
function _uniq(a){ const o=[], s=new Set(); (a||[]).forEach(x=>{ if(x && !s.has(x)){ s.add(x); o.push(x); } }); return o; }
function _clipDur(g){ return Math.max(4, Math.min(15, Math.round(g.dur||5))); }
function _firstWords(t, n){ const w=String(t||"").trim().split(/\s+/).filter(Boolean); return w.slice(0,n).join(" ")+(w.length>n?"…":""); }

/* ---------- derive everything a clip needs from existing pre-production --------- */
function buildClipData(scene, g, ctx){
  const shots = g.shots||[];
  const first = shots[0]||{};
  // in-frame cast (union across the clip's shots), de-duped, names + ids
  const castIds = [];
  shots.forEach(sh=>{ const inc=(typeof inFrameCast==="function")?inFrameCast(sh, scene, ctx.characters||[]):(sh.subjects||[]);
    inc.forEach(id=>{ if(castIds.indexOf(id)<0) castIds.push(id); }); });
  const cast = castIds.map(id=>({ id, name:(ctx.charById[id]||{}).name||"" })).filter(c=>c.name);
  // in-frame props (union)
  const propIds = [];
  shots.forEach(sh=>{ const inc=(typeof inFrameProps==="function")?inFrameProps(sh, scene, ctx.props||[]):[];
    (inc||[]).forEach(id=>{ if(propIds.indexOf(id)<0) propIds.push(id); }); });
  const clipProps = propIds.map(id=>({ id, name:(ctx.propById[id]||{}).name||"" })).filter(p=>p.name);
  const loc = (typeof locationForScene==="function") ? locationForScene(ctx.locations, scene.id) : null;
  const preset = (typeof scenePreset==="function") ? scenePreset(ctx.project, scene.id) : null;
  // camera arc: first -> last distinct move label
  const moves = _uniq(shots.map(sh=> (typeof shotMoveOf==="function") ? shotMoveOf(sh.move).label : (sh.move||"")).filter(Boolean));
  const camera = moves.length ? moves.join(" → ") : "Static";
  const lighting = (preset && (preset.lighting||preset.grade)) || "Naturalistic, motivated light";
  const lead = cast[0] ? cast[0].name : "the subject";
  // composed director prompt (prose, multi-beat) — readable, not the image-gen JSON
  const actions = _uniq(shots.map(sh=>String(sh.action||"").trim()).filter(Boolean));
  const body = actions.join(" ");
  const setting = loc ? (loc.name) : (scene.loc||"");
  const styleClause = preset ? (preset.name+" — "+preset.grade+".") : "";
  const camClause = "Camera: "+camera.toLowerCase()+".";
  const prompt = [ body, camClause, styleClause ].filter(Boolean).join(" ");
  // tag chips
  const chips = [
    cast.length && { k:"subject", v:cast.map(c=>c.name).join(", ") },
    actions.length && { k:"action", v:_firstWords(actions[0], 4) },
    setting && { k:"setting", v:setting },
    { k:"camera", v:camera.toLowerCase() },
    preset && { k:"style", v:preset.name.toLowerCase() },
    preset && { k:"mood", v:_firstWords(preset.grade, 4).toLowerCase() },
  ].filter(Boolean);
  return { shots, first, cast, props:clipProps, loc, preset, camera, lighting, lead, prompt, chips, setting,
    dur:_clipDur(g), lineShots: shots.filter(sh=>String(sh.dialogue||"").trim()) };
}

/* ============================ the per-clip console ============================== */
function ClipConsole({ clip, ctx, imgs, auds, beatsMap, prevClipVideoId }){
  const scene = clip.scene, g = clip.g, d = clip.data;
  const gen = useSeedanceGen(clip.id);
  const startFrame = imgs[(d.first||{}).id] || "";
  const prevVideo = prevClipVideoId ? ((typeof vidGetVideo==="function") ? vidGetVideo(prevClipVideoId) : "") : "";
  // the clip's shots ARE its takes — each shot covers a beat. Click one to preview its frame.
  const beatRows = ((beatsMap||{})[scene.id]||{}).rows || [];
  const shotBeat = (sh)=>{ const r=beatRows.find(x=>x.n===sh.beatN); return (r && r.drive && r.drive.a) || ("Beat "+(sh.beatN||"—")); };
  const [previewId, setPreviewId] = React.useState((d.first||{}).id || null);
  const previewFrame = imgs[previewId] || startFrame;

  // ---- the derived INPUT ASSETS (tagged, toggleable), capped to Seedance's 12 ----
  const assets = React.useMemo(()=>{
    const out = [];
    out.push({ key:"text", kind:"text", label:"Prompt", ready:true });
    if(startFrame) out.push({ key:"frame", kind:"image", label:(d.cast[0]?d.cast[0].name+" — start frame":"Start frame"), url:startFrame, ready:true, locked:true });
    d.cast.forEach(c=>{ const u=imgs[c.id]; out.push({ key:"c:"+c.id, kind:"image", label:c.name+" reference", url:u, ready:!!u, id:c.id }); });
    if(d.loc){ const u=imgs[d.loc.id]; out.push({ key:"loc", kind:"image", label:(d.loc.name||"Location")+" plate", url:u, ready:!!u, id:d.loc.id }); }
    d.props.forEach(p=>{ const u=imgs[p.id]; if(u) out.push({ key:"p:"+p.id, kind:"image", label:p.name, url:u, ready:true, id:p.id }); });
    if(prevVideo) out.push({ key:"prev", kind:"video", label:"Previous clip (continuity)", url:prevVideo, ready:true });
    d.lineShots.forEach((sh,i)=>{ const u=auds[sh.id]; if(u) out.push({ key:"a:"+sh.id, kind:"audio", label:(d.cast[0]?d.cast[0].name+" line":"Line audio")+(d.lineShots.length>1?(" "+(i+1)):""), url:u, ready:true, shotId:sh.id }); });
    return out;
  }, [clip.id, startFrame, prevVideo, JSON.stringify(d.cast), JSON.stringify(d.props), Object.keys(imgs).length, Object.keys(auds).length]);

  // assets default ON when ready; user can toggle (off set). tag numbers per kind.
  const [off, setOff] = React.useState(()=>new Set());
  const tagged = React.useMemo(()=>{ const n={text:0,image:0,video:0,audio:0};
    return assets.map(a=>{ n[a.kind]++; return { ...a, tag:"@"+a.kind+n[a.kind] }; }); }, [assets]);
  const on = (a)=> a.ready && !off.has(a.key);
  const toggle = (a)=>{ if(a.locked||!a.ready) return; setOff(s=>{ const n=new Set(s); n.has(a.key)?n.delete(a.key):n.add(a.key); return n; }); };
  const onImages = tagged.filter(a=>a.kind==="image" && on(a));
  const onVideos = tagged.filter(a=>a.kind==="video" && on(a));
  const onAudios = tagged.filter(a=>a.kind==="audio" && on(a));
  const counts = { text:1, images:onImages.length, videos:onVideos.length, audio:onAudios.length };

  // ---- console controls (the original right-panel design) ----
  const [camera, setCamera] = React.useState(d.camera);
  const [lighting, setLighting] = React.useState(d.lighting);
  const [perf, setPerf] = React.useState(d.lead);
  const [audioMode, setAudioMode] = React.useState(onAudios.length ? "voice" : "native");
  const [quality, setQuality] = React.useState("standard");
  const [duration, setDuration] = React.useState(d.dur);
  const [prompt, setPrompt] = React.useState(d.prompt);
  const [modeOverride, setModeOverride] = React.useState(null);
  // mode auto-inferred from which asset kinds are on (overridable in the selector)
  const autoMode = (()=>{ const hasI=onImages.length>0, hasV=onVideos.length>0, hasA=onAudios.length>0;
    if(hasV && (hasI||hasA)) return "multimodal";
    if(hasA && hasI) return "multimodal";
    if(hasV) return "v2v";
    if(hasI) return "i2v";
    return "t2v"; })();
  const mode = modeOverride || autoMode;
  const MODES = [["t2v","Text to Video"],["i2v","Image to Video"],["v2v","Video to Video"],["multimodal","Multimodal"]];

  const onGenerate = async ()=>{
    const frameUrl = startFrame || (onImages[0]&&onImages[0].url) || "";
    const imageUrls = onImages.map(a=>a.url).filter(u=>u && u!==frameUrl);
    const videoUrls = onVideos.map(a=>a.url).filter(Boolean);
    const audioUrls = (audioMode==="voice") ? onAudios.map(a=>a.url).filter(Boolean) : [];
    const controls = "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+".";
    try{
      await gen.generate({ frameUrl, imageUrls, videoUrls, audioUrls, prompt, controls,
        durationMs:duration*1000, fast:quality==="turbo", force:true });
      if(typeof window.appToast==="function") window.appToast("Clip "+clip.label+" rendered","ok");
    }catch(e){ if(typeof window.appToast==="function") window.appToast(String((e&&e.message)||e),"err"); }
  };
  const onExtend = async ()=>{
    if(!gen.videoUrl) return;
    const controls = "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+".";
    try{
      await gen.generate({ frameUrl:startFrame, videoUrls:[gen.videoUrl], prompt, controls,
        durationMs:duration*1000, fast:quality==="turbo", force:true });
    }catch(e){ if(typeof window.appToast==="function") window.appToast(String((e&&e.message)||e),"err"); }
  };
  const gening = gen.gening;
  const PROMPT_MAX = 3000;

  // ----- CENTER: player + filmstrip + prompt + input assets -----
  const center = _stEl("div",{className:"stage2-center"},
    _stEl("div",{className:"stage2-clip-head"},
      _stEl("div",{className:"stage2-clip-slug"}, clip.label+"  ",
        _stEl("span",{className:"stage2-clip-loc"}, scene.loc),
        _stEl("span",{className:"stage2-clip-name"}, " · "+(d.first.action?_firstWords(d.first.action,3):(scene.title||"")))),
      _stEl("span",{className:"stage2-ver"}, gen.videoUrl?"Rendered":"Not rendered")),
    // player
    _stEl("div",{className:"stage2-player"},
      gen.videoUrl
        ? _stEl("video",{src:gen.videoUrl,poster:startFrame||undefined,controls:true,playsInline:true})
        : _stEl("div",{className:"stage2-player-poster"},
            previewFrame ? _stEl("img",{src:previewFrame,alt:""}) : _stEl("div",{className:"stage2-noframe"}, Icon.image&&_stEl(Icon.image,{s:24}),"No frame yet — generate these shots in the Shot List"),
            _stEl("div",{className:"stage2-player-badge"}, gening ? (gen.status||"Rendering…") : (previewFrame?"Shot frame · not rendered yet":"")))),
    !gen.videoUrl && _stEl("div",{className:"stage2-ruler"},
      _stEl("div",{className:"stage2-ruler-fill",style:{width:"22%"}}),
      _stEl("span",{className:"stage2-ruler-dur"}, "0:00 / 0:"+_pad2(duration))),
    // filmstrip — the SHOTS (takes) that make up THIS clip; each covers a beat. Click to preview.
    _stEl("div",{className:"stage2-strip-cap"}, "Shots in "+clip.label+" — "+(d.shots||[]).length+" take"+((d.shots||[]).length!==1?"s":"")),
    _stEl("div",{className:"stage2-strip"},
      (d.shots||[]).map(function(sh,i){ const u=imgs[sh.id]; const sd=(typeof shotDur==="function")?shotDur(sh):5;
        return _stEl("button",{key:sh.id,className:"stage2-strip-cell"+(sh.id===previewId?" on":""),onClick:()=>setPreviewId(sh.id),
          title:shotBeat(sh)+((typeof shotGrammarLabel==="function")?(" — "+shotGrammarLabel(sh)):"")},
          _stEl("div",{className:"stage2-strip-thumb"},
            u ? _stEl("img",{src:u,alt:"",loading:"lazy"}) : _stEl("div",{className:"stage2-strip-blank"}),
            _stEl("span",{className:"stage2-strip-no"}, (i+1))),
          _stEl("div",{className:"stage2-strip-meta"},
            _stEl("span",{className:"stage2-strip-lab"}, shotBeat(sh)),
            _stEl("span",{className:"stage2-strip-dur"}, sd+"s"))); })),
    // prompt box
    _stEl("div",{className:"sd-prompt"},
      _stEl("textarea",{className:"sd-prompt-ta",value:prompt,placeholder:"Describe your scene in detail…",
        maxLength:PROMPT_MAX,rows:3,spellCheck:false,onChange:e=>setPrompt(e.target.value)}),
      _stEl("div",{className:"sd-prompt-foot"},
        _stEl("button",{className:"sd-prompt-helper",onClick:()=>setPrompt(d.prompt),title:"Rebuild the prompt from this clip's beats"},
          Icon.wand&&_stEl(Icon.wand,{s:13}), "Prompt helper"),
        _stEl("span",{className:"sd-prompt-count"}, prompt.length+" / "+PROMPT_MAX))),
    // input assets (references)
    _stEl("div",{className:"stage2-assets"},
      _stEl("div",{className:"stage2-assets-lab"}, "INPUT ASSETS ("+tagged.filter(on).length+")"),
      _stEl("div",{className:"stage2-assets-row"},
        tagged.map(a=> _stEl("button",{key:a.key,
          className:"stage2-asset "+a.kind+(on(a)?" on":"")+(a.ready?"":" missing")+(a.locked?" locked":""),
          title:a.ready?(on(a)?"Included — click to exclude":"Click to include")+" ("+a.tag+")":"Not generated yet",
          onClick:()=>toggle(a)},
          _stEl("div",{className:"stage2-asset-vis"},
            a.kind==="text" ? _stEl("span",{className:"stage2-asset-T"},"T")
            : a.kind==="audio" ? _stEl("span",{className:"stage2-asset-wave"}, Icon.mic&&_stEl(Icon.mic,{s:16}))
            : a.url ? _stEl("img",{src:a.url,alt:"",loading:"lazy"})
            : _stEl("span",{className:"stage2-asset-ph"}, "—"),
            on(a) && _stEl("span",{className:"stage2-asset-tick"}, Icon.check&&_stEl(Icon.check,{s:11})),
            a.kind==="video" && _stEl("span",{className:"stage2-asset-vid"}, Icon.play&&_stEl(Icon.play,{s:12}))),
          _stEl("div",{className:"stage2-asset-lab"}, a.label),
          _stEl("div",{className:"stage2-asset-tag"}, a.tag))),
        _stEl("div",{className:"stage2-asset add",title:"Assets derive from Characters, Props, Locations & voiced lines"},
          _stEl("div",{className:"stage2-asset-vis"}, Icon.plus&&_stEl(Icon.plus,{s:18})),
          _stEl("div",{className:"stage2-asset-lab"},"Derived")))));

  // ----- RIGHT: the original Seedance panel -----
  const CAPS = ["Multimodal video generation","Up to 12 assets combined","Typical clip length 4–15s",
    "Strong motion stability","Character consistency","Native audio","Director controls"];
  const right = _stEl("div",{className:"stage2-panel"},
    _stEl("div",{className:"stage2-panel-card"},
      _stEl("div",{className:"stage2-panel-head"},
        _stEl("span",{className:"stage2-panel-t"},"Seedance 2.0"),
        _stEl("span",{className:"stage2-panel-v"},"v2.0")),
      _stEl("div",{className:"stage2-caps"},
        CAPS.map((c,i)=> _stEl("div",{key:i,className:"stage2-cap"}, _stEl("span",{className:"stage2-cap-d"}), c)))),
    // mode selector
    _stEl("div",{className:"stage2-modes"},
      MODES.map(m=> _stEl("button",{key:m[0],className:"stage2-mode"+(mode===m[0]?" on":""),
        onClick:()=>setModeOverride(m[0])}, m[1]))),
    // assets summary
    _stEl("div",{className:"stage2-sec-lab"},"ASSETS SUMMARY"),
    _stEl("div",{className:"stage2-summary"},
      [["Text",counts.text],["Images",counts.images],["Videos",counts.videos],["Audio",counts.audio]].map((s,i)=>
        _stEl("div",{key:i,className:"stage2-sum"},
          _stEl("div",{className:"stage2-sum-k"},s[0]),
          _stEl("div",{className:"stage2-sum-n"}, s[1])))),
    // controls
    _stEl("div",{className:"stage2-sec-lab"},"CONTROLS"),
    _stEl("div",{className:"stage2-ctrls"},
      _ctrlRow("Camera movement", _stEl("input",{className:"stage2-inp",value:camera,onChange:e=>setCamera(e.target.value)})),
      _ctrlRow("Lighting", _stEl("input",{className:"stage2-inp",value:lighting,onChange:e=>setLighting(e.target.value)})),
      _ctrlRow("Performance", _stEl("input",{className:"stage2-inp",value:perf,onChange:e=>setPerf(e.target.value)})),
      _ctrlRow("Audio", _stEl("select",{className:"stage2-inp",value:audioMode,onChange:e=>setAudioMode(e.target.value)},
        _stEl("option",{value:"native"},"Generate native audio"),
        _stEl("option",{value:"voice",disabled:!onAudios.length},"Use locked voice line"))),
      _ctrlRow("Quality mode", _stEl("div",{className:"stage2-toggle"},
        _stEl("button",{className:"stage2-tg"+(quality==="standard"?" on":""),onClick:()=>setQuality("standard")},"Standard"),
        _stEl("button",{className:"stage2-tg"+(quality==="turbo"?" on":""),onClick:()=>setQuality("turbo")}, Icon.sparkles&&_stEl(Icon.sparkles,{s:12}),"Turbo"))),
      _ctrlRow("Clip duration", _stEl("select",{className:"stage2-inp",value:duration,onChange:e=>setDuration(Number(e.target.value))},
        [4,5,6,7,8,9,10,11,12,13,14,15].map(n=>_stEl("option",{key:n,value:n}, n+"s"))))),
    // generate
    gen.err && _stEl("div",{className:"stage2-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), gen.err),
    gening
      ? _stEl("div",{className:"stage2-gen-busy"},
          _stEl("div",{className:"stage2-gen-prog"}, _stEl("div",{className:"orb"}), (gen.status||"Rendering…")),
          _stEl("button",{className:"stage2-extend",onClick:gen.cancel},"Cancel render"))
      : _stEl(React.Fragment,null,
          _stEl("button",{className:"stage2-generate",onClick:onGenerate},
            Icon.sparkles&&_stEl(Icon.sparkles,{s:15}), gen.videoUrl?"Re-generate clip":"Generate clip"),
          _stEl("button",{className:"stage2-extend",onClick:onExtend,disabled:!gen.videoUrl},
            Icon.pencil&&_stEl(Icon.pencil,{s:13}),"Extend / edit")),
    _stEl("div",{className:"stage2-credit"}, Icon.sparkles&&_stEl(Icon.sparkles,{s:11}),"Uses 1 generation credit"));

  return _stEl("div",{className:"stage2-console"}, center, right);
}
function _ctrlRow(label, control){ return _stEl("div",{className:"stage2-ctrl"},
  _stEl("span",{className:"stage2-ctrl-l"}, label), control); }

/* ================================ the room shell =============================== */
const STAGE_ACT_TITLES = { 1:"Setup", 2:"Complication", 3:"Resolution" };
/* the beat name(s) a clip covers — its shots' beats' drive labels (e.g. "Holding the room") */
function clipBeatName(clip, beatsMap){
  const rows = ((beatsMap||{})[clip.scene.id]||{}).rows || [];
  const ns = _uniq((clip.g.shots||[]).map(sh=>sh.beatN).filter(Boolean));
  const names = ns.map(n=>{ const r=rows.find(x=>x.n===n); return r && r.drive && r.drive.a; }).filter(Boolean);
  if(!names.length) return _firstWords(clip.data.first.action||clip.scene.title, 3);
  return names[0] + (names.length>1 ? (" +"+(names.length-1)) : "");
}
function chargeColor(s){ const c=Number(s&&s.closeCharge)||0; return c>0?"var(--pos)":c<0?"var(--neg)":"var(--txt-3)"; }

function StageView({ project, scenes, shots, characters, locations, props, beatsMap }){
  const ordered = React.useMemo(()=> (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0)), [scenes]);
  const charById = React.useMemo(()=>{ const m={}; (characters||[]).forEach(c=>{ m[c.id]=c; }); return m; }, [characters]);
  const propById = React.useMemo(()=>{ const m={}; (props||[]).forEach(p=>{ m[p.id]=p; }); return m; }, [props]);
  const shotsByScene = React.useMemo(()=>{ const m={}; (shots||[]).forEach(s=>{ (m[s.sceneId]=m[s.sceneId]||[]).push(s); });
    Object.values(m).forEach(arr=>arr.sort((a,b)=>(a.order||0)-(b.order||0)||(a.beatN||0)-(b.beatN||0))); return m; }, [shots]);
  const scenesWithShots = ordered.filter(s=>(shotsByScene[s.id]||[]).length);
  const clipMax = (typeof clipMaxFor==="function") ? clipMaxFor(project) : (window.CLIP_MAX_SECONDS||15);
  const clipsByScene = React.useMemo(()=>{ const m={};
    scenesWithShots.forEach(s=>{ m[s.id]=(typeof sceneSequences==="function")?sceneSequences(shotsByScene[s.id]||[], clipMax):[]; });
    return m; }, [scenesWithShots, shotsByScene, clipMax]);

  const ctx = { characters, charById, props, propById, locations, project };

  // flatten clips with labels + derived data
  const allClips = React.useMemo(()=>{ const out=[];
    scenesWithShots.forEach(scene=>{ (clipsByScene[scene.id]||[]).forEach(g=>{
      out.push({ id:(typeof clipVidId==="function")?clipVidId(scene.id,g.index):("clip-"+scene.id+"-"+g.index),
        label:_pad2(scene.no)+_clipLetter(g.index), scene, g, data:buildClipData(scene, g, ctx) }); }); });
    return out; }, [scenesWithShots, clipsByScene, JSON.stringify((characters||[]).map(c=>c.id)), JSON.stringify((props||[]).map(p=>p.id)), JSON.stringify((locations||[]).map(l=>l.id))]);

  // load every needed image (shot frames + character / location / prop sheets) into one map
  const neededIds = React.useMemo(()=>{ const s=new Set();
    (shots||[]).forEach(sh=>s.add(sh.id)); (characters||[]).forEach(c=>s.add(c.id));
    (locations||[]).forEach(l=>s.add(l.id)); (props||[]).forEach(p=>s.add(p.id));
    return Array.from(s); }, [(shots||[]).length, (characters||[]).length, (locations||[]).length, (props||[]).length]);
  const [imgs, setImgs] = React.useState({});
  React.useEffect(()=>{ let alive=true;
    (async()=>{ const out={};
      for(const id of neededIds){ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
        if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } if(u) out[id]=u; }
      if(alive) setImgs(out); })();
    return ()=>{ alive=false; }; }, [neededIds.join(",")]);

  // load voiced line audio for shots that have it
  const [auds, setAuds] = React.useState({});
  React.useEffect(()=>{ let alive=true;
    (async()=>{ const out={};
      for(const sh of (shots||[])){ if(!String(sh.dialogue||"").trim()) continue;
        let u=(typeof vgGetAudio==="function")?vgGetAudio(sh.id):"";
        if(!u && typeof vgLoadAudio==="function"){ try{ u=await vgLoadAudio(sh.id); }catch(e){} } if(u) out[sh.id]=u; }
      if(alive) setAuds(out); })();
    return ()=>{ alive=false; }; }, [(shots||[]).map(s=>s.id+":"+(s.lineAudio?1:0)).join(",")]);

  const [selId, setSelId] = React.useState(allClips[0] ? allClips[0].id : null);
  const [actOpen, setActOpen] = React.useState({1:true,2:true,3:true});
  // refresh on new render so the strip "ready" dots + player update
  const [, force] = React.useReducer(x=>x+1, 0);
  React.useEffect(()=>{ const h=()=>force(); window.addEventListener("vid-done", h); return ()=>window.removeEventListener("vid-done", h); }, []);

  if(!scenesWithShots.length){
    return _stEl("div",{className:"stage2-root"},
      _stEl("div",{className:"prop-empty"},
        _stEl("div",{className:"art-soon-ic"}, Icon.clapper&&_stEl(Icon.clapper,{s:30})),
        _stEl("div",{className:"art-soon-t"},"Nothing to stage yet"),
        _stEl("div",{className:"art-soon-d"},"The Stage turns your shots into video clips. Break your scenes into shots in the Art Room → Shots first, then come back.")));
  }

  // the director console — one clip at a time
  const clip = allClips.find(c=>c.id===selId) || allClips[0];
  const clipIdx = allClips.findIndex(c=>c.id===clip.id);
  const prevClipVideoId = clipIdx>0 ? allClips[clipIdx-1].id : null;
  // left rail: the STORY SPINE — acts → scenes (charge dot) → clips (beat names),
  // mirroring the Writers' Room rail. Acts collapse; clips are the selectable leaves.
  const acts = [1,2,3].map(a=>({ act:a, scenes:scenesWithShots.filter(s=>(s.act||1)===a) })).filter(a=>a.scenes.length);
  const rail = _stEl("div",{className:"stage2-rail"},
    _stEl("div",{className:"stage2-rail-head"},
      Icon.layers&&_stEl(Icon.layers,{s:12}), _stEl("span",null,"Story Spine")),
    acts.map(a=> _stEl("div",{key:a.act,className:"tree-act"},
      _stEl("div",{className:"tree-act-head",onClick:()=>setActOpen(o=>({...o,[a.act]:!o[a.act]}))},
        _stEl("span",{style:{color:"var(--txt-2)",display:"flex"}}, _stEl(actOpen[a.act]?Icon.chevD:Icon.chevR,{s:13})),
        _stEl("span",{className:"tree-act-no"}, ["I","II","III"][a.act-1]),
        _stEl("span",{className:"tree-act-title"}, STAGE_ACT_TITLES[a.act]||("Act "+a.act)),
        _stEl("span",{className:"tree-act-count"}, a.scenes.length)),
      actOpen[a.act] && _stEl("div",{className:"tree-scenes"},
        a.scenes.map(scene=>{ const cs=allClips.filter(c=>c.scene.id===scene.id);
          return _stEl("div",{key:scene.id,className:"stage2-scene-grp"},
            _stEl("div",{className:"stage2-scene-row"},
              _stEl("span",{className:"tree-scene-no"}, _pad2(scene.no)),
              _stEl("span",{className:"tree-scene-dot",style:{background:chargeColor(scene)}}),
              _stEl("span",{className:"stage2-scene-ttl"}, scene.title||scene.loc)),
            _stEl("div",{className:"stage2-cliplist"},
              cs.map(function(c){
                const done=(typeof vidGetVideo==="function")&&vidGetVideo(c.id);
                return _stEl("button",{key:c.id,className:"stage2-cliprow"+(c.id===clip.id?" on":""),onClick:()=>setSelId(c.id),title:scene.loc+" — "+clipBeatName(c, beatsMap)},
                  _stEl("span",{className:"stage2-clip-lab"}, c.label),
                  _stEl("span",{className:"stage2-clip-beat"}, clipBeatName(c, beatsMap)),
                  done
                    ? _stEl("span",{className:"stage2-clip-done",title:"Rendered"}, Icon.play&&_stEl(Icon.play,{s:9}))
                    : _stEl("span",{className:"stage2-clip-dur"}, c.data.dur+"s")
                );
              })
            )
          );
        })
      )
    ))
  );
  return _stEl("div",{className:"stage2-root"},
    _stEl("div",{className:"stage2-body"}, rail,
      _stEl(ClipConsole,{ key:clip.id, clip, ctx, imgs, auds, beatsMap, prevClipVideoId })));
}
window.StageView = StageView;
