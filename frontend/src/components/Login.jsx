import { useState, useEffect, useRef } from 'react';
import { api, setToken } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ErrorMsg } from '../ui.jsx';

export function Login({onLogin}){
  const[identifier,setIdentifier]=useState("");
  const[pw,setPw]=useState("");
  const[showPw,setShowPw]=useState(false);
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const go=async e=>{
    e.preventDefault();
    setErr("");setLoading(true);
    try{
      const {token,user}=await api.login(identifier.trim(),pw);
      setToken(token); // Token en memoria, nunca en localStorage
      onLogin(user);
    }catch(ex){
      setErr(ex.message||"Credenciales inválidas");
    }finally{setLoading(false);}
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 50%, #F3F4F6 100%)",fontFamily:"'Inter',system-ui,sans-serif",padding:"24px"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:28}}><img src="/logo.png" alt="MaosBike" style={{height:80,marginBottom:14}}/><p style={{color:"#6B7280",fontSize:12,marginTop:4}}>Sistema de gestión comercial</p></div>
        <form onSubmit={go} style={{background:"#FFFFFF",border:"1px solid #F3F4F6",borderRadius:16,padding:"36px 32px",boxShadow:"0 4px 24px rgba(0,0,0,0.10)"}}>
          <div style={{marginBottom:14}}><label style={S.lbl}>Email</label><input value={identifier} onChange={e=>setIdentifier(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go(e)} placeholder="tu.correo@maosbike.cl" autoComplete="username" style={{...S.inp,width:"100%"}}/></div>
          <div style={{marginBottom:18}}><label style={S.lbl}>Contraseña</label><div style={{position:"relative"}}><input type={showPw?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go(e)} autoComplete="current-password" style={{...S.inp,width:"100%",paddingRight:44}}/><button type="button" onClick={()=>setShowPw(s=>!s)} aria-label={showPw?"Ocultar contraseña":"Mostrar contraseña"} title={showPw?"Ocultar contraseña":"Mostrar contraseña"} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",cursor:"pointer",padding:6,color:"#6B7280",display:"flex",alignItems:"center"}}>{showPw?<Ic.eyeOff size={18}/>:<Ic.eye size={18}/>}</button></div></div>
          <ErrorMsg msg={err}/>
          <button type="submit" disabled={loading} style={{...S.btn,width:"100%",justifyContent:"center",height:42,fontSize:14,opacity:loading?0.7:1}}>{loading?"Ingresando...":"Ingresar"}</button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
