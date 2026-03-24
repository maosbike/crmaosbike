import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui';

export function LeadsList({leads,user,nav,addLead,onRefresh,realBranches}){
  const brs=realBranches||[];
  const[search,setSearch]=useState("");const[stF,setStF]=useState("");const[brF,setBrF]=useState("");const[showNew,setShowNew]=useState(false);
  const[catalogModels,setCatalogModels]=useState([]);
  useEffect(()=>{api.getModels().then(d=>setCatalogModels(Array.isArray(d)?d:[])).catch(()=>{});},[]);
  const[nw,setNw]=useState({fn:"",ln:"",phone:"",email:"",rut:"",comuna:"",source:"presencial",motoId:"",branch_id:user.branch||"",priority:"media"});
  const f=leads.filter(l=>{if(search&&!`${l.fn} ${l.ln} ${l.phone} ${l.email} ${l.rut} ${l.num}`.toLowerCase().includes(search.toLowerCase()))return false;if(stF&&l.status!==stF)return false;if(brF&&l.branch_id!==brF&&l.branch!==brF)return false;if(user.role==="vendedor"&&l.seller_id!==user.id)return false;return true;});
  const[adding,setAdding]=useState(false);
  const handleAdd=async e=>{
    e.preventDefault();setAdding(true);
    try{
      const body={first_name:nw.fn,last_name:nw.ln,phone:nw.phone,email:nw.email,rut:nw.rut,comuna:nw.comuna,source:nw.source,branch_id:nw.branch_id||null,priority:nw.priority,model_id:nw.motoId||null,wants_financing:false};
      const created=await api.createTicket(body);
      addLead(mapTicket(created));
      setShowNew(false);
      setTimeout(()=>onRefresh?.(),1000);
    }catch(ex){alert(ex.message||"Error al crear ticket");}
    finally{setAdding(false);}
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div><h1 style={{fontSize:18,fontWeight:700,margin:0}}>Leads / Tickets</h1><p style={{color:"#6B6B6B",fontSize:12}}>{f.length} tickets</p></div><button onClick={()=>setShowNew(true)} style={{...S.btn,display:"flex",alignItems:"center",gap:6,fontSize:12}}><Ic.plus size={15}/>Nuevo Ticket</button></div>
      <div className="crm-filters" style={{...S.card,padding:10,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}><div className="crm-search" style={{position:"relative",flex:1,minWidth:200}}><Ic.search size={14} color="#555" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, RUT, ticket..." style={{...S.inp,paddingLeft:30,width:"100%"}}/></div><select value={stF} onChange={e=>setStF(e.target.value)} style={{...S.inp,minWidth:140}}><option value="">Todos los estados</option>{Object.entries(TICKET_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select><select value={brF} onChange={e=>setBrF(e.target.value)} style={{...S.inp,minWidth:140}}><option value="">Todas las sucursales</option>{brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="crm-table-scroll" style={{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{borderBottom:"1px solid #1E1E1F"}}>{["Ticket","Cliente","Contacto","Moto","Prioridad","Estado","Vendedor","Fecha"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:10,fontWeight:600,color:"#6B6B6B",textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{f.map(l=>{const m=l.model_brand?{brand:l.model_brand,model:l.model_name}:null;const sfn=l.seller_fn||'';const sln=l.seller_ln||'';return<tr key={l.id} onClick={()=>nav("ticket",l.id)} style={{borderBottom:"1px solid #1A1A1B",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#151516"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><td style={{padding:"9px 12px",color:"#F28100",fontWeight:600,fontSize:11}}>{l.num}</td><td style={{padding:"9px 12px"}}><div style={{fontWeight:600}}>{l.fn} {l.ln}</div><div style={{fontSize:10,color:"#555"}}>{l.rut}</div></td><td style={{padding:"9px 12px"}}><div style={{fontSize:11,color:"#888"}}>{l.phone}</div><div style={{fontSize:10,color:"#555"}}>{l.email}</div></td><td style={{padding:"9px 12px"}}>{m?`${m.brand} ${m.model}`:<span style={{color:"#555"}}>-</span>}</td><td style={{padding:"9px 12px"}}><PBdg p={l.priority}/></td><td style={{padding:"9px 12px"}}><TBdg s={l.status}/></td><td style={{padding:"9px 12px",fontSize:11}}>{sfn}{sln?` ${sln[0]}.`:''}</td><td style={{padding:"9px 12px",fontSize:10,color:"#555"}}>{ago(l.createdAt)}</td></tr>;})}</tbody></table></div>
      {showNew&&<Modal onClose={()=>setShowNew(false)} title="Nuevo Ticket / Cotización" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Nombre *" value={nw.fn} onChange={v=>setNw({...nw,fn:v})} req/><Field label="Apellido *" value={nw.ln} onChange={v=>setNw({...nw,ln:v})} req/><Field label="RUT" value={nw.rut} onChange={v=>setNw({...nw,rut:v})} ph="12.345.678-9"/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Celular" value={nw.phone} onChange={v=>setNw({...nw,phone:v})} ph="9XXXXXXXX"/><Field label="Email" value={nw.email} onChange={v=>setNw({...nw,email:v})} type="email"/><Field label="Comuna" value={nw.comuna} onChange={v=>setNw({...nw,comuna:v})} opts={["",..."Huechuraba,Providencia,Las Condes,La Florida,Maipú,Santiago Centro,Ñuñoa,Puente Alto,Otra".split(",")].map(c=>({v:c,l:c||"Seleccionar..."}))}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Origen" value={nw.source} onChange={v=>setNw({...nw,source:v})} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.map(b=>({v:b.id,l:b.name}))]}/><Field label="Prioridad" value={nw.priority} onChange={v=>setNw({...nw,priority:v})} opts={Object.entries(PRIORITY).map(([k,v])=>({v:k,l:v.l}))}/></div><div style={{marginBottom:16}}><Field label="Moto de interés" value={nw.motoId} onChange={v=>setNw({...nw,motoId:v})} opts={[{v:"",l:"Seleccionar modelo..."},...catalogModels.map(m=>({v:m.id,l:`${m.brand} ${m.model}${m.price?` - ${fmt(m.price)}`:''}`}))]}/></div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>setShowNew(false)} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Creando...":"Crear Ticket"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════

