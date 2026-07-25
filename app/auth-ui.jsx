/* auth-ui.jsx — sign-in / sign-up modal + the top-bar account chip.
   Rendered by app.jsx. Local-first: signing in is optional; it switches the app
   from browser-local storage to the Supabase cloud. */

/* `light` — the Paper & Ink variant used over the marketing landing page;
   without it the modal keeps the app's dark theme. */
function AuthModal({ onClose, onAuthed, initialMode, plan, light }){
  const [mode, setMode] = React.useState(initialMode==="signup"?"signup":"signin");   // signin | signup
  // the tier carried from the landing pricing (writer/director/studio) — shown as a
  // chip so the visitor sees their choice followed them into signup
  const planObj = (window.CINEMA_PLANS||[]).find(p=>String(p.tier).toLowerCase()===String(plan||"").toLowerCase());
  const planName = planObj ? (planObj.name+" plan · "+planObj.price+"/mo") : null;
  const [email, setEmail] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const forgot = async ()=>{
    const e = email.trim();
    if(!e){ setErr("Enter your email above, then tap “Forgot password”."); return; }
    if(typeof window.cloudResetPassword!=="function"){ setErr("Password reset isn’t available."); return; }
    setErr(""); setNotice(""); setBusy(true);
    try{
      const { error } = await window.cloudResetPassword(e);
      if(error){ setErr(error.message || "Couldn’t send the reset link."); }
      else setNotice("Reset link sent. Check your email.");
    }catch(ex){ setErr((ex && ex.message) || "Network error."); }
    setBusy(false);
  };

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

  return React.createElement("div",{className:"auth-overlay"+(light?" auth-light":""),onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose && onClose(); }},
    React.createElement("div",{className:"auth-panel"+(light?" light":"")},
      React.createElement("div",{className:"auth-head"},
        React.createElement("div",{className:"auth-mark"},"Cinema Machine"),
        light && React.createElement("div",{className:"auth-act"}, mode==="signup"?"Prologue":"Welcome back"),
        React.createElement("div",{className:"auth-title"}, mode==="signup"?"Create your account":"Sign in"),
        (mode==="signup" && planName) && React.createElement("div",{className:"auth-plan"},
          React.createElement(Icon.sparkles,{s:11}), planName, React.createElement("span",{className:"auth-plan-note"},"· checkout opens after signup"))),
      React.createElement("div",{className:"auth-body"},
        notice && React.createElement("div",{className:"auth-notice"}, notice),
        React.createElement("label",{className:"auth-field"},
          React.createElement("span",{className:"auth-lab"},"Email"),
          React.createElement("input",{className:"auth-input",type:"email",autoComplete:"email",value:email,
            placeholder:"you@studio.com",onChange:e=>setEmail(e.target.value),
            onKeyDown:e=>{ if(e.key==="Enter") submit(); }})),
        React.createElement("label",{className:"auth-field"},
          React.createElement("div",{className:"auth-lab-row"},
            React.createElement("span",{className:"auth-lab"},"Password"),
            mode==="signin" && React.createElement("button",{type:"button",className:"auth-forgot",onClick:forgot},"Forgot password?")),
          React.createElement("div",{className:"auth-pw"},
            React.createElement("input",{className:"auth-input",type:showPw?"text":"password",
              autoComplete:mode==="signup"?"new-password":"current-password",value:pw,
              placeholder:mode==="signup"?"At least 6 characters":"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
              onChange:e=>setPw(e.target.value),onKeyDown:e=>{ if(e.key==="Enter") submit(); }}),
            React.createElement("button",{type:"button",className:"auth-pw-toggle",
              "aria-label":showPw?"Hide password":"Show password",title:showPw?"Hide password":"Show password",
              onClick:()=>setShowPw(s=>!s)}, React.createElement(showPw?Icon.eyeOff:Icon.eye,{s:16})))),
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
      // GENERATION CREDITS (video renders debit these) + WRITING-MODEL spend meter
      // (display-only estimate of Claude/text use \u2014 counted per call in ai.jsx)
      (()=>{
        const bal = window.turnCreditBalance;
        const ts = (typeof window.turnTextSpend==="function") ? window.turnTextSpend() : null;
        const since = ts && ts.since ? new Date(ts.since) : null;
        return React.createElement(React.Fragment,null,
          bal && React.createElement("div",{className:"acct-status",title:"Generation credits \u2014 spent by video renders (see the Stage footer for per-render costs)"},
            "Credits: "+bal.remaining+" remaining"+(window.turnIsPaidPlan&&window.turnIsPaidPlan(bal.plan)?(" \u00b7 "+bal.plan+" plan"):"")),
          // upgrade / manage plan \u2014 opens the Cinema Machine plans modal
          window.turnOpenPlans && React.createElement("button",{className:"acct-upgrade",
            onClick:()=>{ setOpen(false); window.turnOpenPlans(); }},
            React.createElement(Icon.sparkles,{s:12}),
            (bal && window.turnIsPaidPlan && window.turnIsPaidPlan(bal.plan)) ? "Change plan" : "Get credits \u00b7 Choose a plan"),
          ts && React.createElement("div",{className:"acct-status",
            title:"Writing model (Claude) use \u2014 every drafting, agent, MUSE and vision-QC call is counted here with a per-model estimate. Display-only: not deducted from your generation credits."},
            "Writing model: "+ts.calls+" call"+(ts.calls===1?"":"s")+" \u00b7 \u2248"+(ts.credits||0)+" credits"
              +(since?(" since "+since.toLocaleDateString()):"")));
      })(),
      React.createElement("button",{className:"acct-signout",onClick:()=>{ setOpen(false); onSignOut && onSignOut(); }},
        "Sign out")));
}
window.AccountChip = AccountChip;

/* ProjectSwitcher — current film name + dropdown to switch / create / rename /
   delete projects. Only shown when signed in (cloud mode). */
/* short creation date for a switcher row — "Jul 12"; when another film shares
   both the name AND the day, the time is appended ("Jul 14 · 09:41") so twins
   stay distinguishable. */
function _projRowDate(p, all){
  const iso = p.created_at || p.updated_at; if(!iso) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US",{ month:"short", day:"numeric" });
  const sameDayTwin = (all||[]).some(o=> o.id!==p.id && o.title===p.title &&
    new Date(o.created_at||o.updated_at||0).toDateString()===d.toDateString());
  return sameDayTwin ? (day+" \u00b7 "+d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })) : day;
}
function ProjectSwitcher({ projects, currentId, onSwitch, onCreate, onRename, onDelete, formatLabel, frameworkLabel, onNewEpisode, onMakeShow, canMakeShow }){
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
  const currentShared = current && current.isShared;
  // Phase 3 grouping: SHOW rows hold the shared bible; episodes nest beneath them
  // STABLE ORDER (user ruling 2026-07-14): films sort by CREATION date, newest
  // first — never by last-updated, so the list doesn't reshuffle as you work
  const _byCreated = (a,b)=> new Date(b.created_at||b.updated_at||0) - new Date(a.created_at||a.updated_at||0);
  const shows = (projects||[]).filter(p=>String(p.isShow)==="true").sort(_byCreated);
  const episodesOf = (sid)=> (projects||[]).filter(p=>p.showId===sid)
    .sort((a,b)=>(Number(a.episodeNo)||0)-(Number(b.episodeNo)||0));
  const standalone = (projects||[]).filter(p=>String(p.isShow)!=="true" && !p.showId).sort(_byCreated);

  const row = (p)=>{
    const canOwn = p.isOwner !== false && !p.isShared;
    return renaming===p.id
    ? React.createElement("div",{key:p.id,className:"proj-rename"},
        React.createElement("input",{className:"proj-rename-input",autoFocus:true,value:draft,
          onChange:e=>setDraft(e.target.value),
          onKeyDown:e=>{ if(e.key==="Enter"&&draft.trim()){ onRename(p.id,draft.trim()); setRenaming(null); }
                         if(e.key==="Escape") setRenaming(null); }}),
        React.createElement("button",{className:"proj-rename-ok",onClick:()=>{ if(draft.trim()){ onRename(p.id,draft.trim()); setRenaming(null); } }},
          React.createElement(Icon.check,{s:13})))
    : React.createElement("div",{key:p.id,className:"proj-row"+(p.id===currentId?" on":"")+(p.showId?" ep":"")},
        React.createElement("button",{className:"proj-row-main",onClick:()=>{ onSwitch(p.id); setOpen(false); }},
          React.createElement("span",{className:"proj-dot"}),
          React.createElement("span",{className:"proj-row-name"},p.title),
          p.isShared && React.createElement("span",{className:"proj-row-share"},"Shared \u00b7 "+(window.teamRoleLabel ? window.teamRoleLabel(p.shareRole) : (p.shareRole||"Collaborator"))),
          // creation date disambiguates same-named films (e.g. a rebuild alongside
          // its original); same-day twins also get the time
          (p.created_at||p.updated_at) && React.createElement("span",{className:"proj-row-date"},_projRowDate(p, projects))),
        canOwn && React.createElement("button",{className:"proj-row-act",title:"Rename",
          onClick:()=>{ setRenaming(p.id); setDraft(p.title); }},
          React.createElement(Icon.wand,{s:12})),
        canOwn && React.createElement("button",{className:"proj-row-act danger",title:p.showId?"Delete episode":"Delete film",
          onClick:async ()=>{ const ok=await window.appConfirm({title:"Delete \u201c"+p.title+"\u201d?",body:p.showId?"This removes the episode (the show's bible and other episodes stay).":"This removes the film and its sheets. If it's your only film, a fresh blank one opens in its place.",confirmLabel:"Delete",danger:true}); if(ok) onDelete(p.id); }},
          React.createElement(Icon.trash,{s:12})));
  };

  return React.createElement("div",{className:"proj-wrap",ref:ref},
    React.createElement("button",{className:"proj-btn"+(open?" open":""),onClick:()=>setOpen(o=>!o),title:"Switch film"},
      React.createElement(Icon.film,{s:13}),
      React.createElement("span",{className:"proj-name"},title),
      currentShared && React.createElement("span",{className:"proj-format shared"},"Shared"),
      formatLabel && React.createElement("span",{className:"proj-format"},formatLabel),
      frameworkLabel && React.createElement("span",{className:"proj-format fw"},frameworkLabel),
      React.createElement(Icon.chevD,{s:12})),
    open && React.createElement("div",{className:"proj-menu"},
      React.createElement("div",{className:"proj-menu-lab"},"Your films"),
      React.createElement("div",{className:"proj-list"},
        standalone.map(row),
        shows.map(s=> React.createElement("div",{key:s.id,className:"proj-show"},
          React.createElement("div",{className:"proj-show-head"},
            React.createElement(Icon.layers,{s:12}),
            React.createElement("span",{className:"proj-show-name"},s.title),
            React.createElement("span",{className:"proj-show-tag"},"Show")),
          episodesOf(s.id).map(row),
          onNewEpisode && s.isOwner !== false && !s.isShared && React.createElement("button",{className:"proj-newep",onClick:()=>{ onNewEpisode(s.id); setOpen(false); }},
            React.createElement(Icon.plus,{s:12}),"New episode")))),
      canMakeShow && onMakeShow && React.createElement("button",{className:"proj-new ghosted",onClick:()=>{ onMakeShow(); setOpen(false); },
        title:"This film becomes Episode 1; its cast, locations, props and lookbook become the show's shared bible"},
        React.createElement(Icon.layers,{s:13}),"Turn this film into a show"),
      React.createElement("button",{className:"proj-new",onClick:()=>{ onCreate("Untitled film"); setOpen(false); }},
        React.createElement(Icon.plus,{s:13}),"New film")));
}
window.ProjectSwitcher = ProjectSwitcher;
