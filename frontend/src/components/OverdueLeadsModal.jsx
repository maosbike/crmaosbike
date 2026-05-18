import { useState } from 'react';
import { api } from '../services/api';
import { S, FOLLOWUP_OPTS, LOST_REASON_OPTS, LOST_REASON_LABELS, TERMINAL_STATUSES, ChoiceChip, TICKET_STATUS, SRC, fD, ago, colorFor } from '../ui.jsx';

// OverdueLeadsModal — modal bloqueante de seguimiento obligatorio.
// Se muestra cuando el vendedor entra al módulo de leads con leads atrasados.
// No tiene X ni backdrop clickeable — no se puede cerrar sin completar.
//
// Props:
//   overdueLeads  — array de leads con needs_attention=true, ya ordenados ASC por needs_attention_since
//   onResolved(id) — callback cuando un lead queda resuelto
//   onDone()       — callback cuando todos los leads están resueltos
//   onViewLead(id) — callback para navegar a la ficha del lead (cierra el modal)

export function OverdueLeadsModal({ overdueLeads, onResolved, onDone, onViewLead }) {
  const [idx, setIdx] = useState(0);
  const [fq, setFq] = useState({ status: '', note: '', nextStep: '', nextAt: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  // Modo: 'continuar' (seguir gestionando) o 'descartar' (cerrar como perdido)
  const [mode, setMode] = useState('continuar');
  const [lostReason, setLostReason] = useState('');
  const [lostDetail, setLostDetail] = useState('');

  const lead = overdueLeads[idx];
  const total = overdueLeads.length;
  const isTerminal = TERMINAL_STATUSES.includes(lead?.status);

  const resetForm = () => {
    setFq({ status: '', note: '', nextStep: '', nextAt: '' });
    setMode('continuar');
    setLostReason('');
    setLostDetail('');
  };

  // Helper: avanzar al siguiente lead o cerrar el modal si fue el último
  const advanceOrClose = () => {
    onResolved(lead.id);
    const next = idx + 1;
    if (next >= total) onDone();
    else { setIdx(next); resetForm(); setErr(''); }
  };

  // Atajos rápidos para "continuar gestionando": setea status + step + fecha
  // en 1 click. La nota la rellena con un default razonable; el vendedor
  // todavía puede editarla antes de guardar.
  const addDaysISO = (n) => {
    const d = new Date(); d.setDate(d.getDate()+n);
    return d.toISOString().slice(0,10);
  };
  const QUICK_CONTINUE = [
    { l:'Cliente sigue interesado', days:2, status:'cliente_interesado',     step:'Volver a contactar para avanzar la gestión.', note:'Cliente confirmó interés. Continuar seguimiento.' },
    { l:'Pidió más tiempo',          days:14, status:'contactar_mas_adelante', step:'Cliente pidió plazo. Volver a contactar.',     note:'Cliente solicitó más tiempo para decidir.' },
    { l:'Revisando cotización',      days:2, status:'revisando_cotizacion',   step:'Resolver dudas de la cotización.',             note:'Cliente está revisando la cotización enviada.' },
    { l:'Agendar visita',            days:2, status:'agendar_visita',         step:'Coordinar visita / test ride.',                note:'Cliente acepta coordinar visita o test ride.' },
    { l:'No responde',               days:1, status:'no_responde',            step:'Reintentar contacto al día siguiente.',        note:'Cliente no contestó pese a los intentos.' },
  ];

  // Descarte rápido: cierra el lead como perdido con motivo predefinido.
  // Cada chip es 1 click → confirma → cierra → siguiente lead.
  const handleQuickDiscard = async (reason) => {
    if (saving) return;
    setSaving(true); setErr('');
    try {
      const label = LOST_REASON_LABELS[reason] || reason;
      await api.updateTicket(lead.id, {
        status: 'perdido',
        lost_reason: reason,
        lost_reason_detail: reason === 'otro' ? (lostDetail.trim() || null) : null,
      });
      // Anotar en timeline para trazabilidad
      try {
        await api.addTimeline(lead.id, {
          type: 'system',
          title: `Lead perdido · ${label}`,
          note: reason === 'otro' ? lostDetail.trim() : null,
        });
      } catch (_) {}
      advanceOrClose();
    } catch (e) {
      setErr(e.message || 'No se pudo cerrar el lead');
    } finally {
      setSaving(false);
    }
  };

  // Continuar rápido: aplica un atajo y guarda el seguimiento en 1 click.
  const handleQuickContinue = async (q) => {
    if (saving) return;
    setSaving(true); setErr('');
    try {
      await api.submitFollowup(lead.id, {
        followup_status: q.status,
        followup_note:   q.note,
        followup_next_step: q.step,
        next_followup_at:   addDaysISO(q.days),
      });
      advanceOrClose();
    } catch (e) {
      setErr(e.message || 'Error al guardar el seguimiento');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setErr('');
    if (mode === 'descartar') {
      if (!lostReason) { setErr('Selecciona un motivo de descarte'); return; }
      if (lostReason === 'otro' && lostDetail.trim().length < 10) {
        setErr('Si eliges "Otro motivo", explica brevemente (mín. 10 caracteres)'); return;
      }
      setSaving(true);
      try {
        const label = LOST_REASON_LABELS[lostReason] || lostReason;
        await api.updateTicket(lead.id, {
          status: 'perdido',
          lost_reason: lostReason,
          lost_reason_detail: lostReason === 'otro' ? lostDetail.trim() : null,
        });
        try {
          await api.addTimeline(lead.id, {
            type: 'system',
            title: `Lead perdido · ${label}`,
            note: lostReason === 'otro' ? lostDetail.trim() : null,
          });
        } catch (_) {}
        advanceOrClose();
      } catch (e) {
        setErr(e.message || 'No se pudo cerrar el lead');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!fq.status) { setErr('Selecciona el estado de seguimiento'); return; }
    if (fq.note.trim().length < 15) { setErr('El comentario debe tener al menos 15 caracteres'); return; }

    // nextStep y nextAt solo son obligatorios si el estado del lead NO es terminal
    if (!isTerminal) {
      if (fq.nextStep.trim().length < 5) { setErr('Indica el próximo paso (mínimo 5 caracteres)'); return; }
      if (!fq.nextAt) { setErr('Ingresa la fecha de próxima gestión'); return; }
      const today = new Date().toISOString().split('T')[0];
      if (fq.nextAt < today) { setErr('La fecha de próxima gestión debe ser hoy o posterior'); return; }
    }

    setSaving(true);
    try {
      await api.submitFollowup(lead.id, {
        followup_status: fq.status,
        followup_note: fq.note.trim(),
        followup_next_step: fq.nextStep.trim(),
        next_followup_at: fq.nextAt || null,
      });
      advanceOrClose();
    } catch (e) {
      setErr(e.message || 'Error al guardar el seguimiento');
    } finally {
      setSaving(false);
    }
  };

  if (!lead) return null;

  const today = new Date().toISOString().split('T')[0];

  // Zona de contexto — helpers
  const statusDef = TICKET_STATUS[lead.status] || null;
  const phoneVal = lead.phone?.trim() || '';
  const modelLabel = (lead.model_brand || lead.model_name)
    ? [lead.model_brand, lead.model_name].filter(Boolean).join(' ')
    : null;
  const lastContactLabel = lead.lastContact ? ago(lead.lastContact) : null;
  const nextFollowupLabel = lead.next_followup_at ? fD(lead.next_followup_at) : null;
  const lastObs = lead.last_contact_entry?.note
    || lead.last_contact_entry?.title
    || lead.followup_note
    || null;
  const sellerName = [lead.seller_fn, lead.seller_ln].filter(Boolean).join(' ') || null;
  const srcLabel = lead.source ? (SRC[lead.source] || lead.source) : null;

  // Estilo compartido para filas de grilla de contexto
  const ctxRowStyle = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 };
  const ctxLabelStyle = { color: 'var(--text-disabled)', minWidth: 0, whiteSpace: 'nowrap' };
  const ctxValStyle = { color: 'var(--text)', fontWeight: 500, minWidth: 0 };
  const ctxMissingStyle = { color: 'var(--text-disabled)', fontStyle: 'italic' };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.60)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      // Sin onClick en el backdrop — no se puede cerrar haciendo clic afuera
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — fondo naranja advertencia */}
        <div
          style={{
            padding: '18px 22px',
            background: 'var(--brand)',
            borderBottom: '1px solid #D97706',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Seguimiento pendiente — {idx + 1} de {total} leads
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-on-brand)', marginBottom: 2 }}>
            Registrar seguimiento obligatorio
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
            #{lead.num} · {lead.fn}{lead.ln ? ` ${lead.ln}` : ''}
          </div>
        </div>

        {/* Zona de contexto */}
        <div
          style={{
            padding: '14px 22px',
            background: 'var(--surface-muted)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Grilla 2 columnas: datos clave */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>

            {/* Teléfono */}
            <div style={ctxRowStyle}>
              <span style={ctxLabelStyle}>Telefono</span>
              {phoneVal
                ? <span style={ctxValStyle}>{phoneVal}</span>
                : <span style={ctxMissingStyle}>Sin telefono</span>
              }
            </div>

            {/* Estado */}
            <div style={ctxRowStyle}>
              <span style={ctxLabelStyle}>Estado</span>
              {statusDef
                ? (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: statusDef.c,
                    background: `${statusDef.c}1F`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '2px 8px',
                    lineHeight: '18px',
                  }}>
                    {statusDef.l}
                  </span>
                )
                : <span style={ctxMissingStyle}>—</span>
              }
            </div>

            {/* Modelo */}
            <div style={ctxRowStyle}>
              <span style={ctxLabelStyle}>Moto</span>
              {modelLabel
                ? <span style={ctxValStyle}>{modelLabel}</span>
                : <span style={ctxMissingStyle}>Sin modelo asignado</span>
              }
            </div>

            {/* Origen */}
            <div style={ctxRowStyle}>
              <span style={ctxLabelStyle}>Origen</span>
              {srcLabel
                ? <span style={ctxValStyle}>{srcLabel}</span>
                : <span style={ctxMissingStyle}>—</span>
              }
            </div>

            {/* Sucursal */}
            {lead.branch_name && (() => {
              const bc = colorFor(lead.branch_id || lead.branch_name);
              return (
                <div style={ctxRowStyle}>
                  <span style={ctxLabelStyle}>Sucursal</span>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:bc.c, background:bc.bg, border:`1px solid ${bc.c}30`, padding:'2px 8px', borderRadius:'var(--radius-pill)' }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:bc.c }} />
                    {lead.branch_name}
                  </span>
                </div>
              );
            })()}

            {/* Vendedor */}
            {sellerName && (() => {
              const sc = colorFor(lead.seller_id || sellerName);
              return (
                <div style={ctxRowStyle}>
                  <span style={ctxLabelStyle}>Vendedor</span>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:sc.c, background:sc.bg, border:`1px solid ${sc.c}30`, padding:'2px 8px', borderRadius:'var(--radius-pill)' }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:sc.c }} />
                    {sellerName}
                  </span>
                </div>
              );
            })()}

          </div>

          {/* Último contacto */}
          <div style={ctxRowStyle}>
            <span style={ctxLabelStyle}>Ultimo contacto</span>
            {lastContactLabel
              ? <span style={{ ...ctxValStyle, color: '#D97706' }}>{lastContactLabel}</span>
              : <span style={ctxMissingStyle}>Sin contacto registrado</span>
            }
          </div>

          {/* Próximo comprometido — solo si existe */}
          {nextFollowupLabel && (
            <div style={ctxRowStyle}>
              <span style={ctxLabelStyle}>Prox. comprometido</span>
              <span style={ctxValStyle}>{nextFollowupLabel}</span>
            </div>
          )}

          {/* Última observación — solo si existe */}
          {lastObs && (
            <div style={{ fontSize: 12, color: 'var(--text-body)' }}>
              <div style={{ color: 'var(--text-disabled)', marginBottom: 4, fontSize: 11 }}>Ultima observacion</div>
              <div style={{
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: '1.5',
                color: 'var(--text-body)',
              }}>
                {lastObs}
              </div>
            </div>
          )}
        </div>

        {/* Cuerpo del formulario */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Tabs: Continuar / Descartar */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)' }}>
            <button onClick={()=>{setMode('continuar'); setErr('');}}
              style={{
                flex:1, padding:'10px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                background:'transparent', border:'none',
                borderBottom: mode==='continuar' ? '2.5px solid var(--brand)' : '2.5px solid transparent',
                color: mode==='continuar' ? 'var(--brand)' : 'var(--text-subtle)',
              }}>
              Seguir gestionando
            </button>
            <button onClick={()=>{setMode('descartar'); setErr('');}}
              style={{
                flex:1, padding:'10px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                background:'transparent', border:'none',
                borderBottom: mode==='descartar' ? '2.5px solid #DC2626' : '2.5px solid transparent',
                color: mode==='descartar' ? '#DC2626' : 'var(--text-subtle)',
              }}>
              Descartar lead
            </button>
          </div>

          {/* Modo CONTINUAR */}
          {mode === 'continuar' && (
            <>
              {/* Atajos: 1 click guarda + pasa al siguiente */}
              <div>
                <div style={{ ...S.lbl, marginBottom: 8 }}>Resolver en 1 click</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {QUICK_CONTINUE.map(q => (
                    <button key={q.l} disabled={saving}
                      onClick={()=>handleQuickContinue(q)}
                      style={{
                        textAlign:'left', padding:'10px 14px',
                        background:'var(--surface)', border:'1px solid var(--border)',
                        borderRadius:'var(--radius-md)', cursor:'pointer', fontFamily:'inherit',
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        opacity: saving ? 0.5 : 1,
                      }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{q.l}</span>
                      <span style={{ fontSize:10, color:'var(--text-disabled)', fontWeight:600 }}>+{q.days} día{q.days>1?'s':''}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Separador "o detalla manualmente" */}
              <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--text-disabled)', fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.1em' }}>
                <div style={{ flex:1, height:1, background:'var(--surface-sunken)' }}/>
                o detalla manualmente
                <div style={{ flex:1, height:1, background:'var(--surface-sunken)' }}/>
              </div>

              {/* Estado de seguimiento */}
              <div>
                <div style={{ ...S.lbl, marginBottom: 8 }}>
                  Estado del seguimiento <span style={{ color: '#EF4444' }}>*</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {FOLLOWUP_OPTS.map(o => (
                    <ChoiceChip
                      key={o.v}
                      selected={fq.status === o.v}
                      tone="brand"
                      onClick={() => setFq(p => ({ ...p, status: o.v }))}
                    >
                      {o.l}
                    </ChoiceChip>
                  ))}
                </div>
              </div>

              {/* Nota / qué pasó */}
              <div>
                <label style={{ ...S.lbl, marginBottom: 5 }}>
                  ¿Qué pasó con este lead? <span style={{ color: '#EF4444' }}>*</span>{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-disabled)' }}>(mín. 15 caracteres)</span>
                </label>
                <textarea
                  value={fq.note}
                  onChange={e => setFq(p => ({ ...p, note: e.target.value }))}
                  maxLength={5000}
                  rows={3}
                  style={{ ...S.inp, width: '100%', resize: 'vertical', fontSize: 12, boxSizing: 'border-box' }}
                  placeholder="Ej: Llamé al cliente, dice que necesita hablar con su pareja antes de decidir..."
                />
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: 10,
                    color: fq.note.length >= 15 ? '#10B981' : 'var(--text-disabled)',
                    marginTop: 2,
                  }}
                >
                  {fq.note.length}/15
                </div>
              </div>

              {/* Próximo paso — solo si el lead no está en estado terminal */}
              {!isTerminal && (
                <div>
                  <label style={{ ...S.lbl, marginBottom: 5 }}>
                    Próximo paso <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={fq.nextStep}
                    onChange={e => setFq(p => ({ ...p, nextStep: e.target.value }))}
                    maxLength={500}
                    style={{ ...S.inp, width: '100%', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="Ej: Volver a llamar el jueves a las 15:00"
                  />
                </div>
              )}

              {/* Próxima fecha — solo si el lead no está en estado terminal */}
              {!isTerminal && (
                <div>
                  <label style={{ ...S.lbl, marginBottom: 5 }}>
                    Próxima fecha <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={fq.nextAt}
                    onChange={e => setFq(p => ({ ...p, nextAt: e.target.value }))}
                    min={today}
                    style={{ ...S.inp, width: '100%', fontSize: 12, boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </>
          )}

          {/* Modo DESCARTAR */}
          {mode === 'descartar' && (
            <>
              {/* Atajos de descarte rápido: 1 click cierra el lead */}
              <div>
                <div style={{ ...S.lbl, marginBottom: 8 }}>Descarte rápido (1 click)</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {LOST_REASON_OPTS.filter(o => o.v !== 'otro').map(o => (
                    <button key={o.v} disabled={saving}
                      onClick={()=>handleQuickDiscard(o.v)}
                      style={{
                        textAlign:'left', padding:'10px 14px',
                        background:'#FEF2F2', border:'1px solid #FECACA',
                        borderRadius:'var(--radius-md)', cursor:'pointer', fontFamily:'inherit',
                        fontSize:13, fontWeight:600, color:'#B91C1C',
                        opacity: saving ? 0.5 : 1,
                      }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Otro motivo — requiere texto */}
              <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--text-disabled)', fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.1em' }}>
                <div style={{ flex:1, height:1, background:'var(--surface-sunken)' }}/>
                o explica otro motivo
                <div style={{ flex:1, height:1, background:'var(--surface-sunken)' }}/>
              </div>
              <div>
                <ChoiceChip
                  selected={lostReason === 'otro'}
                  tone="brand"
                  onClick={()=>setLostReason('otro')}
                >
                  Otro motivo
                </ChoiceChip>
                {lostReason === 'otro' && (
                  <textarea
                    value={lostDetail}
                    onChange={e => setLostDetail(e.target.value)}
                    maxLength={500}
                    rows={3}
                    style={{ ...S.inp, width:'100%', resize:'vertical', fontSize:12, boxSizing:'border-box', marginTop:8 }}
                    placeholder="Explica brevemente por qué se cierra el lead (mín. 10 caracteres)..."
                  />
                )}
              </div>
            </>
          )}

          {/* Error */}
          {err && (
            <div
              style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                fontSize: 12,
                color: '#DC2626',
                fontWeight: 600,
              }}
            >
              {err}
            </div>
          )}

          {/* Footer — Ver ficha + Guardar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {onViewLead && (
              <button
                onClick={() => onViewLead(lead.id)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-body)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Ver ficha completa
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving || (mode==='descartar' && lostReason !== 'otro')}
              style={{
                ...S.btn,
                padding: '10px 22px',
                fontSize: 13,
                fontWeight: 700,
                opacity: (saving || (mode==='descartar' && lostReason !== 'otro')) ? 0.6 : 1,
                minWidth: 160,
                marginLeft: onViewLead ? 0 : 'auto',
                background: mode==='descartar' ? '#DC2626' : undefined,
              }}
            >
              {saving
                ? 'Guardando...'
                : mode==='descartar'
                  ? (idx + 1 < total ? 'Cerrar y continuar' : 'Cerrar y terminar')
                  : (idx + 1 < total ? 'Guardar y continuar' : 'Guardar y cerrar')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
