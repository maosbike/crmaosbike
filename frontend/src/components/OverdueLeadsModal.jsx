import { useState } from 'react';
import { api } from '../services/api';
import { S, FOLLOWUP_OPTS, TERMINAL_STATUSES } from '../ui.jsx';

// OverdueLeadsModal — modal bloqueante de seguimiento obligatorio.
// Se muestra cuando el vendedor entra al módulo de leads con leads atrasados.
// No tiene X ni backdrop clickeable — no se puede cerrar sin completar.
//
// Props:
//   overdueLeads  — array de leads con needs_attention=true, ya ordenados ASC por needs_attention_since
//   onResolved(id) — callback cuando un lead queda resuelto
//   onDone()       — callback cuando todos los leads están resueltos

export function OverdueLeadsModal({ overdueLeads, onResolved, onDone }) {
  const [idx, setIdx] = useState(0);
  const [fq, setFq] = useState({ status: '', note: '', nextStep: '', nextAt: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const lead = overdueLeads[idx];
  const total = overdueLeads.length;
  const isTerminal = TERMINAL_STATUSES.includes(lead?.status);

  const resetForm = () => setFq({ status: '', note: '', nextStep: '', nextAt: '' });

  const handleSubmit = async () => {
    setErr('');

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

      onResolved(lead.id);

      const next = idx + 1;
      if (next >= total) {
        onDone();
      } else {
        setIdx(next);
        resetForm();
        setErr('');
      }
    } catch (e) {
      setErr(e.message || 'Error al guardar el seguimiento');
    } finally {
      setSaving(false);
    }
  };

  if (!lead) return null;

  const today = new Date().toISOString().split('T')[0];

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
          background: '#FFFFFF',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
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
            background: '#F28100',
            borderBottom: '1px solid #D97706',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Seguimiento pendiente — {idx + 1} de {total} leads
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
            Registrar seguimiento obligatorio
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
            #{lead.num} · {lead.fn}{lead.ln ? ` ${lead.ln}` : ''}
          </div>
        </div>

        {/* Cuerpo del formulario */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Estado de seguimiento */}
          <div>
            <div style={{ ...S.lbl, marginBottom: 8 }}>
              Estado del seguimiento <span style={{ color: '#EF4444' }}>*</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {FOLLOWUP_OPTS.map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setFq(p => ({ ...p, status: o.v }))}
                  style={{
                    textAlign: 'left',
                    padding: '8px 13px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    fontWeight: fq.status === o.v ? 700 : 400,
                    background: fq.status === o.v ? '#FFF7ED' : '#F9FAFB',
                    color: fq.status === o.v ? '#C2410C' : '#374151',
                    border: `1.5px solid ${fq.status === o.v ? '#FDBA74' : '#E5E7EB'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: fq.status === o.v ? '#F28100' : '#D1D5DB',
                    }}
                  />
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Nota / qué pasó */}
          <div>
            <label style={{ ...S.lbl, marginBottom: 5 }}>
              ¿Qué pasó con este lead? <span style={{ color: '#EF4444' }}>*</span>{' '}
              <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(mín. 15 caracteres)</span>
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
                color: fq.note.length >= 15 ? '#10B981' : '#9CA3AF',
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

          {/* Error */}
          {err && (
            <div
              style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
                color: '#DC2626',
                fontWeight: 600,
              }}
            >
              {err}
            </div>
          )}

          {/* Acción */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                ...S.btn,
                padding: '10px 22px',
                fontSize: 13,
                fontWeight: 700,
                opacity: saving ? 0.6 : 1,
                minWidth: 160,
              }}
            >
              {saving
                ? 'Guardando...'
                : idx + 1 < total
                  ? 'Guardar y continuar'
                  : 'Guardar y cerrar'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
