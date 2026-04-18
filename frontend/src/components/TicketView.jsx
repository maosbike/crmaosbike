import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, ChoiceChip, AccordionSection, TICKET_STATUS, FOLLOWUP_OPTS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ROLES, hasRole, ROLE_ADMIN_READ, useIsMobile } from '../ui.jsx';
import { RemindersTab } from './RemindersTab.jsx';
import { SellFromTicketModal } from './SellFromTicketModal.jsx';

// Formatea teléfono para display: "912345678" → "+56 9 1234 5678"
function formatPhone(raw) {
  if (!raw) return '';
  const s = raw.toString().trim();
  if (/^9\d{8}$/.test(s))   return `+56 9 ${s.slice(1,5)} ${s.slice(5)}`;
  if (/^569\d{8}$/.test(s)) return `+56 9 ${s.slice(3,7)} ${s.slice(7)}`;
  return s;
}

// Formatea RUT para display: "163459779" o "16345977-9" → "16.345.977-9"
function displayRut(raw) {
  if (!raw) return '';
  const s = raw.toString().replace(/\./g, '').trim();
  const [body, dv] = s.includes('-') ? s.split('-') : [s.slice(0, -1), s.slice(-1)];
  if (!body) return raw;
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + (dv || '');
}

const slaBox = (bg, border, color) => ({
  background:bg, border:`1px solid ${border}`, borderRadius:8,
  padding:'7px 10px', marginBottom:8, fontSize:11, color,
  display:'flex', alignItems:'flex-start', gap:6, lineHeight:1.4,
});
const secCard  = S.secCard;
const secTitle = (color='#374151') => ({
  fontSize:9, fontWeight:800, color, textTransform:'uppercase', letterSpacing:'0.14em',
  paddingBottom:7, marginBottom:10, borderBottom:`2px solid ${color}22`,
});

// Resultados que exigen evidencia (screenshot o nota ≥50 chars)
const EVIDENCE_RESULTS=['Contactado','Interesado','Agendó visita','Cotización entregada','Envió documentos'];
// Resultados que solo exigen nota ≥40 chars (intento fallido o sin interés)
const NOTE_RESULTS=['No contesta','Buzón de voz','No interesado'];
const EV_TYPES=[
  {v:'screenshot_whatsapp',l:'WhatsApp'},
  {v:'screenshot_llamada',  l:'Llamada'},
  {v:'archivo',             l:'Otro archivo'},
];

export function TicketView({lead,user,nav,updLead}){
  const isMobile=useIsMobile();
  const[histOpen,setHistOpen]=useState(false);
  // ── Acordeón "Datos del Cliente" ──
  const[openSections,setOpenSections]=useState({identificacion:true,contacto:false,perfil:false,financiamiento:false});
  const toggleSection=(key)=>setOpenSections(prev=>({...prev,[key]:!prev[key]}));
  const m=lead.model_brand?{brand:lead.model_brand,model:lead.model_name,price:lead.model_price||0,bonus:lead.model_bonus||0,year:lead.model_year||2025,cc:lead.model_cc||0,cat:lead.model_category||'',colors:[],image:lead.model_image||null}:null;
  const s={fn:lead.seller_fn||'',ln:lead.seller_ln||''};
  const br={name:lead.branch_name||'',code:lead.branch_code||'',addr:lead.branch_addr||''};
  const isAdmin=hasRole(user, ...ROLE_ADMIN_READ);
  const[realSellers,setRealSellers]=useState([]);
  const[realModels,setRealModels]=useState([]);
  const[assignHistory,setAssignHistory]=useState([]);
  const[assignHistoryErr,setAssignHistoryErr]=useState(null);
  // Ref para detectar cuándo el lead cambió de ID (navegación a otro ticket)
  const leadIdRef=useRef(lead.id);
  // Helper que construye el snapshot de campos sucios
  const buildSnapshot=useCallback((l)=>({fn:l.fn,ln:l.ln,rut:l.rut,bday:l.bday,email:l.email,phone:l.phone,comuna:l.comuna,source:l.source,sitLab:l.sitLab,continuidad:l.continuidad,renta:l.renta,pie:l.pie,wantsFin:l.wantsFin,finStatus:l.finStatus,rechazoMotivo:l.rechazoMotivo,motoId:l.motoId}),[]);
  useEffect(()=>{
    if(isAdmin){
      api.getSellers().then(d=>setRealSellers(Array.isArray(d)?d:[])).catch(()=>{});
      api.getReassignments(lead.id).then(d=>setAssignHistory(Array.isArray(d)?d:[])).catch(ex=>setAssignHistoryErr(ex?.message||'Error al cargar el historial'));
    }
    api.getModels().then(d=>setRealModels(Array.isArray(d)?d:[])).catch(()=>{});
    // Auto-transición: abrir un lead 'nuevo' lo mueve a 'abierto' (persiste en DB).
    // Espera la respuesta del backend antes de mover el estado local — si el PATCH
    // falla, el lead queda en 'nuevo' y el usuario no ve un estado mentiroso.
    if(lead.status==='nuevo'){
      api.updateTicket(lead.id,{status:'abierto'})
        .then(()=>updLead(lead.id,{status:'abierto'}))
        .catch(()=>{/* silencioso: si falla, seguirá mostrándose como 'nuevo' */});
    }
    // Capturar estado inicial — también resetea al cambiar de ticket (nuevo lead.id)
    leadIdRef.current=lead.id;
    savedRef.current=buildSnapshot(lead);
  },[isAdmin,lead.id]);// eslint-disable-line
  // Sincronizar savedRef cuando llega un updLead externo (mismo id, datos distintos)
  // pero solo si el usuario NO tiene cambios pendientes — para no pisar edición activa.
  useEffect(()=>{
    if(lead.id!==leadIdRef.current)return;// cambio de ID ya lo maneja el effect de arriba
    if(!savedRef.current)return;
    const DIRTY_KEYS=['fn','ln','rut','bday','email','phone','comuna','source','sitLab','continuidad','renta','pie','wantsFin','finStatus','rechazoMotivo','motoId'];
    const userIsDirty=DIRTY_KEYS.some(k=>String(lead[k]??'')!==String(savedRef.current[k]??''));
    if(!userIsDirty){
      // No hay cambios pendientes del usuario: resincronizar el baseline con el lead actualizado
      savedRef.current=buildSnapshot(lead);
    }
  },[lead,buildSnapshot]);
  const sellers=realSellers;

  const created=new Date(lead.createdAt).getTime();const now=Date.now();
  const lastC=lead.lastContact?new Date(lead.lastContact).getTime():0;
  const sinContactoH=Math.floor((lastC?(now-lastC):(now-created))/(1e3*60*60));
  const slaReassigned=lead.sla_status==="reassigned";
  const slaBreach=lead.sla_status==="breached";
  const slaWarning=lead.sla_status==="warning";

  const[showSell,setShowSell]=useState(false);
  const[noteForm,setNoteForm]=useState("");
  const[noteErr,setNoteErr]=useState("");

  // ── Modal Registrar Contacto ──
  const[showContact,setShowContact]=useState(false);
  const[cf,setCf]=useState({method:'whatsapp',result:'',note:'',evMode:'file',evType:'screenshot_whatsapp'});
  const[evFile,setEvFile]=useState(null);
  const[evPreview,setEvPreview]=useState(null);
  const[cfErr,setCfErr]=useState('');
  const[cfSaving,setCfSaving]=useState(false);
  const[cfDone,setCfDone]=useState(false);
  const[chatMsg,setChatMsg]=useState('');
  const[chatSending,setChatSending]=useState(false);
  const savedRef=useRef(null);
  // Modal "Marcar como perdido"
  const PERDIDO_MOTIVOS=['Compró en otra marca','No califica para financiamiento','Solo cotizando / sin intención real','No responde','Compró moto usada','Otro motivo'];
  const[perdidoModal,setPerdidoModal]=useState(false);
  const[perdidoMotivo,setPerdidoMotivo]=useState('');
  const[perdidoDetalle,setPerdidoDetalle]=useState('');
  const[perdidoSaving,setPerdidoSaving]=useState(false);

  const needsEvidence=EVIDENCE_RESULTS.includes(cf.result);
  const needsNote=NOTE_RESULTS.includes(cf.result);
  const noteMinLen=needsEvidence?50:needsNote?40:0;

  const resetContact=()=>{
    setCf({method:'whatsapp',result:'',note:'',evMode:'file',evType:'screenshot_whatsapp'});
    setEvFile(null);setEvPreview(null);setCfErr('');setCfDone(false);
  };
  const closeContact=()=>{setShowContact(false);resetContact();};

  const submitContact=async()=>{
    setCfErr('');
    if(!cf.result){setCfErr('Selecciona un resultado antes de continuar.');return;}
    if(needsEvidence){
      if(cf.evMode==='file'&&!evFile){setCfErr('Debes subir una captura de pantalla o cambiar a nota detallada.');return;}
      if(cf.evMode==='note'&&cf.note.trim().length<50){setCfErr(`La nota debe tener al menos 50 caracteres (${cf.note.trim().length}/50).`);return;}
    }
    if(needsNote&&cf.note.trim().length<40){setCfErr(`Para este resultado la nota es obligatoria (mín. 40 caracteres, ${cf.note.trim().length}/40).`);return;}
    setCfSaving(true);
    try{
      // Si hay evidencia con archivo, subirla como entrada de evidencia
      if(needsEvidence&&cf.evMode==='file'&&evFile){
        const fd=new FormData();
        fd.append('file',evFile);
        fd.append('ev_type',cf.evType);
        if(cf.note.trim())fd.append('note',cf.note.trim());
        await api.addEvidence(lead.id,fd);
      } else if(needsEvidence&&cf.evMode==='note'){
        const fd=new FormData();
        fd.append('note',cf.note.trim());
        fd.append('ev_type','nota');
        await api.addEvidence(lead.id,fd);
      }
      // Registrar el contacto en timeline
      const title=`${cf.method.charAt(0).toUpperCase()+cf.method.slice(1)}: ${cf.result}`;
      const noteForTimeline=(needsEvidence||needsNote)?null:cf.note.trim()||null;
      const entry=await api.addTimeline(lead.id,{type:'contact_registered',method:cf.method,title,note:noteForTimeline});
      addTimelineLocal(entry);
      // Reflejo inmediato del estado en UI: si el lead no está en estado avanzado/terminal, pasa a En gestión
      if(!['en_gestion','cotizado','financiamiento','ganado','perdido'].includes(lead.status)){
        updLead(lead.id,{status:'en_gestion'});
      }
      setCfDone(true);
      setTimeout(()=>closeContact(),2200);
    }catch(e){
      setCfErr(e.message||'Error al guardar. Intentá de nuevo.');
    }finally{setCfSaving(false);}
  };

  const upd=(field,val)=>updLead(lead.id,{[field]:val});
  const addTimelineLocal=(entry)=>{updLead(lead.id,{timeline:[entry,...(lead.timeline||[])],first_action_at:lead.first_action_at||entry.created_at||entry.date,lastContact:new Date().toISOString()});};

  const submitNote=async e=>{
    e.preventDefault();
    if(noteForm.trim().length<20){setNoteErr("La nota debe tener al menos 20 caracteres");return;}
    setNoteErr("");
    try{
      const entry=await api.addTimeline(lead.id,{type:"note_added",title:"Nota agregada",note:noteForm.trim()});
      addTimelineLocal(entry);
      setNoteForm("");
    }catch(ex){
      // Sin fallback fantasma: el comentario queda en el input para reintentar.
      setNoteErr(ex?.message||"No se pudo guardar la nota. Revisa la conexión e intenta de nuevo.");
    }
  };
  const sendChat=async()=>{
    if(!chatMsg.trim()||chatSending)return;
    setChatSending(true);
    try{
      const e=await api.addTimeline(lead.id,{type:'internal_comment',title:'Comentario interno',note:chatMsg.trim()});
      addTimelineLocal(e);
      setChatMsg('');
    }catch(ex){
      // Sin fallback fantasma: conservamos el texto en el input para reintentar.
      alert('No se pudo enviar el comentario: '+(ex?.message||'Error de conexión'));
    }finally{setChatSending(false);}
  };
  // Cambio de estado con persistencia real y revert en error
  const handleStatusChange=async(newStatus)=>{
    if(newStatus===lead.status)return;
    if(newStatus==='perdido'){setPerdidoModal(true);setPerdidoMotivo('');setPerdidoDetalle('');return;}
    const prev=lead.status;
    updLead(lead.id,{status:newStatus});
    try{
      await api.updateTicket(lead.id,{status:newStatus});
      const lbl=TICKET_STATUS[newStatus]?.l||newStatus;
      const e=await api.addTimeline(lead.id,{type:'system',title:`Estado → ${lbl}`,note:null});
      addTimelineLocal(e);
    }catch(err){
      updLead(lead.id,{status:prev});
      alert('No se pudo cambiar el estado: '+(err.message||'Error desconocido. Revisa la conexión.'));
    }
  };

  // Confirmar pérdida con motivo
  const confirmPerdido=async()=>{
    if(!perdidoMotivo){alert('Selecciona un motivo antes de continuar.');return;}
    setPerdidoSaving(true);
    const prev=lead.status;
    try{
      const note=perdidoDetalle.trim()||null;
      await api.updateTicket(lead.id,{status:'perdido',rechazo_motivo:perdidoMotivo,obs_vendedor:perdidoDetalle.trim()||undefined});
      updLead(lead.id,{status:'perdido'});
      const e=await api.addTimeline(lead.id,{type:'system',title:`Lead perdido · ${perdidoMotivo}`,note});
      addTimelineLocal(e);
      setPerdidoModal(false);
    }catch(err){
      updLead(lead.id,{status:prev});
      alert('Error al marcar como perdido: '+(err.message||'Error desconocido'));
    }finally{setPerdidoSaving(false);}
  };

  const isGanado=lead.status==="ganado";
  const isPerdido=lead.status==="perdido";

  // ── Modal Seguimiento Obligatorio ── (FOLLOWUP_OPTS viene de ui.jsx)
  const[showFollowup,setShowFollowup]=useState(false);
  const[fq,setFq]=useState({status:'',note:'',nextStep:'',nextAt:''});
  const[fqErr,setFqErr]=useState('');
  const[fqSaving,setFqSaving]=useState(false);
  const resetFq=()=>{setFq({status:'',note:'',nextStep:'',nextAt:''});setFqErr('');};
  const submitFollowup=async()=>{
    setFqErr('');
    if(!fq.status){setFqErr('Selecciona el estado de seguimiento');return;}
    if(fq.note.trim().length<15){setFqErr('El comentario debe tener al menos 15 caracteres');return;}
    if(fq.nextStep.trim().length<5){setFqErr('Indica el próximo paso');return;}
    if(!fq.nextAt){setFqErr('Ingresa la fecha de próxima gestión');return;}
    setFqSaving(true);
    try{
      const res=await api.submitFollowup(lead.id,{
        followup_status:fq.status,
        followup_note:fq.note.trim(),
        followup_next_step:fq.nextStep.trim(),
        next_followup_at:fq.nextAt,
      });
      addTimelineLocal(res.timeline);
      updLead(lead.id,{needs_attention:false,needs_attention_since:null,followup_status:fq.status,followup_note:fq.note.trim(),followup_next_step:fq.nextStep.trim(),next_followup_at:fq.nextAt});
      setShowFollowup(false);
      resetFq();
    }catch(e){setFqErr(e.message||'Error al guardar');}
    finally{setFqSaving(false);}
  };

  return(
    <div style={{ width:'100%' }}>

      {/* ── BREADCRUMB + ACCIONES ── */}
      <div className="crm-ticket-breadcrumb" style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
        <button onClick={()=>nav("leads")}
          style={{ ...S.gh, display:'flex', alignItems:'center', gap:5, padding:'4px 10px',
            fontSize:12, fontWeight:500, color:'#6B7280',
            border:'1px solid #E5E7EB', background:'#FFFFFF', borderRadius:7 }}>
          <Ic.back size={13} color="#9CA3AF"/> Leads
        </button>
        <span style={{ color:'#D1D5DB' }}>›</span>
        <span style={{ fontSize:12, color:'#9CA3AF' }}>#{lead.num}</span>
        <span style={{ color:'#D1D5DB' }}>›</span>
        <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>{lead.fn} {lead.ln}</span>
        {/* Acciones principales — derecha */}
        {(()=>{
          const isEarly=['nuevo','abierto','en_gestion'].includes(lead.status);
          return(
            <div className="crm-ticket-actions" style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
              {!isPerdido&&!isGanado&&(
                <button onClick={()=>{resetContact();setShowContact(true);}}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                    background:'#2563EB', color:'#ffffff', border:'none', borderRadius:8,
                    fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                    boxShadow:'0 2px 8px rgba(37,99,235,0.25)' }}>
                  <Ic.msg size={13} color="#ffffff"/>Registrar contacto
                </button>
              )}
              {!isPerdido&&(
                <button onClick={()=>setShowSell(true)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                    background: isGanado||isEarly?'transparent':'#10B981',
                    color: isGanado?'#10B981':isEarly?'#6B7280':'#ffffff',
                    border: isGanado?'1.5px solid #6EE7B7':isEarly?'1px solid #D1D5DB':'none',
                    borderRadius:8, fontSize:12, fontWeight:isEarly?500:700,
                    cursor:'pointer', fontFamily:'inherit',
                    boxShadow: isGanado||isEarly?'none':'0 2px 8px rgba(16,185,129,0.25)' }}>
                  <Ic.sale size={13} color={isGanado?"#10B981":isEarly?"#6B7280":"#ffffff"}/>
                  {isGanado?'Registrar otra unidad':'Registrar venta'}
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── ACCIONES EN MOBILE — barra fija debajo del breadcrumb ── */}
      {isMobile&&!isPerdido&&(
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          {!isGanado&&(
            <button onClick={()=>{resetContact();setShowContact(true);}}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'10px 14px', background:'#2563EB', color:'#ffffff', border:'none',
                borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                boxShadow:'0 2px 8px rgba(37,99,235,0.25)' }}>
              <Ic.msg size={14} color="#ffffff"/>Registrar contacto
            </button>
          )}
          <button onClick={()=>setShowSell(true)}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              padding:'10px 14px',
              background:isGanado?'transparent':'#10B981',
              color:isGanado?'#10B981':'#ffffff',
              border:isGanado?'1.5px solid #6EE7B7':'none',
              borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
              boxShadow:isGanado?'none':'0 2px 8px rgba(16,185,129,0.25)' }}>
            <Ic.sale size={14} color={isGanado?"#10B981":"#ffffff"}/>
            {isGanado?'Registrar otra unidad':'Registrar venta'}
          </button>
        </div>
      )}

      {/* ── BANNER: Necesita atención ── */}
      {lead.needs_attention&&!isPerdido&&!isGanado&&(
        <div style={{ background:'rgba(239,68,68,0.07)',border:'2px solid rgba(239,68,68,0.3)',borderRadius:12,padding:'14px 18px',marginBottom:12,display:'flex',alignItems:'center',gap:14 }}>
          <Ic.alert size={22} color="#B91C1C"/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14,fontWeight:800,color:'#B91C1C' }}>Este lead lleva más de 48h sin contacto</div>
            <div style={{ fontSize:12,color:'#DC2626',marginTop:2 }}>Registra el seguimiento para continuar gestionando este lead.</div>
          </div>
          <button onClick={()=>{resetFq();setShowFollowup(true);}}
            style={{ padding:'10px 20px',background:'#DC2626',color:'#ffffff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' }}>
            Registrar seguimiento
          </button>
        </div>
      )}

      {/* ── CARD: Próximo paso acordado ── */}
      {lead.followup_next_step&&!isPerdido&&!isGanado&&(()=>{
        const vencida=lead.next_followup_at&&new Date(lead.next_followup_at)<new Date();
        return(
          <div style={{ background:vencida?'rgba(239,68,68,0.05)':'#F0FDF4',border:`1px solid ${vencida?'rgba(239,68,68,0.25)':'#BBF7D0'}`,borderRadius:10,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'flex-start',gap:12 }}>
            <Ic.target size={18} color={vencida?'#EF4444':'#15803D'} style={{ flexShrink:0,marginTop:1 }}/>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:10,fontWeight:700,color:vencida?'#B91C1C':'#15803D',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3 }}>Próximo paso acordado{vencida?' · VENCIDO':''}</div>
              <div style={{ fontSize:12,fontWeight:600,color:'#111827' }}>{lead.followup_next_step}</div>
              {lead.next_followup_at&&<div style={{ fontSize:11,color:vencida?'#EF4444':'#6B7280',marginTop:3,fontWeight:vencida?700:400 }}>{fD(lead.next_followup_at)}</div>}
            </div>
          </div>
        );
      })()}

      {/* ── CARD: Último contacto real (Historial claro) ── */}
      {lead.last_contact_entry&&(
        <div style={{ background:'#F0F9FF',border:'1px solid #BAE6FD',borderRadius:10,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'flex-start',gap:12 }}>
          <Ic.check size={16} color="#0284C7" style={{ flexShrink:0,marginTop:2 }}/>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:10,fontWeight:700,color:'#0284C7',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3 }}>Último contacto real</div>
            <div style={{ fontSize:12,fontWeight:600,color:'#111827' }}>{lead.last_contact_entry.title}</div>
            {lead.last_contact_entry.note&&<div style={{ fontSize:11,color:'#4B5563',marginTop:2,lineHeight:1.4 }}>{lead.last_contact_entry.note}</div>}
            <div style={{ fontSize:10,color:'#9CA3AF',marginTop:4 }}>
              {lead.last_contact_entry.user_fn?`${lead.last_contact_entry.user_fn} ${lead.last_contact_entry.user_ln||''}`:''} · {fDT(lead.last_contact_entry.date||lead.last_contact_entry.created_at)}
              {lead.reassignment_summary?.count>0&&<span style={{ marginLeft:10,background:'rgba(139,92,246,0.12)',color:'#7C3AED',padding:'1px 7px',borderRadius:6,fontWeight:600 }}>{lead.reassignment_summary.count} reasignación{lead.reassignment_summary.count!==1?'es':''}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          HERO DE FICHA — Foto grande + datos del cliente
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        ...S.card, padding:0, overflow:'hidden',
        marginBottom:14, display:'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems:'stretch',
      }}>

        {/* ZONA IZQUIERDA: Foto hero del modelo */}
        <div style={{
          width: isMobile ? '100%' : 360,
          flexShrink:0,
          background: m?.image
            ? '#0F172A'
            : 'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)',
          position:'relative',
          minHeight: isMobile ? 260 : 'auto',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {m?.image ? (
            <img src={m.image} alt={m?.model||''} style={{
              width:'100%', height:'100%',
              objectFit:'cover', display:'block',
              position: isMobile ? 'static' : 'absolute', inset:0,
            }}/>
          ) : (
            <Ic.bike size={64} color="#9CA3AF"/>
          )}
          {/* Overlay con modelo + precio + año */}
          {m && (
            <div style={{
              position:'absolute', left:0, right:0, bottom:0,
              padding:'18px 18px 16px',
              background: m?.image
                ? 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)'
                : 'transparent',
              color:'#FFFFFF',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                {m.year && (
                  <span style={{
                    fontSize:10, fontWeight:800, letterSpacing:'0.06em',
                    padding:'2px 8px', borderRadius:99,
                    background:'rgba(255,255,255,0.2)', color:'#FFFFFF',
                    backdropFilter:'blur(6px)',
                  }}>{m.year}</span>
                )}
                {m.cc>0 && <span style={{ fontSize:11, opacity:0.85 }}>{m.cc}cc</span>}
                {m.cat && <span style={{ fontSize:11, opacity:0.85 }}>· {m.cat}</span>}
              </div>
              <div style={{ fontSize:18, fontWeight:800, letterSpacing:'-0.3px', lineHeight:1.15 }}>
                {m.brand} {m.model}
              </div>
              {m.price>0 && (
                <div style={{ display:'flex', alignItems:'baseline', gap:8, marginTop:6 }}>
                  <span style={{ fontSize:20, fontWeight:900, letterSpacing:'-0.4px' }}>
                    {fmt(m.price-m.bonus)}
                  </span>
                  {m.bonus>0 && (
                    <span style={{ fontSize:11, opacity:0.8 }}>
                      Ahorra {fmt(m.bonus)}
                    </span>
                  )}
                </div>
              )}
              {lead.colorPref && (
                <div style={{ marginTop:8 }}>
                  <span style={{
                    fontSize:10, fontWeight:600, letterSpacing:'0.03em',
                    padding:'3px 9px', borderRadius:6,
                    background:'rgba(255,255,255,0.18)', color:'#FFFFFF',
                    backdropFilter:'blur(6px)',
                  }}>Color · {lead.colorPref}</span>
                </div>
              )}
            </div>
          )}
          {!m && (
            <div style={{
              position:'absolute', inset:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#9CA3AF', fontSize:13, fontWeight:500,
            }}>Sin modelo asignado</div>
          )}
        </div>

        {/* ZONA DERECHA: Info cliente + estado */}
        <div style={{ flex:1, padding:'22px 26px', display:'flex', flexDirection:'column', gap:14, minWidth:0 }}>

          {/* Fila superior: Nombre + badges */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14, flexWrap:'wrap' }}>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#111827', lineHeight:1.15, letterSpacing:'-0.4px', marginBottom:6 }}>
                {lead.fn} {lead.ln}
              </div>
              <div style={{ fontSize:12.5, color:'#4B5563', display:'flex', flexWrap:'wrap', alignItems:'center', gap:10 }}>
                {lead.rut && <span style={{ fontWeight:500 }}>RUT {displayRut(lead.rut)}</span>}
                {lead.phone && (
                  <>
                    <span style={{ color:'#E5E7EB' }}>·</span>
                    <span style={{ fontWeight:500 }}>{formatPhone(lead.phone)}</span>
                  </>
                )}
                {lead.email && (
                  <>
                    <span style={{ color:'#E5E7EB' }}>·</span>
                    <span style={{ fontWeight:500 }}>{lead.email}</span>
                  </>
                )}
              </div>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', flexShrink:0, alignItems:'center' }}>
              <TBdg s={lead.status}/>
              {lead.priority && PRIORITY[lead.priority] && (
                <span style={{
                  fontSize:11, fontWeight:700,
                  padding:'3px 10px', borderRadius:99,
                  color:PRIORITY[lead.priority].c,
                  background:`${PRIORITY[lead.priority].c}18`,
                  border:`1px solid ${PRIORITY[lead.priority].c}30`,
                }}>
                  {PRIORITY[lead.priority].l}
                </span>
              )}
              {sinContactoH>0 && (
                <span style={{
                  fontSize:11, fontWeight:700,
                  padding:'3px 10px', borderRadius:99,
                  color: slaBreach?'#EF4444':slaWarning?'#F97316':'#6B7280',
                  background: slaBreach?'#FEF2F2':slaWarning?'#FFF7ED':'#F3F4F6',
                  border: `1px solid ${slaBreach?'#FECACA':slaWarning?'#FED7AA':'#E5E7EB'}`,
                }}>{sinContactoH}h</span>
              )}
            </div>
          </div>

          {/* SLA alerts */}
          {(slaReassigned||slaBreach||slaWarning)&&(
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {slaReassigned&&<div style={slaBox("rgba(139,92,246,0.07)","rgba(139,92,246,0.22)","#7C3AED")}><Ic.transfer size={12} color="#7C3AED"/><span><strong>Reasignado</strong> · {s.fn}{s.ln?` ${s.ln}`:''}</span></div>}
              {slaBreach&&!slaReassigned&&<div style={slaBox("rgba(239,68,68,0.07)","rgba(239,68,68,0.22)","#EF4444")}><Ic.alert size={12} color="#EF4444"/><span><strong>Vencido</strong> · {sinContactoH}h sin gestión</span></div>}
              {slaWarning&&<div style={slaBox("rgba(249,115,22,0.07)","rgba(249,115,22,0.22)","#F97316")}><Ic.clock size={12} color="#F97316"/><span><strong>Atender ya</strong> · {8-sinContactoH}h restantes</span></div>}
            </div>
          )}

          {/* Estado del lead */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>Estado del lead</div>
            {isPerdido?(
              <div style={{ background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10 }}>
                <Ic.x size={16} color="#EF4444"/>
                <div>
                  <div style={{ fontSize:13,fontWeight:800,color:'#EF4444' }}>Lead Perdido</div>
                  {lead.rechazoMotivo&&<div style={{ fontSize:11,color:'#B91C1C',marginTop:1 }}>{lead.rechazoMotivo}</div>}
                </div>
              </div>
            ):isGanado?(
              <div style={{ background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10 }}>
                <Ic.check size={16} color="#10B981"/>
                <div style={{ fontSize:13,fontWeight:800,color:'#10B981' }}>Lead Ganado</div>
              </div>
            ):(
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {Object.entries(TICKET_STATUS).filter(([k])=>!['ganado','perdido'].includes(k)).map(([k,v])=>{
                  const active=lead.status===k;
                  return(
                    <button key={k} onClick={()=>handleStatusChange(k)}
                      style={{ display:'flex',alignItems:'center',gap:7,padding:'6px 12px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',
                        fontSize:12,fontWeight:active?700:500,textAlign:'left',transition:'all 0.1s',
                        background:active?v.c+'18':'transparent',
                        color:active?v.c:'#6B7280',
                        border:`1.5px solid ${active?v.c+'55':'#E5E7EB'}` }}>
                      <span style={{ width:7,height:7,borderRadius:'50%',flexShrink:0,background:active?v.c:'#D1D5DB',transition:'background 0.1s' }}/>
                      {v.l}
                      {active&&<Ic.check size={11} color={v.c}/>}
                    </button>
                  );
                })}
                <button onClick={()=>handleStatusChange('perdido')}
                  style={{ display:'flex',alignItems:'center',gap:7,padding:'6px 12px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',
                    fontSize:12,fontWeight:500,textAlign:'left',
                    background:'transparent',color:'#9CA3AF',border:'1px dashed #E5E7EB' }}>
                  <span style={{ width:7,height:7,borderRadius:'50%',flexShrink:0,background:'#E5E7EB' }}/>
                  Marcar como perdido
                </button>
              </div>
            )}
          </div>

          {/* Autofin badge */}
          {(() => {
            const fd = lead.fin_data ? (typeof lead.fin_data==='string'?JSON.parse(lead.fin_data):lead.fin_data) : null;
            const ev = fd?.eval_autofin || fd?.pre_eval_autofin;
            if (!ev) return null;
            const color = /aprob/i.test(ev)?'#10B981':/rechaz/i.test(ev)?'#EF4444':'#F59E0B';
            return <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:color+'18', border:`1px solid ${color}40`, fontSize:10, fontWeight:700, color, alignSelf:'flex-start' }}><span style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }}/>Autofin: {ev}</div>;
          })()}

          {/* Meta info con mini-íconos */}
          <div style={{
            display:'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)',
            gap:10, paddingTop:14, borderTop:'1px solid #F3F4F6',
          }}>
            {[
              {label:'Vendedor', val: s.fn ? `${s.fn} ${s.ln||''}`.trim() : 'Sin asignar', icon:<Ic.user size={11} color="#9CA3AF"/>},
              {label:'Sucursal', val: br.name || '—', icon:<Ic.home size={11} color="#9CA3AF"/>},
              {label:'Fuente',   val: SRC[lead.source]||lead.source||'—', icon:<Ic.tag size={11} color="#9CA3AF"/>},
              {label:'Creado',   val: fD(lead.createdAt), icon:<Ic.cal size={11} color="#9CA3AF"/>},
            ].map(item=>(
              <div key={item.label} style={{ display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>
                <span style={{ fontSize:9, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', display:'flex', alignItems:'center', gap:4 }}>
                  {item.icon}{item.label}
                </span>
                <span style={{ fontSize:13, color:'#111827', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>{/* /hero ficha */}

      {/* ══════════════════════════════════════════════════════════
          STRIP DE CONTROLES — modelo, prioridad, test ride, vendedor
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        ...S.card, padding:'14px 18px', marginBottom:14,
        display:'grid',
        gridTemplateColumns: isMobile ? '1fr' : `1fr minmax(180px,auto) minmax(140px,auto)${isAdmin?' 1fr':''}`,
        gap:16, alignItems:'end',
      }}>
        {/* Cambiar modelo */}
        <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:0 }}>
          <label style={S.lbl}>Modelo de interés</label>
          <select value={lead.motoId||""} onChange={e=>upd("motoId",e.target.value)} style={{ ...S.inp, width:'100%', fontSize:12 }}>
            <option value="">Sin modelo</option>
            {realModels.map(mo=><option key={mo.id} value={mo.id}>{mo.brand} {mo.model}{mo.price?` - ${fmt(mo.price)}`:''}</option>)}
          </select>
        </div>
        {/* Prioridad */}
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          <label style={S.lbl}>Prioridad</label>
          <div style={{ display:'flex', gap:4 }}>
            {Object.entries(PRIORITY).map(([k,v])=>{
              const active=lead.priority===k;
              return(
                <button key={k} onClick={async()=>{
                  const prev=lead.priority;
                  updLead(lead.id,{priority:k});
                  try{await api.updateTicket(lead.id,{priority:k});}
                  catch(err){updLead(lead.id,{priority:prev});alert('Error al cambiar prioridad');}
                }} style={{ flex:1, padding:'6px 10px', fontSize:11, fontWeight:700, fontFamily:'inherit', borderRadius:7, cursor:'pointer',
                  border:'none', background:active?v.c:'#F3F4F6', color:active?'#ffffff':'#9CA3AF' }}>
                  {v.l}
                </button>
              );
            })}
          </div>
        </div>
        {/* Test Ride */}
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          <label style={S.lbl}>Test Ride</label>
          <div style={{ display:'flex', gap:4 }}>
            {[true,false].map(v=>(
              <button key={String(v)} onClick={async()=>{const prev=lead.testRide;updLead(lead.id,{testRide:v});try{await api.updateTicket(lead.id,{test_ride:v});}catch(ex){updLead(lead.id,{testRide:prev});alert('No se pudo actualizar Test Ride: '+(ex.message||'Error'));}}}
                style={{ padding:'6px 14px', fontSize:11, fontWeight:700, fontFamily:'inherit', borderRadius:7, cursor:'pointer', border:'none',
                  background: lead.testRide===v?(v?'#10B981':'#374151'):'#F3F4F6', color: lead.testRide===v?'#ffffff':'#9CA3AF' }}>
                {v?'Sí':'No'}
              </button>
            ))}
          </div>
        </div>
        {/* Vendedor asignado (solo admin) */}
        {isAdmin&&(
          <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:0 }}>
            <label style={S.lbl}>Vendedor asignado</label>
            <select value={lead.seller_id||lead.seller||""}
              onChange={async e=>{
                const newId=e.target.value;
                if(!newId||newId===lead.seller_id)return;
                const prevId=lead.seller_id;
                const sl=sellers.find(s=>s.id===newId);
                const slFn=sl?.first_name||sl?.fn||'';
                const slLn=sl?.last_name||sl?.ln||'';
                updLead(lead.id,{seller:newId,seller_id:newId,seller_fn:slFn,seller_ln:slLn});
                try{
                  await api.manualReassign({ticket_id:lead.id,to_user_id:newId});
                  try{
                    const full=await api.getTicket(lead.id);
                    if(full?.timeline)updLead(lead.id,{timeline:full.timeline});
                  }catch{}
                }catch(ex){
                  updLead(lead.id,{seller:prevId,seller_id:prevId});
                  alert('No se pudo reasignar: '+(ex.message||'Error'));
                }
              }}
              style={{ ...S.inp, width:'100%', fontSize:12 }}>
              <option value="">Seleccionar...</option>
              {sellers.map(sl=>{const fn=sl.first_name||sl.fn||'';const ln=sl.last_name||sl.ln||'';const bc=sl.branch_code||'';return<option key={sl.id} value={sl.id}>{fn} {ln}{bc?` - ${bc}`:''}</option>;})}
            </select>
          </div>
        )}
      </div>{/* /strip controles */}

      {/* ══════════════════════════════════════════════════════════
          DATOS CLIENTE + FINANCIAMIENTO — sección principal
      ══════════════════════════════════════════════════════════ */}
      <div style={secCard}>
        <div style={{ padding:'16px 20px 0', borderBottom:'1px solid #F3F4F6', marginBottom:0 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Datos del Cliente</span>
        </div>
        <div style={{ padding:'14px 20px' }}>

          <AccordionSection title="Identificación Personal" icon={<Ic.user size={13} color="#9CA3AF"/>} isOpen={openSections.identificacion} onToggle={()=>toggleSection('identificacion')}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
              <Field label="RUT" value={displayRut(lead.rut)} onChange={v=>upd("rut",v)}/>
              <Field label="Nombre" value={lead.fn} onChange={v=>upd("fn",v)}/>
              <Field label="Apellido" value={lead.ln} onChange={v=>upd("ln",v)}/>
              <Field label="Fecha Nacimiento" value={lead.bday} onChange={v=>upd("bday",v)} ph="DD/MM/AAAA"/>
            </div>
          </AccordionSection>

          <AccordionSection title="Contacto" icon={<Ic.mail size={13} color="#9CA3AF"/>} isOpen={openSections.contacto} onToggle={()=>toggleSection('contacto')}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
              <Field label="Email" value={lead.email} onChange={v=>upd("email",v)} type="email"/>
              <Field label="Celular" value={lead.phone} onChange={v=>upd("phone",v)}/>
              <Field label="Comuna" value={lead.comuna} onChange={v=>upd("comuna",v)} opts={COMUNAS.map(c=>({v:c,l:c}))}/>
              <Field label="Origen" value={lead.source} onChange={v=>upd("source",v)} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/>
            </div>
          </AccordionSection>

          <AccordionSection title="Perfil Financiero" icon={<Ic.chart size={13} color="#9CA3AF"/>} isOpen={openSections.perfil} onToggle={()=>toggleSection('perfil')}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
              <Field label="Situación Laboral" value={lead.sitLab} onChange={v=>upd("sitLab",v)} opts={[{v:"",l:"Seleccionar..."},...SIT_LABORAL.map(s=>({v:s,l:s}))]}/>
              <Field label="Continuidad Laboral" value={lead.continuidad} onChange={v=>upd("continuidad",v)} opts={[{v:"",l:"Seleccionar..."},...CONTINUIDAD.map(c=>({v:c,l:c}))]}/>
              <Field label="Renta Líquida" value={lead.renta} onChange={v=>upd("renta",Number(v))} type="number"/>
              <Field label="Pie" value={lead.pie} onChange={v=>upd("pie",Number(v))} type="number"/>
            </div>
          </AccordionSection>

          <AccordionSection title="Financiamiento" icon={<Ic.invoice size={13} color="#9CA3AF"/>} isOpen={openSections.financiamiento} onToggle={()=>toggleSection('financiamiento')}>
            {/* Toggle — siempre visible primero */}
            <div style={{ padding:'10px 12px', background:'#F9FAFB', borderRadius:8, border:'1px solid #E5E7EB', marginBottom:12 }}>
              <label style={{ ...S.lbl, marginBottom:5 }}>Solicita financiamiento</label>
              <div style={{ display:'flex', gap:6 }}>
                {[true,false].map(v=>(
                  <button key={String(v)} type="button" onClick={()=>upd("wantsFin",v)}
                    style={{ ...S.btn2, padding:'4px 14px', fontSize:12,
                      background:lead.wantsFin===v?(v?"#F28100":"#374151"):"transparent",
                      color:lead.wantsFin===v?"#ffffff":"#9CA3AF",
                      border:lead.wantsFin===v?"none":"1px solid #D1D5DB" }}>
                    {v?"Sí":"No"}
                  </button>
                ))}
              </div>
            </div>
            {/* Estado y detalle — solo si solicita financiamiento */}
            {lead.wantsFin&&(<>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:12 }}>
                <div>
                  <label style={S.lbl}>Estado</label>
                  <select value={lead.finStatus} onChange={e=>upd("finStatus",e.target.value)} style={{ ...S.inp, width:'100%' }}>
                    {Object.entries(FIN_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Motivo de rechazo</label>
                  <select value={lead.rechazoMotivo||""} onChange={e=>upd("rechazoMotivo",e.target.value)}
                    style={{ ...S.inp, width:'100%' }} disabled={lead.finStatus!=="rechazado"}>
                    <option value="">Seleccionar...</option>
                    {RECHAZO_MOTIVOS.map(mo=><option key={mo} value={mo}>{mo}</option>)}
                  </select>
                </div>
              </div>
              {lead.finStatus==="rechazado"&&lead.rechazoMotivo&&(
                <div style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#EF4444' }}>
                  Rechazado: {lead.rechazoMotivo}
                </div>
              )}
              {lead.finStatus==="aprobado"&&(
                <div style={{ background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#10B981' }}>
                  Financiamiento aprobado
                </div>
              )}
            </>)}
            {/* Sin financiamiento — mensaje neutro */}
            {lead.wantsFin===false&&(
              <div style={{ fontSize:12, color:'#9CA3AF', paddingLeft:2 }}>No solicita financiamiento</div>
            )}
          </AccordionSection>
          {/* Barra Guardar datos del cliente — sticky en mobile para que siempre sea visible */}
          {(()=>{
            const DIRTY_KEYS=['fn','ln','rut','bday','email','phone','comuna','source','sitLab','continuidad','renta','pie','wantsFin','finStatus','rechazoMotivo','motoId'];
            const isDirty=!!savedRef.current&&DIRTY_KEYS.some(k=>String(lead[k]??'')!==String(savedRef.current[k]??''));
            return(
              <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:14, marginTop:4, display:'flex', justifyContent:'space-between', alignItems:'center', position: isDirty?'sticky':'static', bottom:0, background:'var(--surface)', zIndex:10, paddingBottom: isDirty?10:0, boxShadow: isDirty?'0 -2px 8px rgba(0,0,0,0.08)':'none' }}>
                {isDirty?(
                  <span style={{ fontSize:11, fontWeight:700, color:'#F28100', background:'#FFF7ED', padding:'3px 10px', borderRadius:6, border:'1px solid #FDBA74' }}>Cambios sin guardar</span>
                ):<span/>}
                <button onClick={async()=>{
                  const orig=savedRef.current||{};
                  const LABELS={fn:'Nombre',ln:'Apellido',rut:'RUT',bday:'F. Nacimiento',email:'Email',phone:'Teléfono',comuna:'Comuna',source:'Origen',sitLab:'Sit. Laboral',continuidad:'Continuidad',renta:'Renta',pie:'Pie',wantsFin:'Solicita Fin.',finStatus:'Estado Fin.',rechazoMotivo:'Mot. Rechazo',motoId:'Modelo'};
                  const changed=Object.keys(LABELS).filter(k=>String(lead[k]??'')!==String(orig[k]??''));
                  const payload={first_name:lead.fn,last_name:lead.ln,rut:lead.rut,birthdate:lead.bday,email:lead.email,phone:lead.phone,comuna:lead.comuna,source:lead.source,sit_laboral:lead.sitLab,continuidad:lead.continuidad,renta:lead.renta||null,pie:lead.pie||null,wants_financing:lead.wantsFin,fin_status:lead.finStatus,rechazo_motivo:lead.rechazoMotivo,model_id:lead.motoId||null};
                  try{
                    await api.updateTicket(lead.id,payload);
                    if(changed.length>0){
                      const fmtVal=(k,v)=>{
                        if(v===''||v===null||v===undefined)return '(vacío)';
                        if(k==='renta'||k==='pie')return '$'+Number(v).toLocaleString('es-CL');
                        if(k==='wantsFin')return v?'Sí':'No';
                        return String(v);
                      };
                      const details=changed.map(k=>`${LABELS[k]}: ${fmtVal(k,orig[k])} → ${fmtVal(k,lead[k])}`).join('\n');
                      const e=await api.addTimeline(lead.id,{type:'system',title:`Datos actualizados (${changed.length} campo${changed.length!==1?'s':''})`,note:details});
                      addTimelineLocal(e);
                    }
                    savedRef.current={...orig,...lead};
                  }catch(err){alert('Error al guardar: '+(err.message||'Error desconocido'));}
                }} style={{ ...S.btn, fontSize:12, ...(isDirty?{background:'#F28100',boxShadow:'0 2px 8px rgba(242,129,0,0.28)'}:{}) }}>
                  Guardar datos
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          COMUNICACIÓN INTERNA — visible para todo el equipo
      ══════════════════════════════════════════════════════════ */}
      <div style={secCard}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Comunicación Interna</span>
          <span style={{ fontSize:10, color:'#9CA3AF', background:'#F3F4F6', borderRadius:6, padding:'2px 8px' }}>Solo visible para el equipo</span>
        </div>
        <div style={{ padding:'16px 20px' }}>
          {/* Mensajes */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14, maxHeight:300, overflowY:'auto' }}>
            {(lead.timeline||[]).filter(t=>t.type==='internal_comment').length===0&&(
              <div style={{ textAlign:'center', color:'#9CA3AF', fontSize:12, padding:'16px 0' }}>Aún no hay comentarios. Usa este espacio para comunicarte con el equipo sobre este lead.</div>
            )}
            {(lead.timeline||[]).filter(t=>t.type==='internal_comment').slice().reverse().map((t,i)=>{
              const isMe=(t.user_fn===user.fn&&t.user_ln===user.ln);
              const name=t.user_fn?`${t.user_fn} ${t.user_ln||''}`.trim():'Sistema';
              const role=t.user_role||'';
              const isAdminRole=['super_admin','admin_comercial'].includes(role);
              const roleLabel=isAdminRole?'Admin':role==='vendedor'?'Vendedor':'Equipo';
              const roleColor=isAdminRole?'#F28100':role==='vendedor'?'#2563EB':'#6B7280';
              return(
                <div key={t.id||i} style={{ display:'flex', flexDirection:'column', alignItems:isMe?'flex-end':'flex-start' }}>
                  <div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'#374151' }}>{name}</span>
                    <span style={{ fontSize:9, fontWeight:600, color:roleColor, background:roleColor+'15', padding:'1px 6px', borderRadius:8 }}>{roleLabel}</span>
                    <span style={{ fontSize:9, color:'#9CA3AF' }}>{fDT(t.date||t.created_at)}</span>
                  </div>
                  <div style={{ maxWidth:'80%', background:isMe?'#EFF6FF':'#F9FAFB', borderRadius:isMe?'12px 4px 12px 12px':'4px 12px 12px 12px', padding:'8px 12px', fontSize:12, color:'#374151', border:`1px solid ${isMe?'#BFDBFE':'#E5E7EB'}`, lineHeight:1.45, wordBreak:'break-word' }}>
                    {t.note||t.title}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Input */}
          <div style={{ display:'flex', gap:8 }}>
            <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)}
              maxLength={5000}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}}}
              placeholder="Escribe un comentario para el equipo..." style={{ ...S.inp, flex:1, fontSize:12 }}/>
            <button onClick={sendChat} disabled={!chatMsg.trim()||chatSending}
              style={{ ...S.btn2, padding:'7px 16px', fontSize:12, opacity:(!chatMsg.trim()||chatSending)?0.5:1, cursor:!chatMsg.trim()?'default':'pointer' }}>
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          EVALUACIONES YAMAHA — solo si hay fin_data
      ══════════════════════════════════════════════════════════ */}
      {lead.fin_data && Object.keys(lead.fin_data).length > 0 && (() => {
        const fd = typeof lead.fin_data === 'string' ? JSON.parse(lead.fin_data) : lead.fin_data;
        const hasAutofin = fd.id_autofin || fd.pre_eval_autofin || fd.eval_autofin || fd.obs_autofin;
        if (!hasAutofin) return null;
        const evalColor = (v) => !v ? '#9CA3AF' : /aprob/i.test(v) ? '#10B981' : /rechaz/i.test(v) ? '#EF4444' : '#F59E0B';
        return (
          <div style={secCard}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Autofin</span>
              {fd.id_autofin && <span style={{ fontSize:11, color:'#9CA3AF' }}>ID {fd.id_autofin}</span>}
              {fd.vendedor_ref && <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:'auto' }}>Ref: {fd.vendedor_ref}</span>}
            </div>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:8 }}>
              {fd.pre_eval_autofin && <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6B7280', minWidth:110 }}>Pre-evaluación:</span>
                <span style={{ fontSize:12, fontWeight:700, color:evalColor(fd.pre_eval_autofin) }}>{fd.pre_eval_autofin}</span>
              </div>}
              {fd.eval_autofin && <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6B7280', minWidth:110 }}>Evaluación:</span>
                <span style={{ fontSize:12, fontWeight:700, color:evalColor(fd.eval_autofin) }}>{fd.eval_autofin}</span>
              </div>}
              {fd.obs_autofin && <div style={{ fontSize:11, color:'#6B7280', background:'#F9FAFB', borderRadius:6, padding:'8px 10px', lineHeight:1.5 }}>{fd.obs_autofin}</div>}
              {fd.opcion_compra && <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6B7280', minWidth:110 }}>Opción compra:</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{fd.opcion_compra}</span>
              </div>}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════
          TIMELINE — sección inferior
      ══════════════════════════════════════════════════════════ */}
      <div style={secCard}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #F3F4F6' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Timeline de Gestión</span>
        </div>
        <div style={{ padding:'16px 20px' }}>
          {/* Agregar nota */}
          <form onSubmit={submitNote} style={{ marginBottom:18, padding:12, background:'#F9FAFB', borderRadius:10, border:'1px solid #E5E7EB' }}>
            <label style={{ ...S.lbl, marginBottom:6 }}>Agregar nota <span style={{ color:'#9CA3AF', fontWeight:400 }}>(mín. 20 caracteres)</span></label>
            <textarea value={noteForm} onChange={e=>{setNoteForm(e.target.value);if(noteErr)setNoteErr("");}}
              maxLength={5000}
              rows={3} style={{ ...S.inp, width:'100%', resize:'vertical', marginBottom:6 }}
              placeholder="Ej: Llamé al cliente, dice que está evaluando otras opciones, volver en 3 días..."/>
            {noteErr&&<div style={{ fontSize:11, color:'#EF4444', marginBottom:6 }}>{noteErr}</div>}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:noteForm.length>=20?"#10B981":"#9CA3AF" }}>{noteForm.length}/20</span>
              <button type="submit" style={{ ...S.btn2, padding:'6px 14px', fontSize:12 }}>Guardar nota</button>
            </div>
          </form>
          {/* Entradas */}
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {(lead.timeline||[]).filter(t=>t.type!=='internal_comment').map((t,i)=>{
              const isEvidence=t.type==="contact_evidence";
              const isContact=t.type==="contact_registered"||t.type==="contact";
              const isNote=t.type==="note_added";
              const isSystem=t.type==="system"||t.type==="status";
              const dotColor=isEvidence?"#0D9488":isContact?"#3B82F6":isNote?"#10B981":isSystem?"#F28100":t.type==="reminder_created"?"#8B5CF6":"#9CA3AF";
              const userName=t.user||(t.user_fn?`${t.user_fn} ${t.user_ln||''}`.trim():"Sistema");
              const evTypeLabel={screenshot_whatsapp:'WhatsApp',screenshot_llamada:'Llamada',archivo:'Archivo adjunto',nota:'Nota detallada'};
              const meta=[userName,t.method?`vía ${t.method}`:null,isEvidence&&t.evidence_type?(evTypeLabel[t.evidence_type]||t.evidence_type):null].filter(Boolean).join(' · ');
              return(
                <div key={t.id||i} style={{ display:'flex', gap:12, paddingBottom:12, borderBottom:'1px solid #F9FAFB', marginBottom:0 }}>
                  {/* Punto */}
                  <div style={{ width:8, height:8, borderRadius:'50%', background:dotColor, marginTop:5, flexShrink:0 }}/>
                  {/* Contenido */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:2 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#111827', lineHeight:1.3 }}>{t.title}</span>
                      <span style={{ fontSize:10, color:'#9CA3AF', whiteSpace:'nowrap', flexShrink:0 }}>{fDT(t.date||t.created_at)}</span>
                    </div>
                    {meta&&<div style={{ fontSize:11, color:'#9CA3AF', marginBottom:t.note?4:0 }}>{meta}</div>}
                    {t.note&&<div style={{ fontSize:13, color:'#374151', lineHeight:1.5 }}>{t.note}</div>}
                    {isEvidence&&t.evidence_url&&(
                      <a href={t.evidence_url} target="_blank" rel="noopener noreferrer"
                        style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:6, fontSize:12, fontWeight:600, color:'#0D9488', textDecoration:'none', background:'#CCFBF1', padding:'4px 10px', borderRadius:6 }}>
                        <Ic.file size={12} color="#0D9488"/> Ver evidencia adjunta
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {!(lead.timeline||[]).filter(t=>t.type!=='internal_comment').length&&(
              <div style={{ fontSize:12, color:'#9CA3AF', paddingLeft:4 }}>Sin actividad registrada aún.</div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          RECORDATORIOS — sección inferior
      ══════════════════════════════════════════════════════════ */}
      <div style={secCard}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #F3F4F6' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Recordatorios</span>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <RemindersTab ticketId={lead.id} user={user}/>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          HISTORIAL ASIGNACIÓN — solo admin, acordeón
      ══════════════════════════════════════════════════════════ */}
      {isAdmin&&(
        <div style={secCard}>
          <button onClick={()=>setHistOpen(o=>!o)}
            style={{ width:'100%', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center',
              background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Historial de Asignación</span>
            <span style={{ fontSize:11, color:'#9CA3AF', display:'flex', alignItems:'center', gap:6 }}>
              {lead.reassignment_count>0&&<span style={{ fontWeight:600, padding:'2px 8px', borderRadius:10, background:'rgba(139,92,246,0.1)', color:'#7C3AED' }}>{lead.reassignment_count} reasignación{lead.reassignment_count!==1?"es":""}</span>}
              <Ic.chev size={14} color="#9CA3AF" style={{ transform: histOpen?'rotate(90deg)':'rotate(0deg)', transition:'transform 0.15s' }}/>
            </span>
          </button>
          {histOpen&&(
            <div style={{ padding:'0 20px 18px' }}>
              {assignHistoryErr
                ?<div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'12px 16px', fontSize:12, color:'#B91C1C' }}>No se pudo cargar el historial. Verifica permisos o intenta de nuevo.</div>
                :assignHistory.length===0
                ?<div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:12 }}>Cargando historial...</div>
                :<div style={{ position:'relative', paddingLeft:24 }}>
                  <div style={{ position:'absolute', left:9, top:14, bottom:14, width:2, background:'#E5E7EB', borderRadius:2 }}/>
                  {assignHistory.map((ev,i)=>{
                    const isInit=ev.type==="initial_assignment";
                    const isSLA=ev.reason==="sla_breach";
                    const isManual=ev.reason==="manual";
                    const isCurrent=ev.is_current;
                    const dotC=isInit?"#3B82F6":isSLA?"#EF4444":isManual?"#8B5CF6":"#6B7280";
                    const cardBg=isInit?"rgba(59,130,246,0.05)":isSLA?"rgba(239,68,68,0.05)":isManual?"rgba(139,92,246,0.05)":"rgba(107,114,128,0.04)";
                    const cardBorder=isInit?"rgba(59,130,246,0.18)":isSLA?"rgba(239,68,68,0.18)":isManual?"rgba(139,92,246,0.18)":"rgba(107,114,128,0.1)";
                    return(
                      <div key={ev.id||i} style={{ position:'relative', paddingBottom:i<assignHistory.length-1?14:0, paddingLeft:18 }}>
                        <div style={{ position:'absolute', left:-12, top:11, width:14, height:14, borderRadius:'50%', background:dotC, border:'2px solid #F9FAFB', boxShadow:isCurrent?`0 0 0 3px ${dotC}25`:"none" }}/>
                        <div style={{ padding:'10px 14px', borderRadius:10, background:cardBg, border:`1px solid ${cardBorder}` }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:5 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#111827', lineHeight:1.3 }}>
                              {isInit?<>↳ Asignado a <span style={{ color:dotC }}>{ev.to_name}</span></>:<><span style={{ color:'#6B7280' }}>{ev.from_name}</span> <span style={{ color:dotC, fontWeight:800 }}>→</span> <span style={{ color:'#111827' }}>{ev.to_name}</span></>}
                              {isCurrent&&<span style={{ marginLeft:8 }}><Bdg l="ACTUAL" c="#ffffff" bg="#F28100" size="sm"/></span>}
                            </div>
                            <span style={{ fontSize:10, color:'#9CA3AF', whiteSpace:'nowrap', flexShrink:0 }}>{fDT(ev.created_at)}</span>
                          </div>
                          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:6 }}>
                            <span style={{ fontSize:11, color:'#6B7280' }}>{ev.reason_label}</span>
                            <span style={{ fontSize:11, color:'#9CA3AF' }}>·</span>
                            <span style={{ fontSize:11, color:'#6B7280' }}>por {ev.by_name}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'flex-end' }}>
                            <span style={{ fontSize:10, color:isCurrent?"#F28100":"#9CA3AF", padding:'2px 8px', borderRadius:6, background:isCurrent?"rgba(242,129,0,0.08)":"rgba(0,0,0,0.04)", fontWeight:isCurrent?600:400 }}>
                              {isCurrent?"En curso · "+ev.duration_label:ev.duration_label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            </div>
          )}
        </div>
      )}

      {showSell&&<SellFromTicketModal ticketId={lead.id} lead={lead} user={user} onClose={()=>setShowSell(false)} onSuccess={()=>{updLead(lead.id,{status:"ganado"});}}/>}

      {/* ══ MODAL SEGUIMIENTO OBLIGATORIO ═══════════════════════ */}
      {showFollowup&&<Modal
        onClose={!fqSaving?()=>{setShowFollowup(false);resetFq();}:undefined}
        headerContent={
          <div style={{ margin:'-24px -24px 0',padding:'18px 22px',borderBottom:'1px solid #FEE2E2',background:'#FFF5F5',display:'flex',justifyContent:'space-between',alignItems:'center',borderRadius:'16px 16px 0 0' }}>
            <div>
              <div style={{ fontSize:15,fontWeight:800,color:'#B91C1C' }}>Registrar seguimiento</div>
              <div style={{ fontSize:11,color:'#EF4444',marginTop:1 }}>#{lead.num} · {lead.fn} {lead.ln}</div>
            </div>
            {!fqSaving&&<button onClick={()=>{setShowFollowup(false);resetFq();}} style={{ background:'none',border:'none',cursor:'pointer',padding:4,color:'#9CA3AF',lineHeight:1,borderRadius:6 }}><Ic.x size={18}/></button>}
          </div>
        }
      >
        <div style={{ display:'flex',flexDirection:'column',gap:14,marginTop:20 }}>
          {/* Estado de seguimiento */}
          <div>
            <div style={{ fontSize:11,fontWeight:700,color:'#374151',marginBottom:8 }}>¿Cuál es el estado actual del seguimiento?</div>
            <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
              {FOLLOWUP_OPTS.map(o=>(
                <ChoiceChip key={o.v} tone="danger" selected={fq.status===o.v} onClick={()=>setFq(p=>({...p,status:o.v}))}>
                  {o.l}
                </ChoiceChip>
              ))}
            </div>
          </div>
          {/* Comentario */}
          <div>
            <label style={{ ...S.lbl,marginBottom:5 }}>Comentario breve <span style={{ color:'#EF4444' }}>*</span> <span style={{ fontWeight:400,color:'#9CA3AF' }}>(mín. 15 caracteres)</span></label>
            <textarea value={fq.note} onChange={e=>setFq(p=>({...p,note:e.target.value}))}
              maxLength={5000}
              rows={3} style={{ ...S.inp,width:'100%',resize:'vertical',fontSize:12 }}
              placeholder="Ej: Llamé al cliente, dice que va a hablar con su pareja antes de decidir..."/>
            <div style={{ textAlign:'right',fontSize:10,color:fq.note.length>=15?'#10B981':'#9CA3AF',marginTop:2 }}>{fq.note.length}/15</div>
          </div>
          {/* Próximo paso */}
          <div>
            <label style={{ ...S.lbl,marginBottom:5 }}>Próximo paso <span style={{ color:'#EF4444' }}>*</span></label>
            <input value={fq.nextStep} onChange={e=>setFq(p=>({...p,nextStep:e.target.value}))}
              maxLength={500}
              style={{ ...S.inp,width:'100%',fontSize:12 }} placeholder="Ej: Volver a llamar el jueves a las 15:00"/>
          </div>
          {/* Fecha próxima gestión */}
          <div>
            <label style={{ ...S.lbl,marginBottom:5 }}>Fecha próxima gestión <span style={{ color:'#EF4444' }}>*</span></label>
            <input type="date" value={fq.nextAt} onChange={e=>setFq(p=>({...p,nextAt:e.target.value}))}
              min={new Date().toISOString().split('T')[0]}
              style={{ ...S.inp,width:'100%',fontSize:12 }}/>
          </div>
          {fqErr&&<div style={{ background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#DC2626',fontWeight:600,display:'flex',alignItems:'flex-start',gap:6 }}><Ic.alert size={14} color="#DC2626" style={{ flexShrink:0,marginTop:1 }}/>{fqErr}</div>}
          <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
            {!fqSaving&&<button onClick={()=>{setShowFollowup(false);resetFq();}} style={{ ...S.btn2,padding:'9px 18px',fontSize:12 }}>Cancelar</button>}
            <button onClick={submitFollowup} disabled={fqSaving}
              style={{ ...S.btn,padding:'9px 20px',fontSize:12,fontWeight:700,background:'#DC2626',borderColor:'#B91C1C',opacity:fqSaving?0.6:1 }}>
              {fqSaving?'Guardando...':'Confirmar seguimiento'}
            </button>
          </div>
        </div>
      </Modal>}

      {/* ══ MODAL MARCAR COMO PERDIDO ════════════════════════════ */}
      {perdidoModal&&<Modal
        onClose={!perdidoSaving?()=>setPerdidoModal(false):undefined}
        headerContent={
          <div style={{ margin:'-24px -24px 0',padding:'18px 22px',borderBottom:'1px solid #FEE2E2',background:'#FFF5F5',display:'flex',justifyContent:'space-between',alignItems:'center',borderRadius:'16px 16px 0 0' }}>
            <div>
              <div style={{ fontSize:15,fontWeight:800,color:'#B91C1C' }}>Marcar como perdido</div>
              <div style={{ fontSize:11,color:'#EF4444',marginTop:1 }}>#{lead.num} · {lead.fn} {lead.ln}</div>
            </div>
            {!perdidoSaving&&<button onClick={()=>setPerdidoModal(false)} style={{ background:'none',border:'none',cursor:'pointer',padding:4,color:'#9CA3AF',lineHeight:1,borderRadius:6 }}><Ic.x size={18}/></button>}
          </div>
        }
      >
        <div style={{ display:'flex',flexDirection:'column',gap:14,marginTop:20 }}>
          {/* Motivos */}
          <div>
            <div style={{ fontSize:11,fontWeight:700,color:'#374151',marginBottom:8 }}>¿Por qué se perdió este lead?</div>
            <div style={{ display:'flex',flexDirection:'column',gap:5 }}>
              {PERDIDO_MOTIVOS.map(m=>(
                <ChoiceChip key={m} tone="danger" selected={perdidoMotivo===m} onClick={()=>setPerdidoMotivo(m)}>
                  {m}
                </ChoiceChip>
              ))}
            </div>
          </div>
          {/* Detalle libre */}
          <div>
            <label style={{ ...S.lbl,marginBottom:6 }}>Detalle adicional <span style={{ fontWeight:400,color:'#9CA3AF' }}>(opcional)</span></label>
            <textarea value={perdidoDetalle} onChange={e=>setPerdidoDetalle(e.target.value)}
              maxLength={5000}
              rows={3} placeholder="Ej: El cliente compró una Yamaha MT-03 en otro concesionario..."
              style={{ ...S.inp,width:'100%',resize:'vertical',fontSize:12 }}/>
          </div>
          {/* Acciones */}
          <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
            {!perdidoSaving&&<button onClick={()=>setPerdidoModal(false)} style={{ ...S.btn2,fontSize:13 }}>Cancelar</button>}
            <button onClick={confirmPerdido} disabled={!perdidoMotivo||perdidoSaving}
              style={{ ...S.btn,fontSize:13,background:'#EF4444',opacity:!perdidoMotivo||perdidoSaving?0.6:1,cursor:!perdidoMotivo?'default':'pointer',display:'flex',alignItems:'center',gap:7 }}>
              {perdidoSaving?'Guardando...':'Confirmar pérdida'}
            </button>
          </div>
        </div>
      </Modal>}

      {/* ══ MODAL REGISTRAR CONTACTO ══════════════════════════════ */}
      {showContact&&<Modal
        onClose={!cfSaving?closeContact:undefined}
        headerContent={
          <div style={{ margin:'-24px -24px 0',padding:'18px 22px',borderBottom:'1px solid #E5E7EB',background:'#F9FAFB',display:'flex',justifyContent:'space-between',alignItems:'center',borderRadius:'16px 16px 0 0' }}>
            <div>
              <div style={{ fontSize:15,fontWeight:800,color:'#111827' }}>Registrar contacto</div>
              <div style={{ fontSize:11,color:'#9CA3AF',marginTop:1 }}>#{lead.num} · {lead.fn} {lead.ln}</div>
            </div>
            {!cfSaving&&<button onClick={closeContact} style={{ background:'none',border:'none',cursor:'pointer',padding:4,borderRadius:6,color:'#9CA3AF',lineHeight:1 }}><Ic.x size={18}/></button>}
          </div>
        }
      >
        {cfDone?(
          /* ── Estado de éxito ── */
          <div style={{ padding:'40px 24px',textAlign:'center' }}>
            <div style={{ display:'flex',justifyContent:'center',marginBottom:12 }}><Ic.check size={44} color="#10B981"/></div>
            <div style={{ fontSize:16,fontWeight:800,color:'#111827',marginBottom:6 }}>Contacto guardado</div>
            <div style={{ fontSize:13,color:'#6B7280' }}>Ticket <strong>#{lead.num}</strong> actualizado correctamente.</div>
          </div>
        ):(
          <div style={{ display:'flex',flexDirection:'column',gap:16,marginTop:20 }}>

            {/* Canal */}
            <div>
              <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>Canal de contacto</div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {["whatsapp","llamada","email","presencial","sms"].map(mt=>(
                  <button key={mt} type="button" onClick={()=>setCf(p=>({...p,method:mt}))}
                    style={{ padding:'6px 12px',fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer',borderRadius:6,
                      background:cf.method===mt?'#2563EB':'#F3F4F6',
                      color:cf.method===mt?'#ffffff':'#6B7280',
                      border:cf.method===mt?'none':'1px solid #E5E7EB' }}>
                    {mt.charAt(0).toUpperCase()+mt.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Resultado */}
            <div>
              <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>Resultado del contacto</div>
              <select value={cf.result} onChange={e=>setCf(p=>({...p,result:e.target.value,note:'',evMode:'file'}))}
                style={{ ...S.inp,width:'100%',fontSize:12 }}>
                <option value="">Seleccionar resultado...</option>
                <optgroup label="— Contacto real">
                  <option value="Contactado">Contactado</option>
                  <option value="Interesado">Interesado</option>
                  <option value="Agendó visita">Agendó visita</option>
                  <option value="Cotización entregada">Cotización entregada</option>
                  <option value="Envió documentos">Envió documentos</option>
                  <option value="No interesado">No interesado</option>
                </optgroup>
                <optgroup label="— Intento fallido">
                  <option value="No contesta">No contesta</option>
                  <option value="Buzón de voz">Buzón de voz</option>
                  <option value="Número equivocado">Número equivocado</option>
                </optgroup>
              </select>
            </div>

            {/* EVIDENCIA — solo si result requiere evidencia */}
            {needsEvidence&&(
              <div style={{ background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:10,padding:'14px 16px' }}>
                <div style={{ fontSize:11,fontWeight:700,color:'#92400E',marginBottom:10,display:'flex',alignItems:'center',gap:6 }}>
                  <Ic.alert size={13} color="#92400E"/> Este resultado exige evidencia de contacto real
                </div>
                {/* Toggle file/note */}
                <div style={{ display:'flex',gap:6,marginBottom:12 }}>
                  {[{v:'file',l:'Subir captura'},{v:'note',l:'Nota detallada'}].map(o=>(
                    <button key={o.v} type="button" onClick={()=>setCf(p=>({...p,evMode:o.v}))}
                      style={{ flex:1,padding:'7px',fontSize:11,fontWeight:700,fontFamily:'inherit',cursor:'pointer',borderRadius:7,
                        background:cf.evMode===o.v?'#2563EB':'#ffffff',
                        color:cf.evMode===o.v?'#ffffff':'#374151',
                        border:`1.5px solid ${cf.evMode===o.v?'#2563EB':'#E5E7EB'}` }}>
                      {o.l}
                    </button>
                  ))}
                </div>

                {cf.evMode==='file'?(
                  <div>
                    <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6 }}>Tipo de captura</div>
                    <div style={{ display:'flex',gap:5,marginBottom:10 }}>
                      {EV_TYPES.map(t=>(
                        <button key={t.v} type="button" onClick={()=>setCf(p=>({...p,evType:t.v}))}
                          style={{ padding:'4px 10px',fontSize:10,fontWeight:600,fontFamily:'inherit',cursor:'pointer',borderRadius:5,
                            background:cf.evType===t.v?'#1D4ED8':'#F3F4F6',
                            color:cf.evType===t.v?'#ffffff':'#374151',border:'none' }}>
                          {t.l}
                        </button>
                      ))}
                    </div>
                    {evPreview?(
                      <div style={{ position:'relative',marginBottom:6 }}>
                        <img src={evPreview} alt="preview" style={{ width:'100%',maxHeight:140,objectFit:'cover',borderRadius:8,border:'1px solid #E5E7EB' }}/>
                        <button onClick={()=>{setEvFile(null);setEvPreview(null);}}
                          style={{ position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.5)',color:'#ffffff',border:'none',borderRadius:4,padding:'4px',display:'flex',alignItems:'center',cursor:'pointer' }}><Ic.x size={12} color="#ffffff"/></button>
                      </div>
                    ):(
                      <label style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:'18px',borderRadius:8,border:'2px dashed #D1D5DB',background:'#F9FAFB',cursor:'pointer',fontSize:12,color:'#6B7280' }}>
                        <Ic.upload size={22} color="#9CA3AF"/>
                        <span>Hacer clic para seleccionar imagen</span>
                        <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{
                          const f=e.target.files[0];if(!f)return;
                          setEvFile(f);setEvPreview(URL.createObjectURL(f));
                        }}/>
                      </label>
                    )}
                  </div>
                ):(
                  <div>
                    <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6 }}>Nota detallada <span style={{ color:'#EF4444' }}>*</span> (mín. 50 caracteres)</div>
                    <textarea value={cf.note} onChange={e=>setCf(p=>({...p,note:e.target.value}))} maxLength={5000}
                      rows={4} style={{ ...S.inp,width:'100%',resize:'none',fontSize:12 }}
                      placeholder="Describe el contacto en detalle: qué se habló, qué se acordó, próximos pasos..."/>
                    <div style={{ textAlign:'right',fontSize:10,color:cf.note.length>=50?'#10B981':'#9CA3AF',marginTop:3 }}>{cf.note.length}/50</div>
                  </div>
                )}
              </div>
            )}

            {/* NOTA OBLIGATORIA — para intentos fallidos */}
            {needsNote&&(
              <div>
                <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>
                  Nota obligatoria <span style={{ color:'#EF4444' }}>*</span> (mín. 40 caracteres)
                </div>
                <textarea value={cf.note} onChange={e=>setCf(p=>({...p,note:e.target.value}))} maxLength={5000}
                  rows={3} style={{ ...S.inp,width:'100%',resize:'none',fontSize:12 }}
                  placeholder="Ej: Llamé a las 14:30, entró al buzón. Volver a intentar mañana a las 11:00..."/>
                <div style={{ textAlign:'right',fontSize:10,color:cf.note.length>=40?'#10B981':'#9CA3AF',marginTop:3 }}>{cf.note.length}/40</div>
              </div>
            )}

            {/* NOTA OPCIONAL — otros resultados */}
            {!needsEvidence&&!needsNote&&cf.result&&(
              <div>
                <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>Nota adicional (opcional)</div>
                <textarea value={cf.note} onChange={e=>setCf(p=>({...p,note:e.target.value}))} maxLength={5000}
                  rows={3} style={{ ...S.inp,width:'100%',resize:'none',fontSize:12 }}
                  placeholder="Comentario adicional..."/>
              </div>
            )}

            {/* Error */}
            {cfErr&&(
              <div style={{ background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#DC2626',fontWeight:600,display:'flex',alignItems:'flex-start',gap:6 }}>
                <Ic.alert size={14} color="#DC2626" style={{ flexShrink:0,marginTop:1 }}/>{cfErr}
              </div>
            )}

            {/* Acciones */}
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end',paddingTop:4 }}>
              <button onClick={closeContact} style={{ ...S.btn2,padding:'9px 18px',fontSize:12 }}>Cancelar</button>
              <button onClick={submitContact} disabled={cfSaving||!cf.result}
                style={{ ...S.btn,padding:'9px 20px',fontSize:12,fontWeight:700,opacity:(cfSaving||!cf.result)?0.6:1 }}>
                {cfSaving?'Guardando...':'Guardar contacto'}
              </button>
            </div>
          </div>
        )}
      </Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════
