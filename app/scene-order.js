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

window.compareSceneOrder = compareSceneOrder;
window.scenesInStoryOrder = scenesInStoryOrder;