import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, STATUS_ORDER, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ROLES, hasRole, useIsMobile, ViewHeader, selectCtrl, filterLabel, Empty, ErrorMsg, colorFor } from '../ui.jsx';

// ── Helpers y constantes visuales (mismo lenguaje que InventoryView) ─────────

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
        {(() => {
          const totalCnt = effectiveLeads.filter(l=>!hasRole(user, ROLES.VEND)||l.seller_id===user.id).length;
          const active = !stF;
          return (
            <button onClick={()=>setStF('')} style={{
              padding:'5px 12px',borderRadius:99,
              border:active?'1.5px solid #111827':'1.5px solid transparent',
              background:active?'#111827':'#F3F4F6',
              color:active?'#FFFFFF':'#6B7280',
              fontSize:12,fontWeight:active?700:500,
              cursor:'pointer',flexShrink:0,
              display:'inline-flex',alignItems:'center',gap:5,
              fontFamily:'inherit',transition:'all 0.12s',
            }}>
              Todos
              <span style={{
                fontSize:10,fontWeight:700,
                background:active?'rgba(255,255,255,0.2)':'#E5E7EB',
                color:active?'#FFFFFF':'#9CA3AF',
                padding:'1px 5px',borderRadius:99,
              }}>
                {totalCnt}
              </span>
            </button>
          );
        })()}
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
            const col=colorFor(s.id);
            return(
              <button key={s.id} onClick={()=>setSelF(isSel?'':s.id)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,
                  border:isSel?`2px solid ${col.c}`:'1px solid #E5E7EB',
                  background:isSel?col.bg:'#FFFFFF',
                  borderLeft:`4px solid ${col.c}`,
                  cursor:'pointer',fontFamily:'inherit',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',transition:'all 0.12s'}}>
                <span style={{fontSize:22,fontWeight:900,color:col.c,lineHeight:1}}>{active}</span>
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:11,fontWeight:700,color:isSel?col.c:'#374151'}}>{s.first_name} {s.last_name}</div>
                  <div style={{fontSize:9,color:'#9CA3AF',marginTop:1}}>leads activos</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Bloque de filtros ── */}
      <div style={{
        background:'#FFFFFF',
        border:'1px solid #E5E7EB',
        borderRadius:12,
        padding:'12px 16px',
        marginBottom:16,
        display:'flex',flexDirection:'column',gap:10,
      }}>
        {/* Fila 1: Búsqueda */}
        <div style={{position:'relative',width:'100%'}}>
          <Ic.search size={14} color="#9CA3AF" style={{
            position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',
          }}/>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar por nombre, RUT, teléfono o N° ficha..."
            style={{...S.inp,paddingLeft:36,fontSize:13,border:'1px solid #E5E7EB',borderRadius:8}}
          />
        </div>
        {/* Fila 2: selects en línea */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <select value={prF} onChange={e=>setPrF(e.target.value)} style={{...selectCtrl,height:34,flex:'1 1 120px',minWidth:110}}>
            <option value="">Prioridad</option>
            {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
          </select>
          <select value={srcF} onChange={e=>setSrcF(e.target.value)} style={{...selectCtrl,height:34,flex:'1 1 120px',minWidth:110}}>
            <option value="">Origen</option>
            {Object.entries(SRC).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          {brs.length>0&&(
            <select value={brF} onChange={e=>setBrF(e.target.value)} style={{...selectCtrl,height:34,flex:'1 1 130px',minWidth:110}}>
              <option value="">Sucursal</option>
              {brs.filter(b=>b.code!=='MOV').map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {sellers.length>0&&(
            <select value={selF} onChange={e=>setSelF(e.target.value)} style={{...selectCtrl,height:34,flex:'1 1 140px',minWidth:120}}>
              <option value="">Vendedor</option>
              {sellers.map(s=><option key={s.id} value={s.id}>{s.fn} {s.ln}</option>)}
            </select>
          )}
          {hasFilters&&(
            <button onClick={clearFilters} style={{
              ...S.gh,height:34,fontSize:12,fontWeight:600,
              border:'1px solid #E5E7EB',borderRadius:8,padding:'0 14px',flexShrink:0,
            }}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>


      {/* ── Lista de registros ── */}
      {f.length>0&&!stF&&<div style={{fontSize:10,fontWeight:600,color:'#9CA3AF',paddingLeft:2,marginBottom:6,letterSpacing:'0.04em'}}>Ordenado por estado</div>}
      {f.length===0?(
        <Empty
          title={hasFilters ? 'Ningún lead coincide con estos filtros' : 'Sin fichas todavía'}
          hint={!hasFilters ? 'Crea la primera con el botón «Nueva ficha».' : undefined}
          action={hasFilters ? <button onClick={clearFilters} style={{background:'none',border:'none',color:'var(--brand)',fontSize:12,cursor:'pointer',textDecoration:'underline',padding:0,fontFamily:'inherit'}}>Limpiar filtros</button> : undefined}
        />
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {/* Filas de leads — cada una es una card independiente */}
          {(stF?f:[...f].sort((a,b)=>{const ai=STATUS_ORDER.indexOf(a.status);const bi=STATUS_ORDER.indexOf(b.status);return(ai===-1?99:ai)-(bi===-1?99:bi);})).map(x=>{
            const stCfg=TICKET_STATUS[x.status]||{l:x.status,c:'#6B7280',bg:'#F9FAFB'};
            const brName=brs.find(b=>String(b.id)===String(x.branch_id))?.name||x.branch_name||x.branch_code||null;

            // ── Variante MOBILE ──────────────────────────────────────────
            if (isMobile) {
              return (
                <div key={x.id} onClick={()=>nav('ticket',x.id)} style={{
                  display:'flex',alignItems:'stretch',
                  background:'#FFFFFF',
                  border:'1px solid #E5E7EB',borderRadius:14,
                  overflow:'hidden',
                  cursor:'pointer',minHeight:130,
                  boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  {/* Foto protagonista */}
                  <div style={{
                    width:130,flexShrink:0,
                    background:`linear-gradient(135deg, ${stCfg.bg||'#F9FAFB'} 0%, #F3F4F6 100%)`,
                    overflow:'hidden',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    position:'relative',
                  }}>
                    {x.model_image
                      ? <img src={x.model_image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      : <Ic.bike size={40} color={stCfg.c||'#D1D5DB'}/>
                    }
                    {x.needs_attention&&(
                      <span title="Necesita atención" style={{
                        position:'absolute',top:6,left:6,
                        fontSize:9,fontWeight:800,color:'#fff',
                        background:'#DC2626',padding:'2px 6px',borderRadius:5,
                      }}>!</span>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{flex:1,padding:'10px 12px',minWidth:0,display:'flex',flexDirection:'column',justifyContent:'space-between',gap:4}}>
                    <div style={{display:'flex',flexDirection:'column',gap:3,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:'#111827',
                        whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',minWidth:0}}>
                        {x.fn} {x.ln}
                      </div>
                      <div style={{fontSize:12,color:'#4B5563',fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {(x.model_brand||x.model_name)?[x.model_brand,x.model_name].filter(Boolean).join(' '):'Sin modelo'}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
                      <span style={{
                        fontSize:10,fontWeight:700,
                        padding:'2px 8px',borderRadius:99,
                        background:stCfg.bg,color:stCfg.c,whiteSpace:'nowrap',
                      }}>
                        {stCfg.l}
                      </span>
                      <span style={{fontSize:10,color:'#C4C9D4',whiteSpace:'nowrap'}}>{fD(x.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            }

            // ── Variante DESKTOP ─────────────────────────────────────────
            return (
              <div key={x.id} onClick={()=>nav('ticket',x.id)} style={{
                display:'flex',alignItems:'stretch',
                background:'#FFFFFF',
                border:'1px solid #E5E7EB',borderRadius:14,
                overflow:'hidden',
                cursor:'pointer',
                minHeight:148,
                boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
                transition:'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.08)';e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.borderColor='#D1D5DB';}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.borderColor='#E5E7EB';}}
              >
                {/* FOTO — protagonista, 220px */}
                <div style={{
                  width:220,flexShrink:0,
                  background:`linear-gradient(135deg, ${stCfg.bg||'#F9FAFB'} 0%, #F3F4F6 100%)`,
                  overflow:'hidden',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  position:'relative',
                }}>
                  {x.model_image ? (
                    <img src={x.model_image} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                  ) : (
                    <Ic.bike size={56} color={stCfg.c||'#D1D5DB'}/>
                  )}
                  {/* Badge nº ficha encima de la foto */}
                  {x.num&&(
                    <span style={{
                      position:'absolute',top:8,left:8,
                      fontSize:10,fontWeight:700,color:'#374151',
                      background:'rgba(255,255,255,0.92)',
                      padding:'3px 8px',borderRadius:6,
                      backdropFilter:'blur(4px)',
                    }}>#{x.num}</span>
                  )}
                  {x.needs_attention&&(
                    <span title="Necesita atención · 48h sin gestión" style={{
                      position:'absolute',top:8,right:8,
                      fontSize:10,fontWeight:800,color:'#fff',
                      background:'#DC2626',padding:'3px 7px',borderRadius:6,
                      boxShadow:'0 2px 6px rgba(220,38,38,0.35)',
                    }}>! Atención</span>
                  )}
                </div>

                {/* CONTENIDO PRINCIPAL */}
                <div style={{
                  flex:1,padding:'16px 20px',
                  display:'flex',flexDirection:'column',
                  justifyContent:'center',gap:8,minWidth:0,
                }}>
                  {/* Fila 1: Nombre */}
                  <div style={{
                    fontSize:17,fontWeight:700,color:'#111827',
                    whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                    minWidth:0,letterSpacing:'-0.2px',
                  }}>
                    {x.fn} {x.ln||''}
                  </div>

                  {/* Fila 2: Modelo + año */}
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span style={{fontSize:13,color:'#4B5563',fontWeight:600}}>
                      {x.model_brand&&x.model_name
                        ? `${x.model_brand} ${x.model_name}`
                        : <span style={{color:'#C4C9D4',fontWeight:500,fontStyle:'italic'}}>Sin modelo asignado</span>
                      }
                    </span>
                    {x.model_year&&(
                      <span style={{
                        fontSize:10,fontWeight:700,
                        color:'#4F46E5',background:'#EEF2FF',
                        padding:'2px 8px',borderRadius:99,
                      }}>{x.model_year}</span>
                    )}
                  </div>

                  {/* Fila 3: Meta — chips para vendedor, sucursal, origen */}
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    {x.seller_fn&&(() => {
                      const sc = colorFor(x.seller_id);
                      return (
                        <span style={{display:'inline-flex',alignItems:'center',gap:5,
                          fontSize:11,color:sc.c,fontWeight:700,
                          background:sc.bg,padding:'3px 9px',borderRadius:99,
                          border:`1px solid ${sc.c}30`}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:sc.c,flexShrink:0}}/>
                          {x.seller_fn} {x.seller_ln||''}
                        </span>
                      );
                    })()}
                    {brName&&(() => {
                      const bc = colorFor(x.branch_id || brName);
                      return (
                        <span style={{fontSize:11,color:bc.c,fontWeight:700,
                          background:bc.bg,padding:'3px 9px',borderRadius:99,
                          border:`1px solid ${bc.c}30`,
                          display:'inline-flex',alignItems:'center',gap:5}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:bc.c,flexShrink:0}}/>
                          {brName}
                        </span>
                      );
                    })()}
                    {x.source&&(
                      <span style={{fontSize:11,color:'#6B7280',fontWeight:500,
                        background:'#F9FAFB',padding:'3px 9px',borderRadius:99,border:'1px solid #F3F4F6'}}>
                        {SRC[x.source]||x.source}
                      </span>
                    )}
                  </div>

                  {/* Fila 4: Próximo seguimiento (si existe) */}
                  {x.followup_next_step&&(()=>{
                    const venc=x.next_followup_at&&new Date(x.next_followup_at)<new Date();
                    const txt=x.followup_next_step.length>70?x.followup_next_step.slice(0,70)+'…':x.followup_next_step;
                    const fecha=x.next_followup_at?fD(x.next_followup_at):null;
                    return(
                      <div style={{
                        marginTop:2,
                        display:'inline-flex',alignItems:'center',gap:8,
                        padding:'6px 10px 6px 8px',borderRadius:8,
                        background:venc?'#FEF2F2':'#F0FDF4',
                        border:`1px solid ${venc?'#FECACA':'#BBF7D0'}`,
                        alignSelf:'flex-start',maxWidth:'100%',
                      }}>
                        <div style={{
                          width:22,height:22,borderRadius:6,flexShrink:0,
                          background:venc?'#FEE2E2':'#DCFCE7',
                          display:'flex',alignItems:'center',justifyContent:'center',
                        }}>
                          <Ic.clock size={12} color={venc?'#DC2626':'#15803D'}/>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',minWidth:0,gap:1}}>
                          <div style={{
                            fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',
                            color:venc?'#B91C1C':'#15803D',lineHeight:1,
                          }}>
                            {venc?'Seguimiento vencido':'Próximo seguimiento'}{fecha?` · ${fecha}`:''}
                          </div>
                          <div style={{
                            fontSize:12,fontWeight:600,
                            color:venc?'#7F1D1D':'#14532D',
                            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                          }}>
                            {txt}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ZONA DERECHA: estado + fecha */}
                <div style={{
                  display:'flex',flexDirection:'column',
                  alignItems:'flex-end',justifyContent:'center',
                  padding:'16px 20px',flexShrink:0,gap:8,minWidth:150,
                  borderLeft:'1px dashed #F3F4F6',
                }}>
                  <span style={{
                    fontSize:12,fontWeight:700,
                    padding:'5px 14px',borderRadius:99,
                    background:stCfg.bg||'#F3F4F6',
                    color:stCfg.c||'#6B7280',
                    whiteSpace:'nowrap',
                    border:`1px solid ${stCfg.c||'#E5E7EB'}20`,
                  }}>
                    {stCfg.l}
                  </span>
                  <span style={{fontSize:11,color:'#9CA3AF',fontWeight:500}}>
                    {fD(x.createdAt)}
                  </span>
                </div>

                {/* ZONA REASIGNACIÓN (solo admin) */}
                {!hasRole(user,ROLES.VEND)&&allSellers.length>0&&(
                  <div style={{
                    display:'flex',alignItems:'center',
                    padding:'0 14px',flexShrink:0,
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
                          x
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={e=>{e.stopPropagation();setReassigningId(x.id);setReassignTo('');}}
                        style={{fontSize:11,fontWeight:600,color:'#3B82F6',background:'#EFF6FF',border:'1px solid #DBEAFE',padding:'5px 11px',borderRadius:7,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}
                      >
                        Traspasar
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
