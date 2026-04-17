import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { ColorPicker } from './ColorPicker.jsx';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, CAT_COLOR, ViewHeader, colorNameToCss, useIsMobile, Empty, Loader, ErrorMsg } from '../ui.jsx';

function catColor(c){return CAT_COLOR[c]||"#4B5563";}

const BONO_CONDICION={
  todo_medio_pago:     {l:"Todo medio de pago",     c:"#10B981"},
  solo_financiamiento: {l:"Solo financiamiento",     c:"#8B5CF6"},
  solo_autofin:        {l:"Solo Autofin",             c:"#F28100"},
  contado_transferencia:{l:"Contado / Transferencia", c:"#3B82F6"},
  otro:                {l:"Otro (ver requisitos)",    c:"#6B7280"},
};
// Devuelve el label de condición dado el valor guardado
function bonoCondLabel(condicion){
  return BONO_CONDICION[condicion]?.l || (condicion ? condicion : "Todo medio de pago");
}
function bonoCondColor(condicion){
  return BONO_CONDICION[condicion]?.c || "#10B981";
}

// Resolver color CSS: usa colorNameToCss de ui.jsx (fuente única).
// Retorna null cuando no hay match (el fallback de colorNameToCss es '#9CA3AF',
// así que lo convertimos a null para mantener la semántica de "sin color conocido").
function colorToCss(name){
  if(!name) return null;
  const r=colorNameToCss(name);
  return r==='#9CA3AF'?null:r;
}
// Dado un CSS de fondo, devuelve si es "claro" (necesita texto oscuro)
function isLightColor(css){
  if(!css) return false;
  const light=['#F9FAFB','#F9FAFB','#F0EDE8','#E8E0D0','#FEF3C7','#E5E7EB','#D1D5DB','#D1D5DB','#D4B896'];
  return light.includes(css);
}

function CategoryCombo({value,onChange,allCategories,style,listId="cat-list"}){
  return(
    <>
      <input list={listId} value={value} onChange={e=>onChange(e.target.value)}
        placeholder="Seleccionar o escribir nueva..." style={style}/>
      <datalist id={listId}>
        {(allCategories||[]).map(c=><option key={c} value={c}/>)}
      </datalist>
    </>
  );
}

function ModelDetailModal({model:m0,canEdit,canDelete,onClose,onSaved,onDeleted,allCategories}){
  const[m,setM]=useState(m0);
  const[editing,setEditing]=useState(false);
  const[saving,setSaving]=useState(false);
  const[deleting,setDeleting]=useState(false);
  const[confirmDel,setConfirmDel]=useState(false);
  const[form,setForm]=useState({});
  const[errMsg,setErrMsg]=useState('');
  const[successMsg,setSuccessMsg]=useState('');
  const colors=Array.isArray(m.colors)?m.colors:(m.colors?JSON.parse(m.colors):[]);
  const gallery=Array.isArray(m.image_gallery)?m.image_gallery:(m.image_gallery?JSON.parse(m.image_gallery):[]);
  const colorPhotos=Array.isArray(m.color_photos)?m.color_photos:(m.color_photos?JSON.parse(m.color_photos):[]);
  const getColorPhoto=(color)=>colorPhotos.find(p=>p.color.toLowerCase().trim()===color.toLowerCase().trim())?.url||null;
  const getColorData=(color)=>colorPhotos.find(p=>p.color.toLowerCase().trim()===color.toLowerCase().trim())||null;
  const getColorCss=(color)=>{const d=getColorData(color);return d?.hex||colorToCss(color)||null;};
  const[imgUploading,setImgUploading]=useState(false);
  const[galleryUploading,setGalleryUploading]=useState(false);
  const[specUploading,setSpecUploading]=useState(false);
  const[colorPhotoUploading,setColorPhotoUploading]=useState(null);
  const[colorInput,setColorInput]=useState("");
  const[activeColor,setActiveColor]=useState(null);
  const[newColorHex,setNewColorHex]=useState('#111827');
  const[showNewPicker,setShowNewPicker]=useState(false);
  const[activeColorHex,setActiveColorHex]=useState('#111827');
  const[savingHex,setSavingHex]=useState(false);
  const MAX_GALLERY=8;
  // Sync hex picker cuando cambia el color activo
  useEffect(()=>{
    if(activeColor){const d=getColorData(activeColor);setActiveColorHex(d?.hex||colorToCss(activeColor)||'#111827');}
  },[activeColor,m.color_photos]);

  // Foto que se muestra en el header: la del color activo (con fallback al modelo)
  const displayPhoto=activeColor?(getColorPhoto(activeColor)||m.image_url):m.image_url;

  const startEdit=()=>{
    setForm({
      brand:m.brand||"",
      model:m.model||"",
      commercial_name:m.commercial_name||m.model||"",
      category:m.category||"",
      description:m.description||"",
      spec_url:m.spec_url||"",
      cc:m.cc||"",
      year:m.year||"",
      price:m.price||0,
      bonus:m.bonus||0,
      bono_tipo:m.bono_tipo||"",
      bono_condicion:m.bono_condicion||"",
      bono_requisitos:m.bono_requisitos||"",
    });
    setEditing(true);
  };
  const save=async()=>{
    setSaving(true);
    try{
      const updated=await api.updateModel(m.id,{...form,price:Number(form.price)||0,bonus:Number(form.bonus)||0,cc:form.cc?Number(form.cc):null,year:form.year?Number(form.year):null,bono_tipo:form.bono_tipo||null,bono_condicion:form.bono_condicion||null,bono_requisitos:form.bono_requisitos||null});
      setM(updated);
      setEditing(false);
      onSaved&&onSaved(updated);
    }catch(e){setErrMsg(e?.message||"Error al guardar");}
    finally{setSaving(false);}
  };
  const handleDelete=async()=>{
    setDeleting(true);
    try{
      await api.deleteModel(m.id);
      onDeleted&&onDeleted(m.id);
      onClose();
    }catch(e){setErrMsg(e?.message||"Error al eliminar");}
    finally{setDeleting(false);}
  };
  // Colores — guardado inmediato, no depende del form de edición
  const addColorImmediate=async()=>{
    const c=colorInput.trim();
    if(!c||colors.includes(c)){setColorInput("");return;}
    setColorInput("");
    // Agregar a colors + guardar hex en color_photos
    const newColors=[...colors,c];
    const existingEntry=colorPhotos.find(p=>p.color.toLowerCase().trim()===c.toLowerCase().trim());
    const newColorPhotos=existingEntry
      ?colorPhotos.map(p=>p.color.toLowerCase().trim()===c.toLowerCase().trim()?{...p,hex:newColorHex}:p)
      :[...colorPhotos,{color:c,hex:newColorHex,url:null}];
    try{const updated=await api.updateModel(m.id,{colors:newColors,color_photos:newColorPhotos});setM(updated);onSaved&&onSaved(updated);}
    catch(e){setErrMsg(e?.message||"Error al agregar color");}
  };
  const saveActiveColorHex=async()=>{
    if(!activeColor) return;
    setSavingHex(true);
    const newColorPhotos=colorPhotos.find(p=>p.color.toLowerCase().trim()===activeColor.toLowerCase().trim())
      ?colorPhotos.map(p=>p.color.toLowerCase().trim()===activeColor.toLowerCase().trim()?{...p,hex:activeColorHex}:p)
      :[...colorPhotos,{color:activeColor,hex:activeColorHex,url:null}];
    try{const updated=await api.updateModel(m.id,{color_photos:newColorPhotos});setM(updated);onSaved&&onSaved(updated);}
    catch(e){setErrMsg(e?.message||"Error al guardar tono");}
    finally{setSavingHex(false);}
  };
  const removeColorImmediate=async(c)=>{
    if(activeColor===c) setActiveColor(null);
    try{const updated=await api.updateModel(m.id,{colors:colors.filter(x=>x!==c)});setM(updated);onSaved&&onSaved(updated);}
    catch(e){setErrMsg(e?.message||"Error al quitar color");}
  };
  const uploadMainImg=async(file)=>{
    setImgUploading(true);
    try{
      const res=await api.uploadModelImage(m.id,file);
      setM(prev=>({...prev,image_url:res.url}));
      onSaved&&onSaved({...m,image_url:res.url});
    }catch(e){setErrMsg(e?.message||"Error al subir imagen");}
    finally{setImgUploading(false);}
  };
  const handleAddGalleryPhoto=async(file)=>{
    if(gallery.length>=MAX_GALLERY){setErrMsg(`Máximo ${MAX_GALLERY} fotos por modelo`);return;}
    setGalleryUploading(true);
    try{
      const res=await api.addModelGalleryPhoto(m.id,file);
      const updated={...m,image_gallery:res.gallery};
      setM(updated);onSaved&&onSaved(updated);
    }catch(e){setErrMsg(e?.message||"Error al subir foto");}
    finally{setGalleryUploading(false);}
  };
  const handleRemoveGalleryPhoto=async(url)=>{
    setGalleryUploading(true);
    try{
      const res=await api.removeModelGalleryPhoto(m.id,url);
      const updated={...m,image_gallery:res.gallery};
      setM(updated);onSaved&&onSaved(updated);
    }catch(e){setErrMsg(e?.message||"Error al eliminar foto");}
    finally{setGalleryUploading(false);}
  };
  const handleUploadSpec=async(file)=>{
    setSpecUploading(true);
    try{
      const res=await api.uploadModelSpec(m.id,file);
      const updated={...m,spec_url:res.url};
      setM(updated);
      // Si estamos en modo edición, sincronizar el form también
      setForm(f=>({...f,spec_url:res.url}));
      onSaved&&onSaved(updated);
    }catch(e){setErrMsg(e?.message||"Error al subir PDF");}
    finally{setSpecUploading(false);}
  };

  const handleUploadColorPhoto=async(color,file)=>{
    setColorPhotoUploading(color);
    try{
      const res=await api.uploadColorPhoto(m.id,color,file);
      const updated={...m,color_photos:res.color_photos};
      setM(updated);onSaved&&onSaved(updated);
    }catch(e){setErrMsg(e?.message||"Error al subir foto de color");}
    finally{setColorPhotoUploading(null);}
  };
  const handleRemoveColorPhoto=async(color)=>{
    setColorPhotoUploading(color);
    try{
      const res=await api.removeColorPhoto(m.id,color);
      const updated={...m,color_photos:res.color_photos};
      setM(updated);onSaved&&onSaved(updated);
    }catch(e){setErrMsg(e?.message||"Error al quitar foto de color");}
    finally{setColorPhotoUploading(null);}
  };

  const specInfo=m.cc?`${m.cc}cc`:(m.category==="Eléctrica"?"Eléctrica":"—");

  return(
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",border:"1px solid #E5E7EB"}}>
        {/* Header imagen — cambia según color seleccionado */}
        <div style={{position:"relative",height:220,background:"#F9FAFB",borderRadius:"16px 16px 0 0",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {displayPhoto
            ?<img key={displayPhoto} src={displayPhoto} alt={m.model}
                style={{maxWidth:"calc(100% - 32px)",maxHeight:"calc(100% - 24px)",width:"auto",height:"auto",display:"block",objectFit:"contain",transition:"opacity 0.2s"}}/>
            :<div style={{color:"#D1D5DB",fontSize:13,fontWeight:500,letterSpacing:"0.05em"}}>SIN IMAGEN</div>
          }
          {/* Badge del color activo */}
          {activeColor&&(
            <div style={{position:"absolute",bottom:10,left:12,display:"flex",alignItems:"center",gap:6,background:"rgba(0,0,0,0.55)",borderRadius:20,padding:"4px 10px",backdropFilter:"blur(4px)"}}>
              {(()=>{const css=getColorCss(activeColor);return css?<span style={{width:10,height:10,borderRadius:5,background:css,border:"1px solid rgba(255,255,255,0.4)",display:"inline-block",flexShrink:0}}/>:null;})()}
              <span style={{fontSize:11,fontWeight:600,color:"#FFFFFF"}}>{activeColor}</span>
            </div>
          )}
          {/* Botón cambiar foto principal (solo sin color activo) */}
          {canEdit&&!activeColor&&(
            <label style={{position:"absolute",bottom:10,right:10,background:"rgba(255,255,255,0.9)",border:"1px solid #D1D5DB",borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer",color:"#374151"}}>
              {imgUploading?"Subiendo…":"Cambiar foto"}
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadMainImg(e.target.files[0])}/>
            </label>
          )}
          <button onClick={onClose} style={{position:"absolute",top:10,right:10,background:"rgba(255,255,255,0.9)",border:"none",borderRadius:20,width:30,height:30,color:"#374151",cursor:"pointer",fontSize:16,lineHeight:"30px",textAlign:"center"}}>×</button>
        </div>

        <div style={{padding:20}}>
          {errMsg&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><ErrorMsg msg={errMsg}/><button onClick={()=>setErrMsg('')} style={{background:'none',border:'none',color:'#DC2626',cursor:'pointer',fontSize:16,lineHeight:1,padding:'0 4px',marginLeft:8,flexShrink:0}}>×</button></div>}
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
            {m.bonus>0&&m.bonus<m.price&&<div style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:bonoCondColor(m.bono_condicion)}}>{fmt(m.price-m.bonus)}</div><div style={{fontSize:9,color:"#6B7280",textTransform:"uppercase",maxWidth:80,lineHeight:1.2}}>{bonoCondLabel(m.bono_condicion)}</div></div>}
          </div>

          {/* Bono detalle — condición explícita */}
          {m.bonus>0&&m.bonus<m.price&&(()=>{
            const cond=m.bono_condicion;
            const condLabel=bonoCondLabel(cond);
            const condColor=bonoCondColor(cond);
            const isConditional=cond&&cond!=="todo_medio_pago";
            return(
              <div style={{background:condColor+"0F",border:`1px solid ${condColor}33`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:m.bono_tipo||m.bono_requisitos?6:0}}>
                  <span style={{color:condColor,fontWeight:700}}>
                    {m.bono_tipo?`${m.bono_tipo}: `:"Bono "}
                    {fmt(m.bonus)}
                  </span>
                  <span style={{color:"#6B7280"}}>→ precio final {fmt(m.price-m.bonus)}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                  <span style={{fontSize:10,fontWeight:700,color:condColor,background:condColor+"18",padding:"2px 8px",borderRadius:10,border:`1px solid ${condColor}33`}}>
                    {isConditional?"⚠ ":""}{condLabel}
                  </span>
                </div>
                {m.bono_requisitos&&<div style={{marginTop:6,fontSize:11,color:"#6B7280",lineHeight:1.4}}>📋 {m.bono_requisitos}</div>}
              </div>
            );
          })()}

          {/* ════ COLORES — siempre visible, interactivo ════ */}
          {(colors.length>0||canEdit)&&(
            <div style={{marginBottom:16,borderTop:"1px solid #F3F4F6",paddingTop:14}}>

              {/* Título + input para agregar */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:10,color:"#6B7280",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                  Colores{colors.length>0&&` · ${colors.length}`}
                </div>
                {canEdit&&(
                  <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                    <div style={{display:"flex",gap:5}}>
                      {/* Swatch del hex seleccionado para el nuevo color */}
                      <button type="button" onClick={()=>setShowNewPicker(p=>!p)} title="Elegir tono"
                        style={{width:26,height:26,borderRadius:6,background:newColorHex,border:"1.5px solid #E5E7EB",cursor:"pointer",flexShrink:0}}/>
                      <input value={colorInput} onChange={e=>setColorInput(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&addColorImmediate()}
                        placeholder="+ nuevo color"
                        style={{...S.inp,width:110,fontSize:11,height:26,padding:"0 8px"}}/>
                      <button onClick={addColorImmediate}
                        style={{height:26,padding:"0 10px",borderRadius:6,border:"none",background:"#F28100",color:"#ffffff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                        +
                      </button>
                    </div>
                    {showNewPicker&&(
                      <div style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px 12px"}}>
                        <div style={{fontSize:10,color:"#6B7280",marginBottom:7,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Tono del color</div>
                        <ColorPicker value={newColorHex} onChange={setNewColorHex}/>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Paleta de swatches */}
              {colors.length>0&&(
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:activeColor?12:0}}>
                  {colors.map(c=>{
                    const css=getColorCss(c);
                    const isActive=activeColor===c;
                    const hasPhoto=!!getColorPhoto(c);
                    const light=isLightColor(css);
                    return(
                      <div key={c} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative"}}>
                        <button
                          onClick={()=>setActiveColor(isActive?null:c)}
                          title={c}
                          style={{
                            width:44,height:44,borderRadius:22,padding:0,cursor:"pointer",
                            background:css||"#E5E7EB",
                            border:isActive?"3px solid #F28100":`2px solid ${!css?"#D1D5DB":light?"#D1D5DB":"rgba(0,0,0,0.18)"}`,
                            boxShadow:isActive?"0 0 0 2px #FFFFFF,0 0 0 4px #F28100":"0 1px 4px rgba(0,0,0,0.15)",
                            transition:"all 0.12s",
                            position:"relative",
                          }}>
                          {/* Dot verde si tiene foto */}
                          {hasPhoto&&(
                            <span style={{position:"absolute",bottom:1,right:1,width:10,height:10,borderRadius:5,background:"#10B981",border:"2px solid #ffffff",display:"block"}}/>
                          )}
                        </button>
                        <span style={{fontSize:9,fontWeight:isActive?700:500,color:isActive?"#F28100":"#6B7280",textAlign:"center",maxWidth:48,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {c}
                        </span>
                        {/* × quitar color (solo admin) */}
                        {canEdit&&(
                          <button onClick={()=>removeColorImmediate(c)} title="Quitar color"
                            style={{position:"absolute",top:-4,right:-4,width:15,height:15,borderRadius:"50%",background:"#374151",border:"2px solid #ffffff",color:"#ffffff",cursor:"pointer",fontSize:9,lineHeight:"11px",textAlign:"center",padding:0,opacity:0.8}}>
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Panel del color activo */}
              {activeColor&&(()=>{
                const photoUrl=getColorPhoto(activeColor);
                const css=getColorCss(activeColor);
                const hexVal=getColorData(activeColor)?.hex||null;
                const light=isLightColor(css);
                return(
                  <div style={{background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:12,padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
                    {/* Fila superior: foto + info */}
                    <div style={{display:"flex",gap:14,alignItems:"center"}}>
                      <div style={{flexShrink:0}}>
                        {photoUrl
                          ?<img src={photoUrl} alt={activeColor}
                              style={{width:90,height:66,objectFit:"cover",borderRadius:10,border:"1.5px solid #E5E7EB",display:"block",cursor:"pointer"}}
                              onClick={()=>window.open(photoUrl,'_blank')}/>
                          :<div style={{width:90,height:66,borderRadius:10,background:css||"#F3F4F6",border:`1.5px dashed ${css?"rgba(0,0,0,0.15)":"#D1D5DB"}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,opacity:0.6}}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={css&&!light?"#ffffff":"#9CA3AF"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            </div>
                        }
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                          {css&&<span style={{width:14,height:14,borderRadius:7,background:css,border:`1.5px solid ${light?"#D1D5DB":"rgba(0,0,0,0.15)"}`,display:"inline-block",flexShrink:0}}/>}
                          <span style={{fontSize:13,fontWeight:700,color:"#111827"}}>{activeColor}</span>
                          {hexVal&&<span style={{fontSize:10,color:"#9CA3AF",fontFamily:"monospace"}}>{hexVal}</span>}
                        </div>
                        <div style={{fontSize:10,color:"#9CA3AF",marginBottom:canEdit?8:0}}>
                          {photoUrl?"Foto específica de este color":"Sin foto — muestra la imagen general del modelo"}
                        </div>
                        {canEdit&&(
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            <label style={{fontSize:11,fontWeight:600,color:"#F28100",cursor:"pointer",border:"1px solid #FDBA74",borderRadius:7,padding:"5px 12px",background:"#FFFBF0",whiteSpace:"nowrap"}}>
                              {colorPhotoUploading===activeColor?"Subiendo…":(photoUrl?"↺ Cambiar foto":"+ Subir foto")}
                              <input type="file" accept="image/*" style={{display:"none"}} disabled={!!colorPhotoUploading}
                                onChange={e=>e.target.files[0]&&handleUploadColorPhoto(activeColor,e.target.files[0])}/>
                            </label>
                            {photoUrl&&colorPhotoUploading!==activeColor&&(
                              <button onClick={()=>handleRemoveColorPhoto(activeColor)}
                                style={{fontSize:11,color:"#9CA3AF",cursor:"pointer",border:"1px solid #E5E7EB",borderRadius:7,padding:"5px 10px",background:"transparent"}}>
                                Quitar foto
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Fila inferior: color picker para el hex */}
                    {canEdit&&(
                      <div style={{borderTop:"1px solid #F3F4F6",paddingTop:10}}>
                        <div style={{fontSize:10,color:"#6B7280",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Tono visual</div>
                        <ColorPicker value={activeColorHex} onChange={setActiveColorHex}/>
                        <button type="button" onClick={saveActiveColorHex} disabled={savingHex}
                          style={{marginTop:8,height:28,padding:"0 14px",borderRadius:7,border:"none",background:"#111827",color:"#ffffff",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          {savingHex?"Guardando…":"Guardar tono"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {colors.length===0&&canEdit&&(
                <div style={{fontSize:11,color:"#9CA3AF",fontStyle:"italic"}}>Sin colores. Agrega el primero arriba.</div>
              )}
            </div>
          )}

          {/* Descripción */}
          {!editing&&m.description&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#6B7280",textTransform:"uppercase",fontWeight:600,marginBottom:4}}>Descripción</div>
              <div style={{fontSize:13,color:"#4B5563",lineHeight:1.5}}>{m.description}</div>
            </div>
          )}

          {/* Ficha técnica + PDF upload (view mode) */}
          {!editing&&(
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              {m.spec_url&&(
                <a href={m.spec_url} target="_blank" rel="noreferrer" download
                  style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"#F28100",textDecoration:"none",border:"1px solid #FDBA74",borderRadius:8,padding:"6px 12px"}}>
                  📄 Descargar ficha técnica
                </a>
              )}
              {canEdit&&(
                <label style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:"#6B7280",cursor:"pointer",border:"1px solid #E5E7EB",borderRadius:8,padding:"5px 11px",background:"#F9FAFB"}}>
                  {specUploading?"Subiendo…":"📎 "}{!specUploading&&(m.spec_url?"Reemplazar PDF":"Subir PDF")}
                  <input type="file" accept="application/pdf,.pdf" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleUploadSpec(e.target.files[0])}/>
                </label>
              )}
            </div>
          )}

          {/* Galería de fotos (view mode) */}
          {!editing&&gallery.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#6B7280",textTransform:"uppercase",fontWeight:600,marginBottom:6}}>
                Galería <span style={{color:"#D1D5DB",fontWeight:400}}>({gallery.length})</span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {gallery.map((url,i)=>(
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} loading="lazy" alt={`Foto ${i+1}`}
                      style={{width:80,height:60,objectFit:"cover",borderRadius:8,border:"1px solid #E5E7EB",cursor:"pointer",transition:"opacity 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.opacity=0.8}
                      onMouseLeave={e=>e.currentTarget.style.opacity=1}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* FORM EDICIÓN */}
          {editing&&(
            <div style={{borderTop:"1px solid #111827",paddingTop:16,marginTop:4}}>
              <div style={{fontSize:12,fontWeight:700,color:"#F28100",marginBottom:12}}>Editar modelo</div>

              <div className="crm-cat-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <label style={S.lbl}>Marca</label>
                  <input value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={S.lbl}>Modelo (código)</label>
                  <input value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <label style={S.lbl}>Nombre comercial</label>
                <input value={form.commercial_name} onChange={e=>setForm(f=>({...f,commercial_name:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div className="crm-cat-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <label style={S.lbl}>Categoría</label>
                  <CategoryCombo value={form.category||""} onChange={v=>setForm(f=>({...f,category:v}))} allCategories={allCategories||Object.keys(CAT_COLOR)} style={{...S.inp,width:"100%",boxSizing:"border-box"}} listId="cat-detail"/>
                </div>
                <div>
                  <label style={S.lbl}>Cilindrada (cc)</label>
                  <input value={form.cc} onChange={e=>setForm(f=>({...f,cc:e.target.value}))} placeholder="ej: 150" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div className="crm-cat-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <label style={S.lbl}>Año</label>
                  <input value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))} placeholder="ej: 2025" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div/>
              </div>
              <div className="crm-cat-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <label style={S.lbl}>Precio lista ($)</label>
                  <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="ej: 2990000" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={S.lbl}>Bono ($) — monto del descuento</label>
                  <input type="number" value={form.bonus} onChange={e=>setForm(f=>({...f,bonus:e.target.value}))} placeholder="ej: 150000" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                </div>
              </div>
              {/* ─ Configuración del bono ─ */}
              {Number(form.bonus)>0&&(
                <div style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Condición del bono</div>
                  <div style={{marginBottom:8}}>
                    <label style={S.lbl}>¿A qué aplica este bono?</label>
                    <select value={form.bono_condicion} onChange={e=>setForm(f=>({...f,bono_condicion:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}>
                      <option value="">Seleccionar condición...</option>
                      {Object.entries(BONO_CONDICION).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={S.lbl}>Tipo / nombre del bono <span style={{color:"#9CA3AF",fontWeight:400}}>(opcional)</span></label>
                    <input value={form.bono_tipo} onChange={e=>setForm(f=>({...f,bono_tipo:e.target.value}))} placeholder="ej: Bono mes, Bono aniversario..." style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={S.lbl}>Requisitos adicionales <span style={{color:"#9CA3AF",fontWeight:400}}>(opcional)</span></label>
                    <textarea value={form.bono_requisitos} onChange={e=>setForm(f=>({...f,bono_requisitos:e.target.value}))} rows={2} placeholder="ej: Requiere firma de contrato antes del 30/04..." style={{...S.inp,width:"100%",boxSizing:"border-box",resize:"vertical",fontSize:12}}/>
                  </div>
                </div>
              )}
              <div style={{marginBottom:10}}>
                <label style={S.lbl}>Descripción</label>
                <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} style={{...S.inp,width:"100%",boxSizing:"border-box",resize:"vertical"}} placeholder="Descripción comercial del modelo..."/>
              </div>
              {/* Ficha técnica — URL manual o subir PDF */}
              <div style={{marginBottom:10}}>
                <label style={S.lbl}>URL ficha técnica (PDF o página)</label>
                <input value={form.spec_url} onChange={e=>setForm(f=>({...f,spec_url:e.target.value}))} placeholder="https://..." style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                <div style={{marginTop:5,display:"flex",alignItems:"center",gap:8}}>
                  <label style={{fontSize:11,color:"#F28100",cursor:"pointer",border:"1px solid #FDBA74",borderRadius:6,padding:"3px 10px"}}>
                    {specUploading?"Subiendo PDF…":"📎 Subir PDF (máx 15 MB)"}
                    <input type="file" accept="application/pdf,.pdf" style={{display:"none"}}
                      onChange={e=>e.target.files[0]&&handleUploadSpec(e.target.files[0])}/>
                  </label>
                  {m.spec_url&&!specUploading&&<span style={{fontSize:10,color:"#10B981"}}>✓ PDF cargado</span>}
                </div>
              </div>
              {/* Galería de fotos */}
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:10,color:"#6B7280"}}>Galería de fotos ({gallery.length}/{MAX_GALLERY})</div>
                  {gallery.length<MAX_GALLERY&&(
                    <label style={{fontSize:11,color:"#F28100",cursor:"pointer",border:"1px solid #FDBA74",borderRadius:6,padding:"3px 9px"}}>
                      {galleryUploading?"Subiendo…":"+ Foto"}
                      <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleAddGalleryPhoto(e.target.files[0])}/>
                    </label>
                  )}
                </div>
                {gallery.length>0&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {gallery.map((url,i)=>(
                      <div key={i} style={{position:"relative"}}>
                        <img src={url} loading="lazy" alt={`Foto ${i+1}`}
                          style={{width:76,height:58,objectFit:"cover",borderRadius:7,border:"1px solid #E5E7EB",display:"block"}}/>
                        <button onClick={()=>handleRemoveGalleryPhoto(url)}
                          title="Quitar foto"
                          style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"#EF4444",border:"2px solid #FFFFFF",color:"#ffffff",cursor:"pointer",fontSize:11,lineHeight:"14px",textAlign:"center",padding:0,fontWeight:700}}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {gallery.length===0&&<div style={{fontSize:11,color:"#9CA3AF"}}>Sin fotos en galería. Máximo {MAX_GALLERY}, 5 MB cada una.</div>}
              </div>
              {/* Los colores se gestionan en la sección superior (siempre visible) */}
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
                :<div style={{background:"#111827",border:"1px solid #3F1111",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:12,color:"#EF4444",marginBottom:8,fontWeight:600}}>¿Eliminar {m.commercial_name||m.model}?</div>
                  <div style={{fontSize:11,color:"#6B7280",marginBottom:10}}>Esta acción desactiva el modelo del catálogo. No se puede deshacer desde aquí.</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={handleDelete} disabled={deleting} style={{flex:1,padding:"7px",borderRadius:7,border:"none",background:"#EF4444",color:"#ffffff",fontSize:12,cursor:"pointer",fontWeight:600}}>{deleting?"Eliminando…":"Sí, eliminar"}</button>
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

function AddModelModal({onClose,onAdded,allCategories}){
  const[form,setForm]=useState({brand:"",model:"",commercial_name:"",category:"",cc:"",year:new Date().getFullYear(),price:0,bonus:0,bono_tipo:"",bono_condicion:"",bono_requisitos:"",description:"",spec_url:""});
  const[colors,setColors]=useState([]);
  const[colorInput,setColorInput]=useState("");
  const[saving,setSaving]=useState(false);
  const[errMsg,setErrMsg]=useState('');
  const addColor=()=>{const c=colorInput.trim();if(c&&!colors.includes(c))setColors(cs=>[...cs,c]);setColorInput("");};
  const removeColor=(c)=>setColors(cs=>cs.filter(x=>x!==c));
  const handleSubmit=async(e)=>{
    e.preventDefault();
    if(!form.brand.trim()||!form.model.trim()){setErrMsg("Marca y modelo son obligatorios");return;}
    setSaving(true); setErrMsg('');
    try{
      const created=await api.createModel({...form,commercial_name:form.commercial_name||form.model,cc:form.cc?Number(form.cc):null,year:Number(form.year),price:Number(form.price)||0,bonus:Number(form.bonus)||0,bono_tipo:form.bono_tipo||null,bono_condicion:form.bono_condicion||null,bono_requisitos:form.bono_requisitos||null,colors});
      onAdded(created);
      onClose();
    }catch(e){setErrMsg(e?.message||"Error al crear");}
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
          <div className="crm-cat-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <label style={S.lbl}>Marca *</label>
              <input required value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} placeholder="ej: Honda" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={S.lbl}>Modelo (código) *</label>
              <input required value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))} placeholder="ej: CB 300F" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <label style={S.lbl}>Nombre comercial</label>
            <input value={form.commercial_name} onChange={e=>setForm(f=>({...f,commercial_name:e.target.value}))} placeholder="Igual al modelo si se deja vacío" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div className="crm-cat-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <label style={S.lbl}>Categoría</label>
              <CategoryCombo value={form.category||""} onChange={v=>setForm(f=>({...f,category:v}))} allCategories={allCategories||Object.keys(CAT_COLOR)} style={{...S.inp,width:"100%",boxSizing:"border-box"}} listId="cat-add"/>
            </div>
            <div>
              <label style={S.lbl}>Cilindrada (cc)</label>
              <input type="number" value={form.cc} onChange={e=>setForm(f=>({...f,cc:e.target.value}))} placeholder="ej: 300" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <label style={S.lbl}>Año</label>
              <input type="number" value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={S.lbl}>Precio lista ($)</label>
              <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={S.lbl}>Bono ($)</label>
              <input type="number" value={form.bonus} onChange={e=>setForm(f=>({...f,bonus:e.target.value}))} placeholder="0" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
            </div>
          </div>
          {Number(form.bonus)>0&&(
            <div style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Condición del bono</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div>
                  <label style={S.lbl}>¿A qué aplica?</label>
                  <select value={form.bono_condicion} onChange={e=>setForm(f=>({...f,bono_condicion:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box",fontSize:12}}>
                    <option value="">Seleccionar...</option>
                    {Object.entries(BONO_CONDICION).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Tipo de bono</label>
                  <input value={form.bono_tipo} onChange={e=>setForm(f=>({...f,bono_tipo:e.target.value}))} placeholder="ej: Bono mes..." style={{...S.inp,width:"100%",boxSizing:"border-box",fontSize:12}}/>
                </div>
              </div>
              <div>
                <label style={S.lbl}>Requisitos</label>
                <input value={form.bono_requisitos} onChange={e=>setForm(f=>({...f,bono_requisitos:e.target.value}))} placeholder="ej: Requiere contrato antes del 30/04..." style={{...S.inp,width:"100%",boxSizing:"border-box",fontSize:12}}/>
              </div>
            </div>
          )}
          <div style={{marginBottom:10}}>
            <label style={S.lbl}>Descripción</label>
            <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} style={{...S.inp,width:"100%",boxSizing:"border-box",resize:"vertical"}} placeholder="Descripción comercial..."/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={S.lbl}>URL ficha técnica</label>
            <input value={form.spec_url} onChange={e=>setForm(f=>({...f,spec_url:e.target.value}))} placeholder="https://..." style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:16}}>
            <label style={S.lbl}>Colores</label>
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
          <ErrorMsg msg={errMsg}/>
          <div style={{display:"flex",gap:8}}>
            <button type="submit" disabled={saving} style={{...S.btn,flex:1}}>{saving?"Guardando…":"Agregar al catálogo"}</button>
            <button type="button" onClick={onClose} style={{...S.btnSec,flex:1}}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Tarjeta de modelo (reutilizable)
function ModelCard({m,onClick}){
  const colors=Array.isArray(m.colors)?m.colors:(m.colors?JSON.parse(m.colors):[]);
  return(
    <div onClick={onClick}
      style={{...S.card,padding:0,overflow:"hidden",cursor:"pointer",transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.10)"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=S.card.boxShadow}
    >
      {/* Imagen del modelo */}
      {m.image_url
        ?<img src={m.image_url} alt={m.model} style={{width:"100%",height:140,objectFit:"cover",display:"block"}} loading="lazy"/>
        :<div style={{width:"100%",height:140,background:"#F3F4F6",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M8 17.5h7M15 6l2 5h4M5.5 14l2.5-7h5l3 5"/></svg>
        </div>
      }

      {/* Info */}
      <div style={{padding:"12px 14px"}}>
        {/* Marca + Modelo */}
        <div style={{fontSize:14,fontWeight:700,color:"#111827",marginBottom:2,lineHeight:1.2}}>
          {m.brand} {m.commercial_name||m.model}
        </div>
        {/* Año y categoría como badges */}
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
          {m.year&&(
            <span style={{fontSize:10,fontWeight:600,color:"#4F46E5",background:"#EEF2FF",padding:"2px 6px",borderRadius:99}}>
              {m.year}
            </span>
          )}
          {m.category&&(
            <span style={{fontSize:10,fontWeight:600,color:"#6B7280",background:"#F3F4F6",padding:"2px 6px",borderRadius:99}}>
              {m.category}
            </span>
          )}
          {m.cc&&(
            <span style={{fontSize:10,fontWeight:600,color:"#6B7280",background:"#F3F4F6",padding:"2px 6px",borderRadius:99}}>
              {m.cc}cc
            </span>
          )}
        </div>
        {/* Precio */}
        {m.price>0&&(
          <div style={{marginBottom:colors.length>0?8:0}}>
            <div style={{fontSize:15,fontWeight:800,color:"#374151"}}>{fmt(m.price)}</div>
            {m.bonus>0&&m.bonus<m.price&&(()=>{
              const cond=m.bono_condicion;
              const color=bonoCondColor(cond);
              const label=cond&&cond!=="todo_medio_pago"?`${bonoCondLabel(cond)}`:"Todo medio de pago";
              return<div style={{fontSize:10,color}}>{m.bono_tipo||"Bono"} {fmt(m.bonus)} → <b>{fmt(m.price-m.bonus)}</b></div>;
            })()}
          </div>
        )}
        {/* Colores disponibles — swatches CSS */}
        {colors.length>0&&(
          <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
            {colors.slice(0,6).map(c=>(
              <div key={c} title={c} style={{
                width:14,height:14,borderRadius:"50%",
                background:colorNameToCss(c),
                border:"1px solid rgba(0,0,0,0.1)",
                flexShrink:0,
              }}/>
            ))}
            {colors.length>6&&(
              <span style={{fontSize:10,color:"#9CA3AF"}}>+{colors.length-6}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ManageCategoriesPanel({allCategories,onRenamed,onClose}){
  const[renameFrom,setRenameFrom]=useState("");
  const[renameTo,setRenameTo]=useState("");
  const[saving,setSaving]=useState(false);
  const[errMsg,setErrMsg]=useState('');
  const handleRename=async()=>{
    if(!renameFrom||!renameTo.trim()){setErrMsg("Completá ambos campos");return;}
    if(renameFrom===renameTo.trim()){setErrMsg("El nombre nuevo es igual al actual");return;}
    setSaving(true); setErrMsg('');
    try{
      const r=await api.renameCategory(renameFrom,renameTo.trim());
      onRenamed(renameFrom,renameTo.trim(),r.updated);
      setRenameFrom("");setRenameTo("");
    }catch(e){setErrMsg(e?.message||"Error al renombrar");}
    finally{setSaving(false);}
  };
  return(
    <div style={{background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:14,padding:"18px 20px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>Gestionar categorías</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
      </div>
      {/* Categorías existentes */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {allCategories.length===0?<span style={{fontSize:12,color:"#9CA3AF"}}>Sin categorías aún</span>:allCategories.map(c=>(
          <span key={c} onClick={()=>setRenameFrom(c)} title="Renombrar"
            style={{fontSize:11,padding:"4px 12px",borderRadius:20,background:catColor(c)+"18",color:catColor(c),border:`1.5px solid ${renameFrom===c?catColor(c):"transparent"}`,fontWeight:600,cursor:"pointer",transition:"border-color 0.1s"}}>
            {c}
          </span>
        ))}
      </div>
      {/* Renombrar */}
      <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:"0 0 180px"}}>
          <label style={S.lbl}>Categoría a renombrar</label>
          <CategoryCombo value={renameFrom} onChange={setRenameFrom} allCategories={allCategories} style={{...S.inp,width:"100%",boxSizing:"border-box"}} listId="cat-rename"/>
        </div>
        <div style={{flex:"0 0 180px"}}>
          <label style={S.lbl}>Nuevo nombre</label>
          <input value={renameTo} onChange={e=>setRenameTo(e.target.value)} placeholder="ej: Enduro" style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
        </div>
        <button onClick={handleRename} disabled={saving||!renameFrom||!renameTo.trim()}
          style={{...S.btn,padding:"7px 16px",fontSize:12,opacity:saving||!renameFrom||!renameTo.trim()?0.6:1}}>
          {saving?"Guardando…":"Renombrar en todos los modelos"}
        </button>
      </div>
      {errMsg&&<div style={{marginTop:10}}><ErrorMsg msg={errMsg}/></div>}
      <div style={{fontSize:11,color:"#9CA3AF",marginTop:8}}>
        Renombrar actualiza la categoría en todos los modelos que la tengan asignada.
        Para crear una categoría nueva, asignala directamente al editar un modelo.
      </div>
    </div>
  );
}

export function CatalogView({user}){
  const[models,setModels]=useState([]);
  const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);
  const[showAdd,setShowAdd]=useState(false);
  const[showManageCats,setShowManageCats]=useState(false);
  const[successMsg,setSuccessMsg]=useState('');
  // Navegación: null = vista marcas, string = marca activa
  const[activeBrand,setActiveBrand]=useState(null);
  // null = todas las categorías de la marca, string = categoría activa
  const[activeCat,setActiveCat]=useState(null);
  // búsqueda global (solo en vista todas)
  const[search,setSearch]=useState("");
  const canEdit=user&&(user.role==="super_admin"||user.role==="admin_comercial");
  const canDelete=user&&user.role==="super_admin";
  const isMobile=useIsMobile();
  const isTablet=useIsMobile(1024);
  const gridCols=isMobile?'1fr':isTablet?'repeat(2,1fr)':'repeat(auto-fill, minmax(220px,1fr))';

  useEffect(()=>{
    api.getModels().then(d=>setModels(Array.isArray(d)?d:[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const onSaved=(updated)=>{setModels(ms=>ms.map(m=>m.id===updated.id?updated:m));setSelected(updated);};
  const onAdded=(created)=>{setModels(ms=>[...ms,created]);};
  const onDeleted=(id)=>{setModels(ms=>ms.filter(m=>m.id!==id));setSelected(null);};
  const handleCategoryRenamed=(from,to,count)=>{
    setModels(ms=>ms.map(m=>m.category===from?{...m,category:to}:m));
    setSuccessMsg(`Categoría renombrada: "${from}" → "${to}" (${count} modelo${count!==1?"s":""})`);
  };

  // Categorías únicas (modelos + hardcoded como fallback)
  const allCategories=[...new Set([
    ...Object.keys(CAT_COLOR),
    ...models.map(m=>m.category).filter(Boolean)
  ])].sort();

  // Marcas únicas ordenadas
  const brands=[...new Set(models.map(m=>m.brand))].sort();

  // ── Vista: lista de marcas ──────────────────────────────────────────────
  if(!activeBrand){
    const q=search.toLowerCase();
    const filteredModels=q?models.filter(m=>(m.brand+m.model+(m.commercial_name||"")).toLowerCase().includes(q)):models;
    const visibleBrands=brands.filter(b=>filteredModels.some(m=>m.brand===b));
    return(
      <div>
        {successMsg&&(
          <div style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.25)',borderRadius:8,padding:'9px 13px',color:'#065F46',fontSize:12,fontWeight:500,marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>{successMsg}</span>
            <button onClick={()=>setSuccessMsg('')} style={{background:'none',border:'none',color:'#065F46',cursor:'pointer',fontSize:16,lineHeight:1,padding:'0 4px'}}>×</button>
          </div>
        )}
        <ViewHeader
          preheader="Referencia · Catálogo"
          title="Catálogo"
          subtitle={loading ? undefined : `${models.length} modelos · ${brands.length} marcas`}
          actions={
            <>
              {canEdit && <button onClick={()=>setShowManageCats(v=>!v)} style={{...S.btn2,fontSize:12,padding:"6px 14px"}}>Categorías</button>}
              {canEdit && <button onClick={()=>setShowAdd(true)} style={{...S.btn,fontSize:12,padding:"7px 16px"}}>+ Agregar moto</button>}
            </>
          }
        />

        {loading&&<Loader label="Cargando catálogo…"/>}

        {!loading&&(
          <>
            {/* Panel gestión categorías */}
            {canEdit&&showManageCats&&<ManageCategoriesPanel allCategories={allCategories} onRenamed={handleCategoryRenamed} onClose={()=>setShowManageCats(false)}/>}

            {/* Barra de filtros: búsqueda global */}
            <div style={{display:'flex',alignItems:'center',gap:10,background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:10,padding:'8px 12px',marginBottom:20}}>
              <Ic.search size={14} color="#9CA3AF" style={{flexShrink:0}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar marca, modelo..." style={{...S.inp,border:'none',background:'transparent',padding:0,outline:'none',flex:1}}/>
            </div>

            {/* Si hay búsqueda, mostrar resultados flat */}
            {q?(
              filteredModels.length===0?(
                <Empty icon={Ic.search} title={`Sin resultados para "${search}"`} hint="Intenta con otra marca o nombre de modelo."/>
              ):(
                <div>
                  <div style={{fontSize:11,color:"#9CA3AF",marginBottom:12,fontWeight:600}}>{filteredModels.length} resultado{filteredModels.length!==1?"s":""}</div>
                  <div style={{display:"grid",gridTemplateColumns:gridCols,gap:12}}>
                    {filteredModels.map(m=><ModelCard key={m.id} m={m} onClick={()=>setSelected(m)}/>)}
                  </div>
                </div>
              )
            ):(
              /* Grid de marcas */
              visibleBrands.length===0?(
                <Empty icon={Ic.bike} title="Catálogo vacío" hint="Agrega el primer modelo para comenzar." action={canEdit&&<button onClick={()=>setShowAdd(true)} style={S.btn}>+ Agregar moto</button>}/>
              ):(
                <div style={{display:"grid",gridTemplateColumns:gridCols,gap:12}}>
                  {visibleBrands.map(brand=>{
                    const bms=models.filter(m=>m.brand===brand);
                    const cats=[...new Set(bms.map(m=>m.category).filter(Boolean))].sort();
                    return(
                      <div key={brand} onClick={()=>{setActiveBrand(brand);setActiveCat(null);}}
                        style={{...S.card,cursor:"pointer",transition:"box-shadow 0.15s,border-color 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#F28100";e.currentTarget.style.boxShadow="0 4px 18px rgba(242,129,0,0.12)";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor="#E5E7EB";e.currentTarget.style.boxShadow=S.card.boxShadow;}}
                      >
                        <div style={{fontSize:18,fontWeight:900,color:"#111827",letterSpacing:"-0.5px",marginBottom:4}}>{brand}</div>
                        <div style={{fontSize:12,color:"#9CA3AF",marginBottom:cats.length?12:0}}>{bms.length} modelo{bms.length!==1?"s":""}</div>
                        {cats.length>0&&(
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {cats.map(c=>(
                              <span key={c} style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:catColor(c)+"18",color:catColor(c),fontWeight:600,border:`1px solid ${catColor(c)}30`}}>
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}

        {showAdd&&<AddModelModal onClose={()=>setShowAdd(false)} onAdded={onAdded} allCategories={allCategories}/>}
        {selected&&<ModelDetailModal model={selected} canEdit={canEdit} canDelete={canDelete} onClose={()=>setSelected(null)} onSaved={onSaved} onDeleted={onDeleted} allCategories={allCategories}/>}
      </div>
    );
  }

  // ── Vista: marca seleccionada (categorías + modelos) ────────────────────
  const brandModels=models.filter(m=>m.brand===activeBrand);
  const brandCats=[...new Set(brandModels.map(m=>m.category).filter(Boolean))].sort();
  const shownModels=activeCat?brandModels.filter(m=>m.category===activeCat):brandModels;
  const uncategorized=brandModels.filter(m=>!m.category);

  return(
    <div>
      {/* Breadcrumb / header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>{setActiveBrand(null);setActiveCat(null);}}
            style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:"#9CA3AF",fontSize:13,fontWeight:600,cursor:"pointer",padding:0,fontFamily:"inherit"}}>
            <Ic.back size={14}/> Catálogo
          </button>
          <span style={{color:"#D1D5DB"}}>/</span>
          <span style={{fontSize:16,fontWeight:800,color:"#111827"}}>{activeBrand}</span>
          {activeCat&&<><span style={{color:"#D1D5DB"}}>/</span><span style={{fontSize:14,fontWeight:700,color:catColor(activeCat)}}>{activeCat}</span></>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:12,color:"#9CA3AF"}}>{shownModels.length} modelo{shownModels.length!==1?"s":""}</span>
          {canEdit&&<button onClick={()=>setShowAdd(true)} style={{...S.btn,fontSize:12,padding:"7px 16px"}}>+ Agregar moto</button>}
        </div>
      </div>

      {/* Pills de categoría */}
      {brandCats.length>0&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          <button onClick={()=>setActiveCat(null)}
            style={{padding:"6px 16px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,
                    background:!activeCat?"#111827":"#F3F4F6",color:!activeCat?"#FFFFFF":"#4B5563",transition:"all 0.12s"}}>
            Todos ({brandModels.length})
          </button>
          {brandCats.map(c=>{
            const cnt=brandModels.filter(m=>m.category===c).length;
            const active=activeCat===c;
            return(
              <button key={c} onClick={()=>setActiveCat(c)}
                style={{padding:"6px 16px",borderRadius:20,border:`1.5px solid ${active?catColor(c):"#E5E7EB"}`,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,
                        background:active?catColor(c):"#FFFFFF",color:active?"#FFFFFF":catColor(c),transition:"all 0.12s"}}>
                {c} <span style={{fontWeight:400,opacity:0.75}}>({cnt})</span>
              </button>
            );
          })}
          {uncategorized.length>0&&(
            <button onClick={()=>setActiveCat("__sin_categoria")}
              style={{padding:"6px 16px",borderRadius:20,border:`1.5px solid ${activeCat==="__sin_categoria"?"#6B7280":"#E5E7EB"}`,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,
                      background:activeCat==="__sin_categoria"?"#6B7280":"#FFFFFF",color:activeCat==="__sin_categoria"?"#FFFFFF":"#6B7280"}}>
              Sin categoría ({uncategorized.length})
            </button>
          )}
        </div>
      )}

      {/* Grid de modelos */}
      {(() => {
        const list=activeCat==="__sin_categoria"?uncategorized:shownModels;
        return list.length===0?(
          <Empty icon={Ic.bike} title="Sin modelos en esta categoría" hint="Cambia el filtro o agrega un modelo nuevo."/>
        ):(
          <div style={{display:"grid",gridTemplateColumns:gridCols,gap:12}}>
            {list.map(m=><ModelCard key={m.id} m={m} onClick={()=>setSelected(m)}/>)}
          </div>
        );
      })()}

      {showAdd&&<AddModelModal onClose={()=>setShowAdd(false)} onAdded={onAdded} allCategories={allCategories}/>}
      {selected&&<ModelDetailModal model={selected} canEdit={canEdit} canDelete={canDelete} onClose={()=>setSelected(null)} onSaved={onSaved} onDeleted={onDeleted} allCategories={allCategories}/>}
    </div>
  );
}

