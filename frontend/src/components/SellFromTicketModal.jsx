import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { S, Modal, PAYMENT_TYPES, fmt, normalizeText as normalize, hasRole, ROLE_ADMIN_WRITE, ErrorMsg } from '../ui.jsx';

export function SellFromTicketModal({ ticketId, lead, user, onClose, onSuccess }) {
  const [inv, setInv]         = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  // ── Producto cotizado en el ticket (historial, no se toca) ──────────────
  const quoted = lead?.model_brand ? {
    brand: lead.model_brand,
    model: lead.model_name  || '',
    price: lead.model_price || 0,
    bonus: lead.model_bonus || 0,
    year:  lead.model_year  || '',
    image: lead.model_image || null,
  } : null;

  const defaultClientName = lead ? `${lead.fn || ''} ${lead.ln || ''}`.trim() : '';
  const defaultSellerId   = lead?.seller_id || user.id;
  // Pre-popula precio con el precio de cotización como referencia
  const defaultPrice = quoted && quoted.price > 0 ? String(quoted.price - quoted.bonus) : '';

  const [noStock, setNoStock] = useState(false); // toggle: nota sin unidad real

  // Autofin: pie inicial (solo visible cuando payment_method === 'Crédito Autofin')
  const [finPct, setFinPct] = useState('');
  const [finAmt, setFinAmt] = useState('');

  const [form, setForm] = useState({
    inventory_id:   '',
    brand:          quoted?.brand || '',
    model:          quoted?.model || '',
    year:           quoted?.year  || '',
    color:          '',
    sold_by:        defaultSellerId,
    sold_at:        new Date().toISOString().split('T')[0],
    payment_method: '',
    sale_type:      'completa',
    sale_notes:     '',
    sale_price:     defaultPrice,
    cost_price:     '',
    invoice_amount: '',
    client_name:    defaultClientName,
    client_rut:     lead?.rut || '',
  });

  const isAdmin = hasRole(user, ...ROLE_ADMIN_WRITE);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    Promise.all([
      api.getInventory({ status: 'disponible' }),
      api.getSellers(),
    ]).then(([invData, sels]) => {
      setInv(Array.isArray(invData) ? invData : []);
      setSellers(Array.isArray(sels) ? sels : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── Unidad seleccionada ─────────────────────────────────────────────────
  const selectedUnit = inv.find(u => u.id === form.inventory_id) || null;

  // ── Detección de diferencia cotizado vs vendido ──────────────────────────
  const isMismatch = !!(quoted && selectedUnit && (
    normalize(selectedUnit.brand) !== normalize(quoted.brand) ||
    normalize(selectedUnit.model) !== normalize(quoted.model)
  ));
  const isMatch = !!(quoted && selectedUnit && !isMismatch);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault();
    setErr('');
    if (!noStock && !form.inventory_id) { setErr('Selecciona una unidad de inventario o activa "Nota sin stock"'); return; }
    if (noStock && (!form.brand.trim() || !form.model.trim())) { setErr('Indica la marca y modelo'); return; }
    if (!form.sold_by) { setErr('Selecciona el vendedor'); return; }
    setSaving(true);
    try {
      // Construye la línea Autofin que se anexa a sale_notes (solo si aplica)
      let autofinLine = null;
      if (form.payment_method === 'Crédito Autofin' && (finAmt || finPct)) {
        const pieAmt = Number(finAmt) || 0;
        const parts = [`Autofin: pie ${fmt(pieAmt)}`];
        if (finPct) parts.push(`(${finPct}%)`);
        autofinLine = parts.join(' ');
      }
      const baseNotes = form.sale_notes || '';
      const notesWithAutofin = autofinLine
        ? (baseNotes ? `${baseNotes} | ${autofinLine}` : autofinLine)
        : baseNotes;

      if (noStock) {
        // Nota de venta sin unidad real → sales_notes
        await api.createSale({
          brand:          form.brand.trim(),
          model:          form.model.trim(),
          year:           form.year           || null,
          color:          form.color          || null,
          sold_by:        form.sold_by,
          sold_at:        form.sold_at        || null,
          ticket_id:      ticketId            || null,
          payment_method: form.payment_method || null,
          sale_type:      form.sale_type      || null,
          sale_notes:     notesWithAutofin    || null,
          sale_price:     form.sale_price     ? Number(form.sale_price)     : null,
          cost_price:     form.cost_price     ? Number(form.cost_price)     : null,
          invoice_amount: form.invoice_amount ? Number(form.invoice_amount) : null,
          client_name:    form.client_name    || null,
          client_rut:     form.client_rut     || null,
          status:         'vendida',
        });
      } else {
        // Unidad real de inventario
        let notes = notesWithAutofin;
        if (isMismatch) {
          const diff = `Cotizado: ${quoted.brand} ${quoted.model} → Vendido: ${selectedUnit.brand} ${selectedUnit.model} (${selectedUnit.color || ''})`;
          notes = notes ? `${notes} | ${diff}` : diff;
        }
        await api.sellInventory(form.inventory_id, {
          sold_by:        form.sold_by,
          sold_at:        form.sold_at        || null,
          ticket_id:      ticketId,
          payment_method: form.payment_method || null,
          sale_type:      form.sale_type      || null,
          sale_notes:     notes               || null,
          sale_price:     form.sale_price     ? Number(form.sale_price)     : null,
          cost_price:     form.cost_price     ? Number(form.cost_price)     : null,
          invoice_amount: form.invoice_amount ? Number(form.invoice_amount) : null,
          client_name:    form.client_name    || null,
          client_rut:     form.client_rut     || null,
        });
      }

      // Marcar ticket como ganado
      if (ticketId) await api.updateTicket(ticketId, { status: 'ganado' });

      onSuccess && onSuccess();
      onClose();
    } catch (ex) {
      setErr(ex.message || 'Error al registrar venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Registrar Venta" wide>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ═══════════════════════════════════════════════════
            BLOQUE 1 — PRODUCTO COTIZADO (solo lectura)
            Es el modelo registrado en el ticket; no cambia.
        ═══════════════════════════════════════════════════ */}
        <div>
          <div style={sectionLabel}>
            Producto Cotizado
            <span style={{ fontWeight: 400, color: 'var(--text-disabled)', textTransform: 'none', letterSpacing: 0 }}>
              {' '}· historial del ticket, no se modifica
            </span>
          </div>
          {quoted ? (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              {quoted.image && (
                <img
                  src={quoted.image} alt=""
                  style={{ width: 52, height: 38, padding: 4, boxSizing: 'border-box', objectFit: 'contain', objectPosition: 'center', borderRadius: 5, background: 'var(--surface-sunken)', flexShrink: 0 }}
                />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {quoted.brand} {quoted.model}{quoted.year ? ` ${quoted.year}` : ''}
                </div>
                {quoted.price > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                    Lista: {fmt(quoted.price)}
                    {quoted.bonus > 0 && (
                      <> · Con bono: <span style={{ fontWeight: 600, color: 'var(--brand)' }}>{fmt(quoted.price - quoted.bonus)}</span></>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-disabled)' }}>
              Sin modelo cotizado registrado en este ticket
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════
            BLOQUE 2 — UNIDAD VENDIDA
        ═══════════════════════════════════════════════════ */}
        <div>
          {/* Toggle: inventario real vs. nota sin stock */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={() => setNoStock(false)}
              style={{ flex: 1, padding: '8px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 8,
                background: !noStock ? '#1E40AF' : 'var(--surface-sunken)', color: !noStock ? 'var(--text-on-dark)' : 'var(--text-subtle)',
                border: !noStock ? 'none' : '1px solid var(--border)' }}>
              Del inventario real
            </button>
            <button type="button" onClick={() => setNoStock(true)}
              style={{ flex: 1, padding: '8px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 8,
                background: noStock ? '#D97706' : 'var(--surface-sunken)', color: noStock ? 'var(--text-on-dark)' : 'var(--text-subtle)',
                border: noStock ? 'none' : '1px solid var(--border)' }}>
              Nota sin stock
            </button>
          </div>

          {noStock ? (
            /* ── Nota de venta sin unidad real ── */
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FCD34D' }}>
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600, marginBottom: 10 }}>
                Se registrará en Ventas como nota comercial — no descuenta stock del inventario.
              </div>
              <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={S.lbl}>Marca *</label>
                  <input value={form.brand} onChange={e => set('brand', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="Ej: YAMAHA" required={noStock} />
                </div>
                <div>
                  <label style={S.lbl}>Modelo *</label>
                  <input value={form.model} onChange={e => set('model', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="Ej: MT-03" required={noStock} />
                </div>
                <div>
                  <label style={S.lbl}>Año</label>
                  <input type="number" value={form.year} onChange={e => set('year', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="2025" />
                </div>
                <div>
                  <label style={S.lbl}>Color</label>
                  <input value={form.color} onChange={e => set('color', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="Ej: Azul" />
                </div>
              </div>
            </div>
          ) : (
            /* ── Unidad real de inventario ── */
            <>
              {loading ? (
                <div style={{ fontSize: 12, color: 'var(--text-subtle)', padding: '8px 0' }}>Cargando unidades disponibles...</div>
              ) : inv.length === 0 ? (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: '#DC2626' }}>
                  No hay unidades disponibles en stock. Registra la unidad primero en Inventario, o usa "Nota sin stock".
                </div>
              ) : (
                <select value={form.inventory_id} onChange={e => set('inventory_id', e.target.value)} style={{ ...S.inp, width: '100%' }}>
                  <option value="">Seleccionar unidad de inventario...</option>
                  {inv.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.brand} {u.model} {u.year} · {u.color} · Chasis: {u.chassis}
                      {u.branch_code ? ` · ${u.branch_code}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {selectedUnit && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 7, background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#15803D' }}>{selectedUnit.brand} {selectedUnit.model} {selectedUnit.year}</span>
                  <span style={{ color: '#166534' }}>· {selectedUnit.color}</span>
                  <span style={{ color: 'var(--text-muted)' }}>· Chasis: {selectedUnit.chassis}</span>
                  {selectedUnit.motor_num && <span style={{ color: 'var(--text-muted)' }}>· Motor: {selectedUnit.motor_num}</span>}
                  {selectedUnit.branch_code && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{selectedUnit.branch_code}</span>}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════
            BLOQUE 3 — COMPARACIÓN / ALERTAS
        ═══════════════════════════════════════════════════ */}

        {/* Diferencia detectada */}
        {isMismatch && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.4)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309', marginBottom: 8 }}>
              El producto vendido es distinto al cotizado
            </div>
            <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ padding: '8px 10px', borderRadius: 6, background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Cotizado</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-body)' }}>{quoted.brand} {quoted.model}</div>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: 6, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Vendido</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#15803D' }}>{selectedUnit.brand} {selectedUnit.model}</div>
                <div style={{ fontSize: 11, color: 'var(--text-body)' }}>{selectedUnit.color} · {selectedUnit.chassis}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#92400E', marginTop: 8, lineHeight: 1.5 }}>
              La cotización original queda en el historial del ticket. La diferencia se registrará automáticamente en las notas de la venta.
            </div>
          </div>
        )}

        {/* Coincidencia confirmada */}
        {isMatch && (
          <div style={{ padding: '7px 12px', borderRadius: 7, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 11, color: '#065F46', display: 'flex', alignItems: 'center', gap: 6 }}>
            La unidad coincide con el modelo cotizado
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            BLOQUE 4 — DATOS DE LA VENTA
        ═══════════════════════════════════════════════════ */}
        <div style={{ borderTop: '1px solid var(--surface-sunken)', paddingTop: 12 }}>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>Datos de la Venta</div>

          {/* Vendedor + Fecha */}
          <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.lbl}>Vendedor *</label>
              <select value={form.sold_by} onChange={e => set('sold_by', e.target.value)} style={{ ...S.inp, width: '100%' }} required>
                <option value="">Seleccionar vendedor...</option>
                {sellers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.first_name || s.fn || ''} {s.last_name || s.ln || ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.lbl}>Fecha de Venta</label>
              <input type="date" value={form.sold_at} onChange={e => set('sold_at', e.target.value)} style={{ ...S.inp, width: '100%' }} />
            </div>
          </div>

          {/* Forma de pago + Tipo */}
          <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.lbl}>Forma de Pago</label>
              <select value={form.payment_method}
                onChange={e => {
                  set('payment_method', e.target.value);
                  if (e.target.value !== 'Crédito Autofin') {
                    setFinPct(''); setFinAmt('');
                  }
                }}
                style={{ ...S.inp, width: '100%' }}>
                <option value="">Seleccionar...</option>
                {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={S.lbl}>Tipo de Venta</label>
              <select value={form.sale_type} onChange={e => set('sale_type', e.target.value)} style={{ ...S.inp, width: '100%' }}>
                <option value="completa">Contado / Completa</option>
                <option value="financiada">Financiada</option>
              </select>
            </div>
          </div>

          {/* Autofin — pie inicial */}
          {form.payment_method === 'Crédito Autofin' && (() => {
            const total    = Number(form.sale_price) || 0;
            const pieAmt   = Number(finAmt) || 0;
            const saldoFin = Math.max(0, total - pieAmt);
            return (
              <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 8, padding: '10px 12px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Pie inicial (Autofin)
                </div>
                <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={S.lbl}>Pie inicial (%)</label>
                    <input type="number" value={finPct}
                      onChange={e => {
                        const v = e.target.value;
                        setFinPct(v);
                        const pct = Number(v);
                        if (total > 0 && !isNaN(pct) && v !== '') {
                          setFinAmt(String(Math.round(total * pct / 100)));
                        } else if (v === '') {
                          setFinAmt('');
                        }
                      }}
                      style={{ ...S.inp, width: '100%' }} placeholder="Ej. 30" />
                  </div>
                  <div>
                    <label style={S.lbl}>Pie inicial ($)</label>
                    <input type="number" value={finAmt}
                      onChange={e => {
                        const v = e.target.value;
                        setFinAmt(v);
                        const amt = Number(v);
                        if (total > 0 && !isNaN(amt) && v !== '') {
                          setFinPct(String(Math.round(amt / total * 1000) / 10));
                        } else if (v === '') {
                          setFinPct('');
                        }
                      }}
                      style={{ ...S.inp, width: '100%' }} placeholder="Monto en $" />
                  </div>
                </div>
                {total > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid #FED7AA', borderRadius: 6, padding: '8px 12px', fontSize: 11.5, color: '#7C2D12' }}>
                    <div>Pie inicial: <strong>{fmt(pieAmt)}</strong> {finPct && `(${finPct}%)`}</div>
                    <div>Saldo a financiar: <strong>{fmt(saldoFin)}</strong></div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Cliente */}
          <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.lbl}>Nombre Cliente</label>
              <input value={form.client_name} onChange={e => set('client_name', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="Nombre completo" />
            </div>
            <div>
              <label style={S.lbl}>RUT Cliente</label>
              <input value={form.client_rut} onChange={e => set('client_rut', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="12.345.678-9" />
            </div>
          </div>

          {/* Precio de venta */}
          <div style={{ marginBottom: 10 }}>
            <label style={S.lbl}>
              Precio de Venta (CLP)
              {quoted && quoted.price > 0 && (
                <span style={{ fontWeight: 400, color: 'var(--text-disabled)', marginLeft: 6 }}>
                  · cotizado: {fmt(quoted.price - quoted.bonus)}
                </span>
              )}
            </label>
            <input
              type="number"
              value={form.sale_price}
              onChange={e => set('sale_price', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
              placeholder="0"
              min="0"
            />
          </div>

          {/* Campos solo admin */}
          {isAdmin && (
            <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10, padding: '10px 12px', background: 'var(--brand-soft)', borderRadius: 8, border: '1px solid var(--brand-muted)' }}>
              <div>
                <label style={{ ...S.lbl, color: 'var(--text-disabled)' }}>Costo Interno</label>
                <input type="number" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="Solo visible para admin" min="0" />
              </div>
              <div>
                <label style={{ ...S.lbl, color: 'var(--text-disabled)' }}>Monto Factura</label>
                <input type="number" value={form.invoice_amount} onChange={e => set('invoice_amount', e.target.value)} style={{ ...S.inp, width: '100%' }} placeholder="0" min="0" />
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label style={S.lbl}>
              Notas de la Venta
              {isMismatch && <span style={{ fontWeight: 400, color: '#B45309', marginLeft: 6 }}>· la diferencia cotizado/vendido se añadirá automáticamente</span>}
            </label>
            <textarea
              value={form.sale_notes}
              onChange={e => set('sale_notes', e.target.value)}
              rows={2}
              style={{ ...S.inp, width: '100%', resize: 'vertical' }}
              placeholder="Observaciones, acuerdos especiales..."
            />
          </div>
        </div>

        {/* Error */}
        <ErrorMsg msg={err} />

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--surface-sunken)' }}>
          <button type="button" onClick={onClose} style={{ ...S.btn2, padding: '8px 18px' }}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              ...S.btn, padding: '8px 20px',
              background: noStock ? '#D97706' : '#10B981',
              borderColor: noStock ? '#B45309' : '#059669',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Registrando...' : noStock ? 'Registrar Nota de Venta' : 'Confirmar Venta'}
          </button>
        </div>

      </form>
    </Modal>
  );
}

// ── Estilos locales reutilizables ─────────────────────────────────────────────
const sectionLabel = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-body)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 7,
  display: 'block',
};
