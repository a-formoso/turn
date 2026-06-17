/* spine.jsx — value-charge graph + act ruler + scene filmstrip */

const COL_W = 138, GAP = 6, GRAPH_H = 300, PAD_T = 28, PAD_B = 30;

/* shared turn logic — used by canvas, inspector, Audit and the agents.
   The RULE lives in the project's narrative FRAMEWORK (app/frameworks.jsx);
   three-act's registry entry is this classic rule, frozen. Signature unchanged
   so every call site keeps working; the inline body is the safety fallback. */
function turnInfo(sc){
  if(typeof fwAuditOf==="function"){ try{ return fwAuditOf().rule(sc); }catch(e){} }
  const o = Math.sign(sc.openCharge), c = Math.sign(sc.closeCharge);
  const turned = (o !== c) || Math.abs(sc.closeCharge - sc.openCharge) >= 2;
  const exempt = sc.kind === "resolution";
  return { turned, flagged: !turned && !exempt, exempt };
}
function chargeClass(v){ return v > 0 ? "pos" : v < 0 ? "neg" : "zero"; }
function chargeStr(v){ return v > 0 ? `+${v}` : `${v}`; }
window.turnInfo = turnInfo;
window.chargeClass = chargeClass;
window.chargeStr = chargeStr;

/* which side of the controlling idea a scene argues — explicit override on the
   scene (scene.argues) or derived from its closing charge: a positive close
   asserts the idea, a negative close asserts the counter-idea. */
function themeArgues(sc){
  if(sc.argues==="idea"||sc.argues==="counter"||sc.argues==="neither")
    return { side:sc.argues, explicit:true };
  const c = Math.sign(sc.closeCharge);
  return { side: c>0?"idea":c<0?"counter":"neither", explicit:false };
}
window.themeArgues = themeArgues;

/* ---- runtime estimation — 1 screenplay page ≈ 55 lines ≈ 60 seconds ----
   Drafted scenes are estimated from their actual blocks (action wraps ~12 words
   a line, dialogue ~7 in its narrow column); undrafted scenes fall back to a
   rough figure from their beat count and are marked approx (~). */
function sceneRuntime(scene, draft, beats){
  const blocks = draft && draft.blocks;
  if(blocks && blocks.length){
    let lines = 0;
    blocks.forEach(b=>{
      const w = (b.text||"").trim().split(/\s+/).filter(Boolean).length;
      if(b.type==="scene") lines += 2;
      else if(b.type==="action") lines += Math.ceil(w/12)+1;
      else if(b.type==="char") lines += 2;
      else if(b.type==="paren") lines += 1;
      else if(b.type==="dia") lines += Math.ceil(w/7);
      else lines += 2; // transitions and anything else
    });
    return { sec: Math.max(20, Math.round(lines/55*60)), approx:false };
  }
  const rows = (beats && beats.rows) ? beats.rows.length : 0;
  if(rows) return { sec: Math.min(240, Math.max(45, rows*35)), approx:true };
  return { sec: 90, approx:true };
}
function fmtClock(sec){ const m = Math.floor(sec/60), s = Math.round(sec%60); return m+":"+String(s).padStart(2,"0"); }
window.sceneRuntime = sceneRuntime;
window.fmtClock = fmtClock;

/* Milestone-kind labels. The CANONICAL vocabulary lives in the project's
   narrative framework (frameworks.jsx `kinds`); this Proxy keeps every existing
   `KIND_LABEL[kind]` lookup working while routing through it (three-act maps to
   exactly these classic labels). */
const KIND_LABEL_3ACT = {
  incite:"Inciting Incident", "act-climax":"Act Climax", midpoint:"Mid-Act Climax",
  crisis:"Crisis", "story-climax":"Story Climax", resolution:"Resolution",
};
const KIND_LABEL = new Proxy(KIND_LABEL_3ACT, {
  get:(base, k)=> (typeof fwKindLabel==="function") ? (fwKindLabel(k) ?? base[k]) : base[k],
});

function ChargeChip({ value, label }){
  return React.createElement("span",{className:`chip ${chargeClass(value)}`},
    label && React.createElement("span",{style:{opacity:.7,fontWeight:500}},label),
    chargeStr(value));
}
window.ChargeChip = ChargeChip;

/* ---- character throughline (the "follow this character" lens) ----
   Derived ONLY from data the spine already owns (scenes + beatsMap), so it can
   never drift from the story: drives = scene.driver; appears = named as the
   beats' driver/reactor or in the summary; arc turns = the charge of consecutive
   DRIVEN scenes flips sign or jumps >= 2 (same threshold as turnInfo). */
function charSolidColor(c){
  const m = /#[0-9a-fA-F]{3,8}/.exec((c && c.color) || "");
  return m ? m[0] : "#8d8a84";
}
function characterThroughline(char, scenes, beatsMap){
  const first = (((char && char.name) || "").trim().toLowerCase().split(/\s+/)[0]) || "";
  const driven = scenes.filter(s => s.driver === char.id);
  const involvedIds = new Set(driven.map(s => s.id));
  scenes.forEach(s => {
    if(involvedIds.has(s.id)) return;
    const b = (beatsMap && beatsMap[s.id]) || {};
    const hay = [b.driverLabel, b.reactorLabel, s.summary].filter(Boolean).join(" ").toLowerCase();
    if(first && hay.includes(first)) involvedIds.add(s.id);
  });
  const turnIds = new Set(); const turnsByAct = {1:0, 2:0, 3:0};
  driven.forEach((s, i) => {
    const prev = i ? driven[i-1].closeCharge : s.openCharge;
    const turned = Math.sign(prev) !== Math.sign(s.closeCharge) || Math.abs(s.closeCharge - prev) >= 2;
    if(turned){ turnIds.add(s.id); turnsByAct[s.act] = (turnsByAct[s.act]||0) + 1; }
  });
  // verdict — names the classic failure: a character who turns early then coasts
  const total = turnIds.size;
  let verdict, flat = false;
  if(!driven.length){ verdict = "Drives no scenes yet — set them as a scene’s driver and their arc appears here."; flat = true; }
  else if(!total){ verdict = "Arc is flat — none of their driven scenes move their value."; flat = true; }
  else {
    const lastTurnIdx = driven.reduce((acc, s, i) => turnIds.has(s.id) ? i : acc, -1);
    const coastAfter = driven.length - 1 - lastTurnIdx;
    if(turnsByAct[1] >= 2 && !turnsByAct[2] && !turnsByAct[3]){
      verdict = `All the movement is in Act I (×${turnsByAct[1]}) — the arc coasts from there.`; flat = true;
    } else if(coastAfter >= 3){
      verdict = `Turns ${total}×, then coasts — the last ${coastAfter} scenes they drive don’t move them.`; flat = true;
    } else {
      verdict = `Arc turns ${total}× · Act I ×${turnsByAct[1]} · II ×${turnsByAct[2]} · III ×${turnsByAct[3]}.`;
    }
  }
  return { driven, involvedIds, turnIds, turnsByAct, verdict, flat };
}
window.characterThroughline = characterThroughline;
window.charSolidColor = charSolidColor;

/* chip-per-character strip above the spine graph — click to follow / unfollow */
function FollowStrip({ characters, scenes, beatsMap, followId, onFollow }){
  if(!characters || !characters.length) return null;
  const cur = followId ? characters.find(c => c.id === followId) : null;
  const tl = cur ? characterThroughline(cur, scenes, beatsMap) : null;
  return React.createElement("div",{className:"follow-strip"},
    React.createElement("div",{className:"follow-row"},
      React.createElement("span",{className:"eyebrow",style:{marginRight:2}},
        React.createElement(Icon.user,{s:12}),"Follow"),
      characters.map(c => {
        const on = followId === c.id;
        const driven = scenes.filter(s => s.driver === c.id).length;
        return React.createElement("button",{key:c.id,
          className:"follow-chip"+(on?" on":""),
          style: on ? {borderColor:charSolidColor(c)} : null,
          title: on ? "Stop following" : `Follow ${c.name} across the spine`,
          onClick:()=>onFollow(on ? null : c.id)},
          React.createElement("span",{className:"follow-av",style:{background:c.color}}),
          React.createElement("span",{className:"follow-name"},c.name),
          React.createElement("span",{className:"follow-n"},driven));
      })),
    cur && React.createElement("div",{className:"follow-insight"+(tl.flat?" warn":"")},
      tl.flat ? React.createElement(Icon.alert,{s:12}) : React.createElement(Icon.check,{s:12}),
      React.createElement("span",null,tl.verdict),
      React.createElement("span",{className:"follow-key"},
        React.createElement("span",{className:"follow-key-dot",style:{borderColor:charSolidColor(cur)}}),"drives",
        React.createElement("span",{className:"follow-key-dot dash",style:{borderColor:charSolidColor(cur)}}),"arc turns")));
}
window.FollowStrip = FollowStrip;

/* catmull-rom smoothing shared by the base spine and the follow overlay */
function smoothD(pts){
  if(pts.length < 2) return pts.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for(let i=0;i<pts.length-1;i++){
    const p0 = pts[i-1]||pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2]||p2;
    const c1x = p1.x + (p2.x - p0.x)/6, c1y = p1.y + (p2.y - p0.y)/6;
    const c2x = p2.x - (p3.x - p1.x)/6, c2y = p2.y - (p3.y - p1.y)/6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function SpineCanvas({ scenes, selId, onSelect, showFramework, onReorder, onAddScene, follow, runtimes }){
  // minutes per act, for the ruler's pacing readout
  const actMin = (act)=>{
    if(!runtimes) return null;
    const sec = scenes.filter(s=>s.act===act).reduce((a,s)=> a + ((runtimes[s.id]||{}).sec||0), 0);
    return sec ? Math.round(sec/60) : null;
  };
  const [dragIdx, setDragIdx] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);
  // per-act fold state (persisted) — collapse an act to a narrow band to focus the arc
  const [collapsed, setCollapsed] = React.useState(()=>{ try{ return JSON.parse(localStorage.getItem("turn_spine_collapsed")||"{}")||{}; }catch(e){ return {}; } });
  React.useEffect(()=>{ try{ localStorage.setItem("turn_spine_collapsed", JSON.stringify(collapsed)); }catch(e){} },[collapsed]);
  const toggle = (act)=> setCollapsed(c=>({...c,[act]:!c[act]}));
  const COLLAPSED_W = 46;
  const roman = (a)=> ["I","II","III","IV"][a-1] || String(a);
  // act names come from the project's narrative framework (Three-Act: Setup /
  // Complication / Resolution; Kishōtenketsu: Ki / Shō / Ten / Ketsu)
  const actName = (a)=> (typeof fwActName==="function") ? fwActName(a) : (({1:"Setup",2:"Complication",3:"Resolution"})[a] || ("Act "+a));

  const yFor = (charge) => {
    // charge -3..+3 -> y within graph (PAD_T..GRAPH_H-PAD_B)
    const top = PAD_T, bot = GRAPH_H - PAD_B;
    const t = (3 - charge) / 6; // +3 -> 0, -3 -> 1
    return top + t * (bot - top);
  };

  // group scenes into consecutive acts, then flatten to COLUMNS — a column is either
  // one scene, or (for a collapsed act) a single narrow placeholder. The act ruler,
  // graph and filmstrip all lay out from this shared column model so they stay aligned.
  const actGroups = [];
  scenes.forEach((s, i) => { const last = actGroups[actGroups.length - 1];
    if (!last || last.act !== s.act) actGroups.push({ act:s.act, items:[{s,i}] }); else last.items.push({s,i}); });
  const columns = [];
  actGroups.forEach(g => { if(collapsed[g.act]) columns.push({ kind:"act", act:g.act, count:g.items.length });
    else g.items.forEach(it => columns.push({ kind:"scene", s:it.s, i:it.i })); });
  const colW = (c)=> c.kind==="scene" ? COL_W : COLLAPSED_W;
  const lefts = []; let _cur = 0;
  columns.forEach((c,ci)=>{ if(ci>0) _cur += GAP; lefts[ci] = _cur; _cur += colW(c); });
  const totalW = _cur || COL_W;
  const centerOf = (ci)=> lefts[ci] + colW(columns[ci])/2;

  // one ruler entry per act, with its x-extent across the columns
  const ruler = [];
  columns.forEach((c,ci)=>{ const act = c.kind==="act" ? c.act : c.s.act; const last = ruler[ruler.length-1];
    if(!last || last.act!==act) ruler.push({ act, firstCi:ci, lastCi:ci, collapsed:c.kind==="act", count:c.kind==="act"?c.count:1 });
    else { last.lastCi = ci; last.count += 1; } });
  const bandW = (r)=> (lefts[r.lastCi] + colW(columns[r.lastCi])) - lefts[r.firstCi];

  // build spine path from the VISIBLE scene points (collapsed acts are skipped)
  const pts = [];
  columns.forEach((c,ci)=>{ if(c.kind==="scene") pts.push({ x:centerOf(ci), y:yFor(c.s.closeCharge), s:c.s, i:c.i, ci }); });
  const lastPt = pts[pts.length-1];
  const linePath = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // smooth catmull-rom variant (premium look) — gentle curve through the same points
  const smoothPath = smoothD(pts);
  // follow lens — the followed character's own arc through the scenes they DRIVE
  const fpts = follow ? pts.filter(p => follow.drivenIds.has(p.s.id)) : [];
  const fInvolved = (s)=> !follow || follow.involvedIds.has(s.id);

  return React.createElement("div",{className:"spine-wrap",style:{width:totalW}},
    // ---- act ruler ----
    React.createElement("div",{className:"act-ruler"},
      ruler.map(r => {
        if(r.collapsed) return React.createElement("div",{key:r.act,className:"act-band collapsed",
          style:{width:COLLAPSED_W,cursor:"pointer",justifyContent:"center",gap:4,padding:0},
          onClick:()=>toggle(r.act),title:`Expand Act ${roman(r.act)}`},
          React.createElement(Icon.chevR,{s:12}),
          React.createElement("span",{className:"no"},roman(r.act)));
        const pct = Math.round((r.count / scenes.length) * 100);
        const mins = actMin(r.act);
        return React.createElement("div",{key:r.act,className:"act-band",style:{width:bandW(r),cursor:"pointer"},
          onClick:()=>toggle(r.act),title:`Collapse Act ${roman(r.act)}`},
          React.createElement("span",{className:"act-fold-ic"},React.createElement(Icon.chevD,{s:11})),
          React.createElement("span",{className:"no"},`ACT ${roman(r.act)}`),
          showFramework && React.createElement("span",{className:"nm"},actName(r.act)),
          mins!=null && React.createElement("span",{className:"act-min",
            title:`Act ${roman(r.act)} estimated screen time (≈1 page/min)`},`≈${mins} min`),
          React.createElement("span",{className:"pct"},`${pct}%`));
      })),

    // ---- graph ----
    React.createElement("div",{className:"graph-box",style:{width:totalW}},
      React.createElement("div",{className:"graph-ylabel top"},"Positive +"),
      React.createElement("div",{className:"graph-ylabel bot"},"Negative \u2212"),
      React.createElement("svg",{className:"graph-svg",width:totalW,height:GRAPH_H,
        viewBox:`0 0 ${totalW} ${GRAPH_H}`},
        React.createElement("defs",null,
          React.createElement("filter",{id:"spineGlow",x:"-20%",y:"-60%",width:"140%",height:"220%"},
            React.createElement("feGaussianBlur",{stdDeviation:"3.2",result:"b"}),
            React.createElement("feMerge",null,
              React.createElement("feMergeNode",{in:"b"}),
              React.createElement("feMergeNode",{in:"SourceGraphic"}))),
          React.createElement("linearGradient",{id:"spineStroke",x1:"0",y1:"0",x2:"0",y2:"1"},
            React.createElement("stop",{offset:"0%",stopColor:"oklch(0.78 0.15 62)"}),
            React.createElement("stop",{offset:"50%",stopColor:"#8d8a84"}),
            React.createElement("stop",{offset:"100%",stopColor:"oklch(0.72 0.10 232)"})),
          React.createElement("linearGradient",{id:"areaFill",x1:"0",y1:"0",x2:"0",y2:"1"},
            React.createElement("stop",{offset:"0%",stopColor:"oklch(0.78 0.15 62 / .22)"}),
            React.createElement("stop",{offset:"50%",stopColor:"transparent"}),
            React.createElement("stop",{offset:"100%",stopColor:"oklch(0.72 0.10 232 / .22)"}))),
        // gridlines
        [3,2,1,0,-1,-2,-3].map(g => {
          const y = yFor(g), zero = g===0;
          return React.createElement("line",{key:"g"+g,x1:0,y1:y,x2:totalW,y2:y,
            stroke: zero ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.05)",
            strokeWidth: zero ? 1 : 1, strokeDasharray: zero ? "none" : "2 6"});
        }),
        // act dividers (before each act except the first)
        ruler.slice(1).map(r => {
          const x = lefts[r.firstCi] - GAP/2;
          return React.createElement("line",{key:"ad"+r.act,x1:x,y1:0,x2:x,y2:GRAPH_H,
            stroke:"rgba(255,255,255,.1)",strokeWidth:1,strokeDasharray:"3 4"});
        }),
        // collapsed-act bands — a subtle dashed region, click to expand
        ruler.filter(r=>r.collapsed).map(r => {
          const x = lefts[r.firstCi], w = COLLAPSED_W, cx = x + w/2, cy = GRAPH_H/2;
          return React.createElement("g",{key:"cb"+r.act,style:{cursor:"pointer"},onClick:()=>toggle(r.act)},
            React.createElement("rect",{x,y:0,width:w,height:GRAPH_H,fill:"rgba(255,255,255,.03)",
              stroke:"rgba(255,255,255,.08)",strokeWidth:1,strokeDasharray:"3 4"}),
            React.createElement("text",{x:cx,y:cy,textAnchor:"middle",fontFamily:"var(--f-mono)",fontSize:9,
              fill:"var(--txt-3)",transform:`rotate(-90 ${cx} ${cy})`},`ACT ${roman(r.act)} · ${r.count}`));
        }),
        // area under spine to zero line
        pts.length>=2 && React.createElement("path",{
          d:`${linePath} L${lastPt.x} ${yFor(0)} L${pts[0].x} ${yFor(0)} Z`,
          fill:"url(#areaFill)",stroke:"none",pointerEvents:"none",opacity:follow?.25:1}),
        // spine line (recedes while following, so the character's arc reads on top)
        pts.length>=2 && React.createElement("path",{className:"spine-line",d:smoothPath,fill:"none",stroke:"url(#spineStroke)",
          strokeWidth:2.5,strokeLinejoin:"round",strokeLinecap:"round",pointerEvents:"none",opacity:follow?.3:1}),
        // follow overlay — the character's own arc through their driven scenes
        follow && fpts.length>=2 && React.createElement("path",{d:smoothD(fpts),fill:"none",
          stroke:follow.color,strokeWidth:2.5,strokeLinejoin:"round",strokeLinecap:"round",
          pointerEvents:"none",filter:"url(#spineGlow)",opacity:.95}),
        // vertical connector from zero to each point (subtle)
        pts.map(p => React.createElement("line",{key:"v"+p.i,x1:p.x,y1:yFor(0),x2:p.x,y2:p.y,
          stroke: p.s.closeCharge>0?"var(--pos-line)":p.s.closeCharge<0?"var(--neg-line)":"rgba(255,255,255,.15)",
          strokeWidth:1,opacity:fInvolved(p.s)?.35:.08,pointerEvents:"none"})),
        // markers (decorative — clicks handled by the hit columns below)
        pts.map(p => {
          const { flagged } = turnInfo(p.s);
          const sel = p.s.id === selId;
          const col = p.s.closeCharge>0?"oklch(0.78 0.15 62)":p.s.closeCharge<0?"oklch(0.72 0.10 232)":"#8d8a84";
          const big = ["incite","story-climax","act-climax","midpoint","crisis"].includes(p.s.kind);
          const fDrives = follow && follow.drivenIds.has(p.s.id);
          const fTurn = follow && follow.turnIds.has(p.s.id);
          return React.createElement("g",{key:"m"+p.i,pointerEvents:"none",opacity:fInvolved(p.s)?1:.22},
            sel && React.createElement("circle",{cx:p.x,cy:p.y,r:11,fill:"none",
              stroke:col,strokeWidth:1.5,opacity:.6}),
            // follow lens: solid ring = they drive this scene; dashed ring = their arc turns here
            fDrives && React.createElement("circle",{cx:p.x,cy:p.y,r:big?10.5:8.5,fill:"none",
              stroke:follow.color,strokeWidth:1.5,opacity:.9}),
            fTurn && React.createElement("circle",{cx:p.x,cy:p.y,r:big?14.5:12.5,fill:"none",
              stroke:follow.color,strokeWidth:1.5,strokeDasharray:"3 3",opacity:.75}),
            React.createElement("circle",{className:"spine-node",cx:p.x,cy:p.y,r:big?6:4.5,fill:col,
              stroke:"var(--bg-0)",strokeWidth:2}),
            flagged && React.createElement("circle",{cx:p.x,cy:p.y,r:big?6:4.5,fill:"none",
              stroke:"var(--alert)",strokeWidth:2}),
            big && React.createElement("circle",{cx:p.x,cy:p.y,r:9.5,fill:"none",stroke:col,
              strokeWidth:1,opacity:.4}));
        }),
        // kind labels above big beats (CAPS) + secondary plot labels (Title Case)
        showFramework && pts.map(p => {
          const main = KIND_LABEL[p.s.kind];
          const label = main || p.s.plot;
          if(!label) return null;
          const above = p.s.closeCharge >= 0;
          return React.createElement("text",{key:"t"+p.i,x:p.x,
            y: above ? p.y-16 : p.y+22, textAnchor:"middle",
            fontFamily:"var(--f-mono)",fontSize:8.5,letterSpacing:"0.5",
            fill: main ? "var(--txt-2)" : "var(--txt-3)",pointerEvents:"none",
            style: main ? {textTransform:"uppercase"} : null},
            label);
        }),
        // hit columns — full-height transparent click targets, one per visible scene
        pts.map(p => {
          const colLeft = lefts[p.ci] - GAP/2;
          return React.createElement("rect",{key:"hit"+p.i,
            x:colLeft, y:0, width:COL_W+GAP, height:GRAPH_H,
            fill:"transparent", style:{cursor:"pointer"},
            onClick:()=>onSelect(p.s.id)});
        }))),

    // ---- filmstrip ----
    React.createElement("div",{className:"filmstrip"},
      columns.map((c) => {
        // collapsed act → a slim, clickable strip (mirrors the act ruler / graph band)
        if(c.kind==="act") return React.createElement("div",{key:"acol"+c.act,className:"spine-act-strip",
          onClick:()=>toggle(c.act),title:`Expand Act ${roman(c.act)}`,
          style:{flex:`0 0 ${COLLAPSED_W}px`,width:COLLAPSED_W,cursor:"pointer",display:"flex",
            flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:"10px 0",
            border:"1px solid var(--line)",borderTop:0,borderRadius:"0 0 8px 8px",background:"var(--bg-2)"}},
          React.createElement(Icon.chevR,{s:14}),
          React.createElement("span",{className:"tree-act-no"},roman(c.act)),
          React.createElement("span",{style:{writingMode:"vertical-rl",fontFamily:"var(--f-display)",fontSize:12,fontWeight:500,color:"var(--txt-2)"}},actName(c.act)),
          React.createElement("span",{style:{fontFamily:"var(--f-mono)",fontSize:10,color:"var(--txt-3)"}},c.count));
        const s = c.s, ci = c.i;
        const { flagged } = turnInfo(s);
        const sel = s.id === selId;
        const fDrives = follow && follow.drivenIds.has(s.id);
        return React.createElement("div",{key:s.id,
          draggable:true,
          onDragStart:(e)=>{ setDragIdx(ci); e.dataTransfer.effectAllowed="move"; },
          onDragOver:(e)=>{ e.preventDefault(); if(overIdx!==ci) setOverIdx(ci); },
          onDragEnd:()=>{ setDragIdx(null); setOverIdx(null); },
          onDrop:(e)=>{ e.preventDefault(); if(dragIdx!=null && dragIdx!==ci) onReorder(dragIdx, ci); setDragIdx(null); setOverIdx(null); },
          className:`scard ${sel?"sel":""} ${s.kind==="incite"?"incite":""} `+
                    `${["story-climax","act-climax","midpoint"].includes(s.kind)?"climax":""} `+
                    `${dragIdx===ci?"dragging":""} ${overIdx===ci&&dragIdx!=null&&dragIdx!==ci?"dragover":""} `+
                    `${follow && !fInvolved(s) ? "dim":""}`,
          style:{width:COL_W, ...(fDrives ? {boxShadow:`inset 0 2px 0 ${follow.color}`+(sel?", inset 0 0 0 1px var(--pos-line)":"")} : null)},
          onClick:()=>onSelect(s.id)},
          React.createElement("span",{className:"scard-grip",title:"Drag to reorder"},React.createElement(Icon.grip,{s:14})),
          React.createElement("div",{className:"scard-top"},
            React.createElement("span",{className:"scard-no"},String(s.no).padStart(2,"0")),
            React.createElement("div",{className:"scard-conf",title:`Conflict level ${s.conf}`},
              [1,2,3].map(i=>React.createElement("span",{key:i,className:`conf-pip ${i<=s.conf?"on":""}`})))),
          React.createElement("div",{className:"scard-title"},s.title),
          React.createElement("div",{className:"scard-charge"},
            React.createElement(ChargeChip,{value:s.openCharge}),
            React.createElement("span",{className:"chip-arrow"},React.createElement(Icon.arrowSmall,{s:11})),
            React.createElement(ChargeChip,{value:s.closeCharge})),
          React.createElement("div",{className:"scard-foot"},
            flagged
              ? React.createElement("span",{className:"turn-badge no"},
                  React.createElement(Icon.alert,{s:10}),"No turn")
              : React.createElement("span",{className:"turn-badge ok"},
                  React.createElement(Icon.check,{s:10}),"Turns"),
            (runtimes && runtimes[s.id]) && React.createElement("span",{
              className:"scard-rt"+(runtimes[s.id].hot?" hot":""),
              style:{marginLeft:"auto"},
              title: runtimes[s.id].hot
                ? "Estimated screen time — runs long against the film's average scene"
                : "Estimated screen time"+(runtimes[s.id].approx?" (rough — from beats, not yet drafted)":" (from the draft, ≈1 page/min)")},
              (runtimes[s.id].approx?"~":"")+fmtClock(runtimes[s.id].sec))));
      }),
      onAddScene && React.createElement("button",{className:"spine-add",style:{height:"auto"},
        onClick:()=>onAddScene(scenes.length?scenes[scenes.length-1].id:null)},
        React.createElement(Icon.plus,{s:18}),"Add scene")),
  );
}
window.SpineCanvas = SpineCanvas;
window.KIND_LABEL = KIND_LABEL;

/* DragScroll — grab-to-pan horizontal scroller for desktop mouse.
   Touch uses native momentum scrolling (overflow-x). Excludes scene cards
   so their HTML5 drag-reorder still works. Suppresses the click that ends a pan. */
function DragScroll({ className, style, children }){
  const ref = React.useRef(null);
  const st = React.useRef({down:false,startX:0,startLeft:0,moved:false});
  const EXCLUDE = ".scard, .spine-add, .tree-scene, select, input, textarea, button";

  const onDown = (e)=>{
    const el = ref.current; if(!el) return;
    st.current.moved = false;                        // reset at the start of ANY interaction
    if(e.pointerType==="touch") return;             // let native touch-scroll handle mobile
    if(e.button!==undefined && e.button!==0) return; // primary button only
    if(e.target.closest && e.target.closest(EXCLUDE)) return; // don't hijack cards/controls
    st.current = {down:true,startX:e.clientX,startLeft:el.scrollLeft,moved:false};
    el.classList.add("grabbing");
  };
  const onMove = (e)=>{
    const el = ref.current; if(!el || !st.current.down) return;
    const dx = e.clientX - st.current.startX;
    if(Math.abs(dx) > 4) st.current.moved = true;
    el.scrollLeft = st.current.startLeft - dx;
  };
  const onUp = ()=>{
    const el = ref.current; if(el) el.classList.remove("grabbing");
    st.current.down = false;
  };
  const onClickCapture = (e)=>{
    if(st.current.moved){ e.stopPropagation(); e.preventDefault(); st.current.moved = false; }
  };
  React.useEffect(()=>{
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return ()=>{ window.removeEventListener("pointermove",onMove);
      window.removeEventListener("pointerup",onUp); window.removeEventListener("pointercancel",onUp); };
  },[]);
  return React.createElement("div",{ref,className,style,onPointerDown:onDown,onClickCapture},children);
}
window.DragScroll = DragScroll;
