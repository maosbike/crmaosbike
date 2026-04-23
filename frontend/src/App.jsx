import { useState, useEffect } from "react";
import { api, setToken, clearToken } from "./services/api";
import { Ic, S, TY, mapTicket, ROLES, hasRole, ROLE_ADMIN_WRITE, ROLE_ADMIN_READ, TERMINAL_STATUSES } from "./ui";
import { OverdueLeadsModal } from "./components/OverdueLeadsModal";

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
import { AccountingView } from "./components/AccountingView";

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
  const[showOverdueModal,setShowOverdueModal]=useState(false);
  const[overdueResolved,setOverdueResolved]=useState(new Set());
  // Prefill de cliente cuando se navega a "ventas" desde un lead
  const[saleClient,setSaleClient]=useState(null);
  const[saleNoteType,setSaleNoteType]=useState(null); // 'venta' | 'reserva' — abre el modal de inmediato

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

  // Caducidad por inactividad — una pestaña olvidada con sesión activa se cierra
  // sola tras INACTIVITY_MS sin interacción del usuario. Evita que otra persona
  // tome la cuenta de alguien ausente y previene sesiones perpetuas vía refresh
  // cookie. Sólo cuenta interacción real (mouse/teclado/scroll/touch); actividad
  // de red en segundo plano no reinicia el contador.
  useEffect(()=>{
    if(!user)return;
    const INACTIVITY_MS = 30*60*1000; // 30 minutos
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const EVENTS = ['mousedown','keydown','touchstart','scroll','wheel'];
    EVENTS.forEach(e=>window.addEventListener(e,bump,{passive:true}));
    const expireIfIdle = () => {
      if(Date.now() - lastActivity > INACTIVITY_MS){
        handleLogout();
      }
    };
    const onVisibility = () => {
      if(document.visibilityState==='visible') expireIfIdle();
      else bump(); // al irse a background, marcamos "última actividad" ahora
    };
    document.addEventListener('visibilitychange', onVisibility);
    const iv = setInterval(expireIfIdle, 30*1000);
    return () => {
      EVENTS.forEach(e=>window.removeEventListener(e,bump));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(iv);
    };
  },[user?.id]);

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

  // Fase 3 — modal bloqueante de seguimiento. Solo se dispara para vendedores
  // que entran al módulo de leads y tienen leads con needs_attention pendientes.
  useEffect(()=>{
    if(page!=='leads')return;
    if(!hasRole(user,ROLES.VEND))return;
    const pending=leads.filter(l=>
      l.needs_attention&&
      !TERMINAL_STATUSES.includes(l.status)&&
      !overdueResolved.has(l.id)&&
      (l.seller_id==null||l.seller_id===user.id)
    );
    if(pending.length>0)setShowOverdueModal(true);
  },[page,leads]);

  if(sessionLoading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface-muted)"}}><img src="/logo.png" alt="MaosBike" style={{height:48,opacity:0.5}}/></div>;
  if(!user)return<Login onLogin={setUser}/>;
  if(user.forceChange)return<ForceChangeView user={user} onChanged={u=>{setUser(u);}}/>;

  const reloadLeads=()=>fetchAllTickets().then(all=>setLeads(all.map(mapTicket))).catch(()=>{});

  const nav=(pg,lid,opts)=>{
    if(pg==="ticket"&&lid){
      setSelLead(leads.find(l=>l.id===lid)||{id:lid,fn:'',ln:'',timeline:[]});
      api.getTicket(lid).then(d=>{
        const tl=(d.timeline||[]).map(t=>({id:t.id,type:t.type,title:t.title,note:t.note,method:t.method,date:t.created_at,user_fn:t.user_fn,user_ln:t.user_ln,user_role:t.user_role,evidence_url:t.evidence_url,evidence_type:t.evidence_type}));
        const full={...mapTicket(d),timeline:tl};
        setSelLead(full);
        setLeads(p=>p.map(l=>l.id===lid?full:l));
      }).catch(()=>{});
    }
    if(opts&&opts.saleClient){
      setSaleClient(opts.saleClient);
      setSaleNoteType(opts.openNoteType||null);
    }else if(pg!=="sales"){
      setSaleClient(null);
      setSaleNoteType(null);
    }
    setPage(pg);
  };

  const updLead=(id,u)=>{setLeads(p=>p.map(l=>l.id===id?{...l,...u}:l));if(selLead?.id===id)setSelLead(p=>({...p,...u}));};
  const addLead=l=>setLeads(p=>[l,...p]);
  const r=user.role;

  // Fase 3 — leads a mostrar en el modal bloqueante (filtra ya resueltos en esta sesión)
  const overdueLeads=leads
    .filter(l=>
      l.needs_attention&&
      !TERMINAL_STATUSES.includes(l.status)&&
      !overdueResolved.has(l.id)&&
      (l.seller_id==null||l.seller_id===user.id)
    )
    .sort((a,b)=>new Date(a.needs_attention_since)-new Date(b.needs_attention_since));

  const handleOverdueResolved=(ticketId)=>{
    setOverdueResolved(prev=>new Set([...prev,ticketId]));
    updLead(ticketId,{needs_attention:false,needs_attention_since:null});
  };
  const handleOverdueDone=()=>{
    setShowOverdueModal(false);
    setOverdueResolved(new Set());
  };
  const handleViewLead=(id)=>{
    setShowOverdueModal(false);
    nav('ticket',String(id));
  };

  const PAGE_LABELS = {
    dashboard: 'Dashboard',
    leads: 'Leads',
    pipeline: 'Pipeline',
    calendar: 'Calendario',
    inventory: 'Inventario',
    sales: 'Ventas',
    'supplier-payments': 'Pagos a proveedor',
    accounting: 'Contabilidad',
    catalog: 'Catálogo',
    reports: 'Reportes',
    admin: 'Administración',
    import: 'Importar datos',
    priceimport: 'Importar precios',
    ticket: 'Leads',
  };
  const getCurrentPageLabel = (pg) => PAGE_LABELS[pg] || '';

  const items=[
    {id:"dashboard",icon:Ic.home,label:"Dashboard"},
    ...(r!=="backoffice"?[{id:"leads",icon:Ic.leads,label:"Leads"},{id:"pipeline",icon:Ic.kanban,label:"Pipeline"}]:[]),
    {id:"calendar",icon:Ic.cal,label:"Calendario"},
    {id:"inventory",icon:Ic.box,label:"Inventario"},
    {id:"sales",icon:Ic.sale,label:"Ventas"},
    ...(hasRole(user, ...ROLE_ADMIN_WRITE)?[{id:"supplier-payments",icon:Ic.invoice,label:"Pagos proveedor"}]:[]),
    ...(hasRole(user, ...ROLE_ADMIN_WRITE)?[{id:"accounting",icon:Ic.chart,label:"Contabilidad"}]:[]),
    {id:"catalog",icon:Ic.bike,label:"Catálogo"},
    ...(hasRole(user, ...ROLE_ADMIN_READ)?[{id:"reports",icon:Ic.chart,label:"Reportes"}]:[]),
    ...(hasRole(user, ROLES.SUPER)?[{id:"admin",icon:Ic.gear,label:"Admin"},{id:"import",icon:Ic.dl,label:"Importar"},{id:"priceimport",icon:Ic.tag,label:"Importar Precios"}]:[]),
  ];

  // Agrupación visual del sidebar. Los grupos definen separadores y labels.
  // La lógica de items (rol, visibilidad) NO cambia — solo se agrega presentación.
  const SIDEBAR_GROUPS = [
    {
      label: 'Comercial',
      ids: ['dashboard','leads','pipeline','calendar','reports'],
    },
    {
      label: 'Stock y Ventas',
      ids: ['catalog','inventory','sales','supplier-payments','accounting'],
    },
    {
      label: 'Configuración',
      ids: ['admin','import','priceimport'],
    },
  ];

  return(
    <div style={{display:"flex",height:"100vh",background:"var(--surface-muted)",color:"var(--text)",fontFamily:"'Inter',system-ui,sans-serif",fontSize:14,overflow:"hidden"}}>
      <MobileDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} items={items} page={page} nav={(pg,lid)=>{setDrawerOpen(false);nav(pg,lid);}} user={user} onChangePw={()=>{setDrawerOpen(false);setShowChangePw(true);}} onLogout={handleLogout}/>
      <aside className="crm-sidebar" style={{width:220,minWidth:220,height:'100vh',background:'#FFFFFF',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0}}>
        <button onClick={()=>nav('dashboard')} title="Ir al dashboard"
          style={{height:72,display:'flex',alignItems:'center',justifyContent:'flex-start',padding:'0 20px',borderBottom:'1px solid var(--surface-sunken)',flexShrink:0,background:'transparent',border:'none',borderBottomWidth:1,borderBottomStyle:'solid',borderBottomColor:'var(--surface-sunken)',cursor:'pointer',width:'100%',fontFamily:'inherit'}}>
          <img src="/logo.png" alt="MaosBike" style={{height:44,objectFit:'contain'}}
            onError={e=>{e.currentTarget.style.display='none';e.currentTarget.nextSibling.style.display='flex';}}
          />
          <div style={{width:40,height:40,borderRadius:8,background:'var(--brand)',display:'none',alignItems:'center',justifyContent:'center'}}>
            <Ic.bike size={22} color="#fff"/>
          </div>
        </button>
        <nav style={{flex:1,padding:'8px 8px',display:'flex',flexDirection:'column',overflowY:'auto'}}>
          {SIDEBAR_GROUPS.map((group,gi)=>{
            const groupItems=items.filter(it=>group.ids.includes(it.id));
            if(groupItems.length===0)return null;
            return(
              <div key={group.label}>
                <div style={{...TY.micro,padding:'12px 12px 4px',color:'#C4C9D4',marginTop:gi===0?0:4}}>{group.label}</div>
                {groupItems.map(it=>{
                  const act=page===it.id||(it.id==='leads'&&page==='ticket');
                  return(
                    <button key={it.id} onClick={()=>nav(it.id)} style={{
                      display:'flex',alignItems:'center',gap:10,
                      padding:'8px 12px 8px 16px',marginBottom:1,
                      borderRadius:8,
                      background:act?'var(--brand-soft)':'transparent',
                      color:act?'#C2680A':'var(--text-muted)',
                      fontSize:13,fontWeight:act?600:500,
                      border:'none',cursor:'pointer',width:'100%',textAlign:'left',
                      userSelect:'none',fontFamily:'inherit',
                      position:'relative',
                    }}>
                      {act&&<div style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',width:3,height:20,background:'var(--brand)',borderRadius:'0 3px 3px 0'}}/>}
                      <it.icon size={15} color={act?'#C2680A':'var(--text-muted)'}/>
                      {it.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div style={{padding:'12px 14px',borderTop:'1px solid var(--surface-sunken)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <div style={{width:30,height:30,borderRadius:'50%',background:'var(--brand-soft)',color:'#C2680A',fontWeight:700,fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:'inherit'}}>
            {(user.fn[0]+(user.ln&&user.ln!=='-'?user.ln[0]:'')).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{...TY.bodyB,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.fn} {user.ln&&user.ln!=='-'?user.ln:''}</div>
            <div style={{...TY.meta,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.branchName||user.role}</div>
          </div>
          <button onClick={()=>setShowChangePw(true)} style={{...S.gh,padding:4}} title="Cambiar contraseña"><Ic.lock size={14} color="var(--text-subtle)"/></button>
          <button onClick={handleLogout} style={{...S.gh,padding:4}} title="Cerrar sesión"><Ic.out size={14} color="var(--text-subtle)"/></button>
        </div>
      </aside>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        <header className="crm-mobile-hdr" style={{display:"none",height:64,alignItems:"center",justifyContent:"space-between",padding:"0 14px",borderBottom:"1px solid var(--border)",background:"#FFFFFF",flexShrink:0,gap:10}}>
          <button onClick={()=>nav('dashboard')} title="Ir al dashboard"
            style={{display:"flex",alignItems:"center",gap:8,background:'transparent',border:'none',padding:0,cursor:'pointer',fontFamily:'inherit'}}>
            <img src="/logo.png" alt="MaosBike" style={{height:36}}/>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text-subtle)"}}>CRM</span>
          </button>
          <NotifBell nav={nav}/>
        </header>
        <header className="crm-desktop-hdr" style={{height:52,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',background:'#FFFFFF',borderBottom:'1px solid var(--border)',flexShrink:0}}>
          <span style={{...TY.h3,color:'var(--text-subtle)'}}>{getCurrentPageLabel(page)}</span>
          <div style={{display:'flex',alignItems:'center',gap:8}}><NotifBell nav={nav}/></div>
        </header>
        <main className="crm-scroll-area" style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
          {page==="dashboard"&&<Dashboard leads={leads} inv={inv} user={user} nav={nav} branches={realBranches}/>}
          {page==="leads"&&<LeadsList leads={leads} user={user} nav={nav} addLead={addLead} onRefresh={reloadLeads} realBranches={realBranches} filter={leadsFilter} onFilterChange={setLeadsFilter}/>}
          {page==="pipeline"&&<PipelineView leads={leads} user={user} nav={nav} updLead={updLead}/>}
          {page==="ticket"&&selLead&&<TicketView lead={selLead} user={user} nav={nav} updLead={updLead}/>}
          {page==="inventory"&&<InventoryView inv={inv} setInv={setInv} user={user} realBranches={realBranches} nav={nav}/>}
          {page==="sales"&&<SalesView user={user} realBranches={realBranches} prefillClient={saleClient} prefillNoteType={saleNoteType} onPrefillConsumed={()=>{setSaleClient(null);setSaleNoteType(null);}}/>}
          {page==="supplier-payments"&&<SupplierPaymentsView user={user}/>}
          {page==="accounting"&&hasRole(user,...ROLE_ADMIN_WRITE)&&<AccountingView user={user}/>}
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
      {showOverdueModal&&overdueLeads.length>0&&(
        <OverdueLeadsModal
          overdueLeads={overdueLeads}
          onResolved={handleOverdueResolved}
          onDone={handleOverdueDone}
          onViewLead={handleViewLead}
        />
      )}
    </div>
  );
}
