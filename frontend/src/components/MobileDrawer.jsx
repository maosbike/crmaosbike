import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function MobileDrawer({open,onClose,items,page,nav,user,onChangePw,onLogout}){
  return(
    <>
      {open&&<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(255,255,255,0.9)",zIndex:88}}/>}
      <div className={`crm-drawer${open?" open":""}`} style={{position:"fixed",left:0,top:0,bottom:0,width:240,background:"#FFFFFF",borderRight:"1px solid #E5E7EB",display:"flex",flexDirection:"column",zIndex:89,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",height:52,borderBottom:"1px solid #E5E7EB",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><img src="/logo.png" alt="MaosBike" style={{height:24}}/><span style={{fontSize:11,fontWeight:600,color:"#6B7280"}}>CRM</span></div>
          <button onClick={onClose} style={{...S.gh,padding:4}}><Ic.x size={18} color="#6B7280"/></button>
        </div>
        <nav style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:1}}>{items.map(it=>{const act=page===it.id||(it.id==="leads"&&page==="ticket");return<button key={it.id} onClick={()=>nav(it.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"12px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit",background:act?"rgba(242,129,0,0.1)":"transparent",color:act?"#F28100":"#6B7280",textAlign:"left"}}><it.icon size={17}/>{it.label}</button>;})}
        </nav>
        <div style={{borderTop:"1px solid #E5E7EB",padding:10,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 4px"}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(242,129,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:11,fontWeight:700,flexShrink:0}}>{user&&(user.fn[0]+user.ln[0]).toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600}}>{user?.fn} {user?.ln}</div><div style={{fontSize:10,color:"#6B7280"}}>{user?.role?.replace(/_/g," ")}</div></div>
          </div>
          <button onClick={onChangePw} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",borderRadius:8,border:"1px solid #D1D5DB",background:"transparent",color:"#6B7280",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.lock size={14}/>Cambiar contraseña</button>
          <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",borderRadius:8,border:"none",background:"transparent",color:"#EF4444",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.out size={14}/>Cerrar sesión</button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// CHANGE PASSWORD MODAL
// ═══════════════════════════════════════════
