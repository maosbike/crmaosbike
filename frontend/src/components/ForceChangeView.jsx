import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ErrorMsg } from '../ui.jsx';

export function ForceChangeView({user,onChanged}){
  const[form,setForm]=useState({current:"",next:"",confirm:""});
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const submit=async e=>{
    e.preventDefault();setErr("");
    if(form.next!==form.confirm)return setErr("Las contraseñas nuevas no coinciden");
    if(form.next.length<8)return setErr("La nueva contraseña debe tener mínimo 8 caracteres");
    setLoading(true);
    try{
      await api.changePassword(form.current,form.next,form.confirm);
      onChanged({...user,forceChange:false});
    }catch(ex){setErr(ex.message||"Error al cambiar contraseña");}
    finally{setLoading(false);}
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 50%, #F3F4F6 100%)",fontFamily:"'Inter',system-ui,sans-serif",padding:"24px"}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:52,height:52,borderRadius:14,background:"var(--brand-muted)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}><Ic.lock size={24} color="var(--brand)"/></div>
          <h1 style={{fontSize:20,fontWeight:800,color:"#111827",margin:0}}>Cambio de contraseña requerido</h1>
          <p style={{color:"#6B7280",fontSize:12,marginTop:6}}>Hola {user.fn}, debes cambiar tu contraseña antes de continuar.</p>
        </div>
        <form onSubmit={submit} style={{background:"#FFFFFF",border:"1px solid #F3F4F6",borderRadius:16,padding:"36px 32px",boxShadow:"0 4px 24px rgba(0,0,0,0.10)"}}>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <Field label="Contraseña temporal *" value={form.current} onChange={v=>setForm({...form,current:v})} type="password" ph="La contraseña que te dieron" req/>
            <Field label="Nueva contraseña *" value={form.next} onChange={v=>setForm({...form,next:v})} type="password" ph="Mínimo 8 caracteres" req/>
            <Field label="Confirmar nueva contraseña *" value={form.confirm} onChange={v=>setForm({...form,confirm:v})} type="password" ph="Repite la nueva contraseña" req/>
          </div>
          <ErrorMsg msg={err}/>
          <button type="submit" disabled={loading} style={{...S.btn,width:"100%",justifyContent:"center",height:42,fontSize:14,opacity:loading?0.7:1}}>{loading?"Guardando...":"Establecer nueva contraseña"}</button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════
