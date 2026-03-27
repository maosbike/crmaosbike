import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

const BLANK_NW=()=>({
  branch_id:"",year:new Date().getFullYear(),brand:"",model:"",color:"",chassis:"",motor_num:"",price:0,
  added_as_sold:false,
  sold_at:new Date().toISOString().split('T')[0],
  sold_by:"",ticket_id:"",sale_notes:"",payment_method:"",sale_type:"completa",
});
const BLANK_SELL=()=>({sold_by:"",sold_at:new Date().toISOString().split('T')[0],ticket_id:"",payment_method:"",sale_type:"completa",sale_notes:""});
const HIST_ICONS={created:"C",imported:"I",sold:"V",status_changed:"E",moved:"T",note:"N"};
const HIST_LABELS={created:"Creada",imported:"Importada",sold:"Venta",status_changed:"Cambio estado",moved:"Traslado",note:"Nota"};

export function InventoryView({inv,setInv,user,realBranches}){
  const brs=realBranches||[];
  const[brF,setBrF]=useState("");const[stF,setStF]=useState("");const[search,setSearch]=useState("");const[showAdd,setShowAdd]=useState(false);const[viewPhoto,setViewPhoto]=useState(null);const[adding,setAdding]=useState(false);
  const[nw,setNw]=useState(BLANK_NW());
  const[sellers,setSellers]=useState([]);
  const[openTickets,setOpenTickets]=useState([]);
  // Sell state
  const[showSell,setShowSell]=useState(false);
  const[sellUnit,setSellUnit]=useState(null);
  const[sellForm,setSellForm]=useState(BLANK_SELL());
  const[selling,setSelling]=useState(false);
  // History state
  const[histOpen,setHistOpen]=useState(new Set());
  const[histData,setHistData]=useState({});
  const[histLoading,setHistLoading]=useState({});
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
    if(!showAdd && !showSell)return;
    api.getSellers().then(d=>setSellers(Array.isArray(d)?d:[])).catch(()=>{});
    api.getTickets({status:'ganado,abierto',limit:200}).then(d=>setOpenTickets((d.data||[]).slice(0,200))).catch(()=>{});
  },[showAdd,showSell]);

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
  const openSell=(unit)=>{setSellUnit(unit);setSellForm(BLANK_SELL());setShowSell(true);};
  const handleSell=async e=>{
    e.preventDefault(); if(!sellUnit||!sellForm.sold_by)return;
    setSelling(true);
    try{
      await api.sellInventory(sellUnit.id,{
        sold_by:sellForm.sold_by, sold_at:sellForm.sold_at||null,
        ticket_id:sellForm.ticket_id||null, payment_method:sellForm.payment_method||null,
        sale_type:sellForm.sale_type||null, sale_notes:sellForm.sale_notes||null,
      });
      setShowSell(false); setSellUnit(null);
      // Refresh history if open
      if(histOpen.has(sellUnit.id)){
        api.getInventoryHistory(sellUnit.id).then(d=>setHistData(p=>({...p,[sellUnit.id]:d}))).catch(()=>{});
      }
      reload();
    }catch(ex){alert(ex.message||"Error al registrar venta");}
    finally{setSelling(false);}
  };
  const toggleHist=async(id)=>{
    const next=new Set(histOpen);
    if(next.has(id)){next.delete(id);}
    else{
      next.add(id);
      if(!histData[id]){
        setHistLoading(p=>({...p,[id]:true}));
        try{const d=await api.getInventoryHistory(id); setHistData(p=>({...p,[id]:d}));}
        catch(e){}
        finally{setHistLoading(p=>({...p,[id]:false}));}
      }
    }
    setHistOpen(next);
  };
  // Visual helpers
  const branchColor=(code)=>({MPN:"#3B82F6",MPS:"#10B981",MOV:"#F28100"})[code]||"#6B7280";
  const KPI_ICONS={disponible:<Ic.check size={16}/>,reservada:<Ic.clock size={16}/>,vendida:<Ic.sale size={16}/>,preinscrita:<Ic.tag size={16}/>};

  return(
    <div>

      {/* ══════════════════════════════════════
          HEADER
      ══════════════════════════════════════ */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,paddingBottom:20,borderBottom:"1px solid #E5E7EB"}}>
        <div>
          <p style={{margin:"0 0 5px",fontSize:10,fontWeight:700,color:"#9CA3AF",letterSpacing:"0.1em",textTransform:"uppercase"}}>
            Operaciones · Stock
          </p>
          <h1 style={{margin:0,fontSize:22,fontWeight:800,color:"#111827",letterSpacing:"-0.5px",lineHeight:1.1}}>
            Inventario de Unidades
          </h1>
          <div style={{display:"flex",gap:6,marginTop:8,alignItems:"center"}}>
            <span style={{fontSize:12,color:"#6B7280"}}>{inv.length} unidades</span>
            <span style={{color:"#D1D5DB"}}>·</span>
            <span style={{fontSize:12,fontWeight:600,color:"#10B981"}}>{counts.disponible} disponibles</span>
            {counts.reservada>0&&<><span style={{color:"#D1D5DB"}}>·</span><span style={{fontSize:12,fontWeight:600,color:"#F59E0B"}}>{counts.reservada} reservadas</span></>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,paddingTop:4}}>
          {isAdmin&&(
            <button onClick={()=>{setShowImport(true);setImportPreview(null);setImportDone(null);}}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:7,border:"1.5px solid #D1D5DB",background:"#FFFFFF",fontSize:12,fontWeight:500,cursor:"pointer",color:"#374151"}}>
              <Ic.upload size={13} color="#6B7280"/>Importar Excel
            </button>
          )}
          <button onClick={()=>setShowAdd(true)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"9px 20px",borderRadius:7,background:"#F28100",border:"1.5px solid #D97706",fontSize:12,fontWeight:600,cursor:"pointer",color:"#FFFFFF"}}>
            <Ic.plus size={14} color="#FFFFFF"/>Nueva Unidad
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════
          KPI — 4 métricas de estado
      ══════════════════════════════════════ */}
      <div className="grid-4col" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {Object.entries(INV_ST).map(([k,v])=>{
          const active=stF===k;
          const sub={disponible:"En stock, listos para venta",reservada:"Con reserva activa",vendida:"Ventas registradas",preinscrita:"Proceso de pre-inscripción"}[k];
          return(
            <div key={k} onClick={()=>setStF(stF===k?"":k)}
              style={{
                background:"#FFFFFF",borderRadius:10,padding:"18px 20px",cursor:"pointer",
                borderTop:`3px solid ${v.c}`,
                border:`1px solid ${active?v.c+"99":"#E5E7EB"}`,
                boxShadow:active?`0 0 0 3px ${v.c}18,0 4px 12px rgba(0,0,0,0.06)`:"0 1px 4px rgba(0,0,0,0.04)",
                transition:"all 0.15s",position:"relative",overflow:"hidden",
              }}>
              <div style={{fontSize:32,fontWeight:900,color:active?v.c:"#111827",lineHeight:1,letterSpacing:"-1.5px",marginBottom:5}}>{counts[k]}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:3}}>{v.l}</div>
              <div style={{fontSize:10,color:"#9CA3AF",lineHeight:1.4}}>{sub}</div>
              {active&&<div style={{position:"absolute",top:12,right:12,width:7,height:7,borderRadius:"50%",background:v.c}}/>}
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════
          BARRA DE BÚSQUEDA Y FILTROS
      ══════════════════════════════════════ */}
      <div style={{display:"flex",gap:8,marginBottom:16,background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px 12px",alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:"1 1 220px",minWidth:160}}>
          <Ic.search size={13} color="#9CA3AF" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar marca, modelo, chasis, color..."
            style={{...S.inp,paddingLeft:32,width:"100%",borderRadius:7,fontSize:12,height:34}}/>
        </div>
        <select value={brF} onChange={e=>setBrF(e.target.value)}
          style={{...S.inp,borderRadius:7,fontSize:12,height:34,minWidth:155,background:"#FFFFFF"}}>
          <option value="">Todas las sucursales</option>
          {brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {(search||brF||stF)&&(
          <button onClick={()=>{setSearch("");setBrF("");setStF("");}}
            style={{padding:"0 12px",height:34,borderRadius:7,border:"1.5px solid #D1D5DB",background:"#FFFFFF",fontSize:11,cursor:"pointer",color:"#6B7280",display:"flex",alignItems:"center",gap:5,fontWeight:500}}>
            <Ic.x size={11}/>Limpiar filtros
          </button>
        )}
        {f.length!==inv.length&&(
          <span style={{fontSize:11,color:"#9CA3AF",marginLeft:"auto",whiteSpace:"nowrap"}}>
            {f.length} de {inv.length} unidades
          </span>
        )}
      </div>

      {/* ══════════════════════════════════════
          TABLA
      ══════════════════════════════════════ */}
      <div style={{background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:12,overflow:"auto",boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:920}}>
          <thead>
            <tr style={{background:"#F4F5F7",borderBottom:"1.5px solid #E2E4E9"}}>
              {[
                {l:"Sucursal",  w:80},
                {l:"Año",       w:50},
                {l:"Unidad",    w:"auto"},
                {l:"Color",     w:100},
                {l:"N° Chasis", w:156},
                {l:"N° Motor",  w:130},
                {l:"Estado",    w:136},
                {l:"Precio",    w:108},
                {l:"Acciones",  w:170},
              ].map(h=>(
                <th key={h.l} style={{textAlign:"left",padding:"12px 16px",fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",whiteSpace:"nowrap",width:h.w}}>{h.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.length===0&&(
              <tr><td colSpan={9} style={{padding:"60px 0",textAlign:"center"}}>
                <div style={{color:"#9CA3AF",fontSize:13,fontWeight:500}}>{search||brF||stF?"Sin resultados para los filtros aplicados.":"No hay unidades registradas en el inventario."}</div>
                {!search&&!brF&&!stF&&<div style={{fontSize:11,color:"#C4C9D4",marginTop:6}}>Podés agregar unidades manualmente o importar desde Excel.</div>}
              </td></tr>
            )}
            {f.map(x=>{
              const isSold=x.status==='vendida';
              const stColor=INV_ST[x.status]?.c||"#6B7280";
              const bCode=x.branch_code||brs.find(b=>b.id===x.branch_id)?.code||"";
              const bColor=branchColor(bCode);
              const isHistOpen=histOpen.has(x.id);
              return(
                <React.Fragment key={x.id}>
                <tr
                  style={{borderBottom:isHistOpen?"none":"1px solid #EBEBEB",transition:"background 0.1s",opacity:isSold?0.68:1}}
                  onMouseEnter={e=>e.currentTarget.style.background="#FAFBFF"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>

                  {/* ── Sucursal ── */}
                  <td style={{padding:"13px 16px"}}>
                    {bCode
                      ?<span style={{display:"inline-block",padding:"3px 10px",borderRadius:5,background:`${bColor}14`,color:bColor,fontSize:10,fontWeight:800,letterSpacing:"0.05em",border:`1px solid ${bColor}28`}}>
                        {bCode}
                      </span>
                      :<span style={{color:"#D1D5DB"}}>—</span>}
                  </td>

                  {/* ── Año ── */}
                  <td style={{padding:"13px 16px",color:"#6B7280",fontSize:11,fontWeight:500}}>{x.year||"—"}</td>

                  {/* ── Unidad: Marca + Modelo ── */}
                  <td style={{padding:"13px 16px"}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#111827",letterSpacing:"-0.2px"}}>{x.brand}</div>
                    <div style={{fontSize:11,color:"#6B7280",marginTop:2,fontWeight:400}}>{x.model}</div>
                  </td>

                  {/* ── Color ── */}
                  <td style={{padding:"13px 16px"}}>
                    <span style={{fontSize:11,color:"#374151"}}>{x.color||<span style={{color:"#D1D5DB"}}>—</span>}</span>
                  </td>

                  {/* ── Chasis + foto ── */}
                  <td style={{padding:"13px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontFamily:"'Courier New',monospace",fontSize:10,color:"#374151",letterSpacing:"0.05em",fontWeight:600}}>{x.chassis}</span>
                      {x.chassis_photo
                        ?<img src={x.chassis_photo} onClick={()=>setViewPhoto({src:x.chassis_photo,title:`Chasis ${x.chassis}`})} style={{width:24,height:24,borderRadius:4,objectFit:"cover",cursor:"pointer",border:"1px solid #E5E7EB",flexShrink:0}}/>
                        :<button onClick={()=>handlePhoto(x.id,"chassis_photo")} title="Agregar foto de chasis" style={{width:20,height:20,borderRadius:4,border:"1px dashed #C4C9D4",background:"transparent",cursor:"pointer",fontSize:9,color:"#9CA3AF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700}}>+</button>}
                    </div>
                  </td>

                  {/* ── Motor + foto ── */}
                  <td style={{padding:"13px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontFamily:"'Courier New',monospace",fontSize:10,color:"#6B7280"}}>{x.motor_num||<span style={{color:"#D1D5DB"}}>—</span>}</span>
                      {x.motor_photo
                        ?<img src={x.motor_photo} onClick={()=>setViewPhoto({src:x.motor_photo,title:`Motor ${x.motor_num}`})} style={{width:24,height:24,borderRadius:4,objectFit:"cover",cursor:"pointer",border:"1px solid #E5E7EB",flexShrink:0}}/>
                        :x.motor_num?<button onClick={()=>handlePhoto(x.id,"motor_photo")} title="Agregar foto de motor" style={{width:20,height:20,borderRadius:4,border:"1px dashed #C4C9D4",background:"transparent",cursor:"pointer",fontSize:9,color:"#9CA3AF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700}}>+</button>:null}
                    </div>
                  </td>

                  {/* ── Estado ── */}
                  <td style={{padding:"13px 16px"}}>
                    {isSold?(
                      <div>
                        <div style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,background:"rgba(139,92,246,0.08)",border:"1px solid rgba(139,92,246,0.22)"}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:"#8B5CF6",flexShrink:0}}/>
                          <span style={{fontSize:11,fontWeight:700,color:"#7C3AED",letterSpacing:"0.01em"}}>Vendida</span>
                        </div>
                        {x.sold_at&&<div style={{fontSize:9,color:"#9CA3AF",marginTop:4}}>{fD(x.sold_at)}</div>}
                      </div>
                    ):(
                      <div style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 9px",borderRadius:6,background:`${stColor}0f`,border:`1px solid ${stColor}35`}}>
                        <span style={{width:5,height:5,borderRadius:"50%",background:stColor,flexShrink:0}}/>
                        <select value={x.status} onChange={e=>handleStatus(x.id,e.target.value)}
                          style={{background:"transparent",border:"none",fontSize:11,fontWeight:700,color:stColor,cursor:"pointer",padding:0,outline:"none",fontFamily:"inherit"}}>
                          {Object.entries(INV_ST).filter(([k])=>k!=='vendida').map(([k,v])=>(
                            <option key={k} value={k}>{v.l}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>

                  {/* ── Precio ── */}
                  <td style={{padding:"13px 16px",whiteSpace:"nowrap"}}>
                    {x.price>0
                      ?<span style={{fontWeight:700,fontSize:13,color:"#111827",letterSpacing:"-0.3px"}}>{fmt(x.price)}</span>
                      :<span style={{color:"#D1D5DB",fontSize:12}}>—</span>}
                  </td>

                  {/* ── Acciones ── */}
                  <td style={{padding:"10px 16px"}}>
                    {!isSold?(
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {/* Acción primaria */}
                        <button onClick={()=>openSell(x)}
                          style={{padding:"6px 12px",borderRadius:6,border:"1.5px solid #059669",background:"#10B981",color:"#FFFFFF",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.01em",textAlign:"center"}}>
                          Registrar venta
                        </button>
                        {/* Acciones secundarias */}
                        <div style={{display:"flex",gap:5}}>
                          <button onClick={()=>toggleHist(x.id)}
                            style={{flex:1,padding:"5px 8px",borderRadius:6,border:`1.5px solid ${isHistOpen?"#6366F1":"#D1D5DB"}`,background:isHistOpen?"#EEF2FF":"#FFFFFF",color:isHistOpen?"#6366F1":"#6B7280",fontSize:10,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>
                            {histLoading[x.id]?"...":"Historial"}
                          </button>
                          {brs.filter(b=>b.id!==x.branch_id).length>0&&(
                            <select defaultValue="" onChange={e=>{if(e.target.value){handleMove(x.id,e.target.value);}e.target.value="";}}
                              style={{...S.inp,padding:"5px 6px",fontSize:10,flex:1,borderRadius:6,height:"auto",border:"1.5px solid #D1D5DB",background:"#FFFFFF",color:"#6B7280",cursor:"pointer"}}>
                              <option value="" disabled>Mover</option>
                              {brs.filter(b=>b.id!==x.branch_id).map(b=><option key={b.id} value={b.id}>{b.code}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    ):(
                      <button onClick={()=>toggleHist(x.id)}
                        style={{padding:"6px 12px",borderRadius:6,border:`1.5px solid ${isHistOpen?"#6366F1":"#D1D5DB"}`,background:isHistOpen?"#EEF2FF":"#FFFFFF",color:isHistOpen?"#6366F1":"#6B7280",fontSize:11,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap",width:"100%"}}>
                        {histLoading[x.id]?"Cargando...":"Ver historial"}
                      </button>
                    )}
                  </td>
                </tr>

                {/* ── HISTORIAL EXPANDIBLE ── */}
                {isHistOpen&&(
                  <tr style={{borderBottom:"1px solid #E8E4F3",background:"#F8F7FF"}}>
                    <td colSpan={9} style={{padding:"16px 20px 18px"}}>

                      {/* Header del historial */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:"#6366F1",letterSpacing:"0.02em"}}>
                            Trazabilidad de la unidad
                          </div>
                          <div style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>
                            {x.brand} {x.model} · Chasis <span style={{fontFamily:"monospace",fontWeight:600,color:"#6B7280"}}>{x.chassis}</span>
                          </div>
                        </div>
                        <button onClick={()=>toggleHist(x.id)}
                          style={{padding:"4px 10px",borderRadius:6,border:"1px solid #D1D5DB",background:"transparent",fontSize:10,cursor:"pointer",color:"#6B7280"}}>
                          Cerrar
                        </button>
                      </div>

                      {histLoading[x.id]&&(
                        <div style={{color:"#9CA3AF",fontSize:11,padding:"12px 0"}}>Cargando historial...</div>
                      )}
                      {!histLoading[x.id]&&(!histData[x.id]||histData[x.id].length===0)&&(
                        <div style={{color:"#9CA3AF",fontSize:11,padding:"12px 0"}}>Sin registros de historial para esta unidad.</div>
                      )}
                      {!histLoading[x.id]&&histData[x.id]?.length>0&&(
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:8,maxWidth:900}}>
                          {histData[x.id].map(h=>{
                            const uName=h.user_fn?`${h.user_fn} ${h.user_ln||''}`.trim():'Sistema';
                            const isSaleEvent=h.event_type==='sold';
                            return(
                              <div key={h.id} style={{display:"flex",gap:10,padding:"10px 12px",background:"#FFFFFF",borderRadius:8,border:`1px solid ${isSaleEvent?"#C4B5FD":"#E2E0F5"}`,borderLeft:`3px solid ${isSaleEvent?"#8B5CF6":"#6366F1"}`}}>
                                <div style={{flexShrink:0,marginTop:1,width:22,height:22,borderRadius:5,background:isSaleEvent?"rgba(139,92,246,0.12)":"rgba(99,102,241,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:isSaleEvent?"#8B5CF6":"#6366F1",letterSpacing:0,border:`1px solid ${isSaleEvent?"rgba(139,92,246,0.2)":"rgba(99,102,241,0.15)"}`}}>
                                  {HIST_ICONS[h.event_type]||"·"}
                                </div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:2}}>
                                    <span style={{fontWeight:700,fontSize:11,color:isSaleEvent?"#7C3AED":"#374151"}}>{HIST_LABELS[h.event_type]||h.event_type}</span>
                                    {h.from_status&&h.to_status&&(
                                      <span style={{fontSize:9,color:"#6B7280",background:"#F3F4F6",padding:"1px 6px",borderRadius:4,border:"1px solid #E5E7EB"}}>
                                        {INV_ST[h.from_status]?.l||h.from_status} → {INV_ST[h.to_status]?.l||h.to_status}
                                      </span>
                                    )}
                                    <span style={{fontSize:9,color:"#9CA3AF",marginLeft:"auto",flexShrink:0}}>{fDT(h.created_at)}</span>
                                  </div>
                                  {h.note&&<div style={{fontSize:10,color:"#4B5563",marginBottom:3,lineHeight:1.4}}>{h.note}</div>}
                                  <div style={{fontSize:9,color:"#9CA3AF"}}>por <strong style={{color:"#6B7280",fontWeight:600}}>{uName}</strong></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
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
                {nw.added_as_sold&&<span style={{color:"#EF4444",fontWeight:600}}>Se creará como vendida — no aparecerá en stock disponible</span>}
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

      {/* ── SELL MODAL ───────────────────────────────────── */}
      {showSell&&sellUnit&&(()=>{
        const bName=brs.find(b=>b.id===sellUnit.branch_id)?.name||"—";
        return(
        <Modal onClose={()=>{setShowSell(false);setSellUnit(null);}} title="Registrar venta" wide>
          <form onSubmit={handleSell}>

            {/* ── Ficha de la unidad ── */}
            <div style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,padding:"12px 16px",marginBottom:18}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Unidad a vender</div>
              <div style={{display:"flex",gap:20,flexWrap:"wrap",fontSize:12}}>
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:"#111827"}}>{sellUnit.brand} {sellUnit.model}</div>
                  <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>Color: {sellUnit.color} · Año {sellUnit.year}</div>
                </div>
                <div style={{fontSize:11,color:"#374151"}}>
                  <div><span style={{color:"#9CA3AF"}}>Chasis:</span> <code style={{fontFamily:"monospace"}}>{sellUnit.chassis}</code></div>
                  {sellUnit.motor_num&&<div><span style={{color:"#9CA3AF"}}>Motor:</span> <code style={{fontFamily:"monospace"}}>{sellUnit.motor_num}</code></div>}
                </div>
                <div style={{fontSize:11,color:"#374151"}}>
                  <div><span style={{color:"#9CA3AF"}}>Sucursal:</span> <strong>{bName}</strong></div>
                  {sellUnit.price>0&&<div><span style={{color:"#9CA3AF"}}>Precio:</span> <strong>{fmt(sellUnit.price)}</strong></div>}
                </div>
              </div>
            </div>

            {/* ── Datos de la venta ── */}
            <div style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>Datos de la venta</div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <Field label="Vendedor responsable *" value={sellForm.sold_by} onChange={v=>setSellForm(p=>({...p,sold_by:v}))}
                opts={[{v:"",l:"Seleccionar vendedor..."},...sellers.map(s=>({v:s.id,l:`${s.first_name||''} ${s.last_name||''}`.trim()}))]} req/>
              <Field label="Fecha de venta *" value={sellForm.sold_at} onChange={v=>setSellForm(p=>({...p,sold_at:v}))} type="date"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <Field label="Estado de la documentación" value={sellForm.sale_type} onChange={v=>setSellForm(p=>({...p,sale_type:v}))}
                opts={[{v:"completa",l:"Documentación completa"},{v:"inscripcion",l:"Solo inscripción pendiente"},{v:"entregada",l:"Entregada al cliente"}]}/>
              <Field label="Método de pago / Financiamiento" value={sellForm.payment_method} onChange={v=>setSellForm(p=>({...p,payment_method:v}))}
                opts={[{v:"",l:"Seleccionar..."},{v:"Contado",l:"Contado"},{v:"Transferencia",l:"Transferencia bancaria"},{v:"Tarjeta Débito",l:"Tarjeta Débito"},{v:"Tarjeta Crédito",l:"Tarjeta Crédito"},{v:"Crédito Autofin",l:"Crédito Autofin"},{v:"Mixto",l:"Mixto"}]}/>
            </div>
            <div style={{marginBottom:12}}>
              <Field label="Lead / Ticket asociado (opcional)" value={sellForm.ticket_id} onChange={v=>setSellForm(p=>({...p,ticket_id:v}))}
                opts={[{v:"",l:"Sin lead asociado"},...openTickets.map(t=>({v:t.id,l:`${t.ticket_num?t.ticket_num+' · ':''}${[t.first_name,t.last_name].filter(Boolean).join(' ')||'Sin nombre'}`}))]}/>
            </div>
            <div style={{marginBottom:20}}>
              <Field label="Observaciones" value={sellForm.sale_notes} onChange={v=>setSellForm(p=>({...p,sale_notes:v}))} rows={2} ph="Ej: Entrega pactada para el lunes, documentación en proceso..."/>
            </div>

            {/* ── Aviso ── */}
            <div style={{background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.18)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:11,color:"#065f46"}}>
              Al confirmar, la unidad saldrá del stock disponible y quedará registrada como vendida con trazabilidad completa.
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{fontSize:11,color:"#9CA3AF"}}>* Campos obligatorios</div>
              <div style={{display:"flex",gap:8}}>
                <button type="button" onClick={()=>{setShowSell(false);setSellUnit(null);}} style={S.btn2}>Cancelar</button>
                <button type="submit" disabled={selling||!sellForm.sold_by||!sellForm.sold_at}
                  style={{...S.btn,background:"#10B981",opacity:(selling||!sellForm.sold_by||!sellForm.sold_at)?0.6:1,padding:"8px 20px"}}>
                  {selling?"Registrando...":"Confirmar venta"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
        );
      })()}

      {/* ── IMPORT MODAL ─────────────────────────────────── */}
      {showImport&&(
        <Modal onClose={()=>setShowImport(false)} title="Importar inventario desde Excel" wide>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={handleImportFile}/>

          {!importPreview&&!importDone&&(
            <div style={{textAlign:"center",padding:"32px 16px"}}>
              <div style={{width:48,height:48,borderRadius:10,background:"#F3F4F6",border:"1px solid #E5E7EB",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:11,fontWeight:700,color:"#6B7280",letterSpacing:"0.04em"}}>XLS</div>
              <p style={{fontSize:13,color:"#374151",marginBottom:6}}>Seleccioná tu plantilla de inventario Excel (.xlsx)</p>
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
                  {l:"Nuevas",       v:importPreview.ok,         c:"#10B981"},
                  {l:"Duplicados",   v:importPreview.duplicates, c:"#F59E0B"},
                  {l:"Errores",      v:importPreview.errors,     c:"#EF4444"},
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
                            {r._status==='ok'?"Nueva":r._status==='duplicate'?"Ya existe":r._errors?.join(', ')}
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
              <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(16,185,129,0.1)",border:"1.5px solid rgba(16,185,129,0.25)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:11,fontWeight:700,color:"#10B981"}}>OK</div>
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
