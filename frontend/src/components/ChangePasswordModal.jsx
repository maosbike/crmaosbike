import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function ChangePasswordModal({onClose}){
  const[form,setForm]=useState({current:"",next:"",confirm:""});
  const[err,setErr]=useState("");
  const[ok,setOk]=useState(false);
  const[loading,setLoading]=useState(false);
  const submit=async e=>{
    e.preventDefault();setErr("");
    if(form.next!==form.confirm)return setErr("Las contraseñas nuevas no coinciden");
    if(form.next.length<8)return setErr("La nueva contraseña debe tener mínimo 8 caracteres");
    setLoading(true);
    try{
      await api.changePassword(form.current,form.next,form.confirm);
      setOk(true);
    }catch(ex){setErr(ex.message||"Error al cambiar contraseña");}
    finally{setLoading(false);}
  };
  return(
    <Modal onClose={onClose} title="Cambiar Contraseña">
      {ok
        ?<div style={{textAlign:"center",padding:"16px 0"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:"rgba(16,185,129,0.15)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><Ic.check size={24} color="#10B981"/></div>
          <p style={{color:"#10B981",fontWeight:600,marginBottom:4}}>Contraseña actualizada</p>
          <p style={{color:"#6B6B6B",fontSize:12,marginBottom:16}}>Tu contraseña fue cambiada correctamente.</p>
          <button onClick={onClose} style={S.btn}>Cerrar</button>
        </div>
        :<form onSubmit={submit}>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <Field label="Contraseña actual *" value={form.current} onChange={v=>setForm({...form,current:v})} type="password" ph="Tu contraseña actual" req/>
            <Field label="Nueva contraseña *" value={form.next} onChange={v=>setForm({...form,next:v})} type="password" ph="Mínimo 8 caracteres" req/>
            <Field label="Confirmar nueva contraseña *" value={form.confirm} onChange={v=>setForm({...form,confirm:v})} type="password" ph="Repite la nueva contraseña" req/>
          </div>
          {err&&<div style={{background:"rgba(239,68,68,0.1)",borderRadius:8,padding:"7px 12px",color:"#EF4444",fontSize:12,marginBottom:12}}>{err}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <button type="button" onClick={onClose} style={S.btn2}>Cancelar</button>
            <button type="submit" disabled={loading} style={{...S.btn,opacity:loading?0.7:1}}>{loading?"Guardando...":"Cambiar Contraseña"}</button>
          </div>
        </form>
      }
    </Modal>
  );
}

// ═══════════════════════════════════════════
// FORCE CHANGE PASSWORD VIEW
// ═══════════════════════════════════════════
