import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PIPELINE_STAGES, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ROLES, hasRole, useIsMobile, ViewHeader, Empty, ErrorMsg, SLA_STATUS } from '../ui.jsx';
import { SellFromTicketModal } from './SellFromTicketModal.jsx';

export function PipelineView({leads,user,nav,updLead}){
  const isMobile=useIsMobile();
  const[dragId,setDragId]=useState(null);
  const[sellLead,setSellLead]=useState(null);
  const[pipeErr,setPipeErr]=useState('');
  // Mobile: estado actualmente visible (1 columna a la vez) + sheet de "Mover a"
  const[mobStage,setMobStage]=useState(PIPELINE_STAGES[0]);
  const[moveLead,setMoveLead]=useState(null);
  const[moving,setMoving]=useState(false);
  const stages=PIPELINE_STAGES;
  const pLeads=leads.filter(l=>{if(!stages.includes(l.status))return false;if(hasRole(user, ROLES.VEND)&&l.seller_id!==user.id)return false;return true;});
  // Persiste el cambio de estado en backend. Si falla, revierte UI.
  const drop=async stage=>{
    if(!dragId)return;
    const ld=leads.find(l=>l.id===dragId);
    setDragId(null);
    if(!ld||ld.status===stage)return;
    const prev=ld.status;
    updLead(ld.id,{status:stage});
    try{
      await api.updateTicket(ld.id,{status:stage});
      try{
        const full=await api.getTicket(ld.id);
        if(full?.timeline)updLead(ld.id,{timeline:full.timeline});
      }catch{}
    }catch(ex){
      updLead(ld.id,{status:prev});
      setPipeErr('No se pudo cambiar el estado: '+(ex.message||'Error'));
    }
  };
  const getSlaInfo=(l)=>{
    if(l.sla_status==="breached")return{horas:0,breach:true,warning:false};
    if(l.sla_status==="warning")return{horas:0,breach:false,warning:true};
    const created=new Date(l.createdAt).getTime();const now=Date.now();const diff=now-created;const horas=diff/(1e3*60*60);const lastC=l.lastContact?new Date(l.lastContact).getTime():0;const sinContacto=lastC?((now-lastC)/(1e3*60*60)):horas;return{horas:Math.floor(sinContacto),breach:sinContacto>=3&&!l.lastContact,warning:sinContacto>=2&&sinContacto<3};
  };
  const getSlaColor=(l)=>{
    const sla=getSlaInfo(l);
    if(sla.breach)return '#EF4444';
    if(sla.warning)return '#F59E0B';
    return '#E5E7EB';
  };
  const changeStage=async(l,to)=>{
    if(!l||!to||l.status===to)return;
    const prev=l.status;
    setMoving(true);
    updLead(l.id,{status:to});
    try{
      await api.updateTicket(l.id,{status:to});
      try{ const full=await api.getTicket(l.id); if(full?.timeline)updLead(l.id,{timeline:full.timeline}); }catch{}
    }catch(ex){
      updLead(l.id,{status:prev});
      setPipeErr('No se pudo cambiar el estado: '+(ex.message||'Error'));
    }finally{ setMoving(false); setMoveLead(null); }
  };

  // ── Render MOBILE: chips de etapa + lista vertical + sheet "Mover a" ───────
  if (isMobile) {
    const sc=TICKET_STATUS[mobStage];
    const sl=pLeads.filter(l=>l.status===mobStage);
    return (
      <div>
        <ViewHeader title="Pipeline" count={pLeads.length} itemLabel="ficha" subtitle={hasRole(user, ROLES.VEND)?"Mis fichas":undefined} size="md" />
        {pipeErr && <ErrorMsg msg={pipeErr} />}
        {/* Chips de etapa con scroll horizontal */}
        <div style={{display:'flex',gap:6,overflowX:'auto',padding:'0 0 8px',scrollbarWidth:'none',WebkitOverflowScrolling:'touch',marginBottom:12}}>
          {stages.map(stage=>{
            const x=TICKET_STATUS[stage];
            const cnt=pLeads.filter(l=>l.status===stage).length;
            const active=mobStage===stage;
            return (
              <button key={stage} onClick={()=>setMobStage(stage)}
                style={{flexShrink:0,padding:'6px 12px',borderRadius:99,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:active?x.c:'#F3F4F6',color:active?'#fff':'#6B7280',transition:'all 0.15s',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}>
                {x.l}
                <span style={{fontSize:10,opacity:0.85,background:active?'rgba(255,255,255,0.25)':'#E5E7EB',padding:'1px 5px',borderRadius:99,color:active?'#fff':'#6B7280'}}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {sl.length===0 && <Empty title="Sin fichas en este estado" />}
          {sl.map(l=>{
            const sla=getSlaInfo(l);
            const slaColor=getSlaColor(l);
            const m=l.model_brand?{brand:l.model_brand,model:l.model_name,price:l.model_price||0,bonus:l.model_bonus||0}:null;
            return (
              <div key={l.id} style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,overflow:'hidden',borderLeft:`3px solid ${slaColor}`}}>
                <div onClick={()=>nav("ticket",l.id)} style={{cursor:'pointer',padding:'10px 12px'}}>
                  {/* Fila 1: Nombre + badge urgente */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:700,color:'#111827',flex:1,marginRight:6}}>{l.fn} {l.ln||''}</span>
                    {l.priority==='alta'&&<span style={{fontSize:9,fontWeight:700,color:'#EF4444',background:'#FEF2F2',padding:'2px 6px',borderRadius:99,flexShrink:0}}>URGENTE</span>}
                  </div>
                  {/* Fila 2: Modelo */}
                  {m
                    ?<div style={{fontSize:11,color:'#4B5563',marginBottom:4}}>{m.brand} {m.model||''}</div>
                    :<div style={{fontSize:11,color:'#D1D5DB',fontStyle:'italic',marginBottom:4}}>Sin moto asignada</div>
                  }
                  {/* Fila 3: Precio */}
                  {m&&m.price>0&&<div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>${Number(m.price-m.bonus).toLocaleString('es-CL')}</div>}
                  {/* Fila 4: SLA badge si aplica */}
                  {sla.breach&&<div style={{display:'flex',alignItems:'center',gap:4,marginBottom:6,padding:'3px 8px',borderRadius:6,background:'rgba(239,68,68,0.1)',fontSize:10,color:'#EF4444',fontWeight:600}}><Ic.alert size={11} color="#EF4444"/>SLA vencido</div>}
                  {sla.warning&&!sla.breach&&<div style={{display:'flex',alignItems:'center',gap:4,marginBottom:6,padding:'3px 8px',borderRadius:6,background:'rgba(245,158,11,0.1)',fontSize:10,color:'#F59E0B',fontWeight:600}}><Ic.clock size={11} color="#F59E0B"/>Atender ya</div>}
                  {/* Fila 5: Info operacional */}
                  <div style={{display:'flex',gap:8,alignItems:'center',paddingTop:6,borderTop:'1px solid #F3F4F6'}}>
                    <span style={{fontSize:10,color:'#9CA3AF',flex:1}}>#{l.num} · {l.seller_fn||'Sin asignar'}</span>
                    <span style={{fontSize:10,color:'#9CA3AF'}}>{ago(l.createdAt)}</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:6,padding:'0 12px 10px'}}>
                  <button onClick={()=>setMoveLead(l)} style={{flex:1,padding:"7px 0",fontSize:11,fontWeight:700,background:"#F9FAFB",color:"#374151",border:"1px solid #D1D5DB",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>Mover →</button>
                  <button onClick={()=>setSellLead(l)} style={{flex:1,padding:"7px 0",fontSize:11,fontWeight:700,background:"rgba(16,185,129,0.08)",color:"#059669",border:"1px solid rgba(16,185,129,0.25)",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>Registrar venta</button>
                </div>
              </div>
            );
          })}
        </div>
        {moveLead && (
          <Modal onClose={()=>!moving&&setMoveLead(null)} title={`Mover "${moveLead.fn} ${moveLead.ln||""}" a...`}>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {stages.filter(s=>s!==moveLead.status).map(s=>{
                const x=TICKET_STATUS[s];
                return (
                  <button key={s} disabled={moving} onClick={()=>changeStage(moveLead,s)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",border:`1.5px solid ${x?.c}40`,background:`${x?.c}10`,borderRadius:10,cursor:moving?"default":"pointer",fontFamily:"inherit",textAlign:"left",opacity:moving?0.6:1}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:x?.c}}/>
                    <span style={{fontSize:14,fontWeight:700,color:"#111827"}}>{x?.l||s}</span>
                  </button>
                );
              })}
            </div>
          </Modal>
        )}
        {sellLead&&<SellFromTicketModal ticketId={sellLead.id} lead={sellLead} user={user} onClose={()=>setSellLead(null)} onSuccess={()=>{updLead(sellLead.id,{status:"ganado"});setSellLead(null);}}/>}
      </div>
    );
  }

  // Devuelve texto para el badge SLA en el footer de la card (null si no aplica)
  const getSlaLabel=(l)=>{
    if(l.sla_status==='breached')return 'SLA vencido';
    if(l.sla_status==='warning')return 'Atender ya';
    const sla=getSlaInfo(l);
    if(sla.breach)return 'SLA vencido';
    if(sla.warning)return 'Atender ya';
    return null;
  };

  return(
    <div>
      <ViewHeader title="Pipeline" count={pLeads.length} itemLabel="ficha" subtitle={hasRole(user, ROLES.VEND)?"Mis fichas":undefined} size="md" />
      {pipeErr && <ErrorMsg msg={pipeErr} />}
      <div style={{
        display:'flex', gap:10,
        height:'calc(100vh - 130px)',
        overflowX:'auto', padding:'0 0 16px',
        scrollbarWidth:'thin',
        scrollbarColor:'#D1D5DB #F9FAFB',
      }}>
        {stages.map(stage=>{
          const sc=TICKET_STATUS[stage], sl=pLeads.filter(l=>l.status===stage);
          return(
            <div key={stage} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(stage)}
              style={{
                minWidth:250, width:250, flexShrink:0,
                display:'flex', flexDirection:'column',
                background:'#F9FAFB',
                borderRadius:12,
                border:'1px solid #E5E7EB',
                overflow:'hidden',
              }}>
              {/* Header de columna */}
              <div style={{
                padding:'12px 14px',
                background:'#FFFFFF',
                borderBottom:`3px solid ${sc?.c}`,
                display:'flex', alignItems:'center', justifyContent:'space-between',
              }}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={{width:8, height:8, borderRadius:'50%', background:sc?.c, flexShrink:0}}/>
                  <span style={{fontSize:13, fontWeight:700, color:'#111827'}}>{sc?.l}</span>
                </div>
                <span style={{
                  fontSize:11, fontWeight:700, minWidth:20, textAlign:'center',
                  padding:'2px 8px', borderRadius:99,
                  background:sc?.bg, color:sc?.c,
                }}>
                  {sl.length}
                </span>
              </div>

              {/* Zona scrollable de cards */}
              <div style={{
                flex:1, overflowY:'auto',
                padding:'8px',
                scrollbarWidth:'thin',
                scrollbarColor:'#D1D5DB transparent',
                display:'flex', flexDirection:'column', gap:6,
              }}>
                {sl.map(l=>{
                  const m=l.model_brand?{brand:l.model_brand,model:l.model_name,price:l.model_price||0,bonus:l.model_bonus||0}:null;
                  const slaColor=getSlaColor(l);
                  const slaLabel=getSlaLabel(l);
                  const slaLabelColor=slaColor==='#EF4444'?'#EF4444':slaColor==='#F59E0B'?'#F59E0B':'#6B7280';
                  const slaLabelBg=slaColor==='#EF4444'?'#FEF2F2':slaColor==='#F59E0B'?'#FFFBEB':'#F3F4F6';
                  return(
                    <div key={l.id} draggable onDragStart={()=>setDragId(l.id)} onClick={()=>nav("ticket",l.id)}
                      style={{
                        background:'#FFFFFF',
                        borderRadius:10,
                        border:'1px solid #E5E7EB',
                        borderLeft:`3px solid ${slaColor}`,
                        padding:0,
                        overflow:'hidden',
                        cursor:'grab',
                        transition:'box-shadow 0.12s',
                      }}
                      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.10)';}}
                      onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';}}>

                      {/* Contenido de la card */}
                      <div style={{padding:'10px 12px'}}>
                        {/* Nombre + urgente + thumbnail inline */}
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:3}}>
                          <div style={{display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0, marginRight:6}}>
                            {l.model_image && (
                              <div style={{
                                width:32, height:28, borderRadius:5, overflow:'hidden',
                                background:'#F3F4F6', flexShrink:0,
                              }}>
                                <img src={l.model_image} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                              </div>
                            )}
                            <span style={{
                              fontSize:13, fontWeight:700, color:'#111827',
                              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                            }}>{l.fn} {l.ln||''}</span>
                          </div>
                          {l.priority==='alta'&&(
                            <span style={{fontSize:9, fontWeight:700, color:'#EF4444', background:'#FEF2F2', padding:'2px 6px', borderRadius:99, flexShrink:0}}>
                              URGENTE
                            </span>
                          )}
                        </div>

                        {/* Modelo */}
                        {m && (
                          <div style={{fontSize:11, color:'#4B5563', marginBottom:6}}>
                            {[m.brand, m.model].filter(Boolean).join(' ')}
                          </div>
                        )}
                        {!m && (
                          <div style={{fontSize:11, color:'#D1D5DB', fontStyle:'italic', marginBottom:6}}>Sin moto asignada</div>
                        )}

                        {/* Precio */}
                        {m && m.price > 0 && (
                          <div style={{fontSize:13, fontWeight:700, color:'#374151', marginBottom:6, letterSpacing:'-0.01em'}}>
                            ${Number(m.price - m.bonus).toLocaleString('es-CL')}
                          </div>
                        )}

                        {/* Footer: SLA badge + vendedor + botón venta */}
                        <div style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          paddingTop:8, borderTop:'1px solid #F3F4F6', gap:6,
                        }}>
                          {/* SLA badge o ticket num */}
                          <div style={{display:'flex', alignItems:'center', gap:5, flex:1, minWidth:0}}>
                            {slaLabel ? (
                              <span style={{
                                fontSize:9, fontWeight:700,
                                color:slaLabelColor, background:slaLabelBg,
                                padding:'2px 6px', borderRadius:99, flexShrink:0,
                              }}>
                                {slaLabel}
                              </span>
                            ) : (
                              <span style={{fontSize:10, color:'#9CA3AF'}}>#{l.num}</span>
                            )}
                            {l.seller_fn && (
                              <span style={{fontSize:10, color:'#9CA3AF', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                {l.seller_fn}
                              </span>
                            )}
                          </div>
                          {/* Botón venta */}
                          <div style={{flexShrink:0}} onClick={e=>e.stopPropagation()}>
                            <button onClick={e=>{e.stopPropagation();setSellLead(l);}}
                              style={{padding:'4px 8px', fontSize:10, fontWeight:600,
                                background:'rgba(16,185,129,0.08)', color:'#059669',
                                border:'1px solid rgba(16,185,129,0.25)', borderRadius:6,
                                cursor:'pointer', display:'flex', alignItems:'center', gap:3, fontFamily:'inherit'}}>
                              <Ic.sale size={10} color="#059669"/>Venta
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sl.length===0&&(
                  <div style={{padding:'24px 12px', textAlign:'center', color:'#D1D5DB', fontSize:12}}>
                    Sin fichas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {sellLead&&<SellFromTicketModal ticketId={sellLead.id} lead={sellLead} user={user} onClose={()=>setSellLead(null)} onSuccess={()=>{updLead(sellLead.id,{status:"ganado"});setSellLead(null);}}/>}
    </div>
  );
}

// ═══════════════════════════════════════════
// TICKET VIEW (Yamaha-style lead detail)
// ═══════════════════════════════════════════
