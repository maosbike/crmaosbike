import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function CalendarView({user,nav}){
  const[date,setDate]=useState(new Date());
  const[events,setEvents]=useState([]);
  const[loading,setLoading]=useState(true);
  const yr=date.getFullYear();const mo=date.getMonth();
  const MESES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DIAS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const TYPE_C={reminder:"#3B82F6",sla_deadline:"#EF4444"};

  useEffect(()=>{
    setLoading(true);
    const start=new Date(yr,mo,1).toISOString().split("T")[0];
    const end=new Date(yr,mo+1,0).toISOString().split("T")[0];
    api.getCalendarEvents({start,end}).then(d=>setEvents(d.events||[])).catch(()=>setEvents([])).finally(()=>setLoading(false));
  },[yr,mo]);

  const firstDay=new Date(yr,mo,1).getDay();
  const daysInMonth=new Date(yr,mo+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);

  const eventsForDay=(d)=>{
    if(!d)return[];
    const ds=`${yr}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return events.filter(e=>(e.date||"").startsWith(ds));
  };
  const today=new Date();
  const todayStr=today.toISOString().split("T")[0];
  const upcoming=events.filter(e=>e.date>=todayStr).slice(0,10);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div><h1 style={{fontSize:18,fontWeight:700,margin:0}}>Calendario</h1><p style={{color:"#6B6B6B",fontSize:12,margin:"2px 0 0"}}>{events.length} eventos este mes</p></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setDate(new Date(yr,mo-1,1))} style={{...S.btn2,padding:"6px 14px"}}>←</button>
          <span style={{fontWeight:700,fontSize:15,minWidth:160,textAlign:"center"}}>{MESES[mo]} {yr}</span>
          <button onClick={()=>setDate(new Date(yr,mo+1,1))} style={{...S.btn2,padding:"6px 14px"}}>→</button>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#888"}}><div style={{width:10,height:10,borderRadius:2,background:"#3B82F6"}}/> Recordatorio</div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#888"}}><div style={{width:10,height:10,borderRadius:2,background:"#EF4444"}}/> Vencimiento SLA</div>
      </div>
      <div style={{...S.card,padding:0,overflow:"hidden",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #E5E7EB"}}>
          {DIAS.map(d=><div key={d} style={{padding:"9px 4px",textAlign:"center",fontSize:10,fontWeight:600,color:"#555",textTransform:"uppercase"}}>{d}</div>)}
        </div>
        {loading
          ?<div style={{padding:48,textAlign:"center",color:"#555",fontSize:12}}>Cargando eventos...</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {cells.map((day,i)=>{
              const evs=eventsForDay(day);
              const isToday=day&&today.getDate()===day&&today.getMonth()===mo&&today.getFullYear()===yr;
              return(
                <div key={i} style={{minHeight:88,padding:5,borderRight:"1px solid #F3F4F6",borderBottom:"1px solid #F3F4F6",background:isToday?"rgba(242,129,0,0.04)":"transparent"}}>
                  {day&&<div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?"#F28100":"#888",width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?"rgba(242,129,0,0.15)":"transparent",marginBottom:3}}>{day}</div>}
                  {evs.slice(0,3).map((ev,ei)=>(
                    <div key={ei} onClick={()=>ev.ticket_id&&nav("ticket",String(ev.ticket_id))} title={ev.title} style={{fontSize:9,padding:"2px 5px",borderRadius:3,background:`${TYPE_C[ev.type]||"#F28100"}22`,color:TYPE_C[ev.type]||"#F28100",marginBottom:2,cursor:ev.ticket_id?"pointer":"default",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:600}}>{ev.title}</div>
                  ))}
                  {evs.length>3&&<div style={{fontSize:9,color:"#555"}}>+{evs.length-3} más</div>}
                </div>
              );
            })}
          </div>
        }
      </div>
      {upcoming.length>0&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Próximos eventos</h3>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {upcoming.map((ev,i)=>(
              <div key={i} onClick={()=>ev.ticket_id&&nav("ticket",String(ev.ticket_id))} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:"#F9FAFB",cursor:ev.ticket_id?"pointer":"default"}} onMouseEnter={e=>ev.ticket_id&&(e.currentTarget.style.background="#F3F4F6")} onMouseLeave={e=>(e.currentTarget.style.background="#F9FAFB")}>
                <div style={{width:4,height:32,borderRadius:2,background:TYPE_C[ev.type]||"#F28100",flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{ev.title}</div>
                  {ev.client_name&&<div style={{fontSize:11,color:"#666"}}>{ev.client_name}</div>}
                </div>
                <div style={{fontSize:11,color:"#555",textAlign:"right"}}>
                  <div>{fD(ev.date)}</div>
                  {ev.time&&<div>{ev.time}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// IMPORT VIEW (solo super_admin)
// ═══════════════════════════════════════════
