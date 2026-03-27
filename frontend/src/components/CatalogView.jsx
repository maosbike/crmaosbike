import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, CAT_COLOR } from '../ui.jsx';

function catColor(c){return CAT_COLOR[c]||"#555";}

function ModelDetailModal({model:m0,canEdit,canDelete,onClose,onSaved,onDeleted}){
  const[m,setM]=useState(m0);
  const[editing,setEditing]=useState(false);
  const[saving,setSaving]=useState(false);
  const[deleting,setDeleting]=useState(false);
  const[confirmDel,setConfirmDel]=useState(false);
  const[form,setForm]=useState({});
  const colors=Array.isArray(m.colors)?m.colors:(m.colors?JSON.parse(m.colors):[]);
  const gallery=Array.isArray(m.image_gallery)?m.image_gallery:(m.image_gallery?JSON.parse(m.image_gallery):[]);
  const[imgUploading,setImgUploading]=useState(false);
  const[colorInput,setColorInput]=useState("");

  const startEdit=()=>{
    setForm({
      brand:m.brand||"",
      model:m.model||"",
      commercial_name:m.commercial_name||m.model||"",
      category:m.category||"",
      description:m.description||"",
      spec_url:m.spec_url||"",
      colors:[...colors],
      cc:m.cc||"",
      year:m.year||"",
      price:m.price||0,
      bonus:m.bonus||0,
    });
    setEditing(true);
  };
  const save=async()=>{
    setSaving(true);
    try{
      const updated=await api.updateModel(m.id,{...form,price:Number(form.price)||0,bonus:Number(form.bonus)||0,cc:form.cc?Number(form.cc):null,year:form.year?Number(form.year):null});
      setM(updated);
      setEditing(false);
      onSaved&&onSaved(updated);
    }catch(e){alert("Error al guardar");}
    finally{setSaving(false);}
  };
  const handleDelete=async()=>{
    setDeleting(true);
    try{
      await api.deleteModel(m.id);
      onDeleted&&onDeleted(m.id);
      onClose();
    }catch(e){alert("Error al eliminar");}
    finally{setDeleting(false);}
  };
  const addColor=()=>{
    const c=colorInput.trim();
    if(c&&!form.colors.includes(c)){setForm(f=>({...f,colors:[...f.colors,c]}));}
    setColorInput("");
  };
  const removeColor=(c)=>setForm(f=>({...f,colors:f.colors.filter(x=>x!==c)}));
  const uploadMainImg=async(file)=>{
    setImgUploading(true);
    try{
      const res=await api.uploadModelImage(m.id,file);
      setM(prev=>({...prev,image_url:res.url}));
      onSaved&&onSaved({...m,image_url:res.url});
    }catch(e){alert("Error al subir imagen");}
    finally{setImgUploading(false);}
  };

  const specInfo=m.cc?`${m.cc}cc`:(m.category==="Eléctrica"?"Eléctrica":"—");

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",border:"1px solid #E5E7EB"}}>
        {/* Header imagen */}
        <div style={{position:"relative",height:200,background:"#F5F5F7",borderRadius:"16px 16px 0 0",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {m.image_url
            ?<img src={m.image_url} alt={m.model} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            :<div style={{color:"#D1D5DB",fontSize:13,fontWeight:500,letterSpacing:"0.05em"}}>SIN IMAGEN</div>
          }
          {canEdit&&(
            <label style={{position:"absolute",bottom:10,right:10,background:"rgba(255,255,255,0.9)",border:"1px solid #D1D5DB",borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer",color:"#374151"}}>
              {imgUploading?"Subiendo…":"Cambiar foto"}
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadMainImg(e.target.files[0])}/>
            </label>
          )}
          <button onClick={onClose} style={{position:"absolute",top:10,right:10,background:"rgba(255,255,255,0.9)",border:"none",borderRadius:20,width:30,height:30,color:"#374151",cursor:"pointer",fontSize:16,lineHeight:"30px",textAlign:"center"}}>×</button>
        </div>

        <div style={{padding:20}}>
          {/* Marca + categoría */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
            <div style={{fontSize:11,color:"#6B7280",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{m.brand}</div>
            {m.category&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:catColor(m.category)+"22",color:catColor(m.category),fontWeight:600}}>{m.category}</span>}
          </div>

          {/* Nombre */}
          <div style={{fontSize:22,fontWeight:800,lineHeight:1.2,marginBottom:2}}>{m.commercial_name||m.model}</div>
          {m.commercial_name&&m.commercial_name!==m.model&&<div style={{fontSize:12,color:"#6B7280",marginBottom:8}}>{m.model}</div>}

          {/* Specs rápidas */}
          <div style={{display:"flex",gap:16,marginTop:10,marginBottom:14}}>
            {m.year&&<div style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:700}}>{m.year}</div><div style={{fontSize:9,color:"#6B7280",textTransform:"uppercase"}}>Año</div></div>}
            <div style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:700}}>{specInfo}</div><div style={{fontSize:9,color:"#6B7280",textTransform:"uppercase"}}>Motor</div></div>
            {m.price>0&&m.bonus<m.price&&<div style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:"#F28100"}}>{fmt(m.price)}</div><div style={{fontSize:9,color:"#6B7280",textTransform:"uppercase"}}>Precio lista</div></div>}
            {m.bonus>0&&m.bonus<m.price&&<div style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:"#10B981"}}>{fmt(m.price-m.bonus)}</div><div style={{fontSize:9,color:"#6B7280",textTransform:"uppercase"}}>Todo medio</div></div>}
          </div>

          {/* Bono detalle */}
          {m.bonus>0&&m.bonus<m.price&&<div style={{background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12}}>
            <span style={{color:"#10B981",fontWeight:600}}>Bono {fmt(m.bonus)}</span>
            <span style={{color:"#6B7280",marginLeft:6}}>→ Precio todo medio de pago {fmt(m.price-m.bonus)}</span>
          </div>}

          {/* Colores */}
          {!editing&&colors.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#6B7280",textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Colores disponibles</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {colors.map(c=><span key={c} style={{fontSize:11,padding:"4px 10px",borderRadius:12,background:"#F3F4F6",color:"#9CA3AF",border:"1px solid #D1D5DB"}}>{c}</span>)}
              </div>
            </div>
          )}

          {/* Descripción */}
          {!editing&&m.description&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#6B7280",textTransform:"uppercase",fontWeight:600,marginBottom:4}}>Descripción</div>
              <div style={{fontSize:13,color:"#4B5563",lineHeight:1.5}}>{m.description}</div>
            </div>
          )}

          {/* Ficha técnica */}
          {!editing&&m.spec_url&&(
            <a href={m.spec_url} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"#F28100",textDecoration:"none",border:"1px solid #FDBA74",borderRadius:8,padding:"6px 12px",marginBottom:14}}>
              📄 Ver ficha técnica
            </a>
          )}

          {/* FORM EDICIÓN */}
          {editing&&(
            <div style={{borderTop:"1px solid #222",paddingTop:16,marginTop:4}}>
              <div style={{fontSize:12,fontWeight:700,color:"#F28100",marginBottom:12}}>Editar modelo</div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Marca</div>
                  <input value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Modelo (código)</div>
                  <input value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Nombre comercial</div>
                <input value={form.commercial_name} onChange={e=>setForm(f=>({...f,commercial_name:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Categoría</div>
                  <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{...S.inp,width:"100%"}}>
                    <option value="">Sin categoría</option>
                    {Object.keys(CAT_COLOR).map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Cilindrada (cc)</div>
                  <input value={form.cc} onChange={e=>setForm(f=>({...f,cc:e.target.value}))} placeholder="ej: 150" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Año</div>
                  <input value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))} placeholder="ej: 2025" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Precio lista ($)</div>
                  <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="ej: 2990000" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Bono todo medio ($)</div>
                  <input type="number" value={form.bonus} onChange={e=>setForm(f=>({...f,bonus:e.target.value}))} placeholder="ej: 150000" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Descripción</div>
                <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} style={{...S.inp,width:"100%",boxSizing:"border-box",resize:"vertical"}} placeholder="Descripción comercial del modelo..."/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>URL ficha técnica (PDF o página)</div>
                <input value={form.spec_url} onChange={e=>setForm(f=>({...f,spec_url:e.target.value}))} placeholder="https://..." style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,color:"#6B7280",marginBottom:6}}>Colores</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                  {form.colors.map(c=>(
                    <span key={c} style={{fontSize:11,padding:"3px 8px",borderRadius:10,background:"#F3F4F6",color:"#9CA3AF",border:"1px solid #D1D5DB",display:"flex",alignItems:"center",gap:4}}>
                      {c}<button onClick={()=>removeColor(c)} style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",padding:0,fontSize:12,lineHeight:1}}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <input value={colorInput} onChange={e=>setColorInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addColor()} placeholder="Agregar color..." style={{...S.inp,flex:1}}/>
                  <button onClick={addColor} style={{...S.btn,padding:"6px 12px",fontSize:12}}>+</button>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={save} disabled={saving} style={{...S.btn,flex:1}}>{saving?"Guardando…":"Guardar"}</button>
                <button onClick={()=>setEditing(false)} style={{...S.btnSec,flex:1}}>Cancelar</button>
              </div>
            </div>
          )}

          {canEdit&&!editing&&(
            <button onClick={startEdit} style={{...S.btnSec,width:"100%",marginTop:8,fontSize:12}}>Editar modelo</button>
          )}

          {/* Eliminar — solo super_admin */}
          {canDelete&&!editing&&(
            <div style={{marginTop:8}}>
              {!confirmDel
                ?<button onClick={()=>setConfirmDel(true)} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #3F1111",background:"transparent",color:"#EF4444",fontSize:12,cursor:"pointer"}}>Eliminar del catálogo</button>
                :<div style={{background:"#1A0A0A",border:"1px solid #3F1111",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:12,color:"#EF4444",marginBottom:8,fontWeight:600}}>¿Eliminar {m.commercial_name||m.model}?</div>
                  <div style={{fontSize:11,color:"#6B7280",marginBottom:10}}>Esta acción desactiva el modelo del catálogo. No se puede deshacer desde aquí.</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={handleDelete} disabled={deleting} style={{flex:1,padding:"7px",borderRadius:7,border:"none",background:"#EF4444",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>{deleting?"Eliminando…":"Sí, eliminar"}</button>
                    <button onClick={()=>setConfirmDel(false)} style={{flex:1,padding:"7px",borderRadius:7,border:"1px solid #D1D5DB",background:"transparent",color:"#4B5563",fontSize:12,cursor:"pointer"}}>Cancelar</button>
                  </div>
                </div>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddModelModal({onClose,onAdded}){
  const[form,setForm]=useState({brand:"",model:"",commercial_name:"",category:"",cc:"",year:new Date().getFullYear(),price:0,bonus:0,description:"",spec_url:""});
  const[colors,setColors]=useState([]);
  const[colorInput,setColorInput]=useState("");
  const[saving,setSaving]=useState(false);
  const addColor=()=>{const c=colorInput.trim();if(c&&!colors.includes(c))setColors(cs=>[...cs,c]);setColorInput("");};
  const removeColor=(c)=>setColors(cs=>cs.filter(x=>x!==c));
  const handleSubmit=async(e)=>{
    e.preventDefault();
    if(!form.brand.trim()||!form.model.trim()){alert("Marca y modelo son obligatorios");return;}
    setSaving(true);
    try{
      const created=await api.createModel({...form,commercial_name:form.commercial_name||form.model,cc:form.cc?Number(form.cc):null,year:Number(form.year),price:Number(form.price)||0,bonus:Number(form.bonus)||0,colors});
      onAdded(created);
      onClose();
    }catch(e){alert(e.message||"Error al crear");}
    finally{setSaving(false);}
  };
  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",border:"1px solid #E5E7EB"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontWeight:700,fontSize:15}}>Agregar moto al catálogo</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{padding:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Marca *</div>
              <input required value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} placeholder="ej: Honda" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Modelo (código) *</div>
              <input required value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))} placeholder="ej: CB 300F" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Nombre comercial</div>
            <input value={form.commercial_name} onChange={e=>setForm(f=>({...f,commercial_name:e.target.value}))} placeholder="Igual al modelo si se deja vacío" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Categoría</div>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{...S.inp,width:"100%"}}>
                <option value="">Sin categoría</option>
                {Object.keys(CAT_COLOR).map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Cilindrada (cc)</div>
              <input type="number" value={form.cc} onChange={e=>setForm(f=>({...f,cc:e.target.value}))} placeholder="ej: 300" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Año</div>
              <input type="number" value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Precio lista ($)</div>
              <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Bono ($)</div>
              <input type="number" value={form.bonus} onChange={e=>setForm(f=>({...f,bonus:e.target.value}))} placeholder="0" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>Descripción</div>
            <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} style={{...S.inp,width:"100%",boxSizing:"border-box",resize:"vertical"}} placeholder="Descripción comercial..."/>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:"#6B7280",marginBottom:3}}>URL ficha técnica</div>
            <input value={form.spec_url} onChange={e=>setForm(f=>({...f,spec_url:e.target.value}))} placeholder="https://..." style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:"#6B7280",marginBottom:6}}>Colores</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
              {colors.map(c=>(
                <span key={c} style={{fontSize:11,padding:"3px 8px",borderRadius:10,background:"#F3F4F6",color:"#9CA3AF",border:"1px solid #D1D5DB",display:"flex",alignItems:"center",gap:4}}>
                  {c}<button type="button" onClick={()=>removeColor(c)} style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",padding:0,fontSize:12}}>×</button>
                </span>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <input value={colorInput} onChange={e=>setColorInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addColor();}}} placeholder="Agregar color..." style={{...S.inp,flex:1}}/>
              <button type="button" onClick={addColor} style={{...S.btn,padding:"6px 12px",fontSize:12}}>+</button>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button type="submit" disabled={saving} style={{...S.btn,flex:1}}>{saving?"Guardando…":"Agregar al catálogo"}</button>
            <button type="button" onClick={onClose} style={{...S.btnSec,flex:1}}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CatalogView({user}){
  const[models,setModels]=useState([]);
  const[brands,setBrands]=useState([]);
  const[brandF,setBrandF]=useState("");
  const[search,setSearch]=useState("");
  const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);
  const[showAdd,setShowAdd]=useState(false);
  const canEdit=user&&(user.role==="super_admin"||user.role==="admin_comercial");
  const canDelete=user&&user.role==="super_admin";

  const refreshBrands=(ms)=>setBrands([...new Set(ms.map(m=>m.brand))].sort());

  useEffect(()=>{
    api.getModels().then(d=>{
      const ms=Array.isArray(d)?d:[];
      setModels(ms);
      refreshBrands(ms);
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const onSaved=(updated)=>{
    setModels(ms=>{const next=ms.map(m=>m.id===updated.id?updated:m);refreshBrands(next);return next;});
    setSelected(updated);
  };

  const onAdded=(created)=>{
    setModels(ms=>{const next=[...ms,created];refreshBrands(next);return next;});
  };

  const onDeleted=(id)=>{
    setModels(ms=>{const next=ms.filter(m=>m.id!==id);refreshBrands(next);return next;});
    setSelected(null);
  };

  let f=models;
  if(brandF)f=f.filter(m=>m.brand===brandF);
  if(search){const q=search.toLowerCase();f=f.filter(m=>(m.brand+m.model+(m.commercial_name||"")).toLowerCase().includes(q));}

  // Group by brand for nicer display
  const grouped=brands.filter(b=>!brandF||b===brandF).reduce((acc,b)=>{
    const bm=f.filter(m=>m.brand===b);
    if(bm.length)acc.push({brand:b,models:bm});
    return acc;
  },[]);

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <h1 style={{fontSize:18,fontWeight:700,margin:0}}>Catálogo de Motos</h1>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,color:"#6B7280"}}>{loading?"Cargando...":`${models.length} modelos · ${brands.length} marcas`}</span>
          {canEdit&&<button onClick={()=>setShowAdd(true)} style={{...S.btn,fontSize:12,padding:"6px 14px"}}>+ Agregar moto</button>}
        </div>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo..." style={{...S.inp,flex:1,minWidth:160}}/>
        <select value={brandF} onChange={e=>setBrandF(e.target.value)} style={{...S.inp,minWidth:160}}>
          <option value="">Todas las marcas</option>
          {brands.map(b=><option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {!loading&&f.length===0&&(
        <div style={{...S.card,textAlign:"center",padding:40,color:"#6B7280"}}>
          <div style={{fontSize:32,marginBottom:12}}>🏍</div>
          <div style={{fontWeight:600,marginBottom:6}}>Sin modelos en catálogo</div>
          <div style={{fontSize:12}}>Importá una lista de precios PDF para poblar el catálogo.</div>
        </div>
      )}

      {grouped.map(({brand,models:bms})=>(
        <div key={brand} style={{marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,color:"#F28100",textTransform:"uppercase",letterSpacing:2,marginBottom:10,paddingLeft:2}}>{brand} <span style={{color:"#444",fontWeight:400}}>({bms.length})</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:10}}>
            {bms.map(m=>{
              const colors=Array.isArray(m.colors)?m.colors:(m.colors?JSON.parse(m.colors):[]);
              const specInfo=m.cc?`${m.cc}cc`:(m.category==="Eléctrica"?"Eléctrica":null);
              return(
                <div key={m.id} onClick={()=>setSelected(m)}
                  style={{background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:14,overflow:"hidden",cursor:"pointer",transition:"border-color 0.15s",position:"relative"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#F2810055"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#E5E7EB"}
                >
                  {/* Imagen */}
                  <div style={{height:130,background:"#F5F5F7",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                    {m.image_url
                      ?<img src={m.image_url} alt={m.model} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      :<span style={{fontSize:40,opacity:0.15}}>🏍</span>
                    }
                  </div>

                  <div style={{padding:"10px 12px 12px"}}>
                    {/* Categoría badge */}
                    {m.category&&(
                      <span style={{fontSize:9,padding:"2px 7px",borderRadius:8,background:catColor(m.category)+"22",color:catColor(m.category),fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>
                        {m.category}
                      </span>
                    )}

                    {/* Nombre */}
                    <div style={{fontSize:14,fontWeight:700,marginTop:5,lineHeight:1.2}}>{m.commercial_name||m.model}</div>
                    {specInfo&&<div style={{fontSize:10,color:"#6B7280",marginTop:2}}>{specInfo}{m.year?` · ${m.year}`:""}</div>}

                    {/* Precio */}
                    {m.price>0&&m.bonus<m.price&&(
                      <div style={{marginTop:8,borderTop:"1px solid #E5E7EB",paddingTop:8}}>
                        <div style={{fontSize:16,fontWeight:800,color:"#F28100"}}>{fmt(m.price)}</div>
                        {m.bonus>0&&(
                          <div style={{fontSize:10,color:"#10B981",marginTop:1}}>
                            Bono {fmt(m.bonus)} → <b>{fmt(m.price-m.bonus)}</b>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Colores */}
                    {colors.length>0&&(
                      <div style={{display:"flex",gap:3,marginTop:8,flexWrap:"wrap"}}>
                        {colors.slice(0,4).map(c=><span key={c} style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"#F3F4F6",color:"#6B7280"}}>{c}</span>)}
                        {colors.length>4&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:8,background:"#F3F4F6",color:"#444"}}>+{colors.length-4}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {showAdd&&<AddModelModal onClose={()=>setShowAdd(false)} onAdded={onAdded}/>}

      {selected&&(
        <ModelDetailModal
          model={selected}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={()=>setSelected(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

