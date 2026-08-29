/* One screenplay-order rule for every room and generation context.
   Scene numbers may arrive as numbers, numeric strings, or production-style
   alphanumerics (12A). Numbered scenes sort naturally; equal and unnumbered
   entries keep their input order because modern Array#sort is stable. */
function compareSceneOrder(a, b){
  const av = a && a.no != null ? String(a.no).trim() : "";
  const bv = b && b.no != null ? String(b.no).trim() : "";
  if(!av && !bv) return 0;
  if(!av) return 1;
  if(!bv) return -1;
  return av.localeCompare(bv, undefined, { numeric:true, sensitivity:"base" });
}

function scenesInStoryOrder(scenes){
  return (Array.isArray(scenes) ? scenes : []).slice().sort(compareSceneOrder);
}

/* Small deterministic hashes used as source-revision stamps. They are deliberately
   content-derived: old documents need no migration transaction, and undoing content
   returns to the same revision instead of manufacturing a new lineage. */
function storyRevisionOf(value){
  const s = JSON.stringify(value==null ? null : value);
  let h=2166136261;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0).toString(36);
}
function screenplayBeatRevision(draft, beatN){
  const blocks = ((draft&&draft.blocks)||[]).filter(b=>Number(b&&b.beat)===Number(beatN))
    .map(b=>({type:b.type||"",text:String(b.text||"")}));
  return storyRevisionOf(blocks);
}
const SHOT_SPEC_FIELDS = ["beatN","size","angle","move","lens","composition","subjects","props",
  "action","dialogue","purpose","covers","beatPlan","locationId","locationSide","priority",
  "referenceLocationsSet","referenceLocationIds","referenceCharactersSet","referenceCharacterIds",
  "negativePrompt","directives","camera","cameraHeight","cameraRoll","focus","aperture","shutter",
  "focalDistance","movementSpeed"];
function shotSpecFingerprint(shot){
  const spec={}; SHOT_SPEC_FIELDS.forEach(k=>{ if(shot&&shot[k]!==undefined) spec[k]=shot[k]; });
  return storyRevisionOf(spec);
}
function shotSpecRevision(shot){ return Math.max(1,Math.round(Number(shot&&shot.specRev))||1); }
function shotSourceStamp(shot,draft){
  return { shotId:shot&&shot.id||"", specRev:shotSpecRevision(shot),
    specHash:shotSpecFingerprint(shot), screenplayRev:screenplayBeatRevision(draft,shot&&shot.beatN) };
}
function shotAssetProvenanceStatus(shot,draft,meta){
  if(!meta || !meta.shotSource) return "unverified";
  const cur=shotSourceStamp(shot,draft), old=meta.shotSource;
  return old.shotId===cur.shotId && Number(old.specRev)===cur.specRev
    && old.specHash===cur.specHash && old.screenplayRev===cur.screenplayRev ? "current" : "stale";
}
function shotSourcesStatus(shots,drafts,meta){
  const saved=meta&&meta.shotSources;
  if(!Array.isArray(saved)||!saved.length) return "unverified";
  const current=(shots||[]).map(sh=>shotSourceStamp(sh,(drafts||{})[sh.sceneId]));
  if(saved.length!==current.length) return "stale";
  return current.every((cur,i)=>{
    const old=saved[i]||{};
    return old.shotId===cur.shotId && Number(old.specRev)===cur.specRev
      && old.specHash===cur.specHash && old.screenplayRev===cur.screenplayRev;
  }) ? "current" : "stale";
}
function shotSourcesSnapshot(shots,drafts){
  return (shots||[]).map(sh=>shotSourceStamp(sh,(drafts||{})[sh.sceneId]));
}
function shotSourcesOverrideCurrent(shots,drafts,meta){
  const saved=meta&&meta.sourceOverride;
  if(!Array.isArray(saved)||!saved.length) return false;
  const current=shotSourcesSnapshot(shots,drafts);
  if(saved.length!==current.length) return false;
  return current.every((cur,i)=>{
    const old=saved[i]||{};
    return old.shotId===cur.shotId && Number(old.specRev)===cur.specRev
      && old.specHash===cur.specHash && old.screenplayRev===cur.screenplayRev;
  });
}
function shotSourcesEditorialStatus(shots,drafts,meta){
  const base=shotSourcesStatus(shots,drafts,meta);
  return base==="current" ? "current"
    : shotSourcesOverrideCurrent(shots,drafts,meta) ? "override" : base;
}
function shotSourcesFromMeta(allShots,meta){
  const saved=(meta&&meta.shotSources)||[];
  const byId={}; (allShots||[]).forEach(sh=>{ if(sh&&sh.id) byId[sh.id]=sh; });
  return saved.map(s=>byId[s&&s.shotId]).filter(Boolean);
}
function shotSourceOverrideCurrent(shot,draft){
  const old=shot&&shot.sourceOverride, cur=shotSourceStamp(shot,draft);
  return !!(old && old.shotId===cur.shotId && Number(old.specRev)===cur.specRev
    && old.specHash===cur.specHash && old.screenplayRev===cur.screenplayRev);
}

function beatRowId(sceneId,row,index){
  if(row&&row.id) return row.id;
  const seed=[sceneId||"scene",index,String(row&&row.drive&&row.drive.a||""),
    String(row&&row.drive&&row.drive.d||""),String(row&&row.react&&row.react.d||"")];
  return "beat-"+String(sceneId||"scene")+"-"+storyRevisionOf(seed);
}
function withBeatIdentity(map,sceneId){
  if(!map || !Array.isArray(map.rows)) return map;
  const rows=map.rows.map((r,i)=>({...r,id:beatRowId(sceneId,r,i),n:i+1}));
  const legacyN=Math.max(0,Math.round(Number(map.turnAt))||0);
  const hasIdentity=Object.prototype.hasOwnProperty.call(map,"turnBeatId");
  const turnBeatId=hasIdentity ? (map.turnBeatId||"") : ((rows[legacyN-1]&&rows[legacyN-1].id)||"");
  const turnAt=turnBeatId ? Math.max(0,rows.findIndex(r=>r.id===turnBeatId)+1) : 0;
  return {...map,rows,turnBeatId:turnAt?turnBeatId:"",turnAt};
}
function withBeatMapIdentity(beatsMap){
  const out={}; Object.keys(beatsMap||{}).forEach(sceneId=>{ out[sceneId]=withBeatIdentity(beatsMap[sceneId],sceneId); });
  return out;
}

window.compareSceneOrder = compareSceneOrder;
window.scenesInStoryOrder = scenesInStoryOrder;
window.storyRevisionOf = storyRevisionOf;
window.screenplayBeatRevision = screenplayBeatRevision;
window.shotSpecFingerprint = shotSpecFingerprint;
window.shotSpecRevision = shotSpecRevision;
window.shotSourceStamp = shotSourceStamp;
window.shotAssetProvenanceStatus = shotAssetProvenanceStatus;
window.shotSourcesStatus = shotSourcesStatus;
window.shotSourcesSnapshot = shotSourcesSnapshot;
window.shotSourcesOverrideCurrent = shotSourcesOverrideCurrent;
window.shotSourcesEditorialStatus = shotSourcesEditorialStatus;
window.shotSourcesFromMeta = shotSourcesFromMeta;
window.shotSourceOverrideCurrent = shotSourceOverrideCurrent;
window.beatRowId = beatRowId;
window.withBeatIdentity = withBeatIdentity;
window.withBeatMapIdentity = withBeatMapIdentity;
