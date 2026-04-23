import { useState } from 'react';
import { api } from '../services/api.js';
import { Ic, S, Modal, TICKET_STATUS, PIPELINE_STAGES, ROLES, hasRole, useIsMobile, ViewHeader, Empty, ErrorMsg, colorFor } from '../ui.jsx';

// Edad en horas desde último contacto (o creación)
const ageHours = l => {
  const ref = l.lastContact || l.createdAt;
  if (!ref) return null;
  return (Date.now() - new Date(ref).getTime()) / 3_600_000;
};
const humanAge = h => {
  if (h == null) return null;
  if (h < 1)  return `${Math.max(1, Math.floor(h * 60))}m`;
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
};

// La señal de prioridad es la POSICIÓN en la columna (más viejo arriba),
// no un grito rojo en cada ficha. El vendedor decide qué atacar, no el CRM.
// Mostramos el tiempo como referencia neutra — sin colores alarmistas,
// sin CTAs tipo "LLAMAR HOY" (que pierden sentido cuando la data está vieja).

export function PipelineView({leads,user,nav,updLead}){
  const isMobile = useIsMobile();
  const [dragId,   setDragId]   = useState(null);
  const [hoverId,  setHoverId]  = useState(null);
  const [pipeErr,  setPipeErr]  = useState('');

  // Navegación a Ventas con el cliente del lead prellenado y modal de venta abierto
  const goToSale = (l) => {
    const phoneRaw = (l.phone || '').toString();
    const phone = /^569\d{8}$/.test(phoneRaw) ? phoneRaw.slice(2) : phoneRaw;
    nav('sales', null, { saleClient: {
      ticket_id:      l.id,
      client_name:    [l.fn, l.ln].filter(Boolean).join(' ').trim(),
      client_rut:     l.rut || '',
      client_phone:   phone,
      client_email:   l.email || '',
      client_commune: l.comuna || '',
      branch_id:      l.branch_id || '',
      sold_by:        l.seller_id || '',
    }, openNoteType: 'venta' });
  };
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

  /* ════════════════════════════════════════════════════
     MOBILE — chips de etapa + lista vertical + modal mover
  ════════════════════════════════════════════════════ */
  if (isMobile) {
    const sc = TICKET_STATUS[mobStage];
    const sl = pLeads.filter(l => l.status === mobStage);

    // Más viejo primero — los que llevan más tiempo sin contacto al tope
    const sorted = [...sl].sort((a,b) => (ageHours(b) || 0) - (ageHours(a) || 0));

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
          padding:'0 0 14px',
          scrollbarWidth:'none', WebkitOverflowScrolling:'touch',
        }}>
          {stages.map(stage => {
            const x   = TICKET_STATUS[stage];
            const cnt = pLeads.filter(l => l.status === stage).length;
            const act = mobStage === stage;
            return (
              <button key={stage} onClick={() => setMobStage(stage)} style={{
                flexShrink:0, padding:'8px 14px', borderRadius:99,
                border:'none', cursor:'pointer', fontFamily:'inherit',
                fontSize:13, fontWeight:600,
                background: act ? x.c  : 'var(--surface-sunken)',
                color:      act ? 'var(--text-on-dark)': 'var(--text-subtle)',
                display:'flex', alignItems:'center', gap:6,
                transition:'all 0.15s',
              }}>
                {x.l}
                <span style={{
                  fontSize:11, fontWeight:700,
                  background: act ? 'rgba(255,255,255,0.25)' : 'var(--border)',
                  color:      act ? 'var(--text-on-dark)' : 'var(--text-disabled)',
                  padding:'1px 7px', borderRadius:99,
                }}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {sorted.length === 0 && (
            <div style={{
              padding:'48px 24px', textAlign:'center',
              border:'2px dashed var(--border)', borderRadius:14,
              color:'#C4C9D4',
            }}>
              <Ic.leads size={32} color="var(--border)"/>
              <div style={{fontSize:13, marginTop:10, color:'var(--text-disabled)'}}>Sin fichas en {sc?.l}</div>
            </div>
          )}
          {sorted.map(l => {
            const m   = l.model_brand ? {brand:l.model_brand, model:l.model_name, price:l.model_price||0, bonus:l.model_bonus||0} : null;
            const age = humanAge(ageHours(l));

            return (
              <div key={l.id} style={{
                background:'var(--surface)', borderRadius:14,
                border:'1px solid var(--border)',
                overflow:'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}>
                <div onClick={() => nav('ticket', l.id)} style={{
                  display:'flex', cursor:'pointer', alignItems:'stretch',
                }}>
                  {/* Foto */}
                  {l.model_image ? (
                    <div style={{flexShrink:0, padding:'14px 0 14px 14px'}}>
                      <img src={l.model_image} alt="" style={{
                        width:104, height:104, borderRadius:12,
                        objectFit:'cover', display:'block',
                        background:'var(--surface-muted)',
                      }}/>
                    </div>
                  ) : (
                    <div style={{
                      flexShrink:0, margin:'14px 0 14px 14px',
                      width:104, height:104, borderRadius:12,
                      background:'var(--surface-muted)', display:'flex',
                      alignItems:'center', justifyContent:'center',
                    }}>
                      <Ic.bike size={28} color="var(--border-strong)"/>
                    </div>
                  )}
                  {/* Contenido */}
                  <div style={{flex:1, padding:'14px 14px', minWidth:0, overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
                    <div>
                      <div style={{
                        fontSize:15, fontWeight:700, color:'var(--text)', lineHeight:1.25, marginBottom:3,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {l.fn} {l.ln || ''}
                      </div>
                      <div style={{
                        fontSize:12, color:'var(--text-subtle)', marginBottom:6,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {m ? `${m.brand} ${m.model}`.trim() : <span style={{color:'var(--border-strong)', fontStyle:'italic'}}>Sin moto</span>}
                      </div>
                      {m && m.price > 0 && (
                        <div style={{
                          fontSize:14, fontWeight:700, color:'var(--text)', letterSpacing:'-0.01em',
                        }}>
                          ${Number(m.price - m.bonus).toLocaleString('es-CL')}
                        </div>
                      )}
                    </div>

                    {/* Edad en la etapa — referencia neutra, sin colorinches */}
                    {age && (
                      <div style={{
                        display:'inline-flex', alignItems:'center', gap:4,
                        marginTop:8,
                        fontSize:11, fontWeight:600, color:'var(--text-subtle)',
                        padding:'3px 8px', borderRadius:99,
                        background:'var(--surface-sunken)',
                        alignSelf:'flex-start',
                      }}>
                        <Ic.clock size={10} color="var(--text-subtle)"/>{age}
                      </div>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div style={{display:'flex', gap:8, padding:'10px 14px 12px', borderTop:'1px solid var(--surface-sunken)'}}>
                  <button onClick={() => setMoveLead(l)} style={{
                    flex:1, padding:'9px 0', fontSize:12, fontWeight:600,
                    background:'var(--surface-muted)', color:'var(--text-body)',
                    border:'1px solid var(--border)', borderRadius:8,
                    cursor:'pointer', fontFamily:'inherit',
                  }}>
                    Mover etapa
                  </button>
                  <button onClick={() => goToSale(l)} style={{
                    flex:1, padding:'9px 0', fontSize:12, fontWeight:700,
                    background:'#10B981', color:'var(--text-on-dark)',
                    border:'none', borderRadius:8,
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
                    <span style={{fontSize:14, fontWeight:700, color:'var(--text)'}}>{x?.l || s}</span>
                  </button>
                );
              })}
            </div>
          </Modal>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     DESKTOP — kanban más aireado, cards limpias
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
        gap:16,
        flex:1,
        overflowX:'auto',
        overflowY:'hidden',
        padding:'4px 2px 20px',
        scrollbarWidth:'thin',
        scrollbarColor:'var(--border-strong) var(--surface-muted)',
        alignItems:'stretch',
      }}>
        {stages.map(stage => {
          const sc = TICKET_STATUS[stage];
          const raw = pLeads.filter(l => l.status === stage);
          // Más viejo primero — trabajar por antigüedad, no por flag manual
          const sl = [...raw].sort((a,b) => (ageHours(b) || 0) - (ageHours(a) || 0));

          return (
            <div
              key={stage}
              onDragOver={e => e.preventDefault()}
              onDrop={() => drop(stage)}
              style={{
                flex:'1 1 240px', minWidth:220, maxWidth:320,
                display:'flex', flexDirection:'column',
                background:'var(--surface-muted)',
                borderRadius:14,
                border:'1px solid var(--border)',
                overflow:'hidden',
              }}
            >
              {/* ── Header de columna — suave, sin barra gruesa ── */}
              <div style={{
                padding:'14px 16px',
                background: sc?.bg || 'var(--surface)',
                borderBottom:'1px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                flexShrink:0,
              }}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{
                    width:8, height:8, borderRadius:'50%',
                    background:sc?.c, flexShrink:0,
                  }}/>
                  <span style={{fontSize:13, fontWeight:700, color:'var(--text)', letterSpacing:'-0.01em'}}>
                    {sc?.l}
                  </span>
                </div>
                <span style={{
                  fontSize:12, fontWeight:700,
                  padding:'3px 10px', borderRadius:99,
                  background:'var(--surface)', color:sc?.c,
                  border:`1px solid ${sc?.c}30`,
                  minWidth:28, textAlign:'center',
                }}>
                  {sl.length}
                </span>
              </div>

              {/* ── Zona scrollable de cards ── */}
              <div style={{
                flex:1, overflowY:'auto',
                padding:'12px',
                display:'flex', flexDirection:'column', gap:10,
                scrollbarWidth:'thin',
                scrollbarColor:'var(--border) transparent',
              }}>
                {/* Empty state */}
                {sl.length === 0 && (
                  <div style={{
                    display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center',
                    padding:'40px 20px', margin:'4px 0',
                    border:'2px dashed var(--border)',
                    borderRadius:12,
                    color:'var(--border-strong)',
                    gap:10,
                    minHeight:180,
                  }}>
                    <Ic.leads size={28} color="var(--border)"/>
                    <span style={{fontSize:12, color:'var(--text-disabled)'}}>Sin fichas</span>
                  </div>
                )}

                {/* Cards */}
                {sl.map(l => {
                  const m = l.model_brand
                    ? {brand:l.model_brand, model:l.model_name, price:l.model_price||0, bonus:l.model_bonus||0}
                    : null;
                  const age   = humanAge(ageHours(l));
                  const hover = hoverId === l.id;

                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onMouseEnter={() => setHoverId(l.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => nav('ticket', l.id)}
                      style={{
                        background:'var(--surface)',
                        borderRadius:14,
                        border:'1px solid var(--border)',
                        cursor:'grab',
                        transition:'transform 0.15s, box-shadow 0.15s',
                        transform: hover ? 'translateY(-2px)' : 'none',
                        boxShadow: hover ? '0 6px 16px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
                        display:'flex',
                        alignItems:'stretch',
                      }}
                    >
                      {/* Foto */}
                      {l.model_image ? (
                        <div style={{flexShrink:0, padding:'12px 0 12px 12px'}}>
                          <img
                            src={l.model_image} alt=""
                            style={{
                              width:84, height:84, borderRadius:10,
                              objectFit:'cover', display:'block',
                              background:'var(--surface-muted)',
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          flexShrink:0, margin:'12px 0 12px 12px',
                          width:84, height:84, borderRadius:10,
                          background:'var(--surface-muted)', display:'flex',
                          alignItems:'center', justifyContent:'center',
                        }}>
                          <Ic.bike size={24} color="var(--border-strong)"/>
                        </div>
                      )}

                      {/* Contenido */}
                      <div style={{
                        flex:1, minWidth:0, overflow:'hidden',
                        padding:'14px 14px',
                        display:'flex', flexDirection:'column',
                        justifyContent:'space-between', gap:4,
                      }}>
                        {/* Nombre */}
                        <div style={{
                          fontSize:14, fontWeight:700, color:'var(--text)',
                          lineHeight:1.3,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        }}>
                          {l.fn} {l.ln || ''}
                        </div>

                        {/* Modelo */}
                        <div style={{
                          fontSize:12, color:'var(--text-subtle)', lineHeight:1.3,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        }}>
                          {m
                            ? `${m.brand || ''} ${m.model || ''}`.trim() || 'Sin modelo'
                            : <span style={{color:'var(--border-strong)', fontStyle:'italic'}}>Sin moto</span>
                          }
                        </div>

                        {/* Precio */}
                        {m && m.price > 0 && (
                          <div style={{
                            fontSize:13, fontWeight:700, color:'var(--text)',
                            letterSpacing:'-0.01em',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          }}>
                            ${Number(m.price - m.bonus).toLocaleString('es-CL')}
                          </div>
                        )}

                        {/* Edad — referencia neutra */}
                        {age && (
                          <div style={{
                            display:'inline-flex', alignItems:'center', gap:4,
                            marginTop:4,
                            fontSize:11, fontWeight:600, color:'var(--text-subtle)',
                            padding:'3px 8px', borderRadius:99,
                            background:'var(--surface-sunken)',
                            alignSelf:'flex-start',
                          }}>
                            <Ic.clock size={10} color="var(--text-subtle)"/>{age}
                          </div>
                        )}

                        {/* Footer: vendedor + venta */}
                        <div style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          marginTop:8, paddingTop:8, borderTop:'1px solid var(--surface-sunken)', gap:6,
                        }}>
                          {l.seller_fn ? (() => {
                            const sc = colorFor(l.seller_id || `${l.seller_fn}${l.seller_ln||''}`);
                            return (
                              <span style={{
                                display:'inline-flex', alignItems:'center', gap:5,
                                fontSize:11, color:sc.c, fontWeight:700,
                                background:sc.bg,
                                padding:'2px 8px', borderRadius:99,
                                border:`1px solid ${sc.c}30`,
                                flex:1, minWidth:0,
                                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                              }}>
                                <span style={{width:6,height:6,borderRadius:'50%',background:sc.c,flexShrink:0}}/>
                                {l.seller_fn} {l.seller_ln || ''}
                              </span>
                            );
                          })() : (
                            <span style={{
                              fontSize:11, color:'var(--border-strong)', flex:1, minWidth:0,
                              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                            }}>
                              Sin asignar
                            </span>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); goToSale(l); }}
                            style={{
                              flexShrink:0,
                              padding:'5px 10px', fontSize:10, fontWeight:700,
                              background:'#10B981', color:'var(--text-on-dark)',
                              border:'none',
                              borderRadius:6, cursor:'pointer', fontFamily:'inherit',
                              letterSpacing:'0.02em',
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

    </div>
  );
}
