import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function PipelineView({leads,user,nav,updLead}){
  const[dragId,setDragId]=useState(null);
  const stages=["abierto","en_gestion","cotizado","financiamiento"];
  const pLeads=leads.filter(l=>{if(!stages.includes(l.status))return false;if(user.role==="vendedor"&&l.seller_id!==user.id)return false;return true;});
  const drop=stage=>{if(dragId){const ld=leads.find(l=>l.id===dragId);if(ld)updLead(dragId,{status:stage,timeline:[{id:`tl-${Date.now()}`,type:"status",title:`Estado → ${TICKET_STATUS[stage]?.l}`,date:new Date().toISOString(),user:user.fn},...ld.timeline]});setDragId(null);}};
  const getSlaInfo=(l)=>{
    if(l.sla_status==="vencido")return{horas:0,breach:true,warning:false};
    if(l.sla_status==="en_riesgo")return{horas:0,breach:false,warning:true};
    const created=new Date(l.createdAt).getTime();const now=Date.now();const diff=now-created;const horas=diff/(1e3*60*60);const lastC=l.lastContact?new Date(l.lastContact).getTime():0;const sinContacto=lastC?((now-lastC)/(1e3*60*60)):horas;return{horas:Math.floor(sinContacto),breach:sinContacto>=8&&!l.lastContact,warning:sinContacto>=6&&sinContacto<8};
  };
  return(
    <div><h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Pipeline {user.role==="vendedor"&&<span style={{fontSize:13,fontWeight:400,color:"#6B7280"}}>· Mis tickets</span>}</h1><div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:14}}>{stages.map(stage=>{const sc=TICKET_STATUS[stage],sl=pLeads.filter(l=>l.status===stage);return(<div key={stage} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(stage)} style={{minWidth:250,flex:"0 0 250px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E5E7EB",display:"flex",flexDirection:"column",maxHeight:"calc(100vh - 130px)"}}><div style={{padding:"10px 12px",borderBottom:"1px solid #E5E7EB",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:sc?.c}}/><span style={{fontSize:11,fontWeight:600}}>{sc?.l}</span></div><span style={{fontSize:10,color:"#6B7280",fontWeight:600}}>{sl.length}</span></div><div style={{flex:1,overflowY:"auto",padding:6,display:"flex",flexDirection:"column",gap:5}}>{sl.map(l=>{const m=l.model_brand?{brand:l.model_brand,model:l.model_name,price:0,bonus:0}:null;const sla=getSlaInfo(l);return(<div key={l.id} draggable onDragStart={()=>setDragId(l.id)} onClick={()=>nav("ticket",l.id)} style={{background:sla.breach?"rgba(239,68,68,0.05)":"#171718",border:sla.breach?"1px solid rgba(239,68,68,0.3)":"1px solid #222",borderRadius:10,padding:10,cursor:"grab"}} onMouseEnter={e=>{if(!sla.breach)e.currentTarget.style.borderColor="#F28100";}} onMouseLeave={e=>{if(!sla.breach)e.currentTarget.style.borderColor="#222";}}>
      {sla.breach&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6,padding:"3px 8px",borderRadius:6,background:"rgba(239,68,68,0.1)",fontSize:10,color:"#EF4444",fontWeight:600}}><Ic.alert size={11} color="#EF4444"/>SLA vencido · {sla.horas}h sin contacto</div>}
      {sla.warning&&!sla.breach&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6,padding:"3px 8px",borderRadius:6,background:"rgba(245,158,11,0.1)",fontSize:10,color:"#F59E0B",fontWeight:600}}><Ic.clock size={11} color="#F59E0B"/>{8-sla.horas}h para SLA</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:4}}><div style={{fontWeight:600,fontSize:12}}>{l.fn} {l.ln}</div><PBdg p={l.priority}/></div>{m&&<div style={{fontSize:10,color:"#888",marginBottom:4}}>{m.brand} {m.model}</div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#6B7280"}}><span>{l.phone}</span>{m&&<span style={{fontWeight:600,color:"#F28100"}}>{fmt(m.price-m.bonus)}</span>}</div><div style={{fontSize:9,color:"#444",marginTop:4}}>{l.seller_fn||(gU(l.seller)?.fn)||''} · {l.branch_code||(gB(l.branch)?.code)||''} · {ago(l.createdAt)}</div></div>);})}  {sl.length===0&&<div style={{padding:16,textAlign:"center",color:"#1F2937",fontSize:11}}>Sin tickets</div>}</div></div>);})}</div></div>
  );
}

// ═══════════════════════════════════════════
// TICKET VIEW (Yamaha-style lead detail)
// ═══════════════════════════════════════════
