import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Ic, S, TY, Bdg, Modal, ViewHeader, Loader, Empty, ErrorMsg, useIsMobile, useToast } from '../ui.jsx';

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
    // Las NC sin impacto contable (corrección de datos del receptor) van en
    // azul/info — la factura original sigue vigente. Sólo las NC de anulación
    // se muestran en rojo.
    if (inv.ref_tipo === 'correccion') {
      return { k:'nc-corr', l:'NC · corrección', c:'#4F46E5', bg:'rgba(79,70,229,0.10)' };
    }
    if (inv.ref_tipo === 'ajuste') {
      return { k:'nc-aj', l:'NC · ajuste', c:'#D97706', bg:'rgba(217,119,6,0.10)' };
    }
    return { k:'nc', l:'NC · anulación', c:'#DC2626', bg:'rgba(220,38,38,0.10)' };
  }
  if (inv.link_status === 'vinculada') {
    return { k:'vinc', l:'Vinculada', c:'#15803D', bg:'rgba(21,128,61,0.10)' };
  }
  if (inv.link_status === 'revisar') {
    return { k:'rev', l:'Revisar', c:'#D97706', bg:'rgba(217,119,6,0.10)' };
  }
  return { k:'sin', l:'Sin vincular', c:'var(--text-subtle)', bg:'rgba(107,114,128,0.10)' };
}
const STATUS_BG = {
  anulada: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
  nc:      'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
  vinc:    'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)',
  rev:     'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
  sin:     'linear-gradient(135deg, var(--surface-sunken) 0%, var(--border) 100%)',
};
const STATUS_ICON = {
  anulada: '#DC2626',
  nc:      '#DC2626',
  vinc:    '#059669',
  rev:     '#D97706',
  sin:     'var(--text-disabled)',
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
      borderRadius: 'var(--radius-lg)', padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: accent || 'var(--text-on-dark)', letterSpacing: '-0.01em' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--text) 0%, var(--text-strong) 100%)',
      borderRadius: 'var(--radius-xl)',
      padding: isMobile ? '16px' : '20px 24px',
      marginBottom: 16,
      color: 'var(--text-on-dark)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={onPrev} style={{
          background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text-on-dark)',
          width: 32, height: 32, borderRadius: 'var(--radius-md)', cursor: 'pointer',
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
          background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text-on-dark)',
          width: 32, height: 32, borderRadius: 'var(--radius-md)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
        }}>›</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: serie.length ? 14 : 0, opacity: loading ? 0.4 : 1 }}>
        <KPI label="Total facturado" value={$(mes.total)} accent="var(--brand)" />
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
                    background: isActive ? 'var(--brand)' : 'rgba(255,255,255,0.25)',
                    borderRadius: 'var(--radius-xs)',
                    transition: 'height 0.2s',
                  }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {serie.map(r => (
              <div key={r.ym} style={{
                flex: 1, textAlign: 'center',
                fontSize: 8, color: r.ym === ym ? 'var(--brand)' : 'rgba(255,255,255,0.35)',
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

/* ── Color-aware image helper ─────────────────────────────────────────────── */
// Mismo patrón que SupplierPaymentsView.motoImg: si el catálogo tiene
// color_photos y el color de la factura matchea uno del array, devolvemos la
// foto específica para ese color. Si no, fallback a la imagen genérica del
// modelo (model_image_url). Esto arregla casos donde la factura dice "AZUL"
// pero la foto mostrada era la "NEGRA" genérica.
function motoImg(inv) {
  if (inv.model_color_photos && inv.color) {
    const cp = typeof inv.model_color_photos === 'string'
      ? (() => { try { return JSON.parse(inv.model_color_photos); } catch { return []; } })()
      : (inv.model_color_photos || []);
    if (Array.isArray(cp)) {
      const want = String(inv.color).toLowerCase().trim();
      // Exact match primero; si no, por prefijo (por si color en DTE dice
      // "AZUL PERLA" y el catalogo tiene "AZUL").
      const match = cp.find(c => c.color && String(c.color).toLowerCase().trim() === want)
                  || cp.find(c => c.color && want.startsWith(String(c.color).toLowerCase().trim()))
                  || cp.find(c => c.color && String(c.color).toLowerCase().trim().startsWith(want));
      if (match?.url) return match.url;
    }
  }
  return inv.model_image_url || null;
}

/* ── Catalog model/color pickers (copiados de SupplierPaymentsView) ───────── */
function CatalogModelPicker({ brand, modelId, onSelect }) {
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [selBrand, setSelBrand] = useState(brand || '');
  useEffect(() => {
    api.getBrands().then(r => setBrands(Array.isArray(r) ? r : r.brands || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!selBrand) { setModels([]); return; }
    api.getModels({ brand: selBrand }).then(r => setModels(Array.isArray(r) ? r : r.data || [])).catch(() => {});
  }, [selBrand]);
  const sel = { height:36, borderRadius:'var(--radius-md)', border:'1px solid var(--border-strong)', background:'var(--surface-muted)', color:'var(--text-body)', fontSize:12, padding:'0 10px', cursor:'pointer', fontFamily:'inherit', outline:'none', width:'100%' };
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
      <div>
        <label style={{ fontSize:10, fontWeight:700, color:'var(--text-disabled)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5, display:'block' }}>Marca</label>
        <select value={selBrand} onChange={e => { setSelBrand(e.target.value); onSelect(null); }} style={sel}>
          <option value="">— Seleccionar —</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize:10, fontWeight:700, color:'var(--text-disabled)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5, display:'block' }}>Modelo del catálogo</label>
        <select value={modelId || ''} onChange={e => { const m = models.find(x => x.id === e.target.value); onSelect(m || null); }} style={sel} disabled={!selBrand}>
          <option value="">— Seleccionar —</option>
          {models.map(m => <option key={m.id} value={m.id}>{m.commercial_name || m.model} {m.year ? `(${m.year})` : ''}</option>)}
        </select>
      </div>
    </div>
  );
}

function catalogColorsFromRow(modelRow) {
  if (!modelRow) return [];
  const parseJson = (v) => typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return []; } })() : (v || []);
  const out = new Set();
  (parseJson(modelRow.colors) || []).forEach(c => { const v = typeof c === 'string' ? c : (c?.name || c?.color); if (v) out.add(String(v).trim()); });
  (parseJson(modelRow.color_photos) || []).forEach(c => { if (c?.color) out.add(String(c.color).trim()); });
  return Array.from(out);
}

/* ── InvoiceCard (RowCard estilo SupplierPayments) ────────────────────────── */
function InvoiceCard({ inv, onOpen }) {
  const [hov, setHov] = useState(false);
  const isMobile = useIsMobile();
  const st       = invoiceStatus(inv);
  const isNC     = inv.doc_type === 'nota_credito';
  const isRecib  = inv.source === 'recibida';
  const isMoto   = !isRecib || inv.category === 'motos';
  const modelo   = [inv.brand, inv.model].filter(Boolean).join(' ');
  const folioLbl = isNC ? `NC ${inv.folio || '—'}` : (inv.folio || '—');
  const img      = isMoto ? motoImg(inv) : null;
  const pdfUrl   = pdfViewerUrl(inv);

  // Para recibidas el "nombre" es el proveedor; para emitidas es el cliente.
  const partyName = isRecib ? inv.emisor_nombre : inv.cliente_nombre;
  const partyRut  = isRecib ? inv.rut_emisor    : inv.rut_cliente;
  const partyEmpty = isRecib ? 'Sin proveedor' : 'Sin cliente';

  // Badge de categoría — sólo en recibidas, da contexto rápido del gasto.
  const CAT_CFG = {
    motos:     { l:'Motos',     bg:'#EEF2FF', c:'#4F46E5', bd:'#C7D2FE' },
    partes:    { l:'Partes',    bg:'#ECFEFF', c:'#0E7490', bd:'#67E8F9' },
    servicios: { l:'Servicios', bg:'#F5F3FF', c:'#6D28D9', bd:'#C4B5FD' },
    municipal: { l:'Municipal', bg:'#FFF7ED', c:'#C2410C', bd:'#FDBA74' },
    otros:     { l:'Otros',     bg:'var(--surface-muted)', c:'var(--text-subtle)', bd:'var(--border)' },
  };
  const catCfg = isRecib ? (CAT_CFG[inv.category] || CAT_CFG.otros) : null;

  // ── Versión mobile: layout vertical compacto ───────────────────────────
  // El layout desktop (foto 220px + contenido + barra derecha 200px) no
  // entra en pantallas chicas — la fecha quedaba en 3 líneas, el monto
  // cortado y el chasis ilegible. Aquí: foto chica arriba-izq, todo el
  // texto en una columna que ocupa el ancho completo, monto y estado en
  // el footer.
  if (isMobile) {
    return (
      <div
        onClick={() => onOpen(inv)}
        style={{
          marginBottom:10,
          background:'var(--surface)',
          border:'1px solid var(--border)',
          borderLeft:`4px solid ${st.c}`,
          borderRadius:'var(--radius-xl)', overflow:'hidden',
          cursor:'pointer',
          boxShadow:'0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display:'flex', alignItems:'stretch' }}>
          {/* Foto chica */}
          <div style={{
            width:88, flexShrink:0,
            background: STATUS_BG[st.k] || 'var(--surface-sunken)',
            display:'flex', alignItems:'center', justifyContent:'center',
            overflow:'hidden', position:'relative',
          }}>
            {img
              ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : isMoto
                ? <Ic.bike size={32} color={STATUS_ICON[st.k] || 'var(--text-disabled)'}/>
                : <Ic.file size={32} color={STATUS_ICON[st.k] || 'var(--text-disabled)'}/>
            }
          </div>

          {/* Contenido */}
          <div style={{
            flex:1, minWidth:0, padding:'10px 12px',
            display:'flex', flexDirection:'column', gap:4,
          }}>
            {/* Folio + fecha + categoría + estado pill */}
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span style={{
                fontSize:12, fontWeight:800,
                color: isNC ? '#DC2626' : '#4F46E5',
                background: isNC ? '#FEE2E2' : '#EEF2FF',
                border:`1px solid ${isNC ? '#FCA5A5' : '#C7D2FE'}`,
                padding:'1px 8px', borderRadius:'var(--radius-sm)',
              }}>
                #{folioLbl}
              </span>
              {catCfg && (
                <span style={{
                  fontSize:9, fontWeight:700, textTransform:'uppercase',
                  letterSpacing:'0.04em',
                  color: catCfg.c, background: catCfg.bg,
                  border:`1px solid ${catCfg.bd}`,
                  padding:'1px 6px', borderRadius:'var(--radius-sm)',
                }}>
                  {catCfg.l}
                </span>
              )}
              <span style={{ fontSize:10, color:'var(--text-disabled)', whiteSpace:'nowrap' }}>
                {fd(inv.fecha_emision)}
              </span>
              <span style={{ marginLeft:'auto' }}>
                <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
              </span>
            </div>

            {/* Cliente / Proveedor */}
            <div style={{
              fontSize:13, fontWeight:700, color:'var(--text)',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            }}>
              {partyName || <span style={{ color:'var(--text-disabled)', fontStyle:'italic', fontWeight:500 }}>{partyEmpty}</span>}
            </div>

            {/* Vehículo (sólo cuando es moto) */}
            {modelo && isMoto && (
              <div style={{
                fontSize:11, fontWeight:600, color:'var(--text-body)',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              }}>
                {modelo}
                {inv.commercial_year && <span style={{ color:'var(--text-disabled)', fontWeight:500 }}> · {inv.commercial_year}</span>}
                {inv.color && <span style={{ color:'var(--text-disabled)', fontWeight:500 }}> · {inv.color}</span>}
              </div>
            )}

            {/* Descripción (recibidas no-moto): qué nos facturaron */}
            {isRecib && !isMoto && inv.descripcion && (
              <div style={{
                fontSize:11, color:'var(--text-body)', lineHeight:1.3,
                overflow:'hidden', textOverflow:'ellipsis',
                display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical',
              }}>
                {inv.descripcion}
              </div>
            )}

            {/* Footer: monto + PDF */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginTop:2 }}>
              <span style={{
                fontSize:14, fontWeight:800,
                color: isNC ? '#DC2626' : 'var(--text)',
                letterSpacing:'-0.3px',
              }}>
                {isNC ? '−' : ''}{$(inv.total)}
              </span>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize:10, fontWeight:700, color:'var(--brand)', textDecoration:'none',
                    display:'inline-flex', alignItems:'center', gap:4,
                    background:'var(--brand-soft)',
                    border:'1px solid var(--brand-muted)',
                    padding:'3px 8px', borderRadius:'var(--radius-sm)',
                  }}
                >
                  <Ic.file size={11} color="var(--brand)" /> PDF
                </a>
              )}
            </div>

            {/* Chasis / RUT al pie en línea sutil */}
            {((isMoto && inv.chassis) || partyRut) && (
              <div style={{
                display:'flex', gap:8, fontSize:10, color:'var(--text-disabled)',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                marginTop:2,
              }}>
                {isMoto && inv.chassis && <span style={{ fontWeight:600, color:'var(--text-subtle)' }}>{inv.chassis}</span>}
                {partyRut && <span>RUT {rutFmt(partyRut)}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Versión desktop (original) ─────────────────────────────────────────
  return (
    <div
      onClick={() => onOpen(inv)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:'flex', alignItems:'stretch',
        minHeight:148, marginBottom:10,
        background:'var(--surface)',
        border:'1px solid var(--border)',
        borderLeft:`4px solid ${st.c}`,
        borderRadius:'var(--radius-xl)', overflow:'hidden',
        cursor:'pointer',
        boxShadow: hov ? '0 6px 16px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Foto */}
      <div style={{
        width:220, flexShrink:0,
        background: STATUS_BG[st.k] || 'var(--surface-sunken)',
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', position:'relative',
      }}>
        {img
          ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : isMoto
            ? <Ic.bike size={56} color={STATUS_ICON[st.k] || 'var(--text-disabled)'}/>
            : <Ic.file size={56} color={STATUS_ICON[st.k] || 'var(--text-disabled)'}/>
        }
        {st.k === 'anulada' && (
          <span style={{
            position:'absolute', top:8, left:8,
            fontSize:9, fontWeight:800, color:'#991B1B',
            background:'rgba(254,226,226,0.95)', borderRadius:'var(--radius-xs)', padding:'2px 7px',
            letterSpacing:'0.06em', border:'1px solid #FCA5A5',
          }}>
            ANULADA
          </span>
        )}
        {isNC && !inv.anulada_por_id && (
          <span style={{
            position:'absolute', top:8, left:8,
            fontSize:9, fontWeight:800, color:'#991B1B',
            background:'rgba(254,226,226,0.95)', borderRadius:'var(--radius-xs)', padding:'2px 7px',
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
        {/* Línea 1: folio + categoría + fecha + ref NC */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{
            fontSize:15, fontWeight:800,
            color: isNC ? '#DC2626' : '#4F46E5',
            letterSpacing:'-0.2px',
            background: isNC ? '#FEE2E2' : '#EEF2FF',
            border:`1px solid ${isNC ? '#FCA5A5' : '#C7D2FE'}`,
            padding:'1px 10px', borderRadius:'var(--radius-sm)',
          }}>
            #{folioLbl}
          </div>
          {catCfg && (
            <span style={{
              fontSize:10, fontWeight:700, textTransform:'uppercase',
              letterSpacing:'0.04em',
              color: catCfg.c, background: catCfg.bg,
              border:`1px solid ${catCfg.bd}`,
              padding:'2px 8px', borderRadius:'var(--radius-sm)',
            }}>
              {catCfg.l}
            </span>
          )}
          <span style={{ fontSize:11, fontWeight:600, color:'var(--text-disabled)' }}>
            {fd(inv.fecha_emision)}
          </span>
          {isNC && inv.ref_folio && (
            <span style={{ fontSize:10, fontWeight:600, color:'#DC2626' }}>
              anula #{inv.ref_folio}
            </span>
          )}
        </div>

        {/* Línea 2: cliente / proveedor — dato primario */}
        <div style={{
          fontSize:15, fontWeight:700, color:'var(--text)',
          letterSpacing:'-0.2px',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {partyName || <span style={{ color:'var(--text-disabled)', fontStyle:'italic', fontWeight:500 }}>{partyEmpty}</span>}
        </div>

        {/* Línea 3: vehículo (sólo motos) */}
        {modelo && isMoto && (
          <div style={{
            fontSize:12, fontWeight:600, color:'var(--text-body)',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          }}>
            {modelo}
            {inv.commercial_year && <span style={{ color:'var(--text-disabled)', fontWeight:500 }}> · {inv.commercial_year}</span>}
            {inv.color && <span style={{ color:'var(--text-disabled)', fontWeight:500 }}> · {inv.color}</span>}
          </div>
        )}

        {/* Descripción (recibidas no-moto): qué nos facturaron */}
        {isRecib && !isMoto && inv.descripcion && (
          <div style={{
            fontSize:12, color:'var(--text-body)', lineHeight:1.4,
            overflow:'hidden', textOverflow:'ellipsis',
            display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical',
          }}>
            {inv.descripcion}
          </div>
        )}

        {/* Línea 4: chasis (motos) + RUT proveedor/cliente */}
        {((isMoto && inv.chassis) || partyRut) && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
            fontSize:11, fontWeight:500, color:'var(--text-disabled)',
          }}>
            {isMoto && inv.chassis && (
              <span style={{ letterSpacing:'0.03em', fontWeight:600, color:'var(--text-subtle)' }}>
                {inv.chassis}
              </span>
            )}
            {partyRut && (
              <span>RUT {rutFmt(partyRut)}</span>
            )}
          </div>
        )}
      </div>

      {/* Zona derecha: estado + monto + PDF */}
      <div style={{
        width:200, flexShrink:0,
        padding:'14px 18px',
        borderLeft:'1px dashed var(--border)',
        display:'flex', flexDirection:'column', justifyContent:'space-between',
        alignItems:'flex-end', textAlign:'right', gap:6,
      }}>
        <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
        <div>
          <div style={{
            fontSize:18, fontWeight:800,
            color: isNC ? '#DC2626' : 'var(--text)',
            letterSpacing:'-0.5px', lineHeight:1,
          }}>
            {isNC ? '−' : ''}{$(inv.total)}
          </div>
          {inv.iva > 0 && (
            <div style={{ fontSize:10, fontWeight:600, color:'var(--text-disabled)', marginTop:3 }}>
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
              fontSize:10, fontWeight:700, color:'var(--brand)', textDecoration:'none',
              display:'inline-flex', alignItems:'center', gap:4,
              background:'var(--brand-soft)',
              border:'1px solid var(--brand-muted)',
              padding:'3px 8px', borderRadius:'var(--radius-sm)',
            }}
          >
            <Ic.file size={11} color="var(--brand)" /> PDF
          </a>
        ) : <span/>}
      </div>
    </div>
  );
}

/* ── DetailCard / DetailRow (mismo patrón que SupplierPaymentsView) ───────── */
function DetailCard({ title, accent='var(--text-body)', children }) {
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', overflow:'hidden',
    }}>
      <div style={{
        padding:'10px 16px', background:'var(--surface-muted)',
        borderBottom:'1px solid var(--surface-sunken)',
        display:'flex', alignItems:'center', gap:8,
      }}>
        <span style={{ width:3, height:14, background:accent, borderRadius:'var(--radius-xs)' }}/>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', letterSpacing:'0.01em' }}>
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
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text-subtle)', marginBottom:2 }}>
        {label}
      </div>
      <div style={{
        fontSize:14, fontWeight: bold ? 700 : 500,
        color: danger ? '#DC2626' : 'var(--text)',
        letterSpacing:'-0.1px',
        wordBreak:'break-word',
      }}>
        {value}
      </div>
    </div>
  );
}

/* ── InvoiceDetail modal ──────────────────────────────────────────────────── */
// Layout de 2 columnas — aprovecha ancho de 1100px:
//   Izquierda  (420px): foto grande (color-aware) + identidad + montos.
//   Derecha   (1fr):    bloques informativos (cliente, vinculaciones, ref NC)
//                       + editor de vínculo con catálogo (model/color) + notas.
function InvoiceDetail({ inv, onClose, onSaved }) {
  const toast=useToast();
  const [saving, setSaving]   = useState(false);
  const [notes, setNotes]     = useState(inv.notes || '');
  // Estado del editor manual de catálogo/color. Si el usuario elige un
  // modelo del catálogo lo guardamos en selModel (el row completo); de ahí
  // sacamos los colores disponibles. `colorEdit` es el color crudo a persistir.
  const [modelId, setModelId] = useState(inv.model_id_resolved || null);
  const [selModel, setSelModel] = useState(null);
  const [colorEdit, setColorEdit] = useState(inv.color || '');
  // Crear venta desde factura (backfill de ventas anteriores al CRM).
  // Sólo visible si la factura todavía no tiene una venta vinculada.
  const [showCreateSale, setShowCreateSale] = useState(false);
  const [sellers, setSellers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [csForm, setCsForm] = useState({
    sold_by: '', branch_id: '',
    sold_at: inv.fecha_emision ? String(inv.fecha_emision).slice(0,10) : '',
    payment_method: '', charge_type: 'inscripcion',
    sale_price: inv.total || '',
  });
  const [csSaving, setCsSaving] = useState(false);
  useEffect(() => {
    if (!showCreateSale) return;
    api.getSellers?.().then(s => setSellers(Array.isArray(s) ? s : (s?.data || []))).catch(() => {});
    api.getBranches?.().then(b => setBranches(Array.isArray(b) ? b : (b?.data || []))).catch(() => {});
  }, [showCreateSale]);
  async function createSaleFromFactura() {
    if (!csForm.sold_by)   { toast.error('Elegí un vendedor'); return; }
    if (!csForm.branch_id) { toast.error('Elegí una sucursal'); return; }
    setCsSaving(true);
    try {
      const r = await api.createSaleFromInvoice(inv.id, {
        sold_by:        csForm.sold_by,
        branch_id:      csForm.branch_id,
        sold_at:        csForm.sold_at || null,
        payment_method: csForm.payment_method || null,
        charge_type:    csForm.charge_type,
        sale_price:     csForm.sale_price ? parseInt(csForm.sale_price) : null,
      });
      toast.success('Venta creada y vinculada');
      onSaved(r.invoice);
      setShowCreateSale(false);
    } catch (e) { toast.error(e.message); }
    finally { setCsSaving(false); }
  }
  // Cuando cambia el modelo elegido, precargamos la lista de colores y, si
  // el color actual no está en la lista, lo dejamos como "libre".
  useEffect(() => {
    if (!modelId) { setSelModel(null); return; }
    api.getModels({ brand: inv.brand || '' })
      .then(r => {
        const arr = Array.isArray(r) ? r : (r?.data || []);
        const m = arr.find(x => x.id === modelId);
        setSelModel(m || null);
      })
      .catch(() => {});
  }, [modelId, inv.brand]);

  async function saveNotes() {
    setSaving(true);
    try {
      const r = await api.patchAccounting(inv.id, { notes, link_status: inv.link_status });
      onSaved(r);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function saveModelColor() {
    setSaving(true);
    try {
      const payload = { model_id: modelId, color: colorEdit || null };
      if (selModel) {
        if (selModel.brand) payload.brand = selModel.brand;
        if (selModel.model) payload.model = selModel.model;
        if (selModel.year)  payload.commercial_year = selModel.year;
      }
      const r = await api.patchAccounting(inv.id, payload);
      onSaved(r);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const st       = invoiceStatus(inv);
  const isNC     = inv.doc_type === 'nota_credito';
  const pdfUrl   = pdfViewerUrl(inv);
  const img      = motoImg(inv);
  const modelo   = [inv.brand, inv.model].filter(Boolean).join(' ');
  const colorOpts = catalogColorsFromRow(selModel);

  const selStyle = { height:36, borderRadius:'var(--radius-md)', border:'1px solid var(--border-strong)', background:'var(--surface-muted)', color:'var(--text-body)', fontSize:12, padding:'0 10px', cursor:'pointer', fontFamily:'inherit', outline:'none', width:'100%' };

  return (
    <Modal onClose={onClose} maxWidth={1500}
      title={`${isNC ? 'Nota de crédito' : 'Factura'} N° ${inv.folio || '—'}`}>
      <div style={{
        display:'grid',
        gridTemplateColumns:'380px 1fr 1fr',
        gap:16,
        width:'100%',
        alignItems:'start',
      }}>

        {/* ── Columna IZQ: hero vertical (foto + identidad + total) ──────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderLeft:`4px solid ${st.c}`,
            borderRadius:'var(--radius-xl)', overflow:'hidden',
            boxShadow:'0 1px 2px rgba(0,0,0,0.04)',
          }}>
            {/* Foto grande: ocupa todo el ancho de la columna */}
            <div style={{
              width:'100%', aspectRatio:'4/3',
              background: STATUS_BG[st.k] || 'var(--surface-sunken)',
              display:'flex', alignItems:'center', justifyContent:'center',
              overflow:'hidden', position:'relative',
            }}>
              {img
                ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                : <Ic.bike size={80} color={STATUS_ICON[st.k] || 'var(--text-disabled)'}/>
              }
              {st.k === 'anulada' && (
                <span style={{
                  position:'absolute', top:10, left:10,
                  fontSize:10, fontWeight:800, color:'#991B1B',
                  background:'rgba(254,226,226,0.95)', borderRadius:'var(--radius-xs)', padding:'3px 9px',
                  letterSpacing:'0.06em', border:'1px solid #FCA5A5',
                }}>ANULADA</span>
              )}
            </div>

            {/* Identidad + total */}
            <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-disabled)', marginBottom:2 }}>
                    {isNC ? 'Nota de crédito' : 'Factura'}
                  </div>
                  <div style={{ fontSize:24, fontWeight:800, color:'var(--text)', letterSpacing:'-0.5px', marginBottom:2 }}>
                    #{inv.folio || '—'}
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-subtle)' }}>
                    {fd(inv.fecha_emision)}
                  </div>
                </div>
                <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
              </div>

              {modelo && (
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', letterSpacing:'-0.2px' }}>
                  {modelo}
                  {inv.commercial_year && <span style={{ color:'var(--text-subtle)', fontWeight:500 }}> · {inv.commercial_year}</span>}
                  {inv.color && <span style={{ color:'var(--text-subtle)', fontWeight:500 }}> · {inv.color}</span>}
                </div>
              )}

              <div style={{
                borderTop:'1px dashed var(--border)', paddingTop:10, marginTop:4,
                display:'flex', justifyContent:'space-between', alignItems:'baseline',
              }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                  Total
                </span>
                <span style={{
                  fontSize:26, fontWeight:800,
                  color: isNC ? '#DC2626' : 'var(--text)',
                  letterSpacing:'-0.5px',
                }}>
                  {isNC ? '−' : ''}{$(inv.total)}
                </span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text-subtle)' }}>
                <span>Neto {$(inv.monto_neto)}</span>
                <span>IVA {$(inv.iva)}</span>
                {inv.monto_exento > 0 && <span>Exento {$(inv.monto_exento)}</span>}
              </div>

              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noreferrer"
                  style={{
                    fontSize:13, fontWeight:700, color:'var(--text-on-brand)', background:'var(--brand)',
                    textDecoration:'none',
                    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
                    padding:'10px 14px', borderRadius:'var(--radius-lg)', marginTop:6,
                  }}>
                  <Ic.file size={14} color="var(--text-on-brand)" /> Ver PDF
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Columna CENTRO: info del DTE (cliente + vehículo + NC + vinculaciones auto) ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

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

          {/* Vehículo (datos crudos del DTE) */}
          {(inv.brand || inv.model || inv.chassis) && (
            <DetailCard title="VEHÍCULO (DTE)" accent="var(--brand)">
              <DetailRow label="Marca" value={inv.brand} bold/>
              <DetailRow label="Modelo" value={inv.model} bold/>
              <DetailRow label="Color" value={inv.color} />
              <DetailRow label="Año" value={inv.commercial_year} />
              <DetailRow label="Chasis" value={inv.chassis} />
              <DetailRow label="Motor" value={inv.motor_num} />
            </DetailCard>
          )}

          {/* Vinculaciones automáticas */}
          {(inv.ticket_num || inv.inv_chassis || inv.sn_model) && (
            <DetailCard title="VINCULADO CON" accent="#15803D">
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
        </div>

        {/* ── Columna DER: acciones (editor catálogo + notas) ──────────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Crear venta desde factura — backfill admin-only de ventas pre-CRM */}
          {!inv.sale_note_id && !inv.inventory_id && (
            <div style={{
              background:'var(--surface)', border:'1px solid var(--brand-strong)',
              borderRadius:'var(--radius-lg)', overflow:'hidden',
            }}>
              <div style={{
                padding:'10px 14px', background:'rgba(242,129,0,0.08)',
                borderBottom:'1px solid var(--brand-strong)',
                display:'flex', justifyContent:'space-between', alignItems:'center',
              }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--brand)', textTransform:'uppercase', letterSpacing:'0.12em' }}>
                  Esta factura no tiene venta
                </div>
                {!showCreateSale && (
                  <button onClick={() => setShowCreateSale(true)} style={{ ...S.btn, fontSize:11, padding:'5px 12px' }}>
                    + Crear venta
                  </button>
                )}
              </div>
              {showCreateSale && (
                <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ fontSize:11, color:'var(--text-subtle)', lineHeight:1.45 }}>
                    Genera una nota de venta a partir de esta factura. Útil para registrar ventas
                    anteriores al CRM. El cliente, la moto y el monto salen de la factura; elegí
                    el vendedor y la sucursal.
                  </div>
                  {inv.chassis && (
                    <div style={{
                      fontSize:11, color:'#065F46', background:'rgba(5,150,105,0.08)',
                      border:'1px solid rgba(5,150,105,0.25)', borderRadius:'var(--radius-sm)',
                      padding:'7px 10px', lineHeight:1.45,
                    }}>
                      Si el chasis <strong>{inv.chassis}</strong> coincide con una unidad del inventario,
                      la venta se aplicará sobre esa unidad y desaparecerá del stock disponible.
                    </div>
                  )}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      Vendedor *
                      <select value={csForm.sold_by} onChange={e => setCsForm(f => ({ ...f, sold_by: e.target.value }))}
                        style={{ ...S.inp, width:'100%', marginTop:4, fontSize:12 }}>
                        <option value="">— Seleccionar —</option>
                        {sellers.map(s => (
                          <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize:10, fontWeight:700, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      Sucursal *
                      <select value={csForm.branch_id} onChange={e => setCsForm(f => ({ ...f, branch_id: e.target.value }))}
                        style={{ ...S.inp, width:'100%', marginTop:4, fontSize:12 }}>
                        <option value="">— Seleccionar —</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      Fecha venta
                      <input type="date" value={csForm.sold_at} onChange={e => setCsForm(f => ({ ...f, sold_at: e.target.value }))}
                        style={{ ...S.inp, width:'100%', marginTop:4, fontSize:12 }}/>
                    </label>
                    <label style={{ fontSize:10, fontWeight:700, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      Documentación
                      <select value={csForm.charge_type} onChange={e => setCsForm(f => ({ ...f, charge_type: e.target.value }))}
                        style={{ ...S.inp, width:'100%', marginTop:4, fontSize:12 }}>
                        <option value="inscripcion">Inscripción vehicular</option>
                        <option value="completa">Documentación completa</option>
                        <option value="transferencia">Transferencia vehicular</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      Medio de pago
                      <select value={csForm.payment_method} onChange={e => setCsForm(f => ({ ...f, payment_method: e.target.value }))}
                        style={{ ...S.inp, width:'100%', marginTop:4, fontSize:12 }}>
                        <option value="">— Sin especificar —</option>
                        <option value="Contado">Contado (efectivo)</option>
                        <option value="Transferencia">Transferencia bancaria</option>
                        <option value="Tarjeta Débito">Tarjeta Débito</option>
                        <option value="Tarjeta Crédito">Tarjeta Crédito</option>
                        <option value="Crédito Autofin">Crédito Autofin</option>
                      </select>
                    </label>
                    <label style={{ fontSize:10, fontWeight:700, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      Precio venta ($)
                      <input type="number" value={csForm.sale_price}
                        onChange={e => setCsForm(f => ({ ...f, sale_price: e.target.value }))}
                        style={{ ...S.inp, width:'100%', marginTop:4, fontSize:12 }}/>
                    </label>
                  </div>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                    <button onClick={() => setShowCreateSale(false)} disabled={csSaving}
                      style={{ ...S.btn2, fontSize:12, padding:'7px 14px' }}>Cancelar</button>
                    <button onClick={createSaleFromFactura} disabled={csSaving}
                      style={{ ...S.btn, fontSize:12, padding:'7px 18px' }}>
                      {csSaving ? 'Creando…' : 'Crear venta'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Vincular con catálogo — manual */}
          <div style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)', overflow:'hidden',
          }}>
            <div style={{
              padding:'10px 16px', background:'#FFF7ED',
              borderBottom:'1px solid #FED7AA',
              display:'flex', alignItems:'center', gap:8,
            }}>
              <span style={{ width:3, height:14, background:'var(--brand)', borderRadius:'var(--radius-xs)' }}/>
              <span style={{ fontSize:12, fontWeight:700, color:'#9A3412', letterSpacing:'0.02em' }}>
                VINCULAR CON CATÁLOGO
              </span>
              <span style={{ fontSize:10, fontWeight:500, color:'#B45309', marginLeft:'auto' }}>
                controla qué foto se muestra
              </span>
            </div>
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
              <CatalogModelPicker
                brand={inv.brand || ''}
                modelId={modelId}
                onSelect={(m) => { setModelId(m?.id || null); setSelModel(m || null); }}
              />
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'var(--text-disabled)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5, display:'block' }}>
                  Color
                </label>
                {colorOpts.length > 0 ? (
                  <select value={colorOpts.find(c => c.toLowerCase() === colorEdit.toLowerCase()) || ''}
                    onChange={e => setColorEdit(e.target.value)}
                    style={selStyle}>
                    <option value="">— Color del catálogo —</option>
                    {colorOpts.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input value={colorEdit} onChange={e => setColorEdit(e.target.value)}
                    placeholder="Color (ej: NEGRO, AZUL PERLA)"
                    style={{ ...S.inp, width:'100%' }}/>
                )}
                {colorEdit && colorOpts.length > 0 &&
                  !colorOpts.find(c => c.toLowerCase() === colorEdit.toLowerCase()) && (
                  <div style={{ fontSize:10, color:'#B45309', marginTop:4 }}>
                    "{colorEdit}" no coincide con ningún color del modelo — elige uno válido para ver la foto correcta.
                  </div>
                )}
              </div>
              <button onClick={saveModelColor} disabled={saving}
                style={{ ...S.btn, width:'100%' }}>
                {saving ? 'Guardando...' : 'Guardar modelo y color'}
              </button>
            </div>
          </div>

          {/* Notas internas */}
          <div style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)', overflow:'hidden',
          }}>
            <div style={{
              padding:'10px 16px', background:'var(--surface-muted)',
              borderBottom:'1px solid var(--surface-sunken)',
              display:'flex', alignItems:'center', gap:8,
            }}>
              <span style={{ width:3, height:14, background:'var(--text-subtle)', borderRadius:'var(--radius-xs)' }}/>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>NOTAS INTERNAS</span>
            </div>
            <div style={{ padding:'12px 16px' }}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={6}
                style={{ ...S.inp, width:'100%', resize:'vertical', fontSize:13 }}
              />
              <button onClick={saveNotes} disabled={saving}
                style={{ ...S.btn, marginTop:8, width:'100%' }}>
                {saving ? 'Guardando...' : 'Guardar notas'}
              </button>
            </div>
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
  // Origen del documento: emitidas (Maosbike → cliente) vs recibidas
  // (proveedor → Maosbike). Cada origen tiene su propio Drive de sync.
  const [source, setSource]     = useState('emitida');
  // Para recibidas, filtramos por categoría auto-detectada.
  const [recCategory, setRecCategory] = useState('');
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
      const params = { source, page, limit: LIMIT, desde, hasta };
      if (source === 'emitida') params.tab = tab;
      if (source === 'recibida' && recCategory) params.category = recCategory;
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
  }, [tab, q, linkStatus, desde, hasta, page, source, recCategory]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  async function syncDrive() {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Sync usa la carpeta correspondiente al origen activo
      const r = source === 'recibida'
        ? await api.syncAccountingRecibidasFromDrive()
        : await api.syncAccountingFromDrive();
      setSyncResult(r);
      load();
      loadStats();
    } catch (e) {
      setSyncResult({ error: e.message });
    } finally {
      setSyncing(false);
    }
  }

  async function relink() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await api.relinkAccounting();
      setSyncResult({ relinked: true, ...r });
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
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={relink} disabled={syncing}
              title="Re-correr el cruce automático de facturas pendientes con inventario y notas (sin re-bajar Drive)"
              style={{ ...S.btn2, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace:'nowrap' }}>
              {syncing ? '...' : 'Re-vincular'}
            </button>
            <button onClick={syncDrive} disabled={syncing}
              style={{ ...S.btn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace:'nowrap' }}>
              <Ic.refresh size={14} color="var(--text-on-brand)" />
              {syncing ? 'Sincronizando...' : (isMobile ? 'Sync Drive' : 'Sincronizar Drive')}
            </button>
          </div>
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
          borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: 16, fontSize: 13,
        }}>
          {syncResult.error
            ? <span style={{ color: '#DC2626' }}>{syncResult.error}</span>
            : syncResult.relinked
            ? (
              <div style={{ color: '#15803D' }}>
                Re-vinculadas — {syncResult.scanned} facturas revisadas, {syncResult.linked} con vínculo, {syncResult.updated} actualizadas, {syncResult.status_fixed || 0} cambiaron de estado, {syncResult.docs_propagated || 0} PDFs propagados a la venta.
              </div>
            )
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

      {/* Toggle Emitidas / Recibidas */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        {[
          { v:'emitida',  l:'Emitidas',  hint:'Facturas que emitimos al cliente' },
          { v:'recibida', l:'Recibidas', hint:'Facturas que nos emiten proveedores' },
        ].map(opt => (
          <button key={opt.v}
            onClick={() => { setSource(opt.v); setPage(1); setRecCategory(''); setLinkStatus(''); }}
            title={opt.hint}
            style={{
              flex: isMobile ? '1 1 0' : '0 0 auto',
              padding: isMobile ? '8px 14px' : '8px 18px',
              borderRadius:'var(--radius-md)',
              fontSize:13, fontWeight:700, fontFamily:'inherit', cursor:'pointer',
              border:`1.5px solid ${source===opt.v ? 'var(--brand)' : 'var(--border)'}`,
              background: source===opt.v ? '#FFF7ED' : 'var(--surface)',
              color: source===opt.v ? 'var(--brand)' : 'var(--text-subtle)',
            }}>
            {opt.l}
          </button>
        ))}
      </div>

      {/* Tabs (cambian según el origen) — scroll horizontal en mobile cuando hay
          muchas categorías para no romper el layout. */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {(source === 'recibida' ? [
          { key: '',          label: 'Todas' },
          { key: 'motos',     label: 'Motos' },
          { key: 'partes',    label: 'Partes' },
          { key: 'servicios', label: 'Servicios' },
          { key: 'municipal', label: 'Municipal' },
          { key: 'otros',     label: 'Otros' },
        ] : [
          { key: 'facturas', label: 'Ventas de motos' },
          { key: 'notas',    label: 'Notas de crédito' },
          { key: 'otras',    label: 'Otras / anuladas' },
        ]).map(t => {
          const activeKey = source === 'recibida' ? recCategory : tab;
          return (
          <button
            key={t.key}
            onClick={() => {
              if (source === 'recibida') setRecCategory(t.key);
              else                       setTab(t.key);
              setPage(1);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeKey === t.key ? '2px solid var(--brand)' : '2px solid transparent',
              color: activeKey === t.key ? 'var(--brand)' : 'var(--text-subtle)',
              fontWeight: activeKey === t.key ? 700 : 500,
              fontSize: 13,
              padding: '8px 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              marginBottom: -1,
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Folio, RUT, cliente, chasis..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          style={{ ...S.inp, flex: 1, minWidth: 180, height: 36, fontSize: 13 }}
        />
        {/* Pills de estado de vinculación — colores idénticos al chip de la
            tarjeta para reconocimiento visual instantáneo */}
        {(() => {
          const opts = [
            { v: '',             l: 'Todos',         c: 'var(--text)',     bg: 'var(--surface-muted)' },
            { v: 'vinculada',    l: 'Vinculadas',    c: '#15803D',        bg: 'rgba(21,128,61,0.10)' },
            { v: 'revisar',      l: 'Revisar',       c: '#D97706',        bg: 'rgba(217,119,6,0.10)' },
            { v: 'sin_vincular', l: 'Sin vincular',  c: 'var(--text-subtle)', bg: 'rgba(107,114,128,0.10)' },
          ];
          return (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {opts.map(o => {
                const active = linkStatus === o.v;
                return (
                  <button key={o.v || 'all'}
                    onClick={() => { setLinkStatus(o.v); setPage(1); }}
                    style={{
                      height:32, padding:'0 12px', borderRadius:'var(--radius-xl)',
                      background: active ? o.c : o.bg,
                      color:      active ? '#FFFFFF' : o.c,
                      border:     `1px solid ${active ? o.c : 'transparent'}`,
                      fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                      transition:'all 0.12s',
                    }}>
                    {o.l}
                  </button>
                );
              })}
            </div>
          );
        })()}
        <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>
          {loading ? '...' : `${total} ${total === 1 ? 'documento' : 'documentos'}`}
        </span>
      </div>

      {/* Content */}
      {error && <ErrorMsg msg={error} onRetry={load} />}
      {loading && <Loader />}

      {!loading && !error && data.length === 0 && (
        <Empty
          icon={Ic.invoice}
          title={(() => {
            if (source === 'recibida') {
              const cat = recCategory ? `(${recCategory})` : '';
              return `Sin facturas recibidas ${cat} en ${ymLabel(ym)}`;
            }
            const lbl = tab === 'notas' ? 'notas de crédito'
                      : tab === 'otras' ? 'otras facturas'
                      : 'ventas de motos';
            return `Sin ${lbl} en ${ymLabel(ym)}`;
          })()}
          hint={syncing ? 'Sincronizando...' : 'Prueba con otro mes o sincroniza desde Drive.'}
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
          <span style={{ fontSize: 13, color: 'var(--text-subtle)', alignSelf: 'center' }}>
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
          onSaved={handleUpdated}
        />
      )}
    </div>
  );
}
