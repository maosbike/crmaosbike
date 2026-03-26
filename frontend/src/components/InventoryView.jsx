import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

const BLANK_NW=()=>({
  branch_id:"",year:new Date().getFullYear(),brand:"",model:"",color:"",chassis:"",motor_num:"",price:0,
  added_as_sold:false,
  sold_at:new Date().toISOString().split('T')[0],
  sold_by:"",ticket_id:"",sale_notes:"",payment_method:"",sale_type:"completa",
});

export function InventoryView({inv,setInv,user,realBranches}){
  const brs=realBranches||[];
  const[brF,setBrF]=useState("");const[stF,setStF]=useState("");const[search,setSearch]=useState("");const[showAdd,setShowAdd]=useState(false);const[viewPhoto,setViewPhoto]=useState(null);const[adding,setAdding]=useState(false);
  const[nw,setNw]=useState(BLANK_NW());
  const[sellers,setSellers]=useState([]);
  const[openTickets,setOpenTickets]=useState([]);
  // Import state
  const[showImport,setShowImport]=useState(false);
  const[importPreview,setImportPreview]=useState(null);
  const[importLoading,setImportLoading]=useState(false);
  const[importDone,setImportDone]=useState(null);
  const importFileRef=useRef(null);
  const isAdmin=['super_admin','admin_comercial'].includes(user?.role);

  const f=inv.filter(x=>{if(brF&&x.branch_id!==brF)return false;if(stF&&x.status!==stF)return false;if(search&&!`${x.brand} ${x.model} ${x.chassis} ${x.color}`.toLowerCase().includes(search.toLowerCase()))return false;return true;});
  const counts=Object.fromEntries(Object.keys(INV_ST).map(k=>[k,inv.filter(x=>x.status===k).length]));
  const reload=()=>api.getInventory().then(d=>setInv(Array.isArray(d)?d:[])).catch(()=>{});

  useEffect(()=>{
    if(!showAdd)return;
    api.getSellers().then(d=>setSellers(Array.isArray(d)?d:[])).catch(()=>{});
    api.getTickets({status:'ganado,abierto',limit:200}).then(d=>setOpenTickets((d.data||[]).slice(0,200))).catch(()=>{});
  },[showAdd]);

  const handleAdd=async e=>{
    e.preventDefault();setAdding(true);
    try{
      await api.createInventory({
        branch_id:nw.branch_id||null,year:Number(nw.year),
        brand:nw.brand,model:nw.model,color:nw.color,
        chassis:nw.chassis,motor_num:nw.motor_num||null,price:Number(nw.price),
        added_as_sold:nw.added_as_sold,
        ...(nw.added_as_sold?{
          sold_at:nw.sold_at||null,
          sold_by:nw.sold_by||null,
          ticket_id:nw.ticket_id||null,
          sale_notes:nw.sale_notes||null,
          payment_method:nw.payment_method||null,
          sale_type:nw.sale_type||null,
        }:{})
      });
      setShowAdd(false);setNw(BLANK_NW());
      reload();
    }catch(ex){alert(ex.message||"Error al agregar");}
    finally{setAdding(false);}
  };
  const handlePhoto=(id,field)=>{
    const input=document.createElement("input");input.type="file";input.accept="image/*";
    input.onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      try{const r=await api.uploadInvPhoto(id,file,field);setInv(p=>p.map(x=>x.id===id?{...x,[field]:r.url}:x));}
      catch(ex){alert(ex.message||"Error al subir foto");}
    };
    input.click();
  };
  const handleImportFile=async e=>{
    const file=e.target.files[0]; if(!file)return;
    setImportLoading(true); setImportPreview(null); setImportDone(null);
    try{const d=await api.importInventoryPreview(file); setImportPreview(d);}
    catch(ex){alert(ex.message||'Error al leer archivo');}
    finally{setImportLoading(false); if(importFileRef.current)importFileRef.current.value='';}
  };
  const handleImportConfirm=async()=>{
    if(!importPreview)return;
    const okRows=importPreview.rows.filter(r=>r._status==='ok');
    if(!okRows.length)return;
    setImportLoading(true);
    try{
      const r=await api.importInventoryConfirm(okRows);
      setImportDone(r); setImportPreview(null); reload();
    }catch(ex){alert(ex.message||'Error al importar');}
    finally{setImportLoading(false);}
  };

  const handleStatus=async(id,status)=>{
    setInv(p=>p.map(x=>x.id===id?{...x,status}:x));
    try{await api.updateInventory(id,{status});}catch(ex){alert(ex.message);reload();}
  };
  const handleMove=async(id,branch_id)=>{
    setInv(p=>p.map(x=>x.id===id?{...x,branch_id}:x));
    try{await api.updateInventory(id,{branch_id});reload();}catch(ex){alert(ex.message);reload();}
  };
  // Visual helpers
  const branchColor=(code)=>({MPN:"#3B82F6",MPS:"#10B981",MOV:"#F28100"})[code]||"#6B7280";
  const KPI_ICONS={disponible:<Ic.check size={16}/>,reservada:<Ic.clock size={16}/>,vendida:<Ic.sale size={16}/>,preinscrita:<Ic.tag size={16}/>};

  return(
    <div>
      {/* ── HEADER ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,margin:0,letterSpacing:"-0.3px"}}>Inventario</h1>
          <p style={{color:"#6B7280",fontSize:12,margin:"3px 0 0"}}>{inv.length} unidades en sistema · <span style={{color:"#10B981",fontWeight:600}}>{counts.disponible} disponibles</span></p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {isAdmin&&(
            <button onClick={()=>{setShowImport(true);setImportPreview(null);setImportDone(null);}}
              style={{display:"flex",alignItems:"center",gap:7,padding:"8px 16px",borderRadius:8,border:"1px solid #E5E7EB",background:"#FFFFFF",fontSize:12,fontWeight:500,cursor:"pointer",color:"#374151",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#F9FAFB";e.currentTarget.style.borderColor="#D1D5DB";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#FFFFFF";e.currentTarget.style.borderColor="#E5E7EB";}}>
              <Ic.upload size={14} color="#6B7280"/>Importar Excel
            </button>
          )}
          <button onClick={()=>setShowAdd(true)}
            style={{display:"flex",alignItems:"center",gap:7,padding:"8px 18px",borderRadius:8,background:"#F28100",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",color:"#FFFFFF",boxShadow:"0 1px 4px rgba(242,129,0,0.25)"}}>
            <Ic.plus size={15} color="#FFFFFF"/>Agregar Moto
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid-4col" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
        {Object.entries(INV_ST).map(([k,v])=>{
          const active=stF===k;
          return(
            <div key={k} onClick={()=>setStF(stF===k?"":k)}
              style={{background:"#FFFFFF",borderRadius:12,padding:"14px 16px",cursor:"pointer",border:`1.5px solid ${active?v.c:"#E5E7EB"}`,boxShadow:active?`0 0 0 3px ${v.c}22`:"0 1px 3px rgba(0,0,0,0.04)",transition:"all 0.15s",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:10,background:`${v.c}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:v.c}}>
                {KPI_ICONS[k]}
              </div>
              <div>
                <div style={{fontSize:22,fontWeight:800,color:v.c,lineHeight:1}}>{counts[k]}</div>
                <div style={{fontSize:11,color:"#6B7280",marginTop:2,fontWeight:500}}>{v.l}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── SEARCH / FILTER BAR ── */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:1,minWidth:200}}>
          <Ic.search size={14} color="#9CA3AF" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar marca, modelo, chasis, color…"
            style={{...S.inp,paddingLeft:34,width:"100%",borderRadius:8,fontSize:12,height:36}}/>
        </div>
        <select value={brF} onChange={e=>setBrF(e.target.value)}
          style={{...S.inp,borderRadius:8,fontSize:12,height:36,minWidth:160,background:"#FFFFFF"}}>
          <option value="">Todas las sucursales</option>
          {brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {(search||brF||stF)&&(
          <button onClick={()=>{setSearch("");setBrF("");setStF("");}}
            style={{padding:"0 14px",height:36,borderRadius:8,border:"1px solid #E5E7EB",background:"#F9FAFB",fontSize:12,cursor:"pointer",color:"#6B7280",display:"flex",alignItems:"center",gap:5}}>
            <Ic.x size={12}/>Limpiar
          </button>
        )}
        {f.length!==inv.length&&<span style={{fontSize:11,color:"#6B7280",alignSelf:"center",paddingLeft:4}}>{f.length} de {inv.length}</span>}
      </div>

      {/* ── TABLA ── */}
      <div style={{background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:12,overflow:"auto",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1050}}>
          <thead>
            <tr style={{background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}}>
              {["Sucursal","Año","Marca / Modelo","Color","N° Chasis","📷","N° Motor","📷","Estado","Precio",""].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.length===0&&(
              <tr><td colSpan={11} style={{padding:"40px 0",textAlign:"center",color:"#9CA3AF",fontSize:13}}>
                {search||brF||stF?"No hay unidades que coincidan con los filtros.":"No hay unidades en inventario."}
              </td></tr>
            )}
            {f.map(x=>{
              const stColor=INV_ST[x.status]?.c||"#6B7280";
              const bCode=x.branch_code||brs.find(b=>b.id===x.branch_id)?.code||"";
              const bColor=branchColor(bCode);
              return(
                <tr key={x.id}
                  style={{borderBottom:"1px solid #F3F4F6",borderLeft:`3px solid ${stColor}22`,transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#FAFAFA"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {/* Sucursal */}
                  <td style={{padding:"10px 12px"}}>
                    <span style={{display:"inline-flex",alignItems:"center",padding:"3px 8px",borderRadius:6,background:`${bColor}15`,color:bColor,fontSize:11,fontWeight:700}}>
                      {bCode||"—"}
                    </span>
                  </td>
                  {/* Año */}
                  <td style={{padding:"10px 12px",color:"#6B7280",fontSize:11}}>{x.year}</td>
                  {/* Marca / Modelo */}
                  <td style={{padding:"10px 12px"}}>
                    <div style={{fontWeight:700,fontSize:12}}>{x.brand}</div>
                    <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{x.model}</div>
                  </td>
                  {/* Color */}
                  <td style={{padding:"10px 12px"}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:"#374151"}}>
                      <span style={{width:10,height:10,borderRadius:"50%",background:"#E5E7EB",border:"1px solid #D1D5DB",flexShrink:0}}/>
                      {x.color}
                    </span>
                  </td>
                  {/* Chasis */}
                  <td style={{padding:"10px 12px",fontFamily:"monospace",fontSize:10,color:"#374151",letterSpacing:"0.02em"}}>{x.chassis}</td>
                  {/* Foto chasis */}
                  <td style={{padding:"10px 12px"}}>
                    {x.chassis_photo
                      ?<img src={x.chassis_photo} onClick={()=>setViewPhoto({src:x.chassis_photo,title:`Chasis ${x.chassis}`})} style={{width:34,height:34,borderRadius:6,objectFit:"cover",cursor:"pointer",border:"1px solid #E5E7EB"}}/>
                      :<button onClick={()=>handlePhoto(x.id,"chassis_photo")} style={{width:34,height:34,borderRadius:6,border:"1.5px dashed #D1D5DB",background:"#F9FAFB",cursor:"pointer",fontSize:14,color:"#9CA3AF",display:"flex",alignItems:"center",justifyContent:"center"}}>📷</button>}
                  </td>
                  {/* Motor */}
                  <td style={{padding:"10px 12px",fontFamily:"monospace",fontSize:10,color:"#6B7280"}}>{x.motor_num||<span style={{color:"#D1D5DB"}}>—</span>}</td>
                  {/* Foto motor */}
                  <td style={{padding:"10px 12px"}}>
                    {x.motor_photo
                      ?<img src={x.motor_photo} onClick={()=>setViewPhoto({src:x.motor_photo,title:`Motor ${x.motor_num}`})} style={{width:34,height:34,borderRadius:6,objectFit:"cover",cursor:"pointer",border:"1px solid #E5E7EB"}}/>
                      :<button onClick={()=>handlePhoto(x.id,"motor_photo")} style={{width:34,height:34,borderRadius:6,border:"1.5px dashed #D1D5DB",background:"#F9FAFB",cursor:"pointer",fontSize:14,color:"#9CA3AF",display:"flex",alignItems:"center",justifyContent:"center"}}>📷</button>}
                  </td>
                  {/* Estado */}
                  <td style={{padding:"10px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:stColor,flexShrink:0}}/>
                      <select value={x.status} onChange={e=>handleStatus(x.id,e.target.value)}
                        style={{background:"transparent",border:"none",fontSize:11,fontWeight:600,color:stColor,cursor:"pointer",padding:0,outline:"none",fontFamily:"inherit"}}>
                        {Object.entries(INV_ST).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                      </select>
                    </div>
                  </td>
                  {/* Precio */}
                  <td style={{padding:"10px 12px",fontWeight:700,fontSize:12,color:"#111827",whiteSpace:"nowrap"}}>
                    {x.price>0?fmt(x.price):<span style={{color:"#D1D5DB",fontWeight:400}}>—</span>}
                  </td>
                  {/* Acción mover */}
                  <td style={{padding:"10px 12px"}}>
                    <select defaultValue="" onChange={e=>{if(e.target.value){handleMove(x.id,e.target.value);}e.target.value="";}}
                      style={{...S.inp,padding:"4px 8px",fontSize:10,width:60,borderRadius:6}}>
                      <option value="" disabled>Mover</option>
                      {brs.filter(b=>b.id!==x.branch_id).map(b=><option key={b.id} value={b.id}>{b.code}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── FOTO LIGHTBOX ── */}
      {viewPhoto&&(
        <div onClick={()=>setViewPhoto(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:70,cursor:"pointer",backdropFilter:"blur(2px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:16,padding:20,maxWidth:600,width:"90%",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <span style={{fontSize:14,fontWeight:700}}>{viewPhoto.title}</span>
              <button onClick={()=>setViewPhoto(null)} style={{...S.gh,padding:6,borderRadius:8}}><Ic.x size={16}/></button>
            </div>
            <img src={viewPhoto.src} style={{width:"100%",borderRadius:10,maxHeight:420,objectFit:"contain"}}/>
          </div>
        </div>
      )}

      {showAdd&&(
        <Modal onClose={()=>{setShowAdd(false);setNw(BLANK_NW());}} title="Agregar Moto" wide>
          <form onSubmit={handleAdd}>
            {/* Datos base */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <Field label="Sucursal *" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.map(b=>({v:b.id,l:b.name}))]} req/>
              <Field label="Año" value={nw.year} onChange={v=>setNw({...nw,year:v})} type="number"/>
              <Field label="Marca *" value={nw.brand} onChange={v=>setNw({...nw,brand:v})} req/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <Field label="Modelo *" value={nw.model} onChange={v=>setNw({...nw,model:v})} req/>
              <Field label="Color *" value={nw.color} onChange={v=>setNw({...nw,color:v})} req/>
              <Field label="Precio" value={nw.price} onChange={v=>setNw({...nw,price:v})} type="number"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <Field label="N° Chasis *" value={nw.chassis} onChange={v=>setNw({...nw,chassis:v})} req/>
              <Field label="N° Motor" value={nw.motor_num} onChange={v=>setNw({...nw,motor_num:v})}/>
            </div>

            {/* Toggle "Agregar como vendida" */}
            <div
              onClick={()=>setNw({...nw,added_as_sold:!nw.added_as_sold})}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:8,marginBottom:nw.added_as_sold?10:16,cursor:"pointer",background:nw.added_as_sold?"rgba(239,68,68,0.06)":"#F9FAFB",border:`1px solid ${nw.added_as_sold?"rgba(239,68,68,0.3)":"#E5E7EB"}`,transition:"all 0.15s"}}
            >
              <div style={{width:18,height:18,borderRadius:4,border:nw.added_as_sold?"none":"2px solid #333",background:nw.added_as_sold?"#EF4444":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {nw.added_as_sold&&<Ic.check size={11} color="white"/>}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:nw.added_as_sold?"#EF4444":"#374151"}}>Esta unidad ya está vendida</div>
                <div style={{fontSize:11,color:"#6B7280"}}>Se registrará en inventario directamente como vendida, sin pasar por stock disponible</div>
              </div>
            </div>

            {/* Campos de venta — solo si added_as_sold */}
            {nw.added_as_sold&&(
              <div style={{background:"rgba(239,68,68,0.04)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,color:"#EF4444",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Datos de la venta</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <Field label="Vendedor responsable" value={nw.sold_by} onChange={v=>setNw({...nw,sold_by:v})}
                    opts={[{v:"",l:"Seleccionar..."},...sellers.map(s=>({v:s.id,l:`${s.first_name||''} ${s.last_name||''}`.trim()}))]}/>
                  <Field label="Fecha de venta" value={nw.sold_at} onChange={v=>setNw({...nw,sold_at:v})} type="date"/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <Field label="Tipo de registro" value={nw.sale_type} onChange={v=>setNw({...nw,sale_type:v})}
                    opts={[{v:"completa",l:"Documentación completa"},{v:"inscripcion",l:"Solo inscripción"},{v:"entregada",l:"Entregada al cliente"}]}/>
                  <Field label="Método de pago" value={nw.payment_method} onChange={v=>setNw({...nw,payment_method:v})}
                    opts={[{v:"",l:"Seleccionar..."},{v:"Contado",l:"Contado"},{v:"Transferencia",l:"Transferencia"},{v:"Tarjeta Débito",l:"Tarjeta Débito"},{v:"Tarjeta Crédito",l:"Tarjeta Crédito"},{v:"Crédito Autofin",l:"Crédito Autofin"},{v:"Mixto",l:"Mixto"}]}/>
                </div>
                <div style={{marginBottom:10}}>
                  <Field label="Lead / Ticket asociado (opcional)" value={nw.ticket_id} onChange={v=>setNw({...nw,ticket_id:v})}
                    opts={[{v:"",l:"Sin asociar"},...openTickets.map(t=>({v:t.id,l:`${t.ticket_num||''} · ${t.first_name||''} ${t.last_name||''}`.trim()}))]}/>
                </div>
                <Field label="Observaciones de venta" value={nw.sale_notes} onChange={v=>setNw({...nw,sale_notes:v})} rows={2} ph="Ej: Venta registrada con retraso, documentación en proceso..."/>
              </div>
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:"#6B7280"}}>
                {nw.added_as_sold&&<span style={{color:"#EF4444",fontWeight:600}}>⚠ Se creará como vendida — no aparecerá en stock disponible</span>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button type="button" onClick={()=>{setShowAdd(false);setNw(BLANK_NW());}} style={S.btn2}>Cancelar</button>
                <button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1,background:nw.added_as_sold?"#EF4444":undefined}}>
                  {adding?"Guardando...":nw.added_as_sold?"Registrar como vendida":"Agregar al inventario"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ── IMPORT MODAL ─────────────────────────────────── */}
      {showImport&&(
        <Modal onClose={()=>setShowImport(false)} title="Importar inventario desde Excel" wide>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={handleImportFile}/>

          {!importPreview&&!importDone&&(
            <div style={{textAlign:"center",padding:"32px 16px"}}>
              <div style={{fontSize:40,marginBottom:12}}>📊</div>
              <p style={{fontSize:13,color:"#374151",marginBottom:6}}>Subí tu plantilla de inventario Excel (.xlsx)</p>
              <p style={{fontSize:11,color:"#6B7280",marginBottom:20}}>
                Columnas esperadas: <strong>Sucursal · Año · Marca · Modelo · Color · N° Chasis · N° Motor · Estado · Precio</strong>
              </p>
              <button onClick={()=>importFileRef.current?.click()} disabled={importLoading}
                style={{...S.btn,fontSize:13,padding:"10px 24px"}}>
                {importLoading?"Procesando...":"Seleccionar archivo"}
              </button>
            </div>
          )}

          {importPreview&&(
            <>
              {/* Summary */}
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                {[
                  {l:"Total filas",  v:importPreview.total,  c:"#6B7280"},
                  {l:"✓ Nuevas",     v:importPreview.ok,         c:"#10B981"},
                  {l:"⟳ Duplicados", v:importPreview.duplicates, c:"#F59E0B"},
                  {l:"✗ Errores",    v:importPreview.errors,     c:"#EF4444"},
                ].map(({l,v,c})=>(
                  <div key={l} style={{...S.card,padding:"8px 14px",textAlign:"center",flex:1,minWidth:80}}>
                    <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:10,color:"#6B7280"}}>{l}</div>
                  </div>
                ))}
              </div>
              <p style={{fontSize:11,color:"#6B7280",marginBottom:10}}>Hoja leída: <strong>{importPreview.sheet}</strong> · Solo se importarán las filas en verde.</p>

              {/* Preview table */}
              <div style={{maxHeight:320,overflowY:"auto",border:"1px solid #E5E7EB",borderRadius:8,marginBottom:14}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead style={{position:"sticky",top:0,background:"#F9FAFB"}}>
                    <tr>{["Fila","Sucursal","Año","Marca","Modelo","Color","Chasis","Motor","Estado","Precio",""].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:9,fontWeight:600,color:"#6B7280",textTransform:"uppercase",borderBottom:"1px solid #E5E7EB"}}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r,i)=>{
                      const bg=r._status==='ok'?"rgba(16,185,129,0.04)":r._status==='duplicate'?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)";
                      const ic=r._status==='ok'?"#10B981":r._status==='duplicate'?"#F59E0B":"#EF4444";
                      return(
                        <tr key={i} style={{borderBottom:"1px solid #F3F4F6",background:bg}}>
                          <td style={{padding:"5px 8px",color:"#9CA3AF"}}>{r._row}</td>
                          <td style={{padding:"5px 8px"}}>{r.branch_raw||'-'}</td>
                          <td style={{padding:"5px 8px"}}>{r.year}</td>
                          <td style={{padding:"5px 8px",fontWeight:600}}>{r.brand||'-'}</td>
                          <td style={{padding:"5px 8px"}}>{r.model||'-'}</td>
                          <td style={{padding:"5px 8px"}}>{r.color||'-'}</td>
                          <td style={{padding:"5px 8px",fontFamily:"monospace",fontSize:10}}>{r.chassis||'-'}</td>
                          <td style={{padding:"5px 8px",fontFamily:"monospace",fontSize:10}}>{r.motor_num||'-'}</td>
                          <td style={{padding:"5px 8px"}}>{r.status}</td>
                          <td style={{padding:"5px 8px"}}>{r.price?fmt(r.price):'-'}</td>
                          <td style={{padding:"5px 8px",color:ic,fontSize:10,fontWeight:600}}>
                            {r._status==='ok'?"✓ Nueva":r._status==='duplicate'?"⟳ Ya existe":r._errors?.join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <button onClick={()=>{setImportPreview(null);importFileRef.current?.click();}} style={{...S.btn2,fontSize:12}}>
                  Cambiar archivo
                </button>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setShowImport(false)} style={S.btn2}>Cancelar</button>
                  <button onClick={handleImportConfirm} disabled={importLoading||importPreview.ok===0}
                    style={{...S.btn,opacity:(importLoading||importPreview.ok===0)?0.6:1}}>
                    {importLoading?"Importando...": `Importar ${importPreview.ok} unidades nuevas`}
                  </button>
                </div>
              </div>
            </>
          )}

          {importDone&&(
            <div style={{textAlign:"center",padding:"32px 16px"}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              <h3 style={{fontSize:16,fontWeight:700,marginBottom:8}}>Importación completada</h3>
              <p style={{fontSize:13,color:"#374151",marginBottom:4}}><strong>{importDone.inserted}</strong> unidades agregadas al inventario</p>
              {importDone.skipped>0&&<p style={{fontSize:12,color:"#F59E0B"}}>{importDone.skipped} duplicadas omitidas</p>}
              <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:20}}>
                <button onClick={()=>{setImportPreview(null);setImportDone(null);importFileRef.current?.click();}} style={S.btn2}>
                  Importar otro archivo
                </button>
                <button onClick={()=>setShowImport(false)} style={S.btn}>Cerrar</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SALES, CATALOG, REPORTS, ADMIN (compact)
// ═══════════════════════════════════════════
