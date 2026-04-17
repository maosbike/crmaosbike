import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, STATUS_ORDER, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ROLES, hasRole, useIsMobile, ViewHeader, selectCtrl, filterLabel, Empty, ErrorMsg } from '../ui.jsx';

// ── Helpers y constantes visuales (mismo lenguaje que InventoryView) ─────────
const SRC_SHORT={web:"Web",redes_sociales:"RRSS",whatsapp:"WA",presencial:"Pres.",referido:"Ref.",evento:"Ev.",llamada:"Tel."};

// Color + bg por estado ahora viven en TICKET_STATUS (fuente única).
// Helper thin para mantener el shape legado {color, light} que usaba ST_STRIP.
const stripFor = (k) => {
  const v = TICKET_STATUS[k];
  return v ? { color: v.c, light: v.bg || '#F9FAFB' } : { color: '#6B7280', light: '#F9FAFB' };
};

// selectCtrl y filterLabel importados desde ui.jsx (centralizados)
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
  const[reassignErr,setReassignErr]=useState('');
  const[addErr,setAddErr]=useState('');
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
      setReassignErr(ex.message||'Error al reasignar');
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
    e.preventDefault();setAdding(true);setAddErr('');
    try{
      const body={first_name:nw.fn,last_name:nw.ln,phone:nw.phone,email:nw.email,rut:nw.rut,comuna:nw.comuna,source:nw.source,branch_id:nw.branch_id||null,priority:nw.priority,model_id:nw.motoId||null,wants_financing:false,...(nw.seller_id?{assigned_to:nw.seller_id}:{})};
      const created=await api.createTicket(body);
      addLead(mapTicket(created));
      setShowNew(false);
      setTimeout(()=>onRefresh?.(),1000);
    }catch(ex){setAddErr(ex.message||"No se pudo crear la ficha. Revisa los datos e intenta de nuevo.");}
    finally{setAdding(false);}
  };

  return(
    <div>
      {/* ── Header ── */}
      <ViewHeader
        preheader="Comercial · Leads"
        title="Leads"
        count={f.length}
        itemLabel="ficha"
        filtered={hasFilters}
        actions={
          <button onClick={()=>setShowNew(true)} style={{...S.btn,display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700,padding:'8px 16px'}}>
            <Ic.plus size={14}/>Nueva ficha
          </button>
        }
      />
      {reassignErr && <ErrorMsg msg={reassignErr} />}

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
              <div style={{width:32,height:32,borderRadius:8,background:'rgba(239,68,68,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Ic.alert size={18} color="#DC2626"/>
              </div>
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
              <div style={{width:32,height:32,borderRadius:8,background:'rgba(245,158,11,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Ic.user size={18} color="#B45309"/>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:22,fontWeight:900,color:'#B45309',lineHeight:1}}>{orpCount}</div>
                <div style={{fontSize:11,fontWeight:700,color:'#92400E',marginTop:2}}>Sin asignar · sin vendedor</div>
              </div>
              {orpF&&<span style={{marginLeft:12,fontSize:10,fontWeight:700,color:'#F59E0B',background:'#FEF3C7',padding:'3px 8px',borderRadius:6}}>FILTRADO</span>}
            </button>
          </div>
        );
      })()}

      {/* ── KPI tabs por estado ── */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14,paddingBottom:2,overflowX:'auto',scrollbarWidth:'none'}}>
        {Object.entries(TICKET_STATUS).filter(([k])=>hasRole(user,ROLES.VEND)?!['ganado','perdido'].includes(k):true).map(([k,v])=>{
          const cnt=effectiveLeads.filter(l=>l.status===k&&(!hasRole(user, ROLES.VEND)||l.seller_id===user.id)).length;
          const active=stF===k;
          return(
            <button key={k} onClick={()=>setStF(stF===k?'':k)} style={{
              padding:'5px 12px',borderRadius:99,
              border:active?`1.5px solid ${v.c}`:'1.5px solid transparent',
              background:active?v.bg:'#F3F4F6',
              color:active?v.c:'#6B7280',
              fontSize:12,fontWeight:active?700:500,
              cursor:'pointer',flexShrink:0,
              display:'inline-flex',alignItems:'center',gap:5,
              fontFamily:'inherit',transition:'all 0.12s',
            }}>
              {v.l}
              <span style={{
                fontSize:10,fontWeight:700,
                background:active?'rgba(255,255,255,0.5)':'#E5E7EB',
                color:active?v.c:'#9CA3AF',
                padding:'1px 5px',borderRadius:99,
              }}>
                {cnt}
              </span>
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

      {/* ── Barra de filtros compacta ── */}
      <div style={{background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:10,padding:'8px 12px',marginBottom:14,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:'1 1 180px',minWidth:150}}>
          <Ic.search size={13} color="#9CA3AF" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar ficha..." style={{...S.inp,paddingLeft:30,height:32,fontSize:12,borderRadius:7,background:'#FFFFFF'}}/>
        </div>
        <select value={prF} onChange={e=>setPrF(e.target.value)} style={{...selectCtrl,height:32}}>
          <option value="">Prioridad</option>
          {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
        </select>
        <select value={srcF} onChange={e=>setSrcF(e.target.value)} style={{...selectCtrl,height:32}}>
          <option value="">Origen</option>
          {Object.entries(SRC).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        {brs.length>0&&(
          <select value={brF} onChange={e=>setBrF(e.target.value)} style={{...selectCtrl,height:32}}>
            <option value="">Sucursal</option>
            {brs.filter(b=>b.code!=='MOV').map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {sellers.length>0&&(
          <select value={selF} onChange={e=>setSelF(e.target.value)} style={{...selectCtrl,height:32}}>
            <option value="">Vendedor</option>
            {sellers.map(s=><option key={s.id} value={s.id}>{s.fn} {s.ln}</option>)}
          </select>
        )}
        {hasFilters&&(
          <button onClick={clearFilters} style={{height:32,padding:'0 11px',borderRadius:7,border:'1px solid #E5E7EB',background:'#FFFFFF',fontSize:11,cursor:'pointer',color:'#6B7280',display:'flex',alignItems:'center',gap:5,fontWeight:500,fontFamily:'inherit',flexShrink:0}}>
            <Ic.x size={10}/>{f.length} resultado{f.length!==1?'s':''}
          </button>
        )}
      </div>


      {/* ── Lista de registros ── */}
      {f.length>0&&!stF&&<div style={{fontSize:10,fontWeight:600,color:'#9CA3AF',paddingLeft:2,marginBottom:6,letterSpacing:'0.04em'}}>Ordenado por estado</div>}
      {f.length===0?(
        <Empty
          title={hasFilters ? 'Ningún lead coincide con estos filtros' : 'Sin fichas todavía'}
          hint={!hasFilters ? 'Crea la primera con el botón «Nueva ficha».' : undefined}
          action={hasFilters ? <button onClick={clearFilters} style={{background:'none',border:'none',color:'#F28100',fontSize:12,cursor:'pointer',textDecoration:'underline',padding:0,fontFamily:'inherit'}}>Limpiar filtros</button> : undefined}
        />
      ):(
        <>
          {/* Header columnas — solo desktop */}
          {!isMobile&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 150px 130px 90px 90px',padding:'6px 16px 6px 19px',background:'#F9FAFB',borderBottom:'1px solid #E5E7EB',borderTop:'1px solid #E5E7EB',borderRadius:'10px 10px 0 0',border:'1px solid #E5E7EB'}}>
              {['Lead / Modelo','Estado','Vendedor','Origen','Fecha'].map(col=>(
                <div key={col} style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'}}>{col}</div>
              ))}
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:isMobile?8:0,background:isMobile?'transparent':'#FFFFFF',border:isMobile?'none':'1px solid #E5E7EB',borderTop:'none',borderRadius:isMobile?0:'0 0 10px 10px',overflow:isMobile?'visible':'hidden'}}>
            {(stF?f:[...f].sort((a,b)=>{const ai=STATUS_ORDER.indexOf(a.status);const bi=STATUS_ORDER.indexOf(b.status);return(ai===-1?99:ai)-(bi===-1?99:bi);})).map(x=>{
              const stStrip=stripFor(x.status);
              const stCfg=TICKET_STATUS[x.status]||{l:x.status,c:'#6B7280',bg:'#F9FAFB'};
              const prCfg=PRIORITY[x.priority]||{l:'—',c:'#9CA3AF'};
              const brName=brs.find(b=>String(b.id)===String(x.branch_id))?.name||x.branch_code||null;

              // ── Variante MOBILE ──────────────────────────────────────────
              if (isMobile) {
                return (
                  <div key={x.id} onClick={()=>nav("ticket",x.id)}
                    style={{background:'#FFFFFF',borderRadius:12,border:'1px solid #E5E7EB',padding:'10px 12px',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column',gap:6,cursor:'pointer',position:'relative',borderLeft:`3px solid ${stCfg.c}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:4}}>
                      <div style={{flex:1,minWidth:0,fontSize:14,fontWeight:700,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {x.fn} {x.ln}
                      </div>
                      {x.needs_attention&&<span title="Necesita atención" style={{fontSize:10,fontWeight:800,color:'#ffffff',background:'#DC2626',padding:'2px 6px',borderRadius:6}}>!</span>}
                      <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontWeight:700,color:prCfg.c}}>
                        <span style={{width:6,height:6,borderRadius:'50%',background:prCfg.c}}/>{prCfg.l}
                      </span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:4}}>
                      <div style={{flex:1,minWidth:0,fontSize:12,color:'#4B5563',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {x.model_brand?`${x.model_brand} ${x.model_name||''}`:<span style={{color:'#D1D5DB',fontStyle:'italic'}}>Sin moto</span>}
                        {x.comuna?` · ${x.comuna}`:''}
                      </div>
                      <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:99,background:stCfg.bg,color:stCfg.c,flexShrink:0}}>{stCfg.l}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:4,fontSize:11,color:'#6B7280'}}>
                      <span style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {x.seller_fn?`${x.seller_fn} ${x.seller_ln||''}`:'Sin asignar'}{brName?` · ${brName}`:''}
                      </span>
                      {x.num&&<span style={{fontSize:10,color:'#9CA3AF'}}>#{x.num}</span>}
                      {(()=>{
                        const hasC=!!x.lastContact;
                        const refH=Math.floor((Date.now()-new Date(hasC?x.lastContact:x.createdAt).getTime())/3.6e6);
                        const urgente=refH>=24;
                        return<span style={{fontSize:10,color:urgente?'#EF4444':'#9CA3AF',fontWeight:urgente?700:400}}>
                          {hasC?ago(x.lastContact):`sin contacto · ${ago(x.createdAt)}`}
                        </span>;
                      })()}
                    </div>
                    {x.followup_next_step&&(()=>{
                      const venc=x.next_followup_at&&new Date(x.next_followup_at)<new Date();
                      const txt=x.followup_next_step.length>40?x.followup_next_step.slice(0,40)+'…':x.followup_next_step;
                      return<div style={{paddingLeft:4,fontSize:10,color:venc?'#EF4444':'#6B7280',fontStyle:'italic',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Próximo: {txt}</div>;
                    })()}
                  </div>
                );
              }

              // ── Variante DESKTOP: grid 5 columnas ───────────────────────
              const hasC=!!x.lastContact;
              const refH=Math.floor((Date.now()-new Date(hasC?x.lastContact:x.createdAt).getTime())/3.6e6);
              const urgente=refH>=24;
              return(
                <div key={x.id}
                  onClick={()=>nav("ticket",x.id)}
                  onMouseEnter={e=>{e.currentTarget.style.background='#FAFAFA';e.currentTarget.querySelector('.crm-row-accent').style.opacity='1';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#FFFFFF';e.currentTarget.querySelector('.crm-row-accent').style.opacity='0';}}
                  className="crm-lead-row"
                  style={{display:'grid',gridTemplateColumns:'1fr 150px 130px 90px 90px',alignItems:'center',padding:'11px 16px',background:'#FFFFFF',borderBottom:'1px solid #F3F4F6',cursor:'pointer',transition:'background 0.1s',position:'relative',minWidth:0}}
                >
                  {/* Acento izquierdo (aparece en hover) */}
                  <div className="crm-row-accent" style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:stCfg.c,opacity:0,transition:'opacity 0.1s'}}/>

                  {/* Col 1: Cliente + modelo */}
                  <div style={{minWidth:0,paddingLeft:6}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                      <span style={{fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.fn} {x.ln}</span>
                      {x.needs_attention&&<span title="Necesita atención · 48h sin gestión" style={{fontSize:9,fontWeight:800,color:'#fff',background:'#DC2626',padding:'1px 5px',borderRadius:4,flexShrink:0}}>!</span>}
                      {x.num&&<span style={{fontSize:10,color:'#9CA3AF',flexShrink:0}}>#{x.num}</span>}
                    </div>
                    {x.model_brand?(
                      <div style={{fontSize:11,color:'#6B7280',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {x.model_brand} {x.model_name||''}
                        {x.model_year?` · ${x.model_year}`:''}
                        {x.model_price>0?` · ${fmt(x.model_price)}`:''}
                      </div>
                    ):(
                      <div style={{fontSize:11,color:'#D1D5DB',fontStyle:'italic'}}>Sin moto</div>
                    )}
                    {x.followup_next_step&&(()=>{
                      const venc=x.next_followup_at&&new Date(x.next_followup_at)<new Date();
                      const txt=x.followup_next_step.length>42?x.followup_next_step.slice(0,42)+'…':x.followup_next_step;
                      return<div style={{fontSize:10,color:venc?'#EF4444':'#15803D',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Próximo: {txt}</div>;
                    })()}
                  </div>

                  {/* Col 2: Estado + prioridad */}
                  <div style={{display:'flex',flexDirection:'column',gap:5}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:99,background:stCfg.bg,color:stCfg.c,alignSelf:'flex-start',whiteSpace:'nowrap'}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:stCfg.c,flexShrink:0}}/>
                      {stCfg.l}
                    </span>
                    <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,color:prCfg.c,alignSelf:'flex-start'}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:prCfg.c}}/>{prCfg.l}
                    </span>
                  </div>

                  {/* Col 3: Vendedor + traspaso */}
                  <div style={{minWidth:0,overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
                    {x.seller_fn?(
                      <div style={{fontSize:12,fontWeight:600,color:'#1F2937',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.seller_fn} {x.seller_ln}</div>
                    ):(
                      <div style={{fontSize:11,color:'#D1D5DB'}}>Sin asignar</div>
                    )}
                    {brName&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:1}}>{brName}</div>}
                    {!hasRole(user,ROLES.VEND)&&allSellers.length>0&&(
                      <div style={{marginTop:6}}>
                        {reassigningId===x.id?(
                          <div style={{display:'flex',flexDirection:'column',gap:4}} onClick={e=>e.stopPropagation()}>
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
                                {reassigningBusy?'…':'Reasignar'}
                              </button>
                              <button onClick={()=>{setReassigningId(null);setReassignTo('');}}
                                style={{fontSize:10,padding:'4px 8px',borderRadius:5,border:'1px solid #E5E7EB',background:'#F9FAFB',cursor:'pointer',fontFamily:'inherit'}}>
                                ✕
                              </button>
                            </div>
                          </div>
                        ):(
                          <button onClick={e=>{e.stopPropagation();setReassigningId(x.id);setReassignTo('');}}
                            style={{fontSize:10,fontWeight:600,color:'#3B82F6',background:'#EFF6FF',border:'none',padding:'3px 9px',borderRadius:5,cursor:'pointer',fontFamily:'inherit'}}>
                            ↗ Traspasar
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Col 4: Fuente */}
                  <div style={{fontSize:11,color:'#6B7280'}}>
                    {SRC_SHORT[x.source]||x.source||'—'}
                  </div>

                  {/* Col 5: Fecha + badge urgencia */}
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'#374151',fontWeight:500}}>{fD(hasC?x.lastContact:x.createdAt)}</div>
                    <div style={{marginTop:3}}>
                      <span style={{fontSize:10,fontWeight:700,color:urgente?'#EF4444':'#9CA3AF'}}>
                        {hasC?ago(x.lastContact):`${ago(x.createdAt)}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showNew&&<Modal onClose={()=>setShowNew(false)} title="Nueva ficha" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Nombre *" value={nw.fn} onChange={v=>setNw({...nw,fn:v})} req/><Field label="Apellido *" value={nw.ln} onChange={v=>setNw({...nw,ln:v})} req/><Field label="RUT" value={nw.rut} onChange={v=>setNw({...nw,rut:v})} ph="12.345.678-9"/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Celular" value={nw.phone} onChange={v=>setNw({...nw,phone:v})} ph="9XXXXXXXX"/><Field label="Email" value={nw.email} onChange={v=>setNw({...nw,email:v})} type="email"/><Field label="Comuna" value={nw.comuna} onChange={v=>setNw({...nw,comuna:v})} opts={[{v:"",l:"Seleccionar..."},...COMUNAS.map(c=>({v:c,l:c}))]}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Origen" value={nw.source} onChange={v=>setNw({...nw,source:v})} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.filter(b=>b.code!=='MPSY'&&b.code!=='MOV').map(b=>({v:b.id,l:b.name}))]}/><Field label="Prioridad" value={nw.priority} onChange={v=>setNw({...nw,priority:v})} opts={Object.entries(PRIORITY).map(([k,v])=>({v:k,l:v.l}))}/></div><div style={{display:"grid",gridTemplateColumns:!hasRole(user, ROLES.VEND)&&allSellers.length>0?"1fr 1fr":"1fr",gap:10,marginBottom:16}}><Field label="Moto de interés" value={nw.motoId} onChange={v=>setNw({...nw,motoId:v})} opts={[{v:"",l:"Seleccionar modelo..."},...catalogModels.map(m=>({v:m.id,l:`${m.brand} ${m.model}${m.price?` - ${fmt(m.price)}`:''}`}))]}/>{!hasRole(user, ROLES.VEND)&&allSellers.length>0&&<Field label="Asignar vendedor" value={nw.seller_id} onChange={v=>setNw({...nw,seller_id:v})} opts={[{v:"",l:"Auto-asignar"},...allSellers.map(s=>({v:s.id,l:`${s.first_name} ${s.last_name}`}))]}/>}</div><ErrorMsg msg={addErr} /><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>{setShowNew(false);setAddErr('');}} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Creando...":"Crear ficha"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════
