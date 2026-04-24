import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, TY, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

// Grupos del sidebar — misma estructura que App.jsx SIDEBAR_GROUPS
const DRAWER_GROUPS = [
  { label: 'Comercial',       ids: ['dashboard','leads','pipeline','calendar'] },
  { label: 'Stock y Ventas',  ids: ['inventory','sales','supplier-payments'] },
  { label: 'Configuración',   ids: ['catalog','reports','admin','import','priceimport'] },
];

export function MobileDrawer({open,onClose,items,page,nav,user,onChangePw,onLogout}){
  // Guard de iniciales: soporta fn/first_name y ln/last_name, evita crash en undefined o '-'
  const initials = user ? [
    (user.first_name?.[0] || user.fn?.[0] || ''),
    ((user.last_name && user.last_name !== '-') ? user.last_name[0] :
     (user.ln && user.ln !== '-') ? user.ln[0] : ''),
  ].join('').toUpperCase() || '?' : '?';

  return(
    <>
      {open&&<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:88}}/>}
      <div className={`crm-drawer${open?" open":""}`} style={{position:"fixed",left:0,top:0,bottom:0,width:240,background:"var(--surface)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",zIndex:89,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px 0 20px",height:56,borderBottom:"1px solid var(--surface-sunken)",flexShrink:0}}>
          <div>
            <img src="/logo.png" alt="MaosBike" style={{height:28,objectFit:'contain',display:'block'}}
              onError={e=>{e.currentTarget.style.display='none';e.currentTarget.nextSibling.style.display='flex';}}
            />
            <div style={{width:28,height:28,borderRadius:'var(--radius-md)',background:'var(--brand)',display:'none',alignItems:'center',justifyContent:'center'}}>
              <Ic.bike size={16} color="var(--text-on-brand)"/>
            </div>
          </div>
          <button onClick={onClose} style={{...S.gh,padding:4}}><Ic.x size={18} color="var(--text-subtle)"/></button>
        </div>
        <nav style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column"}}>
          {DRAWER_GROUPS.map((group,gi)=>{
            const groupItems=items.filter(it=>group.ids.includes(it.id));
            if(groupItems.length===0)return null;
            return(
              <div key={group.label}>
                <div style={{...TY.micro,padding:"12px 12px 4px",color:"#C4C9D4",marginTop:gi===0?0:4}}>{group.label}</div>
                {groupItems.map(it=>{
                  const act=page===it.id||(it.id==="leads"&&page==="ticket");
                  return(
                    <button key={it.id} onClick={()=>nav(it.id)} style={{
                      display:"flex",alignItems:"center",gap:10,
                      padding:"8px 12px 8px 16px",marginBottom:1,
                      borderRadius:'var(--radius-md)',border:"none",cursor:"pointer",
                      fontSize:13,fontWeight:act?600:500,fontFamily:"inherit",
                      background:act?"var(--brand-soft)":"transparent",
                      color:act?"#C2680A":"var(--text-muted)",
                      textAlign:"left",userSelect:"none",
                      position:"relative",width:"100%",
                    }}>
                      {act&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:20,background:"var(--brand)",borderRadius:"0 3px 3px 0"}}/>}
                      <it.icon size={16} color={act?"#C2680A":"var(--text-muted)"}/>
                      {it.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div style={{borderTop:"1px solid var(--surface-sunken)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0 8px"}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"var(--brand-soft)",display:"flex",alignItems:"center",justifyContent:"center",color:"#C2680A",fontSize:11,fontWeight:700,flexShrink:0,fontFamily:"inherit"}}>{initials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{...TY.bodyB,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.fn||user?.first_name} {user?.ln&&user?.ln!=='-'?user?.ln:(user?.last_name&&user?.last_name!=='-'?user?.last_name:'')}</div>
              <div style={{...TY.meta,fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.role?.replace(/_/g," ")}</div>
            </div>
          </div>
          <button onClick={onChangePw} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:'var(--radius-md)',border:"1px solid var(--border)",background:"transparent",color:"var(--text-muted)",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.lock size={14} color="var(--text-subtle)"/>Cambiar contraseña</button>
          <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:'var(--radius-md)',border:"none",background:"transparent",color:"#EF4444",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.out size={14} color="#EF4444"/>Cerrar sesión</button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// CHANGE PASSWORD MODAL
// ═══════════════════════════════════════════
