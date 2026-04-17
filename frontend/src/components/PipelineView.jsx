import { useState } from 'react';
import { api } from '../services/api.js';
import { Ic, S, Modal, TICKET_STATUS, PIPELINE_STAGES, ROLES, hasRole, useIsMobile, ViewHeader, Empty, ErrorMsg } from '../ui.jsx';
import { SellFromTicketModal } from './SellFromTicketModal.jsx';

export function PipelineView({leads,user,nav,updLead}){
  const isMobile = useIsMobile();
  const [dragId,   setDragId]   = useState(null);
  const [sellLead, setSellLead] = useState(null);
  const [pipeErr,  setPipeErr]  = useState('');
  // Mobile: etapa activa (1 columna a la vez) + modal mover
  const [mobStage, setMobStage] = useState(PIPELINE_STAGES[0]);
  const [moveLead, setMoveLead] = useState(null);
  const [moving,   setMoving]   = useState(false);

  const stages  = PIPELINE_STAGES;
  const pLeads  = leads.filter(l => {
    if (!stages.includes(l.status)) return false;
    if (hasRole(user, ROLES.VEND) && l.seller_id !== user.id) return false;
    return true;
  });

  /* ── Lógica de negocio — no tocar ── */
  const drop = async stage => {
    if (!dragId) return;
    const ld = leads.find(l => l.id === dragId);
    setDragId(null);
    if (!ld || ld.status === stage) return;
    const prev = ld.status;
    updLead(ld.id, {status: stage});
    try {
      await api.updateTicket(ld.id, {status: stage});
      try { const full = await api.getTicket(ld.id); if (full?.timeline) updLead(ld.id, {timeline: full.timeline}); } catch {}
    } catch(ex) {
      updLead(ld.id, {status: prev});
      setPipeErr('No se pudo cambiar el estado: ' + (ex.message || 'Error'));
    }
  };

  const changeStage = async (l, to) => {
    if (!l || !to || l.status === to) return;
    const prev = l.status;
    setMoving(true);
    updLead(l.id, {status: to});
    try {
      await api.updateTicket(l.id, {status: to});
      try { const full = await api.getTicket(l.id); if (full?.timeline) updLead(l.id, {timeline: full.timeline}); } catch {}
    } catch(ex) {
      updLead(l.id, {status: prev});
      setPipeErr('No se pudo cambiar el estado: ' + (ex.message || 'Error'));
    } finally { setMoving(false); setMoveLead(null); }
  };

  const getSlaInfo = l => {
    if (l.sla_status === 'breached') return {breach: true,  warning: false};
    if (l.sla_status === 'warning')  return {breach: false, warning: true};
    const now   = Date.now();
    const start = l.lastContact ? new Date(l.lastContact).getTime() : new Date(l.createdAt).getTime();
    const h     = (now - start) / 3_600_000;
    return {breach: h >= 3, warning: h >= 2 && h < 3};
  };

  const getSlaColor = l => {
    const s = getSlaInfo(l);
    if (s.breach)  return '#EF4444';
    if (s.warning) return '#F59E0B';
    return '#E5E7EB';
  };

  const getSlaLabel = l => {
    if (l.sla_status === 'breached') return 'SLA vencido';
    if (l.sla_status === 'warning')  return 'Atender ya';
    const s = getSlaInfo(l);
    if (s.breach)  return 'SLA vencido';
    if (s.warning) return 'Atender ya';
    return null;
  };

  /* ════════════════════════════════════════════════════
     MOBILE — chips de etapa + lista vertical + modal mover
  ════════════════════════════════════════════════════ */
  if (isMobile) {
    const sc = TICKET_STATUS[mobStage];
    const sl = pLeads.filter(l => l.status === mobStage);
    return (
      <div>
        <ViewHeader
          title="Pipeline"
          count={pLeads.length}
          itemLabel="ficha"
          subtitle={hasRole(user, ROLES.VEND) ? 'Mis fichas' : undefined}
          size="md"
        />
        {pipeErr && <ErrorMsg msg={pipeErr} />}

        {/* Chips de etapa */}
        <div style={{
          display:'flex', gap:6, overflowX:'auto',
          padding:'0 0 12px',
          scrollbarWidth:'none', WebkitOverflowScrolling:'touch',
        }}>
          {stages.map(stage => {
            const x   = TICKET_STATUS[stage];
            const cnt = pLeads.filter(l => l.status === stage).length;
            const act = mobStage === stage;
            return (
              <button key={stage} onClick={() => setMobStage(stage)} style={{
                flexShrink:0, padding:'7px 14px', borderRadius:99,
                border:'none', cursor:'pointer', fontFamily:'inherit',
                fontSize:13, fontWeight:600,
                background: act ? x.c  : '#F3F4F6',
                color:      act ? '#fff': '#6B7280',
                display:'flex', alignItems:'center', gap:6,
                transition:'all 0.15s',
              }}>
                {x.l}
                <span style={{
                  fontSize:11, fontWeight:700,
                  background: act ? 'rgba(255,255,255,0.25)' : '#E5E7EB',
                  color:      act ? '#fff' : '#9CA3AF',
                  padding:'1px 7px', borderRadius:99,
                }}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista */}
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {sl.length === 0 && (
            <div style={{
              padding:'48px 24px', textAlign:'center',
              border:'2px dashed #E5E7EB', borderRadius:14,
              color:'#C4C9D4',
            }}>
              <Ic.bike size={32} color="#E5E7EB"/>
              <div style={{fontSize:13, marginTop:10}}>Sin fichas en {sc?.l}</div>
            </div>
          )}
          {sl.map(l => {
            const m        = l.model_brand ? {brand:l.model_brand, model:l.model_name, price:l.model_price||0, bonus:l.model_bonus||0} : null;
            const slaColor = getSlaColor(l);
            const slaLabel = getSlaLabel(l);
            return (
              <div key={l.id} style={{
                background:'#FFFFFF', borderRadius:12,
                border:'1px solid #E5E7EB',
                borderLeft:`4px solid ${slaColor}`,
                overflow:'hidden',
              }}>
                <div onClick={() => nav('ticket', l.id)} style={{
                  display:'flex', cursor:'pointer', alignItems:'stretch',
                }}>
                  {/* Foto */}
                  {l.model_image && (
                    <div style={{width:72, flexShrink:0, background:'#F3F4F6', overflow:'hidden'}}>
                      <img src={l.model_image} alt="" style={{width:'100%', height:'100%', objectFit:'contain', display:'block'}}/>
                    </div>
                  )}
                  {/* Contenido */}
                  <div style={{flex:1, padding:'12px 14px', minWidth:0}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6, marginBottom:4}}>
                      <span style={{fontSize:14, fontWeight:700, color:'#111827', lineHeight:1.3}}>
                        {l.fn} {l.ln || ''}
                      </span>
                      {l.priority === 'alta' && (
                        <span style={{
                          fontSize:9, fontWeight:700, flexShrink:0,
                          color:'#EF4444', background:'#FEF2F2',
                          padding:'2px 7px', borderRadius:99, marginTop:2,
                        }}>URGENTE</span>
                      )}
                    </div>
                    <div style={{fontSize:12, color:'#6B7280', marginBottom:4}}>
                      {m ? `${m.brand} ${m.model}`.trim() : <span style={{color:'#D1D5DB', fontStyle:'italic'}}>Sin moto</span>}
                    </div>
                    {m && m.price > 0 && (
                      <div style={{fontSize:13, fontWeight:700, color:'#374151', letterSpacing:'-0.01em'}}>
                        ${Number(m.price - m.bonus).toLocaleString('es-CL')}
                      </div>
                    )}
                    {slaLabel && (
                      <div style={{
                        display:'inline-flex', alignItems:'center', gap:4, marginTop:6,
                        padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:700,
                        background: slaColor==='#EF4444'?'#FEF2F2':'#FFFBEB',
                        color: slaColor==='#EF4444'?'#EF4444':'#F59E0B',
                      }}>
                        <Ic.alert size={10} color={slaColor==='#EF4444'?'#EF4444':'#F59E0B'}/>
                        {slaLabel}
                      </div>
                    )}
                  </div>
                </div>
                {/* Acciones */}
                <div style={{display:'flex', gap:8, padding:'8px 14px 12px', borderTop:'1px solid #F3F4F6'}}>
                  <button onClick={() => setMoveLead(l)} style={{
                    flex:1, padding:'8px 0', fontSize:12, fontWeight:600,
                    background:'#F9FAFB', color:'#374151',
                    border:'1px solid #D1D5DB', borderRadius:8,
                    cursor:'pointer', fontFamily:'inherit',
                  }}>
                    Mover →
                  </button>
                  <button onClick={() => setSellLead(l)} style={{
                    flex:1, padding:'8px 0', fontSize:12, fontWeight:600,
                    background:'rgba(16,185,129,0.08)', color:'#059669',
                    border:'1px solid rgba(16,185,129,0.25)', borderRadius:8,
                    cursor:'pointer', fontFamily:'inherit',
                  }}>
                    Registrar venta
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal mover */}
        {moveLead && (
          <Modal onClose={() => !moving && setMoveLead(null)} title={`Mover "${moveLead.fn} ${moveLead.ln || ''}" a…`}>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {stages.filter(s => s !== moveLead.status).map(s => {
                const x = TICKET_STATUS[s];
                return (
                  <button key={s} disabled={moving} onClick={() => changeStage(moveLead, s)} style={{
                    display:'flex', alignItems:'center', gap:12,
                    padding:'14px 16px',
                    border:`1.5px solid ${x?.c}40`,
                    background:`${x?.c}10`,
                    borderRadius:10, cursor: moving ? 'default' : 'pointer',
                    fontFamily:'inherit', textAlign:'left', opacity: moving ? 0.6 : 1,
                  }}>
                    <span style={{width:10, height:10, borderRadius:'50%', background:x?.c, flexShrink:0}}/>
                    <span style={{fontSize:14, fontWeight:700, color:'#111827'}}>{x?.l || s}</span>
                  </button>
                );
              })}
            </div>
          </Modal>
        )}
        {sellLead && (
          <SellFromTicketModal
            ticketId={sellLead.id} lead={sellLead} user={user}
            onClose={() => setSellLead(null)}
            onSuccess={() => { updLead(sellLead.id, {status:'ganado'}); setSellLead(null); }}
          />
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     DESKTOP — kanban con columnas de 300px
  ════════════════════════════════════════════════════ */
  return (
    <div style={{display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden'}}>

      {/* Header */}
      <div style={{flexShrink:0}}>
        <ViewHeader
          title="Pipeline"
          count={pLeads.length}
          itemLabel="ficha"
          subtitle={hasRole(user, ROLES.VEND) ? 'Mis fichas' : undefined}
          size="md"
        />
        {pipeErr && <ErrorMsg msg={pipeErr} />}
      </div>

      {/* Kanban */}
      <div style={{
        display:'flex',
        gap:14,
        flex:1,
        overflowX:'auto',
        overflowY:'hidden',
        padding:'4px 2px 20px',
        scrollbarWidth:'thin',
        scrollbarColor:'#D1D5DB #F9FAFB',
        alignItems:'stretch',
      }}>
        {stages.map(stage => {
          const sc = TICKET_STATUS[stage];
          const sl = pLeads.filter(l => l.status === stage);

          return (
            <div
              key={stage}
              onDragOver={e => e.preventDefault()}
              onDrop={() => drop(stage)}
              style={{
                minWidth:320, width:320, flexShrink:0,
                display:'flex', flexDirection:'column',
                background:'#F9FAFB',
                borderRadius:14,
                border:'1px solid #E5E7EB',
                overflow:'hidden',
              }}
            >
              {/* ── Header de columna ── */}
              <div style={{
                padding:'14px 16px',
                background:'#FFFFFF',
                borderBottom:`3px solid ${sc?.c}`,
                display:'flex', alignItems:'center', justifyContent:'space-between',
                flexShrink:0,
              }}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{
                    width:10, height:10, borderRadius:'50%',
                    background:sc?.c, flexShrink:0,
                  }}/>
                  <span style={{fontSize:14, fontWeight:700, color:'#111827'}}>
                    {sc?.l}
                  </span>
                </div>
                <span style={{
                  fontSize:12, fontWeight:700,
                  padding:'3px 10px', borderRadius:99,
                  background:sc?.bg, color:sc?.c,
                  minWidth:28, textAlign:'center',
                }}>
                  {sl.length}
                </span>
              </div>

              {/* ── Zona scrollable de cards ── */}
              <div style={{
                flex:1, overflowY:'auto',
                padding:'10px',
                display:'flex', flexDirection:'column', gap:10,
                scrollbarWidth:'thin',
                scrollbarColor:'#E5E7EB transparent',
              }}>
                {/* Empty state */}
                {sl.length === 0 && (
                  <div style={{
                    display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center',
                    padding:'40px 20px', margin:'4px 0',
                    border:'2px dashed #E5E7EB',
                    borderRadius:12,
                    color:'#D1D5DB',
                    gap:10,
                    minHeight:200,
                  }}>
                    <Ic.bike size={28} color="#E5E7EB"/>
                    <span style={{fontSize:12, color:'#C4C9D4'}}>Sin fichas</span>
                  </div>
                )}

                {/* Cards */}
                {sl.map(l => {
                  const m = l.model_brand
                    ? {brand:l.model_brand, model:l.model_name, price:l.model_price||0, bonus:l.model_bonus||0}
                    : null;
                  const slaColor = getSlaColor(l);
                  const slaLabel = getSlaLabel(l);

                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onClick={() => nav('ticket', l.id)}
                      style={{
                        background:'#FFFFFF',
                        borderRadius:10,
                        border:'1px solid #E5E7EB',
                        overflow:'visible',
                        cursor:'grab',
                        transition:'box-shadow 0.12s',
                        display:'flex',
                        alignItems:'stretch',
                        minHeight:110,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.10)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      {/* Zona visual izquierda: foto si hay, franja SLA si no */}
                      {l.model_image ? (
                        <div style={{
                          width:68, flexShrink:0,
                          background:'#F3F4F6',
                          overflow:'hidden',
                          borderRadius:'10px 0 0 10px',
                        }}>
                          <img
                            src={l.model_image} alt=""
                            style={{width:'100%', height:'100%', objectFit:'contain', display:'block'}}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width:4, flexShrink:0,
                          background:slaColor,
                          borderRadius:'10px 0 0 10px',
                        }}/>
                      )}

                      {/* Contenido */}
                      <div style={{
                        flex:1, minWidth:0,
                        padding:'14px 16px',
                        display:'flex', flexDirection:'column', gap:3,
                        justifyContent:'space-between',
                      }}>
                        {/* Nombre + prioridad */}
                        <div style={{
                          display:'flex', justifyContent:'space-between',
                          alignItems:'flex-start', gap:6,
                        }}>
                          <span style={{
                            fontSize:14, fontWeight:700, color:'#111827',
                            lineHeight:1.35,
                            wordBreak:'break-word',
                          }}>
                            {l.fn} {l.ln || ''}
                          </span>
                          {l.priority === 'alta' && (
                            <span style={{
                              fontSize:9, fontWeight:700, flexShrink:0, marginTop:2,
                              color:'#EF4444', background:'#FEF2F2',
                              padding:'2px 7px', borderRadius:99,
                            }}>
                              URGENTE
                            </span>
                          )}
                        </div>

                        {/* Modelo */}
                        <div style={{fontSize:12, color:'#6B7280', lineHeight:1.3}}>
                          {m
                            ? `${m.brand || ''} ${m.model || ''}`.trim() || 'Sin modelo'
                            : (
                              <div style={{
                                display:'inline-flex', alignItems:'center',
                                fontSize:10, color:'#C4C9D4',
                                padding:'2px 8px', borderRadius:99,
                                background:'#F9FAFB', border:'1px solid #F3F4F6',
                                alignSelf:'flex-start',
                              }}>
                                Sin moto asignada
                              </div>
                            )
                          }
                        </div>

                        {/* Precio */}
                        {m && m.price > 0 && (
                          <div style={{
                            fontSize:13, fontWeight:700, color:'#374151',
                            letterSpacing:'-0.01em', marginTop:2,
                          }}>
                            ${Number(m.price - m.bonus).toLocaleString('es-CL')}
                          </div>
                        )}

                        {/* Badge SLA si urgente */}
                        {slaLabel && (
                          <div style={{
                            display:'inline-flex', alignItems:'center', gap:4,
                            marginTop:4, alignSelf:'flex-start',
                            padding:'3px 8px', borderRadius:6,
                            fontSize:10, fontWeight:700,
                            background: slaColor==='#EF4444' ? '#FEF2F2' : '#FFFBEB',
                            color:      slaColor==='#EF4444' ? '#EF4444' : '#F59E0B',
                          }}>
                            <Ic.alert size={10} color={slaColor==='#EF4444'?'#EF4444':'#F59E0B'}/>
                            {slaLabel}
                          </div>
                        )}

                        {/* Footer: vendedor + botón venta */}
                        <div style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          marginTop:6, paddingTop:8, borderTop:'1px solid #F3F4F6', gap:6,
                        }}>
                          <span style={{
                            fontSize:11, color:'#9CA3AF',
                            flex:1, minWidth:0,
                            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                          }}>
                            {l.seller_fn
                              ? `${l.seller_fn} ${l.seller_ln || ''}`
                              : <span style={{color:'#D1D5DB'}}>Sin asignar</span>
                            }
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); setSellLead(l); }}
                            style={{
                              flexShrink:0,
                              padding:'4px 10px', fontSize:10, fontWeight:600,
                              background:'rgba(16,185,129,0.08)', color:'#059669',
                              border:'1px solid rgba(16,185,129,0.20)',
                              borderRadius:6, cursor:'pointer', fontFamily:'inherit',
                            }}
                          >
                            Venta
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {sellLead && (
        <SellFromTicketModal
          ticketId={sellLead.id} lead={sellLead} user={user}
          onClose={() => setSellLead(null)}
          onSuccess={() => { updLead(sellLead.id, {status:'ganado'}); setSellLead(null); }}
        />
      )}
    </div>
  );
}
