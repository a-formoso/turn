/* world.jsx — WORLDS: explorable location spaces for shot consistency (docs/World Plan.md).
   Two engines behind the image-proxy's `task:"world"` (keys are server secrets):
     • blockade — Blockade Labs Skybox: a 360° equirect pano ("the world plate"), ~30-60s.
     • marble   — World Labs Marble: an explorable 3D gaussian-splat world (~5 min);
                  its result ALSO includes a pano, which we store the same way.
   The pano is committed into the normal asset pipeline as `world-<locId>` so it
   syncs/scopes exactly like a coverage plate. The SCOUT viewer (Three.js pano
   sphere) lets the user look around inside the plate and TAKE VIEWS — framed
   crops saved as `locview-<locId>-<n>` assets, the geometry truth for shots. */

/* ── proxy calls ─────────────────────────────────────────────────────────── */
async function _worldInvoke(body){
  const sb = (typeof window.sbClient==="function") ? window.sbClient() : null;
  if(!sb || !sb.functions) throw new Error("Worlds run on your server — sign in to use them.");
  const fnName = (window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxyFn) || "image-proxy";
  let data, error;
  try{ ({ data, error } = await sb.functions.invoke(fnName, { body:{ task:"world", ...body } })); }
  catch(e){ error = e; }
  if(error){
    const status = (error && error.context && error.context.status) || error.status;
    if(status===401) throw new Error("Sign in to create worlds.");
    if(status===404) throw new Error("The proxy's world task isn't deployed yet — redeploy image-proxy.");
    // a non-2xx body may still carry the real reason — surface it if readable
    try{ const b = error.context && (await error.context.json()); if(b && b.error) throw new Error(b.error); }catch(e){ if(e && e.message && !/json/i.test(e.message)) throw e; }
    throw new Error("Couldn't reach the world engine: "+((error && error.message)||"unknown error")+".");
  }
  if(data && data.error) throw new Error(data.error);
  return data || {};
}

/* download a provider image and re-host it in OUR asset store (so viewers and
   canvas crops never fight provider CORS / expiring URLs) */
async function _worldFetchDataUrl(url){
  try{
    const r = await fetch(url, { mode:"cors" });
    if(!r.ok) throw new Error("status "+r.status);
    const blob = await r.blob();
    return await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(blob); });
  }catch(e){ return null; }   // CORS-blocked → caller keeps the remote URL
}

/* the pano prompt — the location's own spec is the source of truth (same fields
   the coverage plate uses), asked for as one continuous 360° space */
function buildWorldPanoPrompt(l, project){
  const bits = [];
  bits.push("360 degree equirectangular panorama, one single continuous real space seen from its center");
  bits.push((l.intExt||"INT")+" — "+(l.name||"a location"));
  if(l.architecture) bits.push("Architecture & layout: "+l.architecture);
  if(l.materials) bits.push("Materials & palette: "+l.materials);
  if(l.lighting) bits.push("Lighting & atmosphere: "+l.lighting);
  if(l.significance) bits.push("Mood: "+l.significance);
  const P = project||{};
  if(P.setting && P.setting.period) bits.push("Period: "+P.setting.period);
  bits.push("photoreal cinematic location reference, coherent geometry, no people, no text");
  return bits.filter(Boolean).join(". ").slice(0, 1900);
}
window.buildWorldPanoPrompt = buildWorldPanoPrompt;

/* create a world for a location. opts: { engine: "blockade"|"marble", onProgress(msg) }
   Resolves to the `world` object to store on the location. */
async function createLocationWorld(l, project, opts){
  opts = opts||{};
  const engine = opts.engine||"blockade";
  const tick = (m)=>{ try{ opts.onProgress && opts.onProgress(m); }catch(e){} };
  const prompt = buildWorldPanoPrompt(l, project);
  tick(engine==="marble" ? "Submitting to the 3D world engine…" : "Submitting the 360° plate…");
  const startBody = { engine, action:"start", prompt, displayName:(l.name||"Location")+" — "+((project&&project.title)||"TURN"), negativeText:"people, text, watermark, blurry, cartoon" };
  // ground the world in the existing coverage plate when we have one (image → world)
  if(engine==="marble" && typeof nbGetImage==="function"){
    const plate = nbGetImage(l.id);
    if(plate && /^https?:/.test(plate)) startBody.imageUrl = plate;
  }
  const started = await _worldInvoke(startBody);
  const id = started.id;
  if(!id) throw new Error("The world engine didn't return a job id.");
  const interval = engine==="marble" ? 8000 : 3000;
  const deadline = Date.now() + (engine==="marble" ? 12*60*1000 : 4*60*1000);
  let last = null;
  while(Date.now() < deadline){
    await new Promise(r=>setTimeout(r, interval));
    last = await _worldInvoke({ engine, action:"status", id });
    if(last.error) throw new Error(last.error);
    if(last.done) break;
    tick(engine==="marble" ? "Building the 3D world… (~5 min)" : ("Rendering the 360° plate… ("+(last.status||"working")+")"));
  }
  if(!last || !last.done) throw new Error("Timed out waiting for the world engine.");
  // store the pano in OUR asset store (falls back to the remote URL on CORS)
  let panoCommitted = false;
  if(last.panoUrl){
    tick("Saving the world plate…");
    const dataUrl = await _worldFetchDataUrl(last.panoUrl);
    if(dataUrl && typeof nbCommit==="function"){
      try{ await nbCommit("world-"+l.id, dataUrl, { kind:"world", engine, prompt }, [], "world"); panoCommitted = true; }catch(e){}
    }
  }
  return {
    engine, date: new Date().toISOString().slice(0,10),
    panoUrl: panoCommitted ? "" : (last.panoUrl||""),   // empty = read from asset store
    thumbUrl: last.thumbUrl||"", depthUrl: last.depthUrl||"",
    splatUrls: last.splatUrls||null, colliderUrl: last.colliderUrl||"",
    worldId: last.worldId||"", caption: last.caption||"",
  };
}
window.createLocationWorld = createLocationWorld;

/* resolve the world plate image for a location: committed asset first, remote fallback */
async function worldPanoSrc(l){
  if(typeof nbGetImage==="function"){
    const u = nbGetImage("world-"+l.id); if(u) return u;
  }
  if(typeof nbLoadImage==="function"){
    try{ const u = await nbLoadImage("world-"+l.id); if(u) return u; }catch(e){}
  }
  return (l.world && l.world.panoUrl) || "";
}
window.worldPanoSrc = worldPanoSrc;

/* ── the SCOUT viewer ────────────────────────────────────────────────────────
   Three.js pano sphere (UMD build from CDN — last global-THREE release line).
   Drag to look, wheel / [ ] for focal length, the canvas IS the frame (sized to
   the project format's aspect). "Take view" captures the canvas as a view asset. */
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js";
function _loadThree(){
  if(window.THREE) return Promise.resolve();
  if(window.__threeLoading) return window.__threeLoading;
  window.__threeLoading = new Promise((res,rej)=>{
    const s=document.createElement("script"); s.src=THREE_CDN;
    s.onload=()=>res(); s.onerror=()=>rej(new Error("Couldn't load the 3D viewer library."));
    document.head.appendChild(s);
  });
  return window.__threeLoading;
}

function WorldScout({ l, project, onClose, onTakeView }){
  const wrapRef = React.useRef(null);
  const [err,setErr] = React.useState("");
  const [ready,setReady] = React.useState(false);
  const [fov,setFov] = React.useState(55);
  const [taking,setTaking] = React.useState(false);
  const stRef = React.useRef(null);   // { renderer, camera, scene, yaw, pitch }

  React.useEffect(()=>{
    let alive = true, cleanup = null;
    (async()=>{
      try{
        const src = await worldPanoSrc(l);
        if(!src){ setErr("No world plate yet — create the world first."); return; }
        await _loadThree();
        if(!alive || !wrapRef.current) return;
        const THREE = window.THREE;
        const wrap = wrapRef.current;
        const W = wrap.clientWidth, H = wrap.clientHeight;
        const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
        renderer.setSize(W, H); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
        wrap.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(55, W/H, 0.1, 100);
        camera.position.set(0,0,0.001);
        const tex = await new Promise((res,rej)=>{ new THREE.TextureLoader().load(src, res, undefined, rej); });
        tex.colorSpace = THREE.SRGBColorSpace || undefined;
        // anisotropic filtering — the single biggest sharpness win on a pano
        // sphere, where most of the image is viewed at grazing angles
        try{ tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); }catch(e){}
        const geo = new THREE.SphereGeometry(50, 64, 48); geo.scale(-1,1,1);   // inward-facing
        scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map:tex })));
        const st = { renderer, camera, scene, yaw:0, pitch:0 };
        stRef.current = st;
        const render = ()=>{ camera.rotation.order="YXZ"; camera.rotation.y=st.yaw; camera.rotation.x=st.pitch; renderer.render(scene,camera); };
        render();
        // drag to look
        let dragging=false, px=0, py=0;
        const down=(e)=>{ dragging=true; px=e.clientX; py=e.clientY; };
        const move=(e)=>{ if(!dragging) return;
          st.yaw += (e.clientX-px)*0.0035; st.pitch += (e.clientY-py)*0.0035;
          st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch)); px=e.clientX; py=e.clientY; render(); };
        const up=()=>{ dragging=false; };
        const wheel=(e)=>{ e.preventDefault();
          camera.fov = Math.max(18, Math.min(95, camera.fov + (e.deltaY>0?2:-2)));
          camera.updateProjectionMatrix(); setFov(Math.round(camera.fov)); render(); };
        const el = renderer.domElement;
        el.addEventListener("pointerdown",down); window.addEventListener("pointermove",move);
        window.addEventListener("pointerup",up); el.addEventListener("wheel",wheel,{passive:false});
        st.render = render;
        cleanup = ()=>{ el.removeEventListener("pointerdown",down); window.removeEventListener("pointermove",move);
          window.removeEventListener("pointerup",up); el.removeEventListener("wheel",wheel);
          try{ renderer.dispose(); wrap.removeChild(el); }catch(e){} };
        setReady(true);
      }catch(e){ if(alive) setErr(String((e&&e.message)||e)); }
    })();
    return ()=>{ alive=false; if(cleanup) cleanup(); };
  },[l.id]);

  const takeView = async ()=>{
    const st = stRef.current; if(!st || taking) return;
    setTaking(true);
    try{
      // capture at 2× the CSS size regardless of the display's pixel ratio,
      // so views are shot-reference quality even on a 1:1 monitor
      const prevRatio = st.renderer.getPixelRatio();
      try{ st.renderer.setPixelRatio(2); st.render(); }catch(e){}
      const dataUrl = st.renderer.domElement.toDataURL("image/jpeg", 0.92);
      try{ st.renderer.setPixelRatio(prevRatio); st.render(); }catch(e){}
      await onTakeView(dataUrl, { yaw:st.yaw, pitch:st.pitch, fov:st.camera.fov });
    }catch(e){ setErr(String((e&&e.message)||e)); }
    setTaking(false);
  };

  // canvas aspect = the project's format aspect (the frame IS the viewport)
  const aspect = (typeof aspectFor==="function") ? aspectFor(project) : "16:9";
  const ratio = aspect==="9:16" ? "9 / 16" : aspect==="21:9" ? "21 / 9" : "16 / 9";
  // PORTAL to <body>: the card's transformed/scrolling ancestors would otherwise
  // turn position:fixed into card-relative and shrink the viewer to card width
  return ReactDOM.createPortal(React.createElement("div",{className:"scout-overlay",onClick:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"scout-modal"},
      React.createElement("div",{className:"scout-head"},
        React.createElement(Icon.globe,{s:15}),
        React.createElement("span",{className:"scout-title"},"Scout — "+(l.name||"Location")),
        React.createElement("span",{className:"scout-meta"},"drag to look · wheel = lens · "+Math.round((36/Math.tan((fov/2)*Math.PI/180))/2)+"mm-ish"),
        React.createElement("button",{className:"scout-x",onClick:onClose},React.createElement(Icon.x,{s:14}))),
      React.createElement("div",{ref:wrapRef,className:"scout-stage",style:{aspectRatio:ratio}},
        !ready && !err && React.createElement("div",{className:"scout-loading"},"Entering the world…"),
        err && React.createElement("div",{className:"scout-err"},err)),
      React.createElement("div",{className:"scout-foot"},
        React.createElement("span",{className:"scout-hint"},"The frame is the canvas — what you see is the shot."),
        React.createElement("button",{className:"scout-take",disabled:!ready||taking,onClick:takeView},
          React.createElement(Icon.camera,{s:14}), taking?"Saving view…":"Take view")))), document.body);
}
window.WorldScout = WorldScout;

/* ── the World section on a location card ──────────────────────────────────── */
function WorldSection({ l, project, onUpdate, onView }){
  const [busy,setBusy] = React.useState("");
  const [err,setErr] = React.useState("");
  const [scout,setScout] = React.useState(false);
  const [panoThumb,setPanoThumb] = React.useState("");
  const world = l.world || null;
  const views = (world && world.views) || [];

  React.useEffect(()=>{ let alive=true;
    (async()=>{ const u = await worldPanoSrc(l); if(alive) setPanoThumb(u||""); })();
    return ()=>{ alive=false; };
  },[l.id, world && world.date, busy]);

  const create = async (engine)=>{
    if(busy) return;
    setErr(""); setBusy(engine==="marble"?"Submitting…":"Starting…");
    try{
      const w = await createLocationWorld(l, project, { engine, onProgress:setBusy });
      onUpdate(l.id, { world: { ...(l.world||{}), ...w, views } });
    }catch(e){ setErr(String((e&&e.message)||e)); }
    setBusy("");
  };

  const takeView = async (dataUrl, cam)=>{
    const n = (views.length||0)+1;
    const id = "locview-"+l.id+"-"+Date.now().toString(36);
    if(typeof nbCommit==="function"){
      try{ await nbCommit(id, dataUrl, { kind:"locview", cam }, [], "locview"); }catch(e){}
    }
    onUpdate(l.id, { world: { ...(l.world||{}), views: [...views, { id, name:"View "+n, cam }] } });
  };

  return React.createElement("div",{className:"loc-world"},
    React.createElement("div",{className:"obj-lab"},"World — one continuous space every shot frames inside"),
    err && React.createElement("div",{className:"ns-err",style:{margin:"4px 0"}},err),
    busy
      ? React.createElement("div",{className:"loc-world-busy"},
          React.createElement("span",{className:"ns-spin"}), busy)
      : !world
      ? React.createElement("div",{className:"loc-world-ctas"},
          React.createElement("button",{className:"loc-world-btn stack",onClick:()=>create("blockade"),
            title:"A 360° panorama plate of this location — the fast, cheap engine"},
            React.createElement("span",{className:"loc-world-btn-t"},React.createElement(Icon.globe,{s:13}),"360° world"),
            React.createElement("span",{className:"loc-world-btn-sub"},"one panorama · ~1 min")),
          React.createElement("button",{className:"loc-world-btn stack alt",onClick:()=>create("marble"),
            title:"A fully explorable 3D world — also yields the 360° plate, plus a downloadable 3D file"},
            React.createElement("span",{className:"loc-world-btn-t"},React.createElement(Icon.layers,{s:13}),"3D world"),
            React.createElement("span",{className:"loc-world-btn-sub"},"explorable + panorama · ~5 min")))
      : React.createElement("div",{className:"loc-world-have"},
          panoThumb && React.createElement("img",{className:"loc-world-pano",src:panoThumb,alt:"world plate",
            onClick:()=>setScout(true),title:"Open the scout"}),
          React.createElement("div",{className:"loc-world-row"},
            React.createElement("button",{className:"loc-world-btn",onClick:()=>setScout(true)},
              React.createElement(Icon.eye,{s:13}),"Scout this location"),
            React.createElement("button",{className:"loc-world-btn ghost",onClick:()=>create(world.engine||"blockade"),
              title:"Regenerate the world plate"},React.createElement(Icon.redo,{s:13}),"Redo"),
            world.splatUrls && React.createElement("a",{className:"loc-world-btn ghost",
              href:(world.splatUrls.full_res||world.splatUrls.full||world.splatUrls["500k"]||world.splatUrls["100k"]||Object.values(world.splatUrls)[0])||"#",
              target:"_blank",rel:"noreferrer",title:"Download the 3D gaussian-splat file (Marble)"},
              React.createElement(Icon.download,{s:13}),"3D splat")),
          views.length>0 && React.createElement("div",{className:"loc-world-views"},
            views.map(v=>React.createElement("button",{key:v.id,className:"loc-world-view",
              title:"Open this saved view",
              onClick:async ()=>{
                // resolve the ASSET to a displayable URL (the lightbox wants a URL, not an id)
                let u = (typeof nbGetImage==="function") ? nbGetImage(v.id) : "";
                if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(v.id); }catch(e){} }
                if(u && onView) onView(u, (l.name||"Location")+" — "+v.name);
                else if(window.turnToast) window.turnToast("This view's image isn't available — retake it from the Scout.");
              }},
              React.createElement(Icon.camera,{s:11}), v.name)))),
    scout && React.createElement(WorldScout,{ l, project, onClose:()=>setScout(false), onTakeView:takeView }));
}
window.WorldSection = WorldSection;
