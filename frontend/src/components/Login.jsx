import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function Login({onLogin}){
  const[identifier,setIdentifier]=useState("");
  const[pw,setPw]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const go=async e=>{
    e.preventDefault();
    setErr("");setLoading(true);
    try{
      const {token,user}=await api.login(identifier,pw);
      localStorage.setItem("crm_token",token);
      localStorage.setItem("crm_user",JSON.stringify(user));
      onLogin(user);
    }catch(ex){
      setErr(ex.message||"Credenciales inválidas");
    }finally{setLoading(false);}
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F5F5F7",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380,padding:"0 20px"}}>
        <div style={{textAlign:"center",marginBottom:28}}><img src="/logo.png" alt="MaosBike" style={{height:80,marginBottom:14}}/><p style={{color:"#6B6B6B",fontSize:12,marginTop:4}}>Sistema de gestión comercial</p></div>
        <form onSubmit={go} style={{background:"#FFFFFF",border:"1px solid #D1D5DB",borderRadius:14,padding:22}}>
          <div style={{marginBottom:14}}><label style={S.lbl}>Usuario o Email</label><input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="ej: joaquin" autoComplete="username" style={{...S.inp,width:"100%"}}/></div>
          <div style={{marginBottom:18}}><label style={S.lbl}>Contraseña</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" style={{...S.inp,width:"100%"}}/></div>
          {err&&<div style={{background:"rgba(239,68,68,0.1)",borderRadius:8,padding:"7px 12px",color:"#EF4444",fontSize:12,marginBottom:14}}>{err}</div>}
          <button type="submit" disabled={loading} style={{...S.btn,width:"100%",padding:11,opacity:loading?0.7:1}}>{loading?"Ingresando...":"Ingresar"}</button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
