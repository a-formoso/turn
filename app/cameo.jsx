/* cameo.jsx — "Cast yourself" identity capture (Increments A + B).
   Webcam (or uploaded stills) → a locked likeness token for one character.
   The captured face(s) are stored LOCAL-ONLY by default (biometric data) and
   auto-attached as conditioning references on every generation of that
   character, so the face stays consistent across sheets and state variants.

   Increment B — multi-angle capture: Front (required) + ¾ Left + ¾ Right
   (optional) give the model far more to lock onto, plus a provenance/consent
   gate (subject note, source, capture date) and an explicit cloud-sync opt-in.

   Exports: CameoModal (capture) + CameoManager (review/revoke across cast). */

const CAMEO_ANGLES = [
  { key:"front", label:"Front",   hint:"Look straight at the camera",   req:true  },
  { key:"left",  label:"\u00be Left",  hint:"Turn about 30\u00b0 to your left",  req:false },
  { key:"right", label:"\u00be Right", hint:"Turn about 30\u00b0 to your right", req:false },
];

/* shared: square centre-crop a video frame or image to <=1024 jpeg data URL */
function cameoCropToDataUrl(src, sw, sh){
  const side = Math.min(sw, sh), out = Math.min(side, 1024);
  const cv = document.createElement("canvas"); cv.width=out; cv.height=out;
  const ctx = cv.getContext("2d");
  ctx.drawImage(src, (sw-side)/2, (sh-side)/2, side, side, 0, 0, out, out);
  return { url: cv.toDataURL("image/jpeg", 0.92), out };
}

/* ── pose-guide sketches ───────────────────────────────────────────────────
   A light pencil head sketch for each angle (front / ¾ left / ¾ right), shown
   as the empty-slot placeholder and a faint ghost in the capture ring so the
   user can SEE the pose to strike. Generated once via Nano Banana and cached
   (downscaled) in localStorage — they're generic, so every character/session
   reuses them. No API key → no sketch (an icon placeholder stands in). */
function cameoGuidePrompt(gender, angle){
  const subj = gender==="male" ? "a generic adult man" : gender==="female" ? "a generic adult woman" : "a generic androgynous adult person";
  const pose = angle==="left" ? "turned about thirty degrees to the viewer's left (three-quarter left view)"
            : angle==="right" ? "turned about thirty degrees to the viewer's right (three-quarter right view)"
            : "facing straight toward the viewer (front view)";
  return "A clean black-and-white pencil portrait line drawing of one "+subj+"'s head and shoulders "+pose+", calm neutral expression. "+
    "Clearly visible confident dark graphite outlines of the head, hairline, ears, eyes, nose and jaw, with light tonal shading. "+
    "Plain white paper background, good contrast, centred. No text, no border, no colour.";
}
const cameoGuideKey = (g,k)=>"cameo_guide_v3_"+(g||"neutral")+"_"+k;
function cameoGetGuide(g,k){ try{ return localStorage.getItem(cameoGuideKey(g,k))||""; }catch(e){ return ""; } }
/* infer the character's presented gender from their text (pronouns / gendered
   nouns); used only to pick which sketch to show. Falls back to neutral. */
function cameoInferGender(c){
  if(!c) return "neutral";
  const blob = [c.role,c.identity,c.conscious,c.unconscious,c.arc,c.coreBody,
    c.physique&&Object.values(c.physique).join(" "),c.wardrobeMask,c.wardrobeInner]
    .filter(Boolean).join(" ").toLowerCase();
  const m = (blob.match(/\b(he|him|his|man|men|male|boy|gentleman|father|husband|brother|son|mr|sir|king|actor|widower)\b/g)||[]).length;
  const f = (blob.match(/\b(she|her|hers|woman|women|female|girl|lady|mother|wife|sister|daughter|mrs|ms|miss|queen|actress|widow)\b/g)||[]).length;
  if(m>f && m>0) return "male";
  if(f>m && f>0) return "female";
  return "neutral";
}
function cameoDownscale(url, size){
  return new Promise((resolve)=>{ const img=new Image();
    img.onload=()=>{ const cv=document.createElement("canvas"); cv.width=size; cv.height=size;
      const ctx=cv.getContext("2d"); const s=Math.min(img.width,img.height);
      try{ ctx.filter="grayscale(1) contrast(1.5) brightness(0.96)"; }catch(e){}
      ctx.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,size,size);
      try{ resolve(cv.toDataURL("image/jpeg",0.85)); }catch(e){ resolve(url); } };
    img.onerror=()=>resolve(url); img.src=url; });
}
function useCameoGuides(gender){
  gender = gender || "neutral";
  const read = ()=>({front:cameoGetGuide(gender,"front"),left:cameoGetGuide(gender,"left"),right:cameoGetGuide(gender,"right")});
  const [guides,setGuides] = React.useState(read);
  const [loading,setLoading] = React.useState(false);
  React.useEffect(()=>{
    setGuides(read());                       // swap to this gender's cached set
    let alive=true;
    const missing = ["front","left","right"].filter(k=>!cameoGetGuide(gender,k));
    if(!missing.length){ setLoading(false); return; }
    if(!(typeof nbHasKey==="function" && nbHasKey() && typeof nbGenerate==="function")) return;
    setLoading(true);
    (async()=>{
      for(const k of missing){
        try{
          const raw = await nbGenerate(cameoGuidePrompt(gender,k), { aspectRatio:"1:1", imageSize:"1K" });
          const small = await cameoDownscale(raw, 360);
          try{ localStorage.setItem(cameoGuideKey(gender,k), small); }catch(e){}
          if(alive) setGuides(g=>({...g,[k]:small}));
        }catch(e){ /* leave this angle without a sketch */ }
      }
      if(alive) setLoading(false);
    })();
    return ()=>{ alive=false; };
  },[gender]);
  return { guides, loading };
}

function CameoModal({ character, onClose, onSaved }){
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const [phase, setPhase] = React.useState("live");     // live | denied | nocam
  const [shots, setShots] = React.useState({});          // {front,left,right} -> dataURL
  const [activeIdx, setActiveIdx] = React.useState(0);   // which angle the camera targets
  const [dims, setDims] = React.useState({w:0,h:0});
  const [consent, setConsent] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [sync, setSync] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");

  const cloudReady = (typeof nbBackend==="function" && nbBackend()==="cloud");
  const activeAngle = CAMEO_ANGLES[activeIdx] || CAMEO_ANGLES[0];
  const hasFront = !!shots.front;
  const shotCount = Object.values(shots).filter(Boolean).length;

  /* auto-capture engine state */
  const [auto, setAuto] = React.useState(true);
  const [det, setDet] = React.useState({ face:false, bright:true, still:false, prog:0, size:null, pose:null });
  const { guides, loading:guidesLoading } = useCameoGuides(cameoInferGender(character));
  const [flash, setFlash] = React.useState(false);
  const activeIdxRef = React.useRef(activeIdx); activeIdxRef.current = activeIdx;
  const shotsRef = React.useRef(shots); shotsRef.current = shots;
  const autoRef = React.useRef(auto); autoRef.current = auto;
  const analyRef = React.useRef(null);
  const faceAnalyRef = React.useRef(null);    // face-box-only sample canvas
  const prevLumaRef = React.useRef(null);
  const steadyRef = React.useRef(0);
  const busyRef = React.useRef(false);
  const faceDetRef = React.useRef(undefined);   // FaceDetector instance | null
  const faceOkRef = React.useRef(null);         // last detector verdict
  const faceBoxRef = React.useRef(null);        // last detector bounding box (video px)
  const detectingRef = React.useRef(false);

  const stopStream = ()=>{ try{ (streamRef.current&&streamRef.current.getTracks()||[]).forEach(t=>t.stop()); }catch(e){} streamRef.current=null; };
  const startCam = React.useCallback(async ()=>{
    setErr("");
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ setPhase("nocam"); return; }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:"user", width:{ideal:1280}, height:{ideal:1280} }, audio:false });
      streamRef.current = stream; setPhase("live");
      requestAnimationFrame(()=>{ if(videoRef.current){ videoRef.current.srcObject=stream; videoRef.current.play().catch(()=>{}); } });
    }catch(e){ setPhase((e && (e.name==="NotAllowedError"||e.name==="SecurityError")) ? "denied" : "nocam"); }
  },[]);
  React.useEffect(()=>{ startCam(); return stopStream; },[startCam]);

  const nextEmpty = (next)=>{ for(let i=0;i<CAMEO_ANGLES.length;i++){ if(!next[CAMEO_ANGLES[i].key]) return i; } return activeIdx; };

  /* commit a frame for a specific angle, flash, then advance to the next empty */
  const doCapture = (key)=>{
    const v = videoRef.current; if(!v || !v.videoWidth || busyRef.current) return;
    const { url, out } = cameoCropToDataUrl(v, v.videoWidth, v.videoHeight);
    const next = { ...shotsRef.current, [key]:url };
    busyRef.current = true; steadyRef.current = 0; prevLumaRef.current = null;
    setFlash(true); setShots(next); setDims({w:out,h:out});
    setTimeout(()=>{ setFlash(false); busyRef.current = false; setActiveIdx(nextEmpty(next)); }, 280);
  };
  const captureNow = ()=> doCapture(CAMEO_ANGLES[activeIdxRef.current].key);

  /* ── auto-capture loop ───────────────────────────────────────────────────
     Samples the webcam ~5×/s into a 64px canvas and scores the framed centre:
       • bright  — mean luma in a usable band (not too dark / blown out)
       • still   — low frame-to-frame motion (subject holding the pose)
       • face    — a subject is present (FaceDetector when available, else a
                   centre-detail/variance heuristic that fires on a face)
     When all three hold for ~1s it auto-captures and advances. Fail-open: if
     the FaceDetector API is missing or errors, the heuristic carries it. */
  React.useEffect(()=>{
    if(phase!=="live") return;
    if(faceDetRef.current===undefined){
      try{ faceDetRef.current = ("FaceDetector" in window) ? new window.FaceDetector({ fastMode:true, maxDetectedFaces:1 }) : null; }
      catch(e){ faceDetRef.current = null; }
    }
    let raf=0, stopped=false, last=0, detClock=0;
    const SAMPLE=180, NEED=5, N=64;
    const loop = (t)=>{
      if(stopped) return;
      raf = requestAnimationFrame(loop);
      if(t-last < SAMPLE) return; last=t;
      const v = videoRef.current; if(!v || !v.videoWidth) return;
      const key = CAMEO_ANGLES[activeIdxRef.current].key;
      if(busyRef.current || !autoRef.current || shotsRef.current[key]){
        if(steadyRef.current!==0){ steadyRef.current=0; setDet(d=>({...d,prog:0})); }
        return;
      }
      const cv = analyRef.current || (analyRef.current=document.createElement("canvas"));
      cv.width=N; cv.height=N;
      const ctx = cv.getContext("2d",{willReadFrequently:true});
      const side = Math.min(v.videoWidth, v.videoHeight);
      ctx.drawImage(v,(v.videoWidth-side)/2,(v.videoHeight-side)/2,side,side,0,0,N,N);
      const img = ctx.getImageData(0,0,N,N).data;
      const luma = new Float32Array(N*N);
      let sum=0;
      for(let i=0,p=0;i<img.length;i+=4,p++){ const l=0.299*img[i]+0.587*img[i+1]+0.114*img[i+2]; luma[p]=l; sum+=l; }
      const mean = sum/(N*N);
      /* centre-region detail split LEFT vs RIGHT half (in the unmirrored video
         frame). When the user turns their head, the cheek facing the camera shows
         MORE skin/detail than the receding side, so |lStd - rStd| spikes — and
         the sign of the imbalance tells us which way they're turned. */
      const lo=N*0.27, hi=N*0.73, mid=N*0.5;
      let lS=0,lS2=0,lN=0, rS=0,rS2=0,rN=0;
      for(let y=0;y<N;y++) for(let x=0;x<N;x++){
        if(y>=lo&&y<=hi){
          if(x>=lo&&x<mid){ const l=luma[y*N+x]; lS+=l; lS2+=l*l; lN++; }
          else if(x>=mid&&x<=hi){ const l=luma[y*N+x]; rS+=l; rS2+=l*l; rN++; }
        }
      }
      const lStd = lN ? Math.sqrt(Math.max(0, lS2/lN-(lS/lN)*(lS/lN))) : 0;
      const rStd = rN ? Math.sqrt(Math.max(0, rS2/rN-(rS/rN)*(rS/rN))) : 0;
      const cstd = (lStd+rStd)/2;
      const sym  = Math.min(lStd,rStd)/Math.max(lStd,rStd,1);
      /* motion vs previous sample */
      let motion=999; const prev=prevLumaRef.current;
      if(prev && prev.length===luma.length){ let d=0; for(let p=0;p<luma.length;p++) d+=Math.abs(luma[p]-prev[p]); motion=d/luma.length; }
      prevLumaRef.current = luma;
      const bright = mean>45 && mean<228;
      const still  = motion < 6.5;
      let face = cstd > 15;
      /* optional FaceDetector refinement (throttled, non-blocking, fail-open) */
      if(faceDetRef.current && t-detClock>500 && !detectingRef.current){
        detClock=t; detectingRef.current=true;
        faceDetRef.current.detect(v).then(f=>{ const ok=!!(f&&f.length);
          faceOkRef.current = f ? ok : null;
          faceBoxRef.current = ok ? (f[0].boundingBox||null) : null; })
          .catch(()=>{ faceOkRef.current=null; faceBoxRef.current=null; }).finally(()=>{ detectingRef.current=false; });
      }
      if(faceOkRef.current===true) face = true;
      /* positioning (only when the detector gives us a box): too far / too close
         / off-centre. Fail-open when there's no FaceDetector — the pose guide
         and the framing ring carry it instead. */
      let sizeState = null;
      const box = faceBoxRef.current;
      if(box && v.videoWidth && v.videoHeight){
        const sideF = Math.min(v.videoWidth, v.videoHeight);
        const frac = (box.width||0)/sideF;
        const cx = (box.x||0)+(box.width||0)/2, cy = (box.y||0)+(box.height||0)/2;
        const offX = Math.abs(cx - v.videoWidth/2)/sideF, offY = Math.abs(cy - v.videoHeight/2)/sideF;
        if(frac>0 && frac<0.30) sizeState = "far";
        else if(frac>0.92) sizeState = "close";
        else if(offX>0.20 || offY>0.20) sizeState = "offcenter";
      }
      /* pose match: measure left/right detail asymmetry INSIDE the face box only
         (whole-frame asymmetry was too noisy — background, hair on one side, side
         lighting all read as a "turn"). When the user turns their head, the cheek
         facing the camera shows noticeably more detail; the sign of the imbalance
         tells us which way. yawSignal > 0 = turned to their LEFT (image-left has
         more detail), < 0 = turned to their RIGHT. */
      let yawSignal = null;
      if(box && box.width>10 && box.height>10){
        const fx=Math.max(0,box.x), fy=Math.max(0,box.y);
        const fw=Math.min(v.videoWidth-fx, box.width), fh=Math.min(v.videoHeight-fy, box.height);
        if(fw>10 && fh>10){
          const fc = faceAnalyRef.current || (faceAnalyRef.current=document.createElement("canvas"));
          fc.width=32; fc.height=32;
          const fctx = fc.getContext("2d",{willReadFrequently:true});
          fctx.drawImage(v, fx, fy, fw, fh, 0, 0, 32, 32);
          const fd = fctx.getImageData(0,0,32,32).data;
          let flS=0,flS2=0,flN=0, frS=0,frS2=0,frN=0;
          for(let y=4;y<28;y++) for(let x=2;x<30;x++){
            const o=(y*32+x)*4; const l=0.299*fd[o]+0.587*fd[o+1]+0.114*fd[o+2];
            if(x<16){ flS+=l; flS2+=l*l; flN++; } else { frS+=l; frS2+=l*l; frN++; }
          }
          const flStd = flN?Math.sqrt(Math.max(0,flS2/flN-(flS/flN)*(flS/flN))):0;
          const frStd = frN?Math.sqrt(Math.max(0,frS2/frN-(frS/frN)*(frS/frN))):0;
          const mx = Math.max(flStd, frStd, 1);
          yawSignal = (flStd - frStd) / mx;     // -1 .. +1
        }
      }
      let poseState = null;
      let sizeState_ = sizeState;
      if(yawSignal !== null){
        if(key==="front"){       if(Math.abs(yawSignal) > 0.18) poseState = "front"; }
        else if(key==="left"){   if(yawSignal < 0.30)            poseState = "left"; }
        else if(key==="right"){  if(yawSignal > -0.30)           poseState = "right"; }
      } else if(key!=="front"){
        // no face box yet -> can't safely confirm a ¾ turn; require manual capture
        poseState = key;
      }
      const ready = bright && still && face && !sizeState_ && !poseState;
      steadyRef.current = ready ? steadyRef.current+1 : 0;
      const prog = Math.min(1, steadyRef.current/NEED);
      setDet({ face, bright, still, prog, size:sizeState, pose:poseState });
      if(steadyRef.current>=NEED) doCapture(key);
    };
    raf = requestAnimationFrame(loop);
    return ()=>{ stopped=true; cancelAnimationFrame(raf); };
  },[phase]);

  const onPickFile = (e)=>{
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = ()=>{ const img=new Image(); img.onload=()=>{
      const { url, out } = cameoCropToDataUrl(img, img.width, img.height);
      const next = { ...shots, [activeAngle.key]:url };
      setShots(next); setDims({w:out,h:out}); setActiveIdx(nextEmpty(next));
    }; img.src = rd.result; };
    rd.readAsDataURL(f);
    e.target.value = "";
  };
  const clearShot = (key)=>{ const next={...shots}; delete next[key]; setShots(next);
    const idx=CAMEO_ANGLES.findIndex(a=>a.key===key); if(idx>=0) setActiveIdx(idx); };

  const save = async ()=>{
    if(!hasFront || !consent) return;
    setSaving(true); setErr("");
    try{
      const angles = CAMEO_ANGLES.filter(a=>shots[a.key]).map(a=>({ label:a.label, url:shots[a.key] }));
      await nbSetCameo(character.id, { angles, consent:true, sync:sync && cloudReady,
        source:"webcam", subject:subject.trim(), w:dims.w, h:dims.h });
      try{ const el=document.getElementById("charref-"+character.id);
        if(el && typeof el._ingestDataUrl==="function") await el._ingestDataUrl(angles[0].url); }catch(e){}
      onSaved && onSaved({ angles, sync });
      onClose && onClose();
    }catch(e){ setErr((e&&e.message)||"Couldn't save the cameo."); setSaving(false); }
  };

  const stop = (e)=>e.stopPropagation();
  const liveOk = phase==="live";
  /* live readiness cue for the active angle */
  const targetFilled = !!shots[activeAngle.key];
  let cue;
  if(targetFilled) cue = { k:"done", t:"Captured \u2014 pick another angle or lock the likeness" };
  else if(!auto)   cue = { k:"off",  t:"Auto-capture paused \u2014 use \u201cCapture now\u201d" };
  else if(!det.face)              cue = { k:"wait", t:"Match the sketch \u2014 center your "+activeAngle.label+" in the ring" };
  else if(det.size==="far")       cue = { k:"wait", t:"Move a little closer" };
  else if(det.size==="close")     cue = { k:"wait", t:"Move back a little" };
  else if(det.size==="offcenter") cue = { k:"wait", t:"Center your face in the ring" };
  else if(det.pose==="front")     cue = { k:"wait", t:"Face the camera straight on" };
  else if(det.pose==="left")      cue = { k:"wait", t:"Turn your head slightly to your left" };
  else if(det.pose==="right")     cue = { k:"wait", t:"Turn your head slightly to your right" };
  else if(!det.bright) cue = { k:"wait", t:"Find more even light" };
  else if(!det.still)  cue = { k:"wait", t:"Hold still\u2026" };
  else cue = { k:"go", t:"Hold steady \u2014 capturing" };

  return React.createElement("div",{className:"cameo-overlay",onClick:onClose},
    React.createElement("div",{className:"cameo-modal",onClick:stop},
      React.createElement("div",{className:"cameo-head"},
        React.createElement("div",null,
          React.createElement("div",{className:"cameo-title"},
            React.createElement(Icon.userScan,{s:16})," Cast ",character.name),
          React.createElement("div",{className:"cameo-sub"},"Match the on-screen sketch for each pose \u2014 capture ",
            React.createElement("b",null,"Front"),", and optionally two \u00be angles, to lock the likeness",
            guidesLoading?React.createElement("span",{className:"cameo-guide-loading"}," \u00b7 preparing pose guides\u2026"):null)),
        React.createElement("button",{className:"cameo-x",onClick:onClose,"aria-label":"Close"},
          React.createElement(Icon.x,{s:16}))),

      /* stage: live camera with the active angle's guide + hint, or fallbacks */
      React.createElement("div",{className:"cameo-stage"},
        liveOk && React.createElement(React.Fragment,null,
          React.createElement("video",{ref:videoRef,className:"cameo-video",playsInline:true,muted:true}),
          React.createElement("div",{className:"cameo-guide"+(cue.k==="go"?" go":"")}),
          flash && React.createElement("div",{className:"cameo-flash"}),
          React.createElement("div",{className:"cameo-anglebadge"},
            "Capturing: ",React.createElement("b",null,activeAngle.label),activeAngle.req?" \u00b7 required":" \u00b7 optional"),
          React.createElement("div",{className:"cameo-cue "+cue.k},
            React.createElement("span",{className:"cameo-cue-dot"}),
            React.createElement("span",null,cue.t)),
          !targetFilled && auto && React.createElement("div",{className:"cameo-prog"},
            React.createElement("div",{className:"cameo-prog-fill",style:{width:(Math.round(det.prog*100))+"%"}})),
          React.createElement("button",{className:"cameo-capnow",onClick:captureNow,
            title:"Capture this angle manually"},"Capture now")),
        phase==="denied" && React.createElement("div",{className:"cameo-msg"},
          React.createElement(Icon.warn,{s:26}),
          React.createElement("div",{className:"cameo-msg-t"},"Camera access blocked"),
          React.createElement("div",{className:"cameo-msg-s"},"Allow camera in your browser's address bar, or upload photos instead."),
          React.createElement("button",{className:"cameo-btn ghost",onClick:()=>fileRef.current&&fileRef.current.click()},
            React.createElement(Icon.image,{s:14}),"Upload ",activeAngle.label)),
        phase==="nocam" && React.createElement("div",{className:"cameo-msg"},
          React.createElement(Icon.image,{s:26}),
          React.createElement("div",{className:"cameo-msg-t"},"No camera available"),
          React.createElement("div",{className:"cameo-msg-s"},"Upload clear, front-facing photos to use as the cameo."),
          React.createElement("button",{className:"cameo-btn ghost",onClick:()=>fileRef.current&&fileRef.current.click()},
            React.createElement(Icon.image,{s:14}),"Choose photo"))),

      /* angle strip — captured thumbnails / target slots */
      React.createElement("div",{className:"cameo-strip"},
        CAMEO_ANGLES.map((a,i)=>{
          const filled = !!shots[a.key];
          return React.createElement("button",{key:a.key,
            className:"cameo-slot"+(filled?" filled":"")+(i===activeIdx&&liveOk?" active":""),
            onClick:()=>setActiveIdx(i),title:filled?("Recapture "+a.label):("Capture "+a.label)},
            filled
              ? React.createElement(React.Fragment,null,
                  React.createElement("img",{src:shots[a.key],alt:a.label}),
                  React.createElement("span",{className:"cameo-slot-x",onClick:(e)=>{ e.stopPropagation(); clearShot(a.key); }},
                    React.createElement(Icon.x,{s:10,sw:2.4})))
              : (guides[a.key]
                  ? React.createElement("img",{className:"cameo-slot-guide",src:guides[a.key],alt:a.label})
                  : React.createElement("span",{className:"cameo-slot-empty"},React.createElement(Icon.plus,{s:14}))),
            React.createElement("span",{className:"cameo-slot-lab"},a.label,a.req?React.createElement("i",null," *"):null));
        })),

      /* provenance + consent (once we have at least the Front shot) */
      hasFront && React.createElement("div",{className:"cameo-consent"},
        React.createElement("input",{className:"cameo-subject",type:"text",value:subject,
          onChange:e=>setSubject(e.target.value),placeholder:"Whose likeness is this? (optional \u2014 e.g. \u201cMe\u201d, actor's name)"}),
        React.createElement("label",{className:"cameo-check"},
          React.createElement("input",{type:"checkbox",checked:consent,onChange:e=>setConsent(e.target.checked)}),
          React.createElement("span",null,"This is my likeness, or I have the person's permission to use it.")),
        React.createElement("label",{className:"cameo-check sync"+(cloudReady?"":" disabled")},
          React.createElement("input",{type:"checkbox",checked:sync && cloudReady,disabled:!cloudReady,
            onChange:e=>setSync(e.target.checked)}),
          React.createElement("span",null,
            React.createElement("b",null,"Sync this cameo to the cloud."),
            cloudReady ? React.createElement(React.Fragment,null," Off by default \u2014 the face stays ",
              React.createElement("b",null,"on this device"),", synced only if you tick this.")
                       : " Sign in to enable cloud sync \u2014 for now it stays on this device.")),
        err && React.createElement("div",{className:"cameo-err"},err)),

      React.createElement("div",{className:"cameo-acts"},
        (liveOk || phase==="denied" || phase==="nocam") && React.createElement("button",
          {className:"cameo-btn ghost",onClick:()=>fileRef.current&&fileRef.current.click()},
          React.createElement(Icon.image,{s:14}),"Upload"),
        liveOk && React.createElement("button",{className:"cameo-autopill"+(auto?" on":""),
          onClick:()=>setAuto(a=>!a),
          title:auto?"Auto-capture on \u2014 snaps when the shot looks good":"Auto-capture off \u2014 capture manually"},
          React.createElement(Icon.bolt,{s:13}),"Auto"),
        React.createElement("button",{className:"cameo-btn primary",onClick:save,disabled:!hasFront||!consent||saving,
          title:!hasFront?"Capture the Front angle first":(!consent?"Tick the consent box":"")},
          saving ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),"Saving\u2026")
                 : React.createElement(React.Fragment,null,React.createElement(Icon.check,{s:15}),
                     "Lock likeness",shotCount>1?(" \u00b7 "+shotCount+" angles"):"")) ),

      React.createElement("input",{ref:fileRef,type:"file",accept:"image/*",style:{display:"none"},onChange:onPickFile})));
}
window.CameoModal = CameoModal;

/* CameoManager — review/revoke every cameo across the cast in one place.
   Opened from the Art Room Characters header. Shows provenance, angle
   thumbnails, sync state, and a one-click revoke (which also clears the cloud
   copy when synced). nameOf(id) maps a character id → display name. */
function CameoManager({ nameOf, onClose, onChanged }){
  const [list, setList] = React.useState(()=> (typeof nbListCameos==="function") ? nbListCameos() : []);
  const [full, setFull] = React.useState({});      // id -> loaded record (angles)
  const refresh = ()=>{ const l=(typeof nbListCameos==="function")?nbListCameos():[]; setList(l); onChanged&&onChanged(); };

  React.useEffect(()=>{
    let alive=true;
    (async()=>{ const out={};
      for(const c of list){ try{ out[c.id]= (typeof nbLoadCameoFull==="function") ? await nbLoadCameoFull(c.id) : null; }catch(e){} }
      if(alive) setFull(out);
    })();
    return ()=>{alive=false;};
  },[list.map(c=>c.id).join(",")]);

  const revoke = async (id)=>{
    const ok = await window.appConfirm({
      title: "Revoke this cameo?",
      body: "The likeness is deleted from this device"+( (list.find(c=>c.id===id)||{}).sync ? " and the cloud":"" )+", and future generations won't be face-locked to it.",
      confirmLabel: "Revoke", danger: true,
    });
    if(!ok) return;
    if(typeof nbClearCameo==="function") await nbClearCameo(id);
    refresh();
  };
  const toggleSync = async (id)=>{
    const rec = full[id]; if(!rec) return;
    if(typeof nbSetCameo==="function") await nbSetCameo(id, { ...rec, sync: !rec.sync });
    refresh();
  };
  const cloudReady = (typeof nbBackend==="function" && nbBackend()==="cloud");
  const stop=(e)=>e.stopPropagation();

  return React.createElement("div",{className:"cameo-overlay",onClick:onClose},
    React.createElement("div",{className:"cameo-modal mgr",onClick:stop},
      React.createElement("div",{className:"cameo-head"},
        React.createElement("div",null,
          React.createElement("div",{className:"cameo-title"},React.createElement(Icon.userScan,{s:16})," Cameo manager"),
          React.createElement("div",{className:"cameo-sub"},list.length+" locked likeness"+(list.length!==1?"es":"")+" \u00b7 biometric data, stored privately")),
        React.createElement("button",{className:"cameo-x",onClick:onClose,"aria-label":"Close"},React.createElement(Icon.x,{s:16}))),
      React.createElement("div",{className:"cameo-mgr-body"},
        list.length===0
          ? React.createElement("div",{className:"cameo-mgr-empty"},
              React.createElement(Icon.userScan,{s:24}),
              React.createElement("div",null,"No cameos yet. On any character card, click ",
                React.createElement("b",null,"Cast")," to capture and lock a face."))
          : list.map(c=>{
              const rec = full[c.id];
              const angles = (rec&&rec.angles)||[];
              return React.createElement("div",{key:c.id,className:"cameo-mgr-row"},
                React.createElement("div",{className:"cameo-mgr-thumbs"},
                  angles.length ? angles.slice(0,3).map((a,i)=>
                    React.createElement("img",{key:i,src:a.url,alt:a.label,title:a.label}))
                  : React.createElement("div",{className:"cameo-mgr-noimg"},React.createElement(Icon.userScan,{s:16}))),
                React.createElement("div",{className:"cameo-mgr-meta"},
                  React.createElement("div",{className:"cameo-mgr-name"},nameOf?nameOf(c.id):c.id),
                  React.createElement("div",{className:"cameo-mgr-prov"},
                    (c.subject?("\u201c"+c.subject+"\u201d \u00b7 "):"")
                    +(c.angleCount||angles.length||1)+" angle"+(((c.angleCount||1)!==1)?"s":"")
                    +" \u00b7 "+(c.source||"webcam")+" \u00b7 "+(c.date||"")),
                  React.createElement("div",{className:"cameo-mgr-store"},
                    React.createElement("span",{className:"cameo-store-pill "+(c.sync?"cloud":"local")},
                      React.createElement(Icon[c.sync?"globe":"check"],{s:9,sw:2}),
                      c.sync?"Synced to cloud":"On this device only"))),
                React.createElement("div",{className:"cameo-mgr-acts"},
                  cloudReady && React.createElement("button",{className:"cameo-mgr-btn",onClick:()=>toggleSync(c.id),
                    title:c.sync?"Stop syncing \u2014 keep on this device only":"Sync to cloud for cross-device use"},
                    c.sync?"Unsync":"Sync"),
                  React.createElement("button",{className:"cameo-mgr-btn danger",onClick:()=>revoke(c.id)},"Revoke")));
            }))));
}
window.CameoManager = CameoManager;
