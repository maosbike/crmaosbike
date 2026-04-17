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
        <div style={{...S.card,padding:0,overflow:'hidden',marginTop:0}}>
          {/* Header columnas — solo desktop */}
          {!isMobile&&(
            <div style={{
              display:'flex',
              padding:'6px 16px 6px 108px',
              background:'#F9FAFB',
              borderBottom:'1px solid #E5E7EB',
            }}>
              <div style={{flex:1,fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em'}}>
                Lead · Modelo
              </div>
              <div style={{width:130,fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em',textAlign:'right',paddingRight:16}}>
                Estado · Fecha
              </div>
            </div>
          )}

          {/* Filas de leads */}
          {(stF?f:[...f].sort((a,b)=>{const ai=STATUS_ORDER.indexOf(a.status);const bi=STATUS_ORDER.indexOf(b.status);return(ai===-1?99:ai)-(bi===-1?99:bi);})).map(x=>{
            const stCfg=TICKET_STATUS[x.status]||{l:x.status,c:'#6B7280',bg:'#F9FAFB'};
            const brName=brs.find(b=>String(b.id)===String(x.branch_id))?.name||x.branch_name||x.branch_code||null;

            // ── Variante MOBILE ──────────────────────────────────────────
            if (isMobile) {
              return (
                <div
                  key={x.id}
                  onClick={()=>nav('ticket',x.id)}
                  style={{
                    display:'flex',alignItems:'stretch',
                    background:'#FFFFFF',
                    borderBottom:'1px solid #F3F4F6',
                    cursor:'pointer',minHeight:72,
                    borderLeft:`4px solid ${stCfg.c}`,
                  }}
                >
                  {/* Foto compacta */}
                  <div style={{
                    width:64,flexShrink:0,
                    background:'#F3F4F6',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    overflow:'hidden',
                  }}>
                    {x.model_image ? (
                      <img src={x.model_image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    ) : (
                      <Ic.bike size={22} color="#D1D5DB"/>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{flex:1,padding:'10px 12px',minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1,minWidth:0}}>
                        {x.fn} {x.ln}
                      </div>
                      {x.needs_attention&&<span title="Necesita atención" style={{fontSize:9,fontWeight:800,color:'#fff',background:'#DC2626',padding:'1px 5px',borderRadius:4,flexShrink:0}}>!</span>}
                    </div>
                    <div style={{fontSize:11,color:'#4B5563',marginBottom:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {(x.model_brand||x.model_name)?[x.model_brand,x.model_name].filter(Boolean).join(' '):'Sin modelo'}
                    </div>
                    <span style={{
                      fontSize:10,fontWeight:600,
                      padding:'2px 7px',borderRadius:99,
                      background:stCfg.bg,color:stCfg.c,
                    }}>
                      {stCfg.l}
                    </span>
                  </div>

                  {/* Fecha (móvil) */}
                  <div style={{padding:'10px 12px',display:'flex',alignItems:'center',flexShrink:0}}>
                    <span style={{fontSize:10,color:'#C4C9D4'}}>{fD(x.createdAt)}</span>
                  </div>
                </div>
              );
            }

            // ── Variante DESKTOP: tarjeta horizontal ─────────────────────
            return (
              <div
                key={x.id}
                onClick={()=>nav('ticket',x.id)}
                style={{
                  display:'flex',alignItems:'stretch',
                  background:'#FFFFFF',
                  borderBottom:'1px solid #F3F4F6',
                  cursor:'pointer',
                  transition:'background 0.1s',
                  minHeight:80,
                }}
                onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                onMouseLeave={e=>e.currentTarget.style.background='#FFFFFF'}
              >
                {/* Franja de color de estado (4px) */}
                <div style={{
                  width:4,flexShrink:0,
                  background:stCfg.c,
                }}/>

                {/* Foto del modelo */}
                <div style={{
                  width:88,flexShrink:0,
                  background:x.model_image?'#F3F4F6':stCfg.bg||'#F9FAFB',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  overflow:'hidden',
                  borderRight:'1px solid #F3F4F6',
                }}>
                  {x.model_image ? (
                    <img
                      src={x.model_image}
                      alt={x.model_name||'Moto'}
                      style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}
                    />
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                      <Ic.bike size={24} color={stCfg.c||'#D1D5DB'}/>
                    </div>
                  )}
                </div>

                {/* Contenido principal */}
                <div style={{flex:1,padding:'12px 16px',display:'flex',flexDirection:'column',justifyContent:'center',gap:4,minWidth:0}}>
                  {/* Nombre del lead */}
                  <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                    <div style={{
                      fontSize:14,fontWeight:700,color:'#111827',
                      whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                      minWidth:0,flex:1,
                    }}>
                      {x.fn} {x.ln}
                    </div>
                    {x.needs_attention&&<span title="Necesita atención · 48h sin gestión" style={{fontSize:9,fontWeight:800,color:'#fff',background:'#DC2626',padding:'1px 5px',borderRadius:4,flexShrink:0}}>!</span>}
                    {x.num&&<span style={{fontSize:10,color:'#9CA3AF',flexShrink:0}}>#{x.num}</span>}
                  </div>

                  {/* Modelo + año */}
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                    {(x.model_brand||x.model_name) ? (
                      <span style={{fontSize:12,color:'#4B5563',fontWeight:500}}>
                        {[x.model_brand,x.model_name].filter(Boolean).join(' ')}
                      </span>
                    ) : (
                      <span style={{fontSize:12,color:'#D1D5DB'}}>Sin modelo asignado</span>
                    )}
                    {x.model_year&&(
                      <span style={{
                        fontSize:10,fontWeight:700,
                        color:'#4F46E5',background:'#EEF2FF',
                        padding:'1px 6px',borderRadius:99,
                      }}>
                        {x.model_year}
                      </span>
                    )}
                  </div>

                  {/* Vendedor · sucursal · origen */}
                  <div style={{fontSize:11,color:'#9CA3AF',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                    {x.seller_fn&&(
                      <span>{x.seller_fn} {x.seller_ln||''}</span>
                    )}
                    {brName&&<span>· {brName}</span>}
                    {x.source&&<span>· {SRC_SHORT[x.source]||x.source}</span>}
                    {x.followup_next_step&&(()=>{
                      const venc=x.next_followup_at&&new Date(x.next_followup_at)<new Date();
                      const txt=x.followup_next_step.length>38?x.followup_next_step.slice(0,38)+'…':x.followup_next_step;
                      return<span style={{color:venc?'#EF4444':'#15803D',fontStyle:'italic'}}>· Próximo: {txt}</span>;
                    })()}
                  </div>
                </div>

                {/* Zona derecha: estado + fecha + precio */}
                <div style={{
                  display:'flex',flexDirection:'column',alignItems:'flex-end',
                  justifyContent:'center',gap:6,
                  padding:'12px 16px',flexShrink:0,minWidth:130,
                }}>
                  <span style={{
                    fontSize:11,fontWeight:600,
                    padding:'3px 9px',borderRadius:99,
                    background:stCfg.bg,
                    color:stCfg.c,
                    whiteSpace:'nowrap',
                  }}>
                    {stCfg.l}
                  </span>
                  <span style={{fontSize:10,color:'#C4C9D4'}}>
                    {fD(x.createdAt)}
                  </span>
                  {x.model_price>0&&(
                    <span style={{fontSize:11,fontWeight:600,color:'#9CA3AF'}}>
                      ${Number(x.model_price).toLocaleString('es-CL')}
                    </span>
                  )}
                </div>

                {/* Zona de reasignación (solo admin) */}
                {!hasRole(user,ROLES.VEND)&&allSellers.length>0&&(
                  <div style={{
                    display:'flex',alignItems:'center',
                    padding:'0 12px',flexShrink:0,
                    borderLeft:'1px solid #F3F4F6',
                  }} onClick={e=>e.stopPropagation()}>
                    {reassigningId===x.id ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}} onClick={e=>e.stopPropagation()}>
                        <select
                          value={reassignTo}
                          onChange={e=>setReassignTo(e.target.value)}
                          style={{...selectCtrl,height:30,fontSize:11}}
                        >
                          <option value="">Vendedor...</option>
                          {allSellers.filter(s=>s.id!==x.seller_id).map(s=>(
                            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                          ))}
                        </select>
                        <button
                          onClick={e=>handleReassign(e,x.id)}
                          disabled={!reassignTo||reassigningBusy}
                          style={{...S.btn,fontSize:11,padding:'5px 10px',opacity:!reassignTo||reassigningBusy?0.5:1}}
                        >
                          Reasignar
                        </button>
                        <button
                          onClick={e=>{e.stopPropagation();setReassigningId(null);setReassignTo('');}}
                          style={{...S.gh,padding:'5px 8px',fontSize:11}}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={e=>{e.stopPropagation();setReassigningId(x.id);setReassignTo('');}}
                        style={{fontSize:10,fontWeight:600,color:'#3B82F6',background:'#EFF6FF',border:'none',padding:'3px 9px',borderRadius:5,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}
                      >
                        ↗ Traspasar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNew&&<Modal onClose={()=>setShowNew(false)} title="Nueva ficha" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Nombre *" value={nw.fn} onChange={v=>setNw({...nw,fn:v})} req/><Field label="Apellido *" value={nw.ln} onChange={v=>setNw({...nw,ln:v})} req/><Field label="RUT" value={nw.rut} onChange={v=>setNw({...nw,rut:v})} ph="12.345.678-9"/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Celular" value={nw.phone} onChange={v=>setNw({...nw,phone:v})} ph="9XXXXXXXX"/><Field label="Email" value={nw.email} onChange={v=>setNw({...nw,email:v})} type="email"/><Field label="Comuna" value={nw.comuna} onChange={v=>setNw({...nw,comuna:v})} opts={[{v:"",l:"Seleccionar..."},...COMUNAS.map(c=>({v:c,l:c}))]}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Origen" value={nw.source} onChange={v=>setNw({...nw,source:v})} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.filter(b=>b.code!=='MPSY'&&b.code!=='MOV').map(b=>({v:b.id,l:b.name}))]}/><Field label="Prioridad" value={nw.priority} onChange={v=>setNw({...nw,priority:v})} opts={Object.entries(PRIORITY).map(([k,v])=>({v:k,l:v.l}))}/></div><div style={{display:"grid",gridTemplateColumns:!hasRole(user, ROLES.VEND)&&allSellers.length>0?"1fr 1fr":"1fr",gap:10,marginBottom:16}}><Field label="Moto de interés" value={nw.motoId} onChange={v=>setNw({...nw,motoId:v})} opts={[{v:"",l:"Seleccionar modelo..."},...catalogModels.map(m=>({v:m.id,l:`${m.brand} ${m.model}${m.price?` - ${fmt(m.price)}`:''}`}))]}/>{!hasRole(user, ROLES.VEND)&&allSellers.length>0&&<Field label="Asignar vendedor" value={nw.seller_id} onChange={v=>setNw({...nw,seller_id:v})} opts={[{v:"",l:"Auto-asignar"},...allSellers.map(s=>({v:s.id,l:`${s.first_name} ${s.last_name}`}))]}/>}</div><ErrorMsg msg={addErr} /><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>{setShowNew(false);setAddErr('');}} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Creando...":"Crear ficha"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════
