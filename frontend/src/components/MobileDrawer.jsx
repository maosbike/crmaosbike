import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function MobileDrawer({open,onClose,items,page,nav,user,onChangePw,onLogout}){
  return(
    <>
      {open&&<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:88}}/>}
      <div className={`crm-drawer${open?" open":""}`} style={{position:"fixed",left:0,top:0,bottom:0,width:240,background:"#111112",borderRight:"1px solid #1E1E1F",display:"flex",flexDirection:"column",zIndex:89,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",height:52,borderBottom:"1px solid #1E1E1F",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:8,background:"#F28100",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic.bike size={14} color="white"/></div><span style={{fontSize:13,fontWeight:700}}>MaosBike <span style={{color:"#F28100"}}>CRM</span></span></div>
          <button onClick={onClose} style={{...S.gh,padding:4}}><Ic.x size={18} color="#A3A3A3"/></button>
        </div>
        <nav style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:1}}>{items.map(it=>{const act=page===it.id||(it.id==="leads"&&page==="ticket");return<button key={it.id} onClick={()=>nav(it.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"12px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit",background:act?"rgba(242,129,0,0.1)":"transparent",color:act?"#F28100":"#A3A3A3",textAlign:"left"}}><it.icon size={17}/>{it.label}</button>;})}
        </nav>
        <div style={{borderTop:"1px solid #1E1E1F",padding:10,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 4px"}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(242,129,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:11,fontWeight:700,flexShrink:0}}>{user&&(user.fn[0]+user.ln[0]).toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600}}>{user?.fn} {user?.ln}</div><div style={{fontSize:10,color:"#555"}}>{user?.role?.replace(/_/g," ")}</div></div>
          </div>
          <button onClick={onChangePw} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",borderRadius:8,border:"1px solid #262626",background:"transparent",color:"#A3A3A3",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.lock size={14}/>Cambiar contraseña</button>
          <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",borderRadius:8,border:"none",background:"transparent",color:"#EF4444",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.out size={14}/>Cerrar sesión</button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// CHANGE PASSWORD MODAL
// ═══════════════════════════════════════════
