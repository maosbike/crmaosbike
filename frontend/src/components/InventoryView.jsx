import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, normalizeText, ROLES, hasRole, ROLE_ADMIN_WRITE, ViewHeader, useIsMobile, colorNameToCss, selectCtrl, Empty, ErrorMsg } from '../ui.jsx';

// ─── Datos de configuración ────────────────────────────────────────────────────

const BLANK_NW = () => ({
  branch_id:'', year:new Date().getFullYear(), brand:'', model:'', color:'', chassis:'', motor_num:'',
  added_as_sold:false, sold_at:new Date().toISOString().split('T')[0],
  sold_by:'', ticket_id:'', sale_notes:'', payment_method:'', sale_type:'completa',
});
const HIST_ICONS  = { created:'C', imported:'I', sold:'V', status_changed:'E', moved:'T', note:'N' };
const HIST_LABELS = { created:'Creada', imported:'Importada', sold:'Venta', status_changed:'Cambio estado', moved:'Traslado', note:'Nota' };

// Paleta de colores por código — solo la paleta está hardcodeada.
// El label y la existencia de la sucursal vienen de realBranches (DB).
const BRANCH_COLORS = {
  MPN:  { color:'#2563EB', light:'#EFF6FF' },
  MPS:  { color:'#059669', light:'#ECFDF5' },
  MPSY: { color:'#7C3AED', light:'#F5F3FF' },
  MOV:  { color:'#D97706', light:'#FFFBEB' },
};
const FALLBACK_BRANCH_COLOR = { color:'#6B7280', light:'#F9FAFB' };
// Resuelve cfg {color, light, label} combinando paleta + DB. Si la sucursal
// existe en DB pero no está en la paleta, cae al color gris fallback.
const branchCfg = (code, brs) => {
  const paint = BRANCH_COLORS[code] || FALLBACK_BRANCH_COLOR;
  const db    = (brs || []).find(b => b.code === code);
  return { ...paint, label: db?.name || code || '—' };
};

// Paleta visual extendida para la card completa (colores más oscuros + bg/border/icon).
// Los labels los tomamos de INV_ST (fuente única en ui.jsx) vía `label: INV_ST[k].l`
// para no duplicar texto entre módulos.
const ST_PALETTE = {
  disponible:  { color:'#15803D', bg:'#F0FDF4', border:'#86EFAC', icon:'●' },
  reservada:   { color:'#B45309', bg:'#FFFBEB', border:'#FCD34D', icon:'◐' },
  vendida:     { color:'#6D28D9', bg:'#F5F3FF', border:'#C4B5FD', icon:'V' },
  preinscrita: { color:'#0E7490', bg:'#ECFEFF', border:'#67E8F9', icon:'◌' },
};
const ST_CFG = Object.fromEntries(
  Object.entries(ST_PALETTE).map(([k, v]) => [k, { ...v, label: INV_ST[k]?.l || k }])
);

// Entradas locales no cubiertas por COLOR_CSS_MAP de ui.jsx
const EXTRA_COLORS = {
  'negro mate':'#1F2937', 'negro metalico':'#374151', 'negro brillante':'#111827',
  'blanco perla':'#F0EDE8', 'blanco nieve':'#F9FAFB', 'blanco polar':'#F3F4F6',
  'rojo oscuro':'#991B1B', 'rojo metalico':'#DC2626', 'rojo brillante':'#EF4444',
  'azul marino':'#1E3A8A', 'azul metalico':'#1D4ED8', 'azul oscuro':'#1E3A8A',
  'azul cielo':'#0EA5E9', 'azul claro':'#38BDF8', 'azul royal':'#2563EB',
  'verde oscuro':'#14532D', 'verde militar':'#4D7C0F', 'verde oliva':'#65A30D',
  'verde bosque':'#166534', 'verde metalico':'#16A34A', 'verde lima':'#84CC16',
  'gris oscuro':'#374151', 'gris claro':'#D1D5DB', 'gris metalico':'#6B7280',
  'gris perla':'#E5E7EB', 'gris plata':'#9CA3AF', 'gris titanio':'#4B5563',
  'naranja metalico':'#C2410C', 'naranja fluor':'#F97316',
  'amarillo metalico':'#B45309', 'amarillo fluor':'#EAB308',
  plata:'#9CA3AF', 'plata metalico':'#D1D5DB', 'plata mate':'#9CA3AF',
  perla:'#E8E0D0', bordo:'#9F1239', vino:'#9F1239', guinda:'#881337',
  fucsia:'#DB2777', violeta:'#7C3AED', lila:'#A78BFA',
  oro:'#CA8A04', bronce:'#92400E', cafe:'#78350F',
  marron:'#92400E', crema:'#FEF3C7', champagne:'#F5E6C8',
  titanio:'#6B7280', grafito:'#374151', antracita:'#1F2937',
};
// Resolver color CSS: busca primero en entradas extra locales (con normalizeText
// para matching sin acentos ni case), luego cae a colorNameToCss de ui.jsx.
// Incluye búsqueda parcial para variantes compuestas ("AZUL METALICO OSCURO" → "azul metalico").
const getColorCss = c => {
  if (!c) return null;
  const key = normalizeText(c);
  const exact = Object.entries(EXTRA_COLORS).find(([k]) => normalizeText(k) === key);
  if (exact) return exact[1];
  const partial = Object.entries(EXTRA_COLORS).find(([k]) => {
    const nk = normalizeText(k);
    return key.includes(nk) || nk.includes(key);
  });
  if (partial) return partial[1];
  const fromCentral = colorNameToCss(c);
  return fromCentral !== '#9CA3AF' ? fromCentral : null;
};

// ─── Componente principal ──────────────────────────────────────────────────────

export function InventoryView({ inv, setInv, user, realBranches, nav }) {
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
  const [histOpen,  setHistOpen]   = useState(new Set());
  const [histData,  setHistData]   = useState({});
  const [histLoading,setHistLoading] = useState({});
  const [histErr,   setHistErr]    = useState({});
  const [showImport,setShowImport] = useState(false);
  const [importPreview,setImportPreview] = useState(null);
  const [importLoading,setImportLoading] = useState(false);
  const [importDone,setImportDone] = useState(null);
  const importFileRef  = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef= useRef(null);
  const photoTargetRef = useRef(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const isAdmin      = hasRole(user, ...ROLE_ADMIN_WRITE);
  const isSuperAdmin = hasRole(user, ROLES.SUPER);

  // Mobile detection — usa hook centralizado de ui.jsx (alineado con responsive.css ≤767px).
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const gridCols = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(480px, 1fr))';
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCards, setExpandedCards] = useState(new Set());
  // Banner de error de recarga — cuando la sincronización con el backend falla.
  const [reloadErr, setReloadErr] = useState('');
  // Error inline para operaciones de foto/estado/mover fuera del modal de edición.
  const [inlineErr, setInlineErr] = useState('');
  const toggleExpand = id => setExpandedCards(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Modal edición
  const [editTarget,       setEditTarget]       = useState(null);
  const [eForm,            setEForm]            = useState({});
  const [eSaving,          setESaving]          = useState(false);
  const [eErr,             setEErr]             = useState('');
  const [modelColorPhotos, setModelColorPhotos] = useState([]);
  const [convSaving, setConvSaving] = useState(false);
  const [addErr,     setAddErr]     = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletingUnit,  setDeletingUnit]  = useState(false);
  const [branchPhotos,  setBranchPhotos]  = useState({});

  // Inicializar fotos de sucursales desde realBranches
  useEffect(() => {
    const map = {};
    brs.forEach(b => { if (b.photo_url) map[b.id] = b.photo_url; });
    setBranchPhotos(map);
  }, [realBranches]);

  // Drag-and-drop (solo super_admin)
  const dragItem    = useRef(null);
  const [dragging,  setDragging]  = useState(false);
  const [exporting, setExporting] = useState(false);

  const brands = [...new Set(inv.map(x => x.brand).filter(Boolean))].sort();
  const canDrag = isSuperAdmin && brF && !search && !stF && !brandF;

  const f = inv.filter(x => {
    if (brF    && x.branch_id !== brF)   return false;
    if (stF    && x.status    !== stF)   return false;
    if (brandF && x.brand     !== brandF)return false;
    if (search && !`${x.brand} ${x.model} ${x.chassis} ${x.color}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const counts = Object.fromEntries(Object.keys(INV_ST).map(k => [k, inv.filter(x => x.status === k).length]));
  const reload = () => {
    setReloadErr('');
    return api.getInventory()
      .then(d => setInv(Array.isArray(d) ? d : []))
      .catch(e => setReloadErr('No se pudo actualizar el inventario: ' + (e?.message || 'error de conexión')));
  };
  const hasFilters = search || brF || stF || brandF;
  const showHub = !brF && !search && !stF && !brandF;
  const clearFilters = () => { setSearch(''); setBrF(''); setStF(''); setBrandF(''); };

  useEffect(() => {
    api.getSellers().then(d => setSellers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showAdd) return;
    // Paginado: trae todas las páginas (chunks de 200) con tope de seguridad.
    (async () => {
      const PAGE_SIZE=200, MAX_PAGES=50;
      const acc=[];
      try {
        for (let page=1; page<=MAX_PAGES; page++) {
          const r=await api.getTickets({page,limit:PAGE_SIZE});
          const batch=r?.data||[];
          acc.push(...batch);
          const total=typeof r?.total==='number'?r.total:acc.length;
          if (acc.length>=total||batch.length<PAGE_SIZE) break;
        }
        setOpenTickets(acc.filter(t => !['perdido'].includes(t.status)));
      } catch {}
    })();
  }, [showAdd]);

  // ── Handlers (sin cambios de lógica) ────────────────────────────────────────

  const handleAdd = async e => {
    e.preventDefault(); setAdding(true); setAddErr('');
    try {
      await api.createInventory({
        branch_id:nw.branch_id||null, year:Number(nw.year),
        brand:nw.brand, model:nw.model, color:nw.color,
        chassis:nw.chassis||null, motor_num:nw.motor_num||null,
        added_as_sold:nw.added_as_sold,
        ...(nw.added_as_sold ? {
          sold_at:nw.sold_at||null, sold_by:nw.sold_by||null,
          ticket_id:nw.ticket_id||null, sale_notes:nw.sale_notes||null,
          payment_method:nw.payment_method||null, sale_type:nw.sale_type||null,
        } : {})
      });
      setShowAdd(false); setNw(BLANK_NW()); setAddErr(''); reload();
    } catch(ex) { setAddErr(ex.message||'Error al agregar la unidad'); }
    finally { setAdding(false); }
  };
  const handlePhoto = (id, field) => {
    if (isMobile) {
      photoTargetRef.current = { id, field };
      setShowPhotoPicker(true);
    } else {
      const input = document.createElement('input'); input.type='file'; input.accept='image/*';
      input.onchange = async e => {
        const file = e.target.files[0]; if (!file) return;
        try { const r = await api.uploadInvPhoto(id,file,field); setInv(p=>p.map(x=>x.id===id?{...x,[field]:r.url}:x)); }
        catch(ex) { setInlineErr(ex.message||'Error al subir foto'); }
      };
      input.click();
    }
  };
  const handlePhotoFile = async file => {
    if (!file || !photoTargetRef.current) return;
    const { id, field } = photoTargetRef.current;
    photoTargetRef.current = null;
    try { const r = await api.uploadInvPhoto(id,file,field); setInv(p=>p.map(x=>x.id===id?{...x,[field]:r.url}:x)); }
    catch(ex) { setInlineErr(ex.message||'Error al subir foto'); }
  };
  const handleImportFile = async e => {
    const file = e.target.files[0]; if (!file) return;
    setImportLoading(true); setImportPreview(null); setImportDone(null);
    try { const d = await api.importInventoryPreview(file); setImportPreview(d); }
    catch(ex) { setInlineErr(ex.message||'Error al leer archivo'); }
    finally { setImportLoading(false); if(importFileRef.current) importFileRef.current.value=''; }
  };
  const handleImportConfirm = async () => {
    if (!importPreview) return;
    const okRows = importPreview.rows.filter(r => r._status==='ok' || r._status==='warning');
    if (!okRows.length) return;
    setImportLoading(true);
    try { const r = await api.importInventoryConfirm(okRows); setImportDone(r); setImportPreview(null); reload(); }
    catch(ex) { setInlineErr(ex.message||'Error al importar'); }
    finally { setImportLoading(false); }
  };
  const handleStatus = async (id, status) => {
    setInv(p => p.map(x => x.id===id ? {...x,status} : x));
    try { await api.updateInventory(id, {status}); } catch(ex) { setInlineErr(ex.message||'Error al cambiar estado'); reload(); }
  };
  const handleMove = async (id, branch_id) => {
    setInv(p => p.map(x => x.id===id ? {...x,branch_id} : x));
    try { await api.updateInventory(id, {branch_id}); reload(); } catch(ex) { setInlineErr(ex.message||'Error al mover la unidad'); reload(); }
  };
  const openEdit = (unit) => {
    setEErr(''); setDeleteConfirm(false);
    setEForm({
      branch_id:      unit.branch_id      || '',
      brand:          unit.brand          || '',
      model:          unit.model          || '',
      year:           unit.year           || '',
      color:          unit.color          || '',
      chassis:        unit.chassis        || '',
      motor_num:      unit.motor_num      || '',
      status:         unit.status         || 'disponible',
      notes:          unit.notes          || '',
      // Campos de reserva/venta
      sold_by:        unit.sold_by        || '',
      sale_price:     unit.sale_price     || '',
      invoice_amount: unit.invoice_amount || '',
      client_name:    unit.client_name    || '',
      client_rut:     unit.client_rut     || '',
      payment_method: unit.payment_method || '',
      sale_notes:     unit.sale_notes     || '',
    });
    setEditTarget(unit);
    // Cargar colores del modelo desde catálogo para mostrar swatches
    setModelColorPhotos([]);
    if (unit.brand && unit.model) {
      api.getModels({ brand: unit.brand, q: unit.model, limit: 5 })
        .then(mods => {
          const mod = mods.find(x => x.model?.toUpperCase() === unit.model?.toUpperCase()) || mods[0];
          if (mod) {
            const cps = Array.isArray(mod.color_photos) ? mod.color_photos
                      : (mod.color_photos ? JSON.parse(mod.color_photos) : []);
            setModelColorPhotos(cps.filter(cp => cp.color));
          }
        }).catch(() => {});
    }
  };
  const handleEditSave = async e => {
    e.preventDefault();
    setESaving(true); setEErr('');
    try {
      const payload = {
        branch_id: eForm.branch_id || null,
        brand:     eForm.brand,
        model:     eForm.model,
        year:      eForm.year,
        color:     eForm.color,
        chassis:   eForm.chassis,
        motor_num: eForm.motor_num || null,
        status:    eForm.status,
        notes:     eForm.notes || null,
      };
      // Si es reservada, guardar también campos de venta
      if (editTarget?.status === 'reservada') {
        payload.sold_by        = eForm.sold_by        || null;
        payload.sale_price     = eForm.sale_price     ? parseInt(eForm.sale_price)     : null;
        payload.invoice_amount = eForm.invoice_amount ? parseInt(eForm.invoice_amount) : null;
        payload.client_name    = eForm.client_name    || null;
        payload.client_rut     = eForm.client_rut     || null;
        payload.payment_method = eForm.payment_method || null;
        payload.sale_notes     = eForm.sale_notes     || null;
      }
      const updated = await api.updateInventory(editTarget.id, payload);
      setInv(prev => prev.map(x => x.id === editTarget.id ? { ...x, ...updated } : x));
      setEditTarget(null);
      reload();
    } catch(ex) { setEErr(ex.message || 'Error al guardar'); }
    finally { setESaving(false); }
  };

  const handleConvertToSale = async () => {
    if (!editTarget) return;
    if (!eForm.sold_by && !editTarget.sold_by) { setEErr('Vendedor requerido para convertir a venta'); return; }
    setConvSaving(true); setEErr('');
    try {
      const updated = await api.sellInventory(editTarget.id, {
        sold_by:        eForm.sold_by        || editTarget.sold_by,
        sale_price:     eForm.sale_price     ? parseInt(eForm.sale_price)     : (editTarget.sale_price     || null),
        invoice_amount: eForm.invoice_amount ? parseInt(eForm.invoice_amount) : (editTarget.invoice_amount || null),
        client_name:    eForm.client_name    || editTarget.client_name    || null,
        client_rut:     eForm.client_rut     || editTarget.client_rut     || null,
        payment_method: eForm.payment_method || editTarget.payment_method || null,
        sale_notes:     eForm.sale_notes     || editTarget.sale_notes     || null,
        sold_at:        new Date().toISOString(),
      });
      setInv(prev => prev.map(x => x.id === editTarget.id ? { ...x, ...updated } : x));
      setEditTarget(null);
      reload();
    } catch(ex) { setEErr(ex.message || 'Error al convertir a venta'); }
    finally { setConvSaving(false); }
  };

  const handleDragStart = (e, id) => {
    dragItem.current = id;
    setDragging(true);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragEnd = () => { setDragging(false); dragItem.current = null; };
  const handleDrop = (e, toId) => {
    e.preventDefault();
    const fromId = dragItem.current;
    dragItem.current = null;
    setDragging(false);
    if (!fromId || !toId || fromId === toId) return;
    // Capture visible IDs at drop time (not inside setState)
    const visibleIds = new Set(f.map(x => x.id));
    setInv(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(x => x.id === fromId);
      const toIdx   = arr.findIndex(x => x.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      // Only reorder the visible (branch-filtered) items — don't overwrite other branches
      let order = 1;
      const items = [];
      const result = arr.map(x => {
        if (visibleIds.has(x.id)) {
          items.push({ id: x.id, sort_order: order });
          return { ...x, sort_order: order++ };
        }
        return x;
      });
      api.reorderInventory(items).catch(() => reload());
      return result;
    });
  };

  const handleBranchPhoto = (branchId) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const r = await api.uploadBranchPhoto(branchId, file);
        setBranchPhotos(p => ({ ...p, [branchId]: r.url }));
      } catch (ex) { setInlineErr(ex.message || 'Error al subir foto de sucursal'); }
    };
    input.click();
  };

  const handleDelete = async () => {
    if (!editTarget) return;
    setDeletingUnit(true);
    try {
      await api.deleteInventory(editTarget.id);
      setInv(p => p.filter(x => x.id !== editTarget.id));
      setEditTarget(null); setDeleteConfirm(false);
    } catch (ex) { setEErr(ex.message || 'Error al eliminar'); }
    finally { setDeletingUnit(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.exportInventory(brF ? { branch_id: brF } : undefined);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `inventario_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch(ex) { setInlineErr(ex.message || 'Error al exportar'); }
    finally { setExporting(false); }
  };

  const toggleHist = async id => {
    const next = new Set(histOpen);
    if (next.has(id)) { next.delete(id); }
    else {
      next.add(id);
      if (!histData[id]) {
        setHistLoading(p => ({...p,[id]:true}));
        try { const d = await api.getInventoryHistory(id); setHistData(p=>({...p,[id]:d})); }
        catch(e) { setHistErr(p=>({...p,[id]:e?.message||'No se pudo cargar el historial. Verifica la conexión.'})); }
        finally { setHistLoading(p => ({...p,[id]:false})); }
      }
    }
    setHistOpen(next);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div>

      {reloadErr && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)', color:'#B91C1C', padding:'10px 14px', borderRadius:10, fontSize:12, fontWeight:600, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{reloadErr}</span>
          <button onClick={()=>reload()} style={{ background:'#DC2626', color:'#ffffff', border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Reintentar</button>
        </div>
      )}
      {inlineErr && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)', color:'#B91C1C', padding:'10px 14px', borderRadius:10, fontSize:12, fontWeight:600, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{inlineErr}</span>
          <button onClick={()=>setInlineErr('')} style={{ background:'none', border:'none', color:'#B91C1C', fontSize:16, cursor:'pointer', lineHeight:1, padding:'0 4px' }}>×</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ENCABEZADO
      ══════════════════════════════════════════════════════════ */}
      <ViewHeader
        preheader="Operaciones · Stock"
        title="Inventario"
        count={f.length}
        itemLabel="unidad"
        filtered={hasFilters}
        actions={
          <>
            {isAdmin && (
              <>
                <button onClick={handleExport} disabled={exporting} style={{...btnGhost, justifyContent:'center', padding: isMobile ? '9px 10px' : '8px 14px'}}>
                  <Ic.dl size={13} color="#6B7280"/> {exporting ? 'Exportando…' : (isMobile ? 'Exportar' : 'Exportar Excel')}
                </button>
                <button onClick={()=>{setShowImport(true);setImportPreview(null);setImportDone(null);}}
                  style={{...btnGhost, justifyContent:'center', padding: isMobile ? '9px 10px' : '8px 14px'}}>
                  <Ic.upload size={13} color="#6B7280"/> {isMobile ? 'Importar' : 'Importar Excel'}
                </button>
              </>
            )}
            {isAdmin && (
              <button onClick={()=>{ setNw({...BLANK_NW(), branch_id: brF||''}); setShowAdd(true); }}
                style={{...btnOrange, justifyContent:'center', padding: isMobile ? '10px 14px' : '9px 18px'}}>
                <Ic.plus size={14} color="#ffffff"/> Nueva unidad
              </button>
            )}
          </>
        }
      />

      {/* ══════════════════════════════════════════════════════════
          KPI — strip horizontal compacto
      ══════════════════════════════════════════════════════════ */}
      <div style={{ display:'flex', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 12 : 18, flexWrap:'wrap' }}>
        {Object.entries(ST_CFG).map(([k,v]) => {
          const active = stF === k;
          const cnt = counts[k] || 0;
          return (
            <button key={k} onClick={()=>setStF(stF===k?'':k)}
              style={{
                flex:'1 1 80px', minWidth: isMobile ? 72 : 100,
                position:'relative', overflow:'hidden',
                padding: isMobile ? '10px 10px 8px' : '10px 16px 8px', borderRadius:10, border:'none',
                background: active ? v.bg : '#FFFFFF',
                cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                outline: active ? `2px solid ${v.color}` : '1px solid #E5E7EB',
                outlineOffset: active ? 1 : 0,
                boxShadow: active ? `0 2px 12px ${v.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
                transition:'all 0.15s',
              }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:v.color, borderRadius:'10px 10px 0 0' }}/>
              <div style={{ fontSize: isMobile ? 22 : 28, fontWeight:900, color: active ? v.color : '#111827', letterSpacing:'-1px', lineHeight:1, marginBottom:3 }}>
                {cnt}
              </div>
              <div style={{ fontSize: isMobile ? 10 : 11, fontWeight:700, color: active ? v.color : '#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{v.label}</div>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════
          BARRA DE FILTROS — mobile: botón toggle; desktop: línea compacta
      ══════════════════════════════════════════════════════════ */}
      {isMobile ? (
        <div style={{ marginBottom:14 }}>
          {/* Fila: buscador + botón Filtros */}
          <div style={{ display:'flex', gap:8, marginBottom: showFilters ? 8 : 0 }}>
            <div style={{ position:'relative', flex:1 }}>
              <Ic.search size={13} color="#9CA3AF" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar modelo, chasis..."
                style={{ ...S.inp, paddingLeft:30, width:'100%', height:36, borderRadius:8, fontSize:12, boxSizing:'border-box' }}/>
            </div>
            <button onClick={()=>setShowFilters(p=>!p)}
              style={{
                height:36, padding:'0 14px', borderRadius:8, border:`1.5px solid ${showFilters||hasFilters?'#4F46E5':'#E5E7EB'}`,
                background: showFilters||hasFilters ? '#EEF2FF' : '#F9FAFB',
                color: showFilters||hasFilters ? '#4F46E5' : '#6B7280',
                fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                display:'flex', alignItems:'center', gap:5, flexShrink:0,
              }}>
              <Ic.gear size={13}/> Filtros{hasFilters ? ` (${[brF,brandF,stF].filter(Boolean).length})` : ''}
            </button>
          </div>
          {/* Panel expandible */}
          {showFilters && (
            <div style={{ display:'flex', flexDirection:'column', gap:7, padding:'12px 14px', background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:10 }}>
              <div style={{ display:'flex', gap:7 }}>
                <select value={brF} onChange={e=>setBrF(e.target.value)}
                  style={{ flex:1, ...selectCtrl }}>
                  <option value="">Todas las sucs.</option>
                  {brs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={brandF} onChange={e=>setBrandF(e.target.value)}
                  style={{ flex:1, ...selectCtrl }}>
                  <option value="">Todas las marcas</option>
                  {brands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              {/* Chips de estado */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {Object.entries(ST_CFG).map(([k,v]) => (
                  <button key={k} onClick={()=>setStF(stF===k?'':k)}
                    style={{
                      padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:600,
                      cursor:'pointer', border:'none', fontFamily:'inherit',
                      background: stF===k ? v.color : '#F3F4F6',
                      color: stF===k ? '#fff' : '#6B7280',
                      transition:'all 0.15s',
                    }}>
                    {v.label}
                  </button>
                ))}
              </div>
              {hasFilters && (
                <button onClick={clearFilters}
                  style={{ alignSelf:'flex-start', padding:'4px 12px', borderRadius:7, border:'1px solid #E5E7EB', background:'#FFFFFF', fontSize:11, cursor:'pointer', color:'#6B7280', fontFamily:'inherit' }}>
                  Limpiar · {f.length} resultado{f.length!==1?'s':''}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── BARRA DESKTOP — una sola línea compacta ── */
        <div style={{
          display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
          background:'#F9FAFB', border:'1px solid #E5E7EB',
          borderRadius:10, padding:'8px 14px', marginBottom:16,
        }}>
          {/* Buscador */}
          <div style={{ position:'relative', flex:'1 1 160px', minWidth:140 }}>
            <Ic.search size={13} color="#9CA3AF" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar modelo, chasis, color..."
              style={{ ...selectCtrl, paddingLeft:28, width:'100%', boxSizing:'border-box', background:'#fff' }}/>
          </div>
          <div style={{ width:1, height:22, background:'#E5E7EB', flexShrink:0 }}/>
          {/* Sucursal */}
          <select value={brF} onChange={e=>setBrF(e.target.value)} style={{ ...selectCtrl, width:130 }}>
            <option value="">Todas las sucs.</option>
            {brs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {/* Marca */}
          <select value={brandF} onChange={e=>setBrandF(e.target.value)} style={{ ...selectCtrl, width:120 }}>
            <option value="">Todas las marcas</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div style={{ width:1, height:22, background:'#E5E7EB', flexShrink:0 }}/>
          {/* Chips de estado */}
          {Object.entries(ST_CFG).map(([k,v]) => (
            <button key={k} onClick={()=>setStF(stF===k?'':k)}
              style={{
                padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:600,
                cursor:'pointer', border:'none', fontFamily:'inherit',
                background: stF===k ? v.color : '#F3F4F6',
                color: stF===k ? '#fff' : '#6B7280',
                transition:'all 0.15s',
              }}>
              {v.label}
            </button>
          ))}
          {/* Limpiar */}
          {hasFilters && (
            <>
              <div style={{ width:1, height:22, background:'#E5E7EB', flexShrink:0 }}/>
              <button onClick={clearFilters}
                style={{ padding:'4px 10px', height:32, borderRadius:7, border:'1px solid #E5E7EB', background:'#FFFFFF', fontSize:11, cursor:'pointer', color:'#6B7280', display:'flex', alignItems:'center', gap:5, fontWeight:500, fontFamily:'inherit' }}>
                <Ic.x size={10}/>{f.length} resultado{f.length!==1?'s':''}
              </button>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          LISTA DE UNIDADES — Cards horizontales
      ══════════════════════════════════════════════════════════ */}

      {/* ══════ HUB: vista por sucursal ══════ */}
      {showHub ? (
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:16, marginTop:8 }}>
          {(brs.map(b=>b.code).filter(Boolean)).map(code => {
            const cfg    = branchCfg(code, brs);
            const brData = brs.find(b => b.code === code);
            const id     = brData?.id;
            const brPhoto= branchPhotos[id] || brData?.photo_url;
            const cnt    = inv.filter(x => x.branch_id === id && x.status !== 'vendida').length;
            const vend   = inv.filter(x => x.branch_id === id && x.status === 'vendida').length;
            const disp   = inv.filter(x => x.branch_id === id && x.status === 'disponible').length;
            const res    = inv.filter(x => x.branch_id === id && x.status === 'reservada').length;
            return (
              <button key={code} onClick={() => id && setBrF(id)}
                style={{
                  background:'#FFFFFF', border:`1.5px solid ${cfg.color}28`,
                  borderRadius:16, padding:0,
                  cursor: id ? 'pointer' : 'default',
                  textAlign:'left', fontFamily:'inherit',
                  boxShadow:`0 2px 10px ${cfg.color}14`,
                  transition:'box-shadow 0.15s, transform 0.12s',
                  position:'relative', overflow:'hidden',
                }}
                onMouseEnter={e=>{ e.currentTarget.style.boxShadow=`0 6px 24px ${cfg.color}2a`; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.boxShadow=`0 2px 10px ${cfg.color}14`; e.currentTarget.style.transform='translateY(0)'; }}
              >
                {/* Zona foto — aspectRatio fijo con overlay gradiente */}
                <div onClick={e=>e.stopPropagation()}
                  style={{ width:'100%', aspectRatio:'16/9', position:'relative', background:`${cfg.color}12`, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {brPhoto
                    ? <>
                        <img src={brPhoto} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} alt={cfg.label}/>
                        {/* Overlay gradiente para legibilidad */}
                        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.12) 55%, transparent 100%)' }}/>
                        {/* Nombre sobre la foto */}
                        <div style={{ position:'absolute', bottom:10, left:12, right:40 }}>
                          <div style={{ fontSize:16, fontWeight:700, color:'#FFFFFF', textShadow:'0 1px 4px rgba(0,0,0,0.4)', lineHeight:1.2 }}>{cfg.label}</div>
                        </div>
                        {isAdmin && (
                          <button onClick={()=>id && handleBranchPhoto(id)} title="Cambiar foto"
                            style={{ position:'absolute', bottom:7, right:8, background:'rgba(0,0,0,0.55)', border:'none', borderRadius:5, color:'#ffffff', fontSize:10, fontWeight:700, cursor:'pointer', padding:'3px 7px' }}>
                            Editar
                          </button>
                        )}
                      </>
                    : <>
                        {/* Sin foto — placeholder con color */}
                        <div style={{ position:'absolute', inset:0, background:`linear-gradient(135deg, ${cfg.color}18 0%, ${cfg.color}06 100%)` }}/>
                        <div style={{ position:'relative', textAlign:'center' }}>
                          {isAdmin
                            ? <button onClick={()=>id && handleBranchPhoto(id)} style={{ background:'none', border:`1px dashed ${cfg.color}60`, borderRadius:8, cursor:'pointer', fontSize:11, color:cfg.color, fontWeight:700, padding:'6px 12px' }}>+ Agregar foto</button>
                            : <span style={{ fontSize:11, color:cfg.color, fontWeight:600, opacity:0.4 }}>Sin foto</span>
                          }
                        </div>
                      </>
                  }
                </div>
                {/* Cuerpo info */}
                <div style={{ padding: isMobile ? '10px 12px' : '12px 16px' }}>
                  {!brPhoto && (
                    <div style={{ fontSize:16, fontWeight:700, color:'#111827', marginBottom:8 }}>{cfg.label}</div>
                  )}
                  {brPhoto && <div style={{ marginBottom:8 }}/>}
                  {/* Contadores de estado */}
                  <div style={{ display:'flex', gap: isMobile ? 6 : 10 }}>
                    {[
                      { label:'Disp.', val:disp, color:ST_CFG.disponible.color },
                      { label:'Res.', val:res, color:ST_CFG.reservada.color },
                      { label:'Vend.', val:vend, color:ST_CFG.vendida.color },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ textAlign:'center', flex:1 }}>
                        <div style={{ fontSize: isMobile ? 20 : 26, fontWeight:900, color, lineHeight:1 }}>{val}</div>
                        <div style={{ fontSize: isMobile ? 9 : 10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* ══════ LIST VIEW ══════ */
        <>
          {/* Botón volver (solo cuando brF está activo) */}
          {brF && (
            <button onClick={clearFilters}
              style={{ marginBottom:12, display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:'#4B5563', fontFamily:'inherit', padding:0 }}>
              ← Volver a sucursales
            </button>
          )}

          {f.length === 0 ? (
            <div style={{ background:'#FFFFFF', borderRadius:14, border:'1px dashed #E5E7EB' }}>
              <Empty
                icon={Ic.box}
                title={hasFilters ? 'Sin resultados con estos filtros' : 'Sin unidades en el inventario'}
                hint={hasFilters ? undefined : 'Agrega unidades manualmente o impórtalas desde Excel.'}
                action={hasFilters
                  ? <button onClick={clearFilters} style={{ background:'none', border:'none', color:'#F28100', fontSize:12, cursor:'pointer', textDecoration:'underline', padding:0, fontFamily:'inherit' }}>Limpiar filtros</button>
                  : undefined}
              />
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns: gridCols, gap:8 }}>
              {/* Contador + hint de orden — ocupa todo el ancho */}
              <div style={{ gridColumn:'1 / -1', display:'flex', justifyContent:'space-between', alignItems:'center', paddingLeft:2, marginBottom:2 }}>
                <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:500 }}>
                  {f.length} unidad{f.length!==1?'es':''}{hasFilters&&` (filtradas de ${inv.length})`}
                </div>
                {canDrag && (
                  <div style={{ fontSize:10, color:'#9CA3AF', display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ fontSize:13 }}>⠿</span> Arrastra para reordenar
                  </div>
                )}
              </div>

              {f.map(x => {
            const isSold    = x.status === 'vendida';
            const stCfg     = ST_CFG[x.status] || ST_CFG.disponible;
            const bCode     = x.branch_code || brs.find(b => b.id===x.branch_id)?.code || '';
            const bCfg      = branchCfg(bCode, brs);
            const isHistOpen= histOpen.has(x.id);
            const cDot      = getColorCss(x.color);

            // ── MOBILE CARD ────────────────────────────────────────
            if (isMobile) {
              const isExpanded = expandedCards.has(x.id);
              return (
                <div key={x.id}>
                  <div style={{
                    background:'#FFFFFF',
                    borderRadius: isHistOpen ? '14px 14px 0 0' : 14,
                    border:`1px solid ${isSold ? '#E5E7EB' : stCfg.border}`,
                    overflow:'hidden',
                    boxShadow: isSold ? 'none' : '0 1px 6px rgba(0,0,0,0.06)',
                    opacity: isSold ? 0.75 : 1,
                  }}>
                    {/* Branch color top strip */}
                    <div style={{ height:4, background: bCode ? bCfg.color : '#E5E7EB' }}/>
                    {/* Main body: photo + info */}
                    <div style={{ display:'flex', padding:'10px 12px 10px 10px', alignItems:'flex-start' }}>
                      {/* Photo */}
                      <div style={{ flexShrink:0, marginRight:12, position:'relative' }}>
                        {x.unit_photo
                          ? <>
                              <img
                                src={x.unit_photo}
                                onClick={()=>setViewPhoto({src:x.unit_photo, title:`${x.brand} ${x.model}`})}
                                style={{ width:96, height:96, borderRadius:10, objectFit:'cover', cursor:'pointer', border:'1.5px solid #E5E7EB', display:'block' }}
                              />
                              <button onClick={e=>{e.stopPropagation();handlePhoto(x.id,'unit_photo');}} title="Cambiar foto"
                                style={{ position:'absolute', bottom:3, right:3, width:22, height:22, borderRadius:4, background:'rgba(0,0,0,0.55)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#ffffff', fontSize:12, padding:0 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </>
                          : <button
                              onClick={()=>handlePhoto(x.id,'unit_photo')}
                              title="Agregar foto"
                              style={{ width:96, height:96, borderRadius:10, border:'1.5px dashed #D1D5DB', background:'#F9FAFB', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, padding:0 }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9D0D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                              <span style={{ fontSize:9, color:'#C9D0D8', fontWeight:700, letterSpacing:'0.08em' }}>FOTO</span>
                            </button>
                        }
                      </div>
                      {/* Info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:17, fontWeight:900, color:'#111827', letterSpacing:'-0.5px', lineHeight:1.1, marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{x.brand}</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'#4B5563', marginBottom:6, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{x.model}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', marginBottom:5 }}>
                          {x.year && <span style={{ fontSize:11, fontWeight:800, color:'#4F46E5', background:'#EEF2FF', padding:'2px 8px', borderRadius:5, border:'1px solid #C7D2FE' }}>{x.year}</span>}
                          {x.color && <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ display:'inline-block', width:14, height:10, borderRadius:3, flexShrink:0, background:cDot||'#E5E7EB', border:!cDot||cDot==='#FFFFFF'?'1px solid #D1D5DB':'1px solid rgba(0,0,0,0.12)' }}/>
                            <span style={{ fontSize:10, color:'#6B7280', fontWeight:600 }}>{x.color}</span>
                          </div>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                          {bCode && <span style={{ fontSize:9, fontWeight:700, color:bCfg.color, background:bCfg.light, padding:'2px 7px', borderRadius:10, border:`1px solid ${bCfg.color}33` }}>{bCfg.label||x.branch_name||bCode}</span>}
                          <span style={{ fontSize:10, fontWeight:700, color:stCfg.color, background:stCfg.bg, padding:'2px 8px', borderRadius:10, border:`1px solid ${stCfg.border}` }}>{stCfg.icon} {stCfg.label}</span>
                        </div>
                      </div>
                    </div>
                    {/* Bottom action bar */}
                    <div style={{ display:'flex', alignItems:'center', padding:'8px 12px', borderTop:'1px solid #F3F4F6', gap:8 }}>
                      <div style={{ flex:1 }}></div>
                      <button onClick={()=>toggleExpand(x.id)}
                        style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${isExpanded?'#A5B4FC':'#E5E7EB'}`, background:isExpanded?'#EEF2FF':'#F9FAFB', color:isExpanded?'#4F46E5':'#6B7280', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                        {isExpanded ? '▲' : '▼ Detalles'}
                      </button>
                    </div>
                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={{ borderTop:'1px solid #F3F4F6', padding:'12px 14px', background:'#F9FAFB' }}>
                        <div style={{ display:'flex', gap:16, marginBottom:10, flexWrap:'wrap' }}>
                          <div>
                            <div style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Chasis</div>
                            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:'#1F2937', background:'#F3F4F6', padding:'3px 9px', borderRadius:6, border:'1px solid #E5E7EB', letterSpacing:'0.03em' }}>{x.chassis}</span>
                              {x.chassis_photo
                                ? <img src={x.chassis_photo} onClick={()=>setViewPhoto({src:x.chassis_photo,title:`Chasis ${x.chassis}`})} style={{ width:24,height:24,borderRadius:5,objectFit:'cover',cursor:'pointer',border:'1.5px solid #E5E7EB' }}/>
                                : <button onClick={()=>handlePhoto(x.id,'chassis_photo')} title="Foto chasis" style={{ width:22,height:22,borderRadius:5,border:'1px dashed #D1D5DB',background:'transparent',cursor:'pointer',fontSize:13,color:'#D1D5DB',display:'flex',alignItems:'center',justifyContent:'center',padding:0 }}>+</button>
                              }
                            </div>
                          </div>
                          {x.motor_num && (
                            <div>
                              <div style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Motor</div>
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <span style={{ fontSize:11, fontWeight:600, color:'#4B5563', background:'#F9FAFB', padding:'3px 9px', borderRadius:6, border:'1px solid #E5E7EB' }}>{x.motor_num}</span>
                                {x.motor_photo
                                  ? <img src={x.motor_photo} onClick={()=>setViewPhoto({src:x.motor_photo,title:`Motor ${x.motor_num}`})} style={{ width:22,height:22,borderRadius:5,objectFit:'cover',cursor:'pointer',border:'1.5px solid #E5E7EB' }}/>
                                  : <button onClick={()=>handlePhoto(x.id,'motor_photo')} title="Foto motor" style={{ width:22,height:22,borderRadius:5,border:'1px dashed #D1D5DB',background:'transparent',cursor:'pointer',fontSize:12,color:'#D1D5DB',display:'flex',alignItems:'center',justifyContent:'center',padding:0 }}>+</button>
                                }
                              </div>
                            </div>
                          )}
                          {isSold && x.sold_at && (
                            <div>
                              <div style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Vendida</div>
                              <div style={{ fontSize:11, color:'#6B7280' }}>{fD(x.sold_at)}</div>
                            </div>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          {!isSold && isAdmin && (
                            <button onClick={()=>openEdit(x)} style={{ ...miniBtn, background:'#F9FAFB', color:'#6B7280', border:'1px solid #E5E7EB' }}>Editar</button>
                          )}
                          {!isSold && (
                            <select value={x.status} onChange={e=>handleStatus(x.id,e.target.value)}
                              style={{ ...miniBtn, appearance:'auto', background:stCfg.bg, color:stCfg.color, border:`1px solid ${stCfg.border}`, cursor:'pointer', fontFamily:'inherit' }}>
                              {Object.entries(INV_ST).filter(([k])=>k!=='vendida').map(([k,v])=>(
                                <option key={k} value={k}>{v.l}</option>
                              ))}
                            </select>
                          )}
                          <button onClick={()=>toggleHist(x.id)}
                            style={{ ...miniBtn, background: isHistOpen ? '#EEF2FF' : '#F9FAFB', color: isHistOpen ? '#4F46E5' : '#6B7280', border:`1px solid ${isHistOpen?'#A5B4FC':'#E5E7EB'}` }}>
                            {histLoading[x.id]?'…':'Historial'}
                          </button>
                          {!isSold && brs.filter(b=>b.id!==x.branch_id).length > 0 && (
                            <select defaultValue="" onChange={e=>{if(e.target.value){handleMove(x.id,e.target.value);}e.target.value='';}}
                              style={{ ...miniBtn, appearance:'auto', background:'#F9FAFB', color:'#6B7280', border:'1px solid #E5E7EB', cursor:'pointer', fontFamily:'inherit' }}>
                              <option value="" disabled>Mover a...</option>
                              {brs.filter(b=>b.id!==x.branch_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Historial mobile */}
                  {isHistOpen && (
                    <div style={{ background:'#F8F7FF', border:'1px solid #E2E0F5', borderTop:'none', borderRadius:'0 0 14px 14px', padding:'14px 16px 18px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#4F46E5' }}>Historial · {x.brand} {x.model}</div>
                        <button onClick={()=>toggleHist(x.id)} style={{ ...miniBtn, border:'1px solid #E5E7EB' }}>Cerrar</button>
                      </div>
                      {histLoading[x.id] && <div style={{ color:'#9CA3AF', fontSize:11 }}>Cargando...</div>}
                      {!histLoading[x.id] && histErr[x.id] && (
                        <div style={{ color:'#B91C1C', fontSize:11, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'6px 10px' }}>{histErr[x.id]}</div>
                      )}
                      {!histLoading[x.id] && !histErr[x.id] && (!histData[x.id]||histData[x.id].length===0) && (
                        <div style={{ color:'#9CA3AF', fontSize:11 }}>Sin registros de historial.</div>
                      )}
                      {!histLoading[x.id] && histData[x.id]?.length > 0 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {histData[x.id].map(h => {
                            const uName = h.user_fn ? `${h.user_fn} ${h.user_ln||''}`.trim() : 'Sistema';
                            const isSaleEv = h.event_type==='sold';
                            return (
                              <div key={h.id} style={{ display:'flex', gap:8, padding:'8px 10px', background:'#FFFFFF', borderRadius:8, border:`1px solid ${isSaleEv?'#C4B5FD':'#E0E0F5'}`, borderLeft:`3px solid ${isSaleEv?'#7C3AED':'#6366F1'}` }}>
                                <div style={{ flexShrink:0,marginTop:1,width:20,height:20,borderRadius:4,background:isSaleEv?'rgba(124,58,237,0.1)':'rgba(99,102,241,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:900,color:isSaleEv?'#7C3AED':'#6366F1' }}>
                                  {HIST_ICONS[h.event_type]||'·'}
                                </div>
                                <div style={{ flex:1,minWidth:0 }}>
                                  <div style={{ display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:1 }}>
                                    <span style={{ fontWeight:700,fontSize:11,color:isSaleEv?'#6D28D9':'#374151' }}>{HIST_LABELS[h.event_type]||h.event_type}</span>
                                    <span style={{ fontSize:9,color:'#9CA3AF',marginLeft:'auto' }}>{fDT(h.created_at)}</span>
                                  </div>
                                  {h.note && <div style={{ fontSize:10,color:'#4B5563',lineHeight:1.4 }}>{h.note}</div>}
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
            }
            // ── DESKTOP CARD ───────────────────────────────────────

            return (
              <div key={x.id}
                draggable={canDrag}
                onDragStart={canDrag ? e => handleDragStart(e, x.id) : undefined}
                onDragEnd={canDrag ? handleDragEnd : undefined}
                onDragOver={canDrag ? e => e.preventDefault() : undefined}
                onDrop={canDrag ? e => handleDrop(e, x.id) : undefined}
                style={{ cursor: canDrag ? 'grab' : 'default' }}
              >
                {/* ── CARD — rediseño limpio: foto grande · info · acciones ── */}
                <div className="crm-inv-card" style={{
                  display:'flex', alignItems:'stretch',
                  background:'#FFFFFF',
                  borderRadius: isHistOpen ? '14px 14px 0 0' : 14,
                  border:`1px solid ${isSold ? '#E5E7EB' : '#EAECEF'}`,
                  overflow:'hidden',
                  boxShadow: isSold ? 'none' : '0 1px 3px rgba(16,24,40,0.04), 0 1px 2px rgba(16,24,40,0.02)',
                  opacity: isSold ? 0.68 : 1,
                  transition:'box-shadow 0.18s ease, transform 0.12s ease, border-color 0.15s',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
                  onClick={isAdmin ? ()=>openEdit(x) : undefined}
                  onMouseEnter={e=>{ if(!isSold){ e.currentTarget.style.boxShadow='0 6px 20px rgba(16,24,40,0.08)'; e.currentTarget.style.borderColor='#D1D5DB'; e.currentTarget.style.transform='translateY(-1px)'; } }}
                  onMouseLeave={e=>{ if(!isSold){ e.currentTarget.style.boxShadow='0 1px 3px rgba(16,24,40,0.04), 0 1px 2px rgba(16,24,40,0.02)'; e.currentTarget.style.borderColor='#EAECEF'; e.currentTarget.style.transform='translateY(0)'; } }}
                >

                  {/* ── FOTO GRANDE con badge de estado superpuesto ── */}
                  <div style={{ flexShrink:0, position:'relative', width:180, alignSelf:'stretch', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)', overflow:'hidden', minHeight:140 }} onClick={e=>e.stopPropagation()}>
                    {x.unit_photo
                      ? <>
                          <img
                            src={x.unit_photo}
                            onClick={()=>setViewPhoto({src:x.unit_photo, title:`${x.brand} ${x.model}`})}
                            style={{ width:'100%', height:'100%', objectFit:'cover', cursor:'pointer', display:'block', position:'absolute', inset:0 }}
                          />
                          <button onClick={()=>handlePhoto(x.id,'unit_photo')} title="Cambiar foto"
                            style={{ position:'absolute', bottom:6, right:6, width:24, height:24, borderRadius:6, background:'rgba(15,23,42,0.75)', backdropFilter:'blur(4px)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#ffffff', padding:0, zIndex:1 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </>
                      : <button onClick={()=>handlePhoto(x.id,'unit_photo')} title="Agregar foto"
                          style={{ width:'100%', height:'100%', minHeight:140, border:'none', background:'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:0 }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                          </svg>
                          <span style={{ fontSize:9, color:'#94A3B8', fontWeight:800, letterSpacing:'0.12em' }}>FOTO</span>
                        </button>
                    }
                    {/* Branch chip overlay — arriba izquierda */}
                    {bCode && (
                      <span style={{ position:'absolute', top:8, left:8, fontSize:9.5, fontWeight:800, color:'#FFFFFF', background:bCfg.color, padding:'3px 8px', borderRadius:6, letterSpacing:'0.02em', boxShadow:'0 1px 4px rgba(0,0,0,0.25)', zIndex:1 }}>
                        {bCfg.label}
                      </span>
                    )}
                  </div>

                  {/* ── INFO PRINCIPAL ── */}
                  <div style={{ flex:1, minWidth:0, padding:'14px 18px', display:'flex', flexDirection:'column', justifyContent:'center', gap:6, overflow:'hidden' }}>
                    {/* Marca + Modelo */}
                    <div style={{ fontSize:15, fontWeight:800, color:'#0F172A', letterSpacing:'-0.2px', lineHeight:1.15, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {x.brand} <span style={{ fontWeight:600, color:'#475569' }}>{x.model}</span>
                    </div>
                    {/* Meta chips: año · color */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      {x.year && (
                        <span style={{ fontSize:10.5, fontWeight:700, color:'#475569', background:'#F1F5F9', padding:'2px 8px', borderRadius:5, letterSpacing:'0.02em' }}>
                          {x.year}
                        </span>
                      )}
                      {x.color && (
                        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ width:12, height:12, borderRadius:3, background:cDot||'#E5E7EB', border: !cDot||cDot==='#FFFFFF'?'1px solid #D1D5DB':'1px solid rgba(0,0,0,0.08)', flexShrink:0, display:'inline-block' }}/>
                          <span style={{ fontSize:11, color:'#64748B', fontWeight:600 }}>{x.color}</span>
                        </div>
                      )}
                      {x.sale_price > 0 && (
                        <>
                          <span style={{ width:3, height:3, borderRadius:'50%', background:'#CBD5E1' }}/>
                          <span style={{ fontSize:12, fontWeight:800, color:'#0F172A', letterSpacing:'-0.01em' }}>
                            ${Number(x.sale_price).toLocaleString('es-CL')}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Identificadores: chasis + motor con mini fotos inline */}
                    <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', marginTop:2 }} onClick={e=>e.stopPropagation()}>
                      {x.chassis && (
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:9, fontWeight:800, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em' }}>Chasis</span>
                          <span style={{ fontSize:10.5, fontWeight:600, color:'#334155', fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{x.chassis}</span>
                          {x.chassis_photo
                            ? <img src={x.chassis_photo} onClick={e=>{e.stopPropagation();setViewPhoto({src:x.chassis_photo,title:`Chasis ${x.chassis}`});}}
                                style={{ width:22,height:22,borderRadius:5,objectFit:'cover',cursor:'pointer',border:'1px solid #E2E8F0' }}/>
                            : <button onClick={e=>{e.stopPropagation();handlePhoto(x.id,'chassis_photo');}} title="Agregar foto chasis"
                                style={{ width:22,height:22,borderRadius:5,border:'1px dashed #CBD5E1',background:'#FFFFFF',cursor:'pointer',fontSize:13,color:'#94A3B8',display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:1 }}>+</button>
                          }
                        </div>
                      )}
                      {x.motor_num && (
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:9, fontWeight:800, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em' }}>Motor</span>
                          <span style={{ fontSize:10.5, fontWeight:600, color:'#334155', fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{x.motor_num}</span>
                          {x.motor_photo
                            ? <img src={x.motor_photo} onClick={e=>{e.stopPropagation();setViewPhoto({src:x.motor_photo,title:`Motor ${x.motor_num}`});}}
                                style={{ width:22,height:22,borderRadius:5,objectFit:'cover',cursor:'pointer',border:'1px solid #E2E8F0' }}/>
                            : <button onClick={e=>{e.stopPropagation();handlePhoto(x.id,'motor_photo');}} title="Agregar foto motor"
                                style={{ width:22,height:22,borderRadius:5,border:'1px dashed #CBD5E1',background:'#FFFFFF',cursor:'pointer',fontSize:13,color:'#94A3B8',display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:1 }}>+</button>
                          }
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── ZONA DERECHA: estado + acciones ── */}
                  <div className="crm-inv-actions" onClick={e=>e.stopPropagation()} style={{
                    flexShrink:0, padding:'14px 14px',
                    display:'flex', flexDirection:'column',
                    alignItems:'stretch', justifyContent:'center',
                    gap:8, width:160,
                    borderLeft:'1px solid #F1F5F9',
                    background:'#FAFBFC',
                  }}>
                    {/* Estado — control completo, más visible */}
                    {isSold ? (
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'stretch', gap:4 }}>
                        <span style={{
                          fontSize:11, fontWeight:800, padding:'6px 10px', borderRadius:8, textAlign:'center',
                          background:ST_CFG.vendida.bg, color:ST_CFG.vendida.color, border:`1px solid ${ST_CFG.vendida.border}`,
                          letterSpacing:'0.02em',
                        }}>
                          {ST_CFG.vendida.icon} Vendida
                        </span>
                        {x.sold_at && <div style={{ fontSize:10, color:'#94A3B8', textAlign:'center' }}>{fD(x.sold_at)}</div>}
                      </div>
                    ) : (
                      <div style={{
                        position:'relative',
                        background:stCfg.bg,
                        border:`1.5px solid ${stCfg.color}`,
                        borderRadius:8,
                        boxShadow:`0 1px 3px ${stCfg.color}22`,
                      }}>
                        <select value={x.status}
                          onClick={e=>e.stopPropagation()}
                          onChange={e=>handleStatus(x.id,e.target.value)}
                          style={{
                            width:'100%',
                            background:'transparent', border:'none',
                            fontSize:11, fontWeight:800, color:stCfg.color,
                            cursor:'pointer', padding:'7px 26px 7px 28px',
                            outline:'none', fontFamily:'inherit',
                            appearance:'none', WebkitAppearance:'none',
                            letterSpacing:'0.02em',
                          }}>
                          {Object.entries(INV_ST).filter(([k])=>k!=='vendida').map(([k,v])=>(
                            <option key={k} value={k}>{v.l}</option>
                          ))}
                        </select>
                        <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:11, color:stCfg.color, pointerEvents:'none' }}>{stCfg.icon}</span>
                        <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:8, color:stCfg.color, pointerEvents:'none' }}>▼</span>
                      </div>
                    )}

                    {/* Historial */}
                    <button onClick={()=>toggleHist(x.id)}
                      style={{
                        padding:'6px 10px', borderRadius:8, fontSize:11, fontWeight:700,
                        cursor:'pointer', fontFamily:'inherit',
                        background: isHistOpen ? '#0F172A' : '#FFFFFF',
                        color: isHistOpen ? '#FFFFFF' : '#475569',
                        border:`1px solid ${isHistOpen?'#0F172A':'#E2E8F0'}`,
                        display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                        transition:'all 0.12s',
                      }}>
                      {histLoading[x.id]?'…':'Historial'}
                    </button>

                    {/* Mover */}
                    {!isSold && brs.filter(b=>b.id!==x.branch_id).length > 0 && (
                      <select defaultValue=""
                        onClick={e=>e.stopPropagation()}
                        onChange={e=>{if(e.target.value){handleMove(x.id,e.target.value);}e.target.value='';}}
                        style={{
                          padding:'6px 10px', borderRadius:8, fontSize:11, fontWeight:600,
                          cursor:'pointer', fontFamily:'inherit',
                          background:'#FFFFFF', color:'#475569',
                          border:'1px solid #E2E8F0', width:'100%',
                        }}>
                        <option value="" disabled>Mover a...</option>
                        {brs.filter(b=>b.id!==x.branch_id).map(b=>(
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
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
                          <span style={{ fontFamily:'inherit', fontWeight:600, color:'#4F46E5' }}>{x.chassis}</span>
                        </div>
                      </div>
                      <button onClick={()=>toggleHist(x.id)}
                        style={{ ...miniBtn, border:'1px solid #E5E7EB' }}>Cerrar</button>
                    </div>
                    {histLoading[x.id] && <div style={{ color:'#9CA3AF', fontSize:11 }}>Cargando historial...</div>}
                    {!histLoading[x.id] && histErr[x.id] && (
                      <div style={{ color:'#B91C1C', fontSize:11, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'7px 10px' }}>{histErr[x.id]}</div>
                    )}
                    {!histLoading[x.id] && !histErr[x.id] && (!histData[x.id]||histData[x.id].length===0) && (
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
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          LIGHTBOX
      ══════════════════════════════════════════════════════════ */}
      {viewPhoto && (
        <div onClick={()=>setViewPhoto(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,cursor:'pointer',backdropFilter:'blur(4px)' }}>
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
          MODAL — EDITAR UNIDAD
      ══════════════════════════════════════════════════════════ */}
      {editTarget && (
        <Modal onClose={()=>{setEditTarget(null);setEErr('');}} title={`Editar · ${editTarget.brand} ${editTarget.model}`} wide>
          <form onSubmit={handleEditSave}>
            {/* Sucursal + Estado */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <Field label="Sucursal" value={eForm.branch_id} onChange={v=>setEForm({...eForm,branch_id:v})}
                opts={[{v:'',l:'Sin sucursal'},...brs.map(b=>({v:b.id,l:b.name}))]}/>
              <Field label="Estado" value={eForm.status} onChange={v=>setEForm({...eForm,status:v})}
                opts={[
                  {v:'disponible',  l:'Disponible'},
                  {v:'reservada',   l:'Reservada'},
                  {v:'preinscrita', l:'Preinscrita'},
                ]}/>
            </div>
            {/* Marca + Modelo + Año */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:10, marginBottom:10 }}>
              <Field label="Marca *" value={eForm.brand} onChange={v=>setEForm({...eForm,brand:v})} req/>
              <Field label="Modelo *" value={eForm.model} onChange={v=>setEForm({...eForm,model:v})} req/>
              <Field label="Año" value={eForm.year} onChange={v=>setEForm({...eForm,year:v})} type="number"/>
            </div>
            {/* Color */}
            <div style={{ marginBottom:10 }}>
              <Field label="Color" value={eForm.color} onChange={v=>setEForm({...eForm,color:v})}/>
              {/* Swatches del catálogo para este modelo */}
              {modelColorPhotos.length > 0 && (
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:7 }}>
                  {modelColorPhotos.map(cp => {
                    const isSelected = eForm.color?.toLowerCase().trim() === cp.color?.toLowerCase().trim();
                    return (
                      <button key={cp.color} type="button"
                        onClick={() => setEForm(f => ({...f, color: cp.color}))}
                        title={cp.color}
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 7px 3px 4px',
                          borderRadius:20, border: isSelected ? '2px solid #F28100' : '1.5px solid #E5E7EB',
                          background: isSelected ? '#FFFBF0' : '#F9FAFB', cursor:'pointer' }}>
                        <span style={{ width:14, height:14, borderRadius:7, background: cp.hex || getColorCss(cp.color) || '#E5E7EB',
                          border:'1px solid rgba(0,0,0,0.1)', display:'inline-block', flexShrink:0 }}/>
                        <span style={{ fontSize:10, fontWeight: isSelected?700:400, color: isSelected?'#F28100':'#6B7280', whiteSpace:'nowrap' }}>{cp.color}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {eForm.color && (()=>{
                const cp = modelColorPhotos.find(p => p.color?.toLowerCase().trim() === eForm.color?.toLowerCase().trim());
                const cc = cp?.hex || getColorCss(eForm.color);
                return <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5 }}>
                  <span style={{ width:20,height:14,borderRadius:3,background:cc||'#E5E7EB',border:'1px solid #D1D5DB',display:'inline-block'}}/>
                  {cc&&<span style={{ fontSize:10,color:'#9CA3AF',fontFamily:'inherit' }}>{cc}</span>}
                </div>;
              })()}
            </div>
            {/* Chasis + Motor */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <Field label="N° Chasis *" value={eForm.chassis} onChange={v=>setEForm({...eForm,chassis:v})} req/>
              <Field label="N° Motor" value={eForm.motor_num} onChange={v=>setEForm({...eForm,motor_num:v})}/>
            </div>
            {/* Notas */}
            <Field label="Notas internas" value={eForm.notes} onChange={v=>setEForm({...eForm,notes:v})} rows={2}/>

            {/* ── Sección reserva activa ─────────────────────────────────── */}
            {editTarget?.status === 'reservada' && (
              <div style={{ marginTop:14, background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#B45309', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                  ◐ Reserva activa
                </div>

                {/* Info cliente */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:'#78350F', marginBottom:2, fontWeight:600 }}>Cliente</div>
                    <div style={{ fontSize:13, color:'#111827' }}>{editTarget.client_name || <span style={{color:'#9CA3AF'}}>—</span>}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:'#78350F', marginBottom:2, fontWeight:600 }}>RUT</div>
                    <div style={{ fontSize:13, color:'#111827' }}>{editTarget.client_rut || <span style={{color:'#9CA3AF'}}>—</span>}</div>
                  </div>
                </div>

                {/* Totales */}
                {editTarget.sale_price > 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12 }}>
                    <div style={{ background:'#FEF3C7', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#92400E', fontWeight:700, marginBottom:2 }}>PRECIO</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{fmt(editTarget.sale_price)}</div>
                    </div>
                    <div style={{ background:'#ECFDF5', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#065F46', fontWeight:700, marginBottom:2 }}>ABONADO</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#059669' }}>{fmt(editTarget.invoice_amount || 0)}</div>
                    </div>
                    <div style={{ background: Math.max(0,(editTarget.sale_price||0)-(editTarget.invoice_amount||0)) > 0 ? '#FEF2F2' : '#ECFDF5', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#991B1B', fontWeight:700, marginBottom:2 }}>SALDO</div>
                      <div style={{ fontSize:13, fontWeight:700, color: Math.max(0,(editTarget.sale_price||0)-(editTarget.invoice_amount||0)) > 0 ? '#DC2626' : '#059669' }}>
                        {fmt(Math.max(0,(editTarget.sale_price||0)-(editTarget.invoice_amount||0)))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Actualizar abono + vendedor */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:'#78350F', marginBottom:4 }}>Actualizar abono ($)</div>
                    <input
                      type="number" value={eForm.invoice_amount}
                      onChange={e=>setEForm({...eForm,invoice_amount:e.target.value})}
                      placeholder="Monto abonado"
                      style={{ ...S.inp, width:'100%', fontSize:13 }}
                    />
                    {eForm.invoice_amount > 0 && eForm.sale_price > 0 && (
                      <div style={{ fontSize:11, color:'#B45309', marginTop:4 }}>
                        Saldo: <strong>{fmt(Math.max(0, parseInt(eForm.sale_price) - parseInt(eForm.invoice_amount)))}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:'#78350F', marginBottom:4 }}>Vendedor</div>
                    <select
                      value={eForm.sold_by}
                      onChange={e=>setEForm({...eForm,sold_by:e.target.value})}
                      style={{ width:'100%', height:38, borderRadius:8, border:'1px solid #E5E7EB', background:'#ffffff', fontSize:13, color:'#374151', padding:'0 8px', fontFamily:'inherit' }}>
                      <option value="">Seleccionar…</option>
                      {sellers.map(s=><option key={s.id} value={s.id}>{`${s.first_name||''} ${s.last_name||''}`.trim()}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ fontSize:11, color:'#92400E', marginTop:4 }}>
                  Guarda los cambios para actualizar el abono, o conviértela en nota de venta cuando el cliente complete el pago.
                </div>
              </div>
            )}

            <div style={{ marginTop:10 }}><ErrorMsg msg={eErr}/></div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:18 }}>
              {/* Eliminar */}
              {isAdmin && (
                deleteConfirm
                  ? <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>¿Eliminar definitivamente?</span>
                      <button type="button" disabled={deletingUnit} onClick={handleDelete}
                        style={{ background:'#DC2626', color:'#ffffff', border:'none', borderRadius:7, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        {deletingUnit ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                      <button type="button" onClick={()=>setDeleteConfirm(false)}
                        style={{ ...S.gh, padding:'6px 12px', borderRadius:7, fontSize:12 }}>No</button>
                    </div>
                  : <button type="button" onClick={()=>setDeleteConfirm(true)}
                      style={{ background:'none', border:'1px solid #FCA5A5', color:'#DC2626', borderRadius:7, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      Eliminar unidad
                    </button>
              )}
              <div style={{ display:'flex', gap:8, marginLeft:'auto' }}>
                <button type="button" onClick={()=>{setEditTarget(null);setEErr('');setDeleteConfirm(false);}} style={{ ...S.gh, padding:'8px 18px', borderRadius:8, fontSize:13 }}>
                  Cancelar
                </button>
                {editTarget?.status === 'reservada' && (
                  <button type="button" onClick={handleConvertToSale} disabled={convSaving || eSaving}
                    style={{ background:'#059669', color:'#FFFFFF', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                    {convSaving ? 'Convirtiendo…' : 'Convertir a venta'}
                  </button>
                )}
                <button type="submit" disabled={eSaving}
                  style={{ background:'#111827', color:'#FFFFFF', border:'none', borderRadius:8, padding:'8px 22px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                  {eSaving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL — AGREGAR UNIDAD
      ══════════════════════════════════════════════════════════ */}
      {showAdd && (
        <Modal onClose={()=>{setShowAdd(false);setNw(BLANK_NW());setAddErr('');}} title="Agregar Unidad al Inventario" wide>
          <form onSubmit={handleAdd}>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10 }}>
              <Field label="Sucursal *" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:'',l:'Seleccionar...'},...brs.map(b=>({v:b.id,l:b.name}))]} req/>
              <Field label="Año" value={nw.year} onChange={v=>setNw({...nw,year:v})} type="number"/>
              <Field label="Marca *" value={nw.brand} onChange={v=>setNw({...nw,brand:v})} req/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
              <Field label="Modelo *" value={nw.model} onChange={v=>setNw({...nw,model:v})} req/>
              <Field label="Color" value={nw.color} onChange={v=>setNw({...nw,color:v})}/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14 }}>
              <Field label="N° Chasis" value={nw.chassis} onChange={v=>setNw({...nw,chassis:v})}/>
              <Field label="N° Motor" value={nw.motor_num} onChange={v=>setNw({...nw,motor_num:v})}/>
            </div>
            <div onClick={()=>setNw({...nw,added_as_sold:!nw.added_as_sold})}
              style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,marginBottom:nw.added_as_sold?10:16,cursor:'pointer',background:nw.added_as_sold?'rgba(239,68,68,0.06)':'#F9FAFB',border:`1px solid ${nw.added_as_sold?'rgba(239,68,68,0.3)':'#E5E7EB'}`,transition:'all 0.15s' }}>
              <div style={{ width:18,height:18,borderRadius:4,border:nw.added_as_sold?'none':'2px solid #1F2937',background:nw.added_as_sold?'#EF4444':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
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
            <ErrorMsg msg={addErr}/>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div style={{ fontSize:11,color:'#6B7280' }}>
                {nw.added_as_sold&&<span style={{ color:'#EF4444',fontWeight:600 }}>Se creará como vendida</span>}
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button type="button" onClick={()=>{setShowAdd(false);setNw(BLANK_NW());setAddErr('');}} style={S.btn2}>Cancelar</button>
                <button type="submit" disabled={adding} style={{ ...S.btn,opacity:adding?0.7:1,background:nw.added_as_sold?'#EF4444':'#F28100' }}>
                  {adding?'Guardando...':nw.added_as_sold?'Registrar como vendida':'Agregar al inventario'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL — IMPORTAR EXCEL
      ══════════════════════════════════════════════════════════ */}
      {showImport && (
        <Modal onClose={()=>setShowImport(false)} title="Importar inventario desde Excel" wide>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleImportFile}/>
          {!importPreview && !importDone && (
            <div style={{ textAlign:'center',padding:'32px 16px' }}>
              <div style={{ width:52,height:52,borderRadius:12,background:'#F3F4F6',border:'1px solid #E5E7EB',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:13,fontWeight:800,color:'#6B7280' }}>XLS</div>
              <p style={{ fontSize:13,color:'#374151',marginBottom:6 }}>Selecciona tu plantilla Excel (.xlsx)</p>
              <p style={{ fontSize:11,color:'#6B7280',marginBottom:20 }}>Columnas: <strong>Sucursal · Año · Marca · Modelo · Color · N° Chasis · N° Motor · Estado</strong></p>
              <button onClick={()=>importFileRef.current?.click()} disabled={importLoading} style={{ ...S.btn,fontSize:13,padding:'10px 24px' }}>
                {importLoading?'Procesando...':'Seleccionar archivo'}
              </button>
            </div>
          )}
          {importPreview && (
            <>
              <div style={{ display:'flex',gap:10,marginBottom:14,flexWrap:'wrap' }}>
                {[{l:'Total filas',v:importPreview.total,c:'#6B7280'},{l:'Nuevas',v:importPreview.ok,c:'#10B981'},{l:'Incompletas',v:importPreview.warnings||0,c:'#F97316'},{l:'Duplicados',v:importPreview.duplicates,c:'#F59E0B'},{l:'Errores',v:importPreview.errors,c:'#EF4444'}].map(({l,v,c})=>(
                  <div key={l} style={{ ...S.card,padding:'8px 14px',textAlign:'center',flex:1,minWidth:80 }}>
                    <div style={{ fontSize:20,fontWeight:800,color:c }}>{v}</div>
                    <div style={{ fontSize:10,color:'#6B7280' }}>{l}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:11,color:'#6B7280',marginBottom:10 }}>Hoja: <strong>{importPreview.sheet}</strong> · Se importarán filas <span style={{color:'#10B981',fontWeight:600}}>verdes</span> (completas) y <span style={{color:'#F97316',fontWeight:600}}>naranjas</span> (incompletas, completar después).</p>
              <div style={{ maxHeight:320,overflowY:'auto',border:'1px solid #E5E7EB',borderRadius:8,marginBottom:14 }}>
                <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11 }}>
                  <thead style={{ position:'sticky',top:0,background:'#F9FAFB' }}>
                    <tr>{['Fila','Sucursal','Año','Marca','Modelo','Color','Chasis','Motor','Estado',''].map(h=><th key={h} style={{ padding:'6px 8px',textAlign:'left',fontSize:9,fontWeight:600,color:'#6B7280',textTransform:'uppercase',borderBottom:'1px solid #E5E7EB' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r,i)=>{
                      const bg=r._status==='ok'?'rgba(16,185,129,0.04)':r._status==='warning'?'rgba(249,115,22,0.05)':r._status==='duplicate'?'rgba(245,158,11,0.06)':'rgba(239,68,68,0.06)';
                      const ic=r._status==='ok'?'#10B981':r._status==='warning'?'#F97316':r._status==='duplicate'?'#F59E0B':'#EF4444';
                      return(
                        <tr key={i} style={{ borderBottom:'1px solid #F3F4F6',background:bg }}>
                          <td style={{ padding:'5px 8px',color:'#9CA3AF' }}>{r._row}</td>
                          <td style={{ padding:'5px 8px' }}>{r.branch_raw||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.year}</td>
                          <td style={{ padding:'5px 8px',fontWeight:600 }}>{r.brand||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.model||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.color||'-'}</td>
                          <td style={{ padding:'5px 8px',fontFamily:'inherit',fontSize:10 }}>{r.chassis||'-'}</td>
                          <td style={{ padding:'5px 8px',fontFamily:'inherit',fontSize:10 }}>{r.motor_num||'-'}</td>
                          <td style={{ padding:'5px 8px' }}>{r.status}</td>
                          <td style={{ padding:'5px 8px',color:ic,fontSize:10,fontWeight:600 }}>
                            {r._status==='ok'?'Nueva':r._status==='warning'?`Incompleta · ${r._warnings?.join(', ')}`:r._status==='duplicate'?'Ya existe':r._errors?.join(', ')}
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
                  {(()=>{
                    const total=(importPreview.ok||0)+(importPreview.warnings||0);
                    return(
                      <button onClick={handleImportConfirm} disabled={importLoading||total===0}
                        style={{ ...S.btn,opacity:(importLoading||total===0)?0.6:1 }}>
                        {importLoading?'Importando...':(importPreview.warnings>0
                          ?`Importar ${total} unidades (${importPreview.ok} completas + ${importPreview.warnings} incompletas)`
                          :`Importar ${total} unidades nuevas`)}
                      </button>
                    );
                  })()}
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

      {/* ── Inputs ocultos para picker mobile ── */}
      <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>handlePhotoFile(e.target.files[0])}/>
      <input ref={galleryInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>handlePhotoFile(e.target.files[0])}/>

      {/* ── Bottom sheet: cámara o galería (solo mobile) ── */}
      {showPhotoPicker && (
        <div onClick={()=>setShowPhotoPicker(false)}
          style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1001,display:'flex',flexDirection:'column',justifyContent:'flex-end' }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:'#ffffff',borderRadius:'18px 18px 0 0',padding:'12px 16px 32px' }}>
            <div style={{ width:36,height:4,borderRadius:2,background:'#D1D5DB',margin:'0 auto 18px' }}/>
            <div style={{ fontSize:13,fontWeight:700,color:'#374151',marginBottom:14,textAlign:'center' }}>Agregar foto</div>
            <button onClick={()=>{ setShowPhotoPicker(false); setTimeout(()=>{ cameraInputRef.current.value=''; cameraInputRef.current.click(); },50); }}
              style={{ display:'block',width:'100%',padding:'15px',borderRadius:12,border:'1px solid #E5E7EB',background:'#F9FAFB',fontSize:15,fontWeight:600,cursor:'pointer',marginBottom:10,fontFamily:'inherit',color:'#111827' }}>
              Tomar foto con la cámara
            </button>
            <button onClick={()=>{ setShowPhotoPicker(false); setTimeout(()=>{ galleryInputRef.current.value=''; galleryInputRef.current.click(); },50); }}
              style={{ display:'block',width:'100%',padding:'15px',borderRadius:12,border:'1px solid #E5E7EB',background:'#F9FAFB',fontSize:15,fontWeight:600,cursor:'pointer',marginBottom:10,fontFamily:'inherit',color:'#111827' }}>
              Elegir desde la galería
            </button>
            <button onClick={()=>{ setShowPhotoPicker(false); photoTargetRef.current=null; }}
              style={{ display:'block',width:'100%',padding:'12px',borderRadius:12,border:'none',background:'transparent',fontSize:14,color:'#6B7280',cursor:'pointer',fontFamily:'inherit' }}>
              Cancelar
            </button>
          </div>
        </div>
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
const miniBtn = {
  padding:'5px 10px', borderRadius:7, fontSize:10, fontWeight:600,
  cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
  background:'#F9FAFB', color:'#6B7280', border:'1px solid #E5E7EB',
};
