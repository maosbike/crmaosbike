import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Ic, S, TY, Bdg, Modal, ViewHeader, Loader, Empty, ErrorMsg, useIsMobile } from '../ui.jsx';

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

/* ── Estado de la factura ─────────────────────────────────────────────────── */
// El "estado" aquí mezcla tipo de documento + resultado del cruce:
//   · Anulada (NC la cancela)      → rojo
//   · NC suelta                    → rojo "NC"
//   · Vinculada (lead + stock)     → verde
//   · Revisar (match parcial)      → ámbar
//   · Sin vincular                 → gris
// Se usa para el borde izquierdo del card, el gradiente de fondo de la foto
// y el pill de estado — mismo patrón que SupplierPaymentsView.
function invoiceStatus(inv) {
  if (inv.anulada_por_id) {
    return { k:'anulada', l:'Anulada', c:'#DC2626', bg:'rgba(220,38,38,0.10)' };
  }
  if (inv.doc_type === 'nota_credito') {
    return { k:'nc', l:'Nota crédito', c:'#DC2626', bg:'rgba(220,38,38,0.10)' };
  }
  if (inv.link_status === 'vinculada') {
    return { k:'vinc', l:'Vinculada', c:'#15803D', bg:'rgba(21,128,61,0.10)' };
  }
  if (inv.link_status === 'revisar') {
    return { k:'rev', l:'Revisar', c:'#D97706', bg:'rgba(217,119,6,0.10)' };
  }
  return { k:'sin', l:'Sin vincular', c:'#6B7280', bg:'rgba(107,114,128,0.10)' };
}
const STATUS_BG = {
  anulada: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
  nc:      'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
  vinc:    'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)',
  rev:     'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
  sin:     'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)',
};
const STATUS_ICON = {
  anulada: '#DC2626',
  nc:      '#DC2626',
  vinc:    '#059669',
  rev:     '#D97706',
  sin:     '#9CA3AF',
};

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

/* ── Drive viewer URL helper ──────────────────────────────────────────────── */
// El PDF del DTE vive en Drive (carpeta Maosbike/Facturas Emitidas). Usamos la
// URL del visor de Drive para abrir sin descargar, evitando el Cloudinary URL
// (que dispara download). Si no tenemos drive_file_id — sync antiguo, etc. —
// caemos a pdf_url.
function pdfViewerUrl(inv) {
  if (inv.drive_file_id) return `https://drive.google.com/file/d/${inv.drive_file_id}/view`;
  return inv.pdf_url || null;
}

/* ── InvoiceCard (RowCard estilo SupplierPayments) ────────────────────────── */
function InvoiceCard({ inv, onOpen }) {
  const [hov, setHov] = useState(false);
  const st       = invoiceStatus(inv);
  const isNC     = inv.doc_type === 'nota_credito';
  const modelo   = [inv.brand, inv.model].filter(Boolean).join(' ');
  const folioLbl = isNC ? `NC ${inv.folio || '—'}` : (inv.folio || '—');
  const img      = inv.model_image_url || null;
  const pdfUrl   = pdfViewerUrl(inv);

  return (
    <div
      onClick={() => onOpen(inv)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:'flex', alignItems:'stretch',
        minHeight:148, marginBottom:10,
        background:'#FFFFFF',
        border:'1px solid #E5E7EB',
        borderLeft:`4px solid ${st.c}`,
        borderRadius:14, overflow:'hidden',
        cursor:'pointer',
        boxShadow: hov ? '0 6px 16px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Foto */}
      <div style={{
        width:220, flexShrink:0,
        background: STATUS_BG[st.k] || '#F3F4F6',
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', position:'relative',
      }}>
        {img
          ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <Ic.bike size={56} color={STATUS_ICON[st.k] || '#9CA3AF'}/>
        }
        {st.k === 'anulada' && (
          <span style={{
            position:'absolute', top:8, left:8,
            fontSize:9, fontWeight:800, color:'#991B1B',
            background:'rgba(254,226,226,0.95)', borderRadius:4, padding:'2px 7px',
            letterSpacing:'0.06em', border:'1px solid #FCA5A5',
          }}>
            ANULADA
          </span>
        )}
        {isNC && !inv.anulada_por_id && (
          <span style={{
            position:'absolute', top:8, left:8,
            fontSize:9, fontWeight:800, color:'#991B1B',
            background:'rgba(254,226,226,0.95)', borderRadius:4, padding:'2px 7px',
            letterSpacing:'0.06em', border:'1px solid #FCA5A5',
          }}>
            NC
          </span>
        )}
      </div>

      {/* Contenido — jerarquía: folio/fecha → cliente → vehículo → meta */}
      <div style={{
        flex:1, minWidth:0,
        padding:'14px 18px',
        display:'flex', flexDirection:'column', justifyContent:'center',
        gap:6,
      }}>
        {/* Línea 1: folio + fecha + ref NC */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{
            fontSize:15, fontWeight:800,
            color: isNC ? '#DC2626' : '#4F46E5',
            letterSpacing:'-0.2px',
            background: isNC ? '#FEE2E2' : '#EEF2FF',
            border:`1px solid ${isNC ? '#FCA5A5' : '#C7D2FE'}`,
            padding:'1px 10px', borderRadius:6,
          }}>
            #{folioLbl}
          </div>
          <span style={{ fontSize:11, fontWeight:600, color:'#9CA3AF' }}>
            {fd(inv.fecha_emision)}
          </span>
          {isNC && inv.ref_folio && (
            <span style={{ fontSize:10, fontWeight:600, color:'#DC2626' }}>
              anula #{inv.ref_folio}
            </span>
          )}
        </div>

        {/* Línea 2: cliente — es el dato primario del card */}
        <div style={{
          fontSize:15, fontWeight:700, color:'#0F172A',
          letterSpacing:'-0.2px',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {inv.cliente_nombre || <span style={{ color:'#9CA3AF', fontStyle:'italic', fontWeight:500 }}>Sin cliente</span>}
        </div>

        {/* Línea 3: vehículo como texto limpio con bullets */}
        {modelo && (
          <div style={{
            fontSize:12, fontWeight:600, color:'#374151',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          }}>
            {modelo}
            {inv.commercial_year && <span style={{ color:'#9CA3AF', fontWeight:500 }}> · {inv.commercial_year}</span>}
            {inv.color && <span style={{ color:'#9CA3AF', fontWeight:500 }}> · {inv.color}</span>}
          </div>
        )}

        {/* Línea 4: chasis + RUT como meta secundaria */}
        {(inv.chassis || inv.rut_cliente) && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
            fontSize:11, fontWeight:500, color:'#9CA3AF',
          }}>
            {inv.chassis && (
              <span style={{ letterSpacing:'0.03em', fontWeight:600, color:'#6B7280' }}>
                {inv.chassis}
              </span>
            )}
            {inv.rut_cliente && (
              <span>RUT {rutFmt(inv.rut_cliente)}</span>
            )}
          </div>
        )}
      </div>

      {/* Zona derecha: estado + monto + PDF */}
      <div style={{
        width:200, flexShrink:0,
        padding:'14px 18px',
        borderLeft:'1px dashed #E5E7EB',
        display:'flex', flexDirection:'column', justifyContent:'space-between',
        alignItems:'flex-end', textAlign:'right', gap:6,
      }}>
        <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
        <div>
          <div style={{
            fontSize:18, fontWeight:800,
            color: isNC ? '#DC2626' : '#0F172A',
            letterSpacing:'-0.5px', lineHeight:1,
          }}>
            {isNC ? '−' : ''}{$(inv.total)}
          </div>
          {inv.iva > 0 && (
            <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', marginTop:3 }}>
              IVA {$compact(inv.iva)}
            </div>
          )}
        </div>
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize:10, fontWeight:700, color:'#F28100', textDecoration:'none',
              display:'inline-flex', alignItems:'center', gap:4,
              background:'rgba(242,129,0,0.08)',
              border:'1px solid rgba(242,129,0,0.2)',
              padding:'3px 8px', borderRadius:6,
            }}
          >
            <Ic.file size={11} color="#F28100" /> PDF
          </a>
        ) : <span/>}
      </div>
    </div>
  );
}

/* ── DetailCard / DetailRow (mismo patrón que SupplierPaymentsView) ───────── */
function DetailCard({ title, accent='#374151', children }) {
  return (
    <div style={{
      background:'#FFFFFF', border:'1px solid #E5E7EB',
      borderRadius:12, overflow:'hidden',
    }}>
      <div style={{
        padding:'10px 16px', background:'#F9FAFB',
        borderBottom:'1px solid #F3F4F6',
        display:'flex', alignItems:'center', gap:8,
      }}>
        <span style={{ width:3, height:14, background:accent, borderRadius:2 }}/>
        <span style={{ fontSize:12, fontWeight:700, color:'#111827', letterSpacing:'0.01em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
        {children}
      </div>
    </div>
  );
}
function DetailRow({ label, value, bold, danger, span }) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  return (
    <div style={{ gridColumn: span ? '1/-1' : 'auto', minWidth:0 }}>
      <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:2 }}>
        {label}
      </div>
      <div style={{
        fontSize:14, fontWeight: bold ? 700 : 500,
        color: danger ? '#DC2626' : '#111827',
        letterSpacing:'-0.1px',
        wordBreak:'break-word',
      }}>
        {value}
      </div>
    </div>
  );
}

/* ── InvoiceDetail modal ──────────────────────────────────────────────────── */
function InvoiceDetail({ inv, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes]   = useState(inv.notes || '');

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

  const st     = invoiceStatus(inv);
  const isNC   = inv.doc_type === 'nota_credito';
  const pdfUrl = pdfViewerUrl(inv);
  const img    = inv.model_image_url || null;
  const modelo = [inv.brand, inv.model].filter(Boolean).join(' ');

  return (
    <Modal onClose={onClose} title={`${isNC ? 'Nota de crédito' : 'Factura'} N° ${inv.folio || '—'}`}>
      <div style={{ maxWidth: 620, width: '100%', display:'flex', flexDirection:'column', gap:12 }}>

        {/* Hero: foto + folio + cliente + total */}
        <div style={{
          display:'flex', alignItems:'stretch', minHeight:140,
          background:'#FFFFFF', border:'1px solid #E5E7EB',
          borderLeft:`4px solid ${st.c}`,
          borderRadius:12, overflow:'hidden',
          boxShadow:'0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            width:170, flexShrink:0,
            background: STATUS_BG[st.k] || '#F3F4F6',
            display:'flex', alignItems:'center', justifyContent:'center',
            overflow:'hidden',
          }}>
            {img
              ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : <Ic.bike size={48} color={STATUS_ICON[st.k] || '#9CA3AF'}/>
            }
          </div>
          <div style={{
            flex:1, padding:'14px 18px',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            gap:14, flexWrap:'wrap', minWidth:0,
          }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#9CA3AF', marginBottom:2 }}>
                {isNC ? 'Nota de crédito' : 'Factura'}
              </div>
              <div style={{ fontSize:22, fontWeight:800, color:'#0F172A', letterSpacing:'-0.5px', marginBottom:4 }}>
                #{inv.folio || '—'}
              </div>
              <div style={{
                fontSize:13, fontWeight:700, color:'#111827',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:280,
              }}>
                {inv.cliente_nombre || <span style={{ color:'#9CA3AF', fontStyle:'italic', fontWeight:500 }}>Sin cliente</span>}
              </div>
              {modelo && (
                <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>
                  {modelo}{inv.commercial_year ? ` · ${inv.commercial_year}` : ''}{inv.color ? ` · ${inv.color}` : ''}
                </div>
              )}
            </div>
            <div style={{ textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
              <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
              <div style={{
                fontSize:22, fontWeight:800,
                color: isNC ? '#DC2626' : '#0F172A',
                letterSpacing:'-0.5px',
              }}>
                {isNC ? '−' : ''}{$(inv.total)}
              </div>
              <div style={{ fontSize:11, fontWeight:600, color:'#6B7280' }}>
                {fd(inv.fecha_emision)}
              </div>
            </div>
          </div>
        </div>

        {/* Acción PDF */}
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            style={{
              fontSize:13, fontWeight:700, color:'#fff', background:'#F28100',
              textDecoration:'none',
              display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
              padding:'10px 14px', borderRadius:10, alignSelf:'flex-start',
            }}>
            <Ic.file size={14} color="#fff" /> Ver PDF
          </a>
        )}

        {/* Ref NC */}
        {isNC && inv.ref_folio && (
          <DetailCard title="ANULA FACTURA" accent="#DC2626">
            <DetailRow label="Folio factura" value={`#${inv.ref_folio}`} bold/>
            <DetailRow label="Fecha factura" value={fd(inv.ref_fecha)} />
          </DetailCard>
        )}

        {/* Cliente */}
        <DetailCard title="CLIENTE" accent="#4F46E5">
          <DetailRow label="Nombre" value={inv.cliente_nombre} bold span/>
          <DetailRow label="RUT" value={inv.rut_cliente ? rutFmt(inv.rut_cliente) : null} />
          <DetailRow label="Comuna" value={inv.cliente_comuna} />
          <DetailRow label="Dirección" value={inv.cliente_direccion} span/>
        </DetailCard>

        {/* Vehículo */}
        {(inv.brand || inv.model || inv.chassis) && (
          <DetailCard title="VEHÍCULO" accent="#F28100">
            <DetailRow label="Marca" value={inv.brand} bold/>
            <DetailRow label="Modelo" value={inv.model} bold/>
            <DetailRow label="Color" value={inv.color} />
            <DetailRow label="Año" value={inv.commercial_year} />
            <DetailRow label="Chasis" value={inv.chassis} />
            <DetailRow label="Motor" value={inv.motor_num} />
          </DetailCard>
        )}

        {/* Montos */}
        <DetailCard title="MONTOS" accent="#15803D">
          <DetailRow label="Fecha emisión" value={fd(inv.fecha_emision)} />
          <DetailRow label="Neto" value={$(inv.monto_neto)} />
          <DetailRow label="IVA" value={$(inv.iva)} />
          {inv.monto_exento > 0 && <DetailRow label="Exento" value={$(inv.monto_exento)} />}
          <DetailRow label="Total" value={$(inv.total)} bold danger={isNC} span/>
        </DetailCard>

        {/* Vinculaciones */}
        {(inv.ticket_num || inv.inv_chassis || inv.sn_model) && (
          <DetailCard title="VINCULADO CON" accent="#F28100">
            {inv.ticket_num && (
              <DetailRow
                label="Lead"
                value={`#${inv.ticket_num} — ${[inv.first_name, inv.last_name].filter(Boolean).join(' ')}`.trim()}
                span
              />
            )}
            {inv.inv_chassis && (
              <DetailRow label="Inventario" value={`${inv.inv_chassis} (${inv.inv_status || '—'})`} span/>
            )}
            {inv.sn_model && (
              <DetailRow label="Nota de venta" value={`${inv.sn_brand || ''} ${inv.sn_model || ''} — ${fd(inv.sold_at)}`} span/>
            )}
          </DetailCard>
        )}

        {/* Notas internas */}
        <div style={{
          background:'#FFFFFF', border:'1px solid #E5E7EB',
          borderRadius:12, overflow:'hidden',
        }}>
          <div style={{
            padding:'10px 16px', background:'#F9FAFB',
            borderBottom:'1px solid #F3F4F6',
            display:'flex', alignItems:'center', gap:8,
          }}>
            <span style={{ width:3, height:14, background:'#6B7280', borderRadius:2 }}/>
            <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>NOTAS INTERNAS</span>
          </div>
          <div style={{ padding:'12px 16px' }}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ ...S.inp, width:'100%', resize:'vertical', fontSize:13 }}
            />
            <button onClick={saveNotes} disabled={saving}
              style={{ ...S.btn, marginTop:8, width:'100%' }}>
              {saving ? 'Guardando...' : 'Guardar notas'}
            </button>
          </div>
        </div>
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
      const params = { source: 'emitida', page, limit: LIMIT, desde, hasta, tab };
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
          { key: 'facturas', label: 'Ventas de motos' },
          { key: 'notas',    label: 'Notas de crédito' },
          { key: 'otras',    label: 'Otras / anuladas' },
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
          title={`Sin ${tab === 'notas' ? 'notas de crédito' : tab === 'otras' ? 'otras facturas' : 'ventas de motos'} en ${ymLabel(ym)}`}
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
