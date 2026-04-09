import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, Field, fmt, fD, PAYMENT_TYPES } from '../ui.jsx';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SALE_TYPES = [
  { v: '',            l: '— Seleccionar —' },
  { v: 'inscripcion', l: 'Solo inscripción' },
  { v: 'completa',    l: 'Documentación completa' },
];

const DOC_LABELS = {
  doc_factura_dist: 'Factura dist.',
  doc_factura_cli:  'Factura cliente',
  doc_homologacion: 'Homologación',
  doc_inscripcion:  'Inscripción',
};

const CAN_CREATE = ['super_admin', 'backoffice'];
const CAN_ADMIN  = ['super_admin', 'admin_comercial', 'backoffice'];

const EMPTY_FORM = {
  brand: '', model: '', year: new Date().getFullYear(), chassis: '', motor_num: '',
  color: '', price: '', sale_price: '', cost_price: '', invoice_amount: '',
  sold_by: '', branch_id: '', sold_at: new Date().toISOString().slice(0, 10),
  ticket_id: '', payment_method: '', sale_type: '', sale_notes: '',
  delivered: false, client_name: '', client_rut: '',
};

// ─── Helpers visuales ─────────────────────────────────────────────────────────

function StatusDot({ ok, size = 9 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: ok ? '#10B981' : '#E5E7EB',
      border: ok ? '1.5px solid #059669' : '1.5px solid #D1D5DB',
      boxShadow: ok ? '0 0 0 2px rgba(16,185,129,0.15)' : 'none',
    }} />
  );
}

function DocBadge({ url }) {
  if (url) return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#10B981',
                fontWeight: 700, fontSize: 10, textDecoration: 'none',
                background: '#ECFDF5', border: '1px solid #A7F3D0',
                borderRadius: 5, padding: '2px 7px' }}>
      <Ic.file size={11} color="#10B981" /> Ver
    </a>
  );
  return <span style={{ color: '#D1D5DB', fontSize: 11 }}>—</span>;
}

function DistributorBadge({ paid }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: paid ? '#ECFDF5' : '#FEF3C7',
      color: paid ? '#065F46' : '#92400E',
      border: `1px solid ${paid ? '#A7F3D0' : '#FCD34D'}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 10 }}>{paid ? '✓' : '○'}</span>
      {paid ? 'Pagada dist.' : 'Pend. distribuidor'}
    </span>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color = '#374151', bg = '#F9FAFB', border = '#E5E7EB', alert = false, icon }) {
  return (
    <div style={{
      background: alert ? `${bg}` : '#FFFFFF',
      border: `1px solid ${alert ? border : '#E5E7EB'}`,
      borderRadius: 12, padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: alert ? `0 2px 8px ${border}44` : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: alert ? color : '#9CA3AF',
                    textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
    </div>
  );
}

// ─── Modal: detalle / edición de venta ────────────────────────────────────────

function SaleDetailModal({ sale, user, onClose, onUpdated }) {
  const isAdmin  = CAN_ADMIN.includes(user.role);
  const canEdit  = CAN_CREATE.includes(user.role);

  const [editing,    setEditing]    = useState(false);
  const [form,       setForm]       = useState({});
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState('');
  const [uploading,  setUploading]  = useState('');

  useEffect(() => {
    setForm({
      sale_price:       sale.sale_price       || '',
      cost_price:       sale.cost_price       || '',
      invoice_amount:   sale.invoice_amount   || '',
      sale_type:        sale.sale_type        || '',
      payment_method:   sale.payment_method   || '',
      sale_notes:       sale.sale_notes       || '',
      delivered:        !!sale.delivered,
      distributor_paid: !!sale.distributor_paid,
      client_name:      sale.client_name      || '',
      client_rut:       sale.client_rut       || '',
    });
  }, [sale]);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      await api.updateSale(sale.id, form);
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  async function handleDocUpload(field, file) {
    if (!file) return;
    setUploading(field);
    try {
      await api.uploadSaleDoc(sale.id, field, file);
      onUpdated();
    } catch (e) { alert(e.message); }
    finally { setUploading(''); }
  }

  const sellerName = sale.seller_fn ? `${sale.seller_fn} ${sale.seller_ln || ''}`.trim() : '—';

  return (
    <Modal onClose={onClose} title={`Venta · ${sale.brand} ${sale.model}`} wide>

      {/* Cabecera: unidad */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 18, color: '#FFFFFF',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            {sale.brand}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 2 }}>
            {sale.model} {sale.year ? `· ${sale.year}` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', letterSpacing: '0.04em' }}>
            {sale.chassis}{sale.color ? ` · ${sale.color}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {sale.sale_price > 0 && (
            <div style={{ fontSize: 22, fontWeight: 900, color: '#F28100', letterSpacing: '-1px' }}>
              {fmt(sale.sale_price)}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#94A3B8' }}>{fD(sale.sold_at)}</div>
          <DistributorBadge paid={sale.distributor_paid} />
        </div>
      </div>

      {/* Info principal — grilla */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px', marginBottom: 16 }}>
        {[
          ['Vendedor',    sellerName],
          ['Sucursal',    sale.branch_name || '—'],
          ['Cliente',     sale.client_name || '—'],
          ['RUT',         sale.client_rut  || '—'],
          ['Ticket',      sale.ticket_num  || '—'],
          ['Forma pago',  sale.payment_method || '—'],
          ['Modalidad',   SALE_TYPES.find(s => s.v === sale.sale_type)?.l || sale.sale_type || '—'],
          ['Entregada',   sale.delivered ? 'Sí ✓' : 'Pendiente'],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ color: '#9CA3AF', fontSize: 11, minWidth: 90, flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#1E293B' }}>{val}</span>
          </div>
        ))}
        {isAdmin && sale.cost_price > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ color: '#9CA3AF', fontSize: 11, minWidth: 90, flexShrink: 0 }}>Precio lista</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#1E293B' }}>{fmt(sale.price)}</span>
          </div>
        )}
      </div>

      {sale.sale_notes && (
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                      fontSize: 12, color: '#374151', borderLeft: '3px solid #CBD5E1' }}>
          {sale.sale_notes}
        </div>
      )}

      {/* Documentos */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase',
                      letterSpacing: '0.1em', marginBottom: 8 }}>Documentos adjuntos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 6 }}>
          {Object.entries(DOC_LABELS).map(([field, label]) => (
            <div key={field} style={{
              background: '#F9FAFB', border: `1px solid ${sale[field] ? '#A7F3D0' : '#E5E7EB'}`,
              borderRadius: 8, padding: '8px 12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, marginBottom: 3 }}>{label}</div>
                <DocBadge url={sale[field]} />
              </div>
              {canEdit && (
                <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                  <input type="file" style={{ display: 'none' }} accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={e => handleDocUpload(field, e.target.files[0])} />
                  <span style={{ fontSize: 18, color: uploading === field ? '#F28100' : '#CBD5E1',
                                 lineHeight: 1, display: 'block' }}>
                    {uploading === field ? '↑' : '+'}
                  </span>
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Confirmación de eliminación — aparece cuando se activa con el trash */}
      {/* Botón editar */}
      {!editing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && (
            <button onClick={() => setEditing(true)} style={{ ...S.btn2, flex: 1 }}>
              Editar seguimiento
            </button>
          )}
        </div>
      ) : (
        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F28100', textTransform: 'uppercase',
                        letterSpacing: '0.08em', marginBottom: 2 }}>Editar seguimiento</div>
          <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Precio venta al cliente ($)" value={form.sale_price}
              onChange={set('sale_price')} type="number" />
            {isAdmin && (
              <Field label="Costo compra distribuidor ($)" value={form.cost_price}
                onChange={set('cost_price')} type="number" />
            )}
            <Field label="Forma de pago" value={form.payment_method} onChange={set('payment_method')}
              opts={[{ v: '', l: '— Forma de pago —' }, ...PAYMENT_TYPES.map(p => ({ v: p, l: p }))]} />
            <Field label="Tipo de entrega" value={form.sale_type}
              onChange={set('sale_type')} opts={SALE_TYPES} />
          </div>
          {/* Checkboxes: entrega + pago distribuidor */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={!!form.delivered}
                onChange={e => setForm(f => ({ ...f, delivered: e.target.checked }))} />
              Moto entregada al cliente
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={!!form.distributor_paid}
                onChange={e => setForm(f => ({ ...f, distributor_paid: e.target.checked }))} />
              Pagada al distribuidor
            </label>
          </div>
          <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre cliente" value={form.client_name} onChange={set('client_name')} />
            <Field label="RUT cliente"    value={form.client_rut}  onChange={set('client_rut')} />
          </div>
          <Field label="Observaciones" value={form.sale_notes} onChange={set('sale_notes')} rows={2} />
          {err && <div style={{ color: '#EF4444', fontSize: 12, padding: '6px 10px',
                                background: '#FEF2F2', borderRadius: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn, flex: 1 }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button onClick={() => setEditing(false)} style={{ ...S.btn2, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Generador de documento imprimible ───────────────────────────────────────

function fmtCLP(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function fmtDateDoc(s) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

function buildNoteHTML(data, type) {
  const isRes = type === 'reserva';
  const title = isRes ? 'NOTA DE RESERVA' : 'NOTA DE VENTA';
  const logo  = window.location.origin + '/logo.png';
  const today = fmtDateDoc(data.sold_at || new Date().toISOString().slice(0,10));

  const row = (label, value) => value
    ? `<tr><td class="lbl">${label}</td><td class="val">${value}</td></tr>`
    : '';

  const motoRows = [
    row('Marca',        data.brand),
    row('Modelo',       data.model),
    row('Año',          data.year),
    row('Color',        data.color),
    row('N° Chasis',    data.chassis),
    row('N° Motor',     data.motor_num),
  ].filter(Boolean).join('');

  const saleRows = [
    !isRes ? row('Precio de venta', fmtCLP(data.sale_price)) : '',
    !isRes ? row('Forma de pago',   data.payment_method) : '',
    !isRes ? row('Tipo de entrega', data.sale_type) : '',
    row('Sucursal',    data.branchName),
    row('Vendedor',    data.sellerName),
    row('Fecha',       today),
  ].filter(Boolean).join('');

  const notes = data.sale_notes
    ? `<div class="notes"><strong>Observaciones:</strong> ${data.sale_notes}</div>` : '';

  const block = `
    <div class="copy">
      <div class="header">
        <img src="${logo}" class="logo" alt="MAOS BIKE" onerror="this.style.display='none'" />
        <div class="header-right">
          <div class="doc-title">${title}</div>
          <div class="doc-date">${today}</div>
        </div>
      </div>

      <div class="sections">
        <div class="section">
          <div class="section-title">CLIENTE</div>
          <table class="data-table">
            ${row('Nombre', data.client_name || '—')}
            ${row('RUT',    data.client_rut  || '—')}
          </table>
        </div>

        <div class="section">
          <div class="section-title">VEHÍCULO</div>
          <table class="data-table">${motoRows || row('Unidad', '—')}</table>
        </div>

        <div class="section">
          <div class="section-title">${isRes ? 'RESERVA' : 'CONDICIONES'}</div>
          <table class="data-table">${saleRows}</table>
        </div>
      </div>

      ${notes}

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Firma y aclaración del cliente</div>
          <div class="sig-sub">Nombre: ${data.client_name || '___________________________'}</div>
          <div class="sig-sub">RUT: ${data.client_rut || '___________________________'}</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Firma del vendedor</div>
          <div class="sig-sub">Nombre: ${data.sellerName || '___________________________'}</div>
          <div class="sig-sub">Sucursal: ${data.branchName || '___________________________'}</div>
        </div>
      </div>

      <div class="footer">
        MAOS BIKE · ${isRes ? 'Copia de reserva' : 'Copia de venta'} — ${today}
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${title} — MAOS BIKE</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background:#fff; color:#0F172A; font-size:11pt; }
  .page { max-width:820px; margin:0 auto; padding:20px; }
  .copy { border:1px solid #CBD5E1; border-radius:6px; padding:24px 28px; margin-bottom:0; }
  .divider { border:none; border-top:2px dashed #94A3B8; margin:24px 0; }
  .copy + .divider + .copy { margin-top:0; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:16px; border-bottom:3px solid #0F172A; }
  .logo { height:52px; object-fit:contain; }
  .header-right { text-align:right; }
  .doc-title { font-size:18pt; font-weight:900; color:#0F172A; letter-spacing:-0.5px; line-height:1; }
  .doc-date { font-size:9pt; color:#64748B; margin-top:4px; }
  .sections { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:16px; }
  .section { }
  .section-title { font-size:7pt; font-weight:800; color:#94A3B8; text-transform:uppercase; letter-spacing:0.12em; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #E2E8F0; }
  .data-table { width:100%; border-collapse:collapse; }
  .data-table td { padding:3px 0; vertical-align:top; font-size:9.5pt; line-height:1.4; }
  .data-table .lbl { color:#64748B; width:42%; font-size:8.5pt; padding-right:6px; }
  .data-table .val { font-weight:600; color:#0F172A; }
  .notes { background:#F8FAFC; border-left:3px solid #CBD5E1; padding:8px 12px; margin-bottom:16px; font-size:9.5pt; color:#374151; border-radius:0 4px 4px 0; }
  .signatures { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-top:24px; padding-top:20px; border-top:1px solid #E2E8F0; }
  .sig-box { }
  .sig-line { border-bottom:1.5px solid #0F172A; margin-bottom:8px; height:42px; }
  .sig-label { font-size:8.5pt; font-weight:700; color:#374151; margin-bottom:4px; }
  .sig-sub { font-size:8pt; color:#64748B; margin-top:2px; }
  .footer { text-align:center; margin-top:16px; padding-top:12px; border-top:1px solid #F1F5F9; font-size:8pt; color:#94A3B8; }
  .no-print { position:fixed; bottom:20px; right:20px; display:flex; gap:10px; z-index:999; }
  .btn-print { background:#F28100; color:#fff; border:none; padding:12px 24px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(242,129,0,0.4); }
  .btn-close { background:#0F172A; color:#fff; border:none; padding:12px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
  @media print {
    body { font-size:10pt; }
    .no-print { display:none !important; }
    .page { padding:0; max-width:100%; }
    .copy { border:1px solid #CBD5E1; }
    @page { margin:1cm; size:A4; }
    * { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
  <button class="btn-close" onclick="window.close()">Cerrar</button>
</div>
<div class="page">
  ${block}
  <hr class="divider" />
  ${block.replace('Copia de reserva', 'Copia empresa').replace('Copia de venta', 'Copia empresa')}
</div>
<script>setTimeout(()=>window.print(),400);</script>
</body>
</html>`;
}

function openNote(data, type) {
  const html = buildNoteHTML(data, type);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Habilitá las ventanas emergentes para ver el documento.'); return; }
  win.document.write(html);
  win.document.close();
}

// ─── Modal: nueva venta ───────────────────────────────────────────────────────

function NewSaleModal({ sellers, branches, onClose, onCreated, noteType = 'venta' }) {
  const isReserva = noteType === 'reserva';
  const [step,       setStep]       = useState(0); // 0=source, 1=unit_from_inv, 2=form, 3=done
  const [hasInvUnit, setHasInvUnit] = useState(null); // null | true | false
  const [invUnits,   setInvUnits]   = useState([]);
  const [invSearch,  setInvSearch]  = useState('');
  const [savedDoc,   setSavedDoc]   = useState(null);
  const [selUnit,    setSelUnit]     = useState(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState('');

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  // Load available inventory when user picks "Sí"
  useEffect(() => {
    if (hasInvUnit !== true) return;
    api.getInventory({ status: isReserva ? 'disponible' : 'disponible' })
      .then(d => setInvUnits(Array.isArray(d) ? d.filter(u => u.status !== 'vendida') : []))
      .catch(() => {});
  }, [hasInvUnit]);

  // When a unit is selected from inventory, pre-fill form
  const pickUnit = (u) => {
    setSelUnit(u);
    setForm(f => ({
      ...f,
      brand: u.brand || '', model: u.model || '', year: u.year || f.year,
      color: u.color || '', chassis: u.chassis || '', motor_num: u.motor_num || '',
      branch_id: u.branch_id || '',
    }));
    setStep(2);
  };

  const filteredUnits = invUnits.filter(u => {
    if (!invSearch) return true;
    const q = invSearch.toLowerCase();
    return `${u.brand} ${u.model} ${u.chassis} ${u.color} ${u.branch_name||''}`.toLowerCase().includes(q);
  });

  async function handleCreate() {
    if (!form.brand || !form.model) { setErr('Marca y modelo son obligatorios'); return; }
    if (!isReserva && !form.sold_by) { setErr('Vendedor obligatorio'); return; }
    setSaving(true); setErr('');
    try {
      if (selUnit && !isReserva) {
        await api.sellInventory(selUnit.id, {
          sold_by: form.sold_by, sold_at: form.sold_at || null,
          ticket_id: form.ticket_id || null, payment_method: form.payment_method || null,
          sale_type: form.sale_type || null, sale_notes: form.sale_notes || null,
          client_name: form.client_name || null, client_rut: form.client_rut || null,
          sale_price: form.sale_price ? parseInt(form.sale_price) : null,
        });
      } else if (selUnit && isReserva) {
        await api.updateInventory(selUnit.id, {
          status: 'reservada',
          notes: [form.sale_notes, form.client_name ? `Cliente: ${form.client_name}` : null].filter(Boolean).join(' | ') || null,
        });
      } else if (isReserva) {
        await api.createInventory({
          branch_id: form.branch_id || null, year: Number(form.year) || null,
          brand: form.brand, model: form.model, color: form.color || null,
          chassis: form.chassis || null, motor_num: form.motor_num || null,
          notes: [form.sale_notes, form.client_name ? `Cliente: ${form.client_name}` : null].filter(Boolean).join(' | ') || null,
        });
      } else {
        await api.createSale({ ...form });
      }
      const sellerObj = sellers.find(s => String(s.id) === String(form.sold_by));
      const branchObj = branches.find(b => String(b.id) === String(selUnit?.branch_id || form.branch_id));
      const docData = {
        ...form,
        brand:      selUnit?.brand      || form.brand,
        model:      selUnit?.model      || form.model,
        year:       selUnit?.year       || form.year,
        color:      selUnit?.color      || form.color,
        chassis:    selUnit?.chassis    || form.chassis,
        motor_num:  selUnit?.motor_num  || form.motor_num,
        sellerName: sellerObj ? `${sellerObj.first_name} ${sellerObj.last_name}`.trim() : '',
        branchName: branchObj?.name || selUnit?.branch_name || '',
      };
      setSavedDoc(docData);
      setStep(3);
      onCreated();
    } catch (e) { setErr(e.message || 'Error al registrar'); setSaving(false); }
  }

  const title = isReserva ? 'Nueva nota de reserva' : 'Nueva nota de venta';

  return (
    <Modal onClose={onClose} title={title} wide>

      {/* STEP 0: ¿Unidad en inventario? */}
      {step === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
            ¿La unidad ya está en inventario?
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 28 }}>
            Si está cargada en stock, podés asociarla directamente.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => { setHasInvUnit(true); setStep(1); }}
              style={{ padding: '12px 32px', borderRadius: 10, border: '2px solid #0F172A',
                       background: '#0F172A', color: '#FFFFFF', fontSize: 14, fontWeight: 700,
                       cursor: 'pointer', fontFamily: 'inherit' }}>
              Sí, está en stock
            </button>
            <button onClick={() => { setHasInvUnit(false); setStep(2); }}
              style={{ padding: '12px 32px', borderRadius: 10, border: '2px solid #E5E7EB',
                       background: '#F9FAFB', color: '#374151', fontSize: 14, fontWeight: 700,
                       cursor: 'pointer', fontFamily: 'inherit' }}>
              No, ingresar datos
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: Selector de unidad del inventario */}
      {step === 1 && (
        <div>
          <button onClick={() => setStep(0)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                     color: '#6B7280', marginBottom: 12, padding: 0, fontFamily: 'inherit' }}>
            ← Volver
          </button>
          <input value={invSearch} onChange={e => setInvSearch(e.target.value)}
            placeholder="Buscar por modelo, chasis, color, sucursal..."
            style={{ ...S.inp, width: '100%', marginBottom: 12, fontSize: 13 }} />
          <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredUnits.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 24, fontSize: 13 }}>
                {invUnits.length === 0 ? 'Cargando...' : 'Sin resultados'}
              </div>
            )}
            {filteredUnits.map(u => (
              <button key={u.id} onClick={() => pickUnit(u)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px',
                         borderRadius: 10, border: '1px solid #E5E7EB', background: '#FFFFFF',
                         cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                         transition: 'border-color 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#F28100'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{u.brand} {u.model}</div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                    {u.color && <span>{u.color} · </span>}
                    {u.chassis && <span>Chasis: {u.chassis} · </span>}
                    <span>{u.branch_name || u.branch_code || '—'}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#F28100' }}>Seleccionar →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Formulario */}
      {step === 2 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setSelUnit(null); setStep(0); setForm({ ...EMPTY_FORM }); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                       color: '#6B7280', padding: 0, fontFamily: 'inherit' }}>
              ← Volver
            </button>
            {selUnit && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A',
                            background: '#F0FDF4', border: '1px solid #86EFAC',
                            borderRadius: 8, padding: '4px 12px' }}>
                Unidad: {selUnit.brand} {selUnit.model} {selUnit.chassis ? `· ${selUnit.chassis}` : ''}
              </div>
            )}
          </div>

          <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Cliente */}
            <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
                          textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cliente</div>
            <Field label="Nombre cliente" value={form.client_name} onChange={set('client_name')} />
            <Field label="RUT cliente"    value={form.client_rut}  onChange={set('client_rut')} />
            {!isReserva && (
              <Field label="N° Ticket (opcional)" value={form.ticket_id} onChange={set('ticket_id')} ph="UUID del ticket" />
            )}

            {/* Moto — solo si NO viene de inventario */}
            {!selUnit && (
              <>
                <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
                              textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>Moto</div>
                <Field label="Marca *"   value={form.brand}     onChange={set('brand')}     ph="YAMAHA" />
                <Field label="Modelo *"  value={form.model}     onChange={set('model')}     ph="MT-07" />
                <Field label="Año"       value={form.year}      onChange={set('year')}      type="number" />
                <Field label="Color"     value={form.color}     onChange={set('color')}     ph="Negro" />
                <Field label="N° Chasis (opcional)" value={form.chassis}   onChange={set('chassis')}   ph="9CDKDE0…" />
                <Field label="N° Motor"  value={form.motor_num} onChange={set('motor_num')} ph="opcional" />
              </>
            )}

            {/* Venta / Reserva */}
            <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
                          textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
              {isReserva ? 'Reserva' : 'Venta'}
            </div>
            {!isReserva && (
              <Field label="Vendedor *" value={form.sold_by} onChange={set('sold_by')}
                opts={[{ v: '', l: '— Seleccionar vendedor —' }, ...sellers.map(s => ({ v: s.id, l: `${s.first_name} ${s.last_name}`.trim() }))]} />
            )}
            <Field label="Sucursal" value={form.branch_id} onChange={set('branch_id')}
              opts={[{ v: '', l: '— Sucursal —' }, ...branches.map(b => ({ v: b.id, l: b.name }))]} />
            <Field label={isReserva ? 'Fecha reserva' : 'Fecha venta'} value={form.sold_at} onChange={set('sold_at')} type="date" />
            {!isReserva && (
              <>
                <Field label="Forma de pago" value={form.payment_method} onChange={set('payment_method')}
                  opts={[{ v: '', l: '— Forma de pago —' }, ...PAYMENT_TYPES.map(p => ({ v: p, l: p }))]} />
                <Field label="Tipo de entrega" value={form.sale_type} onChange={set('sale_type')} opts={SALE_TYPES} />
              </>
            )}
            {!isReserva && (
              <>
                <div style={{ gridColumn: '1/-1', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
                              textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>Precios</div>
                <Field label="Precio venta al cliente" value={form.sale_price} onChange={set('sale_price')} type="number" />
                <Field label="Precio lista (ref.)"     value={form.price}      onChange={set('price')}      type="number" />
              </>
            )}
            <div style={{ gridColumn: '1/-1' }}>
              <Field label="Observaciones" value={form.sale_notes} onChange={set('sale_notes')} rows={2} />
            </div>
          </div>

          {err && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 10, padding: '6px 10px',
                                background: '#FEF2F2', borderRadius: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={handleCreate} disabled={saving} style={{ ...S.btn, flex: 1 }}>
              {saving ? 'Registrando…' : isReserva ? 'Registrar reserva' : 'Registrar venta'}
            </button>
            <button onClick={onClose} style={{ ...S.btn2, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* STEP 3: Documento generado */}
      {step === 3 && savedDoc && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
            {isReserva ? 'Reserva registrada' : 'Venta registrada'}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 28 }}>
            El documento está listo para imprimir o descargar.
          </div>

          {/* Preview card */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
                        padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase',
                          letterSpacing: '0.1em', marginBottom: 10 }}>
              {isReserva ? 'NOTA DE RESERVA' : 'NOTA DE VENTA'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
              {[
                ['Cliente',   savedDoc.client_name || '—'],
                ['RUT',       savedDoc.client_rut  || '—'],
                ['Moto',      `${savedDoc.brand} ${savedDoc.model}${savedDoc.year ? ` ${savedDoc.year}` : ''}`],
                ['Chasis',    savedDoc.chassis     || '—'],
                ['Color',     savedDoc.color       || '—'],
                !isReserva ? ['Precio', savedDoc.sale_price ? fmtCLP(savedDoc.sale_price) : '—'] : null,
                !isReserva ? ['Forma pago', savedDoc.payment_method || '—'] : null,
                ['Vendedor',  savedDoc.sellerName  || '—'],
                ['Sucursal',  savedDoc.branchName  || '—'],
              ].filter(Boolean).map(([lbl, val]) => (
                <div key={lbl} style={{ display: 'flex', gap: 6, padding: '3px 0',
                                        borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 10, color: '#94A3B8', minWidth: 76 }}>{lbl}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => openNote(savedDoc, noteType)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F28100',
                       border: 'none', color: '#fff', borderRadius: 10, fontSize: 13,
                       fontWeight: 700, cursor: 'pointer', padding: '12px 24px',
                       boxShadow: '0 4px 12px rgba(242,129,0,0.35)', fontFamily: 'inherit' }}>
              🖨 Imprimir / Descargar PDF
            </button>
            <button onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF',
                       border: '1.5px solid #CBD5E1', color: '#374151', borderRadius: 10,
                       fontSize: 13, fontWeight: 600, cursor: 'pointer',
                       padding: '12px 20px', fontFamily: 'inherit' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────

export function SalesView({ user, realBranches }) {
  const isAdmin      = CAN_ADMIN.includes(user.role);
  const canCreate    = CAN_CREATE.includes(user.role);
  const isSuperAdmin = user.role === 'super_admin';

  const [sales,    setSales]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [sellers,  setSellers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selSale,  setSelSale]  = useState(null);
  const [showNew,  setShowNew]  = useState(null);

  const [q,              setQ]              = useState('');
  const [fromDate,       setFromDate]       = useState('');
  const [toDate,         setToDate]         = useState('');
  const [fBranch,        setFBranch]        = useState('');
  const [fSeller,        setFSeller]        = useState('');
  const [confirmDeleteId,setConfirmDeleteId]= useState(null);
  const [deleting,       setDeleting]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q)        params.q         = q;
      if (fromDate) params.from      = fromDate;
      if (toDate)   params.to        = toDate;
      if (fBranch)  params.branch_id = fBranch;
      if (fSeller && isAdmin) params.seller_id = fSeller;

      const [salesRes, statsRes] = await Promise.all([
        api.getSales(params),
        api.getSalesStats({ from: fromDate, to: toDate, branch_id: fBranch,
                            ...(isAdmin && fSeller ? { seller_id: fSeller } : {}) }),
      ]);
      setSales(salesRes.data || []);
      setStats(statsRes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [q, fromDate, toDate, fBranch, fSeller, isAdmin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isAdmin) api.getSellers().then(s => setSellers(s || [])).catch(() => {});
  }, [isAdmin]);

  const hasFilters = q || fromDate || toDate || fBranch || fSeller;
  const clearFilters = () => { setQ(''); setFromDate(''); setToDate(''); setFBranch(''); setFSeller(''); };

  const handleDeleted = (deletedId, ticketIdWas) => {
    setSales(prev => prev.filter(s => s.id !== deletedId));
    setSelSale(null);
    setStats(prev => prev ? { ...prev, total: Math.max(0, (prev.total || 1) - 1) } : prev);
    if (ticketIdWas) {
      alert(`Venta eliminada. La unidad volvió a Disponible.\n\nRecordá revisar el ticket vinculado si es necesario.`);
    }
  };

  const handleDeleteRow = async (saleId) => {
    setDeleting(true);
    try {
      const res = await api.deleteSale(saleId);
      handleDeleted(saleId, res.ticket_id_was);
    } catch (e) { alert(e.message || 'Error al eliminar'); }
    finally { setDeleting(false); setConfirmDeleteId(null); }
  };

  return (
    <div style={{ maxWidth: 1400 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Operaciones · Comercial
          </p>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.8px', lineHeight: 1 }}>
            Ventas
          </h1>
        </div>
        {canCreate && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNew('reserva')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF',
                       border: '1.5px solid #0F172A', color: '#0F172A', borderRadius: 9,
                       fontSize: 12, fontWeight: 700, cursor: 'pointer',
                       padding: '9px 18px', fontFamily: 'inherit' }}>
              <Ic.plus size={14} color="#0F172A" /> Nota de reserva
            </button>
            <button onClick={() => setShowNew('venta')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F28100',
                       border: 'none', color: '#FFFFFF', borderRadius: 9, fontSize: 12,
                       fontWeight: 700, cursor: 'pointer', padding: '9px 18px',
                       fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(242,129,0,0.35)' }}>
              <Ic.plus size={14} color="#fff" /> Nota de venta
            </button>
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
          <KpiCard label="Ventas" value={stats.total} color="#0F172A" />
          <KpiCard label="Pend. distribuidor" value={stats.pendiente_distribuidor}
            color="#B45309" bg="#FFFBEB" border="#FCD34D" alert={stats.pendiente_distribuidor > 0} />
          <KpiCard label="Sin factura cli." value={stats.sin_factura_cli}
            color="#B45309" bg="#FFFBEB" border="#FCD34D" alert={stats.sin_factura_cli > 0} />
          <KpiCard label="Pend. homolog." value={stats.sin_homologacion}
            color="#6D28D9" bg="#F5F3FF" border="#C4B5FD" alert={stats.sin_homologacion > 0} />
          <KpiCard label="Pend. inscripción" value={stats.sin_inscripcion}
            color="#0E7490" bg="#ECFEFF" border="#67E8F9" alert={stats.sin_inscripcion > 0} />
          <KpiCard label="Pend. entrega" value={stats.pendiente_entrega}
            color="#B45309" bg="#FFFBEB" border="#FCD34D" alert={stats.pendiente_entrega > 0} />
          {isAdmin && stats.total_venta > 0 && (
            <KpiCard label="Total vendido" value={fmt(stats.total_venta)} color="#065F46" bg="#ECFDF5" border="#A7F3D0" />
          )}
        </div>
      )}

      {/* ── Filtros ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 170 }}>
          <Ic.search size={13} color="#9CA3AF" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar cliente, chasis, ticket…"
            style={{ ...S.inp, paddingLeft: 28, width: '100%', height: 34, fontSize: 12 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Desde</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ ...S.inp, height: 32, fontSize: 12 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hasta</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ ...S.inp, height: 32, fontSize: 12 }} />
        </div>
        {isAdmin && realBranches.length > 0 && (
          <select value={fBranch} onChange={e => setFBranch(e.target.value)}
            style={{ ...S.inp, height: 34, fontSize: 12 }}>
            <option value="">Todas las sucursales</option>
            {realBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {isAdmin && sellers.length > 0 && (
          <select value={fSeller} onChange={e => setFSeller(e.target.value)}
            style={{ ...S.inp, height: 34, fontSize: 12 }}>
            <option value="">Todos los vendedores</option>
            {sellers.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        )}
        {hasFilters && (
          <button onClick={clearFilters}
            style={{ display: 'flex', alignItems: 'center', gap: 4, height: 34, padding: '0 12px',
                     borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB',
                     fontSize: 11, cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit' }}>
            <Ic.x size={10} /> Limpiar · {sales.length}
          </button>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="crm-sales-table" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
                    overflow: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #F1F3F5', background: '#FAFAFA' }}>
              {[
                ['Fecha',       'left',   'nowrap'],
                ['Cliente',     'left',   'nowrap'],
                ['Vendedor',    'left',   'nowrap'],
                ...(isAdmin ? [['Sucursal', 'left', 'nowrap']] : []),
                ['Moto',        'left',   'nowrap'],
                ['Chasis',      'left',   'nowrap'],
                ['P. Venta',    'right',  'nowrap'],
                ['Distribuidor','center', 'nowrap'],
                ['Entregada',   'center', 'nowrap'],
                ['Docs',        'center', 'nowrap'],
                ['',            'center', 'nowrap'],
              ].map(([h, align, ws]) => (
                <th key={h} style={{ textAlign: align, padding: '10px 12px', fontSize: 9,
                                     fontWeight: 700, color: '#6B7280', textTransform: 'uppercase',
                                     letterSpacing: '0.1em', whiteSpace: ws }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={99} style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>
                Cargando…
              </td></tr>
            )}
            {!loading && sales.length === 0 && (
              <tr><td colSpan={99} style={{ textAlign: 'center', padding: 48, color: '#9CA3AF' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Sin ventas</div>
                <div style={{ fontSize: 12 }}>{hasFilters ? 'Probá otros filtros' : 'No hay ventas registradas aún'}</div>
              </td></tr>
            )}
            {!loading && sales.map(s => {
              const sellerName = s.seller_fn ? `${s.seller_fn} ${s.seller_ln || ''}`.trim() : '—';
              const docsOk = !!(s.doc_factura_cli && s.doc_homologacion && s.doc_inscripcion);
              const docCount = [s.doc_factura_dist, s.doc_factura_cli, s.doc_homologacion, s.doc_inscripcion].filter(Boolean).length;
              return (
                <tr key={s.id}
                  onClick={() => setSelSale(s)}
                  style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.1s', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                  {/* Fecha */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#6B7280', fontSize: 11 }}>
                    {fD(s.sold_at)}
                    {s.ticket_num && (
                      <div style={{ fontSize: 9, color: '#F28100', fontWeight: 700, marginTop: 1 }}>
                        {s.ticket_num}
                      </div>
                    )}
                  </td>

                  {/* Cliente */}
                  <td style={{ padding: '10px 12px', maxWidth: 150, overflow: 'hidden',
                               textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{s.client_name || '—'}</span>
                    {s.client_rut && (
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>{s.client_rut}</div>
                    )}
                  </td>

                  {/* Vendedor */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 11, color: '#374151' }}>
                    {sellerName}
                  </td>

                  {/* Sucursal (solo admin) */}
                  {isAdmin && (
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 11, color: '#6B7280' }}>
                      {s.branch_name || '—'}
                    </td>
                  )}

                  {/* Moto */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{s.brand}</span>
                    <span style={{ color: '#475569' }}> {s.model}</span>
                    {s.year && <span style={{ color: '#9CA3AF', fontSize: 10 }}> {s.year}</span>}
                  </td>

                  {/* Chasis */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151',
                                   background: '#F1F5F9', padding: '3px 8px',
                                   borderRadius: 6, border: '1px solid #E2E8F0',
                                   letterSpacing: '0.03em' }}>
                      {s.chassis}
                    </span>
                  </td>

                  {/* Precio venta */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap',
                               fontWeight: 700, color: s.sale_price ? '#0F172A' : '#D1D5DB' }}>
                    {s.sale_price ? fmt(s.sale_price) : '—'}
                  </td>

                  {/* Estado pago distribuidor */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <DistributorBadge paid={s.distributor_paid} />
                  </td>

                  {/* Entregada */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <StatusDot ok={s.delivered} />
                  </td>

                  {/* Docs (resumen n/4) */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: docsOk ? '#ECFDF5' : docCount > 0 ? '#FFFBEB' : '#F9FAFB',
                      color: docsOk ? '#065F46' : docCount > 0 ? '#92400E' : '#9CA3AF',
                      border: `1px solid ${docsOk ? '#A7F3D0' : docCount > 0 ? '#FCD34D' : '#E5E7EB'}`,
                    }}>
                      {docCount}/4
                    </span>
                  </td>

                  {/* Acciones */}
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    {isSuperAdmin && confirmDeleteId === s.id ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => handleDeleteRow(s.id)} disabled={deleting}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#EF4444',
                                   color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {deleting ? '…' : 'Confirmar'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#F9FAFB',
                                   color: '#6B7280', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                          No
                        </button>
                      </span>
                    ) : isSuperAdmin ? (
                      <button onClick={() => setConfirmDeleteId(s.id)} title="Eliminar venta de prueba"
                        style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #FECACA', background: 'transparent',
                                 color: '#FCA5A5', cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, color: '#CBD5E1', userSelect: 'none' }}>›</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Contador */}
      {!loading && sales.length > 0 && (
        <div style={{ textAlign: 'right', fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
          {sales.length} venta{sales.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* ── Modales ── */}
      {selSale && (
        <SaleDetailModal
          sale={selSale}
          user={user}
          onClose={() => setSelSale(null)}
          onUpdated={() => { load(); setSelSale(null); }}
        />
      )}
      {showNew && (
        <NewSaleModal
          noteType={showNew}
          sellers={sellers}
          branches={realBranches || []}
          onClose={() => { setShowNew(null); load(); }}
          onCreated={() => load()}
        />
      )}
    </div>
  );
}
