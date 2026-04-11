import { useState, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../services/api';
import { Ic, S, Modal, Field, fmt, fD, PAYMENT_TYPES } from '../ui.jsx';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SALE_TYPES = [
  { v: '',            l: '— Seleccionar —' },
  { v: 'inscripcion', l: 'Solo inscripción' },
  { v: 'completa',    l: 'Documentación completa' },
];

const INSCRIPCION_AMT = 90000;

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
  client_phone: '', client_email: '', client_address: '', client_commune: '',
  client_type: 'persona',
  empresa_name: '', empresa_rut: '', empresa_giro: '', empresa_email: '', empresa_phone: '',
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
  const isAdmin   = CAN_ADMIN.includes(user.role);
  const isRes     = sale.status === 'reservada';
  // Reservas pueden ser editadas por todos los roles; ventas solo por admins
  const canEdit   = isRes ? true : CAN_CREATE.includes(user.role);

  const [editing,    setEditing]    = useState(false);
  const [form,       setForm]       = useState({});
  const [saving,     setSaving]     = useState(false);
  const [converting, setConverting] = useState(false);
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
      sold_by:          sale.seller_id        || '',
    });
  }, [sale]);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      if (isRes) {
        // Reservas: actualizar via inventory PUT
        await api.updateInventory(sale.id, {
          sale_price:     form.sale_price     ? parseInt(form.sale_price)     : null,
          invoice_amount: form.invoice_amount ? parseInt(form.invoice_amount) : null,
          payment_method: form.payment_method || null,
          sale_notes:     form.sale_notes     || null,
          client_name:    form.client_name    || null,
          client_rut:     form.client_rut     || null,
          sold_by:        form.sold_by        || null,
        });
      } else {
        await api.updateSale(sale.id, form);
      }
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  async function handleConvertToVenta() {
    if (!window.confirm('¿Confirmar conversión a nota de venta? Esta acción no se puede deshacer.')) return;
    setConverting(true); setErr('');
    try {
      await api.sellInventory(sale.id, {
        sold_by:        form.sold_by        || sale.seller_id,
        sale_price:     form.sale_price     ? parseInt(form.sale_price)     : (sale.sale_price     || null),
        invoice_amount: form.invoice_amount ? parseInt(form.invoice_amount) : (sale.invoice_amount || null),
        client_name:    form.client_name    || sale.client_name    || null,
        client_rut:     form.client_rut     || sale.client_rut     || null,
        payment_method: form.payment_method || sale.payment_method || null,
        sale_notes:     form.sale_notes     || sale.sale_notes     || null,
        sold_at:        new Date().toISOString(),
      });
      onUpdated();
    } catch (e) { setErr(e.message || 'Error al convertir'); }
    finally { setConverting(false); }
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

  const saldo = sale.sale_price > 0 ? Math.max(0, sale.sale_price - (sale.invoice_amount || 0)) : 0;

  return (
    <Modal onClose={onClose} title={isRes ? `Reserva · ${sale.brand} ${sale.model}` : `Venta · ${sale.brand} ${sale.model}`} wide>

      {/* Cabecera: unidad */}
      <div style={{
        background: isRes ? 'linear-gradient(135deg, #78350F 0%, #92400E 100%)' : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 18, color: '#FFFFFF',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            {isRes ? (
              <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6,
                background:'rgba(255,255,255,0.2)', color:'#FEF3C7', letterSpacing:'0.08em' }}>◐ RESERVA</span>
            ) : (
              <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6,
                background:'rgba(255,255,255,0.2)', color:'#A7F3D0', letterSpacing:'0.08em' }}>✓ VENTA</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: isRes?'#FDE68A':'#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            {sale.brand}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 2 }}>
            {sale.model} {sale.year ? `· ${sale.year}` : ''}
          </div>
          <div style={{ fontSize: 11, color: isRes?'#FDE68A':'#94A3B8', letterSpacing: '0.04em' }}>
            {sale.chassis}{sale.color ? ` · ${sale.color}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {sale.sale_price > 0 && (
            <div style={{ fontSize: 22, fontWeight: 900, color: '#F28100', letterSpacing: '-1px' }}>
              {fmt(sale.sale_price)}
            </div>
          )}
          {isRes && sale.sale_price > 0 && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color:'#86EFAC' }}>Abonado: {fmt(sale.invoice_amount||0)}</span>
              {' · '}
              <span style={{ color: saldo > 0 ? '#FCA5A5' : '#86EFAC', fontWeight:700 }}>
                {saldo > 0 ? `Falta: ${fmt(saldo)}` : '✓ Saldado'}
              </span>
            </div>
          )}
          <div style={{ fontSize: 11, color: isRes?'#FDE68A':'#94A3B8' }}>{fD(sale.sold_at)}</div>
          {!isRes && <DistributorBadge paid={sale.distributor_paid} />}
        </div>
      </div>

      {/* Info principal — grilla */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px', marginBottom: 16 }}>
        {[
          ['Vendedor',    sellerName],
          ['Sucursal',    sale.added_as_sold ? (sale.branch_name || '—') + ' · Bodega directa' : (sale.branch_name || '—')],
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

      {/* Acciones principales */}
      {!editing ? (
        <div style={{ display: 'flex', gap: 8, flexWrap:'wrap' }}>
          {/* Descargar documento */}
          <button onClick={() => openNote({
            brand: sale.brand, model: sale.model, year: sale.year, color: sale.color,
            chassis: sale.chassis, motor_num: sale.motor_num, sold_at: sale.sold_at,
            branchName: sale.branch_name || '', sellerName: sale.seller_fn ? `${sale.seller_fn} ${sale.seller_ln||''}`.trim() : '',
            client_name: sale.client_name||'', client_rut: sale.client_rut||'', client_type:'persona',
            sale_price: sale.sale_price, abono: sale.invoice_amount||0,
            accessories:[], discount:'', payMode: sale.payment_method||'', payLines:[], finPct:'',
            sale_notes: sale.sale_notes, titularSame:true, titular:null,
          }, isRes ? 'reserva' : 'venta')}
            style={{ ...S.btn2, display:'flex', alignItems:'center', gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Ver documento
          </button>
          {canEdit && (
            <button onClick={() => setEditing(true)} style={{ ...S.btn2, flex: 1 }}>
              {isRes ? 'Editar reserva' : 'Editar seguimiento'}
            </button>
          )}
          {/* Convertir a venta (solo reservas saldadas o cualquiera) */}
          {isRes && canEdit && (
            <button onClick={handleConvertToVenta} disabled={converting}
              style={{ ...S.btn, flex: 1, background: saldo === 0 ? '#059669' : '#F28100',
                       display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              {converting ? 'Convirtiendo…' : saldo === 0 ? '✓ Pasar a venta (saldado)' : '→ Registrar como venta'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: isRes?'#B45309':'#F28100', textTransform: 'uppercase',
                        letterSpacing: '0.08em', marginBottom: 2 }}>
            {isRes ? 'Editar reserva' : 'Editar seguimiento'}
          </div>
          <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Precio total ($)" value={form.sale_price}
              onChange={set('sale_price')} type="number" />
            {isRes ? (
              <div>
                <Field label="Abono recibido ($)" value={form.invoice_amount}
                  onChange={set('invoice_amount')} type="number" />
                {form.sale_price > 0 && form.invoice_amount >= 0 && (
                  <div style={{ fontSize:11, marginTop:4, color:'#B45309' }}>
                    Saldo: <strong>{fmt(Math.max(0, parseInt(form.sale_price||0) - parseInt(form.invoice_amount||0)))}</strong>
                  </div>
                )}
              </div>
            ) : isAdmin && (
              <Field label="Costo compra distribuidor ($)" value={form.cost_price}
                onChange={set('cost_price')} type="number" />
            )}
            <Field label="Forma de pago" value={form.payment_method} onChange={set('payment_method')}
              opts={[{ v: '', l: '— Forma de pago —' }, ...PAYMENT_TYPES.map(p => ({ v: p, l: p }))]} />
            {!isRes && (
              <Field label="Tipo de entrega" value={form.sale_type}
                onChange={set('sale_type')} opts={SALE_TYPES} />
            )}
          </div>
          {!isRes && (
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
          )}
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
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n));
}

function fmtDateDoc(s) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

const CARD_METHODS = ['Tarjeta Débito', 'Tarjeta Crédito'];
const isTarjeta   = (m) => CARD_METHODS.includes(m);

const PAY_MODES = [
  { v: '',                l: '— Seleccionar —' },
  { v: 'Contado',         l: 'Contado (efectivo)' },
  { v: 'Transferencia',   l: 'Transferencia bancaria' },
  { v: 'Tarjeta Débito',  l: 'Tarjeta Débito (+2%)' },
  { v: 'Tarjeta Crédito', l: 'Tarjeta Crédito (+2%)' },
  { v: 'Crédito Autofin', l: 'Crédito Autofin' },
  { v: 'Financiamiento',  l: 'Financiamiento (con pie)' },
  { v: 'Mixto',           l: 'Mixto / Varias transferencias' },
];

function computeTotals({ sale_price, accessories = [], discount = '', payMode = '', finPct = '', payLines = [], inscripcion = false }) {
  const motoAmt  = Number(sale_price) || 0;
  const accAmt   = accessories.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const inscAmt  = inscripcion ? INSCRIPCION_AMT : 0;
  const subtotal = motoAmt + accAmt + inscAmt;
  const discAmt  = discount ? Math.round(subtotal * Number(discount) / 100) : 0;
  const netTotal = subtotal - discAmt;

  let cardSurcharge = 0;
  if (payMode === 'Mixto') {
    cardSurcharge = payLines.reduce((s, l) =>
      s + (isTarjeta(l.method) ? Math.round((Number(l.amount) || 0) * 0.02) : 0), 0);
  } else if (isTarjeta(payMode)) {
    cardSurcharge = Math.round(netTotal * 0.02);
  }

  const grandTotal = netTotal + cardSurcharge;
  let abonoAmt = grandTotal;
  if (payMode === 'Financiamiento') {
    abonoAmt = Math.round(netTotal * (Number(finPct) || 0) / 100);
  } else if (payMode === 'Mixto') {
    abonoAmt = payLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) + cardSurcharge;
  }

  const saldo = Math.max(0, grandTotal - abonoAmt);
  return { motoAmt, accAmt, inscAmt, subtotal, discAmt, netTotal, cardSurcharge, grandTotal, abonoAmt, saldo };
}

async function openNote(data, type) {
  try {
  const isRes = type === 'reserva';
  const safe = (s) => (s || '').replace(/[^a-zA-Z0-9áéíóúñ]/gi, '_').substring(0, 30);
  const fileName = `${isRes ? 'reserva' : 'nota_venta'}_${safe(data.brand)}_${safe(data.client_name)}.pdf`;
  const t = computeTotals(data);
  const today = fmtDateDoc(data.sold_at || new Date().toISOString().slice(0, 10));
  const isEmpresa = data.client_type === 'empresa';
  const docLabel = isRes ? 'NOTA DE RESERVA' : 'NOTA DE VENTA';

  // Para reserva con abono explícito, ajustar totales
  if (isRes && data.abono != null && data.abono >= 0) {
    t.abonoAmt = data.abono;
    t.saldo = Math.max(0, t.grandTotal - t.abonoAmt);
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14;
  const cw = W - M * 2;
  const orange = [242, 129, 0];
  const dark = [17, 17, 17];
  const gray = [110, 110, 110];
  const lightGray = [218, 218, 218];
  const colW = (cw - 6) / 2; // columna para cliente / vehículo

  let y = M;

  // ── HEADER: logo izquierda + caja doc derecha ──
  // Logo — canvas con fondo blanco antes de dibujar para eliminar transparencia→negro
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => res(i); i.onerror = rej;
      i.src = window.location.origin + '/logo.png';
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', M, y, 44, 14);
  } catch(_) {
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(...orange);
    doc.text('MAOSBIKE', M, y + 11);
  }

  // Bloque doc tipo — derecha, estilo minimalista con línea naranja izquierda
  const cardW = 62, cardX = W - M - cardW;
  doc.setFillColor(255, 248, 237);
  doc.roundedRect(cardX, y, cardW, 20, 1.5, 1.5, 'F');
  doc.setFillColor(...orange);
  doc.roundedRect(cardX, y, 2.5, 20, 0.5, 0.5, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...orange);
  doc.text(docLabel, cardX + 6, y + 6);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
  doc.text(today, cardX + 6, y + 12);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray);
  doc.text(`${data.branchName || '—'}  ·  ${data.sellerName || '—'}`, cardX + 6, y + 18);

  y += 26;
  doc.setLineWidth(0.3); doc.setDrawColor(...lightGray);
  doc.line(M, y, W - M, y);
  y += 4;

  // ── CLIENTE y VEHÍCULO: dos tablas side-by-side ──
  const clientPairs = isEmpresa
    ? [['Empresa', data.empresa_name], ['RUT', data.empresa_rut], data.empresa_giro ? ['Giro', data.empresa_giro] : null, ['Representante', data.client_name], (data.empresa_phone||data.client_phone) ? ['Teléfono', data.empresa_phone||data.client_phone] : null, (data.empresa_email||data.client_email) ? ['Correo', data.empresa_email||data.client_email] : null].filter(Boolean)
    : [['Nombre', data.client_name], ['RUT', data.client_rut], data.client_phone ? ['Teléfono', data.client_phone] : null, data.client_email ? ['Correo', data.client_email] : null, data.client_address ? ['Dirección', data.client_address + (data.client_commune ? ', ' + data.client_commune : '')] : null].filter(Boolean);

  const vehiclePairs = [['Marca', data.brand], ['Modelo', data.model], ['Año', data.year], ['Color', data.color], data.chassis ? ['N° Chasis', data.chassis] : null, data.motor_num ? ['N° Motor', data.motor_num] : null].filter(Boolean);

  const infoTableStyles = {
    styles: { fontSize: 8.5, cellPadding: [2.5, 3], lineColor: lightGray, lineWidth: 0.2, textColor: dark },
    headStyles: { fillColor: [245, 245, 245], textColor: orange, fontStyle: 'bold', fontSize: 7, cellPadding: [2.5, 3] },
    columnStyles: { 0: { fontStyle: 'normal', textColor: gray, cellWidth: 24 }, 1: { fontStyle: 'bold' } },
    theme: 'grid',
  };

  // Tabla cliente (columna izquierda)
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M + colW + 6 },
    head: [[{ content: isEmpresa ? 'EMPRESA' : 'CLIENTE', colSpan: 2, styles: { fillColor: [245, 245, 245], textColor: orange, fontStyle: 'bold', fontSize: 7, halign: 'left' } }]],
    body: clientPairs,
    ...infoTableStyles,
  });
  const clientEndY = doc.lastAutoTable.finalY;

  // Tabla vehículo (columna derecha)
  autoTable(doc, {
    startY: y,
    margin: { left: M + colW + 6, right: M },
    head: [[{ content: 'VEHÍCULO', colSpan: 2, styles: { fillColor: [245, 245, 245], textColor: orange, fontStyle: 'bold', fontSize: 7, halign: 'left' } }]],
    body: vehiclePairs,
    ...infoTableStyles,
  });
  const vehicleEndY = doc.lastAutoTable.finalY;

  // Foto del modelo — debajo de la tabla vehículo, columna derecha
  let photoBottomY = vehicleEndY;
  if (data.modelPhotoUrl) {
    try {
      const photoImg = await loadImage(data.modelPhotoUrl);
      const imgW = colW, imgH = Math.round(imgW * 0.6);
      doc.addImage(photoImg, 'JPEG', M + colW + 6, vehicleEndY + 2, imgW, imgH, '', 'MEDIUM');
      photoBottomY = vehicleEndY + 2 + imgH;
    } catch(_) {}
  }

  y = Math.max(clientEndY, photoBottomY) + 4;

  // ── TITULAR DEL VEHÍCULO ──
  if (!data.titularSame && data.titular?.name) {
    const titPairs = [['Nombre', data.titular.name], data.titular.rut ? ['RUT', data.titular.rut] : null, data.titular.phone ? ['Teléfono', data.titular.phone] : null].filter(Boolean);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [[{ content: 'TITULAR DEL VEHÍCULO', colSpan: 2, styles: { fillColor: [245, 245, 245], textColor: orange, fontStyle: 'bold', fontSize: 7, halign: 'left' } }]],
      body: titPairs,
      ...infoTableStyles,
      columnStyles: { 0: { fontStyle: 'normal', textColor: gray, cellWidth: 24 }, 1: { fontStyle: 'bold' } },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // ── TABLA DE ITEMS ──
  const tableBody = [
    [`${data.brand || ''} ${data.model || ''} ${data.year ? '(' + data.year + ')' : ''} — ${data.color || ''}`, fmtCLP(t.motoAmt)],
    ...(data.accessories || []).filter(a => a.name && Number(a.amount) > 0).map(a => [a.name, fmtCLP(Number(a.amount))]),
  ];
  if (data.inscripcion) tableBody.push(['Inscripción vehicular', fmtCLP(INSCRIPCION_AMT)]);
  if (t.cardSurcharge > 0) tableBody.push(['Recargo tarjeta de crédito/débito (2%)', '+' + fmtCLP(t.cardSurcharge)]);
  tableBody.push(['TOTAL', fmtCLP(t.grandTotal)]);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Descripción', 'Monto']],
    body: tableBody,
    styles: { fontSize: 9.5, cellPadding: [4, 5], textColor: [30, 58, 95], lineColor: lightGray, lineWidth: 0.2 },
    headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', fontStyle: 'bold', cellWidth: 40 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === tableBody.length - 1) {
        d.cell.styles.fillColor = orange;
        d.cell.styles.textColor = [255, 255, 255];
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 12;
      }
    },
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 4;

  // ── FORMA DE PAGO / ABONO (reserva) ──
  if (isRes && t.grandTotal > 0) {
    doc.setFillColor(255, 248, 237);
    doc.setDrawColor(...lightGray); doc.setLineWidth(0.2);
    doc.roundedRect(M, y, cw, 12, 1, 1, 'FD');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
    doc.text(`Abono inicial: ${fmtCLP(t.abonoAmt)}`, M + 4, y + 5.5);
    const saldoColor = t.saldo > 0 ? [180, 83, 9] : [34, 139, 34];
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...saldoColor);
    doc.text(t.saldo > 0 ? `Saldo pendiente: ${fmtCLP(t.saldo)}` : 'Pagado en su totalidad', W - M - 4, y + 5.5, { align: 'right' });
    if (data.payMode) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray);
      doc.text(`Medio: ${data.payMode}`, M + 4, y + 10);
    }
    y += 17;
  } else if (data.payMode) {
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(...lightGray); doc.setLineWidth(0.2);
    doc.roundedRect(M, y, cw, 9, 1, 1, 'FD');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
    let payText = `Forma de pago: ${data.payMode}`;
    if (data.payMode === 'Mixto') {
      const parts = (data.payLines||[]).filter(l => l.method && Number(l.amount) > 0).map(l => {
        const sur = isTarjeta(l.method) ? Math.round(Number(l.amount) * 0.02) : 0;
        return `${l.method}: ${fmtCLP(Number(l.amount) + sur)}`;
      });
      payText = `Forma de pago: ${parts.join(' / ')}`;
    } else if (data.payMode === 'Financiamiento') {
      const pie = Math.round(t.netTotal * (Number(data.finPct)||0) / 100);
      payText = `Forma de pago: Pie ${data.finPct}% (${fmtCLP(pie)}) — Financiado: ${fmtCLP(t.netTotal - pie)}`;
    }
    doc.text(payText, M + 4, y + 5.5);
    const estado = t.saldo > 0 ? `Saldo pendiente: ${fmtCLP(t.saldo)}` : 'Cancelado en su totalidad';
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(t.saldo > 0 ? 146 : 34, t.saldo > 0 ? 64 : 139, t.saldo > 0 ? 14 : 34);
    doc.text(estado, W - M - 4, y + 5.5, { align: 'right' });
    y += 14;
  }

  // ── OBSERVACIONES ──
  if (data.sale_notes) {
    doc.setFontSize(8); doc.setTextColor(...gray); doc.setFont('helvetica', 'italic');
    doc.text(`Obs.: ${data.sale_notes}`, M, y);
    y += 7;
  }

  // ── CONDICIONES ──
  y += 2;
  doc.setLineWidth(0.2); doc.setDrawColor(...lightGray);
  doc.line(M, y, W - M, y);
  y += 4;
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(70, 70, 70);
  doc.text('Condiciones de venta:', M, y); y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...gray);
  const conds = [
    'El plazo estimado de entrega es de 4 a 5 días hábiles tras completar el pago.',
    'En caso de cancelación por efectivo o transferencia, la devolución se efectúa en 10 a 12 días hábiles.',
    'Los pagos con tarjeta anulados por el cliente serán reembolsados en un máximo de 30 días.',
    'Al pagar con tarjeta de crédito o débito se aplica un recargo del 2% sobre el monto total.',
  ];
  conds.forEach(c => { doc.text('• ' + c, M + 2, y); y += 4; });

  // ── FIRMAS ──
  y += 14;
  doc.setLineWidth(0.3); doc.setDrawColor(80, 80, 80);
  doc.line(M, y, M + 72, y);
  doc.line(W - M - 72, y, W - M, y);
  y += 4;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
  doc.text('Firma del cliente', M, y);
  doc.text('Firma del vendedor', W - M - 72, y);
  y += 4;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray);
  const sigName = isEmpresa
    ? `${data.empresa_name || ''} — RUT: ${data.empresa_rut || ''}`
    : `${data.client_name || ''} — RUT: ${data.client_rut || ''}`;
  doc.text(sigName, M, y);
  doc.text(data.sellerName || '', W - M - 72, y);

  doc.save(fileName);
  } catch (err) {
    console.error('Error generando PDF:', err);
    alert('Error al generar el PDF: ' + err.message);
  }
}

// Helper: cargar imagen como base64 para jsPDF
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Sección label para el formulario ────────────────────────────────────────
const SEC = ({ children }) => (
  <div style={{ gridColumn: '1/-1', fontSize: 9, fontWeight: 800, color: '#94A3B8',
                textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 12,
                paddingBottom: 4, borderBottom: '1px solid #F3F4F6' }}>{children}</div>
);

// ─── Modal: nueva venta/reserva ───────────────────────────────────────────────

function NewSaleModal({ sellers, branches, onClose, onCreated, noteType = 'venta' }) {
  const isReserva = noteType === 'reserva';
  const [step,       setStep]     = useState(0);
  const [hasInvUnit, setHasInvUnit] = useState(null);
  const [invUnits,   setInvUnits] = useState([]);
  const [invSearch,  setInvSearch]= useState('');
  const [selUnit,    setSelUnit]  = useState(null);
  const [savedDoc,   setSavedDoc] = useState(null);
  const [form,       setForm]     = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]   = useState(false);
  const [err,        setErr]      = useState('');

  // Catalog
  const [brands,   setBrands]  = useState([]);
  const [catMods,  setCatMods] = useState([]);
  const [selMod,   setSelMod]  = useState(null);

  // Payment
  const [payMode,  setPayMode] = useState('');
  const [finPct,   setFinPct]  = useState('');
  const [payLines, setPayLines]= useState([{ method: '', amount: '' }]);

  // Extras
  const [accs,           setAccs]          = useState([]);
  const [discount,       setDiscount]      = useState('');
  const [abono,          setAbono]         = useState('');
  const [inclInscripcion,setInclInscripcion]= useState(true);

  // Titular del vehículo
  const [titularSame, setTitularSame] = useState(true);
  const [titular, setTitular] = useState({ name: '', rut: '', phone: '', email: '', address: '', commune: '' });
  const setT = (k) => (v) => setTitular(t => ({ ...t, [k]: v }));

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const resetForm = () => {
    setSelUnit(null); setSelMod(null); setForm({ ...EMPTY_FORM });
    setPayMode(''); setFinPct(''); setPayLines([{ method: '', amount: '' }]);
    setAccs([]); setDiscount(''); setAbono(''); setCatMods([]);
    setTitularSame(true); setTitular({ name: '', rut: '', phone: '', email: '', address: '', commune: '' });
  };

  useEffect(() => { api.getBrands().then(setBrands).catch(() => {}); }, []);

  useEffect(() => {
    if (!form.brand) { setCatMods([]); if (!selUnit) setSelMod(null); return; }
    api.getModels({ brand: form.brand }).then(mods => {
      setCatMods(mods);
      // If we have a selUnit, try to find its model for color photos
      if (selUnit) {
        const m = mods.find(x => x.model?.toUpperCase() === selUnit.model?.toUpperCase());
        if (m) setSelMod(m);
      }
    }).catch(() => {});
  }, [form.brand]);

  useEffect(() => {
    if (hasInvUnit !== true) return;
    api.getInventory({})
      .then(d => setInvUnits(Array.isArray(d) ? d.filter(u => u.status !== 'vendida') : []))
      .catch(() => {});
  }, [hasInvUnit]);

  const pickUnit = (u) => {
    setSelUnit(u);
    setForm(f => ({
      ...f,
      brand: u.brand || '', model: u.model || '', year: u.year || f.year,
      color: u.color || '', chassis: u.chassis || '', motor_num: u.motor_num || '',
      branch_id: u.branch_id || '',
    }));
    // Load catalog model for color photos
    if (u.brand) {
      api.getModels({ brand: u.brand }).then(mods => {
        setCatMods(mods);
        const m = mods.find(x => x.model?.toUpperCase() === u.model?.toUpperCase());
        if (m) setSelMod(m);
      }).catch(() => {});
    }
    setStep(2);
  };

  const pickBrand = (brand) => {
    setForm(f => ({ ...f, brand, model: '', color: '', year: new Date().getFullYear() }));
    setSelMod(null);
  };

  const pickModel = (modelId) => {
    const m = catMods.find(x => String(x.id) === String(modelId));
    if (!m) { setSelMod(null); setForm(f => ({ ...f, model: '', color: '' })); return; }
    setSelMod(m);
    setForm(f => ({ ...f, model: m.model, color: '', year: m.year || f.year }));
  };

  const filteredUnits = invUnits.filter(u => {
    if (!invSearch) return true;
    const q = invSearch.toLowerCase();
    return `${u.brand} ${u.model} ${u.chassis} ${u.color} ${u.branch_name||''}`.toLowerCase().includes(q);
  });

  const colors = Array.isArray(selMod?.colors) ? selMod.colors : [];
  const totals = computeTotals({ sale_price: form.sale_price, accessories: accs, discount, payMode, finPct, payLines, inscripcion: inclInscripcion });

  async function handleCreate() {
    if (!form.brand || !form.model) { setErr('Marca y modelo son obligatorios'); return; }
    if (!form.sold_by) { setErr('Vendedor obligatorio'); return; }
    if (!selUnit && !form.branch_id) { setErr('Sucursal obligatoria'); return; }
    if (!selUnit && !form.color) { setErr('Color obligatorio'); return; }
    setSaving(true); setErr('');
    try {
      const clientExtra = [
        form.client_type === 'empresa'
          ? `Empresa: ${form.empresa_name||''} RUT: ${form.empresa_rut||''}`
          : null,
        form.client_phone   ? `Tel: ${form.client_phone}` : null,
        form.client_email   ? `Email: ${form.client_email}` : null,
        form.client_address ? `Dir: ${form.client_address}${form.client_commune ? ', ' + form.client_commune : ''}` : null,
        form.sale_notes     || null,
      ].filter(Boolean).join(' | ');

      if (selUnit && !isReserva) {
        await api.sellInventory(selUnit.id, {
          sold_by: form.sold_by, sold_at: form.sold_at || null,
          ticket_id: form.ticket_id || null, payment_method: payMode || null,
          sale_type: form.sale_type || null, sale_notes: clientExtra || null,
          client_name: form.client_name || null, client_rut: form.client_rut || null,
          sale_price: form.sale_price ? parseInt(form.sale_price) : null,
        });
      } else if (selUnit && isReserva) {
        await api.updateInventory(selUnit.id, {
          status: 'reservada',
          notes: clientExtra || null,
          sold_by: form.sold_by || null,
          sale_price: form.sale_price ? parseInt(form.sale_price) : null,
          invoice_amount: abono ? parseInt(abono) : null,
          sale_notes: clientExtra || null,
          client_name: form.client_name || null,
          client_rut: form.client_rut || null,
          payment_method: payMode || null,
        });
      } else {
        // Nota de venta o reserva sin unidad de inventario → solo registrar en ventas
        await api.createSale({ ...form, payment_method: payMode || null, sale_notes: clientExtra || null });
      }

      const sellerObj   = sellers.find(s => String(s.id) === String(form.sold_by));
      const branchObj   = branches.find(b => String(b.id) === String(selUnit?.branch_id || form.branch_id));
      const colorPhotos  = Array.isArray(selMod?.color_photos) ? selMod.color_photos : [];
      const selectedColor = (selUnit?.color || form.color || '').toLowerCase().trim();
      const colorPhotoUrl = colorPhotos.find(cp =>
        (cp.color||'').toLowerCase().trim() === selectedColor
      )?.url || selMod?.image || selMod?.image_gallery?.[0] || null;

      setSavedDoc({
        brand:      selUnit?.brand     || form.brand,
        model:      selUnit?.model     || form.model,
        year:       selUnit?.year      || form.year,
        color:      selUnit?.color     || form.color,
        chassis:    selUnit?.chassis   || form.chassis,
        motor_num:  selUnit?.motor_num || form.motor_num,
        sold_at:    form.sold_at,
        branchName: branchObj?.name || selUnit?.branch_name || '',
        sellerName: sellerObj ? `${sellerObj.first_name} ${sellerObj.last_name}`.trim() : '',
        client_type:    form.client_type,
        client_name:    form.client_name,    client_rut:     form.client_rut,
        client_phone:   form.client_phone,   client_email:   form.client_email,
        client_address: form.client_address, client_commune: form.client_commune,
        empresa_name:   form.empresa_name,   empresa_rut:    form.empresa_rut,
        empresa_giro:   form.empresa_giro,   empresa_email:  form.empresa_email,
        empresa_phone:  form.empresa_phone,
        sale_notes: form.sale_notes,
        sale_price: form.sale_price,
        abono: abono ? parseInt(abono) : 0,
        accessories: accs, discount, payMode, payLines, finPct, inscripcion: inclInscripcion,
        modelPhotoUrl: colorPhotoUrl,
        titularSame,
        titular: titularSame ? null : { ...titular },
      });
      setStep(3);
      onCreated();
    } catch (e) { setErr(e.message || 'Error al registrar'); setSaving(false); }
  }

  const modalTitle = isReserva ? 'Nueva nota de reserva' : 'Nueva nota de venta';

  return (
    <Modal onClose={onClose} title={modalTitle} wide>

      {/* STEP 0 */}
      {step === 0 && (
        <div style={{ textAlign: 'center', padding: '28px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
            ¿La unidad ya está cargada en inventario?
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 28 }}>
            Si está en stock podés asociarla directamente.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => { setHasInvUnit(true); setStep(1); }}
              style={{ padding: '12px 28px', borderRadius: 10, border: '2px solid #0F172A',
                       background: '#0F172A', color: '#fff', fontSize: 14, fontWeight: 700,
                       cursor: 'pointer', fontFamily: 'inherit' }}>
              Sí, está en stock
            </button>
            <button onClick={() => { setHasInvUnit(false); setStep(2); }}
              style={{ padding: '12px 28px', borderRadius: 10, border: '2px solid #E5E7EB',
                       background: '#F9FAFB', color: '#374151', fontSize: 14, fontWeight: 700,
                       cursor: 'pointer', fontFamily: 'inherit' }}>
              No, ingresar datos
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: Inventory */}
      {step === 1 && (
        <div>
          <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', marginBottom: 12, padding: 0, fontFamily: 'inherit' }}>← Volver</button>
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
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
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

      {/* STEP 2: Form */}
      {step === 2 && (
        <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button onClick={() => { resetForm(); setStep(0); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', padding: 0, fontFamily: 'inherit' }}>
              ← Volver
            </button>
            {selUnit && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '4px 12px' }}>
                Unidad: {selUnit.brand} {selUnit.model}{selUnit.chassis ? ` · ${selUnit.chassis}` : ''}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

            {/* MOTO */}
            {!selUnit && (
              <>
                <SEC>Moto</SEC>
                <Field label="Marca *"
                  value={form.brand}
                  opts={[{ v: '', l: '— Seleccionar marca —' }, ...brands.map(b => ({ v: b, l: b }))]}
                  onChange={pickBrand} />
                <Field label="Modelo *"
                  value={selMod?.id || ''}
                  opts={[{ v: '', l: form.brand ? (catMods.length ? '— Seleccionar modelo —' : 'Sin modelos en catálogo') : '— Primero seleccione una marca —' },
                         ...catMods.map(m => ({ v: m.id, l: `${m.model}${m.year ? ' ' + m.year : ''}` }))]}
                  onChange={pickModel}
                  disabled={!form.brand} />
                <Field label="Año" value={form.year} onChange={set('year')} type="number" />
                <Field label="Color *"
                  value={form.color}
                  opts={colors.length ? [{ v: '', l: '— Seleccionar color —' }, ...colors.map(c => ({ v: c, l: c }))] : undefined}
                  onChange={set('color')}
                  ph={colors.length ? undefined : 'Ej. Negro'} />
                <Field label="N° Chasis (opcional)" value={form.chassis} onChange={set('chassis')} ph="9CDKDE0…" />
                <Field label="N° Motor (opcional)"  value={form.motor_num} onChange={set('motor_num')} />
              </>
            )}

            {/* CLIENTE */}
            <SEC>Datos del cliente</SEC>
            {/* Tipo: persona / empresa */}
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, marginBottom: 4 }}>
              {['persona', 'empresa'].map(t => (
                <button key={t} type="button" onClick={() => set('client_type')(t)}
                  style={{ padding: '5px 16px', borderRadius: 20, border: `1.5px solid ${form.client_type === t ? '#F28100' : '#E5E7EB'}`,
                           background: form.client_type === t ? '#FFF7ED' : '#fff',
                           color: form.client_type === t ? '#F28100' : '#6B7280',
                           fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {t === 'persona' ? 'Persona natural' : 'Empresa'}
                </button>
              ))}
            </div>
            {form.client_type === 'empresa' ? (
              <>
                <Field label="Nombre empresa *"  value={form.empresa_name}  onChange={set('empresa_name')} />
                <Field label="RUT empresa *"      value={form.empresa_rut}   onChange={set('empresa_rut')}  ph="76.XXX.XXX-X" />
                <Field label="Giro"               value={form.empresa_giro}  onChange={set('empresa_giro')} />
                <Field label="Representante"      value={form.client_name}   onChange={set('client_name')} />
                <Field label="Teléfono empresa"   value={form.empresa_phone} onChange={set('empresa_phone')} ph="+56 2 XXXX XXXX" />
                <Field label="Email empresa"      value={form.empresa_email} onChange={set('empresa_email')} />
              </>
            ) : (
              <>
                <Field label="Nombre completo *" value={form.client_name}    onChange={set('client_name')} />
                <Field label="RUT"               value={form.client_rut}     onChange={set('client_rut')}  ph="12.345.678-9" />
                <Field label="Teléfono"          value={form.client_phone}   onChange={set('client_phone')} ph="+56 9 XXXX XXXX" />
                <Field label="Email"             value={form.client_email}   onChange={set('client_email')} />
                <Field label="Dirección"         value={form.client_address} onChange={set('client_address')} />
                <Field label="Dirección"         value={form.client_address} onChange={set('client_address')} />
                <Field label="Comuna"            value={form.client_commune} onChange={set('client_commune')} />
              </>
            )}

            {/* TITULAR */}
            <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
                ¿La moto quedará a nombre de quien está haciendo la compra?
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: titularSame ? 0 : 12 }}>
                {[{ v: true, l: 'Sí' }, { v: false, l: 'No' }].map(opt => (
                  <button key={String(opt.v)} type="button" onClick={() => setTitularSame(opt.v)}
                    style={{ padding: '5px 20px', borderRadius: 20,
                             border: `1.5px solid ${titularSame === opt.v ? '#F28100' : '#E5E7EB'}`,
                             background: titularSame === opt.v ? '#FFF7ED' : '#fff',
                             color: titularSame === opt.v ? '#F28100' : '#6B7280',
                             fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {opt.l}
                  </button>
                ))}
              </div>
              {!titularSame && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <Field label="Nombre completo titular *" value={titular.name}    onChange={setT('name')} />
                  <Field label="RUT titular *"             value={titular.rut}     onChange={setT('rut')}     ph="12.345.678-9" />
                  <Field label="Teléfono"                  value={titular.phone}   onChange={setT('phone')}   ph="+56 9 XXXX XXXX" />
                  <Field label="Correo"                    value={titular.email}   onChange={setT('email')} />
                  <Field label="Dirección"                 value={titular.address} onChange={setT('address')} />
                  <Field label="Comuna"                    value={titular.commune} onChange={setT('commune')} />
                </div>
              )}
            </div>

            {/* OPERACIÓN */}
            <SEC>{isReserva ? 'Reserva' : 'Venta'}</SEC>
            <Field label="Vendedor *" value={form.sold_by}
              opts={[{ v: '', l: '— Seleccionar vendedor —' }, ...sellers.map(s => ({ v: s.id, l: `${s.first_name} ${s.last_name}`.trim() }))]}
              onChange={set('sold_by')} />
            <Field label="Sucursal *" value={form.branch_id}
              opts={[{ v: '', l: '— Sucursal —' }, ...branches.map(b => ({ v: b.id, l: b.name }))]}
              onChange={set('branch_id')} />
            <Field label={isReserva ? 'Fecha reserva' : 'Fecha venta'} value={form.sold_at} onChange={set('sold_at')} type="date" />
            {!isReserva && (
              <Field label="Tipo de entrega" value={form.sale_type} onChange={set('sale_type')} opts={SALE_TYPES} />
            )}

            {/* PRECIO */}
            <SEC>Precio</SEC>
            <Field label="Precio de la moto ($)" value={form.sale_price} onChange={set('sale_price')} type="number" />
            {isReserva && (
              <>
                <Field label="Abono inicial ($)" value={abono} onChange={setAbono} type="number" ph="0" />
                {form.sale_price > 0 && abono > 0 && (
                  <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                    <span style={{ color: '#92400E' }}>Abono: <strong>{fmtCLP(Number(abono))}</strong></span>
                    <span style={{ color: '#B45309', fontWeight: 700 }}>Saldo pendiente: {fmtCLP(Math.max(0, Number(form.sale_price) - Number(abono)))}</span>
                  </div>
                )}
              </>
            )}

            {/* INSCRIPCIÓN */}
            <div style={{ gridColumn: '1/-1' }}>
              <div
                onClick={() => setInclInscripcion(p => !p)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, cursor:'pointer',
                  background: inclInscripcion ? 'rgba(5,150,105,0.06)' : '#F9FAFB',
                  border: `1px solid ${inclInscripcion ? 'rgba(5,150,105,0.3)' : '#E5E7EB'}`,
                  transition:'all 0.15s' }}>
                <div style={{ width:18, height:18, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  border: inclInscripcion ? 'none' : '2px solid #333',
                  background: inclInscripcion ? '#059669' : 'transparent' }}>
                  {inclInscripcion && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color: inclInscripcion ? '#065F46' : '#374151' }}>
                    Incluir inscripción vehicular — {fmtCLP(INSCRIPCION_AMT)}
                  </div>
                  <div style={{ fontSize:11, color:'#6B7280' }}>
                    Se agrega como ítem desglosado en la nota
                  </div>
                </div>
              </div>
            </div>

            {/* ACCESORIOS */}
            <div style={{ gridColumn: '1/-1' }}>
              <SEC>Accesorios</SEC>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {accs.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input value={a.name} onChange={e => setAccs(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Descripción accesorio" style={{ ...S.inp, flex: 2, fontSize: 12 }} />
                    <input value={a.amount} type="number" onChange={e => setAccs(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                      placeholder="Monto $" style={{ ...S.inp, flex: 1, fontSize: 12 }} />
                    <button onClick={() => setAccs(p => p.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18, padding: '0 4px', flexShrink: 0, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
                <button onClick={() => setAccs(p => [...p, { name: '', amount: '' }])}
                  style={{ ...S.btn2, fontSize: 11, padding: '5px 12px', alignSelf: 'flex-start' }}>
                  + Agregar accesorio
                </button>
              </div>
            </div>

            {/* FORMA DE PAGO */}
            <div style={{ gridColumn: '1/-1' }}>
              <SEC>Forma de pago</SEC>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <Field label="Medio de pago" value={payMode} opts={PAY_MODES}
                    onChange={v => { setPayMode(v); setPayLines([{ method: '', amount: '' }]); setFinPct(''); }} />
                </div>

                {isTarjeta(payMode) && totals.netTotal > 0 && (
                  <div style={{ gridColumn: '1/-1', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
                    Recargo 2% tarjeta: <strong>+{fmtCLP(totals.cardSurcharge)}</strong> — Total con recargo: <strong>{fmtCLP(totals.grandTotal)}</strong>
                  </div>
                )}

                {payMode === 'Financiamiento' && (
                  <>
                    <Field label="% Pie inicial" value={finPct} onChange={setFinPct} type="number" ph="30" />
                    {finPct && totals.netTotal > 0 && (
                      <div style={{ gridColumn: '1/-1', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#065F46' }}>
                        Pie ({finPct}%): <strong>{fmtCLP(totals.abonoAmt)}</strong> · A financiar: <strong>{fmtCLP(totals.grandTotal - totals.abonoAmt)}</strong>
                      </div>
                    )}
                  </>
                )}

                {payMode === 'Mixto' && (
                  <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {payLines.map((l, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={l.method} onChange={e => setPayLines(p => p.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}
                          style={{ ...S.inp, flex: '2 1 120px', fontSize: 12 }}>
                          <option value="">— Forma —</option>
                          {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input value={l.amount} type="number" onChange={e => setPayLines(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                          placeholder="Monto $" style={{ ...S.inp, flex: '1 1 80px', fontSize: 12 }} />
                        {isTarjeta(l.method) && Number(l.amount) > 0 && (
                          <span style={{ fontSize: 10, color: '#B45309', whiteSpace: 'nowrap' }}>
                            +2% = {fmtCLP(Math.round(Number(l.amount) * 0.02))}
                          </span>
                        )}
                        {payLines.length > 1 && (
                          <button onClick={() => setPayLines(p => p.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18, padding: '0 4px', flexShrink: 0, lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setPayLines(p => [...p, { method: '', amount: '' }])}
                      style={{ ...S.btn2, fontSize: 11, padding: '5px 12px', alignSelf: 'flex-start' }}>
                      + Agregar línea de pago
                    </button>
                    {totals.grandTotal > 0 && (
                      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                        Abono: <strong>{fmtCLP(totals.abonoAmt)}</strong> · Saldo: <strong style={{ color: totals.saldo > 0 ? '#B45309' : '#065F46' }}>{fmtCLP(totals.saldo)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RESUMEN */}
            {totals.grandTotal > 0 && (
              <div style={{ gridColumn: '1/-1', background: '#0F172A', borderRadius: 10, padding: '12px 16px', marginTop: 4 }}>
                {[
                  ['Precio moto', fmtCLP(totals.motoAmt), '#CBD5E1'],
                  totals.accAmt > 0  ? [`Accesorios`, fmtCLP(totals.accAmt), '#CBD5E1'] : null,
                  totals.discAmt > 0 ? [`Descuento ${discount}%`, `−${fmtCLP(totals.discAmt)}`, '#10B981'] : null,
                  totals.cardSurcharge > 0 ? [`Recargo tarjeta 2%`, `+${fmtCLP(totals.cardSurcharge)}`, '#FCD34D'] : null,
                ].filter(Boolean).map(([lbl, val, clr]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>
                    <span>{lbl}</span><span style={{ color: clr }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 15, fontWeight: 900, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4 }}>
                  <span>TOTAL</span><span style={{ color: '#F28100' }}>{fmtCLP(totals.grandTotal)}</span>
                </div>
                {totals.saldo > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#FCD34D', fontSize: 11, marginTop: 4 }}>
                    <span>Saldo pendiente</span><span>{fmtCLP(totals.saldo)}</span>
                  </div>
                )}
              </div>
            )}

            {/* OBSERVACIONES */}
            <div style={{ gridColumn: '1/-1', marginTop: 4 }}>
              <Field label="Observaciones" value={form.sale_notes} onChange={set('sale_notes')} rows={2} />
            </div>
          </div>

          {err && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 10, padding: '6px 10px', background: '#FEF2F2', borderRadius: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={handleCreate} disabled={saving} style={{ ...S.btn, flex: 1 }}>
              {saving ? 'Registrando…' : isReserva ? 'Registrar reserva' : 'Registrar venta'}
            </button>
            <button onClick={onClose} style={{ ...S.btn2, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* STEP 3: Documento */}
      {step === 3 && savedDoc && (
        <div style={{ textAlign: 'center', padding: '28px 12px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
            {isReserva ? 'Reserva registrada' : 'Venta registrada'}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 20 }}>
            El documento está listo para imprimir o descargar como PDF.
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', marginBottom: 20, textAlign: 'left' }}>
            {[
              ['Cliente',  savedDoc.client_name || '—'],
              ['RUT',      savedDoc.client_rut  || '—'],
              ['Moto',     `${savedDoc.brand} ${savedDoc.model} ${savedDoc.year || ''}`.trim()],
              ['Color',    savedDoc.color || '—'],
              ['Sucursal', savedDoc.branchName  || '—'],
              ['Total',    fmtCLP(computeTotals(savedDoc).grandTotal)],
              computeTotals(savedDoc).saldo > 0 ? ['Saldo', fmtCLP(computeTotals(savedDoc).saldo)] : null,
            ].filter(Boolean).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: 10, color: '#94A3B8', minWidth: 70 }}>{l}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => openNote(savedDoc, noteType)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F28100', border: 'none', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '12px 24px', boxShadow: '0 4px 12px rgba(242,129,0,.35)', fontFamily: 'inherit' }}>
              Descargar PDF
            </button>
            <button onClick={onClose}
              style={{ background: '#fff', border: '1.5px solid #CBD5E1', color: '#374151', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '12px 20px', fontFamily: 'inherit' }}>
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
  const [fType,          setFType]          = useState('');  // '' | 'vendida' | 'reservada'
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
      if (fType)    params.status    = fType;

      const [salesRes, statsRes] = await Promise.all([
        api.getSales(params),
        api.getSalesStats({ from: fromDate, to: toDate, branch_id: fBranch,
                            ...(isAdmin && fSeller ? { seller_id: fSeller } : {}) }),
      ]);
      setSales(salesRes.data || []);
      setStats(statsRes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [q, fromDate, toDate, fBranch, fSeller, fType, isAdmin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isAdmin) api.getSellers().then(s => setSellers(s || [])).catch(() => {});
  }, [isAdmin]);

  const hasFilters = q || fromDate || toDate || fBranch || fSeller || fType;
  const clearFilters = () => { setQ(''); setFromDate(''); setToDate(''); setFBranch(''); setFSeller(''); setFType(''); };

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

      {/* ── Filtro tipo (Todas / Reservas / Ventas) ── */}
      <div style={{ display:'flex', gap:6, marginBottom:12 }}>
        {[['','Todas','#6B7280'],['reservada','Reservas','#B45309'],['vendida','Ventas','#065F46']].map(([v,l,c])=>(
          <button key={v} onClick={()=>setFType(v)}
            style={{ padding:'7px 18px', borderRadius:8, border:`1.5px solid ${fType===v?c:'#E5E7EB'}`,
              background: fType===v ? (v==='reservada'?'#FFFBEB':v==='vendida'?'#ECFDF5':'#F1F5F9') : '#fff',
              color: fType===v?c:'#6B7280', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit',
              transition:'all 0.12s' }}>
            {l}
          </button>
        ))}
      </div>

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
                ['Tipo',        'center', 'nowrap'],
                ['Fecha',       'left',   'nowrap'],
                ['Cliente',     'left',   'nowrap'],
                ['Vendedor',    'left',   'nowrap'],
                ...(isAdmin ? [['Sucursal', 'left', 'nowrap']] : []),
                ['Moto',        'left',   'nowrap'],
                ['Chasis',      'left',   'nowrap'],
                ['Precio / Abono', 'right', 'nowrap'],
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
              const isRes = s.status === 'reservada';
              const sellerName = s.seller_fn ? `${s.seller_fn} ${s.seller_ln || ''}`.trim() : '—';
              const docsOk = !!(s.doc_factura_cli && s.doc_homologacion && s.doc_inscripcion);
              const docCount = [s.doc_factura_dist, s.doc_factura_cli, s.doc_homologacion, s.doc_inscripcion].filter(Boolean).length;
              const saldo = s.sale_price > 0 ? Math.max(0, s.sale_price - (s.invoice_amount || 0)) : null;
              const bgRow = isRes ? '#FFFDF5' : 'transparent';
              return (
                <tr key={s.id}
                  onClick={() => setSelSale(s)}
                  style={{ borderBottom: `1px solid ${isRes ? '#FEF3C7' : '#F3F4F6'}`, background: bgRow, transition: 'background 0.1s', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = isRes ? '#FEF9EC' : '#FAFBFF'}
                  onMouseLeave={e => e.currentTarget.style.background = bgRow}>

                  {/* Tipo */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {isRes ? (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 6,
                        background: '#FFFBEB', color: '#B45309', border: '1px solid #FCD34D',
                        textTransform: 'uppercase', letterSpacing: '0.06em' }}>RESERVA</span>
                    ) : (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 6,
                        background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0',
                        textTransform: 'uppercase', letterSpacing: '0.06em' }}>VENTA</span>
                    )}
                  </td>

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
                      {s.added_as_sold && (
                        <div style={{ marginTop: 2, fontSize: 9, fontWeight: 700, color: '#7C3AED',
                                      background: '#EDE9FE', borderRadius: 4, padding: '1px 5px',
                                      display: 'inline-block', letterSpacing: '0.05em' }}>
                          BODEGA DIRECTA
                        </div>
                      )}
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

                  {/* Precio / Abono */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700, color: s.sale_price ? '#0F172A' : '#D1D5DB' }}>
                      {s.sale_price ? fmt(s.sale_price) : '—'}
                    </div>
                    {isRes && s.sale_price > 0 && (
                      <div style={{ fontSize: 10, marginTop: 2 }}>
                        <span style={{ color: '#059669' }}>+{fmt(s.invoice_amount || 0)}</span>
                        {' '}
                        <span style={{ color: saldo > 0 ? '#DC2626' : '#059669', fontWeight: 700 }}>
                          {saldo > 0 ? `falta ${fmt(saldo)}` : '✓ saldado'}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Estado pago distribuidor */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {isRes ? <span style={{ color: '#D1D5DB', fontSize: 11 }}>—</span> : <DistributorBadge paid={s.distributor_paid} />}
                  </td>

                  {/* Entregada */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {isRes ? <span style={{ color: '#D1D5DB', fontSize: 11 }}>—</span> : <StatusDot ok={s.delivered} />}
                  </td>

                  {/* Docs (resumen n/4) */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {isRes ? <span style={{ color: '#D1D5DB', fontSize: 11 }}>—</span> : (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: docsOk ? '#ECFDF5' : docCount > 0 ? '#FFFBEB' : '#F9FAFB',
                        color: docsOk ? '#065F46' : docCount > 0 ? '#92400E' : '#9CA3AF',
                        border: `1px solid ${docsOk ? '#A7F3D0' : docCount > 0 ? '#FCD34D' : '#E5E7EB'}`,
                      }}>
                        {docCount}/4
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                      {/* Descargar doc */}
                      <button title={isRes ? 'Ver nota de reserva' : 'Ver nota de venta'}
                        onClick={() => openNote({
                          brand: s.brand, model: s.model, year: s.year, color: s.color,
                          chassis: s.chassis, motor_num: s.motor_num, sold_at: s.sold_at,
                          branchName: s.branch_name || '', sellerName: s.seller_fn ? `${s.seller_fn} ${s.seller_ln||''}`.trim() : '',
                          client_name: s.client_name||'', client_rut: s.client_rut||'', client_type:'persona',
                          sale_price: s.sale_price, abono: s.invoice_amount||0,
                          accessories:[], discount:'', payMode: s.payment_method||'', payLines:[], finPct:'',
                          sale_notes: s.sale_notes, titularSame:true, titular:null,
                        }, isRes ? 'reserva' : 'venta')}
                        style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #E2E8F0', background:'transparent',
                                 color:'#6B7280', cursor:'pointer', lineHeight:1, display:'inline-flex', alignItems:'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                        </svg>
                      </button>
                      {/* Eliminar (super_admin) */}
                      {isSuperAdmin && confirmDeleteId === s.id ? (
                        <>
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
                        </>
                      ) : isSuperAdmin ? (
                        <button onClick={() => setConfirmDeleteId(s.id)} title="Eliminar"
                          style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #FECACA', background: 'transparent',
                                   color: '#FCA5A5', cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                          </svg>
                        </button>
                      ) : null}
                    </span>
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
          {sales.filter(s=>s.status==='vendida').length} venta{sales.filter(s=>s.status==='vendida').length!==1?'s':''} · {sales.filter(s=>s.status==='reservada').length} reserva{sales.filter(s=>s.status==='reservada').length!==1?'s':''}
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
