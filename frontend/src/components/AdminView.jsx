import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function AdminView(){
  const[users,setUsers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[resetInfo,setResetInfo]=useState(null);
  const[branches,setBranches]=useState([]);
  const[cleaning,setCleaning]=useState(false);
  const[cleanDone,setCleanDone]=useState(false);
  const[cleaningImports,setCleaningImports]=useState(false);
  const[cleanImportsDone,setCleanImportsDone]=useState(null);
  const[cleaningCatalog,setCleaningCatalog]=useState(false);
  const[cleanCatalogDone,setCleanCatalogDone]=useState(null);
  const[aliases,setAliases]=useState([]);
  const[aliasForm,setAliasForm]=useState({alias:'',model_id:''});
  const[catalogModels,setCatalogModels]=useState([]);
  const[aliasSaving,setAliasSaving]=useState(false);
  useEffect(()=>{
    api.listUsers().then(setUsers).catch(()=>{}).finally(()=>setLoading(false));
    api.getBranches().then(setBranches).catch(()=>{});
    api.getAliases().then(setAliases).catch(()=>{});
    api.getModels().then(d=>setCatalogModels(Array.isArray(d)?d:[])).catch(()=>{});
  },[]);
  const handleAddAlias=async e=>{
    e.preventDefault();
    if(!aliasForm.alias||!aliasForm.model_id)return;
    setAliasSaving(true);
    try{
      const a=await api.createAlias({alias:aliasForm.alias.trim(),model_id:aliasForm.model_id});
      setAliases(prev=>[...prev.filter(x=>x.alias!==a.alias),{...a,...catalogModels.find(m=>m.id===a.model_id)}]);
      setAliasForm({alias:'',model_id:''});
    }catch(ex){alert(ex.message);}
    finally{setAliasSaving(false);}
  };
  const handleDeleteAlias=async id=>{
    await api.deleteAlias(id).catch(()=>{});
    setAliases(prev=>prev.filter(a=>a.id!==id));
  };
  const handleCleanData=async()=>{
    if(!confirm('ATENCIÓN: Esto eliminará TODOS los tickets, leads, importaciones e inventario.\n\nUsuarios, sucursales y catálogo de motos se conservan.\n\n¿Confirmar?'))return;
    if(!confirm('Segunda confirmación: ¿Estás seguro? Esta acción NO se puede deshacer.'))return;
    setCleaning(true);
    try{
      await api.resetDemoData();
      setCleanDone(true);
    }catch(ex){alert('Error: '+(ex.message||'No se pudo limpiar'));}
    finally{setCleaning(false);}
  };
  const handleCleanCatalog=async()=>{
    if(!confirm('ATENCIÓN: Esto eliminará TODO el catálogo de motos y todos los precios importados.\n\nTickets, inventario y usuarios se conservan.\n\n¿Confirmar?'))return;
    if(!confirm('Segunda confirmación: ¿Seguro? Esta acción NO se puede deshacer.'))return;
    setCleaningCatalog(true);
    try{
      const r=await api.resetCatalog();
      setCleanCatalogDone(r.deleted??0);
    }catch(ex){alert('Error: '+(ex.message||'No se pudo limpiar catálogo'));}
    finally{setCleaningCatalog(false);}
  };
  const handleCleanImports=async()=>{
    if(!confirm('¿Eliminar todos los tickets importados (source=importacion) y los logs de importación?\n\nLos tickets creados manualmente se conservan.'))return;
    setCleaningImports(true);
    try{
      const r=await api.resetImports();
      setCleanImportsDone(r.deleted??0);
    }catch(ex){alert('Error: '+(ex.message||'No se pudo limpiar'));}
    finally{setCleaningImports(false);}
  };
  const ROLE_C={super_admin:"#EF4444",admin_comercial:"#8B5CF6",backoffice:"#F59E0B",vendedor:"#3B82F6"};
  const handleReset=async(u)=>{
    if(!confirm(`¿Resetear contraseña de ${u.first_name} ${u.last_name}? Se generará una contraseña temporal.`))return;
    try{
      const r=await api.resetPassword(u.id);
      setResetInfo({name:`${u.first_name} ${u.last_name}`,temp:r.temp_password});
    }catch(ex){alert(ex.message||"Error al resetear contraseña");}
  };
  return(
    <div>
      <h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Administración</h1>
      <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={S.card}>
          <h3 style={{fontSize:12,fontWeight:600,margin:"0 0 10px"}}>Usuarios ({users.length})</h3>
          {loading&&<div style={{color:"#6B7280",fontSize:12,padding:8}}>Cargando...</div>}
          {users.map(u=>(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #F3F4F6"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"rgba(242,129,0,0.1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:9,fontWeight:700,flexShrink:0}}>
                {(u.first_name[0]+u.last_name[0]).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600}}>{u.first_name} {u.last_name}</div>
                <div style={{fontSize:10,color:"#6B7280"}}>{u.username||u.email}</div>
              </div>
              <Bdg l={u.role.replace(/_/g," ")} c={ROLE_C[u.role]||"#6B7280"}/>
              <button onClick={()=>handleReset(u)} style={{...S.gh,fontSize:10,color:"#6B7280",padding:"3px 7px",border:"1px solid #D1D5DB",borderRadius:6}} title="Reset contraseña"><Ic.lock size={12}/></button>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <h3 style={{fontSize:12,fontWeight:600,margin:"0 0 10px"}}>Sucursales</h3>
          {branches.map(b=>(
            <div key={b.id} style={{background:"#F9FAFB",borderRadius:10,padding:12,marginBottom:8}}>
              <div style={{fontWeight:700,marginBottom:4}}>{b.name}</div>
              <div style={{fontSize:11,color:"#6B7280"}}>{b.address||b.addr}</div>
              <div style={{fontSize:11,color:"#6B7280",marginTop:4}}>Código: {b.code} · Vendedores: {users.filter(u=>u.branch_id===b.id&&u.role==="vendedor").length}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{...S.card,marginTop:14,borderColor:"rgba(239,68,68,0.25)"}}>
        <h3 style={{fontSize:12,fontWeight:600,margin:"0 0 6px",color:"#EF4444"}}>Zona de peligro</h3>
        <p style={{fontSize:11,color:"#6B6B6B",marginBottom:12}}>Elimina todos los tickets, leads, importaciones e inventario de prueba. Los usuarios, sucursales y catálogo de motos se conservan.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {cleanCatalogDone!==null
            ?<div style={{display:"flex",alignItems:"center",gap:8,color:"#10B981",fontSize:12,fontWeight:600}}><Ic.check size={16} color="#10B981"/>{cleanCatalogDone} modelos eliminados. Recarga para ver cambios.</div>
            :<button onClick={handleCleanCatalog} disabled={cleaningCatalog} style={{...S.btn,background:"#8B5CF6",opacity:cleaningCatalog?0.7:1,fontSize:12}}>{cleaningCatalog?"Limpiando...":"🗑 Borrar catálogo completo"}</button>
          }
          {cleanImportsDone!==null
            ?<div style={{display:"flex",alignItems:"center",gap:8,color:"#10B981",fontSize:12,fontWeight:600}}><Ic.check size={16} color="#10B981"/>{cleanImportsDone} tickets importados eliminados. Recarga para ver cambios.</div>
            :<button onClick={handleCleanImports} disabled={cleaningImports||cleanDone} style={{...S.btn,background:"#F59E0B",opacity:cleaningImports?0.7:1,fontSize:12}}>{cleaningImports?"Limpiando...":"🗑 Borrar data importada"}</button>
          }
          {cleanDone
            ?<div style={{display:"flex",alignItems:"center",gap:8,color:"#10B981",fontSize:12,fontWeight:600}}><Ic.check size={16} color="#10B981"/>Todo borrado. Recarga la página.</div>
            :<button onClick={handleCleanData} disabled={cleaning} style={{...S.btn,background:"#EF4444",opacity:cleaning?0.7:1,fontSize:12}}>{cleaning?"Limpiando...":"🗑 Borrar TODO (tickets + inventario)"}</button>
          }
        </div>
      </div>

      {/* ALIASES DE MODELOS */}
      <div style={{...S.card,marginTop:16}}>
        <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 4px"}}>Aliases de Modelos</h3>
        <p style={{fontSize:11,color:"#6B7280",margin:"0 0 12px"}}>Mapea nombres alternativos (como vienen en los leads) al modelo del catálogo. Ej: "R15 V4" → YZF-R15A</p>
        <form onSubmit={handleAddAlias} style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <input value={aliasForm.alias} onChange={e=>setAliasForm(f=>({...f,alias:e.target.value}))} placeholder='Alias del lead (ej: "R15 V4")' style={{...S.inp,flex:1,minWidth:160}}/>
          <select value={aliasForm.model_id} onChange={e=>setAliasForm(f=>({...f,model_id:e.target.value}))} style={{...S.inp,flex:1,minWidth:200}}>
            <option value="">Seleccionar modelo del catálogo...</option>
            {catalogModels.map(m=><option key={m.id} value={m.id}>{m.brand} {m.model}{m.commercial_name&&m.commercial_name!==m.model?` (${m.commercial_name})`:''}</option>)}
          </select>
          <button type="submit" disabled={aliasSaving||!aliasForm.alias||!aliasForm.model_id} style={{...S.btn,opacity:aliasSaving?0.7:1}}>Agregar</button>
        </form>
        {aliases.length===0
          ?<div style={{fontSize:12,color:"#6B7280",padding:"8px 0"}}>Sin aliases configurados.</div>
          :<div style={{display:"flex",flexDirection:"column",gap:4}}>
            {aliases.map(a=>(
              <div key={a.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:"#F9FAFB",borderRadius:8,fontSize:12}}>
                <div><span style={{fontWeight:600,color:"#F28100"}}>"{a.alias}"</span><span style={{color:"#6B7280",margin:"0 6px"}}>→</span><span style={{fontWeight:600}}>{a.brand} {a.model}</span>{a.commercial_name&&a.commercial_name!==a.model&&<span style={{color:"#6B7280"}}> ({a.commercial_name})</span>}</div>
                <button onClick={()=>handleDeleteAlias(a.id)} style={{...S.gh,padding:"2px 8px",fontSize:11,color:"#EF4444"}}>Eliminar</button>
              </div>
            ))}
          </div>
        }
      </div>

      {resetInfo&&(
        <Modal onClose={()=>setResetInfo(null)} title="Contraseña Reseteada">
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"rgba(16,185,129,0.15)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><Ic.check size={24} color="#10B981"/></div>
            <p style={{fontWeight:600,marginBottom:4}}>{resetInfo.name}</p>
            <p style={{color:"#6B6B6B",fontSize:12,marginBottom:12}}>Contraseña temporal generada. El usuario deberá cambiarla al ingresar.</p>
            <div style={{background:"#F9FAFB",borderRadius:10,padding:"14px 20px",marginBottom:16,fontFamily:"monospace",fontSize:18,fontWeight:700,letterSpacing:2,color:"#F28100"}}>{resetInfo.temp}</div>
            <p style={{color:"#6B7280",fontSize:11,marginBottom:16}}>Comparte esta contraseña con el usuario de forma segura.</p>
            <button onClick={()=>setResetInfo(null)} style={S.btn}>Cerrar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// NOTIFICATION BELL
// ═══════════════════════════════════════════
