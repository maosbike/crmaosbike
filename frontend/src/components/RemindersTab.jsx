import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function RemindersTab({ticketId,user}){
  const[reminders,setReminders]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showNew,setShowNew]=useState(false);
  const[form,setForm]=useState({title:"",type:"llamada",reminder_date:"",reminder_time:"",priority:"media",note:""});
  const TYPE_L={llamada:"Llamada",visita:"Visita",whatsapp:"WhatsApp",email:"Email",otro:"Otro"};
  const ST_C={pending:"#F59E0B",completed:"#10B981",overdue:"#EF4444"};
  const ST_L={pending:"Pendiente",completed:"Completado",overdue:"Vencido"};

  useEffect(()=>{
    api.getReminders({ticket_id:ticketId}).then(d=>setReminders(d.data||d.reminders||(Array.isArray(d)?d:[]))).catch(()=>{}).finally(()=>setLoading(false));
  },[ticketId]);

  const create=async(e)=>{
    e.preventDefault();
    try{const d=await api.createReminder({...form,ticket_id:ticketId});setReminders(p=>[d.reminder,...p]);setShowNew(false);setForm({title:"",type:"llamada",reminder_date:"",reminder_time:"",priority:"media",note:""});}
    catch(err){alert(err.message);}
  };
  const complete=async(id)=>{try{await api.completeReminder(id);setReminders(p=>p.map(r=>r.id===id?{...r,status:"completed"}:r));}catch(ex){alert('No se pudo marcar como completado: '+(ex.message||'Error'));}};
  const del=async(id)=>{if(!confirm("¿Eliminar recordatorio?"))return;try{await api.deleteReminder(id);setReminders(p=>p.filter(r=>r.id!==id));}catch(ex){alert('No se pudo eliminar el recordatorio: '+(ex.message||'Error'));}};

  if(loading)return<div style={{padding:20,textAlign:"center",color:"#6B7280",fontSize:12}}>Cargando...</div>;
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontWeight:600,fontSize:13}}>Recordatorios del lead</span>
        <button onClick={()=>setShowNew(true)} style={{...S.btn,fontSize:12,display:"flex",alignItems:"center",gap:5}}><Ic.plus size={13}/>Nuevo</button>
      </div>
      {reminders.length===0&&<div style={{padding:24,textAlign:"center",color:"#6B7280",fontSize:12,background:"#F9FAFB",borderRadius:10}}>Sin recordatorios. Crea uno para hacer seguimiento.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {reminders.map(r=>(
          <div key={r.id} style={{background:"#F9FAFB",borderRadius:10,padding:12,border:`1px solid ${r.status==="overdue"?"rgba(239,68,68,0.3)":r.status==="completed"?"rgba(16,185,129,0.2)":"#E5E7EB"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontWeight:600,fontSize:13,textDecoration:r.status==="completed"?"line-through":"none",color:r.status==="completed"?"#555":"#1a1a1a"}}>{r.title}</span>
                  <Bdg l={ST_L[r.status]||r.status} c={ST_C[r.status]||"#6B7280"}/>
                </div>
                <div style={{fontSize:11,color:"#888",display:"flex",gap:12,flexWrap:"wrap"}}>
                  <span>{TYPE_L[r.type]||r.type}</span>
                  <span>{fD(r.reminder_date)}{r.reminder_time&&" · "+r.reminder_time}</span>
                  {r.priority==="alta"&&<span style={{color:"#EF4444",fontWeight:600}}>Alta prioridad</span>}
                </div>
                {r.note&&<div style={{fontSize:11,color:"#6B7280",marginTop:6}}>{r.note}</div>}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:12}}>
                {r.status==="pending"&&<button onClick={()=>complete(r.id)} style={{...S.btn2,padding:"4px 10px",fontSize:11,background:"rgba(16,185,129,0.1)",color:"#10B981",border:"1px solid rgba(16,185,129,0.2)"}}>Completar</button>}
                <button onClick={()=>del(r.id)} style={{...S.gh,padding:4,color:"#6B7280"}}><Ic.x size={14}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {showNew&&(
        <Modal onClose={()=>setShowNew(false)} title="Nuevo Recordatorio">
          <form onSubmit={create}>
            <div style={{marginBottom:10}}><Field label="Título *" value={form.title} onChange={v=>setForm({...form,title:v})} req ph="Ej: Llamar para confirmar visita..."/></div>
            <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <Field label="Tipo" value={form.type} onChange={v=>setForm({...form,type:v})} opts={Object.entries(TYPE_L).map(([k,v])=>({v:k,l:v}))}/>
              <Field label="Prioridad" value={form.priority} onChange={v=>setForm({...form,priority:v})} opts={[{v:"alta",l:"Alta"},{v:"media",l:"Media"},{v:"baja",l:"Baja"}]}/>
            </div>
            <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <Field label="Fecha *" value={form.reminder_date} onChange={v=>setForm({...form,reminder_date:v})} type="date" req/>
              <Field label="Hora" value={form.reminder_time} onChange={v=>setForm({...form,reminder_time:v})} type="time"/>
            </div>
            <div style={{marginBottom:16}}><Field label="Nota" value={form.note} onChange={v=>setForm({...form,note:v})} rows={2} ph="Detalles adicionales..."/></div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button type="button" onClick={()=>setShowNew(false)} style={S.btn2}>Cancelar</button>
              <button type="submit" style={S.btn}>Crear Recordatorio</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CALENDAR VIEW
// ═══════════════════════════════════════════
