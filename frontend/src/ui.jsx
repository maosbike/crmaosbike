// ─── Shared UI: constants, styles, icons, utils ───────────────────────────────
import { useState, useEffect } from 'react';
import { T } from './tokens';

// Breakpoints + hook — fuente única para ramas isMobile en JS.
export const BP = { MOBILE: 768 };
export function useIsMobile(bp = BP.MOBILE) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < bp
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return isMobile;
}

// Constants
// TICKET_STATUS: fuente única de verdad para colores y labels de estados de lead.
// bg es la versión "light" para strips/badges suaves. Mantener sincronizado con
// backend/src/config/leadStatus.js.
export const TICKET_STATUS={
  nuevo:         {l:"Nuevo",          c:"#06B6D4", bg:"#ECFEFF"},
  abierto:       {l:"Abierto",        c:"#3B82F6", bg:"#EFF6FF"},
  en_gestion:    {l:"En Gestión",     c:"#F59E0B", bg:"#FFFBEB"},
  cotizado:      {l:"Cotizado",       c:"#8B5CF6", bg:"#F5F3FF"},
  financiamiento:{l:"Financiamiento", c:"#F28100", bg:"#FFF7ED"},
  ganado:        {l:"Ganado",         c:"#10B981", bg:"#F0FDF4"},
  perdido:       {l:"Perdido",        c:"#EF4444", bg:"#FEF2F2"},
};
export const STATUS_ORDER      = ['nuevo','abierto','en_gestion','cotizado','financiamiento','ganado','perdido'];
export const ACTIVE_STATUSES   = ['nuevo','abierto','en_gestion','cotizado','financiamiento'];
export const TERMINAL_STATUSES = ['ganado','perdido'];
export const PIPELINE_STAGES   = ACTIVE_STATUSES;
// 5 opciones del seguimiento obligatorio — espejo de backend/src/config/leadStatus.js
export const FOLLOWUP_OPTS = [
  {v:'cliente_interesado',    l:'Cliente sigue interesado'},
  {v:'contactar_mas_adelante',l:'Pidió contactar más adelante'},
  {v:'revisando_cotizacion',  l:'Está revisando cotización'},
  {v:'agendar_visita',        l:'Agendar visita'},
  {v:'no_responde',           l:'No responde'},
];
// Roles — fuente única de verdad. `hasRole(user, ...roles)` centraliza los
// checks repetidos en vistas. No altera la semántica: es solo un alias de
// `roles.includes(user?.role)`.
export const ROLES = {
  SUPER: 'super_admin',
  ADMIN: 'admin_comercial',
  BACK:  'backoffice',
  VEND:  'vendedor',
};
export const hasRole = (user, ...roles) => !!user && roles.includes(user.role);
// Grupos frecuentes — reemplazan los arrays literales repetidos.
export const ROLE_ADMIN_WRITE   = [ROLES.SUPER, ROLES.ADMIN, ROLES.BACK];          // edita inventario/ventas
export const ROLE_ADMIN_READ    = [ROLES.SUPER, ROLES.ADMIN];                        // ve costos/márgenes
export const ROLE_SALES_WRITE   = [ROLES.SUPER, ROLES.ADMIN, ROLES.BACK, ROLES.VEND]; // crea ventas (vendedor con ownership)

export const PRIORITY={alta:{l:"Alta",c:"#EF4444"},media:{l:"Media",c:"#F59E0B"},baja:{l:"Baja",c:"#6B7280"}};
// Paleta determinista compartida — cada vendedor/sucursal tiene siempre
// el mismo color (hash del id/nombre). La usan LeadsList, SalesView,
// PipelineView, OverdueLeadsModal para mantener identidad visual consistente.
export const ID_PALETTE = [
  { c:'#6366F1', bg:'#EEF2FF' }, // indigo
  { c:'#10B981', bg:'#ECFDF5' }, // emerald
  { c:'#F97316', bg:'#FFF7ED' }, // orange
  { c:'#EC4899', bg:'#FDF2F8' }, // pink
  { c:'#8B5CF6', bg:'#F5F3FF' }, // violet
  { c:'#06B6D4', bg:'#ECFEFF' }, // cyan
  { c:'#EAB308', bg:'#FEFCE8' }, // yellow
  { c:'#14B8A6', bg:'#F0FDFA' }, // teal
];
const _hashStr = (s) => {
  const str = String(s ?? '');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};
export const colorFor = (key) => ID_PALETTE[_hashStr(key) % ID_PALETTE.length];
export const SRC={web:"Web",redes_sociales:"RRSS",whatsapp:"WhatsApp",presencial:"Presencial",referido:"Referido",evento:"Evento",llamada:"Llamada"};
export const COMUNAS=["Huechuraba","Providencia","Las Condes","La Florida","Maipú","Santiago Centro","Ñuñoa","Vitacura","Puente Alto","San Bernardo","Cerrillos","Recoleta","Independencia","Quilicura","Lo Barnechea","Peñalolén","La Reina","Macul","San Miguel","Otra"];
export const RECHAZO_MOTIVOS=["Renta insuficiente","Sin continuidad laboral","No cuenta con pie inicial solicitado","Sin ingresos acreditables","Mal comportamiento de pago","Morosidad vigente","Edad fuera de rango","Otro"];
export const SIT_LABORAL=["Dependiente","Independiente","Jubilado","Estudiante","Sin actividad"];
export const CONTINUIDAD=["Menos de 6 meses","6 a 12 meses","Mayor a 12 meses","Mayor a 24 meses"];
export const FIN_STATUS={sin_movimiento:{l:"Sin Movimiento",c:"#6B7280"},en_evaluacion:{l:"En Evaluación",c:"#F59E0B"},aprobado:{l:"Aprobado",c:"#10B981"},rechazado:{l:"Rechazado",c:"#EF4444"},desistido:{l:"Desistido",c:"#6B7280"}};
export const PAYMENT_TYPES=["Contado","Transferencia","Tarjeta Débito","Tarjeta Crédito","Crédito Autofin","Mixto"];
export const INV_ST={disponible:{l:"Disponible",c:"#10B981"},reservada:{l:"Reservada",c:"#F59E0B"},vendida:{l:"Vendida",c:"#8B5CF6"},preinscrita:{l:"Preinscrita",c:"#06B6D4"}};
export const SLA_STATUS={
  normal:    {l:"Sin gestionar",c:"#6B7280",bg:"rgba(107,114,128,0.12)"},
  warning:   {l:"Atender ya",   c:"#F59E0B",bg:"rgba(245,158,11,0.12)"},
  breached:  {l:"Vencido",      c:"#EF4444",bg:"rgba(239,68,68,0.12)"},
  reassigned:{l:"Reasignado",   c:"#8B5CF6",bg:"rgba(139,92,246,0.12)"},
};

// Utils: re-exportados desde utils/format.js (fuente única de verdad)
export { fmt, fD, fDT, ago, normalizeText, normalizeModel, normalizeColor, normalizeChassis, formatRut, formatPhone, parseMoney } from './utils/format.js';
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
    status:t.status||'nuevo',priority:t.priority||'media',
    motoId:null,
    model_brand:t.moto_brand||null,model_name:t.moto_model||null,model_image:t.image_url||null,model_category:t.category||null,model_cc:t.cc||null,model_year:t.moto_year||null,
    model_price:t.moto_price||0,model_bonus:t.moto_bonus||0,
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
    reassignment_count:t.reassignment_count||0,
    postVenta:typeof pv==='string'?JSON.parse(pv):pv,
    timeline:t.timeline||[],fin_data:t.fin_data||null,
    needs_attention:!!t.needs_attention,
    needs_attention_since:t.needs_attention_since||null,
    followup_status:t.followup_status||null,
    followup_note:t.followup_note||null,
    followup_next_step:t.followup_next_step||null,
    next_followup_at:t.next_followup_at||null,
    followup_updated_at:t.followup_updated_at||null,
    last_contact_entry:t.last_contact_entry||null,
    reassignment_summary:t.reassignment_summary||null,
    lastRealActionAt:t.last_real_action_at||null,
  };
};

// Icons
const I=({d,s=18,c="currentColor",...p})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d}/></svg>;
export const Ic={
  home:p=><I d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M9 22V12h6v10" {...p}/>,
  users:p=><I d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" {...p}/>,
  // leads: user-plus — representa prospecto/contacto nuevo en CRMs
  leads:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  transfer:p=><I d="M16 3l4 4-4 4 M20 7H8a4 4 0 00-4 4v1 M8 21l-4-4 4-4 M4 17h12a4 4 0 004-4v-1" {...p}/>,
  ticket:p=><I d="M2 9a1 1 0 011-1h18a1 1 0 011 1v2a2 2 0 000 4v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a2 2 0 000-4V9z M9 12h6" {...p}/>,
  kanban:p=><I d="M3 3h5v13H3z M9.5 3h5v9h-5z M16 3h5v6h-5z" {...p}/>,
  box:p=><I d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" {...p}/>,
  sale:p=><I d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18 M16 10a4 4 0 01-8 0" {...p}/>,
  bike:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17 L8 11 L13 11 L19 17"/><path d="M8 11 L10 7 L13 11"/><path d="M13 11 L16 8"/><line x1="14" y1="8" x2="19" y2="8"/></svg>,
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
  upload:p=><I d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12" {...p}/>,
  invoice:p=><I d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" {...p}/>,
  refresh:p=><I d="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" {...p}/>,
  trash:p=><I d="M3 6h18 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6" {...p}/>,
  edit:p=><I d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" {...p}/>,
};

// Styles
export const S={
  card:{
    background:'#FFFFFF',
    border:'1px solid #E5E7EB',
    borderRadius:12,
    padding:16,
    boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
  },
  secCard:{
    background:'#F9FAFB',
    border:'1px solid #F3F4F6',
    borderRadius:10,
    padding:14,
  },
  btn:{
    background:'#F28100',
    color:'#FFFFFF',
    border:'none',
    borderRadius:8,
    padding:'8px 16px',
    fontSize:13,
    fontWeight:600,
    cursor:'pointer',
    display:'inline-flex',
    alignItems:'center',
    gap:6,
    userSelect:'none',
    whiteSpace:'nowrap',
    lineHeight:'1.4',
    fontFamily:'inherit',
  },
  btn2:{
    background:'#FFFFFF',
    color:'#374151',
    border:'1px solid #D1D5DB',
    borderRadius:8,
    padding:'8px 16px',
    fontSize:13,
    fontWeight:500,
    cursor:'pointer',
    display:'inline-flex',
    alignItems:'center',
    gap:6,
    userSelect:'none',
    whiteSpace:'nowrap',
    lineHeight:'1.4',
    fontFamily:'inherit',
  },
  gh:{
    background:'transparent',
    color:'#6B7280',
    border:'none',
    borderRadius:8,
    padding:'6px 10px',
    fontSize:13,
    fontWeight:500,
    cursor:'pointer',
    display:'inline-flex',
    alignItems:'center',
    gap:6,
    userSelect:'none',
    fontFamily:'inherit',
  },
  inp:{
    border:'1px solid #D1D5DB',
    borderRadius:8,
    padding:'8px 12px',
    fontSize:13,
    color:'#111827',
    background:'#FFFFFF',
    outline:'none',
    width:'100%',
    boxSizing:'border-box',
    lineHeight:'1.4',
    fontFamily:'inherit',
  },
  lbl:{
    fontSize:11,
    fontWeight:600,
    color:'#4B5563',
    display:'block',
    marginBottom:5,
    letterSpacing:'0.01em',
    fontFamily:'inherit',
  },
};
S.btnSec = S.btn2;
// S.lbl usa TY.label como base — sobreescribe solo las props de layout
// No se puede definir con TY al inicio porque TY se declara después en el archivo.
// Esta reasignación asegura coherencia con la escala tipográfica.
S.lbl = { fontSize:11, fontWeight:600, lineHeight:1.3, color:'#4B5563', fontFamily:'inherit', display:'block', marginBottom:5, letterSpacing:'0.01em' };

// Shared components
export const Bdg=({l,c,bg,size})=>{
  const z=size==='sm'?{padding:"2px 7px",fontSize:9,borderRadius:8}:{padding:"3px 10px",fontSize:11,borderRadius:20};
  return <span style={{display:"inline-flex",...z,fontWeight:600,color:c,background:bg||`${c}18`,whiteSpace:"nowrap",fontFamily:'inherit'}}>{l}</span>;
};
export const TBdg=({s})=>{const x=TICKET_STATUS[s];return x?<Bdg l={x.l} c={x.c}/>:<Bdg l={s} c="#6B7280"/>;};
export const PBdg=({p})=>{const x=PRIORITY[p];return x?<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:x.c}}><span style={{width:7,height:7,borderRadius:"50%",background:x.c}}/>{x.l}</span>:null;};
// SlaBdg: muestra estado SLA en lenguaje comercial. fa = first_action_at (si existe, está atendido a tiempo → sin badge)
export const SlaBdg=({s,fa})=>{if(!s||s==='normal'&&fa)return null;const x=SLA_STATUS[s];if(!x)return null;return<Bdg l={x.l} c={x.c} bg={x.bg}/>;};
export const Stat=({icon:Ico,ic,ib,label,val,value,sub,sc,al,color,bg,border,alert,style})=>{
  // Acepta tanto val/al/ic/ib (uso original de KPIs con icono) como
  // value/color/bg/border/alert (forma compacta sin icono, eg. KpiCard migrado).
  const v=val!==undefined?val:value;
  const isAlert=al||alert||false;
  const fg=color||undefined;
  const cardBg=bg||(isAlert?bg:'#FFFFFF');
  const cardBd=border||'#E5E7EB';
  return(
    <div style={{...S.card,display:"flex",flexDirection:"column",gap:4,
      background:isAlert?cardBg:'#FFFFFF',
      border:`1px solid ${isAlert?cardBd:'#E5E7EB'}`,
      boxShadow:isAlert?`0 2px 8px ${cardBd}44`:'0 1px 4px rgba(0,0,0,0.06)',
      ...style,
    }}>
      {Ico&&ib&&(
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{padding:6,borderRadius:8,background:ib}}><Ico size={16} color={ic}/></div>
          <span style={{fontSize:10,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,fontFamily:'inherit'}}>{label}</span>
        </div>
      )}
      {(!Ico||!ib)&&label&&(
        <div style={{fontSize:10,fontWeight:700,color:isAlert?fg:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em',fontFamily:'inherit'}}>{label}</div>
      )}
      <span style={{fontSize:24,fontWeight:800,color:isAlert?fg:fg||undefined,letterSpacing:'-0.02em',lineHeight:1,fontFamily:'inherit'}}>{v}</span>
      {sub&&<span style={{fontSize:11,color:sc||"#6B7280",fontFamily:'inherit'}}>{sub}</span>}
    </div>
  );
};
export const Modal=({onClose,title,children,wide,headerContent})=>(
  <div onClick={onClose} className="crm-modal-overlay" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:80,padding:16}}>
    <div onClick={e=>e.stopPropagation()} className="crm-modal-inner" style={{background:'#FFFFFF',borderRadius:16,width:'100%',maxWidth:wide?680:480,maxHeight:'90vh',overflowY:'auto',position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,0.18)'}}>
      {headerContent ? headerContent : (
        <div style={{padding:'18px 20px 14px',borderBottom:'1px solid #F3F4F6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h2 style={{fontSize:15,fontWeight:700,color:'#111827',margin:0}}>{title}</h2>
          {onClose&&<button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'#9CA3AF',fontSize:20,lineHeight:1,borderRadius:6}}><Ic.x size={18}/></button>}
        </div>
      )}
      <div style={{padding:'20px'}}>{children}</div>
    </div>
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

export const CAT_COLOR={"Commuter":"#3B82F6","Naked":"#8B5CF6","Sport":"#EF4444","Scooter":"#06B6D4","Adventure":"#10B981","Off-Road":"#F59E0B","Touring":"#6366F1","Eléctrica":"#22C55E","Big Bike":"#EC4899","ATV":"#F97316","Cruiser":"#A78BFA"};

// ViewHeader — encabezado único para vistas de módulo.
// size="md" → Inventory/Sales/Leads/Supplier/Catalog (vistas comerciales con CTA).
// size="sm" → Admin/Reports/Calendar/Pipeline/Dashboard (utilidad/consulta).
// Props: preheader, title, subtitle, count+itemLabel+filtered (auto-subtitle), actions.
export function ViewHeader({ preheader, title, subtitle, count, itemLabel='registro', itemLabelPlural, filtered=false, actions, size='md' }) {
  const isMobile = useIsMobile();
  const plural = itemLabelPlural ?? `${itemLabel}s`;
  const autoSub = count != null
    ? <>{count} {count === 1 ? itemLabel : plural}{filtered && <span style={{ color: '#F28100', fontWeight: 700, marginLeft: 4 }}>· filtrado</span>}</>
    : null;
  const sub = subtitle ?? autoSub;
  // size='md': TY.h1 en desktop, 16px en mobile. size='sm': 18px fijo.
  const titleStyle = size === 'md'
    ? (isMobile
        ? { margin:0, fontSize:16, fontWeight:700, lineHeight:1.2, color:'#111827', fontFamily:'inherit' }
        : { margin:0, fontSize:20, fontWeight:700, lineHeight:1.2, color:'#111827', fontFamily:'inherit', letterSpacing:'-0.02em' })
    : { margin:0, fontSize:18, fontWeight:700, lineHeight:1.2, color:'#111827', fontFamily:'inherit', letterSpacing:'-0.01em' };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: isMobile ? 16 : 24 }}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        {preheader && (
          <p style={{ margin: '0 0 3px', fontSize:10, fontWeight:700, color:'#9CA3AF', letterSpacing:'0.08em', textTransform:'uppercase', fontFamily:'inherit' }}>
            {preheader}
          </p>
        )}
        <h1 style={titleStyle}>
          {title}
        </h1>
        {sub && (
          <p style={{ margin: '3px 0 0', fontSize:13, fontWeight:500, color:'#6B7280', fontFamily:'inherit' }}>
            {sub}
          </p>
        )}
      </div>
      {actions && <div className="crm-vh-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{actions}</div>}
    </div>
  );
}

// ─── Primitivas Tier 2 ────────────────────────────────────────────────────────
// Btn — variant × size. Aditivo: S.btn/S.btn2/S.gh siguen funcionales.
// Variants consumen tokens (T.color.brand/danger/surfaceMuted) — sin hex inline.
const _BTN_VARIANTS = {
  primary:   { bg: T.color.brand,        fg: T.color.textOnBrand, border: 'none' },
  secondary: { bg: T.color.surfaceMuted, fg: T.color.textBody,    border: `1px solid ${T.color.borderStrong}` },
  danger:    { bg: T.color.dangerStrong, fg: T.color.textOnBrand, border: 'none' },
  ghost:     { bg: 'transparent',        fg: T.color.textBody,    border: 'none' },
};
const _BTN_SIZES = {
  sm: { padding: `${T.space[1]}px ${T.space[3]}px`,  fs: T.fs.sm,   fw: T.fw.semi },
  md: { padding: `${T.space[2]}px ${T.space[4]}px`,  fs: T.fs.base, fw: T.fw.semi },
  lg: { padding: `${T.space[3]}px ${T.space[5]}px`,  fs: T.fs.md,   fw: T.fw.semi },
};
export function Btn({ variant='primary', size='md', disabled, loading, children, style, ...rest }) {
  const v = _BTN_VARIANTS[variant] || _BTN_VARIANTS.primary;
  const z = _BTN_SIZES[size] || _BTN_SIZES.md;
  const isOff = disabled || loading;
  return (
    <button
      disabled={isOff}
      {...rest}
      style={{
        background: v.bg, color: v.fg, border: v.border,
        borderRadius: T.radius.md, padding: z.padding,
        fontSize: z.fs, fontWeight: z.fw, fontFamily: 'inherit',
        cursor: isOff ? 'default' : 'pointer',
        opacity: isOff ? 0.65 : 1,
        transition: T.transition.fast,
        ...style,
      }}>
      {children}
    </button>
  );
}

// Empty — estado vacío unificado. Copy canon en docs/copy-tier2-draft.md §1.
export function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      textAlign:'center', padding:`${T.space[10]}px ${T.space[5]}px`, gap: T.space[2],
    }}>
      {Icon && (
        <div style={{
          width:48, height:48, borderRadius: T.radius.full,
          background: T.color.surfaceSunken, display:'flex', alignItems:'center', justifyContent:'center',
          marginBottom: T.space[1],
        }}>
          <Icon size={22} color={T.color.textDisabled}/>
        </div>
      )}
      {title && <div style={{ fontSize: T.fs.base, fontWeight: T.fw.bold, color: T.color.textBody }}>{title}</div>}
      {hint && <div style={{ fontSize: T.fs.sm, color: T.color.textSubtle, maxWidth: 320, lineHeight: T.lh.normal }}>{hint}</div>}
      {action && <div style={{ marginTop: T.space[2] }}>{action}</div>}
    </div>
  );
}

// Loader — estado de carga unificado.
export function Loader({ label='Cargando…' }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'center', gap: T.space[2],
      padding: `${T.space[8]}px ${T.space[4]}px`,
      color: T.color.textDisabled, fontSize: T.fs.sm, fontFamily: 'inherit',
    }}>
      <span aria-hidden="true" style={{
        width:14, height:14, borderRadius: T.radius.full,
        border:`2px solid ${T.color.border}`, borderTopColor: T.color.brand,
        animation: 'crm-spin 700ms linear infinite', display:'inline-block',
      }}/>
      <span>{label}</span>
    </div>
  );
}

// selectCtrl / filterLabel — estilos de controles de filtro centralizados.
// Importar en LeadsList, InventoryView, SupplierPaymentsView en lugar de definir local.
export const selectCtrl = {
  height:34, border:'1px solid #E2E8F0', borderRadius:8,
  fontSize:12.5, fontWeight:500, padding:'0 10px', background:'#fff',
  color:'#0F172A', outline:'none', cursor:'pointer',
  fontFamily:'inherit',
};

export const filterLabel = {
  fontSize:9, fontWeight:700, color:'#9CA3AF',
  textTransform:'uppercase', letterSpacing:'0.08em',
  marginBottom:3, display:'block',
};

// ChoiceChip — botón-como-radio. Reemplaza el patrón en TicketView followup/perdido + LeadsList reassign.
const _CHIP_TONES = {
  default: { selBg: T.color.brandSoft,  selFg: T.color.brand,      selBd: T.color.brandMuted,  dotOn: T.color.brand,   dotOff: T.color.borderStrong },
  danger:  { selBg: T.color.dangerSoft, selFg: T.color.dangerDark, selBd: T.color.dangerMuted, dotOn: T.color.danger,  dotOff: T.color.borderStrong },
  brand:   { selBg: T.color.brandSoft,  selFg: T.color.brandHover, selBd: T.color.brandMuted,  dotOn: T.color.brand,   dotOff: T.color.borderStrong },
};
export function ChoiceChip({ selected, tone='default', onClick, children, disabled, style, ...rest }) {
  const t = _CHIP_TONES[tone] || _CHIP_TONES.default;
  return (
    <button type="button" onClick={onClick} disabled={disabled} {...rest}
      style={{
        textAlign:'left', display:'flex', alignItems:'center', gap: T.space[2],
        padding: `${T.space[2]}px ${T.space[3]}px`,
        borderRadius: T.radius.md, cursor: disabled?'default':'pointer', fontFamily:'inherit',
        fontSize: T.fs.sm, fontWeight: selected ? T.fw.bold : T.fw.regular,
        background: selected ? t.selBg : T.color.surfaceMuted,
        color:      selected ? t.selFg : T.color.textBody,
        border: `1.5px solid ${selected ? t.selBd : T.color.border}`,
        opacity: disabled ? 0.6 : 1, transition: T.transition.fast, ...style,
      }}>
      <span style={{
        width:9, height:9, borderRadius: T.radius.full, flexShrink:0,
        background: selected ? t.dotOn : t.dotOff,
      }}/>
      {children}
    </button>
  );
}

// COLOR_CSS_MAP — mapa centralizado nombre→hex para colores de moto.
// Importar colorNameToCss en InventoryView y CatalogView en lugar de definir local.
export const COLOR_CSS_MAP = {
  'Negro':'#1a1a1a','negro':'#1a1a1a',
  'Blanco':'#f5f5f5','blanco':'#f5f5f5',
  'Rojo':'#dc2626','rojo':'#dc2626',
  'Azul':'#2563eb','azul':'#2563eb',
  'Verde':'#16a34a','verde':'#16a34a',
  'Amarillo':'#ca8a04','amarillo':'#ca8a04',
  'Naranja':'#ea580c','naranja':'#ea580c',
  'Gris':'#6b7280','gris':'#6b7280',
  'Plateado':'#9ca3af','plateado':'#9ca3af',
  'Dorado':'#d97706','dorado':'#d97706',
  'Celeste':'#0ea5e9','celeste':'#0ea5e9',
  'Morado':'#7c3aed','morado':'#7c3aed',
  'Café':'#92400e','café':'#92400e',
  'Beige':'#d6b99a','beige':'#d6b99a',
};
export const colorNameToCss = (name) => COLOR_CSS_MAP[name] || COLOR_CSS_MAP[name?.toLowerCase()] || '#9CA3AF';

// ErrorMsg — error inline unificado para formularios.
export function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.20)',
      borderRadius:8, padding:'9px 13px', marginBottom:12,
      fontSize:13, fontWeight:400, lineHeight:1.5, color:'#DC2626', fontFamily:'inherit',
    }}>{msg}</div>
  );
}

/**
 * AccordionSection — sección colapsable con header clickable.
 * Props: title, icon (string/node, opcional), isOpen (bool), onToggle (fn)
 */
/**
 * TY — Escala tipográfica del sistema. Usar con spread: {...TY.h1}
 * No mezclar con fontSizes sueltos. Esta escala reemplaza todos los
 * valores ad-hoc de fontSize/fontWeight en los componentes.
 */
export const TY = {
  // Números grandes / KPIs
  kpi:   { fontSize:28, fontWeight:800, lineHeight:1, letterSpacing:'-0.02em', fontFamily:'inherit' },
  kpiSm: { fontSize:20, fontWeight:700, lineHeight:1, letterSpacing:'-0.01em', fontFamily:'inherit' },

  // Títulos de vista y sección
  h1:    { fontSize:20, fontWeight:700, lineHeight:1.2, color:'#111827', fontFamily:'inherit' },
  h2:    { fontSize:15, fontWeight:700, lineHeight:1.3, color:'#111827', fontFamily:'inherit' },
  h3:    { fontSize:13, fontWeight:600, lineHeight:1.4, color:'#374151', fontFamily:'inherit' },

  // Texto de contenido
  body:  { fontSize:13, fontWeight:400, lineHeight:1.5, color:'#374151', fontFamily:'inherit' },
  bodyB: { fontSize:13, fontWeight:600, lineHeight:1.5, color:'#111827', fontFamily:'inherit' },

  // Labels de campo y texto de tabla
  label: { fontSize:11, fontWeight:600, lineHeight:1.3, color:'#4B5563', fontFamily:'inherit' },
  meta:  { fontSize:11, fontWeight:400, lineHeight:1.3, color:'#6B7280', fontFamily:'inherit' },

  // Headers de tabla, badges, labels de grupo en uppercase
  micro: { fontSize:10, fontWeight:700, lineHeight:1.2, color:'#9CA3AF',
           textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'inherit' },
};

export function AccordionSection({ title, icon, isOpen, onToggle, children }) {
  return (
    <div style={{
      border:'1px solid #F3F4F6', borderRadius:10,
      marginBottom:8, overflow:'hidden',
    }}>
      <button
        onClick={onToggle}
        type="button"
        style={{
          width:'100%', display:'flex', alignItems:'center',
          justifyContent:'space-between',
          padding:'10px 14px',
          background: isOpen ? '#F9FAFB' : '#FFFFFF',
          border:'none', cursor:'pointer', textAlign:'left',
          borderBottom: isOpen ? '1px solid #F3F4F6' : 'none',
          fontFamily:'inherit',
        }}
      >
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          {icon && <span style={{color:'#9CA3AF', fontSize:14}}>{icon}</span>}
          <span style={{fontSize:13, fontWeight:600, color:'#374151'}}>{title}</span>
        </div>
        <span style={{
          fontSize:11, color:'#9CA3AF',
          display:'inline-block',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition:'transform 0.2s',
        }}>▾</span>
      </button>
      {isOpen && (
        <div style={{padding:'14px'}}>
          {children}
        </div>
      )}
    </div>
  );
}
