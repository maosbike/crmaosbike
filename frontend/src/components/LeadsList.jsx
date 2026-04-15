import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, STATUS_ORDER, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ROLES, hasRole, useIsMobile, ViewHeader } from '../ui.jsx';

// ── Helpers y constantes visuales (mismo lenguaje que InventoryView) ─────────
const SRC_SHORT={web:"Web",redes_sociales:"RRSS",whatsapp:"WA",presencial:"Pres.",referido:"Ref.",evento:"Ev.",llamada:"Tel."};

// Color + bg por estado ahora viven en TICKET_STATUS (fuente única).
// Helper thin para mantener el shape legado {color, light} que usaba ST_STRIP.
const stripFor = (k) => {
  const v = TICKET_STATUS[k];
  return v ? { color: v.c, light: v.bg || '#F9FAFB' } : { color: '#6B7280', light: '#F9FAFB' };
};

const selectCtrl={height:32,borderRadius:7,border:'1.5px solid #E5E7EB',background:'#FFFFFF',color:'#374151',fontSize:12,padding:'0 8px',cursor:'pointer',fontFamily:'inherit',outline:'none'};
const filterLabel={fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'};
const sectionLbl={fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6};
const divider=<div style={{width:1,height:28,background:'#E5E7EB',flexShrink:0}}/>;

function Initials({fn,ln,size=30}){
  const a=(fn||'').charAt(0).toUpperCase();
  const b=(ln||'').charAt(0).toUpperCase();
  const colors=['#2563EB','#059669','#D97706','#7C3AED','#DB2777','#0891B2'];
  const idx=((a.charCodeAt(0)||0)+(b.charCodeAt(0)||0))%colors.length;
  return(
    <div style={{width:size,height:size,borderRadius:'50%',background:colors[idx],display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.37,fontWeight:700,color:'#ffffff',flexShrink:0,letterSpacing:'-0.5px'}}>
      {a}{b||'?'}
    </div>
  );
}

// STATUS_ORDER viene de ui.jsx (fuente única).

export function LeadsList({leads,user,nav,addLead,onRefresh,realBranches,filter,onFilterChange}){
  const brs=realBranches||[];
  const isMobile = useIsMobile();
  // Filtros persistidos en App.jsx para mantener contexto al volver de una ficha
  const {search='',stF='',brF='',prF='',srcF='',selF='',attF=false,orpF=false}=filter||{};
  const setFilter=(key,val)=>onFilterChange(f=>({...f,[key]:val}));
  const setSearch=v=>setFilter('search',v);
  const setStF=v=>setFilter('stF',v);
  const setBrF=v=>setFilter('brF',v);
  const setPrF=v=>setFilter('prF',v);
  const setSrcF=v=>setFilter('srcF',v);
  const setSelF=v=>setFilter('selF',v);
  const setAttF=v=>setFilter('attF',v);
  const setOrpF=v=>setFilter('orpF',v);
  const clearFilters=()=>onFilterChange({search:'',stF:'',brF:'',prF:'',srcF:'',selF:'',attF:false,orpF:false});
  const[showNew,setShowNew]=useState(false);
  const[catalogModels,setCatalogModels]=useState([]);
  const[allSellers,setAllSellers]=useState([]);
  useEffect(()=>{
    api.getModels().then(d=>setCatalogModels(Array.isArray(d)?d:[])).catch(()=>{});
    if(!hasRole(user, ROLES.VEND)) api.getSellers().then(d=>setAllSellers(Array.isArray(d)?d:[])).catch(()=>{});
  },[]);
  const[nw,setNw]=useState({fn:"",ln:"",phone:"",email:"",rut:"",comuna:"",source:"presencial",motoId:"",branch_id:user.branch||"",priority:"media",seller_id:""});
  const[reassigningId,setReassigningId]=useState(null);
  const[reassignTo,setReassignTo]=useState('');
  const[reassigningBusy,setReassigningBusy]=useState(false);
  // localOverrides: {leadId: {seller_id, seller_fn, seller_ln}} — actualización optimista
  // Se aplica inmediatamente al confirmar traspaso; se limpia cuando llegan los datos del servidor
  const[localOverrides,setLocalOverrides]=useState({});
  useEffect(()=>{setLocalOverrides({});},[leads]);
  const effectiveLeads=leads.map(l=>localOverrides[l.id]?{...l,...localOverrides[l.id]}:l);
  const handleReassign=async(e,leadId)=>{
    e.stopPropagation();
    if(!reassignTo)return;
    setReassigningBusy(true);
    // Actualización optimista inmediata — el lead cambia de vendedor en la UI al instante
    const newSeller=allSellers.find(s=>s.id===reassignTo);
    if(newSeller) setLocalOverrides(prev=>({...prev,[leadId]:{seller_id:newSeller.id,seller_fn:newSeller.first_name,seller_ln:newSeller.last_name}}));
    setReassigningId(null);setReassignTo('');
    try{
      await api.manualReassign({ticket_id:leadId,to_user_id:reassignTo});
      onRefresh?.(); // sincroniza con servidor; useEffect[leads] limpiará overrides
    }catch(ex){
      // Revertir el override si falló
      setLocalOverrides(prev=>{const n={...prev};delete n[leadId];return n;});
      alert(ex.message||'Error al reasignar');
    }
    finally{setReassigningBusy(false);}
  };
  const sellers=!hasRole(user, ROLES.VEND)?[...new Map(effectiveLeads.filter(l=>l.seller_id).map(l=>[l.seller_id,{id:l.seller_id,fn:l.seller_fn,ln:l.seller_ln}])).values()]:[];
  const f=effectiveLeads.filter(l=>{
    if(search&&!`${l.fn} ${l.ln} ${l.phone} ${l.email} ${l.rut} ${l.num}`.toLowerCase().includes(search.toLowerCase()))return false;
    if(stF&&l.status!==stF)return false;
    if(brF&&l.branch_id!==brF&&l.branch!==brF)return false;
    if(prF&&l.priority!==prF)return false;
    if(srcF&&l.source!==srcF)return false;
    if(selF&&String(l.seller_id)!==String(selF))return false;
    if(attF&&!l.needs_attention)return false;
    if(orpF&&l.seller_id)return false;
    if(hasRole(user, ROLES.VEND)&&l.seller_id!==user.id)return false;
    return true;
  });
  const hasFilters=!!(search||stF||brF||prF||srcF||selF||attF||orpF);
  const[adding,setAdding]=useState(false);
  const handleAdd=async e=>{
    e.preventDefault();setAdding(true);
    try{
      const body={first_name:nw.fn,last_name:nw.ln,phone:nw.phone,email:nw.email,rut:nw.rut,comuna:nw.comuna,source:nw.source,branch_id:nw.branch_id||null,priority:nw.priority,model_id:nw.motoId||null,wants_financing:false,...(nw.seller_id?{assigned_to:nw.seller_id}:{})};
      const created=await api.createTicket(body);
      addLead(mapTicket(created));
      setShowNew(false);
      setTimeout(()=>onRefresh?.(),1000);
    }catch(ex){alert(ex.message||"Error al crear ticket");}
    finally{setAdding(false);}
  };

  return(
    <div>
      {/* ── Header ── */}
      <ViewHeader
        preheader="Comercial · Leads"
        title="Leads / Tickets"
        count={f.length}
        itemLabel="registro"
        filtered={hasFilters}
        actions={
          <button onClick={()=>setShowNew(true)} style={{...S.btn,display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700,padding:'8px 16px'}}>
            <Ic.plus size={14}/>Nuevo Ticket
          </button>
        }
      />

      {/* ── KPI "Necesita atención" ── */}
      {(()=>{
        const attCount=effectiveLeads.filter(l=>l.needs_attention&&(!hasRole(user, ROLES.VEND)||l.seller_id===user.id)).length;
        if(attCount===0&&!attF)return null;
        return(
          <div style={{marginBottom:12}}>
            <button onClick={()=>setAttF(!attF)} style={{
              display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderRadius:12,
              border:attF?'2px solid #EF4444':'1.5px solid #FECACA',
              background:attF?'#FEF2F2':'#FFFFFF',cursor:'pointer',fontFamily:'inherit',
              boxShadow:attF?'0 3px 14px rgba(239,68,68,0.18)':'0 1px 3px rgba(0,0,0,0.04)'}}>
              <span style={{fontSize:22}}>⚠️</span>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:22,fontWeight:900,color:'#DC2626',lineHeight:1}}>{attCount}</div>
                <div style={{fontSize:11,fontWeight:700,color:'#B91C1C',marginTop:2}}>Necesita atención · 48h sin gestión</div>
              </div>
              {attF&&<span style={{marginLeft:12,fontSize:10,fontWeight:700,color:'#EF4444',background:'#FEE2E2',padding:'3px 8px',borderRadius:6}}>FILTRADO</span>}
            </button>
          </div>
        );
      })()}

      {/* ── Banner leads sin asignar (solo admin) ── */}
      {!hasRole(user, ROLES.VEND)&&(()=>{
        const orpCount=effectiveLeads.filter(l=>!l.seller_id).length;
        if(orpCount===0&&!orpF)return null;
        return(
          <div style={{marginBottom:12}}>
            <button onClick={()=>setOrpF(!orpF)} style={{
              display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderRadius:12,
              border:orpF?'2px solid #F59E0B':'1.5px solid #FCD34D',
              background:orpF?'#FFFBEB':'#FFFFFF',cursor:'pointer',fontFamily:'inherit',
              boxShadow:orpF?'0 3px 14px rgba(245,158,11,0.18)':'0 1px 3px rgba(0,0,0,0.04)'}}>
              <span style={{fontSize:22}}>👤</span>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:22,fontWeight:900,color:'#B45309',lineHeight:1}}>{orpCount}</div>
                <div style={{fontSize:11,fontWeight:700,color:'#92400E',marginTop:2}}>Sin asignar · sin vendedor</div>
              </div>
              {orpF&&<span style={{marginLeft:12,fontSize:10,fontWeight:700,color:'#F59E0B',background:'#FEF3C7',padding:'3px 8px',borderRadius:6}}>FILTRADO</span>}
            </button>
          </div>
        );
      })()}

      {/* ── KPI rápidos por estado ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8,marginBottom:18}}>
        {Object.entries(TICKET_STATUS).map(([k,v])=>{
          const cnt=effectiveLeads.filter(l=>l.status===k&&(!hasRole(user, ROLES.VEND)||l.seller_id===user.id)).length;
          const strip=stripFor(k);
          const active=stF===k;
          return(
            <button key={k} onClick={()=>setStF(stF===k?'':k)} style={{
              position:'relative',overflow:'hidden',padding:'14px 16px',borderRadius:12,border:'none',cursor:'pointer',
              textAlign:'left',fontFamily:'inherit',
              background:active?strip.light:'#FFFFFF',
              outline:active?`2px solid ${strip.color}`:'1px solid #E5E7EB',
              outlineOffset:active?1:0,
              boxShadow:active?`0 3px 14px ${strip.color}22`:'0 1px 3px rgba(0,0,0,0.04)',
              transition:'all 0.13s',
            }}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:strip.color,borderRadius:'12px 12px 0 0'}}/>
              <div style={{fontSize:28,fontWeight:900,color:active?strip.color:'#111827',letterSpacing:'-1px',lineHeight:1,marginBottom:4}}>{cnt}</div>
              <div style={{fontSize:11,fontWeight:700,color:active?strip.color:'#374151'}}>{v.l}</div>
            </button>
          );
        })}
      </div>

      {/* ── Cartera por vendedor (solo admins) ── */}
      {!hasRole(user, ROLES.VEND)&&allSellers.length>0&&(
        <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
          {allSellers.map(s=>{
            const active=effectiveLeads.filter(l=>l.seller_id===s.id&&!['ganado','perdido'].includes(l.status)).length;
            const isSel=selF===s.id;
            return(
              <button key={s.id} onClick={()=>setSelF(isSel?'':s.id)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,border:isSel?'2px solid #3B82F6':'1px solid #E5E7EB',background:isSel?'#EFF6FF':'#FFFFFF',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',transition:'all 0.12s'}}>
                <span style={{fontSize:22,fontWeight:900,color:isSel?'#3B82F6':'#111827',lineHeight:1}}>{active}</span>
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:11,fontWeight:700,color:isSel?'#3B82F6':'#374151'}}>{s.first_name} {s.last_name}</div>
                  <div style={{fontSize:9,color:'#9CA3AF',marginTop:1}}>leads activos</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Barra de filtros — mismo estilo que Inventario ── */}
      <div style={{background:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:12,padding:'14px 18px',marginBottom:20,display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div style={{position:'relative',flex:'1 1 200px',minWidth:160}}>
          <Ic.search size={14} color="#9CA3AF" style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, RUT, teléfono, ticket..." style={{...S.inp,paddingLeft:34,width:'100%',height:36,borderRadius:8,fontSize:12}}/>
        </div>
        {divider}
        <div style={{display:'flex',flexDirection:'column',gap:2}}>
          <label style={filterLabel}>Estado</label>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {Object.entries(TICKET_STATUS).map(([k,v])=>{
              const strip=stripFor(k);
              return<button key={k} onClick={()=>setStF(stF===k?'':k)} style={{padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',background:stF===k?strip.color:'transparent',color:stF===k?'#FFFFFF':'#6B7280',border:`1.5px solid ${stF===k?strip.color:'#E5E7EB'}`,transition:'all 0.12s'}}>{v.l}</button>;
            })}
          </div>
        </div>
        {divider}
        <div style={{display:'flex',flexDirection:'column',gap:2}}>
          <label style={filterLabel}>Prioridad</label>
          <select value={prF} onChange={e=>setPrF(e.target.value)} style={selectCtrl}>
            <option value="">Todas</option>
            {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
          </select>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:2}}>
          <label style={filterLabel}>Origen</label>
          <select value={srcF} onChange={e=>setSrcF(e.target.value)} style={selectCtrl}>
            <option value="">Todos</option>
            {Object.entries(SRC).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {brs.length>0&&<div style={{display:'flex',flexDirection:'column',gap:2}}>
          <label style={filterLabel}>Sucursal</label>
          <select value={brF} onChange={e=>setBrF(e.target.value)} style={selectCtrl}>
            <option value="">Todas</option>
            {brs.filter(b=>b.code!=='MOV').map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>}
        {sellers.length>0&&<div style={{display:'flex',flexDirection:'column',gap:2}}>
          <label style={filterLabel}>Vendedor</label>
          <select value={selF} onChange={e=>setSelF(e.target.value)} style={selectCtrl}>
            <option value="">Todos</option>
            {sellers.map(s=><option key={s.id} value={s.id}>{s.fn} {s.ln}</option>)}
          </select>
        </div>}
        {hasFilters&&<>
          {divider}
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            <label style={{...filterLabel,color:'transparent'}}>·</label>
            <button onClick={()=>{clearFilters();}} style={{height:32,padding:'0 12px',borderRadius:8,border:'1px solid #E5E7EB',background:'#F9FAFB',fontSize:11,cursor:'pointer',color:'#6B7280',display:'flex',alignItems:'center',gap:5,fontWeight:500,fontFamily:'inherit'}}>
              <Ic.x size={10}/>{f.length} resultado{f.length!==1?'s':''}
            </button>
          </div>
        </>}
      </div>

      {/* ── Contador ── */}
      {f.length>0&&<div style={{fontSize:11,color:'#9CA3AF',fontWeight:500,paddingLeft:2,marginBottom:6}}>
        {f.length} ticket{f.length!==1?'s':''}{hasFilters?` (de ${effectiveLeads.filter(l=>!hasRole(user, ROLES.VEND)||l.seller_id===user.id).length} total)`:''}
      </div>}

      {/* ── Lista de registros — mismo patrón visual que Inventario ── */}
      {f.length>0&&!stF&&<div style={{fontSize:10,fontWeight:600,color:'#9CA3AF',paddingLeft:2,marginBottom:6,letterSpacing:'0.04em'}}>Ordenado por estado</div>}
      {f.length===0?(
        <div style={{background:'#FFFFFF',borderRadius:14,border:'1px dashed #E5E7EB',padding:'60px 0',textAlign:'center'}}>
          <div style={{fontSize:14,fontWeight:700,color:'#374151',marginBottom:4}}>{hasFilters?'Sin resultados con estos filtros':'Sin tickets registrados'}</div>
          <div style={{fontSize:12,color:'#9CA3AF'}}>
            {hasFilters&&<button onClick={()=>{clearFilters();}} style={{background:'none',border:'none',color:'#F28100',fontSize:12,cursor:'pointer',textDecoration:'underline',padding:0,fontFamily:'inherit'}}>Limpiar filtros</button>}
          </div>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {(stF?f:[...f].sort((a,b)=>{const ai=STATUS_ORDER.indexOf(a.status);const bi=STATUS_ORDER.indexOf(b.status);return(ai===-1?99:ai)-(bi===-1?99:bi);})).map(x=>{
            const stStrip=stripFor(x.status);
            const stCfg=TICKET_STATUS[x.status]||{l:x.status,c:'#6B7280'};
            const prCfg=PRIORITY[x.priority]||{l:'—',c:'#9CA3AF'};
            const brName=brs.find(b=>String(b.id)===String(x.branch_id))?.name||x.branch_code||null;
            // ── Variante MOBILE: card apilada, simple, táctil ─────────────
            if (isMobile) {
              return (
                <div key={x.id} onClick={()=>nav("ticket",x.id)}
                  style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E5E7EB', padding:'10px 12px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', display:'flex', flexDirection:'column', gap:6, cursor:'pointer', position:'relative' }}>
                  {/* Barra superior de color de estado */}
                  <div style={{ position:'absolute', left:0, top:0, bottom:0, width:4, background:stStrip.color, borderRadius:'12px 0 0 12px' }}/>
                  {/* L1: nombre + priority + needs_attention */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, paddingLeft:6 }}>
                    <div style={{ flex:1, minWidth:0, fontSize:14, fontWeight:700, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {x.fn} {x.ln}
                    </div>
                    {x.needs_attention && <span title="Necesita atención" style={{ fontSize:10, fontWeight:800, color:'#ffffff', background:'#DC2626', padding:'2px 6px', borderRadius:6 }}>!</span>}
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, color:prCfg.c }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:prCfg.c }}/>{prCfg.l}
                    </span>
                  </div>
                  {/* L2: modelo + estado badge */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, paddingLeft:6 }}>
                    <div style={{ flex:1, minWidth:0, fontSize:12, color:'#4B5563', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {x.model_brand ? `${x.model_brand} ${x.model_name||''}` : <span style={{color:'#D1D5DB',fontStyle:'italic'}}>Sin moto</span>}
                      {x.comuna ? ` · ${x.comuna}` : ''}
                    </div>
                    <Bdg l={stCfg.l} c={stCfg.c}/>
                  </div>
                  {/* L3: vendedor + ticket# + ago */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, paddingLeft:6, fontSize:11, color:'#6B7280' }}>
                    <span style={{ flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {x.seller_fn ? `${x.seller_fn} ${x.seller_ln||''}` : 'Sin asignar'}
                      {brName ? ` · ${brName}` : ''}
                    </span>
                    {x.num && <span style={{ fontSize:10, color:'#9CA3AF' }}>#{x.num}</span>}
                    {(()=>{
                      const hasC=!!x.lastContact;
                      const refH=Math.floor((Date.now()-new Date(hasC?x.lastContact:x.createdAt).getTime())/3.6e6);
                      const urgente=refH>=24;
                      return<span style={{ fontSize:10, color:urgente?'#EF4444':'#9CA3AF', fontWeight:urgente?700:400 }}>
                        {hasC?ago(x.lastContact):`sin contacto · ${ago(x.createdAt)}`}
                      </span>;
                    })()}
                  </div>
                </div>
              );
            }
            return(
              <div key={x.id}
                onClick={()=>nav("ticket",x.id)}
                onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.10)'}
                onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 6px rgba(0,0,0,0.06)'}
                className="crm-lead-row"
                style={{display:'flex',alignItems:'stretch',background:'#FFFFFF',borderRadius:14,border:'1px solid #E5E7EB',overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,0.06)',cursor:'pointer',transition:'box-shadow 0.15s',minWidth:0}}
              >
                {/* Strip izquierdo — color de estado */}
                <div className="crm-lead-strip" style={{width:72,flexShrink:0,background:stStrip.color,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:5,padding:'10px 4px',position:'relative'}}>
                  <span style={{fontSize:10,fontWeight:900,color:'#FFFFFF',letterSpacing:'0.04em',textAlign:'center',lineHeight:1.2,textTransform:'uppercase'}}>{stCfg.l}</span>
                  {x.num&&<span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.7)',letterSpacing:'0.03em'}}>{x.num}</span>}
                  {x.needs_attention&&<span title="Necesita atención · 48h sin gestión" style={{position:'absolute',top:6,right:6,fontSize:11,lineHeight:1,background:'#DC2626',color:'#ffffff',padding:'2px 5px',borderRadius:6,fontWeight:800,boxShadow:'0 0 0 2px #ffffff'}}>!</span>}
                </div>

                {/* Zona Moto */}
                <div className="crm-lead-moto" style={{flex:'0 0 310px',padding:'12px 16px',borderRight:'1px solid #F3F4F6',display:'flex',alignItems:'center',gap:14}}>
                  {x.model_image
                    ?<img src={x.model_image} alt="" className="crm-lead-img" style={{width:120,height:84,padding:6,boxSizing:'border-box',objectFit:'contain',objectPosition:'center',borderRadius:10,border:'1.5px solid #E5E7EB',background:'#F9FAFB',flexShrink:0}}/>
                    :<div className="crm-lead-img" style={{width:120,height:84,borderRadius:10,border:'1.5px dashed #D1D5DB',background:'#F9FAFB',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#C9D0D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M8 17.5h7M15 6l2 5h4M5.5 14l2.5-7h5l3 5"/></svg>
                    </div>
                  }
                  <div style={{flex:1,minWidth:0}}>
                    {x.model_brand?(
                      <>
                        <div style={{fontSize:17,fontWeight:900,color:'#111827',letterSpacing:'-0.4px',lineHeight:1.1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.model_brand}</div>
                        <div style={{fontSize:12,fontWeight:600,color:'#4B5563',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.model_name}</div>
                        <div style={{display:'flex',gap:6,marginTop:5,alignItems:'center',flexWrap:'wrap'}}>
                          {x.model_year&&<span style={{fontSize:12,fontWeight:800,color:'#4F46E5',background:'#EEF2FF',padding:'2px 8px',borderRadius:6,border:'1px solid #C7D2FE'}}>{x.model_year}</span>}
                          {x.model_cc&&<span style={{fontSize:10,color:'#9CA3AF'}}>{x.model_cc}cc</span>}
                          {x.model_price>0&&<span style={{fontSize:11,fontWeight:800,color:'#15803D',background:'#F0FDF4',padding:'2px 7px',borderRadius:5,border:'1px solid #86EFAC'}}>{fmt(x.model_price)}</span>}
                        </div>
                      </>
                    ):(
                      <div style={{fontSize:12,color:'#D1D5DB',fontStyle:'italic',marginTop:4}}>Sin moto asignada</div>
                    )}
                  </div>
                </div>

                {/* Zona Cliente */}
                <div className="crm-lead-client" style={{flex:'0 0 210px',minWidth:0,overflow:'hidden',padding:'12px 16px',borderRight:'1px solid #F3F4F6',display:'flex',flexDirection:'column',justifyContent:'flex-start'}}>
                  <div style={{...sectionLbl,marginBottom:7}}>Cliente</div>
                  <div style={{fontSize:14,fontWeight:700,color:'#111827',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.fn} {x.ln}</div>
                  {x.phone&&<div style={{fontSize:11,fontWeight:600,color:'#374151',marginTop:4}}>{x.phone}</div>}
                  {x.rut&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:2,fontVariantNumeric:'tabular-nums'}}>{x.rut}</div>}
                  {x.source&&<div style={{marginTop:6}}>
                    <span style={{fontSize:9,fontWeight:700,color:'#6B7280',background:'#F3F4F6',padding:'2px 8px',borderRadius:5,border:'1px solid #E5E7EB',textTransform:'uppercase',letterSpacing:'0.06em'}}>{SRC_SHORT[x.source]||x.source}</span>
                  </div>}
                </div>

                {/* Zona Estado / Prioridad */}
                <div className="crm-lead-status" style={{flex:'0 0 145px',padding:'12px 16px',borderRight:'1px solid #F3F4F6',display:'flex',flexDirection:'column',justifyContent:'flex-start'}}>
                  <div style={{...sectionLbl,marginBottom:7}}>Estado</div>
                  <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 11px',borderRadius:20,fontSize:11,fontWeight:700,color:stCfg.c,background:`${stCfg.c}18`,border:`1px solid ${stCfg.c}40`,whiteSpace:'nowrap',alignSelf:'flex-start'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:stCfg.c,flexShrink:0}}/>
                    {stCfg.l}
                  </span>
                  <div style={{marginTop:8}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:6,fontSize:10,fontWeight:700,color:prCfg.c,background:`${prCfg.c}12`,border:`1px solid ${prCfg.c}30`,textTransform:'uppercase',letterSpacing:'0.04em'}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:prCfg.c}}/>
                      {prCfg.l}
                    </span>
                  </div>
                  {(()=>{
                    const fd=x.fin_data?(typeof x.fin_data==='string'?JSON.parse(x.fin_data):x.fin_data):null;
                    const ev=fd?.eval_autofin||fd?.pre_eval_autofin;
                    if(!ev)return null;
                    const c=/aprob/i.test(ev)?'#10B981':/rechaz/i.test(ev)?'#EF4444':'#F59E0B';
                    return<div style={{marginTop:6}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:6,fontSize:9,fontWeight:700,color:c,background:c+'15',border:`1px solid ${c}35`,whiteSpace:'nowrap'}}>
                        <span style={{width:5,height:5,borderRadius:'50%',background:c,flexShrink:0}}/>Autofin: {ev}
                      </span>
                    </div>;
                  })()}
                </div>

                {/* Zona Vendedor */}
                <div className="crm-lead-seller" style={{flex:1,minWidth:0,overflow:'hidden',padding:'12px 16px',borderRight:'1px solid #F3F4F6',display:'flex',flexDirection:'column',justifyContent:'flex-start'}}>
                  <div style={{...sectionLbl,marginBottom:7}}>Vendedor</div>
                  {x.seller_fn?(
                    <>
                      <div style={{fontSize:12,fontWeight:600,color:'#1F2937',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.seller_fn} {x.seller_ln}</div>
                      {brName&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:3}}>{brName}</div>}
                    </>
                  ):(
                    <>
                      <div style={{fontSize:11,color:'#D1D5DB'}}>Sin asignar</div>
                      {brName&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:3}}>{brName}</div>}
                    </>
                  )}
                  {!hasRole(user, ROLES.VEND)&&allSellers.length>0&&(
                    <div style={{marginTop:8}} onClick={e=>e.stopPropagation()}>
                      {reassigningId===x.id?(
                        <div style={{display:'flex',flexDirection:'column',gap:4}}>
                          <select value={reassignTo} onChange={e=>setReassignTo(e.target.value)}
                            style={{fontSize:11,borderRadius:6,border:'1px solid #D1D5DB',padding:'4px 6px',background:'#F9FAFB',fontFamily:'inherit',width:'100%'}}>
                            <option value="">Seleccionar...</option>
                            {allSellers.filter(s=>s.id!==x.seller_id).map(s=>(
                              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                            ))}
                          </select>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={e=>handleReassign(e,x.id)} disabled={!reassignTo||reassigningBusy}
                              style={{flex:1,fontSize:10,fontWeight:700,padding:'4px 0',borderRadius:5,border:'none',background:'#3B82F6',color:'#ffffff',cursor:'pointer',fontFamily:'inherit',opacity:!reassignTo||reassigningBusy?0.5:1}}>
                              {reassigningBusy?'…':'Confirmar'}
                            </button>
                            <button onClick={()=>{setReassigningId(null);setReassignTo('');}}
                              style={{fontSize:10,padding:'4px 8px',borderRadius:5,border:'1px solid #E5E7EB',background:'#F9FAFB',cursor:'pointer',fontFamily:'inherit'}}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ):(
                        <button onClick={()=>{setReassigningId(x.id);setReassignTo('');}}
                          style={{fontSize:10,fontWeight:600,color:'#3B82F6',background:'#EFF6FF',border:'none',padding:'3px 9px',borderRadius:5,cursor:'pointer',fontFamily:'inherit'}}>
                          ↗ Traspasar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Zona Fecha */}
                <div className="crm-lead-date" style={{flex:'0 0 108px',padding:'12px 14px',display:'flex',flexDirection:'column',justifyContent:'flex-start'}}>
                  {(()=>{
                    const hasC=!!x.lastContact;
                    const refH=Math.floor((Date.now()-new Date(hasC?x.lastContact:x.createdAt).getTime())/3.6e6);
                    const urgente=refH>=24;
                    const bc=urgente?'#EF4444':'#6B7280';
                    const bb=urgente?'#FEF2F2':'#F3F4F6';
                    const bbd=urgente?'#FECACA':'#E5E7EB';
                    return(<>
                      <div style={{...sectionLbl,marginBottom:7}}>{hasC?'Último contacto':'Sin contacto'}</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#1F2937',lineHeight:1.2}}>{fD(hasC?x.lastContact:x.createdAt)}</div>
                      <div style={{display:'inline-flex',alignItems:'center',marginTop:6}}>
                        <span style={{fontSize:10,fontWeight:700,color:bc,background:bb,padding:'2px 8px',borderRadius:5,border:`1px solid ${bbd}`,whiteSpace:'nowrap'}}>
                          {hasC?ago(x.lastContact):`sin contacto · ${ago(x.createdAt)}`}
                        </span>
                      </div>
                    </>);
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew&&<Modal onClose={()=>setShowNew(false)} title="Nuevo Ticket / Cotización" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Nombre *" value={nw.fn} onChange={v=>setNw({...nw,fn:v})} req/><Field label="Apellido *" value={nw.ln} onChange={v=>setNw({...nw,ln:v})} req/><Field label="RUT" value={nw.rut} onChange={v=>setNw({...nw,rut:v})} ph="12.345.678-9"/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Celular" value={nw.phone} onChange={v=>setNw({...nw,phone:v})} ph="9XXXXXXXX"/><Field label="Email" value={nw.email} onChange={v=>setNw({...nw,email:v})} type="email"/><Field label="Comuna" value={nw.comuna} onChange={v=>setNw({...nw,comuna:v})} opts={["",..."Huechuraba,Providencia,Las Condes,La Florida,Maipú,Santiago Centro,Ñuñoa,Puente Alto,Otra".split(",")].map(c=>({v:c,l:c||"Seleccionar..."}))}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Origen" value={nw.source} onChange={v=>setNw({...nw,source:v})} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.filter(b=>b.code!=='MPSY'&&b.code!=='MOV').map(b=>({v:b.id,l:b.name}))]}/><Field label="Prioridad" value={nw.priority} onChange={v=>setNw({...nw,priority:v})} opts={Object.entries(PRIORITY).map(([k,v])=>({v:k,l:v.l}))}/></div><div style={{display:"grid",gridTemplateColumns:!hasRole(user, ROLES.VEND)&&allSellers.length>0?"1fr 1fr":"1fr",gap:10,marginBottom:16}}><Field label="Moto de interés" value={nw.motoId} onChange={v=>setNw({...nw,motoId:v})} opts={[{v:"",l:"Seleccionar modelo..."},...catalogModels.map(m=>({v:m.id,l:`${m.brand} ${m.model}${m.price?` - ${fmt(m.price)}`:''}`}))]}/>{!hasRole(user, ROLES.VEND)&&allSellers.length>0&&<Field label="Asignar vendedor" value={nw.seller_id} onChange={v=>setNw({...nw,seller_id:v})} opts={[{v:"",l:"Auto-asignar"},...allSellers.map(s=>({v:s.id,l:`${s.first_name} ${s.last_name}`}))]}/>}</div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>setShowNew(false)} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Creando...":"Crear Ticket"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════
