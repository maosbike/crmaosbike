import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui';

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
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0A0A0B",fontFamily:"'Montserrat',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:400,padding:"0 20px"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:52,height:52,borderRadius:14,background:"rgba(242,129,0,0.15)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}><Ic.lock size={24} color="#F28100"/></div>
          <h1 style={{fontSize:20,fontWeight:800,color:"#FAFAFA",margin:0}}>Cambio de contraseña requerido</h1>
          <p style={{color:"#6B6B6B",fontSize:12,marginTop:6}}>Hola {user.fn}, debes cambiar tu contraseña antes de continuar.</p>
        </div>
        <form onSubmit={submit} style={{background:"#151516",border:"1px solid #262626",borderRadius:14,padding:22}}>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <Field label="Contraseña temporal *" value={form.current} onChange={v=>setForm({...form,current:v})} type="password" ph="La contraseña que te dieron" req/>
            <Field label="Nueva contraseña *" value={form.next} onChange={v=>setForm({...form,next:v})} type="password" ph="Mínimo 8 caracteres" req/>
            <Field label="Confirmar nueva contraseña *" value={form.confirm} onChange={v=>setForm({...form,confirm:v})} type="password" ph="Repite la nueva contraseña" req/>
          </div>
          {err&&<div style={{background:"rgba(239,68,68,0.1)",borderRadius:8,padding:"7px 12px",color:"#EF4444",fontSize:12,marginBottom:12}}>{err}</div>}
          <button type="submit" disabled={loading} style={{...S.btn,width:"100%",padding:11,opacity:loading?0.7:1}}>{loading?"Guardando...":"Establecer nueva contraseña"}</button>
        </form>
      </div>
    </div>
  );
}

