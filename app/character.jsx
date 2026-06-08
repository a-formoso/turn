/* character.jsx — focused Character panel.
   Desire (conscious want + unconscious need) is authored; the ARC is DERIVED
   from the scenes this character drives, so it can never drift from the spine.
   MUSE can draft the desire/arc from those same scenes. */

/* scenes this character drives, in story order, + a derived arc verdict */
function characterArc(charId, scenes){
  const driven = scenes.filter(s=>s.driver===charId);
  let turned=false, from=null, to=null;
  if(driven.length){
    from = driven[0].openCharge;
    to = driven[driven.length-1].closeCharge;
    turned = Math.sign(from)!==Math.sign(to) || Math.abs(to-from)>=2;
  }
  return { driven, turned, from, to };
}
window.characterArc = characterArc;

/* small derived value-charge sparkline across a character's driven scenes */
function ArcSpark({ driven }){
  const W = 12, GAP = 0, H = 64, MIDY = H/2, AMP = 24;
  if(!driven.length) return null;
  const n = driven.length;
  const stepW = Math.max(18, Math.min(40, 240/n));
  const totalW = (n-1)*stepW + 24;
  const yFor = (c)=> MIDY - (c/3)*AMP;
  const xFor = (i)=> 12 + i*stepW;
  const pts = driven.map((s,i)=>({x:xFor(i), y:yFor(s.closeCharge), s, i}));
  const line = pts.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
  return React.createElement("svg",{className:"arc-spark",width:totalW,height:H,viewBox:"0 0 "+totalW+" "+H},
    React.createElement("line",{x1:0,y1:MIDY,x2:totalW,y2:MIDY,stroke:"var(--line-2)",strokeWidth:1,strokeDasharray:"2 4"}),
    React.createElement("path",{d:line,fill:"none",stroke:"var(--txt-3)",strokeWidth:2,strokeLinejoin:"round",strokeLinecap:"round"}),
    pts.map(p=>{
      const col = p.s.closeCharge>0?"var(--pos)":p.s.closeCharge<0?"var(--neg)":"var(--txt-2)";
      return React.createElement("circle",{key:p.i,cx:p.x,cy:p.y,r:4,fill:col,stroke:"var(--bg-1)",strokeWidth:1.5});
    }));
}

function CharacterPanel({ character, scenes, onUpdate, onDraft, drafting, onJumpScene, onClose, onCollapse }){
  const c = character;
  if(!c) return React.createElement("div",{className:"inspector"},
    React.createElement("div",{className:"empty"},
      React.createElement(Icon.user,{s:34}),
      React.createElement("div",{className:"empty-t"},"No character"),
      React.createElement("div",{className:"empty-d"},"Pick a character from the Cast list.")));

  const { driven, turned, from, to } = characterArc(c.id, scenes);
  const initials = c.name.split(" ").map(w=>w[0]).slice(0,2).join("");

  return React.createElement("div",{className:"inspector"},
    React.createElement("div",{className:"insp-tabs"},
      React.createElement("button",{className:"insp-tab on",style:{cursor:"default"}},"Character"),
      React.createElement("button",{className:"panel-collapse",onClick:onCollapse||onClose,title:"Close",
        style:{marginLeft:"auto",alignSelf:"center",marginBottom:6}},React.createElement(Icon.chevR,{s:14}))),

    React.createElement("div",{className:"insp-scroll"},
      // header
      React.createElement("div",{className:"char-head"},
        React.createElement("div",{className:"char-head-av",style:{background:c.color}},initials),
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement(EditText,{value:c.name,className:"char-head-name",onCommit:v=>onUpdate(c.id,{name:v})}),
          React.createElement(EditText,{value:c.role,className:"char-head-role",onCommit:v=>onUpdate(c.id,{role:v})}))),

      // DESIRE
      React.createElement("div",{className:"insp-block",style:{marginTop:16}},
        React.createElement("div",{className:"insp-block-head"},
          React.createElement("span",{className:"eyebrow"},React.createElement(Icon.target,{s:12}),"Desire"),
          React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(c)},
            React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft with MUSE")),
        React.createElement("div",{className:"char-field"},
          React.createElement("div",{className:"obj-lab"},"Conscious want"),
          React.createElement(EditText,{value:c.conscious,multiline:true,placeholder:"What they consciously pursue\u2026",
            onCommit:v=>onUpdate(c.id,{conscious:v})})),
        React.createElement("div",{className:"char-field"},
          React.createElement("div",{className:"obj-lab"},"Unconscious need"),
          React.createElement(EditText,{value:c.unconscious,multiline:true,placeholder:"The deeper need they may not admit\u2026",
            onCommit:v=>onUpdate(c.id,{unconscious:v})}))),

      // ARC (derived)
      React.createElement("div",{className:"insp-block"},
        React.createElement("div",{className:"insp-block-head"},
          React.createElement("span",{className:"eyebrow"},React.createElement(Icon.graph,{s:12}),"Arc \u00b7 derived from the spine")),
        driven.length
          ? React.createElement(React.Fragment,null,
              React.createElement("div",{className:"char-arc-card"},
                React.createElement(ArcSpark,{driven}),
                React.createElement("div",{className:"char-arc-meta"},
                  React.createElement("span",{className:"char-arc-summary"},c.arc||"\u2014"),
                  turned
                    ? React.createElement("span",{className:"char-arc-verdict ok"},React.createElement(Icon.check,{s:11}),"Arc transforms")
                    : React.createElement("span",{className:"char-arc-verdict no"},React.createElement(Icon.alert,{s:11}),"Flat \u2014 doesn\u2019t transform"))),
              React.createElement("div",{className:"char-arc-note"},
                "Opens on ",React.createElement("b",null,(driven[0].openValue)+" "+chargeStr(from)),
                " and closes on ",React.createElement("b",null,(driven[driven.length-1].closeValue)+" "+chargeStr(to)),
                " across the ",driven.length," scene",driven.length>1?"s":""," they drive."))
          : React.createElement("div",{className:"char-empty-arc"},
              React.createElement(Icon.alert,{s:14}),
              React.createElement("div",null,
                React.createElement("b",null,c.name)," drives no scenes yet. ",
                "Set them as a scene\u2019s Driver (in the Scene panel) and their arc will appear here."))),

      // SCENES THEY DRIVE
      driven.length>0 && React.createElement("div",{className:"insp-block"},
        React.createElement("div",{className:"insp-block-head"},
          React.createElement("span",{className:"eyebrow"},React.createElement(Icon.film,{s:12}),"Drives "+driven.length+" scene"+(driven.length>1?"s":""))),
        React.createElement("div",{className:"char-scene-list"},
          driven.map(s=>{
            const tf = turnInfo(s);
            return React.createElement("button",{key:s.id,className:"char-scene-row",onClick:()=>onJumpScene(s.id)},
              React.createElement("span",{className:"char-scene-no"},String(s.no).padStart(2,"0")),
              React.createElement("span",{className:"char-scene-title"},s.title),
              React.createElement(ChargeChip,{value:s.closeCharge}),
              tf.flagged && React.createElement("span",{className:"char-scene-flag",title:"This scene doesn\u2019t turn"},
                React.createElement(Icon.alert,{s:12})),
              React.createElement("span",{className:"char-scene-go"},React.createElement(Icon.arrowSmall,{s:12})));
          })))),
  );
}
window.CharacterPanel = CharacterPanel;
