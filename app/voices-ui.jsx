/* voices-ui.jsx — the Voices tab (Art Room), Phase 1 of the audio-first Stage.
   Each speaking character gets a LOCKED voice the way Cameo locks a face: designed
   from the bible, picked from the library, or cloned (consent-gated). Locking writes
   `voiceLock` (a voiceId + settings) onto the character via onUpdate. Generation runs
   through voicegen.jsx → the server proxy, so no ElevenLabs key is in the browser.
   See docs/Voice & Lip-Sync (Seedance) Plan.md §8A. */

const _vcEl = React.createElement;

// one shared <audio> so auditions don't overlap
let _vcAudio = null;
function vcPlay(url){ try{ if(_vcAudio) _vcAudio.pause(); if(!url) return; _vcAudio = new Audio(url); _vcAudio.play().catch(()=>{}); }catch(e){} }

// parse the canonical "FUNCTION · ARCHETYPE — IDENTITY" role string
function vcParseRole(role){
  const r = String(role||"");
  let identity="", head=r;
  const dash = r.split(/\s[—-]\s/);
  if(dash.length>1){ identity = dash.slice(1).join(" ").trim(); head = dash[0]; }
  const dot = head.split(/\s·\s/);
  return { fn:(dot[0]||"").trim(), archetype:(dot[1]||"").trim(), identity };
}

/* origin/heritage read from the identity text — capitalized (possibly hyphenated)
   descriptors like "Turkish-Kurdish minicab driver" or "Glaswegian fixer" become the
   accent ElevenLabs actually needs NAMED (ethnic/biographical facts alone produce a
   generic neutral voice — the model doesn't infer accent from backstory). */
function vcOriginFrom(text, charName){
  const nameWords = new Set(String(charName||"").toUpperCase().split(/\s+/));
  for(const w of String(text||"").split(/\s+/)){
    const clean = w.replace(/[^A-Za-z-]/g,"");
    if(!clean || clean.length<4 || nameWords.has(clean.toUpperCase())) continue;
    const parts = clean.split("-");
    if(parts.length && parts.every(p=>/^[A-Z][a-z]{2,}$/.test(p))) return clean;
  }
  return "";
}

// a non-empty, editable VOICE descriptor built deterministically from the bible
// (no AI call) — every clause describes SOUND (age/gender → explicit accent →
// pitch/timbre → pacing/delivery → quirks → audio quality); biography words are
// dropped because they don't change the voice. The character's authored VOICE
// BLOCK (c.voice = { accent, pitch, pace, quirks } — written at spine build and
// enriched by Script Breakdown) wins over every heuristic. User refines before
// designing.
function buildVoiceSpec(c){
  const role = vcParseRole(c.role);
  const pron = c.pronouns||"";
  const gender = pron==="she/her" ? "female" : pron==="he/him" ? "male" : "";
  const phys = c.physique||{};
  const age = phys.age || phys.ageRange || phys.ageBand || "";
  const fn = (role.fn||"").toLowerCase();
  const vb = c.voice || {};
  // role-based delivery is only the FALLBACK when the voice block has no pitch/pace
  let pitch = String(vb.pitch||"").trim(), pace = String(vb.pace||"").trim();
  if(!pitch || !pace){
    let dPitch = "medium pitch, natural grounded timbre", dPace = "even, unhurried pacing";
    if(/antagonist|villain|rival/.test(fn)){ dPitch="low pitch, controlled and quiet with a cold edge"; dPace="deliberate pacing"; }
    else if(/protagonist|hero|lead/.test(fn)){ dPitch="low-medium pitch, warm, clear and expressive"; dPace="measured pacing"; }
    else if(/mentor|guide/.test(fn)){ dPitch="low pitch, weathered and reassuring"; dPace="slow, patient pacing"; }
    else if(/comic|wildcard/.test(fn)){ dPitch="lighter pitch, bright and quick"; dPace="playful pacing"; }
    if(!pitch) pitch = dPitch;
    if(!pace) pace = dPace;
  } else {
    if(!/pitch|timbre|voice/i.test(pitch)) pitch = pitch+" pitch";
    if(!/pac|rhythm|tempo/i.test(pace)) pace = pace+" pacing";
  }
  // accent priority: authored voice block → legacy voiceAccent → identity heuristic
  const origin = String(vb.accent||"").trim() || String(c.voiceAccent||"").trim() || vcOriginFrom(role.identity, c.name);
  const accent = origin
    ? (/\baccent|dialect|speaks\b/i.test(origin) ? origin : ("speaks English with a noticeable "+origin+" accent"))
    : "";
  const quirks = String(vb.quirks||"").trim();
  return [
    [age, gender, "voice"].filter(Boolean).join(" "),
    accent,
    pitch+"; "+pace,
    quirks,
    "clear studio-quality recording"
  ].filter(Boolean).join("; ")+".";
}

// who actually needs a voice — characters in-frame on any shot that has dialogue;
// falls back to scene drivers when no shots/dialogue exist yet
function speakingCharIds(characters, scenes, shots){
  const set = new Set();
  const byScene = {}; (shots||[]).forEach(sh=>{ (byScene[sh.sceneId]=byScene[sh.sceneId]||[]).push(sh); });
  (scenes||[]).forEach(scene=>{
    (byScene[scene.id]||[]).forEach(sh=>{
      if(!String(sh.dialogue||"").trim()) return;
      const ids = (typeof inFrameCast==="function") ? inFrameCast(sh, scene, characters||[]) : (sh.subjects||[]);
      (ids||[]).forEach(id=>set.add(id));
    });
  });
  if(!set.size) (scenes||[]).forEach(s=>{ if(s.driver) set.add(s.driver); });
  return set;
}
window.speakingCharIds = speakingCharIds;

const VC_SRC_LABEL = { designed:"Designed", library:"Library", cloned:"Cloned" };

function VoiceCard({ c, project, speaks, onUpdate }){
  const lock = c.voiceLock && c.voiceLock.voiceId ? c.voiceLock : null;
  const [spec, setSpec] = React.useState(()=> c.voiceSpec || buildVoiceSpec(c));
  // per-character DELIVERY model — how locked lines are rendered (v3 expressive default /
  // v2 classic). An EXPLICIT pick (modelChosen) pins the character; otherwise the lock
  // follows the app default, so old locks upgraded to v3 automatically.
  const effModel = (typeof window.vgDeliveryModelOf==="function") ? window.vgDeliveryModelOf(lock) : ((lock&&lock.modelId) || window.VG_TTS_MODEL || "eleven_v3");
  const [ttsModel, setTtsModel] = React.useState(effModel);
  const [deliveryChosen, setDeliveryChosen] = React.useState(false);
  const ttsModels = window.VG_TTS_MODELS || [{ id:"eleven_v3", label:"Expressive (v3)" }];
  const changeDelivery = (v)=>{
    setTtsModel(v); setDeliveryChosen(true);
    if(lock){
      onUpdate(c.id, { voiceLock:{ ...lock, modelId:v, modelChosen:true } });
      if(typeof window.appToast==="function"){
        const m = ttsModels.find(x=>x.id===v);
        window.appToast("Delivery model set to "+((m&&m.label)||v)+" — new line renders use it (already-voiced lines keep their audio until re-voiced).","ok");
      }
    }
  };
  const [mode, setMode] = React.useState("design");       // design | library | clone
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [previews, setPreviews] = React.useState([]);     // design previews
  const [library, setLibrary] = React.useState([]);       // library voices
  const [samples, setSamples] = React.useState([]);       // clone: data URLs
  const [consent, setConsent] = React.useState(false);
  const ready = (typeof voiceProxyReady==="function") && voiceProxyReady();

  const initials = (c.name||"?").split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const roleSummary = (c.role||"").split(/\s[—-]\s/)[0] || "Character";

  const lockVoice = (voiceId, voiceName, source)=>{
    onUpdate(c.id, { voiceSpec: spec, voiceLock: {
      voiceId, voiceName: voiceName||spec.slice(0,40), source,
      modelId: ttsModel || (window.VG_TTS_MODEL||"eleven_v3"),
      modelChosen: deliveryChosen,   // only an explicit pick pins the model; else follow the app default
      defaults: window.VG_DEFAULTS || { stability:0.7, similarity:0.75, style:0.1, speed:1.0, speakerBoost:true },
      consent: source==="cloned", sync:false,
    }});
    setPreviews([]); setLibrary([]); setErr("");
  };

  const design = async ()=>{
    if(busy) return; setBusy(true); setErr(""); setPreviews([]);
    try{ const ps = await window.elDesignVoice(spec); setPreviews(ps||[]);
      if(!ps || !ps.length) setErr("No previews came back — tweak the description and try again.");
    }catch(e){ setErr(String((e&&e.message)||"Couldn't design a voice.")); }
    setBusy(false);
  };
  const lockPreview = async (p)=>{
    if(busy) return; setBusy(true); setErr("");
    try{ const r = await window.elSaveVoice(p.generatedVoiceId, { name:c.name, description:spec }); lockVoice(r.voiceId, r.name, "designed"); }
    catch(e){ setErr(String((e&&e.message)||"Couldn't lock that voice.")); }
    setBusy(false);
  };
  const browse = async ()=>{
    if(busy) return; setBusy(true); setErr(""); setLibrary([]);
    try{ const vs = await window.elListVoices(); setLibrary(vs||[]); if(!vs||!vs.length) setErr("No library voices on this account yet."); }
    catch(e){ setErr(String((e&&e.message)||"Couldn't load the library.")); }
    setBusy(false);
  };
  const onFiles = (e)=>{
    const files = Array.from(e.target.files||[]);
    Promise.all(files.map(f=> new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>res(""); r.readAsDataURL(f); })))
      .then(urls=> setSamples(urls.filter(Boolean)));
  };
  const clone = async ()=>{
    if(busy || !consent || !samples.length) return; setBusy(true); setErr("");
    try{ const r = await window.elCloneVoice(samples, { name:c.name, description:spec }); lockVoice(r.voiceId, r.name, "cloned"); setSamples([]); }
    catch(e){ setErr(String((e&&e.message)||"Cloning failed.")); }
    setBusy(false);
  };
  const test = async ()=>{
    if(busy || !lock) return; setBusy(true); setErr("");
    try{ const r = await window.elGenerate("voice-test-"+c.id, "This is how I sound in every scene.", { voiceId:lock.voiceId, settings:lock.defaults, modelId:effModel, force:true }); vcPlay(r.audioUrl); }
    catch(e){ setErr(String((e&&e.message)||"Couldn't render a test line.")); }
    setBusy(false);
  };

  return _vcEl("div",{className:"vc-card"+(lock?" locked":"")+(speaks?"":" silent")},
    _vcEl("div",{className:"vc-head"},
      _vcEl("span",{className:"vc-av",style:{background:c.color||"var(--bg-4)"}}, initials),
      _vcEl("div",{className:"vc-id"},
        _vcEl("div",{className:"vc-name"}, c.name||"Character"),
        _vcEl("div",{className:"vc-role"}, roleSummary)),
      speaks ? _vcEl("span",{className:"vc-tag speaks"},"Speaks")
             : _vcEl("span",{className:"vc-tag"},"No dialogue")),

    lock
      ? _vcEl("div",{className:"vc-locked"},
          _vcEl("div",{className:"vc-locked-row"},
            _vcEl(Icon.check,{s:14}),
            _vcEl("span",{className:"vc-locked-name"}, lock.voiceName||"Voice"),
            _vcEl("span",{className:"vc-src"}, VC_SRC_LABEL[lock.source]||lock.source)),
          _vcEl("div",{className:"vc-field"},
            _vcEl("div",{className:"vc-lab"},"Delivery model"),
            _vcEl("select",{className:"vc-delivery",value:effModel,
              title:"How this locked voice renders its lines — switching applies to NEW renders; already-voiced lines keep their audio until re-voiced",
              onChange:e=>changeDelivery(e.target.value)},
              ttsModels.map(m=>_vcEl("option",{key:m.id,value:m.id,title:m.note},m.label+(m.note?(" — "+m.note):""))))),
          _vcEl("div",{className:"vc-actions"},
            _vcEl("button",{className:"vc-btn",onClick:test,disabled:busy||!ready,title:ready?"Render a test line":"Needs the server proxy"},
              _vcEl(Icon.sparkles,{s:13}), busy?"…":"Test line"),
            _vcEl("button",{className:"vc-btn ghost",onClick:()=>onUpdate(c.id,{ voiceLock:null })},"Remove")),
          err && _vcEl("div",{className:"vc-err"}, err))

      : _vcEl("div",{className:"vc-body"},
          !ready && _vcEl("div",{className:"vc-note"},
            _vcEl(Icon.alert,{s:12}),
            _vcEl("span",null,"Voice runs on your server — deploy the media proxy and set the ElevenLabs key to design and lock voices.")),
          _vcEl("div",{className:"vc-modes"},
            ["design","library","clone"].map(m=> _vcEl("button",{key:m,className:"vc-mode"+(mode===m?" on":""),onClick:()=>{ setMode(m); setErr(""); }},
              m==="design"?"Design":m==="library"?"Library":"Clone"))),

          mode!=="library" && _vcEl("div",{className:"vc-field"},
            _vcEl("div",{className:"vc-lab"},"Voice description",
              _vcEl("button",{className:"vc-rebuild",type:"button",
                title:"Rebuild this description from the character's bible (age, role, derived accent)",
                onClick:()=>{
                  const built = buildVoiceSpec(c);
                  const changed = built !== spec;
                  setSpec(built);
                  if(typeof window.appToast==="function")
                    window.appToast(changed
                      ? "Voice description rebuilt from "+(c.name||"the character")+"'s bible."
                      : "Already matches "+(c.name||"the character")+"'s bible — nothing to change.", "ok");
                }},"↺ From character")),
            _vcEl("textarea",{className:"ns-input vc-spec",value:spec,rows:3,
              onChange:e=>setSpec(e.target.value),
              placeholder:"40s male voice; speaks English with a noticeable Turkish accent; low-medium pitch, warm and slightly gravelly; measured pacing; clear studio-quality recording"}),
            // ElevenLabs won't infer accent from backstory — it must be NAMED, or the
            // voice comes out generic. Soft nudge, never a block.
            mode==="design" && spec.trim() && !/\baccent|dialect\b/i.test(spec) && _vcEl("div",{className:"vc-note vc-accent-note"},
              _vcEl(Icon.alert,{s:12}),
              _vcEl("span",null,"No accent named — describe it explicitly (e.g. “speaks English with a slight Turkish accent”) or the voice will sound generic. Backstory words like a job or heritage don’t change the sound."))),
          mode!=="library" && _vcEl("div",{className:"vc-field"},
            _vcEl("div",{className:"vc-lab"},"Delivery model"),
            _vcEl("select",{className:"vc-delivery",value:ttsModel,
              title:"How the locked voice will render its lines — saved with the lock",
              onChange:e=>changeDelivery(e.target.value)},
              ttsModels.map(m=>_vcEl("option",{key:m.id,value:m.id,title:m.note},m.label+(m.note?(" — "+m.note):""))))),

          mode==="design" && _vcEl(React.Fragment,null,
            _vcEl("button",{className:"vc-btn primary",onClick:design,disabled:busy||!ready||!spec.trim()},
              busy?_vcEl(React.Fragment,null,_vcEl("span",{className:"ns-spin"}),"Designing…"):_vcEl(React.Fragment,null,_vcEl(Icon.sparkles,{s:14}),"Design voices")),
            previews.length>0 && _vcEl("div",{className:"vc-previews"},
              previews.map((p,i)=> _vcEl("div",{key:p.generatedVoiceId||i,className:"vc-preview"},
                _vcEl("button",{className:"vc-play",onClick:()=>vcPlay(p.audioUrl),title:"Play"}, _vcEl(Icon.sparkles,{s:13})),
                _vcEl("span",{className:"vc-preview-lab"},"Option "+(i+1)),
                _vcEl("button",{className:"vc-btn",onClick:()=>lockPreview(p),disabled:busy},"Lock this"))))),

          mode==="library" && _vcEl(React.Fragment,null,
            _vcEl("button",{className:"vc-btn primary",onClick:browse,disabled:busy||!ready},
              busy?"Loading…":"Browse library"),
            library.length>0 && _vcEl("div",{className:"vc-previews"},
              library.slice(0,12).map(v=> _vcEl("div",{key:v.voiceId,className:"vc-preview"},
                v.previewUrl && _vcEl("button",{className:"vc-play",onClick:()=>vcPlay(v.previewUrl),title:"Play"}, _vcEl(Icon.sparkles,{s:13})),
                _vcEl("span",{className:"vc-preview-lab"}, v.name||v.voiceId),
                _vcEl("button",{className:"vc-btn",onClick:()=>lockVoice(v.voiceId, v.name, "library"),disabled:busy},"Lock"))))),

          mode==="clone" && _vcEl(React.Fragment,null,
            _vcEl("label",{className:"vc-upload"},
              _vcEl(Icon.plus,{s:13}), samples.length?(samples.length+" sample"+(samples.length>1?"s":"")+" ready"):"Add voice samples",
              _vcEl("input",{type:"file",accept:"audio/*",multiple:true,onChange:onFiles,style:{display:"none"}})),
            _vcEl("label",{className:"vc-consent"},
              _vcEl("input",{type:"checkbox",checked:consent,onChange:e=>setConsent(e.target.checked)}),
              _vcEl("span",null,"This is my voice or I have the speaker's permission to clone it.")),
            _vcEl("button",{className:"vc-btn primary",onClick:clone,disabled:busy||!ready||!consent||!samples.length},
              busy?"Cloning…":"Clone & lock")),

          err && _vcEl("div",{className:"vc-err"}, err)));
}

/* VoiceModal — voice-locking now lives ON the character card (parallel to Cameo). This
   hosts the existing VoiceCard in a centered popup; VoiceCard carries its own header +
   the full design / library / clone / test / remove flow, writing voiceLock + voiceSpec
   via onUpdate(c.id, …). Reuses the shared lb-overlay/dt-panel modal chrome. */
function VoiceModal({ character, project, speaks, onUpdate, onClose }){
  return _vcEl("div",{className:"lb-overlay dt-overlay",
    onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose&&onClose(); }},
    _vcEl("div",{className:"dt-panel voice-modal"},
      _vcEl("button",{className:"ag-x voice-modal-x",onClick:onClose,title:"Close"}, _vcEl(Icon.x,{s:17})),
      _vcEl("div",{className:"dt-scroll voice-modal-scroll"},
        _vcEl(VoiceCard,{c:character,project,speaks,onUpdate}))));
}
window.VoiceModal = VoiceModal;
