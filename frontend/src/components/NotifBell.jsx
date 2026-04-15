import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function NotifBell({nav}){
  const[open,setOpen]=useState(false);
  const[notifs,setNotifs]=useState([]);
  const[unread,setUnread]=useState(0);

  const fetchCount=async()=>{try{const d=await api.getUnreadCount();setUnread(d.count||0);}catch{}};
  const fetchNotifs=async()=>{try{const d=await api.getNotifications({limit:30});setNotifs(d.notifications||[]);}catch{}};

  useEffect(()=>{
    fetchCount();
    const iv=setInterval(fetchCount,30000);
    return()=>clearInterval(iv);
  },[]);

  const handleOpen=()=>{setOpen(true);fetchNotifs();};
  const markAll=async()=>{try{await api.markAllRead();setUnread(0);setNotifs(p=>p.map(n=>({...n,is_read:true})));}catch(ex){alert('No se pudo marcar todo como leído: '+(ex.message||'Error'));}};
  const markOne=async(id)=>{try{await api.markRead(id);setNotifs(p=>p.map(n=>n.id===id?{...n,is_read:true}:n));setUnread(p=>Math.max(0,p-1));}catch(ex){alert('No se pudo marcar como leído: '+(ex.message||'Error'));}};
  const goTicket=(n)=>{markOne(n.id);if(n.ticket_id&&nav)nav("ticket",String(n.ticket_id));setOpen(false);};

  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>open?setOpen(false):handleOpen()} style={{...S.gh,padding:6,position:"relative"}}>
        <Ic.bell size={17} color={unread>0?"#F28100":"#8A8A8A"}/>
        {unread>0&&<span style={{position:"absolute",top:1,right:1,minWidth:16,height:16,borderRadius:8,background:"#EF4444",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",padding:"0 3px"}}>{unread>9?"9+":unread}</span>}
      </button>
      {open&&(
        <div style={{position:"fixed",inset:0,zIndex:50}} onClick={()=>setOpen(false)}>
          <div onClick={e=>e.stopPropagation()} className="crm-notif-dropdown" style={{position:"fixed",top:50,right:18,width:320,background:"#FFFFFF",border:"1px solid #D1D5DB",borderRadius:14,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.7)",zIndex:51}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:"1px solid #E5E7EB"}}>
              <span style={{fontWeight:700,fontSize:13}}>Notificaciones{unread>0&&<span style={{color:"#F28100"}}> ({unread})</span>}</span>
              {unread>0&&<button onClick={markAll} style={{...S.gh,fontSize:11,color:"#F28100",padding:"2px 6px"}}>Marcar leídas</button>}
            </div>
            <div style={{maxHeight:380,overflowY:"auto"}}>
              {notifs.length===0&&<div style={{padding:24,textAlign:"center",color:"#6B7280",fontSize:12}}>Sin notificaciones pendientes</div>}
              {notifs.map(n=>(
                <div key={n.id} onClick={()=>goTicket(n)} style={{padding:"10px 14px",borderBottom:"1px solid #F3F4F6",cursor:"pointer",background:n.is_read?"transparent":"rgba(242,129,0,0.04)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{fontSize:12,fontWeight:n.is_read?400:600,color:n.is_read?"#888":"#1a1a1a",flex:1}}>{n.title}</div>
                    {!n.is_read&&<div style={{width:7,height:7,borderRadius:"50%",background:"#F28100",flexShrink:0,marginTop:4}}/>}
                  </div>
                  {n.body&&<div style={{fontSize:11,color:"#6B7280",marginTop:2,lineHeight:1.4}}>{n.body}</div>}
                  <div style={{fontSize:10,color:"#444",marginTop:4}}>{ago(n.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// REMINDERS TAB
// ═══════════════════════════════════════════
