/* auth-ui.jsx — sign-in / sign-up modal + the top-bar account chip.
   Rendered by app.jsx. Local-first: signing in is optional; it switches the app
   from browser-local storage to the Supabase cloud. */

function AuthModal({ onClose, onAuthed, initialMode, plan }){
  const [mode, setMode] = React.useState(initialMode==="signup"?"signup":"signin");   // signin | signup
  const planName = plan==="pro" ? "Pro plan" : plan==="studio" ? "Studio plan" : null;
  const [email, setEmail] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const submit = async ()=>{
    if(busy) return;
    const e = email.trim();
    if(!e || !pw){ setErr("Enter your email and a password."); return; }
    if(mode==="signup" && pw.length<6){ setErr("Password must be at least 6 characters."); return; }
    setErr(""); setNotice(""); setBusy(true);
    try{
      const fn = mode==="signup" ? window.cloudSignUp : window.cloudSignIn;
      const { data, error } = await fn(e, pw);
      if(error){ setErr(error.message || "Something went wrong."); setBusy(false); return; }
      /* sign-up may require email confirmation (no active session yet) */
      if(mode==="signup" && (!data || !data.session)){
        setNotice("Account created. Check your email to confirm, then sign in.");
        setMode("signin"); setBusy(false); return;
      }
      setBusy(false);
      onAuthed && onAuthed(data && data.session);
      onClose && onClose();
    }catch(ex){ setErr((ex && ex.message) || "Network error."); setBusy(false); }
  };

  return React.createElement("div",{className:"lb-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose && onClose(); }},
    React.createElement("div",{className:"auth-panel"},
      React.createElement("div",{className:"auth-head"},
        React.createElement("div",{className:"auth-mark"},"TURN"),
        React.createElement("div",{className:"auth-title"}, mode==="signup"?"Create your account":"Sign in"),
        (mode==="signup" && planName) && React.createElement("div",{className:"auth-plan"},
          React.createElement(Icon.sparkles,{s:11}), planName, React.createElement("span",{className:"auth-plan-note"},"· start free, upgrade after")),
        React.createElement("div",{className:"auth-sub"},"Save your films and generated sheets to the cloud, across devices.")),
      React.createElement("div",{className:"auth-body"},
        notice && React.createElement("div",{className:"auth-notice"}, notice),
        React.createElement("label",{className:"auth-field"},
          React.createElement("span",{className:"auth-lab"},"Email"),
          React.createElement("input",{className:"auth-input",type:"email",autoComplete:"email",value:email,
            placeholder:"you@studio.com",onChange:e=>setEmail(e.target.value),
            onKeyDown:e=>{ if(e.key==="Enter") submit(); }})),
        React.createElement("label",{className:"auth-field"},
          React.createElement("span",{className:"auth-lab"},"Password"),
          React.createElement("input",{className:"auth-input",type:"password",
            autoComplete:mode==="signup"?"new-password":"current-password",value:pw,
            placeholder:mode==="signup"?"At least 6 characters":"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
            onChange:e=>setPw(e.target.value),onKeyDown:e=>{ if(e.key==="Enter") submit(); }})),
        err && React.createElement("div",{className:"auth-err"}, err),
        React.createElement("button",{className:"auth-submit",disabled:busy,onClick:submit},
          busy ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),
              mode==="signup"?"Creating\u2026":"Signing in\u2026")
            : (mode==="signup"?"Create account":"Sign in")),
        React.createElement("div",{className:"auth-switch"},
          mode==="signup" ? "Already have an account? " : "New here? ",
          React.createElement("button",{className:"auth-link",onClick:()=>{ setErr(""); setNotice(""); setMode(mode==="signup"?"signin":"signup"); }},
            mode==="signup" ? "Sign in" : "Create one"))),
      React.createElement("button",{className:"auth-close",onClick:onClose},
        React.createElement(Icon.x,{s:16}))));
}
window.AuthModal = AuthModal;

function AccountChip({ session, cloudActive, onSignIn, onSignOut }){
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    if(!open) return;
    const h = e=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[open]);

  if(!window.cloudConfigured || !window.cloudConfigured()) return null;

  if(!session){
    return React.createElement("button",{className:"acct-signin",onClick:onSignIn},
      React.createElement(Icon.user,{s:13}),"Sign in");
  }
  const email = (window.cloudUserEmail && window.cloudUserEmail(session)) || "Account";
  const initial = (email[0]||"?").toUpperCase();
  return React.createElement("div",{className:"acct-wrap",ref:ref},
    React.createElement("button",{className:"acct-chip"+(open?" open":""),onClick:()=>setOpen(o=>!o),title:email},
      React.createElement("span",{className:"acct-av"}, initial),
      cloudActive
        ? React.createElement("span",{className:"acct-cloud"},React.createElement(Icon.check,{s:11}),"Synced")
        : React.createElement("span",{className:"acct-cloud warn"},React.createElement(Icon.warn,{s:11}),"Connecting")),
    open && React.createElement("div",{className:"acct-menu"},
      React.createElement("div",{className:"acct-email"}, email),
      React.createElement("div",{className:"acct-status"},
        cloudActive ? "Signed in \u00b7 cloud storage active"
                    : "Signed in, but cloud isn't reachable \u2014 check that the `turn` schema is exposed and the SQL has been run."),
      React.createElement("button",{className:"acct-signout",onClick:()=>{ setOpen(false); onSignOut && onSignOut(); }},
        "Sign out")));
}
window.AccountChip = AccountChip;

/* ProjectSwitcher — current film name + dropdown to switch / create / rename /
   delete projects. Only shown when signed in (cloud mode). */
function ProjectSwitcher({ projects, currentId, onSwitch, onCreate, onRename, onDelete }){
  const [open, setOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(null);   // id being renamed
  const [draft, setDraft] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(()=>{
    if(!open) return;
    const h = e=>{ if(ref.current && !ref.current.contains(e.target)){ setOpen(false); setRenaming(null); } };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[open]);

  const current = (projects||[]).find(p=>p.id===currentId);
  const title = current ? current.title : "Loading\u2026";

  return React.createElement("div",{className:"proj-wrap",ref:ref},
    React.createElement("button",{className:"proj-btn"+(open?" open":""),onClick:()=>setOpen(o=>!o),title:"Switch film"},
      React.createElement(Icon.film,{s:13}),
      React.createElement("span",{className:"proj-name"},title),
      React.createElement(Icon.chevD,{s:12})),
    open && React.createElement("div",{className:"proj-menu"},
      React.createElement("div",{className:"proj-menu-lab"},"Your films"),
      React.createElement("div",{className:"proj-list"},
        (projects||[]).map(p=> renaming===p.id
          ? React.createElement("div",{key:p.id,className:"proj-rename"},
              React.createElement("input",{className:"proj-rename-input",autoFocus:true,value:draft,
                onChange:e=>setDraft(e.target.value),
                onKeyDown:e=>{ if(e.key==="Enter"&&draft.trim()){ onRename(p.id,draft.trim()); setRenaming(null); }
                               if(e.key==="Escape") setRenaming(null); }}),
              React.createElement("button",{className:"proj-rename-ok",onClick:()=>{ if(draft.trim()){ onRename(p.id,draft.trim()); setRenaming(null); } }},
                React.createElement(Icon.check,{s:13})))
          : React.createElement("div",{key:p.id,className:"proj-row"+(p.id===currentId?" on":"")},
              React.createElement("button",{className:"proj-row-main",onClick:()=>{ onSwitch(p.id); setOpen(false); }},
                React.createElement("span",{className:"proj-dot"}),
                React.createElement("span",{className:"proj-row-name"},p.title)),
              React.createElement("button",{className:"proj-row-act",title:"Rename",
                onClick:()=>{ setRenaming(p.id); setDraft(p.title); }},
                React.createElement(Icon.wand,{s:12})),
              (projects.length>1) && React.createElement("button",{className:"proj-row-act danger",title:"Delete film",
                onClick:async ()=>{ const ok=await window.appConfirm({title:"Delete \u201c"+p.title+"\u201d?",body:"This removes the film and its sheets.",confirmLabel:"Delete",danger:true}); if(ok) onDelete(p.id); }},
                React.createElement(Icon.trash,{s:12}))))),
      React.createElement("button",{className:"proj-new",onClick:()=>{ onCreate("Untitled film"); setOpen(false); }},
        React.createElement(Icon.plus,{s:13}),"New film")));
}
window.ProjectSwitcher = ProjectSwitcher;
