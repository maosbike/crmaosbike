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
  const[search,setSearch]=useState("");const[stF,setStF]=useState("");const[brF,setBrF]=useState("");const[prF,setPrF]=useState("");const[srcF,setSrcF]=useState("");const[selF,setSelF]=useState("");const[showNew,setShowNew]=useState(false);
  const[catalogModels,setCatalogModels]=useState([]);
  useEffect(()=>{api.getModels().then(d=>setCatalogModels(Array.isArray(d)?d:[])).catch(()=>{});},[]);
  const[nw,setNw]=useState({fn:"",ln:"",phone:"",email:"",rut:"",comuna:"",source:"presencial",motoId:"",branch_id:user.branch||"",priority:"media"});
  const sellers=user.role!=="vendedor"?[...new Map(leads.filter(l=>l.seller_id).map(l=>[l.seller_id,{id:l.seller_id,fn:l.seller_fn,ln:l.seller_ln}])).values()]:[];
  const f=leads.filter(l=>{
    if(search&&!`${l.fn} ${l.ln} ${l.phone} ${l.email} ${l.rut} ${l.num}`.toLowerCase().includes(search.toLowerCase()))return false;
    if(stF&&l.status!==stF)return false;
    if(brF&&l.branch_id!==brF&&l.branch!==brF)return false;
    if(prF&&l.priority!==prF)return false;
    if(srcF&&l.source!==srcF)return false;
    if(selF&&String(l.seller_id)!==String(selF))return false;
    if(user.role==="vendedor"&&l.seller_id!==user.id)return false;
    return true;
  });
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
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,margin:0,color:'#111827',letterSpacing:'-0.3px'}}>Leads / Tickets</h1>
          <p style={{color:'#6B7280',fontSize:12,margin:'2px 0 0',fontWeight:500}}>
            {f.length} {f.length===1?'ticket':'tickets'}
            {(stF||brF||prF||srcF||selF||search)&&<span style={{color:'#F28100',marginLeft:6,fontWeight:700}}>· filtrado</span>}
          </p>
        </div>
        <button onClick={()=>setShowNew(true)} style={{...S.btn,display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700,padding:'8px 16px'}}>
          <Ic.plus size={14}/>Nuevo Ticket
        </button>
      </div>

      {/* Filtros */}
      <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:10,padding:'10px 12px',marginBottom:14}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
          <div style={{position:'relative',flex:'1 1 220px',minWidth:180}}>
            <Ic.search size={13} color="#9CA3AF" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, RUT, teléfono, #ticket..." style={{...S.inp,paddingLeft:30,width:'100%'}}/>
          </div>
          <select value={stF} onChange={e=>setStF(e.target.value)} style={{...S.inp,flex:'0 0 auto',minWidth:140}}>
            <option value="">Estado</option>
            {Object.entries(TICKET_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
          </select>
          <select value={prF} onChange={e=>setPrF(e.target.value)} style={{...S.inp,flex:'0 0 auto',minWidth:120}}>
            <option value="">Prioridad</option>
            {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
          </select>
          <select value={srcF} onChange={e=>setSrcF(e.target.value)} style={{...S.inp,flex:'0 0 auto',minWidth:120}}>
            <option value="">Origen</option>
            {Object.entries(SRC).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          {brs.length>0&&<select value={brF} onChange={e=>setBrF(e.target.value)} style={{...S.inp,flex:'0 0 auto',minWidth:130}}>
            <option value="">Sucursal</option>
            {brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>}
          {sellers.length>0&&<select value={selF} onChange={e=>setSelF(e.target.value)} style={{...S.inp,flex:'0 0 auto',minWidth:130}}>
            <option value="">Vendedor</option>
            {sellers.map(s=><option key={s.id} value={s.id}>{s.fn} {s.ln}</option>)}
          </select>}
          {(stF||brF||prF||srcF||selF||search)&&
            <button onClick={()=>{setSearch("");setStF("");setBrF("");setPrF("");setSrcF("");setSelF("");}} style={{...S.btn2,fontSize:11,padding:'5px 10px',flexShrink:0}}>
              Limpiar
            </button>
          }
        </div>
        {/* Contadores rápidos por estado */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {Object.entries(TICKET_STATUS).map(([k,v])=>{
            const cnt=leads.filter(l=>l.status===k&&(user.role!=="vendedor"||l.seller_id===user.id)).length;
            if(!cnt)return null;
            return<button key={k} onClick={()=>setStF(stF===k?'':k)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 9px',borderRadius:12,fontSize:10,fontWeight:700,cursor:'pointer',border:`1px solid ${stF===k?v.c:'#E5E7EB'}`,background:stF===k?`${v.c}15`:'#F9FAFB',color:stF===k?v.c:'#6B7280',transition:'all 0.1s'}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:v.c}}/>{v.l}<span style={{background:stF===k?v.c:'#E5E7EB',color:stF===k?'#fff':'#6B7280',borderRadius:8,padding:'0 5px',fontSize:9,fontWeight:800,marginLeft:2}}>{cnt}</span>
            </button>;
          })}
        </div>
      </div>

      {/* Listado tipo registro operativo */}
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {f.length===0&&(
          <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'40px 24px',textAlign:'center',color:'#9CA3AF',fontSize:13}}>
            No se encontraron tickets
          </div>
        )}
        {f.map(l=>{
          const pCfg=PRIORITY[l.priority]||{c:'#9CA3AF',l:'—'};
          const stCfg=TICKET_STATUS[l.status]||{c:'#9CA3AF',l:l.status};
          const brName=brs.find(b=>String(b.id)===String(l.branch_id))?.name||l.branch_code||null;
          const isHov=hov===l.id;
          return(
            <div
              key={l.id}
              onClick={()=>nav("ticket",l.id)}
              onMouseEnter={()=>setHov(l.id)}
              onMouseLeave={()=>setHov(null)}
              style={{
                display:'grid',
                gridTemplateColumns:'80px 1fr 1fr 140px 160px 90px',
                alignItems:'stretch',
                background:'#FFFFFF',
                border:`1px solid ${isHov?pCfg.c+'60':'#E5E7EB'}`,
                borderRadius:10,
                overflow:'hidden',
                cursor:'pointer',
                boxShadow: isHov?`0 2px 8px ${pCfg.c}20`:'0 1px 2px rgba(0,0,0,0.04)',
                transition:'border-color 0.12s,box-shadow 0.12s',
                borderLeft:`4px solid ${pCfg.c}`,
              }}
            >
              {/* Z1 — Ticket + Origen */}
              <div style={{padding:'14px 10px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',borderRight:'1px solid #F3F4F6',background:isHov?'#FAFAFA':'#F9FAFB',gap:6,textAlign:'center'}}>
                <span style={{display:'inline-block',background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:6,padding:'3px 6px',fontSize:12,fontWeight:800,color:'#EA580C',letterSpacing:'0.01em',lineHeight:1}}>
                  {l.num||'#'}
                </span>
                {l.source&&<span style={{fontSize:8,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em',lineHeight:1}}>{SRC_SHORT[l.source]||l.source}</span>}
              </div>

              {/* Z2 — Moto */}
              <div style={{padding:'14px 14px',borderRight:'1px solid #F3F4F6',display:'flex',alignItems:'center',gap:10}}>
                {l.model_image
                  ?<img src={l.model_image} alt="" style={{width:64,height:44,objectFit:'cover',borderRadius:7,background:'#F3F4F6',flexShrink:0,border:'1px solid #E5E7EB'}}/>
                  :<div style={{width:64,height:44,borderRadius:7,background:'#F3F4F6',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:18,opacity:0.2}}>🏍</span>
                  </div>
                }
                {l.model_brand?(
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',lineHeight:1}}>{l.model_brand}</div>
                    <div style={{fontSize:14,fontWeight:700,color:'#111827',lineHeight:1.3,marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.model_name}</div>
                    <div style={{display:'flex',gap:8,marginTop:4,alignItems:'center'}}>
                      {l.model_year&&<span style={{fontSize:10,fontWeight:600,color:'#6366F1',background:'#EEF2FF',padding:'1px 6px',borderRadius:4}}>{l.model_year}</span>}
                      {l.model_cc&&<span style={{fontSize:10,color:'#9CA3AF'}}>{l.model_cc}cc</span>}
                      {l.model_price>0&&<span style={{fontSize:11,fontWeight:800,color:'#059669'}}>{fmt(l.model_price)}</span>}
                    </div>
                  </div>
                ):(
                  <div>
                    <div style={{fontSize:12,color:'#D1D5DB',fontStyle:'italic'}}>Sin moto asignada</div>
                  </div>
                )}
              </div>

              {/* Z3 — Cliente */}
              <div style={{padding:'14px 14px',borderRight:'1px solid #F3F4F6',display:'flex',alignItems:'center',gap:10}}>
                <Initials fn={l.fn} ln={l.ln}/>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#111827',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.fn} {l.ln}</div>
                  {l.phone&&<div style={{fontSize:11,color:'#374151',marginTop:3,fontWeight:600}}>{l.phone}</div>}
                  {l.email&&<div style={{fontSize:10,color:'#6B7280',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.email}</div>}
                  {l.rut&&<div style={{fontSize:9,color:'#9CA3AF',marginTop:2,fontVariantNumeric:'tabular-nums'}}>{l.rut}</div>}
                </div>
              </div>

              {/* Z4 — Estado + Prioridad */}
              <div style={{padding:'14px 12px',borderRight:'1px solid #F3F4F6',display:'flex',flexDirection:'column',justifyContent:'center',gap:7}}>
                <StatusPill s={l.status}/>
                <PriorityChip p={l.priority}/>
              </div>

              {/* Z5 — Vendedor + Sucursal */}
              <div style={{padding:'14px 12px',borderRight:'1px solid #F3F4F6',display:'flex',alignItems:'center',gap:8}}>
                {l.seller_fn?(
                  <>
                    <Initials fn={l.seller_fn} ln={l.seller_ln}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#374151',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.seller_fn} {l.seller_ln}</div>
                      {brName&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:2}}>{brName}</div>}
                    </div>
                  </>
                ):(
                  <div>
                    <div style={{fontSize:11,color:'#D1D5DB'}}>Sin asignar</div>
                    {brName&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:2}}>{brName}</div>}
                  </div>
                )}
              </div>

              {/* Z6 — Fecha */}
              <div style={{padding:'14px 12px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'flex-end'}}>
                <div style={{fontSize:13,fontWeight:800,color:'#374151'}}>{ago(l.createdAt)}</div>
                <div style={{fontSize:9,color:'#9CA3AF',marginTop:3,textAlign:'right'}}>{fD(l.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {showNew&&<Modal onClose={()=>setShowNew(false)} title="Nuevo Ticket / Cotización" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Nombre *" value={nw.fn} onChange={v=>setNw({...nw,fn:v})} req/><Field label="Apellido *" value={nw.ln} onChange={v=>setNw({...nw,ln:v})} req/><Field label="RUT" value={nw.rut} onChange={v=>setNw({...nw,rut:v})} ph="12.345.678-9"/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Celular" value={nw.phone} onChange={v=>setNw({...nw,phone:v})} ph="9XXXXXXXX"/><Field label="Email" value={nw.email} onChange={v=>setNw({...nw,email:v})} type="email"/><Field label="Comuna" value={nw.comuna} onChange={v=>setNw({...nw,comuna:v})} opts={["",..."Huechuraba,Providencia,Las Condes,La Florida,Maipú,Santiago Centro,Ñuñoa,Puente Alto,Otra".split(",")].map(c=>({v:c,l:c||"Seleccionar..."}))}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Origen" value={nw.source} onChange={v=>setNw({...nw,source:v})} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.map(b=>({v:b.id,l:b.name}))]}/><Field label="Prioridad" value={nw.priority} onChange={v=>setNw({...nw,priority:v})} opts={Object.entries(PRIORITY).map(([k,v])=>({v:k,l:v.l}))}/></div><div style={{marginBottom:16}}><Field label="Moto de interés" value={nw.motoId} onChange={v=>setNw({...nw,motoId:v})} opts={[{v:"",l:"Seleccionar modelo..."},...catalogModels.map(m=>({v:m.id,l:`${m.brand} ${m.model}${m.price?` - ${fmt(m.price)}`:''}`}))]}/></div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>setShowNew(false)} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Creando...":"Crear Ticket"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════
