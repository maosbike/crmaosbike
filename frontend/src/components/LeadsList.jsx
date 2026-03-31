import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

// ── Helpers locales ──────────────────────────────────────────────────────────
const SRC_SHORT={web:"Web",redes_sociales:"RRSS",whatsapp:"WA",presencial:"Pres.",referido:"Ref.",evento:"Ev.",llamada:"Tel."};

function Initials({fn,ln}){
  const a=(fn||'').charAt(0).toUpperCase();
  const b=(ln||'').charAt(0).toUpperCase();
  const colors=['#2563EB','#059669','#D97706','#7C3AED','#DB2777','#0891B2'];
  const idx=(a.charCodeAt(0)+b.charCodeAt(0))%colors.length;
  return(
    <div style={{width:28,height:28,borderRadius:'50%',background:colors[idx],display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',flexShrink:0}}>
      {a}{b}
    </div>
  );
}

function StatusPill({s}){
  const x=TICKET_STATUS[s];
  if(!x)return<span style={{fontSize:11,color:'#6B7280'}}>{s}</span>;
  return(
    <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:700,color:x.c,background:`${x.c}18`,border:`1px solid ${x.c}40`,whiteSpace:'nowrap'}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:x.c,flexShrink:0}}/>
      {x.l}
    </span>
  );
}

function PriorityChip({p}){
  const x=PRIORITY[p];
  if(!x)return null;
  return(
    <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:700,color:x.c,background:`${x.c}12`,textTransform:'uppercase',letterSpacing:'0.03em'}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:x.c}}/>
      {x.l}
    </span>
  );
}

const TH={textAlign:'left',padding:'10px 14px',fontSize:10,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'};
const TD={padding:'0 14px',verticalAlign:'middle'};

export function LeadsList({leads,user,nav,addLead,onRefresh,realBranches}){
  const brs=realBranches||[];
  const[search,setSearch]=useState("");const[stF,setStF]=useState("");const[brF,setBrF]=useState("");const[showNew,setShowNew]=useState(false);
  const[catalogModels,setCatalogModels]=useState([]);
  useEffect(()=>{api.getModels().then(d=>setCatalogModels(Array.isArray(d)?d:[])).catch(()=>{});},[]);
  const[nw,setNw]=useState({fn:"",ln:"",phone:"",email:"",rut:"",comuna:"",source:"presencial",motoId:"",branch_id:user.branch||"",priority:"media"});
  const f=leads.filter(l=>{if(search&&!`${l.fn} ${l.ln} ${l.phone} ${l.email} ${l.rut} ${l.num}`.toLowerCase().includes(search.toLowerCase()))return false;if(stF&&l.status!==stF)return false;if(brF&&l.branch_id!==brF&&l.branch!==brF)return false;if(user.role==="vendedor"&&l.seller_id!==user.id)return false;return true;});
  const[adding,setAdding]=useState(false);
  const[hov,setHov]=useState(null);
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
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,margin:0,color:'#111827',letterSpacing:'-0.3px'}}>Leads / Tickets</h1>
          <p style={{color:'#6B7280',fontSize:12,margin:'2px 0 0',fontWeight:500}}>{f.length} {f.length===1?'ticket':'tickets'}</p>
        </div>
        <button onClick={()=>setShowNew(true)} style={{...S.btn,display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700,padding:'8px 16px'}}>
          <Ic.plus size={14}/>Nuevo Ticket
        </button>
      </div>

      {/* Filtros */}
      <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:10,padding:'10px 12px',marginBottom:14,display:'flex',gap:8,flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:1,minWidth:200}}>
          <Ic.search size={13} color="#9CA3AF" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, RUT, ticket..." style={{...S.inp,paddingLeft:30,width:'100%'}}/>
        </div>
        <select value={stF} onChange={e=>setStF(e.target.value)} style={{...S.inp,minWidth:150}}>
          <option value="">Todos los estados</option>
          {Object.entries(TICKET_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
        </select>
        <select value={brF} onChange={e=>setBrF(e.target.value)} style={{...S.inp,minWidth:150}}>
          <option value="">Todas las sucursales</option>
          {brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'#F9FAFB',borderBottom:'2px solid #E5E7EB'}}>
              <th style={{...TH,width:72}}>#</th>
              <th style={{...TH}}>Moto cotizada</th>
              <th style={{...TH}}>Cliente</th>
              <th style={{...TH,width:130}}>Estado</th>
              <th style={{...TH,width:100}}>Prioridad</th>
              <th style={{...TH,width:140}}>Vendedor</th>
              <th style={{...TH,width:70,textAlign:'right'}}>Hace</th>
            </tr>
          </thead>
          <tbody>
            {f.map((l,i)=>{
              const pColor=(PRIORITY[l.priority]||{}).c||'#E5E7EB';
              const isHov=hov===l.id;
              return(
                <tr
                  key={l.id}
                  onClick={()=>nav("ticket",l.id)}
                  onMouseEnter={()=>setHov(l.id)}
                  onMouseLeave={()=>setHov(null)}
                  style={{
                    borderBottom: i<f.length-1?'1px solid #F3F4F6':'none',
                    cursor:'pointer',
                    background: isHov?'#F8FAFF':'#FFFFFF',
                    borderLeft:`3px solid ${isHov?pColor:'transparent'}`,
                    transition:'background 0.1s,border-color 0.1s',
                  }}
                >
                  {/* Ticket # */}
                  <td style={{...TD,paddingTop:14,paddingBottom:14}}>
                    <span style={{display:'inline-block',background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:6,padding:'3px 7px',fontSize:11,fontWeight:700,color:'#EA580C',letterSpacing:'0.02em'}}>
                      {l.num||'—'}
                    </span>
                  </td>

                  {/* Moto */}
                  <td style={{...TD,paddingTop:14,paddingBottom:14,minWidth:200}}>
                    {l.model_brand?(
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        {l.model_image&&(
                          <img src={l.model_image} alt="" style={{width:52,height:36,objectFit:'cover',borderRadius:6,background:'#F3F4F6',flexShrink:0,border:'1px solid #E5E7EB'}}/>
                        )}
                        <div>
                          <div style={{fontSize:13,fontWeight:800,color:'#111827',lineHeight:1.2}}>{l.model_brand}</div>
                          <div style={{fontSize:12,fontWeight:500,color:'#374151',lineHeight:1.3,marginTop:1}}>{l.model_name}</div>
                          {l.model_cc&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:2}}>{l.model_cc}cc{l.model_category?` · ${l.model_category}`:''}</div>}
                        </div>
                      </div>
                    ):(
                      <span style={{fontSize:12,color:'#9CA3AF',fontStyle:'italic'}}>Sin moto asignada</span>
                    )}
                  </td>

                  {/* Cliente */}
                  <td style={{...TD,paddingTop:14,paddingBottom:14,minWidth:160}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#111827',lineHeight:1.2}}>{l.fn} {l.ln}</div>
                    {l.rut&&<div style={{fontSize:10,color:'#6B7280',marginTop:2,fontVariantNumeric:'tabular-nums'}}>{l.rut}</div>}
                    {l.phone&&<div style={{fontSize:10,color:'#6B7280',marginTop:1}}>{l.phone}</div>}
                    {l.source&&<div style={{fontSize:9,color:'#9CA3AF',marginTop:3,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em'}}>{SRC_SHORT[l.source]||l.source}</div>}
                  </td>

                  {/* Estado */}
                  <td style={{...TD,paddingTop:14,paddingBottom:14}}>
                    <StatusPill s={l.status}/>
                  </td>

                  {/* Prioridad */}
                  <td style={{...TD,paddingTop:14,paddingBottom:14}}>
                    <PriorityChip p={l.priority}/>
                  </td>

                  {/* Vendedor */}
                  <td style={{...TD,paddingTop:14,paddingBottom:14}}>
                    {l.seller_fn?(
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <Initials fn={l.seller_fn} ln={l.seller_ln}/>
                        <div>
                          <div style={{fontSize:12,fontWeight:600,color:'#374151',lineHeight:1.2}}>{l.seller_fn}</div>
                          {l.seller_ln&&<div style={{fontSize:10,color:'#9CA3AF'}}>{l.seller_ln}</div>}
                        </div>
                      </div>
                    ):(
                      <span style={{fontSize:11,color:'#9CA3AF'}}>Sin asignar</span>
                    )}
                  </td>

                  {/* Hace */}
                  <td style={{...TD,paddingTop:14,paddingBottom:14,textAlign:'right'}}>
                    <span style={{fontSize:11,fontWeight:600,color:'#6B7280'}}>{ago(l.createdAt)}</span>
                  </td>
                </tr>
              );
            })}
            {f.length===0&&(
              <tr><td colSpan={7} style={{padding:'40px 24px',textAlign:'center',color:'#9CA3AF',fontSize:13}}>No se encontraron tickets</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew&&<Modal onClose={()=>setShowNew(false)} title="Nuevo Ticket / Cotización" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Nombre *" value={nw.fn} onChange={v=>setNw({...nw,fn:v})} req/><Field label="Apellido *" value={nw.ln} onChange={v=>setNw({...nw,ln:v})} req/><Field label="RUT" value={nw.rut} onChange={v=>setNw({...nw,rut:v})} ph="12.345.678-9"/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Celular" value={nw.phone} onChange={v=>setNw({...nw,phone:v})} ph="9XXXXXXXX"/><Field label="Email" value={nw.email} onChange={v=>setNw({...nw,email:v})} type="email"/><Field label="Comuna" value={nw.comuna} onChange={v=>setNw({...nw,comuna:v})} opts={["",..."Huechuraba,Providencia,Las Condes,La Florida,Maipú,Santiago Centro,Ñuñoa,Puente Alto,Otra".split(",")].map(c=>({v:c,l:c||"Seleccionar..."}))}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Origen" value={nw.source} onChange={v=>setNw({...nw,source:v})} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.map(b=>({v:b.id,l:b.name}))]}/><Field label="Prioridad" value={nw.priority} onChange={v=>setNw({...nw,priority:v})} opts={Object.entries(PRIORITY).map(([k,v])=>({v:k,l:v.l}))}/></div><div style={{marginBottom:16}}><Field label="Moto de interés" value={nw.motoId} onChange={v=>setNw({...nw,motoId:v})} opts={[{v:"",l:"Seleccionar modelo..."},...catalogModels.map(m=>({v:m.id,l:`${m.brand} ${m.model}${m.price?` - ${fmt(m.price)}`:''}`}))]}/></div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>setShowNew(false)} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Creando...":"Crear Ticket"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════
