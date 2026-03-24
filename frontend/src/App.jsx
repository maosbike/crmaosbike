import { useState, useEffect } from "react";
import { api } from "./services/api";
import { Ic, S, mapTicket } from "./ui";

import { Login } from "./components/Login";
import { ForceChangeView } from "./components/ForceChangeView";
import { MobileDrawer } from "./components/MobileDrawer";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { Dashboard } from "./components/Dashboard";
import { LeadsList } from "./components/LeadsList";
import { PipelineView } from "./components/PipelineView";
import { TicketView } from "./components/TicketView";
import { InventoryView } from "./components/InventoryView";
import { SalesView } from "./components/SalesView";
import { CatalogView } from "./components/CatalogView";
import { ReportsView } from "./components/ReportsView";
import { AdminView } from "./components/AdminView";
import { ImportView } from "./components/ImportView";
import { StagingImportView } from "./components/StagingImportView";
import { CalendarView } from "./components/CalendarView";
import { NotifBell } from "./components/NotifBell";

export default function App(){
  const[user,setUser]=useState(null);
  const[page,setPage]=useState("dashboard");
  const[leads,setLeads]=useState([]);
  const[inv,setInv]=useState([]);
  const[selLead,setSelLead]=useState(null);
  const[showChangePw,setShowChangePw]=useState(false);
  const[drawerOpen,setDrawerOpen]=useState(false);
  const[realBranches,setRealBranches]=useState([]);

  useEffect(()=>{
    if(!user)return;
    api.getTickets({limit:500}).then(d=>setLeads((d.data||[]).map(mapTicket))).catch(()=>{});
    api.getBranches().then(bs=>setRealBranches(bs||[])).catch(()=>{});
    api.getInventory().then(d=>setInv(Array.isArray(d)?d:[])).catch(()=>{});
  },[user?.id]);

  if(!user)return<Login onLogin={setUser}/>;
  if(user.forceChange)return<ForceChangeView user={user} onChanged={u=>{setUser(u);localStorage.setItem("crm_user",JSON.stringify(u));}}/>;

  const reloadLeads=()=>api.getTickets({limit:500}).then(d=>setLeads((d.data||[]).map(mapTicket))).catch(()=>{});

  const nav=(pg,lid)=>{
    if(pg==="ticket"&&lid){
      setSelLead(leads.find(l=>l.id===lid)||{id:lid,fn:'',ln:'',timeline:[]});
      api.getTicket(lid).then(d=>{
        const tl=(d.timeline||[]).map(t=>({id:t.id,type:t.type,title:t.title,note:t.note,method:t.method,date:t.created_at,user_fn:t.user_fn,user_ln:t.user_ln}));
        const full={...mapTicket(d),timeline:tl};
        setSelLead(full);
        setLeads(p=>p.map(l=>l.id===lid?full:l));
      }).catch(()=>{});
    }
    setPage(pg);
  };

  const updLead=(id,u)=>{setLeads(p=>p.map(l=>l.id===id?{...l,...u}:l));if(selLead?.id===id)setSelLead(p=>({...p,...u}));};
  const addLead=l=>setLeads(p=>[l,...p]);
  const r=user.role;

  const items=[
    {id:"dashboard",icon:Ic.home,label:"Dashboard"},
    ...(r!=="backoffice"?[{id:"leads",icon:Ic.users,label:"Leads / Tickets"},{id:"pipeline",icon:Ic.kanban,label:"Pipeline"}]:[]),
    {id:"calendar",icon:Ic.cal,label:"Calendario"},
    {id:"inventory",icon:Ic.box,label:"Inventario"},
    {id:"sales",icon:Ic.sale,label:"Ventas"},
    {id:"catalog",icon:Ic.bike,label:"Catálogo"},
    ...(["super_admin","admin_comercial"].includes(r)?[{id:"reports",icon:Ic.chart,label:"Reportes"}]:[]),
    ...(r==="super_admin"?[{id:"admin",icon:Ic.gear,label:"Admin"},{id:"import",icon:Ic.dl,label:"Importar"},{id:"priceimport",icon:Ic.tag,label:"Importar Precios"}]:[]),
  ];

  return(
    <div style={{display:"flex",height:"100vh",background:"#0A0A0B",color:"#FAFAFA",fontFamily:"'Montserrat',system-ui,sans-serif",fontSize:14,overflow:"hidden"}}>
      <MobileDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} items={items} page={page} nav={(pg,lid)=>{setDrawerOpen(false);nav(pg,lid);}} user={user} onChangePw={()=>{setDrawerOpen(false);setShowChangePw(true);}} onLogout={()=>setUser(null)}/>
      <aside className="crm-sidebar" style={{width:210,background:"#111112",borderRight:"1px solid #1E1E1F",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 14px",height:52,borderBottom:"1px solid #1E1E1F"}}><div style={{width:30,height:30,borderRadius:8,background:"#F28100",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic.bike size={17} color="white"/></div><span style={{fontSize:14,fontWeight:700}}>MaosBike <span style={{color:"#F28100"}}>CRM</span></span></div>
        <nav style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:1}}>{items.map(it=>{const act=page===it.id||(it.id==="leads"&&page==="ticket");return<button key={it.id} onClick={()=>nav(it.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,fontFamily:"inherit",background:act?"rgba(242,129,0,0.1)":"transparent",color:act?"#F28100":"#A3A3A3"}}><it.icon size={16}/>{it.label}</button>;})}</nav>
        <div style={{borderTop:"1px solid #1E1E1F",padding:10}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:"50%",background:"rgba(242,129,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:10,fontWeight:700}}>{(user.fn[0]+(user.ln&&user.ln!=='-'?user.ln[0]:'')).toUpperCase()}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600}}>{user.fn}</div><div style={{fontSize:9,color:"#555"}}>{user.branchName||user.role}</div></div><button onClick={()=>setShowChangePw(true)} style={{...S.gh,padding:4}} title="Cambiar contraseña"><Ic.lock size={14} color="#555"/></button><button onClick={()=>setUser(null)} style={{...S.gh,padding:4}} title="Cerrar sesión"><Ic.out size={14} color="#555"/></button></div></div>
      </aside>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        <header className="crm-mobile-hdr" style={{display:"none",height:52,alignItems:"center",justifyContent:"space-between",padding:"0 14px",borderBottom:"1px solid #1E1E1F",background:"#111112",flexShrink:0,gap:10}}>
          <button onClick={()=>setDrawerOpen(true)} style={{...S.gh,padding:6}}><Ic.menu size={22} color="#A3A3A3"/></button>
          <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:24,height:24,borderRadius:6,background:"#F28100",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic.bike size={13} color="white"/></div><span style={{fontSize:13,fontWeight:700}}>MaosBike <span style={{color:"#F28100"}}>CRM</span></span></div>
          <NotifBell nav={nav}/>
        </header>
        <header className="crm-desktop-hdr" style={{height:48,display:"flex",alignItems:"center",justifyContent:"flex-end",padding:"0 18px",borderBottom:"1px solid #1E1E1F",background:"rgba(17,17,18,0.7)",flexShrink:0}}><NotifBell nav={nav}/></header>
        <main className="crm-scroll-area" style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
          {page==="dashboard"&&<Dashboard leads={leads} inv={inv} user={user} nav={nav} branches={realBranches}/>}
          {page==="leads"&&<LeadsList leads={leads} user={user} nav={nav} addLead={addLead} onRefresh={reloadLeads} realBranches={realBranches}/>}
          {page==="pipeline"&&<PipelineView leads={leads} user={user} nav={nav} updLead={updLead}/>}
          {page==="ticket"&&selLead&&<TicketView lead={selLead} user={user} nav={nav} updLead={updLead}/>}
          {page==="inventory"&&<InventoryView inv={inv} setInv={setInv} user={user} realBranches={realBranches}/>}
          {page==="sales"&&<SalesView leads={leads} user={user}/>}
          {page==="catalog"&&<CatalogView user={user}/>}
          {page==="reports"&&<ReportsView leads={leads} branches={realBranches}/>}
          {page==="admin"&&<AdminView/>}
          {page==="import"&&r==="super_admin"&&<ImportView/>}
          {page==="priceimport"&&r==="super_admin"&&<StagingImportView/>}
          {page==="calendar"&&<CalendarView user={user} nav={nav}/>}
        </main>
      </div>
      {showChangePw&&<ChangePasswordModal onClose={()=>setShowChangePw(false)}/>}
    </div>
  );
}
