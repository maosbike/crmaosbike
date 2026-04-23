import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, ago } from '../ui.jsx';

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
        <Ic.bell size={17} color={unread>0?"var(--brand)":"var(--text-disabled)"}/>
        {unread>0&&<span style={{position:"absolute",top:1,right:1,minWidth:16,height:16,borderRadius:8,background:"#EF4444",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",color:"#ffffff",padding:"0 3px"}}>{unread>9?"9+":unread}</span>}
      </button>
      {open&&(
        <div style={{position:"fixed",inset:0,zIndex:50}} onClick={()=>setOpen(false)}>
          <div onClick={e=>e.stopPropagation()} className="crm-notif-dropdown" style={{position:"fixed",top:52,right:12,width:340,maxWidth:"calc(100vw - 24px)",maxHeight:400,background:"#FFFFFF",border:"1px solid var(--border)",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:"var(--z-overlay-ui, 200)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid var(--surface-sunken)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,fontSize:13}}>Notificaciones{unread>0&&<span style={{color:"var(--brand)"}}> ({unread})</span>}</span>
              {unread>0&&<button onClick={markAll} style={{...S.gh,fontSize:11,color:"var(--brand)",padding:"2px 6px"}}>Marcar todo leído</button>}
            </div>
            <div style={{overflowY:"auto",flex:1}}>
              {notifs.length===0&&<div style={{padding:24,textAlign:"center",color:"var(--text-subtle)",fontSize:12}}>Sin notificaciones pendientes</div>}
              {notifs.map(n=>(
                <div key={n.id} onClick={()=>goTicket(n)} style={{padding:"10px 16px",borderBottom:"1px solid var(--surface-muted)",cursor:"pointer",background:n.is_read?"#FFFFFF":"var(--brand-soft)",transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background=n.is_read?"var(--surface-muted)":"var(--brand-soft)"} onMouseLeave={e=>e.currentTarget.style.background=n.is_read?"#FFFFFF":"var(--brand-soft)"}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                    {!n.is_read&&<div style={{width:6,height:6,borderRadius:"50%",background:"var(--brand)",flexShrink:0,marginTop:5}}/>}
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:n.is_read?400:600,color:n.is_read?"var(--text-disabled)":"var(--text)"}}>{n.title}</div>
                      {n.body&&<div style={{fontSize:11,color:"var(--text-subtle)",marginTop:2,lineHeight:1.4}}>{n.body}</div>}
                      <div style={{fontSize:10,color:"var(--text-disabled)",marginTop:4}}>{ago(n.created_at)}</div>
                    </div>
                  </div>
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
