import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, Field, fD } from '../ui.jsx';

const EVENT_TYPES={
  follow_up:'Seguimiento',call:'Llamada',meeting:'Reunión',
  delivery:'Entrega',reminder:'Recordatorio',other:'Otro',
};
const SLA_COLORS={normal:'#6B7280',warning:'#F97316',breached:'#EF4444',reassigned:'#8B5CF6'};
const REM_COLORS={pending:'#3B82F6',completed:'#10B981',overdue:'#EF4444'};

const BLANK_FORM=(userId,date)=>({
  title:'',due_date:date||new Date().toISOString().split('T')[0],due_time:'',
  description:'',assigned_to:String(userId||''),reminder_type:'follow_up',
  ticket_id:'',status:'pending',
});

export function CalendarView({user,nav}){
  const[date,setDate]=useState(new Date());
  const[events,setEvents]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showForm,setShowForm]=useState(false);
  const[editEv,setEditEv]=useState(null);
  const[sellers,setSellers]=useState([]);
  const[tickets,setTickets]=useState([]);
  const[form,setForm]=useState(BLANK_FORM(user.id,null));
  const[saving,setSaving]=useState(false);
  const[delConfirm,setDelConfirm]=useState(false);

  const yr=date.getFullYear();const mo=date.getMonth();
  const MESES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DIAS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const isAdmin=['super_admin','admin_comercial'].includes(user.role);

  const loadEvents=()=>{
    setLoading(true);
    const start=new Date(yr,mo,1).toISOString().split('T')[0];
    const end=new Date(yr,mo+1,0).toISOString().split('T')[0];
    api.getCalendarEvents({start,end})
      .then(d=>setEvents(Array.isArray(d)?d:[]))
      .catch(()=>setEvents([]))
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{loadEvents();},[yr,mo]);// eslint-disable-line

  useEffect(()=>{
    if(!showForm)return;
    api.getSellers().then(d=>setSellers(Array.isArray(d)?d:[])).catch(()=>{});
    api.getTickets({limit:100}).then(d=>setTickets((d.data||[]).slice(0,100))).catch(()=>{});
  },[showForm]);

  const openNew=(day=null)=>{
    const d=day?`${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`:new Date().toISOString().split('T')[0];
    setForm(BLANK_FORM(user.id,d));
    setEditEv(null);
    setShowForm(true);
  };

  const openEdit=(ev)=>{
    if(ev.type==='sla'){nav('ticket',String(ev.ticket_id||ev.link_id));return;}
    setForm({
      title:ev.title||'',
      due_date:(ev.date||ev.start||'').split('T')[0]||new Date().toISOString().split('T')[0],
      due_time:ev.time||'',
      description:ev.meta?.description||'',
      assigned_to:String(ev.meta?.assigned_to||user.id),
      reminder_type:ev.subtype||'follow_up',
      ticket_id:String(ev.ticket_id||ev.link_id||''),
      status:ev.status||'pending',
    });
    setEditEv(ev);
    setShowForm(true);
  };

  const closeForm=()=>{setShowForm(false);setEditEv(null);setDelConfirm(false);};

  const handleSave=async(e)=>{
    e.preventDefault();
    setSaving(true);
    try{
      const body={
        title:form.title,
        due_date:form.due_date,
        due_time:form.due_time||null,
        description:form.description||null,
        assigned_to:form.assigned_to||user.id,
        reminder_type:form.reminder_type||'follow_up',
        ticket_id:form.ticket_id||null,
        status:form.status||'pending',
      };
      if(editEv?.reminder_id){
        await api.updateReminder(editEv.reminder_id,body);
      }else{
        await api.createReminder(body);
      }
      closeForm();
      loadEvents();
    }catch(ex){alert(ex.message||'Error al guardar evento');}
    finally{setSaving(false);}
  };

  const handleDelete=async()=>{
    if(!editEv?.reminder_id)return;
    try{
      await api.deleteReminder(editEv.reminder_id);
      closeForm();
      loadEvents();
    }catch(ex){alert(ex.message||'Error al eliminar evento');}
  };

  const handleComplete=async()=>{
    if(!editEv?.reminder_id)return;
    try{
      await api.completeReminder(editEv.reminder_id);
      closeForm();
      loadEvents();
    }catch(ex){alert(ex.message||'Error');}
  };

  // Calendar grid
  const firstDay=new Date(yr,mo,1).getDay();
  const daysInMonth=new Date(yr,mo+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);

  const eventsForDay=(d)=>{
    if(!d)return[];
    const ds=`${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return events.filter(e=>(e.date||'').startsWith(ds));
  };

  const evColor=(ev)=>{
    if(ev.type==='sla')return SLA_COLORS[ev.status]||'#6B7280';
    return REM_COLORS[ev.status]||'#3B82F6';
  };

  const evShortLabel=(ev)=>{
    if(ev.type==='sla')return ev.sla_label||'';
    return EVENT_TYPES[ev.subtype||ev.reminder_type]||'Recordatorio';
  };

  const today=new Date();
  const todayStr=today.toISOString().split('T')[0];
  const upcoming=events
    .filter(e=>(e.date||'')>=todayStr)
    .sort((a,b)=>((a.start||'')>(b.start||''))?1:-1)
    .slice(0,12);

  return(
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <h1 style={{fontSize:18,fontWeight:700,margin:0}}>Calendario</h1>
          <p style={{color:'#6B6B6B',fontSize:12,margin:'2px 0 0'}}>{events.length} eventos este mes</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={()=>setDate(new Date(yr,mo-1,1))} style={{...S.btn2,padding:'6px 14px'}}>←</button>
          <span style={{fontWeight:700,fontSize:15,minWidth:160,textAlign:'center'}}>{MESES[mo]} {yr}</span>
          <button onClick={()=>setDate(new Date(yr,mo+1,1))} style={{...S.btn2,padding:'6px 14px'}}>→</button>
          <button onClick={()=>openNew()} style={{...S.btn,display:'flex',alignItems:'center',gap:6,fontSize:12}}>
            <Ic.plus size={14}/>Nuevo evento
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div style={{display:'flex',gap:14,marginBottom:12,flexWrap:'wrap'}}>
        {[
          {c:'#3B82F6',l:'Recordatorio'},
          {c:'#10B981',l:'Completado'},
          {c:'#6B7280',l:'Sin gestionar'},
          {c:'#F97316',l:'Atender ya'},
          {c:'#EF4444',l:'Vencido'},
          {c:'#8B5CF6',l:'Reasignado'},
        ].map(({c,l})=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#888'}}>
            <div style={{width:10,height:10,borderRadius:2,background:c}}/>{l}
          </div>
        ))}
      </div>

      {/* Grid del calendario */}
      <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid #E5E7EB'}}>
          {DIAS.map(d=><div key={d} style={{padding:'9px 4px',textAlign:'center',fontSize:10,fontWeight:600,color:'#6B7280',textTransform:'uppercase'}}>{d}</div>)}
        </div>
        {loading
          ?<div style={{padding:48,textAlign:'center',color:'#6B7280',fontSize:12}}>Cargando eventos...</div>
          :<div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
            {cells.map((day,i)=>{
              const evs=eventsForDay(day);
              const isToday=day&&today.getDate()===day&&today.getMonth()===mo&&today.getFullYear()===yr;
              return(
                <div key={i}
                  onClick={()=>day&&openNew(day)}
                  style={{minHeight:88,padding:5,borderRight:'1px solid #F3F4F6',borderBottom:'1px solid #F3F4F6',background:isToday?'rgba(242,129,0,0.04)':'transparent',cursor:day?'pointer':'default'}}
                >
                  {day&&(
                    <div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?'#F28100':'#888',width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:isToday?'rgba(242,129,0,0.15)':'transparent',marginBottom:3}}>
                      {day}
                    </div>
                  )}
                  {evs.slice(0,3).map((ev,ei)=>{
                    const c=evColor(ev);
                    return(
                      <div key={ei}
                        onClick={e=>{e.stopPropagation();openEdit(ev);}}
                        title={ev.title}
                        style={{fontSize:9,padding:'2px 5px',borderRadius:3,background:`${c}22`,color:c,marginBottom:2,cursor:'pointer',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontWeight:600}}
                      >
                        {ev.title}
                      </div>
                    );
                  })}
                  {evs.length>3&&<div style={{fontSize:9,color:'#6B7280'}}>+{evs.length-3} más</div>}
                </div>
              );
            })}
          </div>
        }
      </div>

      {/* Próximos eventos */}
      {upcoming.length>0&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 12px'}}>Próximos eventos</h3>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {upcoming.map((ev,i)=>{
              const c=evColor(ev);
              const lbl=evShortLabel(ev);
              return(
                <div key={i}
                  onClick={()=>openEdit(ev)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,background:'#F9FAFB',cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#F3F4F6'}
                  onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}
                >
                  <div style={{width:4,height:36,borderRadius:2,background:c,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{ev.title}</div>
                    <div style={{fontSize:11,color:'#6B7280'}}>{ev.meta?.client_name||ev.meta?.assigned_name||''}{lbl?` · ${lbl}`:''}</div>
                  </div>
                  <div style={{fontSize:11,color:'#6B7280',textAlign:'right',flexShrink:0}}>
                    <div>{fD(ev.date||ev.start)}</div>
                    {ev.time&&<div style={{fontWeight:600,color:c}}>{ev.time}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal crear / editar evento */}
      {showForm&&(
        <Modal onClose={closeForm} title={editEv?'Editar evento':'Nuevo evento'} wide>
          <form onSubmit={handleSave}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div style={{gridColumn:'1/-1'}}>
                <Field label="Título *" value={form.title} onChange={v=>setForm({...form,title:v})} req ph="Ej: Reunión con cliente, Entrega moto..."/>
              </div>
              <Field label="Tipo de evento" value={form.reminder_type} onChange={v=>setForm({...form,reminder_type:v})}
                opts={Object.entries(EVENT_TYPES).map(([k,v])=>({v:k,l:v}))}/>
              <Field label="Estado" value={form.status} onChange={v=>setForm({...form,status:v})}
                opts={[{v:'pending',l:'Pendiente'},{v:'completed',l:'Completado'}]}/>
              <Field label="Fecha *" value={form.due_date} onChange={v=>setForm({...form,due_date:v})} type="date" req/>
              <Field label="Hora (opcional)" value={form.due_time} onChange={v=>setForm({...form,due_time:v})} type="time"/>
              {(isAdmin||sellers.length>0)&&(
                <Field label="Vendedor responsable" value={form.assigned_to}
                  onChange={v=>setForm({...form,assigned_to:v})}
                  opts={[
                    {v:String(user.id),l:'Yo mismo'},
                    ...sellers.filter(s=>String(s.id)!==String(user.id)).map(s=>({
                      v:String(s.id),
                      l:`${s.first_name||''} ${s.last_name||''}`.trim()
                    }))
                  ]}
                />
              )}
              <Field label="Lead / Ticket asociado (opcional)" value={form.ticket_id}
                onChange={v=>setForm({...form,ticket_id:v})}
                opts={[
                  {v:'',l:'Sin asociar'},
                  ...tickets.map(t=>({
                    v:String(t.id),
                    l:`${t.ticket_num||''} · ${t.first_name||''} ${t.last_name||''}`.trim()
                  }))
                ]}
              />
              <div style={{gridColumn:'1/-1'}}>
                <Field label="Descripción / Nota" value={form.description||''} onChange={v=>setForm({...form,description:v})} rows={3} ph="Detalles del evento..."/>
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4,flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',gap:8'}}>
                {editEv&&editEv.status!=='completed'&&(
                  <button type="button" onClick={handleComplete} style={{...S.btn2,fontSize:12,color:'#10B981',borderColor:'#10B981'}}>
                    ✓ Marcar completado
                  </button>
                )}
                {editEv&&(
                  <button type="button" onClick={()=>setDelConfirm(true)} style={{...S.btn2,color:'#EF4444',borderColor:'#EF4444',fontSize:12}}>
                    Eliminar
                  </button>
                )}
              </div>
              <div style={{display:'flex',gap:8}}>
                {editEv&&(editEv.ticket_id||editEv.link_id)&&(
                  <button type="button" onClick={()=>nav('ticket',String(editEv.ticket_id||editEv.link_id))} style={{...S.btn2,fontSize:12}}>
                    Ver lead →
                  </button>
                )}
                <button type="button" onClick={closeForm} style={S.btn2}>Cancelar</button>
                <button type="submit" disabled={saving} style={{...S.btn,opacity:saving?0.7:1}}>
                  {saving?'Guardando...':editEv?'Guardar cambios':'Crear evento'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmar eliminación */}
      {delConfirm&&(
        <Modal onClose={()=>setDelConfirm(false)} title="Eliminar evento">
          <p style={{marginBottom:20,color:'#374151',fontSize:13}}>¿Seguro que querés eliminar este evento? La acción no se puede deshacer.</p>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={()=>setDelConfirm(false)} style={S.btn2}>Cancelar</button>
            <button onClick={handleDelete} style={{...S.btn,background:'#EF4444'}}>Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
