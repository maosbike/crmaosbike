import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

// ─── Constantes de diseño ─────────────────────────────────────────────────────

const BLANK_NW=()=>({
  branch_id:"",year:new Date().getFullYear(),brand:"",model:"",color:"",chassis:"",motor_num:"",price:0,
  added_as_sold:false,
  sold_at:new Date().toISOString().split('T')[0],
  sold_by:"",ticket_id:"",sale_notes:"",payment_method:"",sale_type:"completa",
});
const BLANK_SELL=()=>({sold_by:"",sold_at:new Date().toISOString().split('T')[0],ticket_id:"",payment_method:"",sale_type:"completa",sale_notes:""});
const HIST_ICONS={created:"C",imported:"I",sold:"V",status_changed:"E",moved:"T",note:"N"};
const HIST_LABELS={created:"Creada",imported:"Importada",sold:"Venta",status_changed:"Cambio estado",moved:"Traslado",note:"Nota"};

// Mapa fijo de sucursal → color de marca
const BRANCH_CFG = {
  MPN: { color: '#3B82F6', label: 'Norte'  },
  MPS: { color: '#10B981', label: 'Sur'    },
  MOV: { color: '#F28100', label: 'Ovalle' },
};

// Estado → configuración visual
const ST_CFG = {
  disponible:  { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', dot: '#22C55E', label: 'Disponible'  },
  reservada:   { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B', label: 'Reservada'   },
  vendida:     { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', dot: '#8B5CF6', label: 'Vendida'     },
  preinscrita: { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', dot: '#06B6D4', label: 'Preinscrita' },
};

// Intento de mapeo color-texto → CSS color para el dot visual
const COLOR_MAP = {
  negro:'#111827',blanco:'#F9FAFB',rojo:'#EF4444',azul:'#3B82F6',verde:'#16A34A',
  gris:'#9CA3AF','gris oscuro':'#374151',naranja:'#F28100',amarillo:'#F59E0B',
  plateado:'#C8CDD6',plata:'#C8CDD6',perla:'#EDE8DC',bordo:'#881337',vino:'#881337',
  celeste:'#38BDF8',fucsia:'#EC4899',violeta:'#8B5CF6','blanco perla':'#EDE8DC',
};
const colorDot = c => COLOR_MAP[(c||'').toLowerCase().trim()] || null;

// ─── Componente principal ─────────────────────────────────────────────────────

export function InventoryView({inv,setInv,user,realBranches}){
  const brs=realBranches||[];
  const[brF,setBrF]=useState("");
  const[stF,setStF]=useState("");
  const[brandF,setBrandF]=useState("");    // ← filtro marca (nuevo)
  const[search,setSearch]=useState("");
  const[showAdd,setShowAdd]=useState(false);
  const[viewPhoto,setViewPhoto]=useState(null);
  const[adding,setAdding]=useState(false);
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

  // Marcas únicas del inventario para el filtro
  const brands = [...new Set(inv.map(x=>x.brand).filter(Boolean))].sort();

  const f=inv.filter(x=>{
    if(brF && x.branch_id!==brF)return false;
    if(stF && x.status!==stF)return false;
    if(brandF && x.brand!==brandF)return false;
    if(search && !`${x.brand} ${x.model} ${x.chassis} ${x.color}`.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
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
          sold_at:nw.sold_at||null,sold_by:nw.sold_by||null,
          ticket_id:nw.ticket_id||null,sale_notes:nw.sale_notes||null,
          payment_method:nw.payment_method||null,sale_type:nw.sale_type||null,
        }:{})
      });
      setShowAdd(false);setNw(BLANK_NW());reload();
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
    const file=e.target.files[0];if(!file)return;
    setImportLoading(true);setImportPreview(null);setImportDone(null);
    try{const d=await api.importInventoryPreview(file);setImportPreview(d);}
    catch(ex){alert(ex.message||'Error al leer archivo');}
    finally{setImportLoading(false);if(importFileRef.current)importFileRef.current.value='';}
  };
  const handleImportConfirm=async()=>{
    if(!importPreview)return;
    const okRows=importPreview.rows.filter(r=>r._status==='ok');
    if(!okRows.length)return;
    setImportLoading(true);
    try{
      const r=await api.importInventoryConfirm(okRows);
      setImportDone(r);setImportPreview(null);reload();
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
    e.preventDefault();if(!sellUnit||!sellForm.sold_by)return;
    setSelling(true);
    try{
      await api.sellInventory(sellUnit.id,{
        sold_by:sellForm.sold_by,sold_at:sellForm.sold_at||null,
        ticket_id:sellForm.ticket_id||null,payment_method:sellForm.payment_method||null,
        sale_type:sellForm.sale_type||null,sale_notes:sellForm.sale_notes||null,
      });
      setShowSell(false);setSellUnit(null);
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
        try{const d=await api.getInventoryHistory(id);setHistData(p=>({...p,[id]:d}));}
        catch(e){}
        finally{setHistLoading(p=>({...p,[id]:false}));}
      }
    }
    setHistOpen(next);
  };

  const hasFilters = search||brF||stF||brandF;
  const clearFilters = ()=>{setSearch("");setBrF("");setStF("");setBrandF("");};

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return(
    <div style={{maxWidth:1400}}>

      {/* ══════════════════════════════════════════════
          ENCABEZADO
      ══════════════════════════════════════════════ */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <p style={{margin:"0 0 4px",fontSize:11,fontWeight:700,color:"#9CA3AF",letterSpacing:"0.1em",textTransform:"uppercase"}}>
            Operaciones · Stock
          </p>
          <h1 style={{margin:0,fontSize:24,fontWeight:800,color:"#111827",letterSpacing:"-0.6px",lineHeight:1}}>
            Inventario
          </h1>
          <p style={{margin:"6px 0 0",fontSize:12,color:"#6B7280"}}>
            {inv.length} unidades · {counts.disponible || 0} disponibles
            {counts.reservada>0&&<> · <span style={{color:"#D97706",fontWeight:600}}>{counts.reservada} reservadas</span></>}
          </p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {isAdmin&&(
            <button
              onClick={()=>{setShowImport(true);setImportPreview(null);setImportDone(null);}}
              style={{...btnSecondary,display:"flex",alignItems:"center",gap:6}}>
              <Ic.upload size={13} color="#6B7280"/>Importar Excel
            </button>
          )}
          <button
            onClick={()=>setShowAdd(true)}
            style={{...btnPrimary,display:"flex",alignItems:"center",gap:6,padding:"9px 18px"}}>
            <Ic.plus size={14} color="#fff"/>Nueva Unidad
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          KPI — 4 tarjetas de estado
      ══════════════════════════════════════════════ */}
      <div className="grid-4col" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {Object.entries(ST_CFG).map(([k,v])=>{
          const active = stF===k;
          const sub = {
            disponible:"Listas para venta",
            reservada:"Con reserva activa",
            vendida:"Ventas registradas",
            preinscrita:"En pre-inscripción",
          }[k];
          return(
            <button key={k} onClick={()=>setStF(stF===k?"":k)}
              style={{
                background:"#FFFFFF",borderRadius:12,padding:"16px 18px",
                cursor:"pointer",textAlign:"left",fontFamily:"inherit",
                border:`1.5px solid ${active ? v.color+'55' : '#E5E7EB'}`,
                borderLeft:`4px solid ${v.color}`,
                boxShadow: active ? `0 0 0 3px ${v.color}18` : "0 1px 4px rgba(0,0,0,0.04)",
                transition:"all 0.15s",position:"relative",
              }}>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:3}}>
                <span style={{fontSize:28,fontWeight:900,color: active ? v.color : "#111827",letterSpacing:"-1.5px",lineHeight:1}}>
                  {counts[k]||0}
                </span>
                {active&&<span style={{width:6,height:6,borderRadius:"50%",background:v.color,flexShrink:0,marginBottom:4}}/>}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:2}}>{v.label}</div>
              <div style={{fontSize:10,color:"#9CA3AF",lineHeight:1.3}}>{sub}</div>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════
          BARRA DE BÚSQUEDA Y FILTROS
      ══════════════════════════════════════════════ */}
      <div style={{
        display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center",
        background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:10,
        padding:"10px 14px",
      }}>

        {/* Búsqueda general */}
        <div style={{position:"relative",flex:"1 1 200px",minWidth:160}}>
          <Ic.search size={13} color="#9CA3AF" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar marca, modelo, chasis, color..."
            style={{...S.inp,paddingLeft:32,width:"100%",borderRadius:7,fontSize:12,height:34}}
          />
        </div>

        <div style={{width:1,background:"#E5E7EB",alignSelf:"stretch",flexShrink:0}}/>

        {/* Filtro sucursal */}
        <select value={brF} onChange={e=>setBrF(e.target.value)}
          style={{...filterSelect}}>
          <option value="">Todas las sucursales</option>
          {brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {/* Filtro marca */}
        <select value={brandF} onChange={e=>setBrandF(e.target.value)}
          style={{...filterSelect}}>
          <option value="">Todas las marcas</option>
          {brands.map(b=><option key={b} value={b}>{b}</option>)}
        </select>

        {/* Filtro estado — botones compactos */}
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {Object.entries(ST_CFG).map(([k,v])=>(
            <button key={k} onClick={()=>setStF(stF===k?"":k)}
              style={{
                padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                fontFamily:"inherit",border:`1px solid ${stF===k?v.color+'80':'#E5E7EB'}`,
                background: stF===k ? v.bg : "transparent",
                color: stF===k ? v.color : "#6B7280",
                transition:"all 0.12s",
              }}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Limpiar filtros */}
        {hasFilters&&(
          <>
            <div style={{width:1,background:"#E5E7EB",alignSelf:"stretch",flexShrink:0}}/>
            <button onClick={clearFilters}
              style={{padding:"5px 10px",height:34,borderRadius:7,border:"1px solid #E5E7EB",background:"#FFFFFF",fontSize:11,cursor:"pointer",color:"#6B7280",display:"flex",alignItems:"center",gap:4,fontWeight:500,flexShrink:0}}>
              <Ic.x size={10}/>Limpiar
            </button>
          </>
        )}

        {/* Contador de resultados */}
        {hasFilters&&(
          <span style={{fontSize:11,color:"#9CA3AF",whiteSpace:"nowrap",marginLeft:"auto",flexShrink:0}}>
            {f.length} de {inv.length}
          </span>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          TABLA
      ══════════════════════════════════════════════ */}
      <div style={{background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:12,overflow:"auto",boxShadow:"0 1px 8px rgba(0,0,0,0.04)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
          <thead>
            <tr style={{background:"#F8F9FB",borderBottom:"1.5px solid #E5E7EB"}}>
              {[
                {l:"Sucursal",  w:110 },
                {l:"Unidad",    w:"auto"},
                {l:"Color",     w:110 },
                {l:"Chasis",    w:180 },
                {l:"Motor",     w:120 },
                {l:"Estado",    w:150 },
                {l:"Precio",    w:110 },
                {l:"Acciones",  w:190 },
              ].map(h=>(
                <th key={h.l} style={{
                  textAlign:"left",padding:"11px 16px",
                  fontSize:10,fontWeight:700,color:"#6B7280",
                  textTransform:"uppercase",letterSpacing:"0.07em",
                  whiteSpace:"nowrap",width:h.w,
                }}>{h.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>

            {/* Empty state */}
            {f.length===0&&(
              <tr><td colSpan={8} style={{padding:"56px 0",textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:12}}>📦</div>
                <div style={{color:"#374151",fontSize:13,fontWeight:600,marginBottom:4}}>
                  {hasFilters?"Sin resultados para los filtros aplicados":"Sin unidades en el inventario"}
                </div>
                <div style={{fontSize:11,color:"#9CA3AF"}}>
                  {hasFilters
                    ?<button onClick={clearFilters} style={{...linkBtn}}>Limpiar filtros</button>
                    :"Podés agregar unidades manualmente o importar desde Excel."}
                </div>
              </td></tr>
            )}

            {f.map(x=>{
              const isSold    = x.status==='vendida';
              const stCfg     = ST_CFG[x.status] || ST_CFG.disponible;
              const bCode     = x.branch_code || brs.find(b=>b.id===x.branch_id)?.code || "";
              const bCfg      = BRANCH_CFG[bCode];
              const isHistOpen= histOpen.has(x.id);
              const dot       = colorDot(x.color);

              return(
                <React.Fragment key={x.id}>
                <tr
                  style={{
                    borderBottom: isHistOpen ? "none" : "1px solid #F0F1F3",
                    transition:"background 0.08s",
                    opacity: x.status==='vendida' ? 0.72 : 1,
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background="#FAFBFF"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                >

                  {/* ── SUCURSAL ─────────────────────────── */}
                  <td style={{padding:"12px 16px"}}>
                    {bCode ? (
                      <div style={{display:"inline-flex",flexDirection:"column",gap:3,alignItems:"flex-start"}}>
                        <span style={{
                          display:"inline-block",padding:"3px 10px",borderRadius:6,
                          background: bCfg ? bCfg.color : "#6B7280",
                          color:"#FFFFFF",fontSize:11,fontWeight:800,
                          letterSpacing:"0.06em",lineHeight:1.4,
                        }}>{bCode}</span>
                        {bCfg&&<span style={{fontSize:9,color:"#9CA3AF",letterSpacing:"0.03em"}}>{bCfg.label}</span>}
                      </div>
                    ):<span style={{color:"#D1D5DB",fontSize:12}}>—</span>}
                  </td>

                  {/* ── UNIDAD (marca + modelo + año) ───── */}
                  <td style={{padding:"12px 16px"}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#111827",letterSpacing:"-0.2px",lineHeight:1.2}}>
                      {x.brand}
                    </div>
                    <div style={{fontSize:11,color:"#374151",marginTop:2,fontWeight:500}}>{x.model}</div>
                    {x.year&&<div style={{fontSize:10,color:"#9CA3AF",marginTop:1,fontWeight:500}}>{x.year}</div>}
                  </td>

                  {/* ── COLOR ────────────────────────────── */}
                  <td style={{padding:"12px 16px"}}>
                    {x.color ? (
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{
                          width:10,height:10,borderRadius:"50%",flexShrink:0,
                          background: dot || "#E5E7EB",
                          border: dot ? "none" : "1px solid #D1D5DB",
                          boxShadow: dot && dot!=='#F9FAFB' ? `0 0 0 1px rgba(0,0,0,0.1)` : "0 0 0 1px #D1D5DB",
                        }}/>
                        <span style={{fontSize:11,color:"#374151",fontWeight:500}}>{x.color}</span>
                      </div>
                    ):<span style={{color:"#D1D5DB"}}>—</span>}
                  </td>

                  {/* ── CHASIS ───────────────────────────── */}
                  <td style={{padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      {/* Tag estilo identificador */}
                      <div style={{
                        display:"inline-flex",alignItems:"center",
                        padding:"3px 9px",borderRadius:5,
                        background:"#F4F5F7",border:"1px solid #E2E4E9",
                        fontFamily:"'SF Mono','Fira Code','Fira Mono','Roboto Mono',Consolas,monospace",
                        fontSize:11,letterSpacing:"0.06em",fontWeight:600,
                        color:"#374151",whiteSpace:"nowrap",
                      }}>
                        {x.chassis}
                      </div>
                      {/* Foto chasis */}
                      {x.chassis_photo
                        ?<img
                          src={x.chassis_photo}
                          onClick={()=>setViewPhoto({src:x.chassis_photo,title:`Chasis ${x.chassis}`})}
                          style={{width:26,height:26,borderRadius:5,objectFit:"cover",cursor:"pointer",border:"1.5px solid #E5E7EB",flexShrink:0,transition:"border-color 0.1s"}}
                          title="Ver foto de chasis"
                        />
                        :<button
                          onClick={()=>handlePhoto(x.id,"chassis_photo")}
                          title="Agregar foto de chasis"
                          style={{
                            width:22,height:22,borderRadius:5,
                            border:"1.5px dashed #CBD5E1",background:"transparent",
                            cursor:"pointer",fontSize:11,color:"#94A3B8",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            flexShrink:0,fontWeight:700,padding:0,
                          }}>+</button>}
                    </div>
                  </td>

                  {/* ── MOTOR ────────────────────────────── */}
                  <td style={{padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {x.motor_num
                        ?<span style={{
                          fontFamily:"'SF Mono','Fira Code','Fira Mono','Roboto Mono',Consolas,monospace",
                          fontSize:10,color:"#6B7280",letterSpacing:"0.04em",fontWeight:500,
                        }}>{x.motor_num}</span>
                        :<span style={{color:"#D1D5DB",fontSize:11}}>—</span>}
                      {x.motor_num&&(x.motor_photo
                        ?<img
                          src={x.motor_photo}
                          onClick={()=>setViewPhoto({src:x.motor_photo,title:`Motor ${x.motor_num}`})}
                          style={{width:22,height:22,borderRadius:4,objectFit:"cover",cursor:"pointer",border:"1.5px solid #E5E7EB",flexShrink:0}}
                        />
                        :<button onClick={()=>handlePhoto(x.id,"motor_photo")} title="Agregar foto de motor"
                          style={{width:20,height:20,borderRadius:4,border:"1.5px dashed #CBD5E1",background:"transparent",cursor:"pointer",fontSize:10,color:"#94A3B8",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>+</button>)}
                    </div>
                  </td>

                  {/* ── ESTADO ───────────────────────────── */}
                  <td style={{padding:"12px 16px"}}>
                    {x.status==='vendida' ? (
                      <div>
                        <div style={{
                          display:"inline-flex",alignItems:"center",gap:5,
                          padding:"4px 10px",borderRadius:20,
                          background: ST_CFG.vendida.bg,
                          border:`1px solid ${ST_CFG.vendida.border}`,
                        }}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:ST_CFG.vendida.dot,flexShrink:0}}/>
                          <span style={{fontSize:11,fontWeight:700,color:ST_CFG.vendida.color}}>Vendida</span>
                        </div>
                        {x.sold_at&&<div style={{fontSize:9,color:"#9CA3AF",marginTop:4,paddingLeft:2}}>{fD(x.sold_at)}</div>}
                      </div>
                    ):(
                      <div style={{
                        display:"inline-flex",alignItems:"center",gap:6,
                        padding:"4px 10px",borderRadius:20,
                        background: stCfg.bg,
                        border:`1px solid ${stCfg.border}`,
                      }}>
                        <span style={{width:6,height:6,borderRadius:"50%",background:stCfg.dot,flexShrink:0}}/>
                        <select
                          value={x.status}
                          onChange={e=>handleStatus(x.id,e.target.value)}
                          style={{
                            background:"transparent",border:"none",
                            fontSize:11,fontWeight:700,color:stCfg.color,
                            cursor:"pointer",padding:0,outline:"none",
                            fontFamily:"inherit",
                          }}>
                          {Object.entries(INV_ST).filter(([k])=>k!=='vendida').map(([k,v])=>(
                            <option key={k} value={k}>{v.l}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>

                  {/* ── PRECIO ───────────────────────────── */}
                  <td style={{padding:"12px 16px",whiteSpace:"nowrap"}}>
                    {x.price>0
                      ?<span style={{fontWeight:800,fontSize:13,color:"#111827",letterSpacing:"-0.3px"}}>{fmt(x.price)}</span>
                      :<span style={{color:"#D1D5DB"}}>—</span>}
                  </td>

                  {/* ── ACCIONES ─────────────────────────── */}
                  <td style={{padding:"10px 16px"}}>
                    {x.status!=='vendida' ? (
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>

                        {/* Acción primaria */}
                        <button onClick={()=>openSell(x)}
                          style={{
                            padding:"6px 12px",borderRadius:6,
                            background:"#10B981",color:"#FFFFFF",
                            border:"none",fontSize:11,fontWeight:700,
                            cursor:"pointer",whiteSpace:"nowrap",
                            letterSpacing:"0.01em",textAlign:"center",
                            transition:"background 0.1s",
                          }}
                          onMouseEnter={e=>e.currentTarget.style.background="#059669"}
                          onMouseLeave={e=>e.currentTarget.style.background="#10B981"}>
                          Registrar venta
                        </button>

                        {/* Acciones secundarias */}
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>toggleHist(x.id)}
                            style={{
                              ...btnSmall,flex:1,
                              border:`1px solid ${isHistOpen?"#6366F1":"#E5E7EB"}`,
                              background:isHistOpen?"#EEF2FF":"#F9FAFB",
                              color:isHistOpen?"#6366F1":"#6B7280",
                            }}>
                            {histLoading[x.id]?"...":"Historial"}
                          </button>
                          {brs.filter(b=>b.id!==x.branch_id).length>0&&(
                            <select
                              defaultValue=""
                              onChange={e=>{if(e.target.value){handleMove(x.id,e.target.value);}e.target.value="";}}
                              style={{...btnSmall,...filterSelect,flex:1,height:"auto",border:"1px solid #E5E7EB",background:"#F9FAFB",color:"#6B7280"}}>
                              <option value="" disabled>Mover</option>
                              {brs.filter(b=>b.id!==x.branch_id).map(b=>(
                                <option key={b.id} value={b.id}>{b.code||b.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ):(
                      <button onClick={()=>toggleHist(x.id)}
                        style={{
                          ...btnSmall,width:"100%",
                          border:`1px solid ${isHistOpen?"#6366F1":"#E5E7EB"}`,
                          background:isHistOpen?"#EEF2FF":"#F9FAFB",
                          color:isHistOpen?"#6366F1":"#6B7280",
                        }}>
                        {histLoading[x.id]?"Cargando...":"Ver historial"}
                      </button>
                    )}
                  </td>
                </tr>

                {/* ── HISTORIAL EXPANDIBLE ─────────────── */}
                {isHistOpen&&(
                  <tr style={{borderBottom:"1px solid #E8E4F3",background:"#F8F7FF"}}>
                    <td colSpan={8} style={{padding:"16px 20px 20px"}}>

                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:"#6366F1",letterSpacing:"0.02em"}}>
                            Trazabilidad de la unidad
                          </div>
                          <div style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>
                            {x.brand} {x.model}{x.year?` ${x.year}`:''} · Chasis{' '}
                            <span style={{fontFamily:"'SF Mono',Consolas,monospace",fontWeight:600,color:"#6B7280"}}>
                              {x.chassis}
                            </span>
                          </div>
                        </div>
                        <button onClick={()=>toggleHist(x.id)}
                          style={{...btnSmall,border:"1px solid #E5E7EB"}}>
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
                              <div key={h.id} style={{
                                display:"flex",gap:10,padding:"10px 12px",
                                background:"#FFFFFF",borderRadius:8,
                                border:`1px solid ${isSaleEvent?"#C4B5FD":"#E2E0F5"}`,
                                borderLeft:`3px solid ${isSaleEvent?"#8B5CF6":"#6366F1"}`,
                              }}>
                                <div style={{
                                  flexShrink:0,marginTop:1,width:22,height:22,borderRadius:5,
                                  background:isSaleEvent?"rgba(139,92,246,0.12)":"rgba(99,102,241,0.08)",
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  fontSize:8,fontWeight:900,color:isSaleEvent?"#8B5CF6":"#6366F1",
                                  border:`1px solid ${isSaleEvent?"rgba(139,92,246,0.2)":"rgba(99,102,241,0.15)"}`,
                                }}>
                                  {HIST_ICONS[h.event_type]||"·"}
                                </div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:2}}>
                                    <span style={{fontWeight:700,fontSize:11,color:isSaleEvent?"#7C3AED":"#374151"}}>
                                      {HIST_LABELS[h.event_type]||h.event_type}
                                    </span>
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

      {/* ══════════════════════════════════════════════
          LIGHTBOX FOTOS
      ══════════════════════════════════════════════ */}
      {viewPhoto&&(
        <div onClick={()=>setViewPhoto(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:70,cursor:"pointer",backdropFilter:"blur(3px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",borderRadius:16,padding:20,maxWidth:600,width:"90%",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <span style={{fontSize:14,fontWeight:700}}>{viewPhoto.title}</span>
              <button onClick={()=>setViewPhoto(null)} style={{...S.gh,padding:6,borderRadius:8}}><Ic.x size={16}/></button>
            </div>
            <img src={viewPhoto.src} style={{width:"100%",borderRadius:10,maxHeight:420,objectFit:"contain"}}/>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODAL — AGREGAR UNIDAD
      ══════════════════════════════════════════════ */}
      {showAdd&&(
        <Modal onClose={()=>{setShowAdd(false);setNw(BLANK_NW());}} title="Agregar Unidad al Inventario" wide>
          <form onSubmit={handleAdd}>
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

            {/* Toggle "ya vendida" */}
            <div
              onClick={()=>setNw({...nw,added_as_sold:!nw.added_as_sold})}
              style={{
                display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                borderRadius:8,marginBottom:nw.added_as_sold?10:16,cursor:"pointer",
                background:nw.added_as_sold?"rgba(239,68,68,0.06)":"#F9FAFB",
                border:`1px solid ${nw.added_as_sold?"rgba(239,68,68,0.3)":"#E5E7EB"}`,
                transition:"all 0.15s",
              }}>
              <div style={{width:18,height:18,borderRadius:4,border:nw.added_as_sold?"none":"2px solid #333",background:nw.added_as_sold?"#EF4444":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {nw.added_as_sold&&<Ic.check size={11} color="white"/>}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:nw.added_as_sold?"#EF4444":"#374151"}}>Esta unidad ya está vendida</div>
                <div style={{fontSize:11,color:"#6B7280"}}>Se registrará directamente como vendida, sin pasar por stock disponible</div>
              </div>
            </div>

            {nw.added_as_sold&&(
              <div style={{background:"rgba(239,68,68,0.04)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#EF4444",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Datos de la venta</div>
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
                  <Field label="Ticket asociado (opcional)" value={nw.ticket_id} onChange={v=>setNw({...nw,ticket_id:v})}
                    opts={[{v:"",l:"Sin asociar"},...openTickets.map(t=>({v:t.id,l:`${t.ticket_num||''} · ${t.first_name||''} ${t.last_name||''}`.trim()}))]}/>
                </div>
                <Field label="Observaciones" value={nw.sale_notes} onChange={v=>setNw({...nw,sale_notes:v})} rows={2} ph="Ej: Venta registrada con retraso, documentación en proceso..."/>
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

      {/* ══════════════════════════════════════════════
          MODAL — REGISTRAR VENTA (desde inventario)
      ══════════════════════════════════════════════ */}
      {showSell&&sellUnit&&(()=>{
        const bName=brs.find(b=>b.id===sellUnit.branch_id)?.name||"—";
        return(
        <Modal onClose={()=>{setShowSell(false);setSellUnit(null);}} title="Registrar venta" wide>
          <form onSubmit={handleSell}>

            {/* Ficha de la unidad */}
            <div style={{background:"#F8F9FB",border:"1px solid #E5E7EB",borderRadius:10,padding:"14px 16px",marginBottom:18,display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
              <div style={{flex:"1 1 180px"}}>
                <div style={{fontSize:9,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Unidad a vender</div>
                <div style={{fontWeight:800,fontSize:16,color:"#111827",marginBottom:2}}>{sellUnit.brand} {sellUnit.model}</div>
                <div style={{fontSize:11,color:"#6B7280"}}>Color: {sellUnit.color} · Año {sellUnit.year}</div>
              </div>
              <div style={{flex:"1 1 160px"}}>
                <div style={{fontSize:9,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Identificación</div>
                <div style={{fontSize:11,color:"#374151",marginBottom:2}}>
                  <span style={{color:"#9CA3AF"}}>Chasis</span>{' '}
                  <span style={{fontFamily:"'SF Mono',Consolas,monospace",fontWeight:700,fontSize:11,background:"#F0F1F3",padding:"1px 5px",borderRadius:4}}>{sellUnit.chassis}</span>
                </div>
                {sellUnit.motor_num&&(
                  <div style={{fontSize:11,color:"#374151"}}>
                    <span style={{color:"#9CA3AF"}}>Motor</span>{' '}
                    <span style={{fontFamily:"'SF Mono',Consolas,monospace",fontWeight:600,fontSize:11}}>{sellUnit.motor_num}</span>
                  </div>
                )}
              </div>
              <div style={{flex:"1 1 120px"}}>
                <div style={{fontSize:9,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Sucursal</div>
                <div style={{fontWeight:700,fontSize:12,color:"#374151"}}>{bName}</div>
                {sellUnit.price>0&&<div style={{fontSize:13,fontWeight:800,color:"#F28100",marginTop:4}}>{fmt(sellUnit.price)}</div>}
              </div>
            </div>

            <div style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:12}}>Datos de la venta</div>

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
              <Field label="Ticket asociado (opcional)" value={sellForm.ticket_id} onChange={v=>setSellForm(p=>({...p,ticket_id:v}))}
                opts={[{v:"",l:"Sin lead asociado"},...openTickets.map(t=>({v:t.id,l:`${t.ticket_num?t.ticket_num+' · ':''}${[t.first_name,t.last_name].filter(Boolean).join(' ')||'Sin nombre'}`}))]}/>
            </div>
            <div style={{marginBottom:18}}>
              <Field label="Observaciones" value={sellForm.sale_notes} onChange={v=>setSellForm(p=>({...p,sale_notes:v}))} rows={2} ph="Ej: Entrega pactada para el lunes, documentación en proceso..."/>
            </div>

            <div style={{background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:11,color:"#065f46"}}>
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

      {/* ══════════════════════════════════════════════
          MODAL — IMPORTAR EXCEL
      ══════════════════════════════════════════════ */}
      {showImport&&(
        <Modal onClose={()=>setShowImport(false)} title="Importar inventario desde Excel" wide>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={handleImportFile}/>

          {!importPreview&&!importDone&&(
            <div style={{textAlign:"center",padding:"32px 16px"}}>
              <div style={{width:52,height:52,borderRadius:12,background:"#F3F4F6",border:"1px solid #E5E7EB",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:13,fontWeight:800,color:"#6B7280",letterSpacing:"0.04em"}}>XLS</div>
              <p style={{fontSize:13,color:"#374151",marginBottom:6}}>Seleccioná tu plantilla de inventario Excel (.xlsx)</p>
              <p style={{fontSize:11,color:"#6B7280",marginBottom:20}}>
                Columnas esperadas: <strong>Sucursal · Año · Marca · Modelo · Color · N° Chasis · N° Motor · Estado · Precio</strong>
              </p>
              <button onClick={()=>importFileRef.current?.click()} disabled={importLoading} style={{...S.btn,fontSize:13,padding:"10px 24px"}}>
                {importLoading?"Procesando...":"Seleccionar archivo"}
              </button>
            </div>
          )}

          {importPreview&&(
            <>
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                {[{l:"Total filas",v:importPreview.total,c:"#6B7280"},{l:"Nuevas",v:importPreview.ok,c:"#10B981"},{l:"Duplicados",v:importPreview.duplicates,c:"#F59E0B"},{l:"Errores",v:importPreview.errors,c:"#EF4444"}].map(({l,v,c})=>(
                  <div key={l} style={{...S.card,padding:"8px 14px",textAlign:"center",flex:1,minWidth:80}}>
                    <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:10,color:"#6B7280"}}>{l}</div>
                  </div>
                ))}
              </div>
              <p style={{fontSize:11,color:"#6B7280",marginBottom:10}}>Hoja leída: <strong>{importPreview.sheet}</strong> · Solo se importarán las filas en verde.</p>
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
                          <td style={{padding:"5px 8px",fontFamily:"'SF Mono',Consolas,monospace",fontSize:10}}>{r.chassis||'-'}</td>
                          <td style={{padding:"5px 8px",fontFamily:"'SF Mono',Consolas,monospace",fontSize:10}}>{r.motor_num||'-'}</td>
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
                <button onClick={()=>{setImportPreview(null);importFileRef.current?.click();}} style={{...S.btn2,fontSize:12}}>Cambiar archivo</button>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setShowImport(false)} style={S.btn2}>Cancelar</button>
                  <button onClick={handleImportConfirm} disabled={importLoading||importPreview.ok===0}
                    style={{...S.btn,opacity:(importLoading||importPreview.ok===0)?0.6:1}}>
                    {importLoading?"Importando...":`Importar ${importPreview.ok} unidades nuevas`}
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

// ─── Estilos locales reutilizables ────────────────────────────────────────────

const btnPrimary = {
  background:"#F28100",border:"1.5px solid #D97706",
  color:"#FFFFFF",borderRadius:8,fontSize:12,fontWeight:600,
  cursor:"pointer",padding:"8px 16px",fontFamily:"inherit",
};
const btnSecondary = {
  background:"#FFFFFF",border:"1.5px solid #E5E7EB",
  color:"#374151",borderRadius:8,fontSize:12,fontWeight:500,
  cursor:"pointer",padding:"8px 14px",fontFamily:"inherit",
};
const btnSmall = {
  padding:"5px 10px",borderRadius:6,fontSize:10,fontWeight:600,
  cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
  background:"#F9FAFB",color:"#6B7280",border:"1px solid #E5E7EB",
};
const filterSelect = {
  ...{},height:34,borderRadius:7,border:"1px solid #E5E7EB",
  background:"#FFFFFF",color:"#374151",fontSize:12,
  padding:"0 8px",cursor:"pointer",fontFamily:"inherit",
  outline:"none",
};
const linkBtn = {
  background:"none",border:"none",color:"#F28100",fontSize:11,
  cursor:"pointer",textDecoration:"underline",padding:0,fontFamily:"inherit",
};
