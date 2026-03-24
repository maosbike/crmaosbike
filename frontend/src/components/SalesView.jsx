import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui';

export function SalesView({leads,user}){
  const ganados=leads.filter(l=>l.status==="ganado");
  return(<div><h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Ventas Cerradas</h1><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:10,marginBottom:16}}><Stat icon={Ic.sale} ic="#10B981" ib="rgba(16,185,129,0.1)" label="Ventas" val={ganados.length}/><Stat icon={Ic.file} ic="#F59E0B" ib="rgba(245,158,11,0.1)" label="Sin Factura" val={ganados.filter(l=>!l.postVenta.factura).length}/><Stat icon={Ic.box} ic="#8B5CF6" ib="rgba(139,92,246,0.1)" label="Pend. Homolog." val={ganados.filter(l=>!l.postVenta.homRec).length}/><Stat icon={Ic.target} ic="#06B6D4" ib="rgba(6,182,212,0.1)" label="Pend. Entrega" val={ganados.filter(l=>!l.postVenta.entregada).length}/></div>
    <div className="crm-table-scroll" style={{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:550}}><thead><tr style={{borderBottom:"1px solid #1E1E1F"}}>{["Ticket","Cliente","Moto","Factura","Pago","Homolog.","Enrolada","Entregada"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 10px",fontSize:10,fontWeight:600,color:"#6B6B6B",textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{ganados.map(l=>{const m=l.model_brand?{brand:l.model_brand,model:l.model_name}:null;return<tr key={l.id} style={{borderBottom:"1px solid #1A1A1B"}}><td style={{padding:"8px 10px",color:"#F28100",fontWeight:600,fontSize:11}}>{l.num}</td><td style={{padding:"8px 10px"}}>{l.fn} {l.ln}</td><td style={{padding:"8px 10px"}}>{m?.brand} {m?.model}</td>{["factura","pagoReg","homRec","enrolada","entregada"].map(f=><td key={f} style={{padding:"8px 10px",textAlign:"center"}}>{l.postVenta[f]?<Ic.check size={16} color="#10B981"/>:<div style={{width:16,height:16,borderRadius:4,border:"2px solid #333",margin:"0 auto"}}/>}</td>)}</tr>;})}</tbody></table></div>
  </div>);
}

const CAT_COLOR={
  "Commuter":"#3B82F6","Naked":"#8B5CF6","Sport":"#EF4444","Scooter":"#06B6D4",
  "Adventure":"#10B981","Off-Road":"#F59E0B","Touring":"#6366F1","Eléctrica":"#22C55E",
  "Big Bike":"#EC4899","ATV":"#F97316","Cruiser":"#A78BFA"
};

