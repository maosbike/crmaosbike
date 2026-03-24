import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function InventoryView({inv,setInv,user,realBranches}){
  const brs=realBranches||BRANCHES;
  const[brF,setBrF]=useState("");const[stF,setStF]=useState("");const[search,setSearch]=useState("");const[showAdd,setShowAdd]=useState(false);const[viewPhoto,setViewPhoto]=useState(null);const[adding,setAdding]=useState(false);
  const[nw,setNw]=useState({branch_id:"",year:new Date().getFullYear(),brand:"",model:"",color:"",chassis:"",motor_num:"",status:"disponible",price:0});
  const f=inv.filter(x=>{if(brF&&x.branch_id!==brF)return false;if(stF&&x.status!==stF)return false;if(search&&!`${x.brand} ${x.model} ${x.chassis} ${x.color}`.toLowerCase().includes(search.toLowerCase()))return false;return true;});
  const counts=Object.fromEntries(Object.keys(INV_ST).map(k=>[k,inv.filter(x=>x.status===k).length]));
  const reload=()=>api.getInventory().then(d=>setInv(Array.isArray(d)?d:[])).catch(()=>{});
  const handleAdd=async e=>{
    e.preventDefault();setAdding(true);
    try{
      await api.createInventory({branch_id:nw.branch_id||null,year:Number(nw.year),brand:nw.brand,model:nw.model,color:nw.color,chassis:nw.chassis,motor_num:nw.motor_num,status:nw.status,price:Number(nw.price)});
      setShowAdd(false);setNw({branch_id:"",year:new Date().getFullYear(),brand:"",model:"",color:"",chassis:"",motor_num:"",status:"disponible",price:0});
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
  const handleStatus=async(id,status)=>{
    setInv(p=>p.map(x=>x.id===id?{...x,status}:x));
    try{await api.updateInventory(id,{status});}catch(ex){alert(ex.message);reload();}
  };
  const handleMove=async(id,branch_id)=>{
    setInv(p=>p.map(x=>x.id===id?{...x,branch_id}:x));
    try{await api.updateInventory(id,{branch_id});reload();}catch(ex){alert(ex.message);reload();}
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div><h1 style={{fontSize:18,fontWeight:700,margin:0}}>Inventario</h1><p style={{color:"#6B6B6B",fontSize:12}}>{inv.length} unidades · {counts.disponible} disponibles</p></div><button onClick={()=>setShowAdd(true)} style={{...S.btn,display:"flex",alignItems:"center",gap:6,fontSize:12}}><Ic.plus size={15}/>Agregar Moto</button></div>
      <div className="grid-4col" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>{Object.entries(INV_ST).map(([k,v])=><div key={k} onClick={()=>setStF(stF===k?"":k)} style={{...S.card,padding:10,textAlign:"center",cursor:"pointer",border:stF===k?`1px solid ${v.c}`:"1px solid #1E1E1F"}}><div style={{fontSize:20,fontWeight:800,color:v.c}}>{counts[k]}</div><div style={{fontSize:10,color:"#6B6B6B"}}>{v.l}</div></div>)}</div>
      <div style={{...S.card,padding:10,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}><div style={{position:"relative",flex:1,minWidth:180}}><Ic.search size={14} color="#555" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." style={{...S.inp,paddingLeft:30,width:"100%"}}/></div><select value={brF} onChange={e=>setBrF(e.target.value)} style={{...S.inp}}><option value="">Todas las sucursales</option>{brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="crm-table-scroll" style={{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1050}}><thead><tr style={{borderBottom:"1px solid #1E1E1F"}}>{["Sucursal","Año","Marca","Modelo","Color","N° Chasis","Foto Chasis","N° Motor","Foto Motor","Estado","Precio",""].map(h=><th key={h} style={{textAlign:"left",padding:"9px 8px",fontSize:9,fontWeight:600,color:"#6B6B6B",textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{f.map(x=><tr key={x.id} style={{borderBottom:"1px solid #1A1A1B"}}>
        <td style={{padding:"8px"}}><Bdg l={x.branch_code||brs.find(b=>b.id===x.branch_id)?.code} c="#A3A3A3"/></td>
        <td style={{padding:"8px"}}>{x.year}</td>
        <td style={{padding:"8px",fontWeight:600}}>{x.brand}</td>
        <td style={{padding:"8px"}}>{x.model}</td>
        <td style={{padding:"8px"}}>{x.color}</td>
        <td style={{padding:"8px",fontFamily:"monospace",fontSize:11}}>{x.chassis}</td>
        <td style={{padding:"8px"}}>
          {x.chassis_photo?<img src={x.chassis_photo} onClick={()=>setViewPhoto({src:x.chassis_photo,title:`Chasis ${x.chassis}`})} style={{width:36,height:36,borderRadius:6,objectFit:"cover",cursor:"pointer",border:"1px solid #333"}}/>:<button onClick={()=>handlePhoto(x.id,"chassis_photo")} style={{...S.gh,padding:"4px 8px",fontSize:10,color:"#F28100",border:"1px dashed #333",borderRadius:6}}>📷</button>}
        </td>
        <td style={{padding:"8px",fontFamily:"monospace",fontSize:11}}>{x.motor_num}</td>
        <td style={{padding:"8px"}}>
          {x.motor_photo?<img src={x.motor_photo} onClick={()=>setViewPhoto({src:x.motor_photo,title:`Motor ${x.motor_num}`})} style={{width:36,height:36,borderRadius:6,objectFit:"cover",cursor:"pointer",border:"1px solid #333"}}/>:<button onClick={()=>handlePhoto(x.id,"motor_photo")} style={{...S.gh,padding:"4px 8px",fontSize:10,color:"#F28100",border:"1px dashed #333",borderRadius:6}}>📷</button>}
        </td>
        <td style={{padding:"8px"}}><select value={x.status} onChange={e=>handleStatus(x.id,e.target.value)} style={{...S.inp,padding:"3px 6px",fontSize:11,background:"transparent",border:"none",color:INV_ST[x.status]?.c,fontWeight:600,cursor:"pointer"}}>{Object.entries(INV_ST).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></td>
        <td style={{padding:"8px",fontWeight:600,color:"#F28100"}}>{fmt(x.price)}</td>
        <td style={{padding:"8px"}}><select defaultValue="" onChange={e=>{if(e.target.value){handleMove(x.id,e.target.value);}e.target.value="";}} style={{...S.inp,padding:"3px 6px",fontSize:10,width:55}}><option value="" disabled>Mover</option>{brs.filter(b=>b.id!==x.branch_id).map(b=><option key={b.id} value={b.id}>{b.code}</option>)}</select></td>
      </tr>)}</tbody></table></div>

      {viewPhoto&&<div onClick={()=>setViewPhoto(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:70,cursor:"pointer"}}><div onClick={e=>e.stopPropagation()} style={{background:"#151516",borderRadius:16,padding:16,maxWidth:600,width:"90%"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:14,fontWeight:600}}>{viewPhoto.title}</span><button onClick={()=>setViewPhoto(null)} style={{...S.gh,padding:4}}><Ic.x size={18}/></button></div><img src={viewPhoto.src} style={{width:"100%",borderRadius:10,maxHeight:400,objectFit:"contain"}}/></div></div>}

      {showAdd&&<Modal onClose={()=>setShowAdd(false)} title="Agregar Moto" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.map(b=>({v:b.id,l:b.name}))]}/><Field label="Año" value={nw.year} onChange={v=>setNw({...nw,year:v})} type="number"/><Field label="Marca *" value={nw.brand} onChange={v=>setNw({...nw,brand:v})} req/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Modelo *" value={nw.model} onChange={v=>setNw({...nw,model:v})} req/><Field label="Color *" value={nw.color} onChange={v=>setNw({...nw,color:v})} req/><Field label="Precio" value={nw.price} onChange={v=>setNw({...nw,price:v})} type="number"/></div><div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}><Field label="N° Chasis *" value={nw.chassis} onChange={v=>setNw({...nw,chassis:v})} req/><Field label="N° Motor *" value={nw.motor_num} onChange={v=>setNw({...nw,motor_num:v})} req/></div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>setShowAdd(false)} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Guardando...":"Agregar"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// SALES, CATALOG, REPORTS, ADMIN (compact)
// ═══════════════════════════════════════════
