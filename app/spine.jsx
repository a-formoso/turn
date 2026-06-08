/* spine.jsx — value-charge graph + act ruler + scene filmstrip */

const COL_W = 138, GAP = 6, GRAPH_H = 300, PAD_T = 28, PAD_B = 30;

/* shared turn logic — used by canvas, inspector, AI */
function turnInfo(sc){
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

const KIND_LABEL = {
  incite:"Inciting Incident", "act-climax":"Act Climax", midpoint:"Mid-Act Climax",
  crisis:"Crisis", "story-climax":"Story Climax", resolution:"Resolution",
};

function ChargeChip({ value, label }){
  return React.createElement("span",{className:`chip ${chargeClass(value)}`},
    label && React.createElement("span",{style:{opacity:.7,fontWeight:500}},label),
    chargeStr(value));
}
window.ChargeChip = ChargeChip;

function SpineCanvas({ scenes, selId, onSelect, showFramework, onReorder, onAddScene }){
  const [dragIdx, setDragIdx] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);
  const n = scenes.length;
  const totalW = n * COL_W + (n - 1) * GAP;
  const yFor = (charge) => {
    // charge -3..+3 -> y within graph (PAD_T..GRAPH_H-PAD_B)
    const top = PAD_T, bot = GRAPH_H - PAD_B;
    const t = (3 - charge) / 6; // +3 -> 0, -3 -> 1
    return top + t * (bot - top);
  };
  const xFor = (i) => i * (COL_W + GAP) + COL_W / 2;

  // act bands
  const acts = [];
  scenes.forEach((s, i) => {
    const last = acts[acts.length - 1];
    if (!last || last.act !== s.act) acts.push({ act: s.act, from: i, to: i });
    else last.to = i;
  });
  const actNames = { 1:"Setup", 2:"Complication", 3:"Resolution" };

  // build spine path (close charge per scene)
  const pts = scenes.map((s, i) => ({ x: xFor(i), y: yFor(s.closeCharge), s, i }));
  const linePath = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // smooth catmull-rom variant (premium look) — gentle curve through the same points
  const smoothPath = (()=>{
    if(pts.length < 2) return linePath;
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for(let i=0;i<pts.length-1;i++){
      const p0 = pts[i-1]||pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2]||p2;
      const c1x = p1.x + (p2.x - p0.x)/6, c1y = p1.y + (p2.y - p0.y)/6;
      const c2x = p2.x - (p3.x - p1.x)/6, c2y = p2.y - (p3.y - p1.y)/6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  })();

  return React.createElement("div",{className:"spine-wrap",style:{width:totalW}},
    // ---- act ruler ----
    React.createElement("div",{className:"act-ruler"},
      acts.map(a => {
        const w = (a.to - a.from + 1) * COL_W + (a.to - a.from) * GAP;
        const pct = Math.round(((a.to - a.from + 1) / n) * 100);
        return React.createElement("div",{key:a.act,className:"act-band",style:{width:w}},
          React.createElement("span",{className:"no"},`ACT ${["I","II","III"][a.act-1]}`),
          showFramework && React.createElement("span",{className:"nm"},actNames[a.act]),
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
        // act dividers
        acts.slice(1).map(a => {
          const x = a.from * (COL_W + GAP) - GAP/2;
          return React.createElement("line",{key:"ad"+a.act,x1:x,y1:0,x2:x,y2:GRAPH_H,
            stroke:"rgba(255,255,255,.1)",strokeWidth:1,strokeDasharray:"3 4"});
        }),
        // area under spine to zero line
        React.createElement("path",{
          d:`${linePath} L${pts[n-1].x} ${yFor(0)} L${pts[0].x} ${yFor(0)} Z`,
          fill:"url(#areaFill)",stroke:"none",pointerEvents:"none"}),
        // spine line
        React.createElement("path",{className:"spine-line",d:smoothPath,fill:"none",stroke:"url(#spineStroke)",
          strokeWidth:2.5,strokeLinejoin:"round",strokeLinecap:"round",pointerEvents:"none"}),
        // vertical connector from zero to each point (subtle)
        pts.map(p => React.createElement("line",{key:"v"+p.i,x1:p.x,y1:yFor(0),x2:p.x,y2:p.y,
          stroke: p.s.closeCharge>0?"var(--pos-line)":p.s.closeCharge<0?"var(--neg-line)":"rgba(255,255,255,.15)",
          strokeWidth:1,opacity:.35,pointerEvents:"none"})),
        // markers (decorative — clicks handled by the hit columns below)
        pts.map(p => {
          const { flagged } = turnInfo(p.s);
          const sel = p.s.id === selId;
          const col = p.s.closeCharge>0?"oklch(0.78 0.15 62)":p.s.closeCharge<0?"oklch(0.72 0.10 232)":"#8d8a84";
          const big = ["incite","story-climax","act-climax","midpoint","crisis"].includes(p.s.kind);
          return React.createElement("g",{key:"m"+p.i,pointerEvents:"none"},
            sel && React.createElement("circle",{cx:p.x,cy:p.y,r:11,fill:"none",
              stroke:col,strokeWidth:1.5,opacity:.6}),
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
        // hit columns — full-height transparent click targets, one per point (on top)
        pts.map(p => {
          const colLeft = p.i * (COL_W + GAP) - GAP/2;
          return React.createElement("rect",{key:"hit"+p.i,
            x:colLeft, y:0, width:COL_W+GAP, height:GRAPH_H,
            fill:"transparent", style:{cursor:"pointer"},
            onClick:()=>onSelect(p.s.id)});
        }))),

    // ---- filmstrip ----
    React.createElement("div",{className:"filmstrip"},
      scenes.map((s,ci) => {
        const { flagged } = turnInfo(s);
        const sel = s.id === selId;
        return React.createElement("div",{key:s.id,
          draggable:true,
          onDragStart:(e)=>{ setDragIdx(ci); e.dataTransfer.effectAllowed="move"; },
          onDragOver:(e)=>{ e.preventDefault(); if(overIdx!==ci) setOverIdx(ci); },
          onDragEnd:()=>{ setDragIdx(null); setOverIdx(null); },
          onDrop:(e)=>{ e.preventDefault(); if(dragIdx!=null && dragIdx!==ci) onReorder(dragIdx, ci); setDragIdx(null); setOverIdx(null); },
          className:`scard ${sel?"sel":""} ${s.kind==="incite"?"incite":""} `+
                    `${["story-climax","act-climax","midpoint"].includes(s.kind)?"climax":""} `+
                    `${dragIdx===ci?"dragging":""} ${overIdx===ci&&dragIdx!=null&&dragIdx!==ci?"dragover":""}`,
          style:{width:COL_W},onClick:()=>onSelect(s.id)},
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
            React.createElement("span",{className:"scard-dur",style:{marginLeft:"auto"}},
              `${s.seq}`)));
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
