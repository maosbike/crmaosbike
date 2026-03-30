import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

// ─── Datos de configuración ────────────────────────────────────────────────────

const BLANK_NW = () => ({
  branch_id:'', year:new Date().getFullYear(), brand:'', model:'', color:'', chassis:'', motor_num:'', price:0,
  added_as_sold:false, sold_at:new Date().toISOString().split('T')[0],
  sold_by:'', ticket_id:'', sale_notes:'', payment_method:'', sale_type:'completa',
});
const BLANK_SELL = () => ({ sold_by:'', sold_at:new Date().toISOString().split('T')[0], ticket_id:'', payment_method:'', sale_type:'completa', sale_notes:'' });
const HIST_ICONS  = { created:'C', imported:'I', sold:'V', status_changed:'E', moved:'T', note:'N' };
const HIST_LABELS = { created:'Creada', imported:'Importada', sold:'Venta', status_changed:'Cambio estado', moved:'Traslado', note:'Nota' };

const BRANCH_CFG = {
  MPN: { color:'#2563EB', light:'#EFF6FF', label:'Norte'  },
  MPS: { color:'#059669', light:'#ECFDF5', label:'Sur'    },
  MOV: { color:'#D97706', light:'#FFFBEB', label:'Ovalle' },
};
const FALLBACK_BRANCH = { color:'#6B7280', light:'#F9FAFB', label:'' };

const ST_CFG = {
  disponible:  { color:'#15803D', bg:'#F0FDF4', border:'#86EFAC', label:'Disponible',  icon:'●' },
  reservada:   { color:'#B45309', bg:'#FFFBEB', border:'#FCD34D', label:'Reservada',   icon:'◐' },
  vendida:     { color:'#6D28D9', bg:'#F5F3FF', border:'#C4B5FD', label:'Vendida',     icon:'✓' },
  preinscrita: { color:'#0E7490', bg:'#ECFEFF', border:'#67E8F9', label:'Preinscrita', icon:'◌' },
};

const COLOR_CSS = {
  negro:'#111827', blanco:'#FFFFFF', rojo:'#EF4444', azul:'#2563EB',
  verde:'#15803D', gris:'#9CA3AF', 'gris oscuro':'#374151', naranja:'#EA580C',
  amarillo:'#D97706', plateado:'#94A3B8', plata:'#94A3B8', perla:'#E8E0D0',
  'blanco perla':'#E8E0D0', bordo:'#9F1239', vino:'#9F1239',
  celeste:'#0EA5E9', fucsia:'#DB2777', violeta:'#7C3AED',
};
const getColorCss = c => COLOR_CSS[(c||'').toLowerCase().trim()] || null;

// ─── Componente principal ──────────────────────────────────────────────────────

export function InventoryView({ inv, setInv, user, realBranches }) {
  const brs = realBranches || [];
  const [brF,    setBrF]    = useState('');
  const [stF,    setStF]    = useState('');
  const [brandF, setBrandF] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd,setShowAdd]= useState(false);
  const [viewPhoto,setViewPhoto] = useState(null);
  const [adding, setAdding] = useState(false);
  const [nw,     setNw]     = useState(BLANK_NW());
  const [sellers,setSellers]= useState([]);
  const [openTickets,setOpenTickets] = useState([]);
  const [showSell,  setShowSell]   = useState(false);
  const [sellUnit,  setSellUnit]   = useState(null);
  const [sellForm,  setSellForm]   = useState(BLANK_SELL());
  const [selling,   setSelling]    = useState(false);
  const [histOpen,  setHistOpen]   = useState(new Set());
  const [histData,  setHistData]   = useState({});
  const [histLoading,setHistLoading] = useState({});
  const [showImport,setShowImport] = useState(false);
  const [importPreview,setImportPreview] = useState(null);
  const [importLoading,setImportLoading] = useState(false);
  const [importDone,setImportDone] = useState(null);
  const importFileRef = useRef(null);
  const isAdmin = ['super_admin','admin_comercial'].includes(user?.role);

  const brands = [...new Set(inv.map(x => x.brand).filter(Boolean))].sort();

  const f = inv.filter(x => {
    if (brF    && x.branch_id !== brF)   return false;
    if (stF    && x.status    !== stF)   return false;
    if (brandF && x.brand     !== brandF)return false;
    if (search && !`${x.brand} ${x.model} ${x.chassis} ${x.color}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const counts = Object.fromEntries(Object.keys(INV_ST).map(k => [k, inv.filter(x => x.status === k).length]));
  const reload = () => api.getInventory().then(d => setInv(Array.isArray(d) ? d : [])).catch(() => {});
  const hasFilters = search || brF || stF || brandF;
  const clearFilters = () => { setSearch(''); setBrF(''); setStF(''); setBrandF(''); };

  useEffect(() => {
    if (!showAdd && !showSell) return;
    api.getSellers().then(d => setSellers(Array.isArray(d) ? d : [])).catch(() => {});
    api.getTickets({ status:'ganado,abierto', limit:200 }).then(d => setOpenTickets((d.data||[]).slice(0,200))).catch(() => {});
  }, [showAdd, showSell]);

  // ── Handlers (sin cambios de lógica) ────────────────────────────────────────

  const handleAdd = async e => {
    e.preventDefault(); setAdding(true);
    try {
      await api.createInventory({
        branch_id:nw.branch_id||null, year:Number(nw.year),
        brand:nw.brand, model:nw.model, color:nw.color,
        chassis:nw.chassis, motor_num:nw.motor_num||null, price:Number(nw.price),
        added_as_sold:nw.added_as_sold,
        ...(nw.added_as_sold ? {
          sold_at:nw.sold_at||null, sold_by:nw.sold_by||null,
          ticket_id:nw.ticket_id||null, sale_notes:nw.sale_notes||null,
          payment_method:nw.payment_method||null, sale_type:nw.sale_type||null,
        } : {})
      });
      setShowAdd(false); setNw(BLANK_NW()); reload();
    } catch(ex) { alert(ex.message||'Error al agregar'); }
    finally { setAdding(false); }
  };
  const handlePhoto = (id, field) => {
    const input = document.createElement('input'); input.type='file'; input.accept='image/*';
    input.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try { const r = await api.uploadInvPhoto(id,file,field); setInv(p=>p.map(x=>x.id===id?{...x,[field]:r.url}:x)); }
      catch(ex) { alert(ex.message||'Error al subir foto'); }
    };
    input.click();
  };
  const handleImportFile = async e => {
    const file = e.target.files[0]; if (!file) return;
    setImportLoading(true); setImportPreview(null); setImportDone(null);
    try { const d = await api.importInventoryPreview(file); setImportPreview(d); }
    catch(ex) { alert(ex.message||'Error al leer archivo'); }
    finally { setImportLoading(false); if(importFileRef.current) importFileRef.current.value=''; }
  };
  const handleImportConfirm = async () => {
    if (!importPreview) return;
    const okRows = importPreview.rows.filter(r => r._status==='ok');
    if (!okRows.length) return;
    setImportLoading(true);
    try { const r = await api.importInventoryConfirm(okRows); setImportDone(r); setImportPreview(null); reload(); }
    catch(ex) { alert(ex.message||'Error al importar'); }
    finally { setImportLoading(false); }
  };
  const handleStatus = async (id, status) => {
    setInv(p => p.map(x => x.id===id ? {...x,status} : x));
    try { await api.updateInventory(id, {status}); } catch(ex) { alert(ex.message); reload(); }
  };
  const handleMove = async (id, branch_id) => {
    setInv(p => p.map(x => x.id===id ? {...x,branch_id} : x));
    try { await api.updateInventory(id, {branch_id}); reload(); } catch(ex) { alert(ex.message); reload(); }
  };
  const openSell = unit => { setSellUnit(unit); setSellForm(BLANK_SELL()); setShowSell(true); };
  const handleSell = async e => {
    e.preventDefault(); if (!sellUnit||!sellForm.sold_by) return;
    setSelling(true);
    try {
      await api.sellInventory(sellUnit.id, {
        sold_by:sellForm.sold_by, sold_at:sellForm.sold_at||null,
        ticket_id:sellForm.ticket_id||null, payment_method:sellForm.payment_method||null,
        sale_type:sellForm.sale_type||null, sale_notes:sellForm.sale_notes||null,
      });
      setShowSell(false); setSellUnit(null);
      if (histOpen.has(sellUnit.id)) api.getInventoryHistory(sellUnit.id).then(d=>setHistData(p=>({...p,[sellUnit.id]:d}))).catch(()=>{});
      reload();
    } catch(ex) { alert(ex.message||'Error al registrar venta'); }
    finally { setSelling(false); }
  };
  const toggleHist = async id => {
    const next = new Set(histOpen);
    if (next.has(id)) { next.delete(id); }
    else {
      next.add(id);
      if (!histData[id]) {
        setHistLoading(p => ({...p,[id]:true}));
        try { const d = await api.getInventoryHistory(id); setHistData(p=>({...p,[id]:d})); }
        catch(e) {}
        finally { setHistLoading(p => ({...p,[id]:false})); }
      }
    }
    setHistOpen(next);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:1400 }}>

      {/* ══════════════════════════════════════════════════════════
          ENCABEZADO
      ══════════════════════════════════════════════════════════ */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#9CA3AF', letterSpacing:'0.12em', textTransform:'uppercase' }}>
            Operaciones · Stock
          </p>
          <h1 style={{ margin:0, fontSize:26, fontWeight:900, color:'#0F172A', letterSpacing:'-0.8px', lineHeight:1 }}>
            Inventario
          </h1>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isAdmin && (
            <button onClick={()=>{setShowImport(true);setImportPreview(null);setImportDone(null);}}
              style={btnGhost}>
              <Ic.upload size={13} color="#6B7280"/> Importar Excel
            </button>
          )}
          <button onClick={()=>setShowAdd(true)} style={btnOrange}>
            <Ic.plus size={14} color="#fff"/> Nueva Unidad
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          KPI — 4 tarjetas de estado
      ══════════════════════════════════════════════════════════ */}
      <div className="grid-4col" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {Object.entries(ST_CFG).map(([k,v]) => {
          const active = stF === k;
          const cnt = counts[k] || 0;
          return (
            <button key={k} onClick={()=>setStF(stF===k?'':k)}
              style={{
                position:'relative', overflow:'hidden',
                padding:'20px 22px', borderRadius:14, border:'none',
                background: active ? v.bg : '#FFFFFF',
                cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                outline: active ? `2px solid ${v.color}` : '1px solid #E5E7EB',
                outlineOffset: active ? 1 : 0,
                boxShadow: active ? `0 4px 20px ${v.color}22` : '0 1px 4px rgba(0,0,0,0.05)',
                transition:'all 0.15s',
              }}>
              {/* Barra de color arriba */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:v.color, borderRadius:'14px 14px 0 0' }}/>
              <div style={{ fontSize:38, fontWeight:900, color: active ? v.color : '#0F172A', letterSpacing:'-2px', lineHeight:1, marginBottom:6 }}>
                {cnt}
              </div>
              <div style={{ fontSize:13, fontWeight:700, color: active ? v.color : '#374151' }}>{v.label}</div>
              {active && (
                <div style={{ position:'absolute', bottom:10, right:14, fontSize:18, opacity:0.2 }}>{v.icon}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════
          BARRA DE CONTROL
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        background:'#FFFFFF', border:'1px solid #E5E7EB', borderRadius:12,
        padding:'14px 18px', marginBottom:20,
        display:'flex', gap:12, flexWrap:'wrap', alignItems:'center',
        boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {/* Búsqueda */}
        <div style={{ position:'relative', flex:'1 1 220px', minWidth:180 }}>
          <Ic.search size={14} color="#9CA3AF" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar por marca, modelo, chasis, color..."
            style={{ ...S.inp, paddingLeft:34, width:'100%', height:36, borderRadius:8, fontSize:12 }}/>
        </div>

        <div style={{ width:1, height:28, background:'#E5E7EB', flexShrink:0 }}/>

        {/* Sucursal */}
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <label style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Sucursal</label>
          <select value={brF} onChange={e=>setBrF(e.target.value)} style={selectCtrl}>
            <option value="">Todas</option>
            {brs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Marca */}
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <label style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Marca</label>
          <select value={brandF} onChange={e=>setBrandF(e.target.value)} style={selectCtrl}>
            <option value="">Todas</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div style={{ width:1, height:28, background:'#E5E7EB', flexShrink:0 }}/>

        {/* Estado */}
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <label style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Estado</label>
          <div style={{ display:'flex', gap:4 }}>
            {Object.entries(ST_CFG).map(([k,v]) => (
              <button key={k} onClick={()=>setStF(stF===k?'':k)}
                style={{
                  padding:'5px 11px', borderRadius:20, fontSize:11, fontWeight:600,
                  cursor:'pointer', fontFamily:'inherit',
                  background: stF===k ? v.color : 'transparent',
                  color: stF===k ? '#FFFFFF' : '#6B7280',
                  border: `1.5px solid ${stF===k ? v.color : '#E5E7EB'}`,
                  transition:'all 0.12s',
                }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Limpiar + contador */}
        {hasFilters && (
          <>
            <div style={{ width:1, height:28, background:'#E5E7EB', flexShrink:0 }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              <label style={{ fontSize:9, fontWeight:700, color:'transparent', textTransform:'uppercase' }}>·</label>
              <button onClick={clearFilters}
                style={{ padding:'5px 12px', height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#F9FAFB', fontSize:11, cursor:'pointer', color:'#6B7280', display:'flex', alignItems:'center', gap:5, fontWeight:500 }}>
                <Ic.x size={10}/>{f.length} resultado{f.length!==1?'s':''}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          LISTA DE UNIDADES — Cards horizontales
      ══════════════════════════════════════════════════════════ */}

      {f.length === 0 ? (
        <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px dashed #E5E7EB', padding:'60px 0', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📦</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#374151', marginBottom:4 }}>
            {hasFilters ? 'Sin resultados con estos filtros' : 'Sin unidades en el inventario'}
          </div>
          <div style={{ fontSize:12, color:'#9CA3AF' }}>
            {hasFilters
              ? <button onClick={clearFilters} style={{ background:'none', border:'none', color:'#F28100', fontSize:12, cursor:'pointer', textDecoration:'underline', padding:0, fontFamily:'inherit' }}>Limpiar filtros</button>
              : 'Agregá unidades manualmente o importá desde Excel.'}
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {/* Contador */}
          <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:500, paddingLeft:2, marginBottom:4 }}>
            {f.length} unidad{f.length!==1?'es':''}{hasFilters&&` (filtradas de ${inv.length})`}
          </div>

          {f.map(x => {
            const isSold    = x.status === 'vendida';
            const stCfg     = ST_CFG[x.status] || ST_CFG.disponible;
            const bCode     = x.branch_code || brs.find(b => b.id===x.branch_id)?.code || '';
            const bCfg      = BRANCH_CFG[bCode] || FALLBACK_BRANCH;
            const isHistOpen= histOpen.has(x.id);
            const cDot      = getColorCss(x.color);

            return (
              <div key={x.id}>
                {/* ── CARD ── */}
                <div style={{
                  display:'flex', alignItems:'stretch',
                  background:'#FFFFFF',
                  borderRadius: isHistOpen ? '14px 14px 0 0' : 14,
                  border:`1px solid ${isSold ? '#E5E7EB' : '#E2E5EA'}`,
                  overflow:'hidden',
                  boxShadow: isSold ? 'none' : '0 1px 6px rgba(0,0,0,0.06)',
                  opacity: isSold ? 0.75 : 1,
                  transition:'box-shadow 0.15s, opacity 0.15s',
                }}
                  onMouseEnter={e=>{ if(!isSold) e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e=>{ if(!isSold) e.currentTarget.style.boxShadow='0 1px 6px rgba(0,0,0,0.06)'; }}
                >

                  {/* ── SUCURSAL — strip izquierdo de color ── */}
                  <div style={{
                    width:82, flexShrink:0,
                    background: bCode ? bCfg.color : '#E5E7EB',
                    display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center',
                    padding:'16px 8px', gap:4,
                  }}>
                    <span style={{ fontSize:15, fontWeight:900, color:'#FFFFFF', letterSpacing:'0.04em', lineHeight:1 }}>
                      {bCode || '—'}
                    </span>
                    {bCfg.label && (
                      <span style={{ fontSize:9, fontWeight:600, color:'rgba(255,255,255,0.75)', letterSpacing:'0.1em', textTransform:'uppercase' }}>
                        {bCfg.label}
                      </span>
                    )}
                    {/* Año */}
                    {x.year && (
                      <span style={{ fontSize:9, color:'rgba(255,255,255,0.55)', marginTop:4 }}>{x.year}</span>
                    )}
                  </div>

                  {/* ── UNIDAD — marca · modelo · color ── */}
                  <div style={{
                    flex:'0 0 200px', padding:'16px 18px',
                    borderRight:'1px solid #F1F3F5',
                    display:'flex', flexDirection:'column', justifyContent:'center',
                  }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>
                      Unidad
                    </div>
                    <div style={{ fontSize:18, fontWeight:900, color:'#0F172A', letterSpacing:'-0.5px', lineHeight:1.1, marginBottom:4 }}>
                      {x.brand}
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:8 }}>
                      {x.model}
                    </div>
                    {/* Color */}
                    {x.color && (
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{
                          width:12, height:12, borderRadius:'50%', flexShrink:0,
                          background: cDot || '#E5E7EB',
                          border: !cDot || cDot==='#FFFFFF'||cDot==='#F9FAFB'
                            ? '1.5px solid #D1D5DB' : 'none',
                          boxShadow:'0 0 0 1px rgba(0,0,0,0.08)',
                        }}/>
                        <span style={{ fontSize:12, color:'#6B7280', fontWeight:500 }}>{x.color}</span>
                      </div>
                    )}
                  </div>

                  {/* ── IDENTIFICADORES — chasis · motor ── */}
                  <div style={{
                    flex:1, padding:'16px 20px',
                    borderRight:'1px solid #F1F3F5',
                    display:'flex', flexDirection:'column', justifyContent:'center', gap:10,
                  }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:2 }}>
                      Identificación
                    </div>
                    {/* Chasis */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', letterSpacing:'0.08em', textTransform:'uppercase', width:38, flexShrink:0 }}>Chasis</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{
                          fontFamily:"'SF Mono','Fira Code','Fira Mono','Roboto Mono',Consolas,monospace",
                          fontSize:12, fontWeight:700, letterSpacing:'0.08em',
                          color:'#1E293B', background:'#F1F5F9',
                          padding:'3px 10px', borderRadius:6,
                          border:'1px solid #CBD5E1',
                        }}>
                          {x.chassis}
                        </span>
                        {x.chassis_photo
                          ? <img src={x.chassis_photo} onClick={()=>setViewPhoto({src:x.chassis_photo,title:`Chasis ${x.chassis}`})}
                              style={{ width:28,height:28,borderRadius:6,objectFit:'cover',cursor:'pointer',border:'2px solid #E5E7EB',flexShrink:0 }}/>
                          : <button onClick={()=>handlePhoto(x.id,'chassis_photo')} title="Agregar foto de chasis"
                              style={{ width:26,height:26,borderRadius:6,border:'1.5px dashed #CBD5E1',background:'transparent',cursor:'pointer',fontSize:13,color:'#94A3B8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,padding:0 }}>+</button>
                        }
                      </div>
                    </div>
                    {/* Motor */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', letterSpacing:'0.08em', textTransform:'uppercase', width:38, flexShrink:0 }}>Motor</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {x.motor_num
                          ? <>
                              <span style={{
                                fontFamily:"'SF Mono','Fira Code','Fira Mono','Roboto Mono',Consolas,monospace",
                                fontSize:11, fontWeight:500, letterSpacing:'0.05em', color:'#475569',
                              }}>{x.motor_num}</span>
                              {x.motor_photo
                                ? <img src={x.motor_photo} onClick={()=>setViewPhoto({src:x.motor_photo,title:`Motor ${x.motor_num}`})}
                                    style={{ width:24,height:24,borderRadius:5,objectFit:'cover',cursor:'pointer',border:'2px solid #E5E7EB' }}/>
                                : <button onClick={()=>handlePhoto(x.id,'motor_photo')} title="Agregar foto de motor"
                                    style={{ width:22,height:22,borderRadius:5,border:'1.5px dashed #CBD5E1',background:'transparent',cursor:'pointer',fontSize:12,color:'#94A3B8',display:'flex',alignItems:'center',justifyContent:'center',padding:0 }}>+</button>
                              }
                            </>
                          : <span style={{ fontSize:11, color:'#CBD5E1' }}>—</span>
                        }
                      </div>
                    </div>
                  </div>

                  {/* ── ESTADO ── */}
                  <div style={{
                    flex:'0 0 148px', padding:'16px 18px',
                    borderRight:'1px solid #F1F3F5',
                    display:'flex', flexDirection:'column', justifyContent:'center', gap:8,
                  }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:2 }}>
                      Estado
                    </div>
                    {isSold ? (
                      <div>
                        <div style={{
                          display:'inline-flex', alignItems:'center', gap:6,
                          padding:'6px 14px', borderRadius:20,
                          background:ST_CFG.vendida.bg, border:`1.5px solid ${ST_CFG.vendida.border}`,
                        }}>
                          <span style={{ fontSize:14, color:ST_CFG.vendida.color }}>✓</span>
                          <span style={{ fontSize:12, fontWeight:800, color:ST_CFG.vendida.color }}>Vendida</span>
                        </div>
                        {x.sold_at && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:6, paddingLeft:2 }}>{fD(x.sold_at)}</div>}
                      </div>
                    ) : (
                      <div style={{
                        display:'inline-flex', alignItems:'center', gap:6,
                        padding:'6px 12px', borderRadius:20,
                        background:stCfg.bg, border:`1.5px solid ${stCfg.border}`,
                      }}>
                        <span style={{ fontSize:14, color:stCfg.color }}>{stCfg.icon}</span>
                        <select value={x.status} onChange={e=>handleStatus(x.id,e.target.value)}
                          style={{
                            background:'transparent', border:'none',
                            fontSize:12, fontWeight:800, color:stCfg.color,
                            cursor:'pointer', padding:0, outline:'none', fontFamily:'inherit',
                          }}>
                          {Object.entries(INV_ST).filter(([k])=>k!=='vendida').map(([k,v])=>(
                            <option key={k} value={k}>{v.l}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* ── PRECIO ── */}
                  <div style={{
                    flex:'0 0 130px', padding:'16px 18px',
                    borderRight:'1px solid #F1F3F5',
                    display:'flex', flexDirection:'column', justifyContent:'center',
                  }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>
                      Precio
                    </div>
                    {x.price > 0
                      ? <div style={{ fontSize:17, fontWeight:900, color:'#0F172A', letterSpacing:'-0.5px' }}>{fmt(x.price)}</div>
                      : <div style={{ fontSize:13, color:'#CBD5E1' }}>—</div>
                    }
                  </div>

                  {/* ── ACCIONES ── */}
                  <div style={{
                    flex:'0 0 160px', padding:'14px 16px',
                    display:'flex', flexDirection:'column', justifyContent:'center', gap:7,
                  }}>
                    {!isSold ? (
                      <>
                        <button onClick={()=>openSell(x)}
                          style={{
                            padding:'8px 0', borderRadius:8,
                            background:'#15803D', color:'#FFFFFF',
                            border:'none', fontSize:12, fontWeight:700,
                            cursor:'pointer', letterSpacing:'0.01em', width:'100%',
                            transition:'background 0.1s',
                          }}
                          onMouseEnter={e=>e.currentTarget.style.background='#166534'}
                          onMouseLeave={e=>e.currentTarget.style.background='#15803D'}>
                          Registrar venta
                        </button>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>toggleHist(x.id)}
                            style={{
                              ...miniBtn,
                              flex:1,
                              background: isHistOpen ? '#EEF2FF' : '#F8FAFC',
                              color: isHistOpen ? '#4F46E5' : '#64748B',
                              border:`1px solid ${isHistOpen?'#A5B4FC':'#E2E8F0'}`,
                            }}>
                            {histLoading[x.id]?'…':'Historial'}
                          </button>
                          {brs.filter(b=>b.id!==x.branch_id).length > 0 && (
                            <select defaultValue="" onChange={e=>{if(e.target.value){handleMove(x.id,e.target.value);}e.target.value='';}}
                              style={{ ...miniBtn, flex:1, appearance:'auto', background:'#F8FAFC', color:'#64748B', border:'1px solid #E2E8F0', cursor:'pointer' }}>
                              <option value="" disabled>Mover</option>
                              {brs.filter(b=>b.id!==x.branch_id).map(b=>(
                                <option key={b.id} value={b.id}>{b.code||b.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </>
                    ) : (
                      <button onClick={()=>toggleHist(x.id)}
                        style={{
                          ...miniBtn, width:'100%',
                          background: isHistOpen ? '#EEF2FF' : '#F8FAFC',
                          color: isHistOpen ? '#4F46E5' : '#64748B',
                          border:`1px solid ${isHistOpen?'#A5B4FC':'#E2E8F0'}`,
                        }}>
                        {histLoading[x.id]?'Cargando…':'Ver historial'}
                      </button>
                    )}
                  </div>
                </div>

                {/* ── HISTORIAL EXPANDIBLE ── */}
                {isHistOpen && (
                  <div style={{
                    background:'#F8F7FF', border:'1px solid #E2E0F5',
                    borderTop:'none', borderRadius:'0 0 14px 14px',
                    padding:'18px 24px 22px',
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#4F46E5' }}>Trazabilidad de la unidad</div>
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                          {x.brand} {x.model}{x.year?` · ${x.year}`:''} · Chasis{' '}
                          <span style={{ fontFamily:"'SF Mono',Consolas,monospace", fontWeight:600, color:'#4F46E5' }}>{x.chassis}</span>
                        </div>
                      </div>
                      <button onClick={()=>toggleHist(x.id)}
                        style={{ ...miniBtn, border:'1px solid #E2E8F0' }}>Cerrar</button>
                    </div>
                    {histLoading[x.id] && <div style={{ color:'#9CA3AF', fontSize:11 }}>Cargando historial...</div>}
                    {!histLoading[x.id] && (!histData[x.id]||histData[x.id].length===0) && (
                      <div style={{ color:'#9CA3AF', fontSize:11 }}>Sin registros de historial para esta unidad.</div>
                    )}
                    {!histLoading[x.id] && histData[x.id]?.length > 0 && (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:8, maxWidth:900 }}>
                        {histData[x.id].map(h => {
                          const uName = h.user_fn ? `${h.user_fn} ${h.user_ln||''}`.trim() : 'Sistema';
                          const isSaleEv = h.event_type==='sold';
                          return (
                            <div key={h.id} style={{
                              display:'flex', gap:10, padding:'10px 12px',
                              background:'#FFFFFF', borderRadius:8,
                              border:`1px solid ${isSaleEv?'#C4B5FD':'#E0E0F5'}`,
                              borderLeft:`3px solid ${isSaleEv?'#7C3AED':'#6366F1'}`,
                            }}>
                              <div style={{ flexShrink:0,marginTop:1,width:22,height:22,borderRadius:5,background:isSaleEv?'rgba(124,58,237,0.1)':'rgba(99,102,241,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:900,color:isSaleEv?'#7C3AED':'#6366F1',border:`1px solid ${isSaleEv?'rgba(124,58,237,0.2)':'rgba(99,102,241,0.15)'}` }}>
                                {HIST_ICONS[h.event_type]||'·'}
                              </div>
                              <div style={{ flex:1,minWidth:0 }}>
                                <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:2 }}>
                                  <span style={{ fontWeight:700,fontSize:11,color:isSaleEv?'#6D28D9':'#374151' }}>{HIST_LABELS[h.event_type]||h.event_type}</span>
                                  {h.from_status&&h.to_status&&(
                                    <span style={{ fontSize:9,color:'#6B7280',background:'#F3F4F6',padding:'1px 5px',borderRadius:3,border:'1px solid #E5E7EB' }}>
                                      {INV_ST[h.from_status]?.l||h.from_status} → {INV_ST[h.to_status]?.l||h.to_status}
                                    </span>
                                  )}
                                  <span style={{ fontSize:9,color:'#9CA3AF',marginLeft:'auto',flexShrink:0 }}>{fDT(h.created_at)}</span>
                                </div>
                                {h.note && <div style={{ fontSize:10,color:'#4B5563',marginBottom:3,lineHeight:1.4 }}>{h.note}</div>}
                                <div style={{ fontSize:9,color:'#9CA3AF' }}>por <strong style={{ color:'#6B7280',fontWeight:600 }}>{uName}</strong></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          LIGHTBOX
      ══════════════════════════════════════════════════════════ */}
      {viewPhoto && (
        <div onClick={()=>setViewPhoto(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:70,cursor:'pointer',backdropFilter:'blur(4px)' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#FFFFFF',borderRadius:16,padding:20,maxWidth:600,width:'90%',boxShadow:'0 32px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
              <span style={{ fontSize:14,fontWeight:700 }}>{viewPhoto.title}</span>
              <button onClick={()=>setViewPhoto(null)} style={{ ...S.gh,padding:6,borderRadius:8 }}><Ic.x size={16}/></button>
            </div>
            <img src={viewPhoto.src} style={{ width:'100%',borderRadius:10,maxHeight:420,objectFit:'contain' }}/>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL — AGREGAR UNIDAD
      ══════════════════════════════════════════════════════════ */}
      {showAdd && (
        <Modal onClose={()=>{setShowAdd(false);setNw(BLANK_NW());}} title="Agregar Unidad al Inventario" wide>
          <form onSubmit={handleAdd}>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10 }}>
              <Field label="Sucursal *" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:'',l:'Seleccionar...'},...brs.map(b=>({v:b.id,l:b.name}))]} req/>
              <Field label="Año" value={nw.year} onChange={v=>setNw({...nw,year:v})} type="number"/>
              <Field label="Marca *" value={nw.brand} onChange={v=>setNw({...nw,brand:v})} req/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10 }}>
              <Field label="Modelo *" value={nw.model} onChange={v=>setNw({...nw,model:v})} req/>
              <Field label="Color *" value={nw.color} onChange={v=>setNw({...nw,color:v})} req/>
              <Field label="Precio" value={nw.price} onChange={v=>setNw({...nw,price:v})} type="number"/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14 }}>
              <Field label="N° Chasis *" value={nw.chassis} onChange={v=>setNw({...nw,chassis:v})} req/>
              <Field label="N° Motor" value={nw.motor_num} onChange={v=>setNw({...nw,motor_num:v})}/>
            </div>
            <div onClick={()=>setNw({...nw,added_as_sold:!nw.added_as_sold})}
              style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,marginBottom:nw.added_as_sold?10:16,cursor:'pointer',background:nw.added_as_sold?'rgba(239,68,68,0.06)':'#F9FAFB',border:`1px solid ${nw.added_as_sold?'rgba(239,68,68,0.3)':'#E5E7EB'}`,transition:'all 0.15s' }}>
              <div style={{ width:18,height:18,borderRadius:4,border:nw.added_as_sold?'none':'2px solid #333',background:nw.added_as_sold?'#EF4444':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                {nw.added_as_sold&&<Ic.check size={11} color="white"/>}
              </div>
              <div>
                <div style={{ fontSize:13,fontWeight:600,color:nw.added_as_sold?'#EF4444':'#374151' }}>Esta unidad ya está vendida</div>
                <div style={{ fontSize:11,color:'#6B7280' }}>Se registrará directamente como vendida, sin pasar por stock disponible</div>
              </div>
            </div>
            {nw.added_as_sold && (
              <div style={{ background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:10,padding:'12px 14px',marginBottom:14 }}>
                <div style={{ fontSize:11,fontWeight:700,color:'#EF4444',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.05em' }}>Datos de la venta</div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                  <Field label="Vendedor" value={nw.sold_by} onChange={v=>setNw({...nw,sold_by:v})} opts={[{v:'',l:'Seleccionar...'},...sellers.map(s=>({v:s.id,l:`${s.first_name||''} ${s.last_name||''}`.trim()}))]}/>
                  <Field label="Fecha de venta" value={nw.sold_at} onChange={v=>setNw({...nw,sold_at:v})} type="date"/>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                  <Field label="Tipo" value={nw.sale_type} onChange={v=>setNw({...nw,sale_type:v})} opts={[{v:'completa',l:'Documentación completa'},{v:'inscripcion',l:'Solo inscripción'},{v:'entregada',l:'Entregada al cliente'}]}/>
                  <Field label="Método de pago" value={nw.payment_method} onChange={v=>setNw({...nw,payment_method:v})} opts={[{v:'',l:'Seleccionar...'},{v:'Contado',l:'Contado'},{v:'Transferencia',l:'Transferencia'},{v:'Tarjeta Débito',l:'Tarjeta Débito'},{v:'Tarjeta Crédito',l:'Tarjeta Crédito'},{v:'Crédito Autofin',l:'Crédito Autofin'},{v:'Mixto',l:'Mixto'}]}/>
                </div>
                <div style={{ marginBottom:10 }}>
                  <Field label="Ticket asociado (opcional)" value={nw.ticket_id} onChange={v=>setNw({...nw,ticket_id:v})} opts={[{v:'',l:'Sin asociar'},...openTickets.map(t=>({v:t.id,l:`${t.ticket_num||''} · ${t.first_name||''} ${t.last_name||''}`.trim()}))]}/>
                </div>
                <Field label="Observaciones" value={nw.sale_notes} onChange={v=>setNw({...nw,sale_notes:v})} rows={2} ph="Ej: Venta registrada con retraso..."/>
              </div>
            )}
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div style={{ fontSize:11,color:'#6B7280' }}>
                {nw.added_as_sold&&<span style={{ color:'#EF4444',fontWeight:600 }}>Se creará como vendida</span>}
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button type="button" onClick={()=>{setShowAdd(false);setNw(BLANK_NW());}} style={S.btn2}>Cancelar</button>
                <button type="submit" disabled={adding} style={{ ...S.btn,opacity:adding?0.7:1,background:nw.added_as_sold?'#EF4444':undefined }}>
                  {adding?'Guardando...':nw.added_as_sold?'Registrar como vendida':'Agregar al inventario'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL — REGISTRAR VENTA
      ══════════════════════════════════════════════════════════ */}
      {showSell && sellUnit && (() => {
        const bName = brs.find(b=>b.id===sellUnit.branch_id)?.name || '—';
        return (
          <Modal onClose={()=>{setShowSell(false);setSellUnit(null);}} title="Registrar venta" wide>
            <form onSubmit={handleSell}>
              <div style={{ background:'#F8F9FB',border:'1px solid #E5E7EB',borderRadius:10,padding:'14px 18px',marginBottom:18,display:'flex',gap:18,flexWrap:'wrap' }}>
                <div style={{ flex:'1 1 180px' }}>
                  <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5 }}>Unidad</div>
                  <div style={{ fontWeight:900,fontSize:17,color:'#0F172A',marginBottom:2 }}>{sellUnit.brand} {sellUnit.model}</div>
                  <div style={{ fontSize:12,color:'#6B7280' }}>Color: {sellUnit.color} · Año {sellUnit.year}</div>
                </div>
                <div style={{ flex:'1 1 160px' }}>
                  <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5 }}>Identificación</div>
                  <div style={{ fontSize:11,color:'#374151',marginBottom:2 }}>
                    Chasis{' '}<span style={{ fontFamily:"'SF Mono',Consolas,monospace",fontWeight:700,background:'#F1F5F9',padding:'1px 6px',borderRadius:4,border:'1px solid #CBD5E1' }}>{sellUnit.chassis}</span>
                  </div>
                  {sellUnit.motor_num&&<div style={{ fontSize:11,color:'#374151' }}>Motor <span style={{ fontFamily:"'SF Mono',Consolas,monospace" }}>{sellUnit.motor_num}</span></div>}
                </div>
                <div style={{ flex:'1 1 120px' }}>
                  <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5 }}>Sucursal / Precio</div>
                  <div style={{ fontWeight:700,fontSize:12,color:'#374151' }}>{bName}</div>
                  {sellUnit.price>0&&<div style={{ fontSize:15,fontWeight:900,color:'#F28100',marginTop:4 }}>{fmt(sellUnit.price)}</div>}
                </div>
              </div>
              <div style={{ fontSize:11,fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:12 }}>Datos de la venta</div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
                <Field label="Vendedor responsable *" value={sellForm.sold_by} onChange={v=>setSellForm(p=>({...p,sold_by:v}))} opts={[{v:'',l:'Seleccionar vendedor...'},...sellers.map(s=>({v:s.id,l:`${s.first_name||''} ${s.last_name||''}`.trim()}))]} req/>
                <Field label="Fecha de venta *" value={sellForm.sold_at} onChange={v=>setSellForm(p=>({...p,sold_at:v}))} type="date"/>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
                <Field label="Estado documentación" value={sellForm.sale_type} onChange={v=>setSellForm(p=>({...p,sale_type:v}))} opts={[{v:'completa',l:'Documentación completa'},{v:'inscripcion',l:'Solo inscripción pendiente'},{v:'entregada',l:'Entregada al cliente'}]}/>
                <Field label="Método de pago" value={sellForm.payment_method} onChange={v=>setSellForm(p=>({...p,payment_method:v}))} opts={[{v:'',l:'Seleccionar...'},{v:'Contado',l:'Contado'},{v:'Transferencia',l:'Transferencia bancaria'},{v:'Tarjeta Débito',l:'Tarjeta Débito'},{v:'Tarjeta Crédito',l:'Tarjeta Crédito'},{v:'Crédito Autofin',l:'Crédito Autofin'},{v:'Mixto',l:'Mixto'}]}/>
              </div>
              <div style={{ marginBottom:12 }}>
                <Field label="Ticket asociado (opcional)" value={sellForm.ticket_id} onChange={v=>setSellForm(p=>({...p,ticket_id:v}))} opts={[{v:'',l:'Sin lead asociado'},...openTickets.map(t=>({v:t.id,l:`${t.ticket_num?t.ticket_num+' · ':''}${[t.first_name,t.last_name].filter(Boolean).join(' ')||'Sin nombre'}`}))]}/>
              </div>
              <div style={{ marginBottom:18 }}>
                <Field label="Observaciones" value={sellForm.sale_notes} onChange={v=>setSellForm(p=>({...p,sale_notes:v}))} rows={2} ph="Ej: Entrega pactada para el lunes..."/>
              </div>
              <div style={{ background:'rgba(16,185,129,0.05)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:11,color:'#065f46' }}>
                Al confirmar, la unidad saldrá del stock y quedará registrada como vendida con trazabilidad completa.
              </div>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:8 }}>
                <div style={{ fontSize:11,color:'#9CA3AF' }}>* Campos obligatorios</div>
                <div style={{ display:'flex',gap:8 }}>
                  <button type="button" onClick={()=>{setShowSell(false);setSellUnit(null);}} style={S.btn2}>Cancelar</button>
                  <button type="submit" disabled={selling||!sellForm.sold_by||!sellForm.sold_at}
                    style={{ ...S.btn,background:'#10B981',opacity:(selling||!sellForm.sold_by||!sellForm.sold_at)?0.6:1,padding:'8px 20px' }}>
                    {selling?'Registrando...':'Confirmar venta'}
                  </button>
                </div>
              </div>
            </form>
          </Modal>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════
          MODAL — IMPORTAR EXCEL
      ══════════════════════════════════════════════════════════ */}
      {showImport && (
        <Modal onClose={()=>setShowImport(false)} title="Importar inventario desde Excel" wide>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleImportFile}/>
          {!importPreview && !importDone && (
            <div style={{ textAlign:'center',padding:'32px 16px' }}>
              <div style={{ width:52,height:52,borderRadius:12,background:'#F3F4F6',border:'1px solid #E5E7EB',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:13,fontWeight:800,color:'#6B7280' }}>XLS</div>
              <p style={{ fontSize:13,color:'#374151',marginBottom:6 }}>Seleccioná tu plantilla Excel (.xlsx)</p>
              <p style={{ fontSize:11,color:'#6B7280',marginBottom:20 }}>Columnas: <strong>Sucursal · Año · Marca · Modelo · Color · N° Chasis · N° Motor · Estado · Precio</strong></p>
              <button onClick={()=>importFileRef.current?.click()} disabled={importLoading} style={{ ...S.btn,fontSize:13,padding:'10px 24px' }}>
                {importLoading?'Procesando...':'Seleccionar archivo'}
              </button>
            </div>
          )}
          {importPreview && (
            <>
              <div style={{ display:'flex',gap:10,marginBottom:14,flexWrap:'wrap' }}>
                {[{l:'Total filas',v:importPreview.total,c:'#6B7280'},{l:'Nuevas',v:importPreview.ok,c:'#10B981'},{l:'Duplicados',v:importPreview.duplicates,c:'#F59E0B'},{l:'Errores',v:importPreview.errors,c:'#EF4444'}].map(({l,v,c})=>(
                  <div key={l} style={{ ...S.card,padding:'8px 14px',textAlign:'center',flex:1,minWidth:80 }}>
                    <div style={{ fontSize:20,fontWeight:800,color:c }}>{v}</div>
                    <div style={{ fontSize:10,color:'#6B7280' }}>{l}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:11,color:'#6B7280',marginBottom:10 }}>Hoja: <strong>{importPreview.sheet}</strong> · Solo se importarán filas en verde.</p>
              <div style={{ maxHeight:320,overflowY:'auto',border:'1px solid #E5E7EB',borderRadius:8,marginBottom:14 }}>
                <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11 }}>
                  <thead style={{ position:'sticky',top:0,background:'#F9FAFB' }}>
                    <tr>{['Fila','Sucursal','Año','Marca','Modelo','Color','Chasis','Motor','Estado','Precio',''].map(h=><th key={h} style={{ padding:'6px 8px',textAlign:'left',fontSize:9,fontWeight:600,color:'#6B7280',textTransform:'uppercase',borderBottom:'1px solid #E5E7EB' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r,i)=>{
                      const bg=r._status==='ok'?'rgba(16,185,129,0.04)':r._status==='duplicate'?'rgba(245,158,11,0.06)':'rgba(239,68,68,0.06)';
                      const ic=r._status==='ok'?'#10B981':r._status==='duplicate'?'#F59E0B':'#EF4444';
                      return(
                        <tr key={i} style={{ borderBottom:'1px solid #F3F4F6',background:bg }}>
                          <td style={{ padding:'5px 8px',color:'#9CA3AF' }}>{r._row}</td>
                          <td style={{ padding:'5px 8px' }}>{r.branch_raw||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.year}</td>
                          <td style={{ padding:'5px 8px',fontWeight:600 }}>{r.brand||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.model||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.color||'-'}</td>
                          <td style={{ padding:'5px 8px',fontFamily:"'SF Mono',Consolas,monospace",fontSize:10 }}>{r.chassis||'-'}</td>
                          <td style={{ padding:'5px 8px',fontFamily:"'SF Mono',Consolas,monospace",fontSize:10 }}>{r.motor_num||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.status}</td>
                          <td style={{ padding:'5px 8px' }}>{r.price?fmt(r.price):'-'}</td>
                          <td style={{ padding:'5px 8px',color:ic,fontSize:10,fontWeight:600 }}>
                            {r._status==='ok'?'Nueva':r._status==='duplicate'?'Ya existe':r._errors?.join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8 }}>
                <button onClick={()=>{setImportPreview(null);importFileRef.current?.click();}} style={{ ...S.btn2,fontSize:12 }}>Cambiar archivo</button>
                <div style={{ display:'flex',gap:8 }}>
                  <button onClick={()=>setShowImport(false)} style={S.btn2}>Cancelar</button>
                  <button onClick={handleImportConfirm} disabled={importLoading||importPreview.ok===0}
                    style={{ ...S.btn,opacity:(importLoading||importPreview.ok===0)?0.6:1 }}>
                    {importLoading?'Importando...':`Importar ${importPreview.ok} unidades nuevas`}
                  </button>
                </div>
              </div>
            </>
          )}
          {importDone && (
            <div style={{ textAlign:'center',padding:'32px 16px' }}>
              <div style={{ width:44,height:44,borderRadius:'50%',background:'rgba(16,185,129,0.1)',border:'1.5px solid rgba(16,185,129,0.25)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:11,fontWeight:700,color:'#10B981' }}>OK</div>
              <h3 style={{ fontSize:16,fontWeight:700,marginBottom:8 }}>Importación completada</h3>
              <p style={{ fontSize:13,color:'#374151',marginBottom:4 }}><strong>{importDone.inserted}</strong> unidades agregadas</p>
              {importDone.skipped>0&&<p style={{ fontSize:12,color:'#F59E0B' }}>{importDone.skipped} duplicadas omitidas</p>}
              <div style={{ display:'flex',gap:8,justifyContent:'center',marginTop:20 }}>
                <button onClick={()=>{setImportPreview(null);setImportDone(null);importFileRef.current?.click();}} style={S.btn2}>Importar otro archivo</button>
                <button onClick={()=>setShowImport(false)} style={S.btn}>Cerrar</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Estilos locales ──────────────────────────────────────────────────────────

const btnOrange = {
  display:'flex', alignItems:'center', gap:6,
  background:'#F28100', border:'none', color:'#FFFFFF',
  borderRadius:9, fontSize:12, fontWeight:700, cursor:'pointer',
  padding:'9px 18px', fontFamily:'inherit',
  boxShadow:'0 2px 8px rgba(242,129,0,0.35)',
};
const btnGhost = {
  display:'flex', alignItems:'center', gap:6,
  background:'#FFFFFF', border:'1.5px solid #E5E7EB', color:'#374151',
  borderRadius:9, fontSize:12, fontWeight:500, cursor:'pointer',
  padding:'8px 14px', fontFamily:'inherit',
};
const selectCtrl = {
  height:32, borderRadius:7, border:'1.5px solid #E5E7EB',
  background:'#FFFFFF', color:'#374151', fontSize:12,
  padding:'0 8px', cursor:'pointer', fontFamily:'inherit', outline:'none',
};
const miniBtn = {
  padding:'5px 10px', borderRadius:7, fontSize:10, fontWeight:600,
  cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
  background:'#F8FAFC', color:'#64748B', border:'1px solid #E2E8F0',
};
