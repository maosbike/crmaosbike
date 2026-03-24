// ─── Shared UI: constants, styles, icons, utils ───────────────────────────────

// Constants
export const TICKET_STATUS={abierto:{l:"Abierto",c:"#3B82F6"},en_gestion:{l:"En Gestión",c:"#F59E0B"},cotizado:{l:"Cotizado",c:"#8B5CF6"},financiamiento:{l:"Financiamiento",c:"#F28100"},ganado:{l:"Ganado",c:"#10B981"},perdido:{l:"Perdido",c:"#EF4444"},cerrado:{l:"Cerrado",c:"#6B7280"}};
export const PRIORITY={alta:{l:"Alta",c:"#EF4444"},media:{l:"Media",c:"#F59E0B"},baja:{l:"Baja",c:"#6B7280"}};
export const SRC={web:"Web",redes_sociales:"RRSS",whatsapp:"WhatsApp",presencial:"Presencial",referido:"Referido",evento:"Evento",llamada:"Llamada"};
export const COMUNAS=["Huechuraba","Providencia","Las Condes","La Florida","Maipú","Santiago Centro","Ñuñoa","Vitacura","Puente Alto","San Bernardo","Cerrillos","Recoleta","Independencia","Quilicura","Lo Barnechea","Peñalolén","La Reina","Macul","San Miguel","Otra"];
export const RECHAZO_MOTIVOS=["Renta insuficiente","Sin continuidad laboral","No cuenta con pie inicial solicitado","Sin ingresos acreditables","Mal comportamiento de pago","Morosidad vigente","Edad fuera de rango","Otro"];
export const SIT_LABORAL=["Dependiente","Independiente","Jubilado","Estudiante","Sin actividad"];
export const CONTINUIDAD=["Menos de 6 meses","6 a 12 meses","Mayor a 12 meses","Mayor a 24 meses"];
export const FIN_STATUS={sin_movimiento:{l:"Sin Movimiento",c:"#6B7280"},en_evaluacion:{l:"En Evaluación",c:"#F59E0B"},aprobado:{l:"Aprobado",c:"#10B981"},rechazado:{l:"Rechazado",c:"#EF4444"},desistido:{l:"Desistido",c:"#6B7280"}};
export const PAYMENT_TYPES=["Contado","Transferencia","Tarjeta Débito","Tarjeta Crédito","Crédito Autofin","Mixto"];
export const INV_ST={disponible:{l:"Disponible",c:"#10B981"},reservada:{l:"Reservada",c:"#F59E0B"},vendida:{l:"Vendida",c:"#8B5CF6"},preinscrita:{l:"Preinscrita",c:"#06B6D4"}};

// Utils
export const fmt=(n)=>n?"$"+Number(n).toLocaleString("es-CL"):"$0";
export const fD=(d)=>d?new Date(d).toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"}):"-";
export const fDT=(d)=>d?new Date(d).toLocaleString("es-CL",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"-";
export const ago=(d)=>{if(!d)return"";const m=Math.floor((Date.now()-new Date(d).getTime())/6e4);if(m<60)return m+"min";const h=Math.floor(m/60);if(h<24)return h+"h";return Math.floor(h/24)+"d";};
export const mapTicket=(t)=>{
  const pv=t.post_venta||{factura:false,pagoReg:false,homSol:false,homRec:false,enrolada:false,entregada:false};
  return{
    id:t.id,num:t.ticket_num,
    fn:t.first_name,ln:t.last_name||'',
    rut:t.rut||'',bday:t.birthdate||'',
    email:t.email||'',phone:t.phone||'',
    comuna:t.comuna||'',source:t.source||'presencial',
    branch:null,
    branch_id:t.branch_id||null,branch_name:t.branch_name||'',
    branch_code:t.branch_code||'',branch_addr:t.branch_addr||'',
    seller:null,seller_fn:t.seller_fn||'',seller_ln:t.seller_ln||'',
    seller_id:t.assigned_to||null,
    status:t.status||'abierto',priority:t.priority||'media',
    motoId:null,
    model_brand:t.moto_brand||null,model_name:t.moto_model||null,
    colorPref:t.color_pref||'',wantsFin:t.wants_financing||false,
    sitLab:t.sit_laboral||'',continuidad:t.continuidad||'',
    renta:t.renta||0,pie:t.pie||0,
    testRide:t.test_ride||false,
    finStatus:t.fin_status||'sin_movimiento',
    finInst:t.fin_institution||'Autofin',
    rechazoMotivo:t.rechazo_motivo||null,
    obsVendedor:t.obs_vendedor||'',obsSupervisor:t.obs_supervisor||'',
    createdAt:t.created_at,lastContact:t.last_contact_at||null,
    sla_status:t.sla_status||null,sla_deadline:t.sla_deadline||null,
    first_action_at:t.first_action_at||null,
    postVenta:typeof pv==='string'?JSON.parse(pv):pv,
    timeline:[],fin_data:t.fin_data||null,
  };
};

// Icons
const I=({d,s=18,c="currentColor",...p})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d}/></svg>;
export const Ic={
  home:p=><I d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M9 22V12h6v10" {...p}/>,
  users:p=><I d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" {...p}/>,
  kanban:p=><I d="M3 3h6v18H3zM9 3h6v12H9zM15 3h6v8h-6z" {...p}/>,
  box:p=><I d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" {...p}/>,
  sale:p=><I d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18 M16 10a4 4 0 01-8 0" {...p}/>,
  bike:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M12 17V5l4 4M8 9h8"/></svg>,
  chart:p=><I d="M18 20V10 M12 20V4 M6 20v-6" {...p}/>,
  gear:p=><I d="M12 15a3 3 0 100-6 3 3 0 000 6z" {...p}/>,
  out:p=><I d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9" {...p}/>,
  search:p=><I d="M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.35-4.35" {...p}/>,
  plus:p=><I d="M12 5v14 M5 12h14" {...p}/>,
  back:p=><I d="M19 12H5 M12 19l-7-7 7-7" {...p}/>,
  phone:p=><I d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" {...p}/>,
  mail:p=><I d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6" {...p}/>,
  alert:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>,
  check:p=><I d="M20 6L9 17l-5-5" {...p}/>,
  x:p=><I d="M18 6L6 18M6 6l12 12" {...p}/>,
  send:p=><I d="M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z" {...p}/>,
  file:p=><I d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" {...p}/>,
  chev:p=><I d="M9 18l6-6-6-6" {...p}/>,
  bell:p=><I d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0" {...p}/>,
  msg:p=><I d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" {...p}/>,
  clock:p=><I d="M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2" {...p}/>,
  target:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  user:p=><I d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z" {...p}/>,
  dl:p=><I d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3" {...p}/>,
  cal:p=><I d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" {...p}/>,
  remind:p=><I d="M15 17H20L18.6 15.6A7 7 0 0018 14V11a6 6 0 10-12 0v3a7 7 0 00-.6 1.6L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" {...p}/>,
  lock:p=><I d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4" {...p}/>,
  menu:p=><I d="M3 12h18 M3 6h18 M3 18h18" {...p}/>,
  tag:p=><I d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01" {...p}/>,
};

// Styles
export const S={
  card:{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,padding:16},
  inp:{background:"#0E0E0F",border:"1px solid #262626",borderRadius:8,padding:"8px 12px",color:"#FAFAFA",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"},
  btn:{background:"#F28100",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  btn2:{background:"#1A1A1B",color:"#FAFAFA",border:"1px solid #262626",borderRadius:8,padding:"8px 16px",fontWeight:500,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  btnSec:{background:"#1A1A1B",color:"#FAFAFA",border:"1px solid #262626",borderRadius:8,padding:"8px 16px",fontWeight:500,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  gh:{background:"transparent",border:"none",cursor:"pointer",borderRadius:8,fontFamily:"inherit"},
  lbl:{display:"block",fontSize:11,color:"#6B6B6B",marginBottom:4,fontWeight:500},
};

// Shared components
export const Bdg=({l,c,bg})=><span style={{display:"inline-flex",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,color:c,background:bg||`${c}18`,whiteSpace:"nowrap"}}>{l}</span>;
export const TBdg=({s})=>{const x=TICKET_STATUS[s];return x?<Bdg l={x.l} c={x.c}/>:<Bdg l={s} c="#6B6B6B"/>;};
export const PBdg=({p})=>{const x=PRIORITY[p];return x?<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:x.c}}><span style={{width:7,height:7,borderRadius:"50%",background:x.c}}/>{x.l}</span>:null;};
export const Stat=({icon:Ico,ic,ib,label,val,sub,sc,al})=>(
  <div style={{...S.card,display:"flex",flexDirection:"column",gap:4}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{padding:6,borderRadius:8,background:ib}}><Ico size={16} color={ic}/></div><span style={{fontSize:10,color:"#6B6B6B",textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:600}}>{label}</span></div>
    <span style={{fontSize:22,fontWeight:800,color:al?"#EF4444":undefined}}>{val}</span>
    {sub&&<span style={{fontSize:11,color:sc||"#6B6B6B"}}>{sub}</span>}
  </div>
);
export const Modal=({onClose,title,children,wide})=>(
  <div onClick={onClose} className="crm-modal-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:60,padding:16}}>
    <div onClick={e=>e.stopPropagation()} className="crm-modal-inner" style={{background:"#151516",border:"1px solid #262626",borderRadius:16,padding:24,width:"100%",maxWidth:wide?750:480,maxHeight:"90vh",overflow:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontSize:16,fontWeight:700,margin:0}}>{title}</h2><button onClick={onClose} style={{...S.gh,padding:4}}><Ic.x size={18}/></button></div>{children}</div>
  </div>
);
export const Field=({label,value,onChange,type="text",ph,req,opts,rows,disabled})=>{
  const renderInput=()=>{
    if(opts)return <select value={value} onChange={e=>onChange(e.target.value)} style={{...S.inp,width:"100%"}} disabled={disabled}>{opts.map(o=><option key={o.v!==undefined?o.v:o} value={o.v!==undefined?o.v:o}>{o.l||o}</option>)}</select>;
    if(rows)return <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} style={{...S.inp,width:"100%",resize:"vertical"}} placeholder={ph} disabled={disabled}/>;
    return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} required={req} style={{...S.inp,width:"100%"}} disabled={disabled}/>;
  };
  return <div><label style={S.lbl}>{label}</label>{renderInput()}</div>;
};
