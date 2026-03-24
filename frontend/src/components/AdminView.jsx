import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui';

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
  useEffect(()=>{
    api.listUsers().then(setUsers).catch(()=>{}).finally(()=>setLoading(false));
    api.getBranches().then(setBranches).catch(()=>{});
  },[]);
  const handleCleanData=async()=>{
    if(!confirm('⚠️ ATENCIÓN: Esto eliminará TODOS los tickets, leads, importaciones e inventario.\n\nUsuarios, sucursales y catálogo de motos se conservan.\n\n¿Confirmar?'))return;
    if(!confirm('Segunda confirmación: ¿Estás seguro? Esta acción NO se puede deshacer.'))return;
    setCleaning(true);
    try{
      await api.resetDemoData();
      setCleanDone(true);
    }catch(ex){alert('Error: '+(ex.message||'No se pudo limpiar'));}
    finally{setCleaning(false);}
  };
  const handleCleanCatalog=async()=>{
    if(!confirm('⚠️ ATENCIÓN: Esto eliminará TODO el catálogo de motos y todos los precios importados.\n\nTickets, inventario y usuarios se conservan.\n\n¿Confirmar?'))return;
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
          {loading&&<div style={{color:"#555",fontSize:12,padding:8}}>Cargando...</div>}
          {users.map(u=>(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #1A1A1B"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"rgba(242,129,0,0.1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:9,fontWeight:700,flexShrink:0}}>
                {(u.first_name[0]+u.last_name[0]).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600}}>{u.first_name} {u.last_name}</div>
                <div style={{fontSize:10,color:"#555"}}>{u.username||u.email}</div>
              </div>
              <Bdg l={u.role.replace(/_/g," ")} c={ROLE_C[u.role]||"#6B7280"}/>
              <button onClick={()=>handleReset(u)} style={{...S.gh,fontSize:10,color:"#555",padding:"3px 7px",border:"1px solid #262626",borderRadius:6}} title="Reset contraseña"><Ic.lock size={12}/></button>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <h3 style={{fontSize:12,fontWeight:600,margin:"0 0 10px"}}>Sucursales</h3>
          {branches.map(b=>(
            <div key={b.id} style={{background:"#0E0E0F",borderRadius:10,padding:12,marginBottom:8}}>
              <div style={{fontWeight:700,marginBottom:4}}>{b.name}</div>
              <div style={{fontSize:11,color:"#555"}}>{b.address||b.addr}</div>
              <div style={{fontSize:11,color:"#555",marginTop:4}}>Código: {b.code} · Vendedores: {users.filter(u=>u.branch_id===b.id&&u.role==="vendedor").length}</div>
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

      {resetInfo&&(
        <Modal onClose={()=>setResetInfo(null)} title="Contraseña Reseteada">
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"rgba(16,185,129,0.15)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><Ic.check size={24} color="#10B981"/></div>
            <p style={{fontWeight:600,marginBottom:4}}>{resetInfo.name}</p>
            <p style={{color:"#6B6B6B",fontSize:12,marginBottom:12}}>Contraseña temporal generada. El usuario deberá cambiarla al ingresar.</p>
            <div style={{background:"#0E0E0F",borderRadius:10,padding:"14px 20px",marginBottom:16,fontFamily:"monospace",fontSize:18,fontWeight:700,letterSpacing:2,color:"#F28100"}}>{resetInfo.temp}</div>
            <p style={{color:"#555",fontSize:11,marginBottom:16}}>Comparte esta contraseña con el usuario de forma segura.</p>
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

