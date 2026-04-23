import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { S, TICKET_STATUS, FIN_STATUS, fmt, ViewHeader, Loader } from '../ui.jsx';

const TABS = ['General','Marca','Modelo','Sucursal','Vendedor','Financiamiento','Color','Estado','Tiempo'];

const card = { ...S.card, padding: 16 };
const kpiBox = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', display:'flex', flexDirection:'column', gap:2, minWidth:120, flex:1 };
const kpiVal = { fontSize:22, fontWeight:800, lineHeight:1 };
const kpiLbl = { fontSize:10, fontWeight:700, color:'var(--text-disabled)', textTransform:'uppercase', letterSpacing:'0.07em' };
const thS = { textAlign:'left', padding:'10px 14px', color:'var(--text-disabled)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', background:'var(--surface-muted)', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' };
const tdS = { padding:'10px 14px', fontSize:12, borderBottom:'1px solid var(--surface-sunken)' };
const btnF = (active) => ({ padding:'5px 12px', borderRadius:8, border:'1px solid '+(active?'var(--brand)':'var(--border-strong)'), background:active?'var(--brand)':'var(--surface)', color:active?'var(--text-on-brand)':'var(--text-body)', fontSize:11, fontWeight:600, cursor:'pointer' });
const selectS = { ...S.inp, height:32, padding:'0 10px', fontSize:11, width:'auto' };
const inputS = { ...S.inp, height:32, padding:'0 10px', fontSize:11, width:'auto' };

const pct = (a,b) => b > 0 ? ((a/b)*100).toFixed(1)+'%' : '0%';
const n = (v) => parseInt(v) || 0;

// Simple bar chart (pure CSS)
function Bar({ items, colorKey, maxVal }) {
  const mx = maxVal || Math.max(...items.map(i => i.value), 1);
  return <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
    {items.map((it, i) => <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:100, fontSize:11, textAlign:'right', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.label}</div>
      <div style={{ flex:1, background:'var(--surface-sunken)', borderRadius:4, height:20, position:'relative', overflow:'hidden' }}>
        <div style={{ width:`${(it.value/mx)*100}%`, height:'100%', background:colorKey||'var(--brand)', borderRadius:4, transition:'width .3s' }}/>
        <span style={{ position:'absolute', right:6, top:2, fontSize:10, color:'var(--text-body)' }}>{it.value}</span>
      </div>
    </div>)}
  </div>;
}

// Sparkline mini chart (pure SVG)
function Sparkline({ data, width=320, height=60 }) {
  if (!data || data.length < 2) return <div style={{ color:'var(--text-subtle)', fontSize:11 }}>Sin datos suficientes</div>;
  const vals = data.map(d => d.value);
  const mx = Math.max(...vals, 1);
  const mn = Math.min(...vals, 0);
  const range = mx - mn || 1;
  // Usa viewBox para que el SVG sea responsive dentro del contenedor.
  const VW = 320; // coordenadas internas fijas
  const pts = vals.map((v, i) => `${(i/(vals.length-1))*VW},${height - ((v-mn)/range)*height}`).join(' ');
  return <svg viewBox={`0 0 ${VW} ${height+20}`} width="100%" style={{ display:'block', maxWidth: VW }}>
    <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="2"/>
    {vals.map((v,i) => <circle key={i} cx={(i/(vals.length-1))*VW} cy={height - ((v-mn)/range)*height} r="2.5" fill="var(--brand)"/>)}
    <text x="0" y={height+14} fill="var(--text-disabled)" fontSize="9">{data[0]?.label}</text>
    <text x={VW} y={height+14} fill="var(--text-disabled)" fontSize="9" textAnchor="end">{data[data.length-1]?.label}</text>
  </svg>;
}

function RankTable({ rows, columns }) {
  return <div style={{ overflowX:'auto' }}>
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead><tr>{columns.map(c => <th key={c.key} style={thS}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} style={{ background: i === 0 ? 'var(--brand-soft)' : 'transparent' }}>
        {columns.map(c => <td key={c.key} style={{ ...tdS, fontWeight: c.bold || i === 0 ? 700 : 400, color: c.color && c.color !== 'var(--border)' ? c.color : i === 0 ? 'var(--text)' : 'var(--text-body)' }}>
          {c.medal && i < 3 ? ['1°','2°','3°'][i]+' ' : ''}{c.render ? c.render(r) : r[c.key]}
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

export function ReportsView({ branches = [] }) {
  const [tab, setTab] = useState('General');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sellers, setSellers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({ from:'', to:'', branch_id:'', seller_id:'', brand:'', status:'', fin_status:'', color:'' });

  const loadData = (f) => {
    setLoading(true);
    const clean = {};
    Object.entries(f || filters).forEach(([k,v]) => { if (v) clean[k] = v; });
    api.getReports(clean).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    api.getSellers().then(d => setSellers(Array.isArray(d) ? d : [])).catch(() => {});
    api.getBrands().then(d => setBrands(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const applyFilter = (key, val) => {
    const nf = { ...filters, [key]: val };
    setFilters(nf);
    loadData(nf);
  };

  const clearFilters = () => {
    const nf = { from:'', to:'', branch_id:'', seller_id:'', brand:'', status:'', fin_status:'', color:'' };
    setFilters(nf);
    loadData(nf);
  };

  const presetRange = (days) => {
    const to = new Date().toISOString().slice(0,10);
    const from = new Date(Date.now() - days*864e5).toISOString().slice(0,10);
    const nf = { ...filters, from, to };
    setFilters(nf);
    loadData(nf);
  };

  if (loading && !data) return <Loader label="Cargando reportes…" />;
  if (!data) return <div style={{ padding:20, color:'var(--text-subtle)' }}>Error cargando reportes</div>;

  const k = data.kpi;

  return <div>
    <ViewHeader size="sm" title="Reportes" />

    {/* ── Filtros ── */}
    <div style={{ background:'var(--surface-muted)', border:'1px solid var(--border)', borderRadius:10, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', marginBottom:14, padding:'10px 14px' }}>
      <span style={{ fontSize:9, color:'var(--text-disabled)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Filtros</span>
      <input type="date" value={filters.from} onChange={e=>applyFilter('from',e.target.value)} style={inputS} title="Desde"/>
      <input type="date" value={filters.to} onChange={e=>applyFilter('to',e.target.value)} style={inputS} title="Hasta"/>
      <select value={filters.branch_id} onChange={e=>applyFilter('branch_id',e.target.value)} style={selectS}>
        <option value="">Todas las sucursales</option>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <select value={filters.seller_id} onChange={e=>applyFilter('seller_id',e.target.value)} style={selectS}>
        <option value="">Todos los vendedores</option>
        {sellers.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
      </select>
      <select value={filters.brand} onChange={e=>applyFilter('brand',e.target.value)} style={selectS}>
        <option value="">Todas las marcas</option>
        {brands.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <select value={filters.status} onChange={e=>applyFilter('status',e.target.value)} style={selectS}>
        <option value="">Todos los estados</option>
        {Object.entries(TICKET_STATUS).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
      </select>
      <select value={filters.fin_status} onChange={e=>applyFilter('fin_status',e.target.value)} style={selectS}>
        <option value="">Financiamiento</option>
        {Object.entries(FIN_STATUS).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
      </select>
      <div style={{ display:'flex', gap:4 }}>
        <button onClick={()=>presetRange(0)} style={btnF(false)}>Hoy</button>
        <button onClick={()=>presetRange(7)} style={btnF(false)}>7d</button>
        <button onClick={()=>presetRange(30)} style={btnF(false)}>30d</button>
        <button onClick={()=>presetRange(90)} style={btnF(false)}>90d</button>
        <button onClick={clearFilters} style={{ ...btnF(false), color:'#EF4444', borderColor:'#EF4444' }}>×</button>
      </div>
    </div>

    {/* ── KPIs ── */}
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'#3B82F6' }}>{n(k.total)}</div><div style={kpiLbl}>Total Leads</div></div>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'#10B981' }}>{n(k.ganados)}</div><div style={kpiLbl}>Ganados</div></div>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'#EF4444' }}>{n(k.perdidos)}</div><div style={kpiLbl}>Perdidos</div></div>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'var(--brand)' }}>{pct(n(k.ganados), n(k.total))}</div><div style={kpiLbl}>Conversión</div></div>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'#F59E0B' }}>{n(k.activos)}</div><div style={kpiLbl}>Activos</div></div>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'#EF4444' }}>{n(k.sla_breached)}</div><div style={kpiLbl}>SLA Vencido</div></div>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'var(--text-subtle)' }}>{n(k.sin_tocar)}</div><div style={kpiLbl}>Sin Tocar</div></div>
      <div style={kpiBox}><div style={{ ...kpiVal, color:'#8B5CF6' }}>{k.avg_first_action_hrs || '-'}h</div><div style={kpiLbl}>Prom 1ª Gestión</div></div>
    </div>

    {/* ── Tabs ── */}
    <div style={{ display:'flex', gap:4, overflowX:'auto', paddingBottom:12, marginBottom:8, scrollbarWidth:'none', borderBottom:'2px solid var(--surface-sunken)', WebkitOverflowScrolling:'touch', flexWrap:'nowrap' }}>
      {TABS.map(t => (
        <button key={t} onClick={()=>setTab(t)} style={{
          padding:'7px 14px',
          borderRadius:'8px 8px 0 0',
          border:'none',
          fontSize:12, fontWeight: tab===t ? 700 : 500,
          cursor:'pointer', flexShrink:0,
          background: tab===t ? 'var(--surface)' : 'transparent',
          color: tab===t ? 'var(--brand)' : 'var(--text-subtle)',
          borderBottom: tab===t ? '2px solid var(--brand)' : '2px solid transparent',
          marginBottom:'-2px',
          transition:'all 0.15s',
          fontFamily:'inherit',
        }}>{t}</button>
      ))}
    </div>

    {/* ── Tab content ── */}
    {tab === 'General' && <GeneralTab data={data}/>}
    {tab === 'Marca' && <BrandTab data={data}/>}
    {tab === 'Modelo' && <ModelTab data={data}/>}
    {tab === 'Sucursal' && <BranchTab data={data}/>}
    {tab === 'Vendedor' && <SellerTab data={data}/>}
    {tab === 'Financiamiento' && <FinTab data={data}/>}
    {tab === 'Color' && <ColorTab data={data}/>}
    {tab === 'Estado' && <StatusTab data={data}/>}
    {tab === 'Tiempo' && <TimeTab data={data}/>}
  </div>;
}

// ── GENERAL ──
function GeneralTab({ data }) {
  return <div className="mob-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Top Marcas</h3>
      <Bar items={data.by_brand.slice(0,10).map(b => ({ label:b.name, value:n(b.total) }))} colorKey="#3B82F6"/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Leads por Estado</h3>
      <Bar items={data.by_status.map(s => ({ label:TICKET_STATUS[s.name]?.l||s.name, value:n(s.total) }))} colorKey="#8B5CF6"/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Top Sucursales</h3>
      <Bar items={data.by_branch.map(b => ({ label:b.name||'?', value:n(b.total) }))} colorKey="#10B981"/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Evolución Temporal</h3>
      <Sparkline data={data.timeline.map(t => ({ label:t.day?.slice(5,10), value:n(t.total) }))}/>
    </div>
  </div>;
}

// ── MARCA ──
function BrandTab({ data }) {
  return <div style={card}>
    <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Ranking por Marca</h3>
    <RankTable rows={data.by_brand} columns={[
      { key:'name', label:'Marca', bold:true, medal:true },
      { key:'total', label:'Leads' },
      { key:'ganados', label:'Ganados', color:'#10B981', bold:true },
      { key:'perdidos', label:'Perdidos', color:'#EF4444' },
      { key:'conv', label:'Conversión', color:'var(--brand)', render: r => pct(n(r.ganados), n(r.total)) },
    ]}/>
  </div>;
}

// ── MODELO ──
function ModelTab({ data }) {
  return <div style={card}>
    <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Ranking por Modelo</h3>
    <RankTable rows={data.by_model} columns={[
      { key:'name', label:'Modelo', bold:true, medal:true },
      { key:'brand', label:'Marca', color:'var(--text-subtle)' },
      { key:'total', label:'Leads' },
      { key:'ganados', label:'Ganados', color:'#10B981', bold:true },
      { key:'perdidos', label:'Perdidos', color:'#EF4444' },
      { key:'conv', label:'Conversión', color:'var(--brand)', render: r => pct(n(r.ganados), n(r.total)) },
      { key:'avg_price', label:'Precio Prom', render: r => fmt(r.avg_price) },
    ]}/>
  </div>;
}

// ── SUCURSAL ──
function BranchTab({ data }) {
  return <div style={card}>
    <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Rendimiento por Sucursal</h3>
    <RankTable rows={data.by_branch} columns={[
      { key:'name', label:'Sucursal', bold:true },
      { key:'total', label:'Leads' },
      { key:'ganados', label:'Ganados', color:'#10B981', bold:true },
      { key:'perdidos', label:'Perdidos', color:'#EF4444' },
      { key:'conv', label:'Conversión', color:'var(--brand)', render: r => pct(n(r.ganados), n(r.total)) },
      { key:'avg_first_hrs', label:'1ª Gestión (h)', render: r => r.avg_first_hrs ? r.avg_first_hrs+'h' : '-' },
      { key:'sin_tocar', label:'Sin Tocar', color:'var(--text-subtle)' },
      { key:'sla_breached', label:'SLA Vencido', color:'#EF4444' },
    ]}/>
  </div>;
}

// ── VENDEDOR ──
function SellerTab({ data }) {
  return <div style={card}>
    <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Ranking Vendedores</h3>
    <RankTable rows={data.by_seller} columns={[
      { key:'name', label:'Vendedor', bold:true, medal:true, render: r => `${r.first_name||''} ${(r.last_name||'')[0]||''}.` },
      { key:'branch_code', label:'Suc.', color:'var(--text-subtle)' },
      { key:'total', label:'Asignados' },
      { key:'trabajados', label:'Trabajados' },
      { key:'ganados', label:'Ganados', color:'#10B981', bold:true },
      { key:'perdidos', label:'Perdidos', color:'#EF4444' },
      { key:'conv', label:'Conversión', color:'var(--brand)', render: r => pct(n(r.ganados), n(r.total)) },
      { key:'avg_first_hrs', label:'1ª Gestión', render: r => r.avg_first_hrs ? r.avg_first_hrs+'h' : '-' },
      { key:'sla_breached', label:'SLA Vencido', color:'#EF4444' },
      { key:'reasignados', label:'Reasig.' },
    ]}/>
  </div>;
}

// ── FINANCIAMIENTO ──
function FinTab({ data }) {
  const f = data.financing;
  const conFin = n(f.con_fin);
  const sinFin = n(f.sin_fin);
  const total = conFin + sinFin;
  return <div className="mob-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Distribución</h3>
      <div style={{ display:'flex', gap:20 }}>
        <div style={kpiBox}><div style={{ ...kpiVal, color:'var(--brand)' }}>{conFin}</div><div style={kpiLbl}>Con Financiamiento ({pct(conFin,total)})</div></div>
        <div style={kpiBox}><div style={{ ...kpiVal, color:'#3B82F6' }}>{sinFin}</div><div style={kpiLbl}>Sin Financiamiento ({pct(sinFin,total)})</div></div>
      </div>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Estado Financiamiento</h3>
      <Bar items={[
        { label:'Aprobado', value:n(f.fin_aprobado) },
        { label:'Rechazado', value:n(f.fin_rechazado) },
        { label:'En Evaluación', value:n(f.fin_evaluacion) },
        { label:'Sin Movimiento', value:n(f.fin_sin_mov) },
        { label:'Desistido', value:n(f.fin_desistido) },
      ]} colorKey="var(--brand)"/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Conversión</h3>
      <div style={{ display:'flex', gap:20 }}>
        <div style={kpiBox}><div style={{ ...kpiVal, color:'#10B981' }}>{pct(n(f.fin_ganados),conFin)}</div><div style={kpiLbl}>Conv. con Financiamiento</div></div>
        <div style={kpiBox}><div style={{ ...kpiVal, color:'#10B981' }}>{pct(n(f.nofin_ganados),sinFin)}</div><div style={kpiLbl}>Conv. sin Financiamiento</div></div>
      </div>
    </div>
  </div>;
}

// ── COLOR ──
function ColorTab({ data }) {
  return <div className="mob-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Colores más Cotizados</h3>
      <Bar items={data.by_color.map(c => ({ label:c.name, value:n(c.total) }))} colorKey="#8B5CF6"/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Ranking por Color</h3>
      <RankTable rows={data.by_color} columns={[
        { key:'name', label:'Color', bold:true, medal:true },
        { key:'total', label:'Cotizaciones' },
        { key:'ganados', label:'Ventas', color:'#10B981', bold:true },
        { key:'conv', label:'Conversión', color:'var(--brand)', render: r => pct(n(r.ganados), n(r.total)) },
      ]}/>
    </div>
  </div>;
}

// ── ESTADO ──
function StatusTab({ data }) {
  const total = data.by_status.reduce((s,r) => s + n(r.total), 0);
  return <div className="mob-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Distribución por Estado</h3>
      <Bar items={data.by_status.map(s => ({ label:TICKET_STATUS[s.name]?.l||s.name, value:n(s.total) }))} colorKey="#8B5CF6"/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Detalle</h3>
      <RankTable rows={data.by_status} columns={[
        { key:'name', label:'Estado', bold:true, render: r => <span style={{ color:TICKET_STATUS[r.name]?.c||'var(--border-strong)' }}>{TICKET_STATUS[r.name]?.l||r.name}</span> },
        { key:'total', label:'Cantidad' },
        { key:'pct', label:'% del Total', color:'var(--brand)', render: r => pct(n(r.total), total) },
      ]}/>
    </div>
  </div>;
}

// ── TIEMPO ──
function TimeTab({ data }) {
  const tl = data.timeline || [];
  return <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:14 }}>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Leads por Día</h3>
      <Sparkline data={tl.map(t => ({ label:t.day?.slice(5,10), value:n(t.total) }))} width={600} height={80}/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Ventas por Día</h3>
      <Sparkline data={tl.map(t => ({ label:t.day?.slice(5,10), value:n(t.ganados) }))} width={600} height={80}/>
    </div>
    <div style={card}>
      <h3 style={{ fontSize:13, fontWeight:700, margin:'0 0 10px' }}>Detalle Diario</h3>
      <div style={{ maxHeight:400, overflowY:'auto' }}>
        <RankTable rows={[...tl].reverse()} columns={[
          { key:'day', label:'Fecha', render: r => r.day?.slice(0,10) },
          { key:'total', label:'Leads' },
          { key:'ganados', label:'Ganados', color:'#10B981' },
          { key:'conv', label:'Conversión', color:'var(--brand)', render: r => pct(n(r.ganados), n(r.total)) },
        ]}/>
      </div>
    </div>
  </div>;
}
