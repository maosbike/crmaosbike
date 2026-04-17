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
                            background: u.active ? 'rgba(242,129,0,0.12)' : '#F3F4F6',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color: u.active ? '#F28100' : '#9CA3AF',
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
        <h3 style={{ fontSize:12, fontWeight:600, margin:'0 0 10px' }}>Sucursales</h3>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {branches.map(b => (
            <div key={b.id} style={{ background:'#F9FAFB', borderRadius:10, padding:12, minWidth:200, flex:'1 1 200px' }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>{b.name}</div>
              <div style={{ fontSize:11, color:'#6B7280' }}>{b.address||b.addr}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                Código: {b.code} · Vendedores: {users.filter(u => u.branch_id===b.id && u.role===ROLE_KEYS.VEND).length}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DANGER ZONE ── */}
      <div style={{ border:'2px solid #FECACA', borderRadius:12, padding:'16px 20px', marginBottom:14, background:'#FFF5F5' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#DC2626', marginBottom:4 }}>Zona restringida</div>
        <p style={{ fontSize:12, color:'#6B7280', marginBottom:14 }}>Las acciones de esta sección son permanentes y no se pueden deshacer.</p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {cleanCatalogDone!==null
            ? <div style={{ display:'flex',alignItems:'center',gap:8,color:'#10B981',fontSize:12,fontWeight:600 }}><Ic.check size={16} color="#10B981"/>{cleanCatalogDone} modelos eliminados. Recarga para ver cambios.</div>
            : <button onClick={handleCleanCatalog} disabled={cleaningCatalog} style={{ ...S.btn,background:'#8B5CF6',opacity:cleaningCatalog?0.7:1,fontSize:12 }}>{cleaningCatalog?'Limpiando...':'🗑 Borrar catálogo completo'}</button>
          }
          {cleanImportsDone!==null
            ? <div style={{ display:'flex',alignItems:'center',gap:8,color:'#10B981',fontSize:12,fontWeight:600 }}><Ic.check size={16} color="#10B981"/>{cleanImportsDone} tickets importados eliminados. Recarga para ver cambios.</div>
            : <button onClick={handleCleanImports} disabled={cleaningImports||cleanDone} style={{ ...S.btn,background:'#F59E0B',opacity:cleaningImports?0.7:1,fontSize:12 }}>{cleaningImports?'Limpiando...':'🗑 Borrar data importada'}</button>
          }
          {cleanDone
            ? <div style={{ display:'flex',alignItems:'center',gap:8,color:'#10B981',fontSize:12,fontWeight:600 }}><Ic.check size={16} color="#10B981"/>Todo borrado. Recarga la página.</div>
            : <button onClick={handleCleanData} disabled={cleaning} style={{ ...S.btn,background:'#EF4444',opacity:cleaning?0.7:1,fontSize:12 }}>{cleaning?'Limpiando...':'🗑 Borrar TODO (tickets + inventario)'}</button>
          }
        </div>
      </div>

      {/* ── ALIASES ── */}
      <div style={{ ...S.card }}>
        <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 4px' }}>Aliases de Modelos</h3>
        <p style={{ fontSize:11, color:'#6B7280', margin:'0 0 12px' }}>Mapea nombres alternativos (como vienen en los leads) al modelo del catálogo. Ej: "R15 V4" → YZF-R15A</p>
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
                    <span style={{ fontWeight:600,color:'#F28100' }}>"{a.alias}"</span>
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
            <div style={{ width:34,height:34,borderRadius:'50%',background:'rgba(242,129,0,0.12)',display:'flex',alignItems:'center',justifyContent:'center',color:'#F28100',fontSize:12,fontWeight:700,flexShrink:0 }}>
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
                    ⚠ Este usuario tiene {deactivateInfo.count} lead{deactivateInfo.count!==1?'s':''} activo{deactivateInfo.count!==1?'s':''}
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

      {/* ══ MODAL — RESET PASSWORD ══ */}
      {resetInfo && (
        <Modal onClose={()=>setResetInfo(null)} title="Contraseña Reseteada">
          <div style={{ textAlign:'center',padding:'8px 0' }}>
            <div style={{ width:48,height:48,borderRadius:'50%',background:'rgba(16,185,129,0.15)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px' }}>
              <Ic.check size={24} color="#10B981"/>
            </div>
            <p style={{ fontWeight:600,marginBottom:4 }}>{resetInfo.name}</p>
            <p style={{ color:'#6B7280',fontSize:12,marginBottom:12 }}>Contraseña temporal generada. El usuario deberá cambiarla al ingresar.</p>
            <div style={{ background:'#F9FAFB',borderRadius:10,padding:'14px 20px',marginBottom:16,fontFamily:'monospace',fontSize:18,fontWeight:700,letterSpacing:2,color:'#F28100' }}>
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
