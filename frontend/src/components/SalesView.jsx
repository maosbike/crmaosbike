import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Stat, Modal, Field, fmt, fD, PAYMENT_TYPES } from '../ui.jsx';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SALE_TYPES = [
  { v: '',           l: '— Seleccionar —' },
  { v: 'inscripcion', l: 'Solo inscripción' },
  { v: 'completa',    l: 'Documentación completa' },
];

const DOC_LABELS = {
  doc_factura_dist: 'Factura distribuidor',
  doc_factura_cli:  'Factura cliente',
  doc_homologacion: 'Homologación',
  doc_inscripcion:  'Inscripción',
};

const CAN_CREATE  = ['super_admin', 'backoffice'];
const CAN_ADMIN   = ['super_admin', 'admin_comercial', 'backoffice'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Check({ ok }) {
  if (ok) return <Ic.check size={15} color="#10B981" />;
  return <span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid #D1D5DB', borderRadius: 3 }} />;
}

function DocBadge({ url, label }) {
  if (url) return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#10B981', fontWeight: 600, fontSize: 11, textDecoration: 'none' }}>
      <Ic.file size={13} color="#10B981" /> Ver
    </a>
  );
  return <span style={{ color: '#D1D5DB', fontSize: 11 }}>—</span>;
}

const EMPTY_FORM = {
  brand: '', model: '', year: new Date().getFullYear(), chassis: '', motor_num: '',
  color: '', price: '', sale_price: '', cost_price: '', invoice_amount: '',
  sold_by: '', branch_id: '', sold_at: new Date().toISOString().slice(0, 10),
  ticket_id: '', payment_method: '', sale_type: '', sale_notes: '',
  delivered: false, client_name: '', client_rut: '',
};

// ─── Modal: detalle / edición de venta ────────────────────────────────────────

function SaleDetailModal({ sale, user, onClose, onUpdated, sellers, branches }) {
  const isAdmin = CAN_ADMIN.includes(user.role);
  const canEdit = CAN_CREATE.includes(user.role);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [uploading, setUploading] = useState('');

  useEffect(() => {
    setForm({
      sale_price:     sale.sale_price     || '',
      cost_price:     sale.cost_price     || '',
      invoice_amount: sale.invoice_amount || '',
      sale_type:      sale.sale_type      || '',
      payment_method: sale.payment_method || '',
      sale_notes:     sale.sale_notes     || '',
      delivered:      !!sale.delivered,
      client_name:    sale.client_name    || '',
      client_rut:     sale.client_rut     || '',
    });
  }, [sale]);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      await api.updateSale(sale.id, form);
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message); }
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

  const Row = ({ label, val }) => (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ color: '#6B7280', fontSize: 12, minWidth: 160 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{val || '—'}</span>
    </div>
  );

  return (
    <Modal onClose={onClose} title={`Venta · ${sale.brand} ${sale.model} · ${sale.chassis}`} wide>
      {/* Datos fijos de la unidad */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginBottom: 16 }}>
        <Row label="Marca / Modelo"  val={`${sale.brand} ${sale.model}`} />
        <Row label="Año"             val={sale.year} />
        <Row label="Chasis"          val={sale.chassis} />
        <Row label="Color"           val={sale.color} />
        <Row label="Vendedor"        val={sale.seller_fn ? `${sale.seller_fn} ${sale.seller_ln}` : '—'} />
        <Row label="Sucursal"        val={sale.branch_name} />
        <Row label="Fecha venta"     val={fD(sale.sold_at)} />
        <Row label="Cliente"         val={sale.client_name} />
        {sale.client_rut && <Row label="RUT cliente" val={sale.client_rut} />}
        {sale.ticket_num  && <Row label="Ticket" val={sale.ticket_num} />}
      </div>

      {/* Campos editables */}
      {!editing ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginBottom: 16 }}>
            <Row label="Precio venta"      val={fmt(sale.sale_price)} />
            {isAdmin && <Row label="Costo distribuidor" val={fmt(sale.cost_price)} />}
            {isAdmin && <Row label="Facturado dist."    val={fmt(sale.invoice_amount)} />}
            <Row label="Forma de pago"     val={sale.payment_method} />
            <Row label="Modalidad documental"  val={SALE_TYPES.find(s => s.v === sale.sale_type)?.l || sale.sale_type} />
            <Row label="Entregada"         val={sale.delivered ? 'Sí' : 'No'} />
          </div>
          {sale.sale_notes && (
            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: '#374151' }}>
              {sale.sale_notes}
            </div>
          )}
          {/* Documentos */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>Documentos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              {Object.entries(DOC_LABELS).map(([field, label]) => (
                <div key={field} style={{ ...S.card, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12 }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DocBadge url={sale[field]} />
                    {canEdit && (
                      <label style={{ cursor: 'pointer' }}>
                        <input type="file" style={{ display: 'none' }} accept=".jpg,.jpeg,.png,.webp,.pdf"
                          onChange={e => handleDocUpload(field, e.target.files[0])} />
                        {uploading === field
                          ? <span style={{ fontSize: 11, color: '#6B7280' }}>↑</span>
                          : <Ic.upload size={14} color="#6B7280" />}
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {canEdit && (
            <button onClick={() => setEditing(true)} style={{ ...S.btn2, width: '100%' }}>
              Editar seguimiento
            </button>
          )}
        </>
      ) : (
        /* Formulario de edición */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Precio venta al cliente" value={form.sale_price} onChange={set('sale_price')} type="number" />
            {isAdmin && <Field label="Costo compra distribuidor" value={form.cost_price} onChange={set('cost_price')} type="number" />}
            {isAdmin && <Field label="Monto facturado distribuidor" value={form.invoice_amount} onChange={set('invoice_amount')} type="number" />}
            <Field label="Forma de pago" value={form.payment_method} onChange={set('payment_method')}
              opts={[{ v: '', l: '— Forma de pago —' }, ...PAYMENT_TYPES.map(p => ({ v: p, l: p }))]} />
            <Field label="Modalidad documental" value={form.sale_type} onChange={set('sale_type')} opts={SALE_TYPES} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="delivered" checked={!!form.delivered}
              onChange={e => setForm(f => ({ ...f, delivered: e.target.checked }))} />
            <label htmlFor="delivered" style={{ fontSize: 13 }}>Moto entregada al cliente</label>
          </div>
          <Field label="Nombre cliente (si no hay ticket)" value={form.client_name} onChange={set('client_name')} />
          <Field label="RUT cliente" value={form.client_rut} onChange={set('client_rut')} />
          <Field label="Observaciones" value={form.sale_notes} onChange={set('sale_notes')} rows={3} />
          {err && <div style={{ color: '#EF4444', fontSize: 13 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn, flex: 1 }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => setEditing(false)} style={{ ...S.btn2, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal: nueva venta ───────────────────────────────────────────────────────

function NewSaleModal({ user, sellers, branches, onClose, onCreated }) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  async function handleCreate() {
    if (!form.brand || !form.model || !form.chassis) { setErr('Marca, modelo y chasis son obligatorios'); return; }
    if (!form.sold_by) { setErr('Vendedor obligatorio'); return; }
    setSaving(true); setErr('');
    try {
      await api.createSale(form);
      onCreated();
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal onClose={onClose} title="Registrar venta" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Unidad */}
        <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginTop: 4 }}>Unidad</div>
        <Field label="Marca *"  value={form.brand}  onChange={set('brand')}  ph="YAMAHA" />
        <Field label="Modelo *" value={form.model}  onChange={set('model')}  ph="MT-07" />
        <Field label="Año"      value={form.year}   onChange={set('year')}   type="number" />
        <Field label="Color"    value={form.color}  onChange={set('color')}  ph="Negro" />
        <Field label="N° Chasis *" value={form.chassis}   onChange={set('chassis')}   ph="9CDKDE0…" />
        <Field label="N° Motor"    value={form.motor_num} onChange={set('motor_num')} ph="opcional" />

        {/* Venta */}
        <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginTop: 8 }}>Venta</div>
        <Field label="Vendedor *" value={form.sold_by} onChange={set('sold_by')}
          opts={[{ v: '', l: '— Seleccionar vendedor —' }, ...sellers.map(s => ({ v: s.id, l: `${s.first_name} ${s.last_name}` }))]} />
        <Field label="Sucursal" value={form.branch_id} onChange={set('branch_id')}
          opts={[{ v: '', l: '— Sucursal —' }, ...branches.map(b => ({ v: b.id, l: b.name }))]} />
        <Field label="Fecha venta *" value={form.sold_at} onChange={set('sold_at')} type="date" />
        <Field label="Forma de pago" value={form.payment_method} onChange={set('payment_method')}
          opts={[{ v: '', l: '— Forma de pago —' }, ...PAYMENT_TYPES.map(p => ({ v: p, l: p }))]} />
        <Field label="Modalidad documental" value={form.sale_type} onChange={set('sale_type')} opts={SALE_TYPES} />

        {/* Precios */}
        <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginTop: 8 }}>Precios</div>
        <Field label="Precio lista (ref.)"          value={form.price}          onChange={set('price')}          type="number" />
        <Field label="Precio venta al cliente"      value={form.sale_price}     onChange={set('sale_price')}     type="number" />
        <Field label="Costo compra distribuidor"    value={form.cost_price}     onChange={set('cost_price')}     type="number" />
        <Field label="Monto facturado distribuidor" value={form.invoice_amount} onChange={set('invoice_amount')} type="number" />

        {/* Cliente */}
        <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginTop: 8 }}>Cliente (si no hay ticket vinculado)</div>
        <Field label="Nombre cliente" value={form.client_name} onChange={set('client_name')} />
        <Field label="RUT cliente"    value={form.client_rut}  onChange={set('client_rut')} />
        <Field label="N° Ticket (opcional)" value={form.ticket_id} onChange={set('ticket_id')} ph="UUID del ticket" />

        {/* Entrega y notas */}
        <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <input type="checkbox" id="new_delivered" checked={!!form.delivered}
            onChange={e => setForm(f => ({ ...f, delivered: e.target.checked }))} />
          <label htmlFor="new_delivered" style={{ fontSize: 13 }}>Moto entregada al cliente</label>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <Field label="Observaciones" value={form.sale_notes} onChange={set('sale_notes')} rows={3} />
        </div>
      </div>

      {err && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={handleCreate} disabled={saving} style={{ ...S.btn, flex: 1 }}>
          {saving ? 'Registrando…' : 'Registrar venta'}
        </button>
        <button onClick={onClose} style={{ ...S.btn2, flex: 1 }}>Cancelar</button>
      </div>
    </Modal>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────

export function SalesView({ user, realBranches }) {
  const isAdmin  = CAN_ADMIN.includes(user.role);
  const canCreate = CAN_CREATE.includes(user.role);

  const [sales,    setSales]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [sellers,  setSellers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selSale,  setSelSale]  = useState(null);
  const [showNew,  setShowNew]  = useState(false);

  // Filtros
  const [q,        setQ]        = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [fBranch,  setFBranch]  = useState('');
  const [fSeller,  setFSeller]  = useState('');

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

  // Columnas según rol
  const showCosts = isAdmin;

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ventas</h1>
        {canCreate && (
          <button onClick={() => setShowNew(true)} style={{ ...S.btn, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ic.plus size={15} /> Agregar venta
          </button>
        )}
      </div>

      {/* ── Stats cards ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10, marginBottom: 16 }}>
          <Stat icon={Ic.sale}   ic="#10B981" ib="rgba(16,185,129,0.1)"  label="Ventas" val={stats.total} />
          <Stat icon={Ic.file}   ic="#F59E0B" ib="rgba(245,158,11,0.1)"  label="Sin factura cli." val={stats.sin_factura_cli}   al={stats.sin_factura_cli > 0} />
          <Stat icon={Ic.check}  ic="#8B5CF6" ib="rgba(139,92,246,0.1)"  label="Pend. homolog."   val={stats.sin_homologacion}  al={stats.sin_homologacion > 0} />
          <Stat icon={Ic.box}    ic="#06B6D4" ib="rgba(6,182,212,0.1)"   label="Pend. entrega"    val={stats.pendiente_entrega} al={stats.pendiente_entrega > 0} />
          <Stat icon={Ic.tag}    ic="#F28100" ib="rgba(242,129,0,0.1)"   label="Pend. inscripción" val={stats.sin_inscripcion}  al={stats.sin_inscripcion > 0} />
          {showCosts && stats.total_venta > 0 && (
            <Stat icon={Ic.chart} ic="#10B981" ib="rgba(16,185,129,0.1)" label="Total vendido" val={fmt(stats.total_venta)} />
          )}
        </div>
      )}

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Ic.search size={14} color="#9CA3AF" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente / chasis / ticket…"
            style={{ ...S.inp, paddingLeft: 30, width: 240 }} />
        </div>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          style={{ ...S.inp }} title="Desde" />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          style={{ ...S.inp }} title="Hasta" />
        {isAdmin && realBranches.length > 0 && (
          <select value={fBranch} onChange={e => setFBranch(e.target.value)} style={S.inp}>
            <option value="">Todas las sucursales</option>
            {realBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {isAdmin && sellers.length > 0 && (
          <select value={fSeller} onChange={e => setFSeller(e.target.value)} style={S.inp}>
            <option value="">Todos los vendedores</option>
            {sellers.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        )}
        {(q || fromDate || toDate || fBranch || fSeller) && (
          <button onClick={() => { setQ(''); setFromDate(''); setToDate(''); setFBranch(''); setFSeller(''); }}
            style={{ ...S.btn2, padding: '8px 12px', fontSize: 12 }}>
            Limpiar
          </button>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="crm-table-scroll" style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              {[
                'Fecha', 'Ticket', 'Cliente', 'Vendedor', ...(isAdmin ? ['Sucursal'] : []),
                'Moto', 'Año', 'Chasis', 'Color',
                ...(showCosts ? ['P. Venta', 'Costo'] : ['P. Venta']),
                'Factura cli.', 'Homolog.', 'Inscripción', 'Entregada', 'Acciones',
              ].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '9px 10px', fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={99} style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Cargando…</td></tr>
            )}
            {!loading && sales.length === 0 && (
              <tr><td colSpan={99} style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Sin ventas para los filtros seleccionados</td></tr>
            )}
            {!loading && sales.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #F3F4F6' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fD(s.sold_at)}</td>
                <td style={{ padding: '8px 10px', color: '#F28100', fontWeight: 600, fontSize: 11 }}>{s.ticket_num || '—'}</td>
                <td style={{ padding: '8px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.client_name || '—'}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{s.seller_fn ? `${s.seller_fn} ${s.seller_ln}` : '—'}</td>
                {isAdmin && <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{s.branch_name || '—'}</td>}
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{s.brand} {s.model}</td>
                <td style={{ padding: '8px 10px' }}>{s.year || '—'}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{s.chassis}</td>
                <td style={{ padding: '8px 10px' }}>{s.color || '—'}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmt(s.sale_price)}</td>
                {showCosts && <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#6B7280' }}>{fmt(s.cost_price)}</td>}
                <td style={{ padding: '8px 10px', textAlign: 'center' }}><Check ok={!!s.doc_factura_cli} /></td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}><Check ok={!!s.doc_homologacion} /></td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}><Check ok={!!s.doc_inscripcion} /></td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}><Check ok={!!s.delivered} /></td>
                <td style={{ padding: '8px 10px' }}>
                  <button onClick={() => setSelSale(s)}
                    style={{ ...S.gh, padding: '4px 8px', fontSize: 11, color: '#F28100', fontWeight: 600 }}>
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Total ── */}
      {!loading && sales.length > 0 && (
        <div style={{ textAlign: 'right', fontSize: 12, color: '#6B7280', marginTop: 8 }}>
          {sales.length} venta{sales.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* ── Modales ── */}
      {selSale && (
        <SaleDetailModal
          sale={selSale}
          user={user}
          sellers={sellers}
          branches={realBranches}
          onClose={() => setSelSale(null)}
          onUpdated={() => { load(); setSelSale(null); }}
        />
      )}
      {showNew && (
        <NewSaleModal
          user={user}
          sellers={sellers}
          branches={realBranches}
          onClose={() => setShowNew(false)}
          onCreated={() => { load(); setShowNew(false); }}
        />
      )}
    </div>
  );
}
