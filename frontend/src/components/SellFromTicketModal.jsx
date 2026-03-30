import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { S, Modal, PAYMENT_TYPES, fmt } from '../ui.jsx';

export function SellFromTicketModal({ ticketId, lead, user, onClose, onSuccess }) {
  const [inv, setInv]       = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const defaultClientName = lead ? `${lead.fn||''} ${lead.ln||''}`.trim() : '';
  const defaultSellerId   = lead?.seller_id || user.id;

  const [form, setForm] = useState({
    inventory_id:   '',
    sold_by:        defaultSellerId,
    sold_at:        new Date().toISOString().split('T')[0],
    payment_method: '',
    sale_type:      'completa',
    sale_notes:     '',
    sale_price:     '',
    cost_price:     '',
    invoice_amount: '',
    client_name:    defaultClientName,
    client_rut:     lead?.rut || '',
  });

  const isAdmin = ['super_admin', 'admin_comercial', 'backoffice'].includes(user.role);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    Promise.all([
      api.getInventory({ status: 'disponible' }),
      api.getSellers(),
    ]).then(([inv, sels]) => {
      setInv(Array.isArray(inv) ? inv : []);
      setSellers(Array.isArray(sels) ? sels : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.inventory_id) { alert('Seleccioná una unidad de inventario'); return; }
    if (!form.sold_by)      { alert('Seleccioná el vendedor'); return; }
    setSaving(true);
    try {
      await api.sellInventory(form.inventory_id, {
        sold_by:        form.sold_by,
        sold_at:        form.sold_at        || null,
        ticket_id:      ticketId,
        payment_method: form.payment_method || null,
        sale_type:      form.sale_type      || null,
        sale_notes:     form.sale_notes     || null,
        sale_price:     form.sale_price     ? Number(form.sale_price)     : null,
        cost_price:     form.cost_price     ? Number(form.cost_price)     : null,
        invoice_amount: form.invoice_amount ? Number(form.invoice_amount) : null,
        client_name:    form.client_name    || null,
        client_rut:     form.client_rut     || null,
      });
      // Marcar ticket como ganado automáticamente
      if (ticketId) await api.updateTicket(ticketId, { status: 'ganado' });
      onSuccess && onSuccess();
      onClose();
    } catch (ex) {
      alert(ex.message || 'Error al registrar venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Registrar Venta" wide>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Unidad de inventario */}
        <div>
          <label style={S.lbl}>Unidad de Inventario *</label>
          {loading ? (
            <div style={{ fontSize: 12, color: '#6B7280', padding: '8px 0' }}>Cargando inventario disponible...</div>
          ) : inv.length === 0 ? (
            <div style={{ fontSize: 12, color: '#EF4444', padding: '8px 0' }}>
              No hay unidades disponibles en stock. Registrá la unidad primero en Inventario.
            </div>
          ) : (
            <select
              value={form.inventory_id}
              onChange={e => set('inventory_id', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
              required
            >
              <option value="">Seleccionar unidad...</option>
              {inv.map(u => (
                <option key={u.id} value={u.id}>
                  {u.brand} {u.model} {u.year} · {u.color} · Chasis: {u.chassis}
                  {u.branch_code ? ` · ${u.branch_code}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Vendedor + Fecha */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={S.lbl}>Vendedor *</label>
            <select
              value={form.sold_by}
              onChange={e => set('sold_by', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
              required
            >
              <option value="">Seleccionar vendedor...</option>
              {sellers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.first_name||s.fn||''} {s.last_name||s.ln||''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Fecha de Venta</label>
            <input
              type="date"
              value={form.sold_at}
              onChange={e => set('sold_at', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
            />
          </div>
        </div>

        {/* Forma de pago + Tipo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={S.lbl}>Forma de Pago</label>
            <select
              value={form.payment_method}
              onChange={e => set('payment_method', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
            >
              <option value="">Seleccionar...</option>
              {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Tipo de Venta</label>
            <select
              value={form.sale_type}
              onChange={e => set('sale_type', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
            >
              <option value="completa">Contado / Completa</option>
              <option value="financiada">Financiada</option>
            </select>
          </div>
        </div>

        {/* Cliente */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={S.lbl}>Nombre Cliente</label>
            <input
              value={form.client_name}
              onChange={e => set('client_name', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
              placeholder="Nombre completo"
            />
          </div>
          <div>
            <label style={S.lbl}>RUT Cliente</label>
            <input
              value={form.client_rut}
              onChange={e => set('client_rut', e.target.value)}
              style={{ ...S.inp, width: '100%' }}
              placeholder="12.345.678-9"
            />
          </div>
        </div>

        {/* Precio venta */}
        <div>
          <label style={S.lbl}>Precio de Venta (CLP)</label>
          <input
            type="number"
            value={form.sale_price}
            onChange={e => set('sale_price', e.target.value)}
            style={{ ...S.inp, width: '100%' }}
            placeholder="0"
            min="0"
          />
        </div>

        {/* Campos admin */}
        {isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 12px', background: 'rgba(242,129,0,0.04)', borderRadius: 8, border: '1px solid rgba(242,129,0,0.15)' }}>
            <div>
              <label style={{ ...S.lbl, color: '#9CA3AF' }}>Costo Interno</label>
              <input
                type="number"
                value={form.cost_price}
                onChange={e => set('cost_price', e.target.value)}
                style={{ ...S.inp, width: '100%' }}
                placeholder="Solo visible para admin"
                min="0"
              />
            </div>
            <div>
              <label style={{ ...S.lbl, color: '#9CA3AF' }}>Monto Factura</label>
              <input
                type="number"
                value={form.invoice_amount}
                onChange={e => set('invoice_amount', e.target.value)}
                style={{ ...S.inp, width: '100%' }}
                placeholder="0"
                min="0"
              />
            </div>
          </div>
        )}

        {/* Notas */}
        <div>
          <label style={S.lbl}>Notas de la Venta</label>
          <textarea
            value={form.sale_notes}
            onChange={e => set('sale_notes', e.target.value)}
            rows={2}
            style={{ ...S.inp, width: '100%', resize: 'vertical' }}
            placeholder="Observaciones, acuerdos especiales..."
          />
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid #F3F4F6', marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ ...S.btn2, padding: '8px 18px' }}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || (inv.length === 0 && !loading)}
            style={{ ...S.btn, padding: '8px 20px', background: '#10B981', borderColor: '#059669', opacity: (saving || (inv.length === 0 && !loading)) ? 0.6 : 1 }}
          >
            {saving ? 'Registrando...' : '✓ Registrar Venta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
