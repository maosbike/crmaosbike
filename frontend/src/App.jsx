import { useState, useEffect } from "react";
import { api, setToken, clearToken } from "./services/api";
import { Ic, S, mapTicket, ROLES, hasRole, ROLE_ADMIN_WRITE, ROLE_ADMIN_READ } from "./ui";

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
import { BottomNav } from "./components/BottomNav";
import { SupplierPaymentsView } from "./components/SupplierPaymentsView";

export default function App(){
  const[user,setUser]=useState(null);
  const[sessionLoading,setSessionLoading]=useState(true);
  const[page,setPage]=useState("dashboard");
  const[leads,setLeads]=useState([]);
  const[inv,setInv]=useState([]);
  const[selLead,setSelLead]=useState(null);
  const[showChangePw,setShowChangePw]=useState(false);
  const[drawerOpen,setDrawerOpen]=useState(false);
  const[realBranches,setRealBranches]=useState([]);
  const[leadsFilter,setLeadsFilter]=useState({search:'',stF:'',brF:'',prF:'',srcF:'',selF:''});

  // Intento de restore silencioso al cargar — usa la cookie httpOnly si existe
  useEffect(()=>{
    (async()=>{
      try{
        const res=await fetch('/api/auth/refresh',{method:'POST',credentials:'include'});
        if(!res.ok){setSessionLoading(false);return;}
        const{token}=await res.json();
        setToken(token);
        const userData=await api.me();
        setUser(userData);
      }catch{}
      finally{setSessionLoading(false);}
    })();
  },[]);

  // Logout real: limpia cookie server-side, token en memoria y estado React
  const handleLogout=async()=>{
    try{await api.logout();}catch{}
    clearToken();
    setUser(null);
  };

  // Carga paginada: trae todas las páginas en chunks de 200 — escala sin tope artificial.
  // Una sola falla silenciosa aquí es aceptable (loader de fondo; errores puntuales
  // se ven cuando el usuario interactúa con un ticket concreto).
  const fetchAllTickets=async()=>{
    const PAGE_SIZE=200, MAX_PAGES=50; // 10.000 tickets tope de seguridad
    const acc=[];
    for(let page=1; page<=MAX_PAGES; page++){
      const r=await api.getTickets({page,limit:PAGE_SIZE});
      const batch=r?.data||[];
      acc.push(...batch);
      const total=typeof r?.total==='number'?r.total:acc.length;
      if(acc.length>=total||batch.length<PAGE_SIZE)break;
    }
    return acc;
  };

  useEffect(()=>{
    if(!user)return;
    fetchAllTickets().then(all=>setLeads(all.map(mapTicket))).catch(()=>{});
    api.getBranches().then(bs=>setRealBranches(bs||[])).catch(()=>{});
    api.getInventory().then(d=>setInv(Array.isArray(d)?d:[])).catch(()=>{});
  },[user?.id]);

  if(sessionLoading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F5F5F7"}}><img src="/logo.png" alt="MaosBike" style={{height:48,opacity:0.5}}/></div>;
  if(!user)return<Login onLogin={setUser}/>;
  if(user.forceChange)return<ForceChangeView user={user} onChanged={u=>{setUser(u);}}/>;

  const reloadLeads=()=>fetchAllTickets().then(all=>setLeads(all.map(mapTicket))).catch(()=>{});

  const nav=(pg,lid)=>{
    if(pg==="ticket"&&lid){
      setSelLead(leads.find(l=>l.id===lid)||{id:lid,fn:'',ln:'',timeline:[]});
      api.getTicket(lid).then(d=>{
        const tl=(d.timeline||[]).map(t=>({id:t.id,type:t.type,title:t.title,note:t.note,method:t.method,date:t.created_at,user_fn:t.user_fn,user_ln:t.user_ln,user_role:t.user_role,evidence_url:t.evidence_url,evidence_type:t.evidence_type}));
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
    ...(r!=="backoffice"?[{id:"leads",icon:Ic.ticket,label:"Leads / Tickets"},{id:"pipeline",icon:Ic.kanban,label:"Pipeline"}]:[]),
    {id:"calendar",icon:Ic.cal,label:"Calendario"},
    {id:"inventory",icon:Ic.box,label:"Inventario"},
    {id:"sales",icon:Ic.sale,label:"Ventas"},
    ...(hasRole(user, ...ROLE_ADMIN_WRITE)?[{id:"supplier-payments",icon:Ic.invoice,label:"Pagos proveedor"}]:[]),
    {id:"catalog",icon:Ic.bike,label:"Catálogo"},
    ...(hasRole(user, ...ROLE_ADMIN_READ)?[{id:"reports",icon:Ic.chart,label:"Reportes"}]:[]),
    ...(hasRole(user, ROLES.SUPER)?[{id:"admin",icon:Ic.gear,label:"Admin"},{id:"import",icon:Ic.dl,label:"Importar"},{id:"priceimport",icon:Ic.tag,label:"Importar Precios"}]:[]),
  ];

  return(
    <div style={{display:"flex",height:"100vh",background:"#F5F5F7",color:"#1a1a1a",fontFamily:"'Inter',system-ui,sans-serif",fontSize:14,overflow:"hidden"}}>
      <MobileDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} items={items} page={page} nav={(pg,lid)=>{setDrawerOpen(false);nav(pg,lid);}} user={user} onChangePw={()=>{setDrawerOpen(false);setShowChangePw(true);}} onLogout={handleLogout}/>
      <aside className="crm-sidebar" style={{width:210,background:"#FFFFFF",borderRight:"1px solid #E5E7EB",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 14px",height:52,borderBottom:"1px solid #E5E7EB"}}><img src="/logo.png" alt="MaosBike" style={{height:28}}/><span style={{fontSize:12,fontWeight:600,color:"#6B7280"}}>CRM</span></div>
        <nav style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:1}}>{items.map(it=>{const act=page===it.id||(it.id==="leads"&&page==="ticket");return<button key={it.id} onClick={()=>nav(it.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,fontFamily:"inherit",background:act?"rgba(242,129,0,0.1)":"transparent",color:act?"#F28100":"#6B7280"}}><it.icon size={16}/>{it.label}</button>;})}</nav>
        <div style={{borderTop:"1px solid #E5E7EB",padding:10}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:"50%",background:"rgba(242,129,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:10,fontWeight:700}}>{(user.fn[0]+(user.ln&&user.ln!=='-'?user.ln[0]:'')).toUpperCase()}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600}}>{user.fn}</div><div style={{fontSize:9,color:"#555"}}>{user.branchName||user.role}</div></div><button onClick={()=>setShowChangePw(true)} style={{...S.gh,padding:4}} title="Cambiar contraseña"><Ic.lock size={14} color="#555"/></button><button onClick={handleLogout} style={{...S.gh,padding:4}} title="Cerrar sesión"><Ic.out size={14} color="#555"/></button></div></div>
      </aside>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        <header className="crm-mobile-hdr" style={{display:"none",height:52,alignItems:"center",justifyContent:"space-between",padding:"0 14px",borderBottom:"1px solid #E5E7EB",background:"#FFFFFF",flexShrink:0,gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><img src="/logo.png" alt="MaosBike" style={{height:22}}/><span style={{fontSize:11,fontWeight:600,color:"#6B7280"}}>CRM</span></div>
          <NotifBell nav={nav}/>
        </header>
        <header className="crm-desktop-hdr" style={{height:48,display:"flex",alignItems:"center",justifyContent:"flex-end",padding:"0 18px",borderBottom:"1px solid #E5E7EB",background:"rgba(255,255,255,0.85)",backdropFilter:"blur(8px)",flexShrink:0}}><NotifBell nav={nav}/></header>
        <main className="crm-scroll-area" style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
          {page==="dashboard"&&<Dashboard leads={leads} inv={inv} user={user} nav={nav} branches={realBranches}/>}
          {page==="leads"&&<LeadsList leads={leads} user={user} nav={nav} addLead={addLead} onRefresh={reloadLeads} realBranches={realBranches} filter={leadsFilter} onFilterChange={setLeadsFilter}/>}
          {page==="pipeline"&&<PipelineView leads={leads} user={user} nav={nav} updLead={updLead}/>}
          {page==="ticket"&&selLead&&<TicketView lead={selLead} user={user} nav={nav} updLead={updLead}/>}
          {page==="inventory"&&<InventoryView inv={inv} setInv={setInv} user={user} realBranches={realBranches} nav={nav}/>}
          {page==="sales"&&<SalesView user={user} realBranches={realBranches}/>}
          {page==="supplier-payments"&&<SupplierPaymentsView user={user}/>}
          {page==="catalog"&&<CatalogView user={user}/>}
          {page==="reports"&&<ReportsView branches={realBranches}/>}
          {page==="admin"&&<AdminView/>}
          {page==="import"&&hasRole(user, ROLES.SUPER)&&<ImportView/>}
          {page==="priceimport"&&hasRole(user, ROLES.SUPER)&&<StagingImportView/>}
          {page==="calendar"&&<CalendarView user={user} nav={nav}/>}
        </main>
      </div>
      <BottomNav page={page} nav={nav} user={user} onMenuOpen={()=>setDrawerOpen(true)}/>
      {showChangePw&&<ChangePasswordModal onClose={()=>setShowChangePw(false)}/>}
    </div>
  );
}
