import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, Field, Bdg, Empty, Loader, ErrorMsg, ROLES as ROLE_KEYS, ViewHeader } from '../ui.jsx';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLES = [
  { v: 'vendedor',        l: 'Vendedor',        c: '#3B82F6' },
  { v: 'backoffice',      l: 'Backoffice',       c: '#F59E0B' },
  { v: 'admin_comercial', l: 'Admin comercial',  c: '#8B5CF6' },
  { v: 'super_admin',     l: 'Super Admin',      c: '#EF4444' },
];

const BLANK_CREATE = () => ({
  first_name:'', last_name:'', email:'', password:'',
  role:'vendedor', branch_id:'', active:true,
});

const blankEdit = u => ({
  first_name: u.first_name || '',
  last_name:  u.last_name  || '',
  email:      u.email      || '',
  role:       u.role       || 'vendedor',
  branch_id:  u.branch_id  || '',
  active:     u.active !== false,
});

const sectionLbl = {
  fontSize:9, fontWeight:700, color:'#9CA3AF',
  textTransform:'uppercase', letterSpacing:'0.1em',
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

// ─── Calendario de días libres ───────────────────────────────────────────────
// Calendario mensual interactivo. Cada día muestra los vendedores libres
// como chips. Hacer click en un día abre un modal con el listado de vendedores
// activos para marcar/desmarcar. Los libres no reciben leads ni notificaciones.

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const DOW_ES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

// YYYY-MM-DD en TZ local del browser (coincide con lo que ingresa el admin).
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Paleta determinística por user_id para que los chips sean reconocibles
// entre días sin depender de orden ni del servidor.
const CHIP_PALETTE = [
  { bg:'#DBEAFE', fg:'#1E40AF' }, { bg:'#DCFCE7', fg:'#166534' },
  { bg:'#FCE7F3', fg:'#9D174D' }, { bg:'#FEF3C7', fg:'#92400E' },
  { bg:'#EDE9FE', fg:'#5B21B6' }, { bg:'#FEE2E2', fg:'#991B1B' },
  { bg:'#CCFBF1', fg:'#115E59' }, { bg:'#FFE4E6', fg:'#9F1239' },
];
function chipColor(uid) {
  let h = 0;
  const s = String(uid || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CHIP_PALETTE[h % CHIP_PALETTE.length];
}

function TimeOffCalendar({ users }) {
  const today = new Date();
  const [cursor, setCursor]   = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [entries, setEntries] = useState([]);   // [{id, user_id, off_date, first_name, last_name, role, ...}]
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [dayModal, setDayModal] = useState(null); // { date: 'YYYY-MM-DD' }
  const [saving, setSaving]   = useState(false);

  // Solo vendedores activos reciben leads nuevos — son los únicos que corresponde marcar libres.
  // Backoffice/admin no entran en la rotación de asignación, así que quedan fuera del selector.
  const sellers = (users || []).filter(u => u.active && u.role === 'vendedor');

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd   = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const from = ymdLocal(monthStart);
  const to   = ymdLocal(monthEnd);

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const rows = await api.getTimeOff({ from, to });
      setEntries(Array.isArray(rows) ? rows : []);
    } catch (ex) {
      setErr(ex.message || 'Error al cargar días libres');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  // Construcción de la grilla: lunes como primer día de semana.
  const grid = [];
  {
    const firstDow = (monthStart.getDay() + 6) % 7; // 0 = Lun
    for (let i = 0; i < firstDow; i++) grid.push(null);
    for (let d = 1; d <= monthEnd.getDate(); d++) {
      grid.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (grid.length % 7 !== 0) grid.push(null);
  }

  // Map día → lista de entries para render rápido de chips.
  const byDay = new Map();
  for (const e of entries) {
    const key = (e.off_date || '').slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }

  const isToday = (d) => d && ymdLocal(d) === ymdLocal(today);
  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  // Toggle: si el vendedor ya está libre ese día, borrar; si no, crear.
  const toggleSeller = async (user_id, dateStr) => {
    setSaving(true); setErr('');
    try {
      const existing = (byDay.get(dateStr) || []).find(e => e.user_id === user_id);
      if (existing) {
        await api.deleteTimeOff(existing.id);
      } else {
        await api.saveTimeOff({ user_id, dates: [dateStr] });
      }
      await load();
    } catch (ex) { setErr(ex.message || 'No se pudo actualizar'); }
    finally { setSaving(false); }
  };

  const dayEntries = dayModal ? (byDay.get(dayModal.date) || []) : [];
  const dayOffSet  = new Set(dayEntries.map(e => e.user_id));

  return (
    <div style={{ ...S.card, marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <div>
          <h3 style={{ fontSize:13, fontWeight:600, margin:0 }}>Días libres del equipo</h3>
          <p style={{ fontSize:11, color:'#6B7280', margin:'2px 0 0' }}>
            Marca los días en que un vendedor no trabaja — ese día no recibe leads nuevos ni notificaciones.
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={prevMonth} title="Mes anterior"
            style={{ ...S.gh, padding:'4px 8px', borderRadius:6, border:'1px solid #E5E7EB' }}>
            <Ic.chev size={14}/>
          </button>
          <div style={{ fontSize:12, fontWeight:700, minWidth:150, textAlign:'center' }}>
            {MONTHS_ES[cursor.getMonth()]} {cursor.getFullYear()}
          </div>
          <button onClick={nextMonth} title="Mes siguiente"
            style={{ ...S.gh, padding:'4px 8px', borderRadius:6, border:'1px solid #E5E7EB', transform:'rotate(180deg)' }}>
            <Ic.chev size={14}/>
          </button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            style={{ ...S.gh, padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid #E5E7EB', marginLeft:4 }}>
            Hoy
          </button>
        </div>
      </div>

      {err && <ErrorMsg msg={err}/>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4 }}>
        {DOW_ES.map(d => (
          <div key={d} style={{ ...sectionLbl, textAlign:'center', padding:'6px 0' }}>{d}</div>
        ))}
        {grid.map((d, idx) => {
          if (!d) return <div key={idx} style={{ minHeight:96 }}/>;
          const key = ymdLocal(d);
          const list = byDay.get(key) || [];
          const isPast = new Date(d.getFullYear(), d.getMonth(), d.getDate()) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          return (
            <div
              key={idx}
              onClick={() => setDayModal({ date: key })}
              style={{
                minHeight:96, borderRadius:8, padding:'6px 7px',
                background: isToday(d) ? '#FFF7ED' : (isPast ? '#FAFAFA' : '#FFFFFF'),
                border: isToday(d) ? '1.5px solid var(--brand)' : '1px solid #E5E7EB',
                cursor:'pointer', transition:'background 0.1s', opacity: isPast ? 0.75 : 1,
                display:'flex', flexDirection:'column', gap:4, overflow:'hidden',
              }}
              onMouseEnter={e => { if (!isToday(d)) e.currentTarget.style.background = '#F9FAFB'; }}
              onMouseLeave={e => { if (!isToday(d)) e.currentTarget.style.background = isPast ? '#FAFAFA' : '#FFFFFF'; }}
            >
              <div style={{ fontSize:11, fontWeight:700, color: isToday(d) ? 'var(--brand)' : '#374151' }}>
                {d.getDate()}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {list.slice(0, 3).map(e => {
                  const c = chipColor(e.user_id);
                  const fullName = `${e.first_name || ''} ${e.last_name || ''}`.trim();
                  return (
                    <span key={e.id} title={`${fullName}${e.note ? ' · ' + e.note : ''}`}
                      style={{
                        fontSize:10, fontWeight:600, padding:'2px 6px', borderRadius:6,
                        background: c.bg, color: c.fg,
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                        maxWidth:'100%',
                      }}>
                      {fullName || '—'}
                    </span>
                  );
                })}
                {list.length > 3 && (
                  <span style={{ fontSize:10, fontWeight:600, padding:'2px 6px', borderRadius:6, background:'#F3F4F6', color:'#6B7280' }}>
                    +{list.length - 3} más
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div style={{ marginTop:8, fontSize:11, color:'#9CA3AF' }}>Cargando…</div>}

      {dayModal && (
        <Modal onClose={() => setDayModal(null)} title={`Días libres · ${dayModal.date}`}>
          <p style={{ fontSize:12, color:'#6B7280', margin:'0 0 12px' }}>
            Activa la casilla para marcar que ese vendedor <strong>no trabaja ese día</strong>.
            No recibirá leads nuevos ni notificaciones.
          </p>
          {sellers.length === 0
            ? <Empty title="Sin vendedores activos" hint="Activa usuarios con rol vendedor o backoffice."/>
            : <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:380, overflowY:'auto' }}>
                {sellers.map(u => {
                  const isOff = dayOffSet.has(u.id);
                  const c = chipColor(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => !saving && toggleSeller(u.id, dayModal.date)}
                      style={{
                        display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                        borderRadius:8, cursor: saving ? 'wait' : 'pointer',
                        background: isOff ? c.bg : '#F9FAFB',
                        border: `1px solid ${isOff ? c.fg : '#E5E7EB'}`,
                        transition:'background 0.1s',
                      }}
                    >
                      <div style={{
                        width:16, height:16, borderRadius:4, flexShrink:0,
                        border: isOff ? 'none' : '2px solid #D1D5DB',
                        background: isOff ? c.fg : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        {isOff && <Ic.check size={10} color="white"/>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, color: isOff ? c.fg : '#111827' }}>
                          {u.first_name} {u.last_name}
                        </div>
                        <div style={{ fontSize:10, color:'#6B7280' }}>
                          {(ROLES.find(r => r.v === u.role)?.l) || u.role}
                          {u.branch_name ? ` · ${u.branch_name}` : ''}
                        </div>
                      </div>
                      {isOff && <span style={{ fontSize:10, fontWeight:700, color:c.fg }}>Libre</span>}
                    </div>
                  );
                })}
              </div>
          }
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:14 }}>
            <button onClick={() => setDayModal(null)} style={S.btn}>Listo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ActiveToggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
        borderRadius:8, background:'#F9FAFB', border:'1px solid #E5E7EB',
        cursor:'pointer', marginBottom:16, userSelect:'none',
      }}
    >
      <div style={{
        width:16, height:16, borderRadius:4, flexShrink:0,
        border: value ? 'none' : '2px solid #D1D5DB',
        background: value ? '#10B981' : 'transparent',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {value && <Ic.check size={10} color="white"/>}
      </div>
      <span style={{ fontSize:12, fontWeight:500 }}>
        Usuario activo — puede iniciar sesión
      </span>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function AdminView() {
  // ── Usuarios ────────────────────────────────────────────────────────────────
  const [users,    setUsers]   = useState([]);
  const [loading,  setLoading] = useState(true);
  const [branches, setBranches]= useState([]);
  const [resetInfo,setResetInfo]= useState(null);

  // Crear usuario
  const [showCreate, setShowCreate] = useState(false);
  const [cForm, setCForm] = useState(BLANK_CREATE());
  const [cErr,  setCErr]  = useState('');
  const [cSaving,setCSaving]= useState(false);

  // Editar usuario
  const [editTarget, setEditTarget]= useState(null);
  const [eForm, setEForm] = useState({});
  const [eErr,  setEErr]  = useState('');
  const [eSaving,setESaving]= useState(false);

  // Desactivar usuario
  const [deactivateTarget, setDeactivateTarget] = useState(null); // user object
  const [deactivateInfo,   setDeactivateInfo]   = useState(null); // { count, loading }
  const [deactivateReassignTo, setDeactivateReassignTo] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateErr, setDeactivateErr] = useState('');

  // Eliminar usuario (hard delete)
  const [deleteTarget, setDeleteTarget] = useState(null); // user object
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [deleteDetail, setDeleteDetail] = useState(null); // detalle de refs si bloquea

  // Sucursales — crear / editar
  const [branchEditTarget, setBranchEditTarget] = useState(null); // null = nuevo, obj = editar
  const [bForm, setBForm] = useState({ name:'', code:'', address:'', active:true });
  const [bErr, setBErr] = useState('');
  const [bSaving, setBSaving] = useState(false);
  const [branchDeleteTarget, setBranchDeleteTarget] = useState(null);
  const [branchDeleting, setBranchDeleting] = useState(false);
  const [branchDeleteErr, setBranchDeleteErr] = useState('');

  // Probador de alias
  const [aliasTestText, setAliasTestText] = useState('');
  const [aliasTestResult, setAliasTestResult] = useState(null);
  const [aliasTesting, setAliasTesting] = useState(false);

  // ── Danger zone ─────────────────────────────────────────────────────────────
  const [cleaning,          setCleaning]         = useState(false);
  const [cleanDone,         setCleanDone]        = useState(false);
  const [cleaningImports,   setCleaningImports]  = useState(false);
  const [cleanImportsDone,  setCleanImportsDone] = useState(null);
  const [cleaningCatalog,   setCleaningCatalog]  = useState(false);
  const [cleanCatalogDone,  setCleanCatalogDone] = useState(null);

  // ── Aliases ─────────────────────────────────────────────────────────────────
  const [aliases,       setAliases]       = useState([]);
  const [aliasForm,     setAliasForm]     = useState({ alias:'', model_id:'' });
  const [catalogModels, setCatalogModels] = useState([]);
  const [aliasSaving,   setAliasSaving]   = useState(false);

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false));
    api.getBranches().then(setBranches).catch(() => {});
    api.getAliases().then(setAliases).catch(() => {});
    api.getModels().then(d => setCatalogModels(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // ── Handlers usuarios ────────────────────────────────────────────────────────

  const handleCreate = async e => {
    e.preventDefault(); setCErr('');
    if (!cForm.first_name.trim() || !cForm.last_name.trim())
      return setCErr('Nombre y apellido son requeridos');
    if (!cForm.email.trim()) return setCErr('Email requerido');
    if (!cForm.password || cForm.password.length < 8)
      return setCErr('La contraseña debe tener mínimo 8 caracteres');
    setCSaving(true);
    try {
      const u = await api.createUser({
        first_name: cForm.first_name.trim(),
        last_name:  cForm.last_name.trim(),
        email:      cForm.email.trim(),
        password:   cForm.password,
        role:       cForm.role,
        branch_id:  cForm.branch_id || null,
        active:     cForm.active,
      });
      setUsers(prev => [...prev, u].sort((a,b) => a.first_name.localeCompare(b.first_name)));
      setShowCreate(false);
      setCForm(BLANK_CREATE());
    } catch(ex) { setCErr(ex.message || 'Error al crear usuario'); }
    finally { setCSaving(false); }
  };

  const openEdit = u => { setEditTarget(u); setEForm(blankEdit(u)); setEErr(''); };

  const handleEdit = async e => {
    e.preventDefault(); setEErr('');
    if (!eForm.first_name.trim() || !eForm.last_name.trim())
      return setEErr('Nombre y apellido son requeridos');
    setESaving(true);
    try {
      const u = await api.editUser(editTarget.id, {
        first_name: eForm.first_name.trim(),
        last_name:  eForm.last_name.trim(),
        email:      eForm.email.trim(),
        role:       eForm.role,
        branch_id:  eForm.branch_id || null,
        active:     eForm.active,
      });
      setUsers(prev => prev.map(x => x.id === editTarget.id ? { ...x, ...u } : x));
      setEditTarget(null);
    } catch(ex) { setEErr(ex.message || 'Error al guardar cambios'); }
    finally { setESaving(false); }
  };

  // Activar — simple, no necesita modal
  const handleActivate = async u => {
    if (!confirm(`¿Activar a ${u.first_name} ${u.last_name}?\n\nEl usuario podrá volver a iniciar sesión.`)) return;
    try {
      const updated = await api.editUser(u.id, { active: true });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: updated.active } : x));
    } catch(ex) { alert(ex.message || 'Error al activar usuario'); }
  };

  // Desactivar — abre modal con info de leads activos
  const openDeactivate = async u => {
    setDeactivateTarget(u);
    setDeactivateReassignTo('');
    setDeactivateErr('');
    setDeactivateInfo({ count: null, loading: true });
    try {
      const { count } = await api.getUserActiveTickets(u.id);
      setDeactivateInfo({ count, loading: false });
    } catch { setDeactivateInfo({ count: 0, loading: false }); }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true); setDeactivateErr('');
    try {
      await api.deactivateUser(deactivateTarget.id, {
        reassign_to: deactivateReassignTo || undefined,
      });
      setUsers(prev => prev.map(x => x.id === deactivateTarget.id ? { ...x, active: false } : x));
      setDeactivateTarget(null);
      setDeactivateInfo(null);
    } catch(ex) { setDeactivateErr(ex.message || 'Error al desactivar'); }
    finally { setDeactivating(false); }
  };

  // Eliminar (hard delete) — abre modal que avisa si hay historial
  const openDelete = u => {
    setDeleteTarget(u);
    setDeleteErr('');
    setDeleteDetail(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteErr(''); setDeleteDetail(null);
    try {
      await api.deleteUser(deleteTarget.id);
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch(ex) {
      setDeleteErr(ex.message || 'Error al eliminar');
      if (ex.detail) setDeleteDetail(ex.detail);
    } finally { setDeleting(false); }
  };

  // ── Handlers sucursales ─────────────────────────────────────────────────────
  const openBranchNew = () => {
    setBranchEditTarget({ __new: true });
    setBForm({ name:'', code:'', address:'', active:true });
    setBErr('');
  };
  const openBranchEdit = b => {
    setBranchEditTarget(b);
    setBForm({ name:b.name||'', code:b.code||'', address:b.address||b.addr||'', active:b.active !== false });
    setBErr('');
  };
  const handleBranchSave = async e => {
    e.preventDefault(); setBErr('');
    if (!bForm.name.trim() || !bForm.code.trim()) return setBErr('Nombre y código son requeridos');
    setBSaving(true);
    try {
      if (branchEditTarget?.__new) {
        const b = await api.createBranch({ name:bForm.name.trim(), code:bForm.code.trim(), address:bForm.address.trim() });
        setBranches(prev => [...prev, b].sort((a,b)=>a.name.localeCompare(b.name)));
      } else {
        const b = await api.updateBranch(branchEditTarget.id, {
          name: bForm.name.trim(), code: bForm.code.trim(),
          address: bForm.address.trim(), active: bForm.active,
        });
        setBranches(prev => prev.map(x => x.id === b.id ? b : x));
      }
      setBranchEditTarget(null);
    } catch(ex) { setBErr(ex.message || 'Error al guardar sucursal'); }
    finally { setBSaving(false); }
  };
  const openBranchDelete = b => { setBranchDeleteTarget(b); setBranchDeleteErr(''); };
  const handleBranchDelete = async () => {
    if (!branchDeleteTarget) return;
    setBranchDeleting(true); setBranchDeleteErr('');
    try {
      await api.deleteBranch(branchDeleteTarget.id);
      setBranches(prev => prev.filter(x => x.id !== branchDeleteTarget.id));
      setBranchDeleteTarget(null);
    } catch(ex) { setBranchDeleteErr(ex.message || 'Error al eliminar sucursal'); }
    finally { setBranchDeleting(false); }
  };

  // ── Probador de alias ───────────────────────────────────────────────────────
  const handleAliasTest = async e => {
    e.preventDefault();
    if (!aliasTestText.trim()) return;
    setAliasTesting(true); setAliasTestResult(null);
    try {
      const r = await api.testAlias(aliasTestText.trim());
      setAliasTestResult(r);
    } catch(ex) { setAliasTestResult({ error: ex.message || 'Error' }); }
    finally { setAliasTesting(false); }
  };

  const handleReset = async u => {
    if (!confirm(`¿Restablecer contraseña de ${u.first_name} ${u.last_name}?\n\nSe generará una contraseña temporal y el usuario deberá cambiarla al ingresar.`)) return;
    try {
      const r = await api.resetPassword(u.id);
      setResetInfo({ name:`${u.first_name} ${u.last_name}`, temp: r.temp_password });
    } catch(ex) { alert(ex.message || 'Error al restablecer contraseña'); }
  };

  // ── Handlers existentes ──────────────────────────────────────────────────────

  const handleAddAlias = async e => {
    e.preventDefault();
    if (!aliasForm.alias || !aliasForm.model_id) return;
    setAliasSaving(true);
    try {
      const a = await api.createAlias({ alias:aliasForm.alias.trim(), model_id:aliasForm.model_id });
      setAliases(prev => [...prev.filter(x => x.alias !== a.alias), { ...a, ...catalogModels.find(m => m.id === a.model_id) }]);
      setAliasForm({ alias:'', model_id:'' });
    } catch(ex) { alert(ex.message); }
    finally { setAliasSaving(false); }
  };

  const handleDeleteAlias = async id => {
    if (!window.confirm('¿Eliminar este alias? No se puede deshacer.')) return;
    try {
      await api.deleteAlias(id);
      setAliases(prev => prev.filter(a => a.id !== id));
    } catch (ex) {
      alert('No se pudo eliminar el alias: ' + (ex.message || 'Error'));
    }
  };

  const handleCleanData = async () => {
    if (!confirm('ATENCIÓN: Esto eliminará TODOS los tickets, leads, importaciones e inventario.\n\nUsuarios, sucursales y catálogo de motos se conservan.\n\n¿Confirmar?')) return;
    if (!confirm('Segunda confirmación: ¿Estás seguro? Esta acción NO se puede deshacer.')) return;
    setCleaning(true);
    try { await api.resetDemoData(); setCleanDone(true); }
    catch(ex) { alert('Error: '+(ex.message||'No se pudo limpiar')); }
    finally { setCleaning(false); }
  };

  const handleCleanCatalog = async () => {
    if (!confirm('ATENCIÓN: Esto eliminará TODO el catálogo de motos y todos los precios importados.\n\nTickets, inventario y usuarios se conservan.\n\n¿Confirmar?')) return;
    if (!confirm('Segunda confirmación: ¿Seguro? Esta acción NO se puede deshacer.')) return;
    setCleaningCatalog(true);
    try { const r = await api.resetCatalog(); setCleanCatalogDone(r.deleted ?? 0); }
    catch(ex) { alert('Error: '+(ex.message||'No se pudo limpiar catálogo')); }
    finally { setCleaningCatalog(false); }
  };

  const handleCleanImports = async () => {
    if (!confirm('¿Eliminar todos los tickets importados (source=importacion) y los logs de importación?\n\nLos tickets creados manualmente se conservan.')) return;
    setCleaningImports(true);
    try { const r = await api.resetImports(); setCleanImportsDone(r.deleted ?? 0); }
    catch(ex) { alert('Error: '+(ex.message||'No se pudo limpiar')); }
    finally { setCleaningImports(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── HEADER ── */}
      <ViewHeader
        size="sm"
        title="Administración"
        actions={
          <button
            onClick={() => { setCForm(BLANK_CREATE()); setCErr(''); setShowCreate(true); }}
            style={{ ...S.btn, display:'flex', alignItems:'center', gap:6 }}
          >
            <Ic.plus size={14}/> Nuevo usuario
          </button>
        }
      />

      {/* ── TABLA USUARIOS ── */}
      <div style={{ ...S.card, marginBottom:14, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid #F3F4F6' }}>
          <h3 style={{ fontSize:13, fontWeight:700, margin:0 }}>
            Usuarios{' '}
            <span style={{ color:'#9CA3AF', fontWeight:400, fontSize:12 }}>({users.length})</span>
          </h3>
        </div>
        {loading
          ? <div style={{ padding:16 }}><Loader label="Cargando usuarios…" /></div>
          : users.length === 0
            ? <Empty title="Sin usuarios" hint="Usa «Nuevo usuario» para agregar uno." />
            : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                    {['Usuario','Email','Rol','Sucursal','Estado','Acciones'].map(h => (
                      <th key={h} style={{ ...sectionLbl, textAlign:'left', padding:'10px 14px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}
                      style={{ borderBottom:'1px solid #F3F4F6', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      {/* Nombre */}
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{
                            width:30, height:30, borderRadius:'50%', flexShrink:0,
                            background: u.active ? 'var(--brand-soft)' : '#F3F4F6',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color: u.active ? 'var(--brand)' : '#9CA3AF',
                            fontSize:10, fontWeight:700,
                          }}>
                            {((u.first_name||'?')[0]+(u.last_name||'?')[0]).toUpperCase()}
                          </div>
                          <span style={{ fontSize:12, fontWeight:600, color: u.active ? '#111827' : '#9CA3AF' }}>
                            {u.first_name} {u.last_name}
                          </span>
                        </div>
                      </td>
                      {/* Email */}
                      <td style={{ padding:'12px 14px', fontSize:11, color:'#6B7280' }}>
                        {u.email || u.username || '—'}
                      </td>
                      {/* Rol */}
                      <td style={{ padding:'12px 14px' }}>
                        <Bdg l={(ROLES.find(x=>x.v===u.role)||{l:u.role,c:'#6B7280'}).l} c={(ROLES.find(x=>x.v===u.role)||{c:'#6B7280'}).c} />
                      </td>
                      {/* Sucursal */}
                      <td style={{ padding:'12px 14px', fontSize:12, color:'#4B5563' }}>
                        {u.branch_name || '—'}
                      </td>
                      {/* Estado */}
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{
                          fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:20,
                          background: u.active ? '#F0FDF4' : '#F9FAFB',
                          color: u.active ? '#16A34A' : '#9CA3AF',
                          border:`1px solid ${u.active ? '#BBF7D0' : '#E5E7EB'}`,
                        }}>
                          {u.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {/* Acciones */}
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={() => openEdit(u)} title="Editar usuario"
                            style={{ ...S.gh, padding:'4px 9px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid #E5E7EB', color:'#374151' }}>
                            Editar
                          </button>
                          <button onClick={() => handleReset(u)} title="Restablecer contraseña"
                            style={{ ...S.gh, padding:'4px 8px', fontSize:11, borderRadius:6, border:'1px solid #E5E7EB', color:'#6B7280' }}>
                            <Ic.lock size={13}/>
                          </button>
                          {u.active
                            ? <button onClick={() => openDeactivate(u)} title="Desactivar usuario"
                                style={{ padding:'4px 9px',fontSize:10,fontWeight:700,borderRadius:6,cursor:'pointer',border:'1px solid #FECACA',background:'#FEF2F2',color:'#DC2626' }}>
                                Desactivar
                              </button>
                            : <button onClick={() => handleActivate(u)} title="Activar usuario"
                                style={{ padding:'4px 9px',fontSize:10,fontWeight:700,borderRadius:6,cursor:'pointer',border:'1px solid #BBF7D0',background:'#F0FDF4',color:'#16A34A' }}>
                                Activar
                              </button>
                          }
                          <button onClick={() => openDelete(u)} title="Eliminar usuario (solo si no tiene historial)"
                            style={{ padding:'4px 8px',fontSize:11,borderRadius:6,cursor:'pointer',border:'1px solid #E5E7EB',background:'#FFFFFF',color:'#9CA3AF' }}>
                            <Ic.trash size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* ── SUCURSALES ── */}
      <div style={{ ...S.card, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <h3 style={{ fontSize:12, fontWeight:600, margin:0 }}>Sucursales</h3>
          <button onClick={openBranchNew} style={{ ...S.gh, padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:4 }}>
            <Ic.plus size={12}/> Nueva sucursal
          </button>
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {branches.map(b => (
            <div key={b.id} style={{ background:'#F9FAFB', borderRadius:10, padding:12, minWidth:220, flex:'1 1 220px', position:'relative' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>{b.name}</div>
                  <div style={{ fontSize:11, color:'#6B7280' }}>{b.address||b.addr}</div>
                  <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                    Código: {b.code} · Vendedores: {users.filter(u => u.branch_id===b.id && u.role===ROLE_KEYS.VEND).length}
                  </div>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={() => openBranchEdit(b)} title="Editar sucursal"
                    style={{ padding:'4px 6px', fontSize:11, borderRadius:6, cursor:'pointer', border:'1px solid #E5E7EB', background:'#FFFFFF', color:'#6B7280' }}>
                    <Ic.edit size={12}/>
                  </button>
                  <button onClick={() => openBranchDelete(b)} title="Eliminar sucursal"
                    style={{ padding:'4px 6px', fontSize:11, borderRadius:6, cursor:'pointer', border:'1px solid #E5E7EB', background:'#FFFFFF', color:'#9CA3AF' }}>
                    <Ic.trash size={12}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DÍAS LIBRES ── */}
      <TimeOffCalendar users={users} />

      {/* ── DANGER ZONE ── */}
      <div style={{ border:'2px solid #FECACA', borderRadius:12, padding:'16px 20px', marginBottom:14, background:'#FFF5F5' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#DC2626', marginBottom:4 }}>Zona restringida</div>
        <p style={{ fontSize:12, color:'#6B7280', marginBottom:14 }}>Las acciones de esta sección son permanentes y no se pueden deshacer.</p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {cleanCatalogDone!==null
            ? <div style={{ display:'flex',alignItems:'center',gap:8,color:'#10B981',fontSize:12,fontWeight:600 }}><Ic.check size={16} color="#10B981"/>{cleanCatalogDone} modelos eliminados. Recarga para ver cambios.</div>
            : <button onClick={handleCleanCatalog} disabled={cleaningCatalog} style={{ ...S.btn,background:'#8B5CF6',opacity:cleaningCatalog?0.7:1,fontSize:12 }}>{cleaningCatalog?'Limpiando...':'Borrar catálogo completo'}</button>
          }
          {cleanImportsDone!==null
            ? <div style={{ display:'flex',alignItems:'center',gap:8,color:'#10B981',fontSize:12,fontWeight:600 }}><Ic.check size={16} color="#10B981"/>{cleanImportsDone} tickets importados eliminados. Recarga para ver cambios.</div>
            : <button onClick={handleCleanImports} disabled={cleaningImports||cleanDone} style={{ ...S.btn,background:'#F59E0B',opacity:cleaningImports?0.7:1,fontSize:12 }}>{cleaningImports?'Limpiando...':'Borrar data importada'}</button>
          }
          {cleanDone
            ? <div style={{ display:'flex',alignItems:'center',gap:8,color:'#10B981',fontSize:12,fontWeight:600 }}><Ic.check size={16} color="#10B981"/>Todo borrado. Recarga la página.</div>
            : <button onClick={handleCleanData} disabled={cleaning} style={{ ...S.btn,background:'#EF4444',opacity:cleaning?0.7:1,fontSize:12 }}>{cleaning?'Limpiando...':'Borrar TODO (tickets + inventario)'}</button>
          }
        </div>
      </div>

      {/* ── ALIASES ── */}
      <div style={{ ...S.card }}>
        <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 4px' }}>Aliases de Modelos</h3>
        <p style={{ fontSize:11, color:'#6B7280', margin:'0 0 12px' }}>Mapea nombres alternativos (como vienen en los leads) al modelo del catálogo. Ej: "R15 V4" → YZF-R15A</p>

        {/* Probador — valida a qué modelo resolvería un texto sin re-importar */}
        <form onSubmit={handleAliasTest} style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap', background:'#F9FAFB', padding:'10px 12px', borderRadius:8, border:'1px solid #E5E7EB' }}>
          <input value={aliasTestText} onChange={e=>setAliasTestText(e.target.value)}
            placeholder='Probar: pega el texto como viene en el lead…' style={{ ...S.inp, flex:1, minWidth:200 }}/>
          <button type="submit" disabled={aliasTesting||!aliasTestText.trim()}
            style={{ ...S.btn2, opacity:aliasTesting?0.7:1 }}>Probar alias</button>
        </form>
        {aliasTestResult && (
          <div style={{
            fontSize:12, padding:'8px 12px', borderRadius:8, marginBottom:12,
            background: aliasTestResult.matched ? '#F0FDF4' : aliasTestResult.error ? '#FEF2F2' : '#FFFBEB',
            border: `1px solid ${aliasTestResult.matched ? '#BBF7D0' : aliasTestResult.error ? '#FECACA' : '#FCD34D'}`,
            color:  aliasTestResult.matched ? '#166534' : aliasTestResult.error ? '#DC2626' : '#92400E',
          }}>
            {aliasTestResult.error
              ? aliasTestResult.error
              : aliasTestResult.matched
                ? <>
                    <strong>Match:</strong> "{aliasTestResult.model.alias}" → {aliasTestResult.model.brand} {aliasTestResult.model.model}
                    {aliasTestResult.model.commercial_name && aliasTestResult.model.commercial_name !== aliasTestResult.model.model && ` (${aliasTestResult.model.commercial_name})`}
                    {aliasTestResult.warning && <div style={{ marginTop:4, color:'#92400E' }}>⚠ {aliasTestResult.warning}</div>}
                  </>
                : <>Sin alias exacto. {aliasTestResult.note}</>}
          </div>
        )}
        <form onSubmit={handleAddAlias} style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
          <input value={aliasForm.alias} onChange={e=>setAliasForm(f=>({...f,alias:e.target.value}))}
            placeholder='Alias del lead (ej: "R15 V4")' style={{ ...S.inp,flex:1,minWidth:160 }}/>
          <select value={aliasForm.model_id} onChange={e=>setAliasForm(f=>({...f,model_id:e.target.value}))}
            style={{ ...S.inp,flex:1,minWidth:200 }}>
            <option value="">Seleccionar modelo del catálogo...</option>
            {catalogModels.map(m=>(
              <option key={m.id} value={m.id}>
                {m.brand} {m.model}{m.commercial_name&&m.commercial_name!==m.model?` (${m.commercial_name})`:''}</option>
            ))}
          </select>
          <button type="submit" disabled={aliasSaving||!aliasForm.alias||!aliasForm.model_id}
            style={{ ...S.btn,opacity:aliasSaving?0.7:1 }}>Agregar</button>
        </form>
        {aliases.length===0
          ? <div style={{ fontSize:12,color:'#6B7280',padding:'8px 0' }}>Sin aliases configurados.</div>
          : <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
              {aliases.map(a=>(
                <div key={a.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 10px',background:'#F9FAFB',borderRadius:8,fontSize:12 }}>
                  <div>
                    <span style={{ fontWeight:600,color:'var(--brand)' }}>"{a.alias}"</span>
                    <span style={{ color:'#6B7280',margin:'0 6px' }}>→</span>
                    <span style={{ fontWeight:600 }}>{a.brand} {a.model}</span>
                    {a.commercial_name&&a.commercial_name!==a.model&&<span style={{ color:'#6B7280' }}> ({a.commercial_name})</span>}
                  </div>
                  <button onClick={()=>handleDeleteAlias(a.id)}
                    style={{ ...S.gh,padding:'2px 8px',fontSize:11,color:'#EF4444' }}>Eliminar</button>
                </div>
              ))}
            </div>
        }
      </div>

      {/* ══ MODAL — CREAR USUARIO ══ */}
      {showCreate && (
        <Modal onClose={()=>setShowCreate(false)} title="Nuevo usuario">
          <form onSubmit={handleCreate}>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <Field label="Nombre *" value={cForm.first_name} onChange={v=>setCForm(p=>({...p,first_name:v}))} ph="Nombre"/>
              <Field label="Apellido *" value={cForm.last_name} onChange={v=>setCForm(p=>({...p,last_name:v}))} ph="Apellido"/>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Email *" value={cForm.email} onChange={v=>setCForm(p=>({...p,email:v}))} ph="correo@ejemplo.com" type="email"/>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Contraseña temporal *" value={cForm.password} onChange={v=>setCForm(p=>({...p,password:v}))} ph="Mínimo 8 caracteres" type="password"/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <Field label="Rol *" value={cForm.role} onChange={v=>setCForm(p=>({...p,role:v}))}
                opts={ROLES.map(r=>({v:r.v,l:r.l}))}/>
              <Field label="Sucursal" value={cForm.branch_id} onChange={v=>setCForm(p=>({...p,branch_id:v}))}
                opts={[{v:'',l:'Sin sucursal'},...branches.map(b=>({v:b.id,l:b.name}))]}/>
            </div>
            <ActiveToggle value={cForm.active} onChange={v=>setCForm(p=>({...p,active:v}))}/>
            <ErrorMsg msg={cErr}/>
            <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
              <button type="button" onClick={()=>setShowCreate(false)} style={S.btn2}>Cancelar</button>
              <button type="submit" disabled={cSaving} style={{ ...S.btn,opacity:cSaving?0.7:1 }}>
                {cSaving?'Creando...':'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ MODAL — EDITAR USUARIO ══ */}
      {editTarget && (
        <Modal onClose={()=>setEditTarget(null)} title={`Editar usuario`}>
          <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#F8F9FB',borderRadius:9,border:'1px solid #E5E7EB',marginBottom:16 }}>
            <div style={{ width:34,height:34,borderRadius:'50%',background:'var(--brand-soft)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--brand)',fontSize:12,fontWeight:700,flexShrink:0 }}>
              {((editTarget.first_name||'?')[0]+(editTarget.last_name||'?')[0]).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:13,fontWeight:700 }}>{editTarget.first_name} {editTarget.last_name}</div>
              <div style={{ fontSize:11,color:'#6B7280' }}>{editTarget.email||editTarget.username}</div>
            </div>
          </div>
          <form onSubmit={handleEdit}>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <Field label="Nombre *" value={eForm.first_name} onChange={v=>setEForm(p=>({...p,first_name:v}))} ph="Nombre"/>
              <Field label="Apellido *" value={eForm.last_name} onChange={v=>setEForm(p=>({...p,last_name:v}))} ph="Apellido"/>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Email" value={eForm.email} onChange={v=>setEForm(p=>({...p,email:v}))} ph="correo@ejemplo.com" type="email"/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <Field label="Rol *" value={eForm.role} onChange={v=>setEForm(p=>({...p,role:v}))}
                opts={ROLES.map(r=>({v:r.v,l:r.l}))}/>
              <Field label="Sucursal" value={eForm.branch_id||''} onChange={v=>setEForm(p=>({...p,branch_id:v}))}
                opts={[{v:'',l:'Sin sucursal'},...branches.map(b=>({v:b.id,l:b.name}))]}/>
            </div>
            <ActiveToggle value={eForm.active} onChange={v=>setEForm(p=>({...p,active:v}))}/>
            <ErrorMsg msg={eErr}/>
            <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
              <button type="button" onClick={()=>setEditTarget(null)} style={S.btn2}>Cancelar</button>
              <button type="submit" disabled={eSaving} style={{ ...S.btn,opacity:eSaving?0.7:1 }}>
                {eSaving?'Guardando...':'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ MODAL — DESACTIVAR USUARIO ══ */}
      {deactivateTarget && (
        <Modal onClose={() => { setDeactivateTarget(null); setDeactivateInfo(null); }} title="Desactivar usuario">
          {/* Identidad */}
          <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#FEF2F2',borderRadius:9,border:'1px solid #FECACA',marginBottom:16 }}>
            <div style={{ width:34,height:34,borderRadius:'50%',background:'#FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',color:'#DC2626',fontSize:12,fontWeight:700,flexShrink:0 }}>
              {((deactivateTarget.first_name||'?')[0]+(deactivateTarget.last_name||'?')[0]).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:13,fontWeight:700,color:'#DC2626' }}>{deactivateTarget.first_name} {deactivateTarget.last_name}</div>
              <div style={{ fontSize:11,color:'#9CA3AF' }}>{deactivateTarget.email}</div>
            </div>
          </div>

          {/* Leads activos */}
          {deactivateInfo?.loading
            ? <div style={{ fontSize:12,color:'#6B7280',marginBottom:14 }}>Verificando leads activos...</div>
            : deactivateInfo?.count > 0
              ? <div style={{ padding:'10px 14px',borderRadius:9,background:'#FFFBEB',border:'1px solid #FCD34D',marginBottom:14 }}>
                  <div style={{ fontSize:12,fontWeight:700,color:'#92400E',marginBottom:6 }}>
                    Este usuario tiene {deactivateInfo.count} lead{deactivateInfo.count!==1?'s':''} activo{deactivateInfo.count!==1?'s':''}
                  </div>
                  <div style={{ fontSize:11,color:'#78350F' }}>
                    Elige qué hacer con ellos:
                  </div>
                  <div style={{ marginTop:10 }}>
                    <label style={{ fontSize:11,fontWeight:600,color:'#374151',display:'block',marginBottom:4 }}>Reasignar a</label>
                    <select
                      value={deactivateReassignTo}
                      onChange={e => setDeactivateReassignTo(e.target.value)}
                      style={{ ...S.inp, width:'100%' }}
                    >
                      <option value="">— Dejar sin reasignar (SLA los redistribuirá) —</option>
                      {users.filter(u => u.active && u.id !== deactivateTarget.id).map(u => (
                        <option key={u.id} value={u.id}>
                          {u.first_name} {u.last_name} · {ROLES.find(r=>r.v===u.role)?.l||u.role}
                        </option>
                      ))}
                    </select>
                    {!deactivateReassignTo && (
                      <div style={{ fontSize:10,color:'#9CA3AF',marginTop:4 }}>
                        Si no reasignas ahora, los leads quedan asignados al historial del usuario.
                        La rotación de SLA los redistribuirá automáticamente cuando venza el plazo.
                      </div>
                    )}
                  </div>
                </div>
              : deactivateInfo?.count === 0
                ? <div style={{ padding:'8px 12px',borderRadius:8,background:'#F0FDF4',border:'1px solid #BBF7D0',fontSize:11,color:'#16A34A',marginBottom:14 }}>
                    Sin leads activos asignados — se puede desactivar sin impacto.
                  </div>
                : null
          }

          <div style={{ padding:'8px 12px',borderRadius:8,background:'#F9FAFB',border:'1px solid #E5E7EB',fontSize:11,color:'#6B7280',marginBottom:14 }}>
            El usuario <strong>no podrá iniciar sesión</strong> ni aparecerá en selectores de vendedores ni en la rotación de asignaciones. El historial y trazabilidad se mantienen íntegros.
          </div>

          <ErrorMsg msg={deactivateErr}/>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <button type="button" onClick={() => { setDeactivateTarget(null); setDeactivateInfo(null); }} style={S.btn2}>Cancelar</button>
            <button
              type="button"
              disabled={deactivating || deactivateInfo?.loading}
              onClick={handleDeactivate}
              style={{ ...S.btn, background:'#DC2626', opacity:(deactivating||deactivateInfo?.loading)?0.7:1 }}
            >
              {deactivating ? 'Desactivando...' : 'Confirmar desactivación'}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL — ELIMINAR USUARIO ══ */}
      {deleteTarget && (
        <Modal onClose={() => { setDeleteTarget(null); setDeleteErr(''); setDeleteDetail(null); }} title="Eliminar usuario">
          <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#FEF2F2',borderRadius:9,border:'1px solid #FECACA',marginBottom:14 }}>
            <div style={{ width:34,height:34,borderRadius:'50%',background:'#FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',color:'#DC2626',fontSize:12,fontWeight:700,flexShrink:0 }}>
              {((deleteTarget.first_name||'?')[0]+(deleteTarget.last_name||'?')[0]).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:13,fontWeight:700,color:'#DC2626' }}>{deleteTarget.first_name} {deleteTarget.last_name}</div>
              <div style={{ fontSize:11,color:'#9CA3AF' }}>{deleteTarget.email}</div>
            </div>
          </div>
          <div style={{ padding:'10px 12px', background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:8, fontSize:11, color:'#92400E', marginBottom:14 }}>
            Esta acción <strong>borra al usuario definitivamente</strong>. Solo funciona si el usuario no tiene leads, ventas, recordatorios, inventario ni reasignaciones en su historial. Si tiene historial, el sistema te lo avisa y deberás usar «Desactivar».
          </div>
          {deleteDetail && (
            <div style={{ padding:'10px 12px', background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:8, fontSize:11, color:'#374151', marginBottom:14 }}>
              <div style={{ fontWeight:600, marginBottom:4 }}>Historial detectado:</div>
              {Object.entries(deleteDetail).filter(([,v]) => v > 0).map(([k,v]) => (
                <div key={k} style={{ color:'#6B7280' }}>· {k}: {v}</div>
              ))}
            </div>
          )}
          <ErrorMsg msg={deleteErr}/>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <button type="button" onClick={() => { setDeleteTarget(null); setDeleteErr(''); setDeleteDetail(null); }} style={S.btn2}>Cancelar</button>
            <button type="button" disabled={deleting} onClick={handleDelete}
              style={{ ...S.btn, background:'#DC2626', opacity:deleting?0.7:1 }}>
              {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL — SUCURSAL (crear / editar) ══ */}
      {branchEditTarget && (
        <Modal onClose={()=>setBranchEditTarget(null)} title={branchEditTarget.__new ? 'Nueva sucursal' : 'Editar sucursal'}>
          <form onSubmit={handleBranchSave}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:12 }}>
              <Field label="Nombre *" value={bForm.name} onChange={v=>setBForm(p=>({...p,name:v}))} ph="Mall Plaza Norte"/>
              <Field label="Código *" value={bForm.code} onChange={v=>setBForm(p=>({...p,code:v.toUpperCase()}))} ph="MPN"/>
            </div>
            <div style={{ marginBottom:12 }}>
              <Field label="Dirección" value={bForm.address} onChange={v=>setBForm(p=>({...p,address:v}))} ph="Av. ..."/>
            </div>
            {!branchEditTarget.__new && (
              <ActiveToggle value={bForm.active} onChange={v=>setBForm(p=>({...p,active:v}))}/>
            )}
            <ErrorMsg msg={bErr}/>
            <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
              <button type="button" onClick={()=>setBranchEditTarget(null)} style={S.btn2}>Cancelar</button>
              <button type="submit" disabled={bSaving} style={{ ...S.btn, opacity:bSaving?0.7:1 }}>
                {bSaving ? 'Guardando...' : (branchEditTarget.__new ? 'Crear sucursal' : 'Guardar cambios')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ MODAL — ELIMINAR SUCURSAL ══ */}
      {branchDeleteTarget && (
        <Modal onClose={()=>{ setBranchDeleteTarget(null); setBranchDeleteErr(''); }} title="Eliminar sucursal">
          <div style={{ padding:'10px 14px', background:'#FEF2F2', borderRadius:9, border:'1px solid #FECACA', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#DC2626' }}>{branchDeleteTarget.name}</div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{branchDeleteTarget.code} · {branchDeleteTarget.address || '—'}</div>
          </div>
          <div style={{ padding:'10px 12px', background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:8, fontSize:11, color:'#92400E', marginBottom:14 }}>
            Se eliminará definitivamente. Si la sucursal tiene usuarios, leads o inventario, el sistema bloqueará el borrado — en ese caso edítala y desactívala en su lugar.
          </div>
          <ErrorMsg msg={branchDeleteErr}/>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button type="button" onClick={()=>{ setBranchDeleteTarget(null); setBranchDeleteErr(''); }} style={S.btn2}>Cancelar</button>
            <button type="button" disabled={branchDeleting} onClick={handleBranchDelete}
              style={{ ...S.btn, background:'#DC2626', opacity:branchDeleting?0.7:1 }}>
              {branchDeleting ? 'Eliminando...' : 'Eliminar sucursal'}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL — RESET PASSWORD ══ */}
      {resetInfo && (
        <Modal onClose={()=>setResetInfo(null)} title="Contraseña Reseteada">
          <div style={{ textAlign:'center',padding:'8px 0' }}>
            <div style={{ width:48,height:48,borderRadius:'50%',background:'rgba(16,185,129,0.15)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px' }}>
              <Ic.check size={24} color="#10B981"/>
            </div>
            <p style={{ fontWeight:600,marginBottom:4 }}>{resetInfo.name}</p>
            <p style={{ color:'#6B7280',fontSize:12,marginBottom:12 }}>Contraseña temporal generada. El usuario deberá cambiarla al ingresar.</p>
            <div style={{ background:'#F9FAFB',borderRadius:10,padding:'14px 20px',marginBottom:16,fontFamily:'inherit',fontSize:18,fontWeight:700,letterSpacing:2,color:'var(--brand)' }}>
              {resetInfo.temp}
            </div>
            <p style={{ color:'#6B7280',fontSize:11,marginBottom:16 }}>Comparte esta contraseña con el usuario de forma segura.</p>
            <button onClick={()=>setResetInfo(null)} style={S.btn}>Cerrar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
