import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Ic, S, TY, Modal, ViewHeader, Loader, Empty, ErrorMsg, useIsMobile } from '../ui.jsx';

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function $(n) {
  if (!n && n !== 0) return '-';
  return '$\u2009' + parseInt(n).toLocaleString('es-CL');
}
function $compact(n) {
  const v = parseInt(n) || 0;
  if (v >= 1_000_000) return '$\u2009' + (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (v >= 1_000)     return '$\u2009' + Math.round(v / 1_000) + 'k';
  return '$\u2009' + v.toLocaleString('es-CL');
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

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function ymLabel(ym) {
  if (!ym) return '-';
  const [y, m] = String(ym).split('-');
  return `${MESES[parseInt(m) - 1] || ''} ${y}`;
}
function ymShort(ym) {
  if (!ym) return '-';
  const [y, m] = String(ym).split('-');
  return `${(MESES[parseInt(m) - 1] || '').slice(0,3)} ${String(y).slice(2)}`;
}
function currentYM() { return new Date().toISOString().slice(0, 7); }
function shiftYM(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
    <span style={{ fontSize: 10, fontWeight: 600, color: s.c, background: s.bg,
      borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
      {s.l}
    </span>
  );
}

/* ── Month hero ───────────────────────────────────────────────────────────── */
function MonthHero({ stats, ym, onPrev, onNext, loading, isMobile }) {
  const mes = stats?.mes || { count: 0, neto: 0, iva: 0, total: 0, exento: 0 };
  const serie = stats?.serie || [];
  const maxTotal = serie.reduce((mx, r) => Math.max(mx, Number(r.total) || 0), 0) || 1;

  const KPI = ({ label, value, accent }) => (
    <div style={{
      flex: 1, minWidth: 130,
      background: 'rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: accent || '#fff', letterSpacing: '-0.01em' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{
      background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
      borderRadius: 16,
      padding: isMobile ? '16px' : '20px 24px',
      marginBottom: 16,
      color: '#fff',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={onPrev} style={{
          background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff',
          width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
        }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
            Resumen del mes
          </div>
          <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {ymLabel(ym)}
          </div>
        </div>
        <button onClick={onNext} style={{
          background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff',
          width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
        }}>›</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: serie.length ? 14 : 0, opacity: loading ? 0.4 : 1 }}>
        <KPI label="Total facturado" value={$(mes.total)} accent="#F28100" />
        <KPI label="Neto" value={$(mes.neto)} />
        <KPI label="IVA 19%" value={$(mes.iva)} />
        <KPI label="Facturas" value={mes.count} />
      </div>

      {/* Mini bar chart — últimos 12 meses */}
      {serie.length > 1 && (
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Últimos 12 meses
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 48 }}>
            {serie.map(r => {
              const h = Math.max(4, Math.round((Number(r.total) || 0) / maxTotal * 48));
              const isActive = r.ym === ym;
              return (
                <div key={r.ym} title={`${ymLabel(r.ym)} — ${$compact(r.total)}`}
                  style={{
                    flex: 1, height: h,
                    background: isActive ? '#F28100' : 'rgba(255,255,255,0.25)',
                    borderRadius: 3,
                    transition: 'height 0.2s',
                  }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {serie.map(r => (
              <div key={r.ym} style={{
                flex: 1, textAlign: 'center',
                fontSize: 8, color: r.ym === ym ? '#F28100' : 'rgba(255,255,255,0.35)',
                fontWeight: r.ym === ym ? 700 : 500,
              }}>
                {ymShort(r.ym).split(' ')[0]}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── InvoiceCard (unificado mobile+desktop) ───────────────────────────────── */
function InvoiceCard({ inv, onOpen }) {
  const isNC     = inv.doc_type === 'nota_credito';
  const anulada  = !!inv.anulada_por_id;
  const modelo   = [inv.brand, inv.model, inv.commercial_year].filter(Boolean).join(' ');
  const folioLbl = isNC ? `NC ${inv.folio || '-'}` : inv.folio || '-';

  return (
    <div onClick={() => onOpen(inv)} style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
      padding: '14px 16px', cursor: 'pointer',
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) auto',
      gap: 12, alignItems: 'center',
      opacity: anulada ? 0.6 : 1,
      transition: 'all 0.15s',
      position: 'relative',
    }}
    className="acc-card"
    >
      {/* Left: info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 800,
            color: isNC ? '#DC2626' : '#F28100',
            background: isNC ? 'rgba(220,38,38,0.08)' : 'rgba(242,129,0,0.08)',
            padding: '2px 8px', borderRadius: 6,
            letterSpacing: '0.02em',
          }}>
            {folioLbl}
          </span>
          {anulada && (
            <span style={{ fontSize: 9, fontWeight: 800, color: '#DC2626', background: 'rgba(220,38,38,0.1)', borderRadius: 20, padding: '2px 8px', letterSpacing: '0.04em' }}>
              ANULADA
            </span>
          )}
          {isNC && inv.ref_folio && (
            <span style={{ fontSize: 10, color: '#6B7280' }}>→ factura #{inv.ref_folio}</span>
          )}
          <LinkBadge status={inv.link_status} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {inv.cliente_nombre || <span style={{ color: '#9CA3AF', fontStyle: 'italic', fontWeight: 500 }}>Sin cliente</span>}
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {inv.rut_cliente && <span>{rutFmt(inv.rut_cliente)}</span>}
          {modelo && <span>·  {modelo}</span>}
          {inv.chassis && <span style={{ fontFamily: 'monospace', fontSize: 11 }}>· {inv.chassis}</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
          {fd(inv.fecha_emision)}
        </div>
      </div>

      {/* Right: amount + actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{
          fontSize: 16, fontWeight: 800,
          color: isNC ? '#DC2626' : '#111827',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>
          {isNC ? '−' : ''}{$(inv.total)}
        </div>
        {inv.pdf_url && (
          <a
            href={inv.pdf_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 11, color: '#F28100', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(242,129,0,0.08)',
              padding: '4px 10px', borderRadius: 6,
              fontWeight: 600,
            }}
          >
            <Ic.file size={12} color="#F28100" /> PDF
          </a>
        )}
      </div>
    </div>
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
      <span style={{ fontWeight: 500, wordBreak: 'break-word' }}>{val}</span>
    </div>
  ) : null;

  const isNC = inv.doc_type === 'nota_credito';

  return (
    <Modal onClose={onClose} title={`${isNC ? 'Nota de crédito' : 'Factura'} N° ${inv.folio || '-'}`}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <LinkBadge status={inv.link_status} />
          {inv.anulada_por_id && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', borderRadius: 20, padding: '3px 10px' }}>
              ANULADA POR NC
            </span>
          )}
          {inv.pdf_url && (
            <a href={inv.pdf_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: '#fff', background: '#F28100', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, fontWeight: 600, marginLeft: 'auto' }}>
              <Ic.file size={13} color="#fff" /> Ver PDF
            </a>
          )}
        </div>

        {/* Referencia (nota de crédito) */}
        {isNC && inv.ref_folio && (
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
          <Row label="Dirección" val={inv.cliente_direccion} />
          <Row label="Comuna" val={inv.cliente_comuna} />
          <Row label="Giro" val={inv.cliente_giro} />
        </div>

        {/* Vehículo */}
        {(inv.brand || inv.model || inv.chassis) && (
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ ...TY.micro, color: '#9CA3AF', marginBottom: 8 }}>VEHÍCULO</div>
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
export function AccountingView() {
  const isMobile = useIsMobile();
  const [data, setData]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState(null);

  // Mes activo → filtra la lista y el hero.
  const [ym, setYm]             = useState(currentYM());
  const [stats, setStats]       = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Tabs
  const [tab, setTab]           = useState('facturas');
  const [q, setQ]               = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [page, setPage]         = useState(1);
  const LIMIT = 50;

  // Rango del mes activo (primer y último día)
  const { desde, hasta } = useMemo(() => {
    const [y, m] = ym.split('-').map(Number);
    const first = `${ym}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${ym}-${String(lastDay).padStart(2, '0')}`;
    return { desde: first, hasta: last };
  }, [ym]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await api.getAccountingStats({ month: ym });
      setStats(r);
    } catch { /* noop */ }
    finally { setStatsLoading(false); }
  }, [ym]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { source: 'emitida', page, limit: LIMIT, desde, hasta };
      if (tab === 'otras')      params.category = 'otras';
      else if (tab === 'notas') params.doc_type = 'nota_credito';
      else                      params.doc_type = 'factura';
      if (q)          params.q = q;
      if (linkStatus) params.link_status = linkStatus;
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
  useEffect(() => { loadStats(); }, [loadStats]);

  async function syncDrive() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await api.syncAccountingFromDrive();
      setSyncResult(r);
      load();
      loadStats();
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

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        .acc-card:hover { border-color: #D1D5DB !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
        .acc-tab { position: relative; }
      `}</style>

      <ViewHeader
        title="Contabilidad"
        subtitle={ymLabel(ym)}
        actions={
          <button onClick={syncDrive} disabled={syncing}
            style={{ ...S.btn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Ic.refresh size={14} color="#fff" />
            {syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
          </button>
        }
      />

      <MonthHero
        stats={stats}
        ym={ym}
        loading={statsLoading}
        isMobile={isMobile}
        onPrev={() => setYm(shiftYM(ym, -1))}
        onNext={() => setYm(shiftYM(ym, +1))}
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid #E5E7EB' }}>
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

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Folio, RUT, cliente, chasis..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          style={{ ...S.inp, flex: 1, minWidth: 180, height: 36, fontSize: 13 }}
        />
        <select value={linkStatus} onChange={e => { setLinkStatus(e.target.value); setPage(1); }}
          style={{ height: 36, borderRadius: 8, border: '1px solid #D1D5DB', background: '#F9FAFB',
            color: '#374151', fontSize: 13, padding: '0 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <option value="">Todos</option>
          <option value="vinculada">Vinculadas</option>
          <option value="revisar">Revisar</option>
          <option value="sin_vincular">Sin vincular</option>
        </select>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>
          {loading ? '...' : `${total} ${total === 1 ? 'documento' : 'documentos'}`}
        </span>
      </div>

      {/* Content */}
      {error && <ErrorMsg msg={error} onRetry={load} />}
      {loading && <Loader />}

      {!loading && !error && data.length === 0 && (
        <Empty
          icon={Ic.invoice}
          title={`Sin ${tab === 'notas' ? 'notas de crédito' : tab === 'otras' ? 'otras facturas' : 'facturas'} en ${ymLabel(ym)}`}
          hint={syncing ? 'Sincronizando...' : 'Probá con otro mes o sincroniza desde Drive.'}
        />
      )}

      {!loading && !error && data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map(inv => (
            <InvoiceCard key={inv.id} inv={inv} onOpen={setSelected} />
          ))}
        </div>
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
