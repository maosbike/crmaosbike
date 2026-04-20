import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../services/api';
import { Ic, S, Stat, Modal, Field, fmt, fD, PAYMENT_TYPES, ROLE_ADMIN_WRITE, ROLE_SALES_WRITE, ViewHeader, ErrorMsg, selectCtrl, useIsMobile, colorFor } from '../ui.jsx';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SALE_TYPES = [
  { v: '',            l: '— Seleccionar —' },
  { v: 'inscripcion', l: 'Solo inscripción' },
  { v: 'completa',    l: 'Documentación completa' },
];

const INSCRIPCION_AMT = 90000;
function docCompletaAmt(motoPrice) {
  return Number(motoPrice) > 4000000 ? 350000 : 300000;
}

const DOC_LABELS = {
  doc_factura_dist: 'Factura dist.',
  doc_factura_cli:  'Factura cliente',
  doc_homologacion: 'Homologación',
  doc_inscripcion:  'Inscripción',
};

// Alias locales apuntando a los grupos centralizados en ui.jsx
const CAN_CREATE = ROLE_SALES_WRITE;
const CAN_ADMIN  = ROLE_ADMIN_WRITE;

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


// ─── Modal: detalle / edición de venta ────────────────────────────────────────

function SaleDetailModal({ sale, user, sellers = [], branches = [], onClose, onUpdated }) {
  const isAdmin    = CAN_ADMIN.includes(user.role);
  const isVendedor = user.role === 'vendedor';
  const isRes      = sale.status === 'reservada';
  const isOwner    = sale.seller_id === user.id;
  // Vendedor: solo puede editar sus propias notas. Admins pueden editar todo.
  const canEdit    = isVendedor ? isOwner : (isRes ? true : CAN_CREATE.includes(user.role));

  const [editing,           setEditing]           = useState(false);
  const [form,              setForm]              = useState({});
  const [saving,            setSaving]            = useState(false);
  const [converting,        setConverting]        = useState(false);
  const [err,               setErr]               = useState('');
  const [uploading,         setUploading]         = useState('');
  const [toggling,          setToggling]          = useState(false);
  const [postItems,         setPostItems]         = useState([]);
  const [savingItems,       setSavingItems]       = useState(false);
  const [showConfirmConvert,setShowConfirmConvert]= useState(false);

  // Catálogo para edición admin/nota comercial
  const [editBrands,  setEditBrands]  = useState([]);
  const [editCatMods, setEditCatMods] = useState([]);
  const [editSelMod,  setEditSelMod]  = useState(null);

  useEffect(() => {
    if (!editing) return;
    api.getBrands().then(b => setEditBrands(Array.isArray(b) ? b : [])).catch(() => {});
  }, [editing]);

  useEffect(() => {
    if (!editing || !form.brand) { setEditCatMods([]); return; }
    api.getModels({ brand: form.brand }).then(mods => {
      const list = Array.isArray(mods) ? mods : [];
      setEditCatMods(list);
      // Precarga: preferimos model_id existente; si no, buscamos por nombre
      const byId   = sale.model_id ? list.find(x => String(x.id) === String(sale.model_id)) : null;
      const byName = list.find(x => x.model?.toUpperCase() === (form.model || '').toUpperCase());
      setEditSelMod(byId || byName || null);
    }).catch(() => {});
  }, [editing, form.brand, sale.model_id]);

  const editColors = Array.isArray(editSelMod?.colors) ? editSelMod.colors : [];

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
      branch_id:        sale.branch_id        || '',
      sold_at:          sale.sold_at ? new Date(sale.sold_at).toISOString().slice(0,10) : '',
      brand:            sale.brand            || '',
      model:            sale.model            || '',
      year:             sale.year             || '',
      color:            sale.color            || '',
      chassis:          sale.chassis          || '',
    });
  }, [sale]);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      if (isRes && !sale.is_note_only) {
        // Reserva real de inventario → actualizar via inventory PUT
        await api.updateInventory(sale.id, {
          sale_price:     form.sale_price     ? parseInt(form.sale_price)     : null,
          invoice_amount: form.invoice_amount ? parseInt(form.invoice_amount) : null,
          payment_method: form.payment_method || null,
          sale_notes:     form.sale_notes     || null,
          client_name:    form.client_name    || null,
          client_rut:     form.client_rut     || null,
          sold_by:        form.sold_by        || null,
          ...(isAdmin ? {
            branch_id:  form.branch_id  || null,
            sold_at:    form.sold_at    || null,
            brand:      form.brand      || null,
            model:      form.model      || null,
            model_id:   editSelMod?.id  || null,
            year:       form.year ? parseInt(form.year) : null,
            color:      form.color      || null,
            chassis:    form.chassis    || null,
          } : {}),
        });
      } else {
        // Nota comercial (reserva o venta) o venta real → PATCH /sales/:id
        await api.updateSale(sale.id, {
          ...form,
          model_id:     editSelMod?.id || null,
          is_note_only: !!sale.is_note_only,
        });
      }
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  async function doConvert() {
    setConverting(true); setErr('');
    try {
      if (sale.is_note_only) {
        // Nota comercial: actualizar status a vendida en sales_notes
        await api.updateSale(sale.id, {
          is_note_only:   true,
          status:         'vendida',
          sold_at:        new Date().toISOString(),
          sold_by:        form.sold_by        || sale.seller_id,
          sale_price:     form.sale_price     ? parseInt(form.sale_price)     : (sale.sale_price     || null),
          invoice_amount: form.invoice_amount ? parseInt(form.invoice_amount) : (sale.invoice_amount || null),
          client_name:    form.client_name    || sale.client_name    || null,
          client_rut:     form.client_rut     || sale.client_rut     || null,
          payment_method: form.payment_method || sale.payment_method || null,
          sale_notes:     form.sale_notes     || sale.sale_notes     || null,
        });
      } else {
        // Unidad real de inventario: usar flujo estándar de venta
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
      }
      onUpdated();
    } catch (e) { setErr(e.message || 'Error al convertir'); }
    finally { setConverting(false); }
  }

  async function handleToggleDelivered() {
    setToggling(true);
    try {
      await api.updateSale(sale.id, { delivered: !sale.delivered });
      onUpdated();
    } catch(e) { setErr(e.message || 'Error'); }
    finally { setToggling(false); }
  }

  async function handleSavePostItems() {
    const valid = postItems.filter(i => i.name.trim());
    if (!valid.length) return;
    setSavingItems(true);
    try {
      const itemsText = valid.map(i => `• ${i.name.trim()}${i.price ? ': ' + fmt(parseInt(i.price)) : ''}`).join('\n');
      const totalExtra = valid.reduce((s, i) => s + (parseInt(i.price) || 0), 0);
      const append = `\n\n— Ítems adicionales —\n${itemsText}${totalExtra > 0 ? '\nTotal extra: ' + fmt(totalExtra) : ''}`;
      const newNotes = (sale.sale_notes || '') + append;
      await api.updateSale(sale.id, { sale_notes: newNotes });
      setPostItems([]);
      onUpdated();
    } catch(e) { setErr(e.message || 'Error'); }
    finally { setSavingItems(false); }
  }

  async function handleDocUpload(field, file) {
    if (!file) return;
    setUploading(field);
    try {
      await api.uploadSaleDoc(sale.id, field, file);
      onUpdated();
    } catch (e) { setErr(e.message); }
    finally { setUploading(''); }
  }

  const sellerName = sale.seller_fn ? `${sale.seller_fn} ${sale.seller_ln || ''}`.trim() : '—';

  const saldo = sale.sale_price > 0 ? Math.max(0, sale.sale_price - (sale.invoice_amount || 0)) : 0;

  return (
    <Modal onClose={onClose} title={isRes ? `Reserva · ${sale.brand} ${sale.model}` : `Venta · ${sale.brand} ${sale.model}`} wide>

      {/* ── Hero: foto + datos unidad + precio ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: 14, marginBottom: 18,
        overflow: 'hidden',
        display: 'flex', alignItems: 'stretch',
        minHeight: 150,
        border: '1px solid #E5E7EB',
        borderLeft: isRes ? '4px solid #F59E0B' : '4px solid #10B981',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        {/* Foto */}
        <div style={{
          width: 180, flexShrink: 0,
          background: isRes
            ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
            : 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}>
          {sale.image_url ? (
            <img src={sale.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          ) : (
            <Ic.bike size={64} color={isRes ? '#D97706' : '#059669'}/>
          )}
          {sale.added_as_sold && (
            <span style={{
              position:'absolute', top:8, left:8,
              fontSize:9, fontWeight:800, color:'#FFFFFF',
              background:'rgba(124,58,237,0.9)', borderRadius:4, padding:'2px 7px',
              letterSpacing:'0.06em',
            }}>
              BODEGA
            </span>
          )}
        </div>

        {/* Datos */}
        <div style={{
          flex: 1, padding: '18px 22px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 16, flexWrap: 'wrap', minWidth: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              {isRes ? (
                <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:99,
                  background:'#FEF3C7', color:'#92400E',
                  letterSpacing:'0.08em', border:'1px solid #FDE68A' }}>
                  ◐ RESERVA
                </span>
              ) : (
                <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:99,
                  background:'#D1FAE5', color:'#065F46',
                  letterSpacing:'0.08em', border:'1px solid #A7F3D0' }}>
                  ✓ VENTA
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
              {sale.brand}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 4, color: '#0F172A' }}>
              {sale.model} {sale.year ? `· ${sale.year}` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', letterSpacing: '0.04em' }}>
              {sale.chassis || '—'}{sale.color ? ` · ${sale.color}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {sale.sale_price > 0 && (
              <div style={{ fontSize: 24, fontWeight: 900, color: '#F28100', letterSpacing: '-1px' }}>
                {fmt(sale.sale_price)}
              </div>
            )}
            {isRes && sale.sale_price > 0 && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color:'#059669' }}>Abonado: {fmt(sale.invoice_amount||0)}</span>
                {' · '}
                <span style={{ color: saldo > 0 ? '#DC2626' : '#059669', fontWeight:700 }}>
                  {saldo > 0 ? `Falta: ${fmt(saldo)}` : '✓ Saldado'}
                </span>
              </div>
            )}
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fD(sale.sold_at)}</div>
            {!isRes && isAdmin && <DistributorBadge paid={sale.distributor_paid} />}
          </div>
        </div>
      </div>

      {/* Entregada — botón prominente */}
      {!isRes && (
        <button onClick={handleToggleDelivered} disabled={toggling}
          style={{ display:'flex', alignItems:'center', gap:10, width:'100%', marginBottom:14,
            padding:'12px 16px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'inherit',
            background: sale.delivered ? '#ECFDF5' : '#FFF7ED',
            outline: `2px solid ${sale.delivered ? '#059669' : '#F28100'}`,
            transition:'all 0.15s' }}>
          <div style={{ width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            background: sale.delivered ? '#059669' : '#F28100' }}>
            <span style={{ color:'#ffffff', fontSize:16, lineHeight:1 }}>{sale.delivered ? '✓' : '○'}</span>
          </div>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:13, fontWeight:700, color: sale.delivered ? '#065F46' : '#92400E' }}>
              {toggling ? 'Actualizando…' : sale.delivered ? 'Moto entregada al cliente' : 'Moto pendiente de entrega'}
            </div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>
              {sale.delivered ? 'Marcar como pendiente' : 'Confirmar entrega'}
            </div>
          </div>
        </button>
      )}

      {/* ── Info: Cliente + Operación en cards paralelas ── */}
      <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* Cliente */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #EAECEF', borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10,
          }}>
            Cliente
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Nombre', sale.client_name || '—'],
              ['RUT',    sale.client_rut  || '—'],
              ...(sale.ticket_num ? [['Ticket', `#${sale.ticket_num}`]] : []),
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ color: '#9CA3AF', fontSize: 11, minWidth: 60, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', wordBreak: 'break-word' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Operación */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #EAECEF', borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10,
          }}>
            Operación
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Vendedor',   sellerName],
              ['Sucursal',   sale.added_as_sold ? (sale.branch_name || '—') + ' · Bodega' : (sale.branch_name || '—')],
              ['Forma pago', sale.payment_method || '—'],
              ['Modalidad',  SALE_TYPES.find(s => s.v === sale.sale_type)?.l || sale.sale_type || '—'],
              ...(isAdmin && sale.cost_price > 0 ? [['Precio lista', fmt(sale.price)]] : []),
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ color: '#9CA3AF', fontSize: 11, minWidth: 72, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {sale.sale_notes && (
        <div style={{
          background: '#FFFBEB', borderRadius: 10, padding: '12px 14px', marginBottom: 16,
          fontSize: 12, color: '#713F12', border: '1px solid #FEF3C7', borderLeft: '3px solid #CA8A04',
          whiteSpace: 'pre-wrap',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#A16207', textTransform: 'uppercase',
                        letterSpacing: '0.08em', marginBottom: 4 }}>Notas</div>
          {sale.sale_notes}
        </div>
      )}

      {/* ── Documentos ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase',
                      letterSpacing: '0.09em', marginBottom: 10 }}>Documentos adjuntos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {Object.entries(DOC_LABELS).filter(([field]) => !(isVendedor && field === 'doc_factura_dist')).map(([field, label]) => {
            const hasDoc = !!sale[field];
            return (
              <div key={field} style={{
                background: hasDoc ? '#F0FDF4' : '#FFFFFF',
                border: `1px solid ${hasDoc ? '#A7F3D0' : '#EAECEF'}`,
                borderRadius: 10, padding: '10px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                transition: 'border-color 0.1s',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, color: hasDoc ? '#065F46' : '#6B7280',
                                fontWeight: 700, marginBottom: 4, textTransform: 'uppercase',
                                letterSpacing: '0.04em' }}>
                    {label}
                  </div>
                  <DocBadge url={sale[field]} />
                </div>
                {canEdit && (
                  <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                    <input type="file" style={{ display: 'none' }} accept=".jpg,.jpeg,.png,.webp,.pdf"
                      onChange={e => handleDocUpload(field, e.target.files[0])} />
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: uploading === field ? '#F28100' : (hasDoc ? '#059669' : '#9CA3AF'),
                      padding: '4px 8px', borderRadius: 6,
                      background: hasDoc ? 'rgba(5,150,105,0.08)' : '#F9FAFB',
                      border: `1px solid ${hasDoc ? '#A7F3D0' : '#E5E7EB'}`,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}>
                      {uploading === field ? '↑' : (hasDoc ? '↻' : '+')}
                    </span>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Ítems post-venta */}
      <div style={{ marginBottom:16, background:'#F9FAFB', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
          + Ítems adicionales post-venta
        </div>
        {postItems.length === 0 && (
          <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:8 }}>
            Agrega accesorios u otros ítems que el cliente compró al retirar la moto.
          </div>
        )}
        {postItems.map((item, i) => (
          <div key={i} style={{ display:'flex', gap:6, marginBottom:6, alignItems:'center' }}>
            <input value={item.name} onChange={e => setPostItems(p => p.map((x,j) => j===i ? {...x,name:e.target.value} : x))}
              placeholder="Ej: Guantes, Casco…" style={{ ...S.inp, flex:2, fontSize:12 }} />
            <input value={item.price} type="number" onChange={e => setPostItems(p => p.map((x,j) => j===i ? {...x,price:e.target.value} : x))}
              placeholder="Precio $" style={{ ...S.inp, flex:1, fontSize:12 }} />
            <button onClick={() => setPostItems(p => p.filter((_,j) => j!==i))}
              style={{ background:'none', border:'none', color:'#EF4444', cursor:'pointer', fontSize:18, padding:'0 4px', lineHeight:1 }}>✕</button>
          </div>
        ))}
        <div style={{ display:'flex', gap:8, marginTop:6 }}>
          <button onClick={() => setPostItems(p => [...p, {name:'',price:''}])}
            style={{ ...S.btn2, fontSize:11, padding:'5px 12px' }}>+ Agregar ítem</button>
          {postItems.length > 0 && (
            <button onClick={handleSavePostItems} disabled={savingItems}
              style={{ ...S.btn, fontSize:11, padding:'5px 16px' }}>
              {savingItems ? 'Guardando…' : 'Guardar ítems'}
            </button>
          )}
        </div>
      </div>

      {/* Acciones principales */}
      {!editing && err && <ErrorMsg msg={err} />}
      {!editing ? (
        <div style={{ display: 'flex', gap: 8, flexWrap:'wrap' }}>
          {/* Descargar documento */}
          <button onClick={() => openNoteFromSale(sale)}
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
            <button onClick={() => setShowConfirmConvert(true)} disabled={converting}
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
          {!isRes && isAdmin && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={!!form.distributor_paid}
                onChange={e => setForm(f => ({ ...f, distributor_paid: e.target.checked }))} />
              Pagada al distribuidor
            </label>
          )}
          <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre cliente" value={form.client_name} onChange={set('client_name')} />
            <Field label="RUT cliente"    value={form.client_rut}  onChange={set('client_rut')} />
          </div>
          {isAdmin && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
                ⚠ Admin — edición avanzada
              </div>
              <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {sellers.length > 0 && (
                  <Field label="Vendedor" value={form.sold_by} onChange={set('sold_by')}
                    opts={[{ v: '', l: '— Seleccionar —' }, ...sellers.map(s => ({ v: s.id, l: `${s.first_name} ${s.last_name}`.trim() }))]} />
                )}
                {branches.length > 0 && (
                  <Field label="Sucursal" value={form.branch_id} onChange={set('branch_id')}
                    opts={[{ v: '', l: '— Seleccionar —' }, ...branches.map(b => ({ v: b.id, l: b.name }))]} />
                )}
                <Field label={isRes ? 'Fecha reserva' : 'Fecha venta'} value={form.sold_at}
                  onChange={set('sold_at')} type="date" />
              </div>
            </>
          )}
          {(sale.is_note_only || isAdmin) && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Vehículo
              </div>
              <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Marca"
                  value={form.brand}
                  opts={[{ v: '', l: '— Seleccionar marca —' }, ...editBrands.map(b => ({ v: b, l: b }))]}
                  onChange={(v) => { setEditSelMod(null); setForm(f => ({ ...f, brand: v, model: '', color: '' })); }} />
                <Field label="Modelo"
                  value={editSelMod?.id || ''}
                  opts={[{ v: '', l: form.brand ? (editCatMods.length ? '— Seleccionar modelo —' : 'Sin modelos en catálogo') : '— Primero seleccione una marca —' },
                         ...editCatMods.map(m => ({ v: m.id, l: `${m.model}${m.year ? ' ' + m.year : ''}` }))]}
                  onChange={(id) => {
                    const m = editCatMods.find(x => String(x.id) === String(id));
                    if (!m) { setEditSelMod(null); setForm(f => ({ ...f, model: '', color: '' })); return; }
                    setEditSelMod(m);
                    setForm(f => ({ ...f, model: m.model, year: m.year || f.year, color: '' }));
                  }}
                  disabled={!form.brand} />
                <Field label="Año" value={form.year} onChange={set('year')} type="number" />
                <Field label="Color"
                  value={form.color}
                  opts={[{ v: '', l: editSelMod ? (editColors.length ? '— Seleccionar color —' : 'Sin colores en catálogo') : '— Primero seleccione un modelo —' },
                         ...editColors.map(c => ({ v: c, l: c }))]}
                  onChange={set('color')}
                  disabled={!editSelMod} />
                <Field label="Chasis" value={form.chassis} onChange={set('chassis')} />
              </div>
            </>
          )}
          <Field label="Observaciones" value={form.sale_notes} onChange={set('sale_notes')} rows={2} />
          <ErrorMsg msg={err} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn, flex: 1 }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button onClick={() => setEditing(false)} style={{ ...S.btn2, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      )}

      {showConfirmConvert && (
        <Modal open onClose={() => setShowConfirmConvert(false)} title="Confirmar conversión">
          <p style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
            Esta acción convertirá el registro a nota de venta y <strong>no se puede deshacer</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={{ ...S.btn2 }} onClick={() => setShowConfirmConvert(false)}>Cancelar</button>
            <button style={{ ...S.btn }} onClick={() => { setShowConfirmConvert(false); doConvert(); }}>Convertir a venta</button>
          </div>
        </Modal>
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
  const clean = String(s).slice(0, 10); // asegura YYYY-MM-DD aunque venga timestamp completo
  const d = new Date(clean + 'T12:00:00');
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
  { v: 'Mixto',           l: 'Mixto / Varias transferencias' },
];

function computeTotals({ sale_price, accessories = [], discount = '', payMode = '', payLines = [], chargeType = 'inscripcion', abono = 0, isReserva = false }) {
  const motoAmt   = Number(sale_price) || 0;
  const accAmt    = accessories.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const chargeAmt = chargeType === 'inscripcion' ? INSCRIPCION_AMT : (chargeType === 'completa' ? docCompletaAmt(motoAmt) : 0);
  const subtotal  = motoAmt + accAmt + chargeAmt;
  const discAmt  = discount ? Math.round(subtotal * Number(discount) / 100) : 0;
  const netTotal = subtotal - discAmt;
  const abonoNum = Number(abono) || 0;

  // En reservas con abono parcial el recargo de tarjeta se calcula solo sobre lo
  // que el cliente paga hoy — el saldo restante puede liquidarse con otro medio.
  let cardSurcharge = 0;
  if (payMode === 'Mixto') {
    cardSurcharge = payLines.reduce((s, l) =>
      s + (isTarjeta(l.method) ? Math.round((Number(l.amount) || 0) * 0.02) : 0), 0);
  } else if (isTarjeta(payMode)) {
    const base = (isReserva && abonoNum > 0) ? abonoNum : netTotal;
    cardSurcharge = Math.round(base * 0.02);
  }

  // grandTotal = precio total real de la moto (sin recargo sobre el saldo no pagado)
  const grandTotal = (isReserva && abonoNum > 0) ? netTotal : netTotal + cardSurcharge;

  let abonoAmt = grandTotal;
  if (isReserva && abonoNum > 0) {
    abonoAmt = abonoNum + cardSurcharge; // lo que el cliente entrega hoy (abono + recargo)
  } else if (payMode === 'Mixto') {
    abonoAmt = payLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) + cardSurcharge;
  }

  const saldo = (isReserva && abonoNum > 0)
    ? Math.max(0, netTotal - abonoNum)
    : Math.max(0, grandTotal - abonoAmt);

  return { motoAmt, accAmt, chargeAmt, chargeType, subtotal, discAmt, netTotal, cardSurcharge, grandTotal, abonoAmt, saldo };
}

async function openNote(data, type) {
  try {
  const isRes = type === 'reserva';
  const safe = (s) => (s || '').replace(/[^a-zA-Z0-9áéíóúñ]/gi, '_').substring(0, 30);
  const fileName = `${isRes ? 'reserva' : 'nota_venta'}_${safe(data.brand)}_${safe(data.client_name)}.pdf`;
  const t = computeTotals({ ...data, isReserva: isRes });
  const today = fmtDateDoc(data.sold_at || new Date().toISOString().slice(0, 10));
  const isEmpresa = data.client_type === 'empresa';
  const docLabel = isRes ? 'NOTA DE RESERVA' : 'NOTA DE VENTA';

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
  if (data.chargeType === 'inscripcion') tableBody.push(['Inscripción vehicular', fmtCLP(INSCRIPCION_AMT)]);
  else if (data.chargeType === 'completa') tableBody.push(['Documentación completa', fmtCLP(t.chargeAmt)]);
  // Solo mostrar recargo en la tabla cuando aplica sobre el total (no sobre abono parcial)
  if (t.cardSurcharge > 0 && !(isRes && (data.abono > 0))) {
    tableBody.push(['Recargo tarjeta de crédito/débito (2%)', '+' + fmtCLP(t.cardSurcharge)]);
  }
  tableBody.push(['TOTAL', fmtCLP(t.grandTotal)]);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Descripción', 'Monto']],
    body: tableBody,
    styles: { fontSize: 9.5, cellPadding: [4, 5], textColor: dark, lineColor: lightGray, lineWidth: 0.2 },
    headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
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
    }
    doc.text(payText, M + 4, y + 5.5);
    const estado = t.saldo > 0 ? `Saldo pendiente: ${fmtCLP(t.saldo)}` : 'Cancelado en su totalidad';
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(t.saldo > 0 ? 146 : 34, t.saldo > 0 ? 64 : 139, t.saldo > 0 ? 14 : 34);
    doc.text(estado, W - M - 4, y + 5.5, { align: 'right' });
    y += 14;
  }

  // ── BLOQUE AUTOFIN (condiciones de financiamiento) ──
  if (data.payMode === 'Crédito Autofin' && data.finData) {
    const fd = data.finData;
    const pieAmt = Number(fd.pieAmt) || 0;
    const piePct = fd.piePct != null ? Number(fd.piePct) : null;
    const saldoFin = Math.max(0, t.grandTotal - pieAmt);

    const boxH = 14;
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(253, 186, 116); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, cw, boxH, 1.5, 1.5, 'FD');

    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(154, 52, 18);
    doc.text('Condiciones de financiamiento (Autofin)', M + 4, y + 5);

    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark);
    const pieLabel = piePct != null ? `${fmtCLP(pieAmt)} (${piePct}%)` : fmtCLP(pieAmt);
    doc.text(`Pie inicial: ${pieLabel}`, M + 4, y + 10.5);
    doc.text(`Saldo a financiar: ${fmtCLP(saldoFin)}`, W - M - 4, y + 10.5, { align: 'right' });

    y += boxH + 4;
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
  <div style={{ gridColumn: '1/-1', fontSize: 9, fontWeight: 800, color: '#9CA3AF',
                textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 12,
                paddingBottom: 4, borderBottom: '1px solid #F3F4F6' }}>{children}</div>
);

// ─── Modal: nueva venta/reserva ───────────────────────────────────────────────

function NewSaleModal({ sellers, branches, onClose, onCreated, noteType = 'venta', user }) {
  const isReserva  = noteType === 'reserva';
  const isVendedor = user?.role === 'vendedor';
  const [step,       setStep]     = useState(0);
  const [hasInvUnit, setHasInvUnit] = useState(null);
  const [invUnits,   setInvUnits] = useState([]);
  const [invSearch,  setInvSearch]= useState('');
  const [selUnit,    setSelUnit]  = useState(null);
  const [savedDoc,   setSavedDoc] = useState(null);
  // Vendedor: pre-fill sold_by con su propio id
  const [form,       setForm]     = useState({ ...EMPTY_FORM, sold_by: isVendedor ? (user?.id || '') : '' });
  const [saving,     setSaving]   = useState(false);
  const [err,        setErr]      = useState('');

  // Catalog
  const [brands,   setBrands]  = useState([]);
  const [catMods,  setCatMods] = useState([]);
  const [selMod,   setSelMod]  = useState(null);

  // Payment
  const [payMode,  setPayMode] = useState('');
  const [payLines, setPayLines]= useState([{ method: '', amount: '' }]);

  // Autofin (crédito) — pie inicial
  const [finPct,     setFinPct]     = useState('');   // % del pie sobre el total
  const [finAmt,     setFinAmt]     = useState('');   // monto $ del pie

  // Extras
  const [accs,       setAccs]      = useState([]);
  const [discount,   setDiscount]  = useState('');
  const [abono,      setAbono]     = useState('');
  const [chargeType, setChargeType]= useState('inscripcion');

  // Titular del vehículo
  const [titularSame, setTitularSame] = useState(true);
  const [titular, setTitular] = useState({ name: '', rut: '', phone: '', email: '', address: '', commune: '' });
  const setT = (k) => (v) => setTitular(t => ({ ...t, [k]: v }));

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const resetForm = () => {
    setSelUnit(null); setSelMod(null);
    setForm({ ...EMPTY_FORM, sold_by: isVendedor ? (user?.id || '') : '' });
    setPayMode(''); setPayLines([{ method: '', amount: '' }]);
    setFinPct(''); setFinAmt('');
    setAccs([]); setDiscount(''); setAbono(''); setCatMods([]);
    setChargeType('inscripcion');
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
  const totals = computeTotals({ sale_price: form.sale_price, accessories: accs, discount, payMode, payLines, chargeType, abono: Number(abono) || 0, isReserva });

  async function handleCreate() {
    if (!form.brand || !form.model) { setErr('Marca y modelo son obligatorios'); return; }
    if (!form.sold_by) { setErr('Vendedor obligatorio'); return; }
    if (!selUnit && !form.branch_id) { setErr('Sucursal obligatoria'); return; }
    if (!selUnit && !form.color) { setErr('Color obligatorio'); return; }
    setSaving(true); setErr('');
    try {
      // Línea autofin para anexar a las notas — sólo si el medio es Crédito Autofin
      let autofinLine = null;
      if (payMode === 'Crédito Autofin' && (finAmt || finPct)) {
        const pieAmt = Number(finAmt) || 0;
        const parts = [`Autofin: pie ${fmtCLP(pieAmt)}`];
        if (finPct) parts.push(`(${finPct}%)`);
        autofinLine = parts.join(' ');
      }

      const clientExtra = [
        form.client_type === 'empresa'
          ? `Empresa: ${form.empresa_name||''} RUT: ${form.empresa_rut||''}`
          : null,
        form.client_phone   ? `Tel: ${form.client_phone}` : null,
        form.client_email   ? `Email: ${form.client_email}` : null,
        form.client_address ? `Dir: ${form.client_address}${form.client_commune ? ', ' + form.client_commune : ''}` : null,
        autofinLine,
        form.sale_notes     || null,
      ].filter(Boolean).join(' | ');

      // Desglose que va a la DB (migración 055): accesorios, tipo de cobro y descuento
      const motoAmt = Number(form.sale_price) || 0;
      const accessoriesPayload = (accs || [])
        .filter(a => (a.name && String(a.name).trim()) || Number(a.amount) > 0)
        .map(a => ({ description: String(a.name || '').trim(), amount: Number(a.amount) || 0 }));
      const chargeAmtPayload = chargeType === 'inscripcion'
        ? INSCRIPCION_AMT
        : chargeType === 'completa' ? docCompletaAmt(motoAmt) : 0;
      const subtotalForDiscount = motoAmt
        + accessoriesPayload.reduce((s, a) => s + a.amount, 0)
        + chargeAmtPayload;
      const discountAmtPayload = discount
        ? Math.round(subtotalForDiscount * Number(discount) / 100)
        : 0;
      const extrasPayload = {
        accessories:  accessoriesPayload.length ? accessoriesPayload : null,
        charge_type:  chargeType || null,
        charge_amt:   chargeAmtPayload || null,
        discount_amt: discountAmtPayload || null,
      };

      if (selUnit && !isReserva) {
        await api.sellInventory(selUnit.id, {
          sold_by: form.sold_by, sold_at: form.sold_at || null,
          ticket_id: form.ticket_id || null, payment_method: payMode || null,
          sale_type: form.sale_type || null, sale_notes: clientExtra || null,
          client_name: form.client_name || null, client_rut: form.client_rut || null,
          sale_price: form.sale_price ? parseInt(form.sale_price) : null,
          ...extrasPayload,
        });
      } else if (!selUnit) {
        // Referencia comercial sin unidad de inventario — NO crea stock
        await api.createSale({
          ...form,
          payment_method: payMode || null,
          sale_notes: clientExtra || null,
          status: isReserva ? 'reservada' : 'vendida',
          invoice_amount: isReserva && abono ? parseInt(abono) : null,
          ...extrasPayload,
        });
      } else if (selUnit && isReserva) {
        await api.updateInventory(selUnit.id, {
          status: 'reservada',
          sold_at: form.sold_at || new Date().toISOString().slice(0, 10),
          sold_by: form.sold_by || null,
          sale_price: form.sale_price ? parseInt(form.sale_price) : null,
          invoice_amount: abono ? parseInt(abono) : null,
          sale_notes: clientExtra || null,
          client_name: form.client_name || null,
          client_rut: form.client_rut || null,
          payment_method: payMode || null,
          ...extrasPayload,
        });
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
        isReserva,
        accessories: accs, discount, payMode, payLines, chargeType,
        finData: payMode === 'Crédito Autofin' ? {
          pieAmt:    Number(finAmt)    || 0,
          piePct:    finPct ? Number(finPct) : null,
        } : null,
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
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
            ¿La unidad ya está cargada en inventario?
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 28 }}>
            Si está en stock puedes asociarla directamente.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => { setHasInvUnit(true); setStep(1); }}
              style={{ padding: '12px 28px', borderRadius: 10, border: '2px solid #111827',
                       background: '#111827', color: '#ffffff', fontSize: 14, fontWeight: 700,
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
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#ffffff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#F28100'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>{u.brand} {u.model}</div>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '4px 12px' }}>
                Unidad: {selUnit.brand} {selUnit.model}{selUnit.chassis ? ` · ${selUnit.chassis}` : ''}
              </div>
            )}
          </div>

          <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

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
                  opts={[{ v: '', l: selMod ? (colors.length ? '— Seleccionar color —' : 'Sin colores en catálogo') : '— Primero seleccione un modelo —' },
                         ...colors.map(c => ({ v: c, l: c }))]}
                  onChange={set('color')}
                  disabled={!selMod} />
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
                           background: form.client_type === t ? '#FFF7ED' : '#ffffff',
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
                <Field label="Comuna"            value={form.client_commune} onChange={set('client_commune')} />
              </>
            )}

            {/* TITULAR */}
            <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                ¿La moto quedará a nombre de quien está haciendo la compra?
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: titularSame ? 0 : 12 }}>
                {[{ v: true, l: 'Sí' }, { v: false, l: 'No' }].map(opt => (
                  <button key={String(opt.v)} type="button" onClick={() => setTitularSame(opt.v)}
                    style={{ padding: '5px 20px', borderRadius: 20,
                             border: `1.5px solid ${titularSame === opt.v ? '#F28100' : '#E5E7EB'}`,
                             background: titularSame === opt.v ? '#FFF7ED' : '#ffffff',
                             color: titularSame === opt.v ? '#F28100' : '#6B7280',
                             fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {opt.l}
                  </button>
                ))}
              </div>
              {!titularSame && (
                <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
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
            {isVendedor ? (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#065F46', fontWeight: 600 }}>
                Vendedor: {user?.fn} {user?.ln}
              </div>
            ) : (
              <Field label="Vendedor *" value={form.sold_by}
                opts={[{ v: '', l: '— Seleccionar vendedor —' }, ...sellers.map(s => ({ v: s.id, l: `${s.first_name} ${s.last_name}`.trim() }))]}
                onChange={set('sold_by')} />
            )}
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
                    <span style={{ color: '#92400E' }}>
                      Abono hoy: <strong>{fmtCLP(totals.abonoAmt)}</strong>
                      {totals.cardSurcharge > 0 && <span style={{ fontSize: 10, color: '#B45309' }}> (incl. recargo 2%)</span>}
                    </span>
                    <span style={{ color: '#B45309', fontWeight: 700 }}>Saldo pendiente: {fmtCLP(totals.saldo)}</span>
                  </div>
                )}
              </>
            )}

            {/* DOCUMENTACIÓN — obligatorio */}
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize:9, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:8 }}>
                Documentación (obligatorio)
              </div>
              <div className="mob-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { v:'inscripcion', l:'Inscripción vehicular',   amt: INSCRIPCION_AMT },
                  { v:'completa',    l:'Documentación completa',  amt: docCompletaAmt(form.sale_price) },
                ].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setChargeType(opt.v)}
                    style={{ padding:'10px 14px', borderRadius:8, textAlign:'left', cursor:'pointer', fontFamily:'inherit',
                      border:`2px solid ${chargeType===opt.v ? '#059669' : '#E5E7EB'}`,
                      background: chargeType===opt.v ? 'rgba(5,150,105,0.06)' : '#F9FAFB' }}>
                    <div style={{ fontSize:12, fontWeight:700, color: chargeType===opt.v ? '#065F46' : '#374151', marginBottom:3 }}>
                      {opt.l}
                    </div>
                    <div style={{ fontSize:13, fontWeight:900, color: chargeType===opt.v ? '#059669' : '#6B7280' }}>
                      {fmtCLP(opt.amt)}
                    </div>
                  </button>
                ))}
              </div>
              {chargeType === 'completa' && (
                <div style={{ fontSize:11, color:'#6B7280', marginTop:6, padding:'5px 10px', background:'#F9FAFB', borderRadius:6, border:'1px solid #E5E7EB' }}>
                  Moto {Number(form.sale_price) > 4000000 ? 'sobre' : 'hasta'} $4.000.000 → <strong>{fmtCLP(docCompletaAmt(form.sale_price))}</strong>
                </div>
              )}
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
              <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <Field label="Medio de pago" value={payMode} opts={PAY_MODES}
                    onChange={v => {
                      setPayMode(v);
                      setPayLines([{ method: '', amount: '' }]);
                      setFinPct(''); setFinAmt('');
                    }} />
                </div>

                {isTarjeta(payMode) && totals.netTotal > 0 && (
                  <div style={{ gridColumn: '1/-1', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
                    Recargo 2% tarjeta: <strong>+{fmtCLP(totals.cardSurcharge)}</strong> — Total con recargo: <strong>{fmtCLP(totals.grandTotal)}</strong>
                  </div>
                )}

                {payMode === 'Crédito Autofin' && (
                  <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 8, background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Condiciones de financiamiento
                    </div>

                    <div className="mob-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Field label="Pie inicial (%)" value={finPct} type="number"
                        onChange={v => {
                          setFinPct(v);
                          const pct = Number(v);
                          if (totals.grandTotal > 0 && !isNaN(pct) && v !== '') {
                            setFinAmt(String(Math.round(totals.grandTotal * pct / 100)));
                          } else if (v === '') {
                            setFinAmt('');
                          }
                        }} />
                      <Field label="Pie inicial ($)" value={finAmt} type="number"
                        onChange={v => {
                          setFinAmt(v);
                          const amt = Number(v);
                          if (totals.grandTotal > 0 && !isNaN(amt) && v !== '') {
                            setFinPct(String(Math.round(amt / totals.grandTotal * 1000) / 10));
                          } else if (v === '') {
                            setFinPct('');
                          }
                        }} />
                    </div>

                    {totals.grandTotal > 0 && Number(finAmt) >= 0 && (() => {
                      const pieAmt = Number(finAmt) || 0;
                      const saldoFin = Math.max(0, totals.grandTotal - pieAmt);
                      return (
                        <div style={{ background: '#FFFFFF', border: '1px solid #FED7AA', borderRadius: 6, padding: '8px 12px', fontSize: 11.5, color: '#7C2D12', display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div>Pie inicial: <strong>{fmtCLP(pieAmt)}</strong> {finPct && `(${finPct}%)`}</div>
                          <div>Saldo a financiar: <strong>{fmtCLP(saldoFin)}</strong></div>
                        </div>
                      );
                    })()}
                  </div>
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
                      <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                        Abono: <strong>{fmtCLP(totals.abonoAmt)}</strong> · Saldo: <strong style={{ color: totals.saldo > 0 ? '#B45309' : '#065F46' }}>{fmtCLP(totals.saldo)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RESUMEN */}
            {totals.grandTotal > 0 && (
              <div style={{ gridColumn: '1/-1', background: '#111827', borderRadius: 10, padding: '12px 16px', marginTop: 4 }}>
                {[
                  ['Precio moto', fmtCLP(totals.motoAmt), '#D1D5DB'],
                  totals.accAmt > 0  ? [`Accesorios`, fmtCLP(totals.accAmt), '#D1D5DB'] : null,
                  [chargeType === 'inscripcion' ? 'Inscripción vehicular' : 'Documentación completa', fmtCLP(totals.chargeAmt), '#A7F3D0'],
                  totals.discAmt > 0 ? [`Descuento ${discount}%`, `−${fmtCLP(totals.discAmt)}`, '#10B981'] : null,
                  totals.cardSurcharge > 0 ? [`Recargo tarjeta 2%`, `+${fmtCLP(totals.cardSurcharge)}`, '#FCD34D'] : null,
                ].filter(Boolean).map(([lbl, val, clr]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>
                    <span>{lbl}</span><span style={{ color: clr }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffffff', fontSize: 15, fontWeight: 900, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4 }}>
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

          <ErrorMsg msg={err} />
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
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
            {isReserva ? 'Reserva registrada' : 'Venta registrada'}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 20 }}>
            El documento está listo para imprimir o descargar como PDF.
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 18px', marginBottom: 20, textAlign: 'left' }}>
            {[
              ['Cliente',  savedDoc.client_name || '—'],
              ['RUT',      savedDoc.client_rut  || '—'],
              ['Moto',     `${savedDoc.brand} ${savedDoc.model} ${savedDoc.year || ''}`.trim()],
              ['Color',    savedDoc.color || '—'],
              ['Sucursal', savedDoc.branchName  || '—'],
              ['Total',    fmtCLP(computeTotals(savedDoc).grandTotal)],
              computeTotals(savedDoc).saldo > 0 ? ['Saldo', fmtCLP(computeTotals(savedDoc).saldo)] : null,
            ].filter(Boolean).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: 10, color: '#9CA3AF', minWidth: 70 }}>{l}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => openNote(savedDoc, noteType)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F28100', border: 'none', color: '#ffffff', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '12px 24px', boxShadow: '0 4px 12px rgba(242,129,0,.35)', fontFamily: 'inherit' }}>
              Descargar PDF
            </button>
            <button onClick={onClose}
              style={{ background: '#ffffff', border: '1.5px solid #D1D5DB', color: '#374151', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '12px 20px', fontFamily: 'inherit' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Parser de la línea "Autofin: pie $X (Y%)" dentro de sale_notes
function parseAutofinFromNotes(notes) {
  if (!notes) return null;
  const m = /Autofin:\s*pie\s*\$?([\d\.\,]+)(?:\s*\(([\d\.]+)%\))?/i.exec(notes);
  if (!m) return null;
  const pieAmt = Number(String(m[1]).replace(/[\.\,]/g, '')) || 0;
  const piePct = m[2] ? Number(m[2]) : null;
  return { pieAmt, piePct };
}

// Helper: abre nota de venta/reserva desde un registro del listado (busca foto en catálogo)
async function openNoteFromSale(s) {
  const isRes = s.status === 'reservada';
  let modelPhotoUrl = null;
  try {
    const mods = await api.getModels({ brand: s.brand, q: s.model, limit: 10 });
    const list = Array.isArray(mods) ? mods : (mods.data || []);
    const mod  = list.find(m =>
      (m.model||'').toUpperCase() === (s.model||'').toUpperCase() &&
      (m.brand||'').toUpperCase() === (s.brand||'').toUpperCase()
    ) || list[0];
    if (mod) {
      const selectedColor = (s.color||'').toLowerCase().trim();
      const cp = (mod.color_photos||[]).find(c=>(c.color||'').toLowerCase().trim()===selectedColor);
      modelPhotoUrl = cp?.url || mod.image || mod.image_gallery?.[0] || null;
    }
  } catch(_) {}
  const finData = s.payment_method === 'Crédito Autofin'
    ? parseAutofinFromNotes(s.sale_notes)
    : null;
  return openNote({
    brand: s.brand, model: s.model, year: s.year, color: s.color,
    chassis: s.chassis, motor_num: s.motor_num,
    sold_at: s.sold_at ? String(s.sold_at).slice(0,10) : '',
    branchName: s.branch_name || '',
    sellerName: s.seller_fn ? `${s.seller_fn} ${s.seller_ln||''}`.trim() : '',
    client_name: s.client_name||'', client_rut: s.client_rut||'', client_type:'persona',
    sale_price: s.sale_price, abono: s.invoice_amount||0,
    accessories:[], discount:'', payMode: s.payment_method||'', payLines:[],
    chargeType: s.sale_type === 'completa' ? 'completa' : 'inscripcion',
    sale_notes: s.sale_notes, titularSame:true, titular:null,
    modelPhotoUrl, finData,
  }, isRes ? 'reserva' : 'venta');
}

// ─── Vista principal ──────────────────────────────────────────────────────────

export function SalesView({ user, realBranches }) {
  const isAdmin      = CAN_ADMIN.includes(user.role);
  const canCreate    = CAN_CREATE.includes(user.role);
  const isSuperAdmin = user.role === 'super_admin';
  const isMobile     = useIsMobile();

  const [sales,    setSales]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [sellers,  setSellers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selSale,  setSelSale]  = useState(null);
  const [showNew,  setShowNew]  = useState(null);

  const [q,              setQ]              = useState('');
  const [debouncedQ,     setDebouncedQ]     = useState('');
  const [fromDate,       setFromDate]       = useState('');
  const [toDate,         setToDate]         = useState('');
  const [fBranch,        setFBranch]        = useState('');
  const [fSeller,        setFSeller]        = useState('');
  const [fType,          setFType]          = useState('');
  const [confirmDeleteId,setConfirmDeleteId]= useState(null);
  const [deleting,       setDeleting]       = useState(false);
  const [deleteMsg,      setDeleteMsg]      = useState('');
  const [deleteErr,      setDeleteErr]      = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (debouncedQ) params.q         = debouncedQ;
      if (fromDate)   params.from      = fromDate;
      if (toDate)     params.to        = toDate;
      if (fBranch)    params.branch_id = fBranch;
      if (fSeller && isAdmin) params.seller_id = fSeller;
      if (fType)      params.status    = fType;

      const [salesRes, statsRes] = await Promise.all([
        api.getSales(params),
        api.getSalesStats({ from: fromDate, to: toDate, branch_id: fBranch,
                            ...(isAdmin && fSeller ? { seller_id: fSeller } : {}) }),
      ]);
      setSales(salesRes.data || []);
      setStats(statsRes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [debouncedQ, fromDate, toDate, fBranch, fSeller, fType, isAdmin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isAdmin) {
      api.getSellers().then(s => setSellers(s || [])).catch(() => {});
    } else if (user.role === 'vendedor') {
      setSellers([{ id: user.id, first_name: user.fn, last_name: user.ln }]);
    }
  }, [isAdmin, user.id]);

  const hasFilters = q || fromDate || toDate || fBranch || fSeller || fType;
  const clearFilters = () => { setQ(''); setDebouncedQ(''); setFromDate(''); setToDate(''); setFBranch(''); setFSeller(''); setFType(''); };

  const handleDeleted = (deletedId, ticketIdWas) => {
    setSales(prev => prev.filter(s => s.id !== deletedId));
    setSelSale(null);
    setStats(prev => prev ? { ...prev, total: Math.max(0, (prev.total || 1) - 1) } : prev);
    if (ticketIdWas) {
      setDeleteMsg('Venta eliminada. La unidad volvió a Disponible. Revisa el ticket vinculado si es necesario.');
      setTimeout(() => setDeleteMsg(''), 6000);
    }
  };

  const handleDeleteRow = async (sale) => {
    setDeleting(true); setDeleteErr('');
    try {
      const res = await api.deleteSale(sale.id, sale.is_note_only);
      handleDeleted(sale.id, res.ticket_id_was);
    } catch (e) { setDeleteErr(e.message || 'Error al eliminar'); }
    finally { setDeleting(false); setConfirmDeleteId(null); }
  };

  // ── Columnas de la tabla desktop ──
  // cliente+fecha | moto+chasis | vendedor+sucursal | precio+saldo | estado (chips) | acciones
  const tplCols = isAdmin
    ? '72px minmax(200px,1.2fr) minmax(150px,1fr) minmax(130px,0.9fr) 120px minmax(260px,1fr) 68px'
    : '72px minmax(200px,1.2fr) minmax(150px,1fr) minmax(120px,0.9fr) 120px minmax(220px,1fr) 68px';
  const tplHeaders = isAdmin
    ? ['', 'Cliente', 'Moto', 'Vendedor · Sucursal', 'Precio', 'Estado', '']
    : ['', 'Cliente', 'Moto', 'Vendedor', 'Precio', 'Estado', ''];

  return (
    <div style={{ fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <ViewHeader
        preheader="Operaciones · Comercial"
        title="Ventas"
        count={sales.length}
        itemLabel={fType === 'reservada' ? 'reserva' : fType === 'vendida' ? 'venta' : 'registro'}
        filtered={hasFilters}
        actions={canCreate && (
          <>
            <button onClick={() => setShowNew('reserva')} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#FFFFFF', border: '1.5px solid #374151', color: '#374151',
              borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', padding: '8px 14px', fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}>
              <Ic.plus size={13} color="#374151" /> Reserva
            </button>
            <button onClick={() => setShowNew('venta')} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#F28100', border: 'none', color: '#FFFFFF',
              borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', padding: '8px 14px', fontFamily: 'inherit',
              whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(242,129,0,0.30)',
            }}>
              <Ic.plus size={13} color="#fff" /> Nueva venta
            </button>
          </>
        )}
      />

      {/* ── Mensajes de estado ── */}
      {deleteMsg && (
        <div style={{
          marginBottom: 12, padding: '10px 16px', borderRadius: 8,
          fontSize: 12, fontFamily: 'inherit',
          background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534',
        }}>
          {deleteMsg}
        </div>
      )}
      {deleteErr && <ErrorMsg msg={deleteErr} />}

      {/* ── KPIs — solo lo esencial, cards grandes y claros ── */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '140px' : '180px'}, 1fr))`,
          gap: 12, marginBottom: 20,
        }}>
          {(() => {
            const pendDocs = (stats.sin_factura_cli || 0) + (stats.sin_homologacion || 0) + (stats.sin_inscripcion || 0);
            const cards = [
              {
                label: 'Registros',
                val: stats.total ?? 0,
                sub: stats.total > 0 ? `${sales.filter(s => s.status === 'vendida').length} ventas · ${sales.filter(s => s.status === 'reservada').length} reservas` : 'sin actividad',
                color: '#0F172A',
              },
              ...(isAdmin && stats.total_venta > 0 ? [{
                label: 'Monto facturado',
                val: `$${((stats.total_venta || 0) / 1_000_000).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`,
                sub: `$${(stats.total_venta || 0).toLocaleString('es-CL')}`,
                color: '#15803D',
              }] : []),
              {
                label: 'Reservas activas',
                val: stats.pendiente_entrega ?? 0,
                sub: stats.pendiente_entrega > 0 ? 'esperando entrega' : 'sin pendientes',
                color: stats.pendiente_entrega > 0 ? '#713F12' : '#9CA3AF',
              },
              {
                label: 'Docs pendientes',
                val: pendDocs,
                sub: pendDocs > 0
                  ? [stats.sin_factura_cli ? `${stats.sin_factura_cli} factura` : null,
                     stats.sin_homologacion ? `${stats.sin_homologacion} homol.` : null,
                     stats.sin_inscripcion ? `${stats.sin_inscripcion} inscr.` : null,
                    ].filter(Boolean).join(' · ')
                  : 'todo al día',
                color: pendDocs > 0 ? '#0F172A' : '#9CA3AF',
              },
              ...(isAdmin ? [{
                label: 'Pend. distribuidor',
                val: stats.pendiente_distribuidor ?? 0,
                sub: stats.pendiente_distribuidor > 0 ? 'sin pagar al distribuidor' : 'todo pagado',
                color: stats.pendiente_distribuidor > 0 ? '#0F172A' : '#9CA3AF',
              }] : []),
            ];
            return cards.map(k => (
              <div key={k.label} style={{
                background: '#FFFFFF', border: '1px solid #EAECEF',
                borderRadius: 12, padding: '16px 18px',
                boxShadow: '0 1px 3px rgba(16,24,40,0.04), 0 1px 2px rgba(16,24,40,0.02)',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#9CA3AF',
                  textTransform: 'uppercase', letterSpacing: '0.09em',
                  marginBottom: 8, fontFamily: 'inherit',
                }}>
                  {k.label}
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 800, color: k.color,
                  lineHeight: 1, letterSpacing: '-0.03em',
                  fontFamily: 'inherit', marginBottom: 6,
                }}>
                  {k.val}
                </div>
                <div style={{
                  fontSize: 11, color: '#6B7280', fontWeight: 500,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {k.sub}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* ── Filtros ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E7EB',
        borderRadius: 10, padding: '12px 16px',
        marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Búsqueda */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Ic.search size={13} color="#9CA3AF" style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none',
            }}/>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar cliente, moto, chasis…"
              style={{ ...S.inp, paddingLeft: 32, fontSize: 12, height: 34, border: '1px solid #E5E7EB' }}
            />
          </div>
          {/* Chips tipo */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ v: '', l: 'Todas' }, { v: 'reservada', l: 'Reservas' }, { v: 'vendida', l: 'Ventas' }].map(t => (
              <button key={t.v} onClick={() => setFType(t.v)} style={{
                padding: '5px 12px', borderRadius: 99, border: '1px solid',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.12s',
                borderColor: fType === t.v ? '#F28100' : '#E5E7EB',
                background:  fType === t.v ? 'rgba(242,129,0,0.07)' : '#FFFFFF',
                color:       fType === t.v ? '#C2680A' : '#6B7280',
              }}>
                {t.l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            title="Desde"
            style={{ ...selectCtrl, height: 34, flex: '1 1 120px', minWidth: 100, fontSize: 12 }}/>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            title="Hasta"
            style={{ ...selectCtrl, height: 34, flex: '1 1 120px', minWidth: 100, fontSize: 12 }}/>
          {isAdmin && realBranches.length > 0 && (
            <select value={fBranch} onChange={e => setFBranch(e.target.value)}
              style={{ ...selectCtrl, height: 34, flex: '1 1 120px', minWidth: 110, fontSize: 12 }}>
              <option value="">Sucursal</option>
              {realBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {isAdmin && sellers.length > 0 && (
            <select value={fSeller} onChange={e => setFSeller(e.target.value)}
              style={{ ...selectCtrl, height: 34, flex: '1 1 120px', minWidth: 110, fontSize: 12 }}>
              <option value="">Vendedor</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          )}
          {hasFilters && (
            <button onClick={clearFilters} style={{
              ...S.gh, height: 34, fontSize: 12, fontWeight: 600,
              border: '1px solid #E5E7EB', borderRadius: 8,
              padding: '0 12px', flexShrink: 0, color: '#6B7280',
            }}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Contenido: mobile cards / desktop tabla ── */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 13, fontFamily: 'inherit' }}>
              Cargando…
            </div>
          )}
          {!loading && sales.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Sin ventas</div>
              <div style={{ fontSize: 12 }}>{hasFilters ? 'Prueba con otros filtros' : 'No hay ventas registradas aún'}</div>
            </div>
          )}
          {!loading && sales.map(s => {
            const isRes      = s.status === 'reservada';
            const sellerName = s.seller_fn ? `${s.seller_fn} ${s.seller_ln || ''}`.trim() : '—';
            const docsOk     = !!(s.doc_factura_cli && s.doc_homologacion && s.doc_inscripcion);
            const docCount   = [s.doc_factura_dist, s.doc_factura_cli, s.doc_homologacion, s.doc_inscripcion].filter(Boolean).length;
            const saldo      = s.sale_price > 0 ? Math.max(0, s.sale_price - (s.invoice_amount || 0)) : null;
            const accentColor = isRes ? '#CA8A04' : '#10B981';
            return (
              <div key={s.id} onClick={() => setSelSale(s)} style={{
                background: '#FFFFFF',
                border: '1px solid #EAECEF',
                borderLeft: `3px solid ${accentColor}`,
                borderRadius: 10, overflow: 'hidden',
                display: 'flex', alignItems: 'stretch',
                cursor: 'pointer', boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
              }}>
                {/* Foto del modelo */}
                <div style={{
                  width: 92, flexShrink: 0,
                  background: s.image_url ? '#F9FAFB' : 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.image_url ? (
                    <img src={s.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                  ) : (
                    <Ic.bike size={32} color="#D1D5DB"/>
                  )}
                </div>

                {/* Contenido */}
                <div style={{
                  flex: 1, minWidth: 0, padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 5,
                }}>
                  {/* pill + fecha + precio */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
                        background: isRes ? '#FEF08A' : '#D1FAE5',
                        color: isRes ? '#713F12' : '#065F46',
                        textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                      }}>
                        {isRes ? 'Reserva' : 'Venta'}
                      </span>
                      <span style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                        {fD(s.sold_at)}
                      </span>
                      {s.ticket_num && (
                        <span style={{ fontSize: 10, color: '#F28100', fontWeight: 700, flexShrink: 0 }}>
                          #{s.ticket_num}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 800, color: s.sale_price ? '#0F172A' : '#D1D5DB',
                      letterSpacing: '-0.02em', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {s.sale_price ? fmt(s.sale_price) : '—'}
                    </div>
                  </div>

                  {/* Cliente */}
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: s.client_name ? '#0F172A' : '#9CA3AF',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    letterSpacing: '-0.01em',
                  }}>
                    {s.client_name || 'Sin cliente'}
                  </div>

                  {/* Moto */}
                  <div style={{
                    fontSize: 12, color: '#374151',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <strong style={{ fontWeight: 700 }}>{s.brand} {s.model}</strong>
                    {(s.year || s.color) && (
                      <span style={{ color: '#6B7280' }}>
                        {' · '}{[s.year, s.color].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>

                  {/* Saldo + chips */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 1 }}>
                    {isRes && s.sale_price > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: saldo > 0 ? '#DC2626' : '#059669',
                      }}>
                        {saldo > 0 ? `Falta ${fmt(saldo)}` : '✓ Saldado'}
                      </span>
                    )}
                    {isRes ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                        background: '#FEF08A', color: '#713F12', whiteSpace: 'nowrap',
                      }}>
                        Pend. entrega
                      </span>
                    ) : (
                      <>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                          background: s.delivered ? '#D1FAE5' : '#F1F5F9',
                          color: s.delivered ? '#065F46' : '#475569', whiteSpace: 'nowrap',
                        }}>
                          {s.delivered ? '✓ Entreg.' : 'Sin entreg.'}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                          background: docsOk ? '#D1FAE5' : docCount > 0 ? '#FEF9C3' : '#F3F4F6',
                          color: docsOk ? '#065F46' : docCount > 0 ? '#854D0E' : '#9CA3AF',
                          whiteSpace: 'nowrap',
                        }}>
                          Docs {docCount}/4
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      ) : (

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ── Estado vacío / cargando ── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', fontSize: 13, fontFamily: 'inherit' }}>
              Cargando…
            </div>
          )}
          {!loading && sales.length === 0 && (
            <div style={{ textAlign: 'center', padding: 56, color: '#9CA3AF', fontFamily: 'inherit',
              background:'#FFFFFF', border:'1px solid #EAECEF', borderRadius:14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Sin ventas</div>
              <div style={{ fontSize: 12 }}>{hasFilters ? 'Prueba con otros filtros' : 'No hay ventas registradas aún'}</div>
            </div>
          )}

          {/* ── Cards (mismo patrón que Leads) ── */}
          {!loading && sales.map(s => {
            const isRes      = s.status === 'reservada';
            const sellerName = s.seller_fn ? `${s.seller_fn} ${s.seller_ln || ''}`.trim() : '—';
            const docsOk     = !!(s.doc_factura_cli && s.doc_homologacion && s.doc_inscripcion);
            const docCount   = [s.doc_factura_dist, s.doc_factura_cli, s.doc_homologacion, s.doc_inscripcion].filter(Boolean).length;
            const saldo      = s.sale_price > 0 ? Math.max(0, s.sale_price - (s.invoice_amount || 0)) : null;
            const accentBg   = isRes ? '#FEFCE8' : '#ECFDF5';
            const accentFg   = isRes ? '#713F12' : '#065F46';
            const accentChip = isRes ? '#FEF08A' : '#D1FAE5';
            return (
              <div
                key={s.id}
                onClick={() => setSelSale(s)}
                style={{
                  display: 'flex', alignItems: 'stretch',
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB', borderRadius: 14,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  minHeight: 148,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = '#E5E7EB';
                }}
              >
                {/* Foto del modelo — 220px */}
                <div style={{
                  width: 220, flexShrink: 0,
                  background: `linear-gradient(135deg, ${accentBg} 0%, #F3F4F6 100%)`,
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  {s.image_url ? (
                    <img src={s.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                  ) : (
                    <Ic.bike size={56} color={accentFg}/>
                  )}
                  {s.added_as_sold && (
                    <span style={{
                      position:'absolute', top:8, left:8,
                      fontSize:9, fontWeight:800, color:'#7C3AED',
                      background:'#EDE9FE', borderRadius:4, padding:'2px 7px',
                      letterSpacing:'0.06em', fontFamily:'inherit',
                    }}>
                      BODEGA
                    </span>
                  )}
                </div>

                {/* Contenido central */}
                <div style={{
                  flex: 1, padding: '16px 20px',
                  display: 'flex', flexDirection: 'column',
                  justifyContent: 'center', gap: 8, minWidth: 0,
                }}>
                  {/* Nombre cliente */}
                  <div style={{
                    fontSize: 17, fontWeight: 700,
                    color: s.client_name ? '#111827' : '#9CA3AF',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontFamily: 'inherit', letterSpacing: '-0.01em',
                  }}>
                    {s.client_name || 'Sin cliente'}
                    {s.client_rut && (
                      <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, marginLeft: 8 }}>
                        {s.client_rut}
                      </span>
                    )}
                  </div>

                  {/* Marca + modelo + año + color */}
                  <div style={{ display:'flex', alignItems:'center', gap: 8, flexWrap:'wrap', minWidth: 0 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: '#4B5563',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {s.brand} {s.model}
                    </span>
                    {s.year && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#4F46E5',
                        background: '#EEF2FF', padding: '2px 7px', borderRadius: 6,
                        flexShrink: 0,
                      }}>
                        {s.year}
                      </span>
                    )}
                    {s.color && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: '#6B7280',
                        background: '#F9FAFB', padding: '2px 8px', borderRadius: 6,
                        flexShrink: 0,
                      }}>
                        {s.color}
                      </span>
                    )}
                  </div>

                  {/* Meta chips: vendedor, sucursal, chassis */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {s.seller_fn && (() => {
                      const sc = colorFor(s.seller_id || sellerName);
                      return (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5,
                          fontSize: 11, fontWeight: 700, color: sc.c,
                          background: sc.bg, padding: '3px 9px', borderRadius: 99,
                          border: `1px solid ${sc.c}30`,
                        }}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:sc.c,flexShrink:0}}/>
                          {sellerName}
                        </span>
                      );
                    })()}
                    {isAdmin && s.branch_name && (() => {
                      const bc = colorFor(s.branch_id || s.branch_name);
                      return (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5,
                          fontSize: 11, fontWeight: 700, color: bc.c,
                          background: bc.bg, padding: '3px 9px', borderRadius: 99,
                          border: `1px solid ${bc.c}30`,
                        }}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:bc.c,flexShrink:0}}/>
                          {s.branch_name}
                        </span>
                      );
                    })()}
                    {s.chassis && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: '#9CA3AF',
                        padding: '3px 0', whiteSpace: 'nowrap',
                      }}>
                        {s.chassis}
                      </span>
                    )}
                    {s.ticket_num && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#F28100',
                      }}>
                        #{s.ticket_num}
                      </span>
                    )}
                  </div>

                  {/* Chips de estado de docs / entrega / distribuidor */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {isRes ? (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                        background: '#FEF08A', color: '#713F12',
                      }}>
                        Pend. entrega
                      </span>
                    ) : (
                      <>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          background: s.delivered ? '#D1FAE5' : '#F1F5F9',
                          color: s.delivered ? '#065F46' : '#475569',
                        }}>
                          {s.delivered ? '✓ Entregada' : 'Sin entregar'}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          background: docsOk ? '#D1FAE5' : docCount > 0 ? '#FEF9C3' : '#F3F4F6',
                          color: docsOk ? '#065F46' : docCount > 0 ? '#854D0E' : '#9CA3AF',
                        }}>
                          Docs {docCount}/4
                        </span>
                        {isAdmin && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: s.distributor_paid ? '#D1FAE5' : '#F1F5F9',
                            color: s.distributor_paid ? '#065F46' : '#475569',
                          }}>
                            {s.distributor_paid ? '✓ Distribuidor' : 'Pend. distribuidor'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Zona derecha: precio, estado, fecha, acciones */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-end', justifyContent: 'center',
                  padding: '16px 20px', flexShrink: 0, gap: 8, minWidth: 170,
                  borderLeft: '1px dashed #F3F4F6',
                }}>
                  {/* Pill Venta/Reserva */}
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    padding: '4px 12px', borderRadius: 99,
                    background: accentChip, color: accentFg,
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {isRes ? 'Reserva' : 'Venta'}
                  </span>

                  {/* Precio */}
                  <div style={{
                    fontSize: 18, fontWeight: 800,
                    color: s.sale_price ? '#0F172A' : '#D1D5DB',
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.sale_price ? fmt(s.sale_price) : '—'}
                  </div>

                  {/* Saldo */}
                  {isRes && s.sale_price > 0 && (
                    <div style={{
                      fontSize: 11, fontWeight: 700,
                      color: saldo > 0 ? '#DC2626' : '#059669',
                      whiteSpace: 'nowrap',
                    }}>
                      {saldo > 0 ? `Falta ${fmt(saldo)}` : '✓ Saldado'}
                    </div>
                  )}

                  {/* Fecha + acciones */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {fD(s.sold_at)}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button
                        title={isRes ? 'Ver nota de reserva' : 'Ver nota de venta'}
                        onClick={() => openNoteFromSale(s)}
                        style={{
                          padding: '5px 7px', borderRadius: 7,
                          border: '1px solid #E5E7EB', background: '#FFFFFF',
                          color: '#6B7280', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                      </button>
                      {isSuperAdmin && confirmDeleteId === s.id ? (
                        <>
                          <button onClick={() => handleDeleteRow(s)} disabled={deleting} style={{
                            padding: '5px 9px', borderRadius: 7, border: 'none',
                            background: '#EF4444', color: '#fff',
                            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            {deleting ? '…' : 'Borrar'}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} style={{
                            padding: '5px 8px', borderRadius: 7,
                            border: '1px solid #E5E7EB', background: '#F9FAFB',
                            color: '#6B7280', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            No
                          </button>
                        </>
                      ) : isSuperAdmin ? (
                        <button onClick={() => setConfirmDeleteId(s.id)} title="Eliminar" style={{
                          padding: '5px 7px', borderRadius: 7,
                          border: '1px solid #FECACA', background: '#FFFFFF',
                          color: '#F87171', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center',
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* ── Contador ── */}
      {!loading && sales.length > 0 && (
        <div style={{ textAlign: 'right', fontSize: 11, color: '#9CA3AF', marginTop: 8, fontFamily: 'inherit' }}>
          {sales.filter(s => s.status === 'vendida').length} venta{sales.filter(s => s.status === 'vendida').length !== 1 ? 's' : ''}
          {' · '}
          {sales.filter(s => s.status === 'reservada').length} reserva{sales.filter(s => s.status === 'reservada').length !== 1 ? 's' : ''}
        </div>
      )}

      {/* ── Modales ── */}
      {selSale && (
        <SaleDetailModal
          sale={selSale}
          user={user}
          sellers={sellers}
          branches={realBranches || []}
          onClose={() => setSelSale(null)}
          onUpdated={() => { load(); setSelSale(null); }}
        />
      )}
      {showNew && (
        <NewSaleModal
          noteType={showNew}
          user={user}
          sellers={sellers}
          branches={realBranches || []}
          onClose={() => { setShowNew(null); load(); }}
          onCreated={() => load()}
        />
      )}
    </div>
  );
}
