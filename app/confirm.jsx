/* ============================================================
   In-app confirm dialog — replaces the browser's window.confirm
   with a modal that matches the product chrome.

   Usage (async):
     const ok = await appConfirm({
       title: "Remove 2 orphaned props?",
       body:  "These aren't listed in the worn/carried items.",
       items: ["Possessive)", "Aud"],            // optional bullet list
       note:  "This can't be undone.",            // optional sub-note
       confirmLabel: "Remove",                    // default "Confirm"
       cancelLabel:  "Cancel",                    // default "Cancel"
       danger: true,                              // red confirm button
     });
     if (ok) { ... }

   A bare string is accepted too: await appConfirm("Are you sure?").
   <ConfirmHost/> must be mounted once at the app root. ============================================================ */
(function(){
  let resolver = null;
  let pushReq  = null;   // setState from the mounted host

  function appConfirm(opts){
    const req = (typeof opts === "string") ? { body: opts } : (opts || {});
    return new Promise((resolve)=>{
      // if a previous dialog is somehow open, resolve it false first
      if(resolver){ const r=resolver; resolver=null; r(false); }
      resolver = resolve;
      if(pushReq) pushReq(req);
      else { resolver=null; resolve(window.confirm((req.title?req.title+"\n\n":"")+(req.body||""))); }
    });
  }
  window.appConfirm = appConfirm;

  function ConfirmHost(){
    const [req, setReq] = React.useState(null);
    React.useEffect(()=>{ pushReq = setReq; return ()=>{ pushReq = null; }; },[]);

    const close = React.useCallback((val)=>{
      const r = resolver; resolver = null; setReq(null); if(r) r(val);
    },[]);

    React.useEffect(()=>{
      if(!req) return;
      const onKey = (e)=>{
        if(e.key==="Escape"){ e.preventDefault(); close(false); }
        else if(e.key==="Enter"){ e.preventDefault(); close(true); }
      };
      window.addEventListener("keydown", onKey, true);
      return ()=> window.removeEventListener("keydown", onKey, true);
    },[req, close]);

    if(!req) return null;
    const danger = !!req.danger;
    return React.createElement("div",{className:"appconfirm-scrim", onMouseDown:(e)=>{ if(e.target===e.currentTarget) close(false); }},
      React.createElement("div",{className:"appconfirm", role:"dialog", "aria-modal":"true"},
        req.title && React.createElement("div",{className:"appconfirm-title"}, req.title),
        req.body && React.createElement("div",{className:"appconfirm-body"}, req.body),
        Array.isArray(req.items) && req.items.length>0 && React.createElement("ul",{className:"appconfirm-items"},
          req.items.map((it,i)=>React.createElement("li",{key:i}, it))),
        req.note && React.createElement("div",{className:"appconfirm-note"}, req.note),
        React.createElement("div",{className:"appconfirm-actions"},
          React.createElement("button",{className:"appconfirm-btn ghost", onClick:()=>close(false)}, req.cancelLabel||"Cancel"),
          /* optional third action — resolves the promise with the string "alt" */
          req.altLabel && React.createElement("button",{className:"appconfirm-btn alt", onClick:()=>close("alt")}, req.altLabel),
          React.createElement("button",{className:"appconfirm-btn"+(danger?" danger":" primary"), autoFocus:true, onClick:()=>close(true)},
            req.confirmLabel||"Confirm"))));
  }
  window.ConfirmHost = ConfirmHost;
})();
