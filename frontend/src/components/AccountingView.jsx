import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, TY, Modal, ROLES, hasRole, ViewHeader, Loader, Empty, ErrorMsg, useIsMobile } from '../ui.jsx';

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function $(n) {
  if (!n && n !== 0) return '-';
  return '$\u2009' + parseInt(n).toLocaleString('es-CL');
}
function fd(s) {
  if (!s) return '-';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return (!y || !m || !d) ? '-' : `${d}-${m}-${y}`;
}
function rutFmt(r) {
  if (!r) return '-';
  const s = String(r).replace(/\./g, '');
  if (s.includes('-')) return s.toUpperCase();
  if (s.length < 2) return s;
  return (s.slice(0, -1) + '-' + s.slice(-1)).toUpperCase();
}

/* ── Status badge ─────────────────────────────────────────────────────────── */
const LINK_STATUS = {
  vinculada:    { l: 'Vinculada',    c: '#15803D', bg: 'rgba(21,128,61,0.10)'  },
  revisar:      { l: 'Revisar',      c: '#D97706', bg: 'rgba(217,119,6,0.10)'  },
  sin_vincular: { l: 'Sin vincular', c: '#6B7280', bg: 'rgba(107,114,128,0.10)'},
};
function LinkBadge({ status }) {
  const s = LINK_STATUS[status] || LINK_STATUS.sin_vincular;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.c, background: s.bg,
      borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>
      {s.l}
    </span>
  );
}

/* ── InvoiceRow (card mobile / row desktop) ───────────────────────────────── */
function InvoiceRow({ inv, onOpen, isMobile }) {
  const modelo = inv.brand || inv.model
    ? [inv.brand, inv.model, inv.commercial_year].filter(Boolean).join(' ')
    : null;

  const isNC     = inv.doc_type === 'nota_credito';
  const anulada  = !!inv.anulada_por_id;
  const folioLbl = isNC ? `NC ${inv.folio || '-'}` : inv.folio || '-';

  if (isMobile) {
    return (
      <div onClick={() => onOpen(inv)} style={{
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
        padding: '12px 14px', marginBottom: 10, cursor: 'pointer',
        opacity: anulada ? 0.65 : 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{folioLbl}</span>
            {anulada && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', borderRadius: 20, padding: '2px 8px' }}>ANULADA</span>}
            {isNC && inv.ref_folio && <span style={{ fontSize: 10, color: '#6B7280' }}>→ #{inv.ref_folio}</span>}
          </div>
          <LinkBadge status={inv.link_status} />
        </div>
        <div style={{ ...TY.meta, marginBottom: 2 }}>{inv.cliente_nombre || inv.rut_cliente || '-'}</div>
        {modelo && <div style={{ ...TY.meta, color: '#6B7280' }}>{modelo}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>{fd(inv.fecha_emision)}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: isNC ? '#DC2626' : '#111827' }}>
            {isNC ? '-' : ''}{$(inv.total)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <tr onClick={() => onOpen(inv)} style={{ cursor: 'pointer', opacity: anulada ? 0.65 : 1 }}
      className="crm-tr-hover">
      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
        {folioLbl}
        {anulada && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', borderRadius: 20, padding: '2px 8px' }}>ANULADA</span>}
        {isNC && inv.ref_folio && <span style={{ marginLeft: 6, fontSize: 10, color: '#6B7280' }}>→ #{inv.ref_folio}</span>}
      </td>
      <td style={{ padding: '10px 12px' }}>{fd(inv.fecha_emision)}</td>
      <td style={{ padding: '10px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {inv.cliente_nombre || '-'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6B7280' }}>{rutFmt(inv.rut_cliente)}</td>
      <td style={{ padding: '10px 12px', fontSize: 12 }}>{modelo || '-'}</td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6B7280' }}>{inv.chassis || '-'}</td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isNC ? '#DC2626' : '#111827' }}>
        {isNC ? '-' : ''}{$(inv.total)}
      </td>
      <td style={{ padding: '10px 12px' }}><LinkBadge status={inv.link_status} /></td>
    </tr>
  );
}

/* ── InvoiceDetail modal ──────────────────────────────────────────────────── */
function InvoiceDetail({ inv, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(inv.notes || '');

  async function saveNotes() {
    setSaving(true);
    try {
      const r = await api.patchAccounting(inv.id, { notes, link_status: inv.link_status });
      onUpdated(r);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const Row = ({ label, val }) => val ? (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: '#6B7280', minWidth: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, wordBreak: 'break-all' }}>{val}</span>
    </div>
  ) : null;

  return (
    <Modal onClose={onClose} title={`${inv.doc_type === 'nota_credito' ? 'Nota de crédito' : 'Factura'} N° ${inv.folio || '-'}`}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <LinkBadge status={inv.link_status} />
          {inv.anulada_por_id && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', borderRadius: 20, padding: '3px 10px' }}>
              ANULADA POR NC
            </span>
          )}
          {inv.pdf_url && (
            <a href={inv.pdf_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: '#F28100', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Ic.file size={13} color="#F28100" /> Ver PDF
            </a>
          )}
        </div>

        {/* Referencia (nota de crédito) */}
        {inv.doc_type === 'nota_credito' && inv.ref_folio && (
          <div style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid #FCA5A5', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ ...TY.micro, color: '#DC2626', marginBottom: 8 }}>ANULA FACTURA</div>
            <Row label="Folio factura" val={`#${inv.ref_folio}`} />
            <Row label="Fecha factura" val={fd(inv.ref_fecha)} />
          </div>
        )}

        {/* Cliente */}
        <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ ...TY.micro, color: '#9CA3AF', marginBottom: 8 }}>CLIENTE</div>
          <Row label="Nombre" val={inv.cliente_nombre} />
          <Row label="RUT" val={rutFmt(inv.rut_cliente)} />
          <Row label="Direccion" val={inv.cliente_direccion} />
          <Row label="Comuna" val={inv.cliente_comuna} />
          <Row label="Giro" val={inv.cliente_giro} />
        </div>

        {/* Vehículo */}
        {(inv.brand || inv.model || inv.chassis) && (
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ ...TY.micro, color: '#9CA3AF', marginBottom: 8 }}>VEHICULO</div>
            <Row label="Marca" val={inv.brand} />
            <Row label="Modelo" val={inv.model} />
            <Row label="Color" val={inv.color} />
            <Row label="Año" val={inv.commercial_year} />
            <Row label="Chasis" val={inv.chassis} />
            <Row label="Motor" val={inv.motor_num} />
          </div>
        )}

        {/* Montos */}
        <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ ...TY.micro, color: '#9CA3AF', marginBottom: 8 }}>MONTOS</div>
          <Row label="Fecha emisión" val={fd(inv.fecha_emision)} />
          <Row label="Neto" val={$(inv.monto_neto)} />
          <Row label="IVA" val={$(inv.iva)} />
          {inv.monto_exento > 0 && <Row label="Exento" val={$(inv.monto_exento)} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid #E5E7EB', fontSize: 14 }}>
            <span style={{ color: '#6B7280', minWidth: 130 }}>Total</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{$(inv.total)}</span>
          </div>
        </div>

        {/* Cruces */}
        {(inv.ticket_num || inv.inv_chassis || inv.sn_model) && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ ...TY.micro, color: '#F28100', marginBottom: 8 }}>VINCULADO CON</div>
            {inv.ticket_num && <Row label="Lead" val={`#${inv.ticket_num} — ${inv.first_name || ''} ${inv.last_name || ''}`.trim()} />}
            {inv.inv_chassis && <Row label="Inventario" val={`${inv.inv_chassis} (${inv.inv_status || ''})`} />}
            {inv.sn_model && <Row label="Nota de venta" val={`${inv.sn_brand || ''} ${inv.sn_model || ''} — ${fd(inv.sold_at)}`} />}
          </div>
        )}

        {/* Notas */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...S.lbl, marginBottom: 4, display: 'block' }}>Notas internas</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ ...S.inp, width: '100%', resize: 'vertical', fontSize: 13 }}
          />
        </div>

        <button onClick={saveNotes} disabled={saving} style={{ ...S.btn, width: '100%' }}>
          {saving ? 'Guardando...' : 'Guardar notas'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export function AccountingView({ user }) {
  const isMobile = useIsMobile();
  const [data, setData]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState(null);

  // Filtros
  const [tab, setTab]           = useState('facturas'); // facturas | notas | otras
  const [q, setQ]               = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [desde, setDesde]       = useState('');
  const [hasta, setHasta]       = useState('');
  const [page, setPage]         = useState(1);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { source: 'emitida', page, limit: LIMIT };
      // "Otras" = documentos de emisores que no son Maosbike (category='otras').
      // Facturas / Notas se filtran por doc_type y por NOT category='otras'
      // (eso se decide en el parser cuando lee el RUT emisor).
      if (tab === 'otras') {
        params.category = 'otras';
      } else if (tab === 'notas') {
        params.doc_type = 'nota_credito';
      } else {
        params.doc_type = 'factura';
      }
      if (q)          params.q = q;
      if (linkStatus) params.link_status = linkStatus;
      if (desde)      params.desde = desde;
      if (hasta)      params.hasta = hasta;
      const r = await api.getAccounting(params);
      setData(r.data || []);
      setTotal(r.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab, q, linkStatus, desde, hasta, page]);

  useEffect(() => { load(); }, [load]);

  async function syncDrive() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await api.syncAccountingFromDrive();
      setSyncResult(r);
      load();
    } catch (e) {
      setSyncResult({ error: e.message });
    } finally {
      setSyncing(false);
    }
  }

  function handleUpdated(updated) {
    setData(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
    setSelected(prev => prev ? { ...prev, ...updated } : prev);
  }

  const thStyle = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };

  const sinVinc = data.filter(d => d.link_status === 'sin_vincular').length;
  const revisar = data.filter(d => d.link_status === 'revisar').length;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ViewHeader
        title="Contabilidad"
        subtitle="Facturas emitidas"
        actions={
          <button onClick={syncDrive} disabled={syncing}
            style={{ ...S.btn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Ic.refresh size={14} color="#fff" />
            {syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
          </button>
        }
      />

      {/* Sync result */}
      {syncResult && (
        <div style={{
          background: syncResult.error ? 'rgba(220,38,38,0.06)' : 'rgba(21,128,61,0.06)',
          border: `1px solid ${syncResult.error ? '#FCA5A5' : '#86EFAC'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13,
        }}>
          {syncResult.error
            ? <span style={{ color: '#DC2626' }}>{syncResult.error}</span>
            : (
              <>
                <div style={{ color: '#15803D' }}>
                  {syncResult.archivos_leidos} archivos — {syncResult.created} creados, {syncResult.updated} actualizados
                  {syncResult.errors?.length > 0 && <>, <strong>{syncResult.errors.length} con errores</strong></>}
                </div>
                {syncResult.errors?.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: '#DC2626' }}>
                      Ver errores ({syncResult.errors.length})
                    </summary>
                    <ul style={{ margin: '8px 0 0 0', padding: '0 0 0 18px', fontSize: 12, color: '#7F1D1D', maxHeight: 200, overflow: 'auto' }}>
                      {syncResult.errors.map((err, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>{err}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )
          }
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #E5E7EB' }}>
        {[
          { key: 'facturas', label: 'Facturas' },
          { key: 'notas',    label: 'Notas de crédito' },
          { key: 'otras',    label: 'Otras' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid #F28100' : '2px solid transparent',
              color: tab === t.key ? '#F28100' : '#6B7280',
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: 13,
              padding: '8px 14px',
              cursor: 'pointer',
              marginBottom: -1,
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Total facturas', val: total, color: '#374151' },
            { label: 'Vinculadas', val: data.filter(d => d.link_status === 'vinculada').length, color: '#15803D' },
            { label: 'Sin vincular', val: sinVinc, color: '#6B7280' },
            { label: 'Revisar', val: revisar, color: '#D97706' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid #E5E7EB',
              borderRadius: 10, padding: '10px 16px', fontSize: 12, minWidth: 100 }}>
              <div style={{ color: '#9CA3AF', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input
          placeholder="Folio, RUT, cliente, chasis..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          style={{ ...S.inp, width: 220, height: 36, fontSize: 13 }}
        />
        <select value={linkStatus} onChange={e => { setLinkStatus(e.target.value); setPage(1); }}
          style={{ height: 36, borderRadius: 8, border: '1px solid #D1D5DB', background: '#F9FAFB',
            color: '#374151', fontSize: 13, padding: '0 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <option value="">Todos los estados</option>
          <option value="vinculada">Vinculadas</option>
          <option value="revisar">Revisar</option>
          <option value="sin_vincular">Sin vincular</option>
        </select>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }}
          style={{ ...S.inp, height: 36, fontSize: 13, width: 150 }} />
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }}
          style={{ ...S.inp, height: 36, fontSize: 13, width: 150 }} />
        {(q || linkStatus || desde || hasta) && (
          <button onClick={() => { setQ(''); setLinkStatus(''); setDesde(''); setHasta(''); setPage(1); }}
            style={{ ...S.gh, height: 36, fontSize: 13 }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Content */}
      {error && <ErrorMsg msg={error} onRetry={load} />}
      {loading && <Loader />}

      {!loading && !error && data.length === 0 && (
        <Empty
          icon={Ic.invoice}
          title="Sin facturas"
          hint={syncing ? 'Sincronizando...' : 'Sincroniza desde Drive para importar facturas.'}
        />
      )}

      {!loading && !error && data.length > 0 && (
        isMobile ? (
          <div>
            {data.map(inv => (
              <InvoiceRow key={inv.id} inv={inv} onOpen={setSelected} isMobile />
            ))}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Folio', 'Fecha', 'Cliente', 'RUT', 'Modelo', 'Chasis', 'Total', 'Estado'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(inv => (
                  <InvoiceRow key={inv.id} inv={inv} onOpen={setSelected} isMobile={false} />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Paginación */}
      {total > LIMIT && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={S.gh}>
            Anterior
          </button>
          <span style={{ fontSize: 13, color: '#6B7280', alignSelf: 'center' }}>
            Página {page} de {Math.ceil(total / LIMIT)}
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / LIMIT)} style={S.gh}>
            Siguiente
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <InvoiceDetail
          inv={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
