/* team.jsx — project collaboration UI.
   First collaboration layer: project owners can invite collaborators by email and
   assign a role. Shared projects appear in the collaborator's project switcher
   once supabase/team-collaboration.sql has been run. */

const TEAM_ROLES = [
  { id:"view_only", label:"View-only", blurb:"Can open the project and review it." },
  { id:"writer", label:"Writer", blurb:"Can edit story, script and project materials." },
  { id:"art_director", label:"Art director", blurb:"Can work across Art Room assets and coverage." },
  { id:"producer_admin", label:"Producer/admin", blurb:"Can coordinate edits across the project." },
];
function teamRoleLabel(id){
  const r = TEAM_ROLES.find(x=>x.id===id);
  return r ? r.label : String(id||"Collaborator");
}
function teamCanManage(projectMeta){
  return !!(projectMeta && (projectMeta.isOwner || window.turnIsAdmin));
}

function TeamModal({ projectId, projectTitle, projectMeta, onClose, onChanged }){
  const [members, setMembers] = React.useState([]);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("writer");
  const [busy, setBusy] = React.useState("");
  const [schemaMissing, setSchemaMissing] = React.useState(!!window.turnTeamSchemaMissing);
  const canManage = teamCanManage(projectMeta);
  const load = React.useCallback(async ()=>{
    if(!projectId || typeof window.cloudListProjectMembers!=="function"){ setMembers([]); return; }
    setMembers(await window.cloudListProjectMembers(projectId));
    setSchemaMissing(!!window.turnTeamSchemaMissing);
  },[projectId]);
  React.useEffect(()=>{ load(); },[load]);
  React.useEffect(()=>{ const h=(e)=>{ if(e.key==="Escape") onClose(); }; document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h); },[]);
  const invite = async ()=>{
    if(!canManage || schemaMissing) return;
    setBusy("invite");
    const res = await window.cloudInviteProjectMember(projectId, email, role);
    setBusy("");
    if(res && res.ok){
      setEmail("");
      await load();
      if(onChanged) onChanged();
      if(window.appToast) window.appToast("Collaborator added.","success");
    } else {
      if(res && res.setup) setSchemaMissing(true);
      if(window.appToast) window.appToast((res&&res.message)||"Could not add collaborator.","error");
    }
  };
  const updateRole = async (m, nextRole)=>{
    if(!canManage) return;
    setBusy("role:"+m.id);
    const res = await window.cloudUpdateProjectMember(m.id, { role:nextRole });
    setBusy("");
    if(res && res.ok){ await load(); if(onChanged) onChanged(); }
    else if(window.appToast) window.appToast((res&&res.message)||"Could not update role.","error");
  };
  const remove = async (m)=>{
    if(!canManage) return;
    const ok = !window.appConfirm || await window.appConfirm({
      title:"Remove collaborator?",
      body:"This removes "+m.member_email+" from \""+(projectTitle||"this project")+"\".",
      confirmLabel:"Remove",
      danger:true
    });
    if(!ok) return;
    setBusy("remove:"+m.id);
    const res = await window.cloudRemoveProjectMember(m.id);
    setBusy("");
    if(res && res.ok){ await load(); if(onChanged) onChanged(); }
    else if(window.appToast) window.appToast((res&&res.message)||"Could not remove collaborator.","error");
  };
  return React.createElement("div",{className:"bible-overlay",onMouseDown:e=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"bible-modal team-modal"},
      React.createElement("div",{className:"bible-head"},
        React.createElement("div",{className:"bible-title"},
          React.createElement(Icon.user,{s:15}),"Team",
          React.createElement("span",{className:"bible-sub"},projectTitle||"Current project")),
        React.createElement("button",{className:"bible-x",onClick:onClose,title:"Close"},React.createElement(Icon.x,{s:16}))),
      React.createElement("div",{className:"team-body"},
        React.createElement("div",{className:"team-note"},
          schemaMissing
            ? "Team collaboration is ready in the app, but the Supabase migration has not been run yet. Run supabase/team-collaboration.sql, then reopen this panel."
            : canManage
            ? "Your subscription includes your seat. Add collaborators to this project by email; role permissions are stored now, with finer per-room controls coming next."
            : "This project was shared with you. You can work here according to the role the owner assigned."),
        canManage && React.createElement("div",{className:"team-invite"},
          React.createElement("input",{className:"team-email",type:"email",value:email,placeholder:"teammate@example.com",
            disabled:schemaMissing,onChange:e=>setEmail(e.target.value),onKeyDown:e=>{ if(e.key==="Enter" && email.trim()) invite(); }}),
          React.createElement("select",{className:"team-role",value:role,disabled:schemaMissing,onChange:e=>setRole(e.target.value)},
            TEAM_ROLES.map(r=>React.createElement("option",{key:r.id,value:r.id},r.label))),
          React.createElement("button",{className:"team-add",disabled:schemaMissing||busy==="invite"||!email.trim(),onClick:invite},
            React.createElement(Icon.plus,{s:13}),busy==="invite"?"Adding...":"Add")),
        React.createElement("div",{className:"team-seats"},
          React.createElement("div",{className:"team-seat owner"},
            React.createElement("div",{className:"team-avatar"},React.createElement(Icon.user,{s:14})),
            React.createElement("div",{className:"team-member-main"},
              React.createElement("div",{className:"team-member-email"},"Project owner"),
              React.createElement("div",{className:"team-member-role"},"Owner seat"))),
          members.length
            ? members.map(m=>React.createElement("div",{className:"team-seat",key:m.id},
                React.createElement("div",{className:"team-avatar"},React.createElement(Icon.mail,{s:14})),
                React.createElement("div",{className:"team-member-main"},
                  React.createElement("div",{className:"team-member-email"},m.member_email),
                  React.createElement("div",{className:"team-member-role"},teamRoleLabel(m.role))),
                canManage
                  ? React.createElement("div",{className:"team-member-actions"},
                      React.createElement("select",{className:"team-role compact",value:m.role||"writer",disabled:!!busy,
                        onChange:e=>updateRole(m,e.target.value)},
                        TEAM_ROLES.map(r=>React.createElement("option",{key:r.id,value:r.id},r.label))),
                      React.createElement("button",{className:"team-remove",disabled:!!busy,title:"Remove collaborator",onClick:()=>remove(m)},
                        React.createElement(Icon.trash,{s:13})))
                  : React.createElement("span",{className:"team-badge"},teamRoleLabel(m.role))))
            : React.createElement("div",{className:"team-empty"},"No collaborators yet.")),
        React.createElement("div",{className:"team-foot"},
          schemaMissing
            ? "Setup needed: run the team collaboration SQL once in Supabase so the table and access policies exist."
            : "Roles now control project access. Room-specific permissions and live presence are the next collaboration steps."))));
}

function TeamButton({ projectId, projectTitle, projectMeta, onChanged }){
  const [open, setOpen] = React.useState(false);
  if(!projectId) return null;
  const shared = projectMeta && projectMeta.isShared;
  return React.createElement(React.Fragment,null,
    React.createElement("button",{className:"tb-btn",onClick:()=>setOpen(true),title:shared ? ("Shared with you · "+teamRoleLabel(projectMeta.shareRole)) : "Team collaboration"},
      React.createElement(Icon.user,{s:14}),"Team"),
    open && React.createElement(TeamModal,{projectId,projectTitle,projectMeta,onChanged,onClose:()=>setOpen(false)}));
}

window.TEAM_ROLES = TEAM_ROLES;
window.teamRoleLabel = teamRoleLabel;
window.TeamModal = TeamModal;
window.TeamButton = TeamButton;
