import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { ColorPicker } from './ColorPicker.jsx';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, CAT_COLOR, ViewHeader, colorNameToCss, useIsMobile, Empty, Loader, ErrorMsg, hasRole, ROLES, useConfirm, Btn } from '../ui.jsx';

function catColor(c){return CAT_COLOR[c]||"var(--text-muted)";}

const BONO_CONDICION={
  todo_medio_pago:     {l:"Todo medio de pago",     c:"#10B981"},
  solo_financiamiento: {l:"Solo financiamiento",     c:"#8B5CF6"},
  solo_autofin:        {l:"Solo Autofin",             c:"var(--brand)"},
  contado_transferencia:{l:"Contado / Transferencia", c:"#3B82F6"},
  otro:                {l:"Otro (ver requisitos)",    c:"var(--text-subtle)"},
};
// Devuelve el label de condición dado el valor guardado
function bonoCondLabel(condicion){
  return BONO_CONDICION[condicion]?.l || (condicion ? condicion : "Todo medio de pago");
}
function bonoCondColor(condicion){
  return BONO_CONDICION[condicion]?.c || "#10B981";
}

// Resolver color CSS: usa colorNameToCss de ui.jsx (fuente única).
// Retorna null cuando no hay match (el fallback de colorNameToCss es 'var(--text-disabled)',
// así que lo convertimos a null para mantener la semántica de "sin color conocido").
function colorToCss(name){
  if(!name) return null;
  const r=colorNameToCss(name);
  return r==='var(--text-disabled)'?null:r;
}
// Dado un CSS de fondo, devuelve si es "claro" (necesita texto oscuro)
function isLightColor(css){
  if(!css) return false;
  const light=['var(--surface-muted)','var(--surface-muted)','#F0EDE8','#E8E0D0','#FEF3C7','var(--border)','var(--border-strong)','var(--border-strong)','#D4B896'];
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
  const[newColorHex,setNewColorHex]=useState('var(--text)');
  const[showNewPicker,setShowNewPicker]=useState(false);
  const[activeColorHex,setActiveColorHex]=useState('var(--text)');
  const[savingHex,setSavingHex]=useState(false);
  const MAX_GALLERY=8;
  // Sync hex picker cuando cambia el color activo
  useEffect(()=>{
    if(activeColor){const d=getColorData(activeColor);setActiveColorHex(d?.hex||colorToCss(activeColor)||'var(--text)');}
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
      <div style={{background:"var(--surface)",borderRadius:16,width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto",border:"1px solid var(--border)",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
        {/* Header imagen — cambia según color seleccionado */}
        <div style={{position:"relative",height:260,background:"linear-gradient(180deg,#FAFAFA 0%,var(--surface-sunken) 100%)",borderRadius:"16px 16px 0 0",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {displayPhoto
            ?<img key={displayPhoto} src={displayPhoto} alt={m.model}
                style={{maxWidth:"calc(100% - 48px)",maxHeight:"calc(100% - 40px)",width:"auto",height:"auto",display:"block",objectFit:"contain",transition:"opacity 0.2s"}}/>
            :<div style={{color:"var(--border-strong)",fontSize:13,fontWeight:500,letterSpacing:"0.05em"}}>SIN IMAGEN</div>
          }
          {/* Badge del color activo */}
          {activeColor&&(
            <div style={{position:"absolute",bottom:14,left:16,display:"flex",alignItems:"center",gap:7,background:"rgba(15,23,42,0.78)",borderRadius:20,padding:"5px 12px",backdropFilter:"blur(6px)"}}>
              {(()=>{const css=getColorCss(activeColor);return css?<span style={{width:11,height:11,borderRadius:6,background:css,border:"1px solid rgba(255,255,255,0.5)",display:"inline-block",flexShrink:0}}/>:null;})()}
              <span style={{fontSize:11,fontWeight:700,color:"var(--text-on-dark)",letterSpacing:"0.04em"}}>{activeColor}</span>
            </div>
          )}
          {/* Botón cambiar foto principal (solo sin color activo) */}
          {canEdit&&!activeColor&&(
            <label style={{position:"absolute",bottom:14,right:14,background:"rgba(255,255,255,0.95)",border:"1px solid var(--border-strong)",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",color:"var(--text-body)",boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
              {imgUploading?"Subiendo…":"Cambiar foto"}
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadMainImg(e.target.files[0])}/>
            </label>
          )}
          <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"rgba(255,255,255,0.95)",border:"none",borderRadius:20,width:32,height:32,color:"var(--text-body)",cursor:"pointer",fontSize:18,lineHeight:"32px",textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}>×</button>
        </div>

        <div style={{padding:"22px 24px"}}>
          {errMsg&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><ErrorMsg msg={errMsg}/><button onClick={()=>setErrMsg('')} style={{background:'none',border:'none',color:'#DC2626',cursor:'pointer',fontSize:16,lineHeight:1,padding:'0 4px',marginLeft:8,flexShrink:0}}>×</button></div>}
          {/* Identidad: marca + categoría */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:10,color:"var(--text-disabled)",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.14em"}}>{m.brand}</div>
            {m.category&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:10,background:catColor(m.category)+"18",color:catColor(m.category),fontWeight:700,border:`1px solid ${catColor(m.category)}33`,letterSpacing:"0.02em"}}>{m.category}</span>}
          </div>

          {/* Nombre comercial */}
          <div style={{fontSize:24,fontWeight:800,lineHeight:1.15,marginBottom:m.commercial_name&&m.commercial_name!==m.model?2:16,letterSpacing:"-0.015em",color:"var(--text)"}}>{m.commercial_name||m.model}</div>
          {m.commercial_name&&m.commercial_name!==m.model&&<div style={{fontSize:12,color:"var(--text-disabled)",marginBottom:16,fontWeight:500}}>{m.model}</div>}

          {/* Price bar — precio lista · bono · precio final */}
          {m.price>0&&(()=>{
            const hasBono=m.bonus>0&&m.bonus<m.price;
            const finalPrice=hasBono?m.price-m.bonus:m.price;
            const condColor=hasBono?bonoCondColor(m.bono_condicion):"var(--text)";
            return(
              <div style={{display:"flex",alignItems:"stretch",gap:1,marginBottom:14,border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",background:"var(--surface-sunken)"}}>
                <div style={{flex:1,background:"var(--surface)",padding:"10px 14px"}}>
                  <div style={{fontSize:9,color:"var(--text-disabled)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>Precio lista</div>
                  <div style={{fontSize:16,fontWeight:800,color:"var(--text-body)",textDecoration:hasBono?"line-through":"none",textDecorationColor:"#CBD5E1"}}>{fmt(m.price)}</div>
                </div>
                {hasBono&&(
                  <div style={{flex:1.2,background:condColor,padding:"10px 14px",color:"var(--text-on-dark)"}}>
                    <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3,opacity:0.85}}>Con bono</div>
                    <div style={{fontSize:18,fontWeight:900,letterSpacing:"-0.01em"}}>{fmt(finalPrice)}</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Chips de specs */}
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {m.year&&<span style={{background:"var(--surface-sunken)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 11px",fontSize:11,fontWeight:600,color:"var(--text-body)"}}>
              <span style={{color:"var(--text-disabled)",marginRight:5}}>Año</span>{m.year}
            </span>}
            {specInfo&&specInfo!=="—"&&<span style={{background:"var(--surface-sunken)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 11px",fontSize:11,fontWeight:600,color:"var(--text-body)"}}>
              <span style={{color:"var(--text-disabled)",marginRight:5}}>Cilindrada</span>{specInfo}
            </span>}
          </div>

          {/* Bono detalle — condición explícita */}
          {m.bonus>0&&m.bonus<m.price&&(()=>{
            const cond=m.bono_condicion;
            const condLabel=bonoCondLabel(cond);
            const condColor=bonoCondColor(cond);
            return(
              <div style={{background:condColor+"0D",border:`1px solid ${condColor}2A`,borderLeft:`3px solid ${condColor}`,borderRadius:8,padding:"11px 14px",marginBottom:16,fontSize:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontWeight:800,color:condColor,background:condColor+"1A",padding:"3px 9px",borderRadius:10,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                    {condLabel}
                  </span>
                  <span style={{color:"var(--text-body)",fontWeight:600}}>
                    {m.bono_tipo?`${m.bono_tipo}: `:"Bono "}
                    <span style={{color:condColor,fontWeight:700}}>{fmt(m.bonus)}</span>
                  </span>
                </div>
                {m.bono_requisitos&&<div style={{marginTop:6,fontSize:11,color:"var(--text-subtle)",lineHeight:1.45}}>{m.bono_requisitos}</div>}
              </div>
            );
          })()}

          {/* ════ COLORES — siempre visible, interactivo ════ */}
          {(colors.length>0||canEdit)&&(
            <div style={{marginBottom:16,borderTop:"1px solid var(--surface-sunken)",paddingTop:14}}>

              {/* Título + input para agregar */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:10,color:"var(--text-subtle)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                  Colores{colors.length>0&&` · ${colors.length}`}
                </div>
                {canEdit&&(
                  <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                    <div style={{display:"flex",gap:5}}>
                      {/* Swatch del hex seleccionado para el nuevo color */}
                      <button type="button" onClick={()=>setShowNewPicker(p=>!p)} title="Elegir tono"
                        style={{width:26,height:26,borderRadius:6,background:newColorHex,border:"1.5px solid var(--border)",cursor:"pointer",flexShrink:0}}/>
                      <input value={colorInput} onChange={e=>setColorInput(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&addColorImmediate()}
                        placeholder="+ nuevo color"
                        style={{...S.inp,width:110,fontSize:11,height:26,padding:"0 8px"}}/>
                      <button onClick={addColorImmediate}
                        style={{height:26,padding:"0 10px",borderRadius:6,border:"none",background:"var(--brand)",color:"var(--text-on-brand)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                        +
                      </button>
                    </div>
                    {showNewPicker&&(
                      <div style={{background:"var(--surface-muted)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px"}}>
                        <div style={{fontSize:10,color:"var(--text-subtle)",marginBottom:7,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Tono del color</div>
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
                            background:css||"var(--border)",
                            border:isActive?"3px solid var(--brand)":`2px solid ${!css?"var(--border-strong)":light?"var(--border-strong)":"rgba(0,0,0,0.18)"}`,
                            boxShadow:isActive?"0 0 0 2px var(--surface),0 0 0 4px var(--brand)":"0 1px 4px rgba(0,0,0,0.15)",
                            transition:"all 0.12s",
                            position:"relative",
                          }}>
                          {/* Dot verde si tiene foto */}
                          {hasPhoto&&(
                            <span style={{position:"absolute",bottom:1,right:1,width:10,height:10,borderRadius:5,background:"#10B981",border:"2px solid var(--surface)",display:"block"}}/>
                          )}
                        </button>
                        <span style={{fontSize:9,fontWeight:isActive?700:500,color:isActive?"var(--brand)":"var(--text-subtle)",textAlign:"center",maxWidth:48,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {c}
                        </span>
                        {/* × quitar color (solo admin) */}
                        {canEdit&&(
                          <button onClick={()=>removeColorImmediate(c)} title="Quitar color"
                            style={{position:"absolute",top:-4,right:-4,width:15,height:15,borderRadius:"50%",background:"var(--text-body)",border:"2px solid var(--surface)",color:"var(--text-on-dark)",cursor:"pointer",fontSize:9,lineHeight:"11px",textAlign:"center",padding:0,opacity:0.8}}>
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
                  <div style={{background:"var(--surface-muted)",border:"1.5px solid var(--border)",borderRadius:12,padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
                    {/* Fila superior: foto + info */}
                    <div style={{display:"flex",gap:14,alignItems:"center"}}>
                      <div style={{flexShrink:0}}>
                        {photoUrl
                          ?<img src={photoUrl} alt={activeColor}
                              style={{width:90,height:66,objectFit:"cover",borderRadius:10,border:"1.5px solid var(--border)",display:"block",cursor:"pointer"}}
                              onClick={()=>window.open(photoUrl,'_blank')}/>
                          :<div style={{width:90,height:66,borderRadius:10,background:css||"var(--surface-sunken)",border:`1.5px dashed ${css?"rgba(0,0,0,0.15)":"var(--border-strong)"}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,opacity:0.6}}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={css&&!light?"var(--text-on-dark)":"var(--text-disabled)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            </div>
                        }
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                          {css&&<span style={{width:14,height:14,borderRadius:7,background:css,border:`1.5px solid ${light?"var(--border-strong)":"rgba(0,0,0,0.15)"}`,display:"inline-block",flexShrink:0}}/>}
                          <span style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{activeColor}</span>
                          {hexVal&&<span style={{fontSize:10,color:"var(--text-disabled)",fontFamily:'inherit'}}>{hexVal}</span>}
                        </div>
                        <div style={{fontSize:10,color:"var(--text-disabled)",marginBottom:canEdit?8:0}}>
                          {photoUrl?"Foto específica de este color":"Sin foto — muestra la imagen general del modelo"}
                        </div>
                        {canEdit&&(
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            <label style={{fontSize:11,fontWeight:600,color:"var(--brand)",cursor:"pointer",border:"1px solid #FDBA74",borderRadius:7,padding:"5px 12px",background:"#FFFBF0",whiteSpace:"nowrap"}}>
                              {colorPhotoUploading===activeColor?"Subiendo…":(photoUrl?"↺ Cambiar foto":"+ Subir foto")}
                              <input type="file" accept="image/*" style={{display:"none"}} disabled={!!colorPhotoUploading}
                                onChange={e=>e.target.files[0]&&handleUploadColorPhoto(activeColor,e.target.files[0])}/>
                            </label>
                            {photoUrl&&colorPhotoUploading!==activeColor&&(
                              <button onClick={()=>handleRemoveColorPhoto(activeColor)}
                                style={{fontSize:11,color:"var(--text-disabled)",cursor:"pointer",border:"1px solid var(--border)",borderRadius:7,padding:"5px 10px",background:"transparent"}}>
                                Quitar foto
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Fila inferior: color picker para el hex */}
                    {canEdit&&(
                      <div style={{borderTop:"1px solid var(--surface-sunken)",paddingTop:10}}>
                        <div style={{fontSize:10,color:"var(--text-subtle)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Tono visual</div>
                        <ColorPicker value={activeColorHex} onChange={setActiveColorHex}/>
                        <button type="button" onClick={saveActiveColorHex} disabled={savingHex}
                          style={{marginTop:8,height:28,padding:"0 14px",borderRadius:7,border:"none",background:"var(--text)",color:"var(--text-on-dark)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          {savingHex?"Guardando…":"Guardar tono"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {colors.length===0&&canEdit&&(
                <div style={{fontSize:11,color:"var(--text-disabled)",fontStyle:"italic"}}>Sin colores. Agrega el primero arriba.</div>
              )}
            </div>
          )}

          {/* Descripción */}
          {!editing&&m.description&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"var(--text-subtle)",textTransform:"uppercase",fontWeight:600,marginBottom:4}}>Descripción</div>
              <div style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.5}}>{m.description}</div>
            </div>
          )}

          {/* Ficha técnica + PDF upload (view mode) */}
          {!editing&&(
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              {m.spec_url&&(
                <a href={m.spec_url} target="_blank" rel="noreferrer" download
                  style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"var(--brand)",textDecoration:"none",border:"1px solid #FDBA74",borderRadius:8,padding:"6px 12px"}}>
                  Descargar ficha técnica
                </a>
              )}
              {canEdit&&(
                <label style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:"var(--text-subtle)",cursor:"pointer",border:"1px solid var(--border)",borderRadius:8,padding:"5px 11px",background:"var(--surface-muted)"}}>
                  {specUploading?"Subiendo…":(m.spec_url?"Reemplazar PDF":"Subir PDF")}
                  <input type="file" accept="application/pdf,.pdf" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleUploadSpec(e.target.files[0])}/>
                </label>
              )}
            </div>
          )}

          {/* Galería de fotos (view mode) */}
          {!editing&&gallery.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"var(--text-subtle)",textTransform:"uppercase",fontWeight:600,marginBottom:6}}>
                Galería <span style={{color:"var(--border-strong)",fontWeight:400}}>({gallery.length})</span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {gallery.map((url,i)=>(
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} loading="lazy" alt={`Foto ${i+1}`}
                      style={{width:80,height:60,objectFit:"cover",borderRadius:8,border:"1px solid var(--border)",cursor:"pointer",transition:"opacity 0.15s"}}
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
            <div style={{borderTop:"1px solid var(--text)",paddingTop:16,marginTop:4}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--brand)",marginBottom:12}}>Editar modelo</div>

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
                <div style={{background:"var(--surface-muted)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--text-subtle)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Condición del bono</div>
                  <div style={{marginBottom:8}}>
                    <label style={S.lbl}>¿A qué aplica este bono?</label>
                    <select value={form.bono_condicion} onChange={e=>setForm(f=>({...f,bono_condicion:e.target.value}))} style={{...S.inp,width:"100%",boxSizing:"border-box"}}>
                      <option value="">Seleccionar condición...</option>
                      {Object.entries(BONO_CONDICION).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={S.lbl}>Tipo / nombre del bono <span style={{color:"var(--text-disabled)",fontWeight:400}}>(opcional)</span></label>
                    <input value={form.bono_tipo} onChange={e=>setForm(f=>({...f,bono_tipo:e.target.value}))} placeholder="ej: Bono mes, Bono aniversario..." style={{...S.inp,width:"100%",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={S.lbl}>Requisitos adicionales <span style={{color:"var(--text-disabled)",fontWeight:400}}>(opcional)</span></label>
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
                  <label style={{fontSize:11,color:"var(--brand)",cursor:"pointer",border:"1px solid #FDBA74",borderRadius:6,padding:"3px 10px"}}>
                    {specUploading?"Subiendo PDF…":"Subir PDF (máx 15 MB)"}
                    <input type="file" accept="application/pdf,.pdf" style={{display:"none"}}
                      onChange={e=>e.target.files[0]&&handleUploadSpec(e.target.files[0])}/>
                  </label>
                  {m.spec_url&&!specUploading&&<span style={{fontSize:10,color:"#10B981"}}>PDF cargado</span>}
                </div>
              </div>
              {/* Galería de fotos */}
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:10,color:"var(--text-subtle)"}}>Galería de fotos ({gallery.length}/{MAX_GALLERY})</div>
                  {gallery.length<MAX_GALLERY&&(
                    <label style={{fontSize:11,color:"var(--brand)",cursor:"pointer",border:"1px solid #FDBA74",borderRadius:6,padding:"3px 9px"}}>
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
                          style={{width:76,height:58,objectFit:"cover",borderRadius:7,border:"1px solid var(--border)",display:"block"}}/>
                        <button onClick={()=>handleRemoveGalleryPhoto(url)}
                          title="Quitar foto"
                          style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"#EF4444",border:"2px solid var(--surface)",color:"var(--text-on-dark)",cursor:"pointer",fontSize:11,lineHeight:"14px",textAlign:"center",padding:0,fontWeight:700}}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {gallery.length===0&&<div style={{fontSize:11,color:"var(--text-disabled)"}}>Sin fotos en galería. Máximo {MAX_GALLERY}, 5 MB cada una.</div>}
              </div>
              {/* Los colores se gestionan en la sección superior (siempre visible) */}
              <div style={{display:"flex",gap:8}}>
                <Btn variant='primary' onClick={save} disabled={saving} style={{flex:1}}>{saving?"Guardando…":"Guardar"}</Btn>
                <Btn variant='secondary' onClick={()=>setEditing(false)} style={{flex:1}}>Cancelar</Btn>
              </div>
            </div>
          )}

          {canEdit&&!editing&&(
            <Btn variant='secondary' size='sm' onClick={startEdit} style={{width:"100%",marginTop:8}}>Editar modelo</Btn>
          )}

          {/* Eliminar — solo super_admin */}
          {canDelete&&!editing&&(
            <div style={{marginTop:8}}>
              {!confirmDel
                ?<button onClick={()=>setConfirmDel(true)} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #3F1111",background:"transparent",color:"#EF4444",fontSize:12,cursor:"pointer"}}>Eliminar del catálogo</button>
                :<div style={{background:"var(--text)",border:"1px solid #3F1111",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:12,color:"#EF4444",marginBottom:8,fontWeight:600}}>¿Eliminar {m.commercial_name||m.model}?</div>
                  <div style={{fontSize:11,color:"var(--text-subtle)",marginBottom:10}}>Esta acción desactiva el modelo del catálogo. No se puede deshacer desde aquí.</div>
                  <div style={{display:"flex",gap:6}}>
                    <Btn variant='danger' size='sm' onClick={handleDelete} disabled={deleting} style={{flex:1}}>{deleting?"Eliminando…":"Sí, eliminar"}</Btn>
                    <Btn variant='secondary' size='sm' onClick={()=>setConfirmDel(false)} style={{flex:1}}>Cancelar</Btn>
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

function AddModelModal({onClose,onAdded,allCategories,defaultBrand}){
  const[form,setForm]=useState({brand:defaultBrand||"",model:"",commercial_name:"",category:"",cc:"",year:new Date().getFullYear(),price:0,bonus:0,bono_tipo:"",bono_condicion:"",bono_requisitos:"",description:"",spec_url:""});
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
      <div style={{background:"var(--surface)",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",border:"1px solid var(--border)"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontWeight:700,fontSize:15}}>Agregar moto al catálogo</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-subtle)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
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
            <div style={{background:"var(--surface-muted)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--text-subtle)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Condición del bono</div>
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
                <span key={c} style={{fontSize:11,padding:"3px 8px",borderRadius:10,background:"var(--surface-sunken)",color:"var(--text-disabled)",border:"1px solid var(--border-strong)",display:"flex",alignItems:"center",gap:4}}>
                  {c}<button type="button" onClick={()=>removeColor(c)} style={{background:"none",border:"none",color:"var(--text-subtle)",cursor:"pointer",padding:0,fontSize:12}}>×</button>
                </span>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <input value={colorInput} onChange={e=>setColorInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addColor();}}} placeholder="Agregar color..." style={{...S.inp,flex:1}}/>
              <Btn variant='primary' size='sm' type="button" onClick={addColor}>+</Btn>
            </div>
          </div>
          <ErrorMsg msg={errMsg}/>
          <div style={{display:"flex",gap:8}}>
            <Btn variant='primary' type="submit" disabled={saving} style={{flex:1}}>{saving?"Guardando…":"Agregar al catálogo"}</Btn>
            <Btn variant='secondary' type="button" onClick={onClose} style={{flex:1}}>Cancelar</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// Tarjeta de modelo (reutilizable)
function ModelCard({m,onClick}){
  const colors=Array.isArray(m.colors)?m.colors:(m.colors?JSON.parse(m.colors):[]);
  // color_photos guarda hex personalizado por color (editable en el detalle).
  // Si existe, tiene prioridad sobre colorNameToCss — así los colores propios
  // del modelo ("Goan Black", "Stellar", etc.) dejan de aparecer todos en gris.
  const colorPhotos=Array.isArray(m.color_photos)?m.color_photos:(m.color_photos?JSON.parse(m.color_photos):[]);
  const swatchCss=(c)=>{
    const entry=colorPhotos.find(p=>p.color?.toLowerCase().trim()===c.toLowerCase().trim());
    return entry?.hex||colorNameToCss(c);
  };
  return(
    <div onClick={onClick}
      style={{...S.card,padding:0,overflow:"hidden",cursor:"pointer",transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.10)"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=S.card.boxShadow}
    >
      {/* Imagen del modelo */}
      {m.image_url
        ?<img src={m.image_url} alt={m.model} style={{width:"100%",height:140,objectFit:"cover",display:"block"}} loading="lazy"/>
        :<div style={{width:"100%",height:140,background:"var(--surface-sunken)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M8 17.5h7M15 6l2 5h4M5.5 14l2.5-7h5l3 5"/></svg>
        </div>
      }

      {/* Info */}
      <div style={{padding:"12px 14px"}}>
        {/* Marca + Modelo */}
        <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:2,lineHeight:1.2}}>
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
            <span style={{fontSize:10,fontWeight:600,color:"var(--text-subtle)",background:"var(--surface-sunken)",padding:"2px 6px",borderRadius:99}}>
              {m.category}
            </span>
          )}
          {m.cc&&(
            <span style={{fontSize:10,fontWeight:600,color:"var(--text-subtle)",background:"var(--surface-sunken)",padding:"2px 6px",borderRadius:99}}>
              {m.cc}cc
            </span>
          )}
        </div>
        {/* Precio */}
        {m.price>0&&(
          <div style={{marginBottom:colors.length>0?8:0}}>
            <div style={{fontSize:15,fontWeight:800,color:"var(--text-body)"}}>{fmt(m.price)}</div>
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
                background:swatchCss(c),
                border:"1px solid rgba(0,0,0,0.1)",
                flexShrink:0,
              }}/>
            ))}
            {colors.length>6&&(
              <span style={{fontSize:10,color:"var(--text-disabled)"}}>+{colors.length-6}</span>
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
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"18px 20px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>Gestionar categorías</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-disabled)",cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
      </div>
      {/* Categorías existentes */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {allCategories.length===0?<span style={{fontSize:12,color:"var(--text-disabled)"}}>Sin categorías aún</span>:allCategories.map(c=>(
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
      <div style={{fontSize:11,color:"var(--text-disabled)",marginTop:8}}>
        Renombrar actualiza la categoría en todos los modelos que la tengan asignada.
        Para crear una categoría nueva, asignala directamente al editar un modelo.
      </div>
    </div>
  );
}

/* ── BrandCard: tarjeta grande con logo 16:9 ─────────────────────────────── */
function BrandCard({brand,logoUrl,modelCount,categories,canEdit,onClick,onLogoUploaded}){
  const[uploading,setUploading]=useState(false);
  const[err,setErr]=useState('');
  const fileRef=useRef(null);

  const handleFile=async(e)=>{
    e.stopPropagation();
    const f=e.target.files?.[0];
    if(!f)return;
    if(f.size>20*1024*1024){setErr('La imagen supera 20 MB');return;}
    setUploading(true); setErr('');
    try{
      await api.uploadBrandLogo(brand,f);
      onLogoUploaded&&onLogoUploaded();
    }catch(ex){setErr(ex?.message||'Error al subir logo');}
    finally{setUploading(false); if(fileRef.current)fileRef.current.value='';}
  };

  return(
    <div onClick={onClick}
      style={{
        background:'var(--surface)',
        border:'1px solid var(--border)',
        borderRadius:14,
        overflow:'hidden',
        cursor:'pointer',
        boxShadow:'0 1px 3px rgba(16,24,40,0.04)',
        display:'flex',flexDirection:'column',
        transition:'transform 140ms, box-shadow 140ms, border-color 140ms',
      }}
      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 24px rgba(16,24,40,0.08)';e.currentTarget.style.borderColor='var(--brand)';}}
      onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='0 1px 3px rgba(16,24,40,0.04)';e.currentTarget.style.borderColor='var(--border)';}}
    >
      {/* Logo 16:9 */}
      <div style={{
        position:'relative',aspectRatio:'16/9',background:'var(--surface-muted)',
        display:'flex',alignItems:'center',justifyContent:'center',
        borderBottom:'1px solid var(--surface-sunken)',
      }}>
        {logoUrl
          ? <img src={logoUrl} alt={brand} style={{maxWidth:'78%',maxHeight:'78%',objectFit:'contain'}}/>
          : (
            <div style={{textAlign:'center',padding:'0 12px'}}>
              <div style={{fontSize:28,fontWeight:900,color:'var(--text)',letterSpacing:'-0.8px',lineHeight:1}}>{brand}</div>
              {canEdit&&<div style={{fontSize:10,fontWeight:600,color:'var(--text-disabled)',marginTop:8,letterSpacing:'0.05em',textTransform:'uppercase'}}>Sin logo</div>}
            </div>
          )
        }
        {canEdit&&(
          <label onClick={e=>e.stopPropagation()} style={{
            position:'absolute',top:10,right:10,
            background:'rgba(17,24,39,0.82)',color:'var(--text-on-dark)',
            fontSize:11,fontWeight:700,padding:'6px 10px',borderRadius:8,
            cursor:'pointer',display:'flex',alignItems:'center',gap:5,
            backdropFilter:'blur(4px)',
          }}>
            {uploading?'Subiendo…':(logoUrl?'Cambiar':'Subir logo')}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:'none'}} disabled={uploading}/>
          </label>
        )}
      </div>

      {/* Contenido */}
      <div style={{padding:'14px 16px',flex:1,display:'flex',flexDirection:'column',gap:8}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:8}}>
          <div style={{fontSize:17,fontWeight:900,color:'var(--text)',letterSpacing:'-0.4px'}}>{brand}</div>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-subtle)'}}>{modelCount} modelo{modelCount!==1?'s':''}</div>
        </div>
        {categories.length>0&&(
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {categories.slice(0,5).map(c=>(
              <span key={c} style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:catColor(c)+'18',color:catColor(c),fontWeight:600,border:`1px solid ${catColor(c)}30`}}>
                {c}
              </span>
            ))}
            {categories.length>5&&<span style={{fontSize:10,color:'var(--text-disabled)',fontWeight:600,alignSelf:'center'}}>+{categories.length-5}</span>}
          </div>
        )}
        {err&&<div style={{fontSize:11,color:'#DC2626'}}>{err}</div>}
      </div>
    </div>
  );
}

/* ── BrandCategoriesPanel: CRUD per-brand categories ─────────────────────── */
function BrandCategoriesPanel({brand,cats,onClose,onSaved}){
  const confirm=useConfirm();
  const[newName,setNewName]=useState('');
  const[editId,setEditId]=useState(null);
  const[editVal,setEditVal]=useState('');
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');

  const add=async()=>{
    if(!newName.trim())return;
    setSaving(true); setErr('');
    try{await api.createBrandCategory(brand,newName.trim());setNewName('');onSaved&&onSaved();}
    catch(e){setErr(e?.message||'Error');}
    finally{setSaving(false);}
  };
  const startEdit=(c)=>{setEditId(c.id);setEditVal(c.name);};
  const saveEdit=async()=>{
    if(!editVal.trim())return;
    setSaving(true); setErr('');
    try{await api.updateBrandCategory(brand,editId,{name:editVal.trim()});setEditId(null);setEditVal('');onSaved&&onSaved();}
    catch(e){setErr(e?.message||'Error');}
    finally{setSaving(false);}
  };
  const del=async(c)=>{
    const ok=await confirm({title:`¿Eliminar categoría "${c.name}"?`,body:c.model_count?`${c.model_count} modelos la usan. Esta acción no se puede deshacer.`:'Esta acción no se puede deshacer.',confirmLabel:'Eliminar',tone:'danger'});
    if(!ok)return;
    setSaving(true); setErr('');
    try{await api.deleteBrandCategory(brand,c.id);onSaved&&onSaved();}
    catch(e){setErr(e?.message||'Error');}
    finally{setSaving(false);}
  };

  return(
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:'16px 18px',marginBottom:18,boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:800,color:'var(--text)'}}>Categorías de {brand}</div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-disabled)',cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
      </div>

      {/* Lista existentes */}
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
        {cats.length===0?<span style={{fontSize:12,color:'var(--text-disabled)'}}>Aún no hay categorías para esta marca</span>:cats.map(c=>(
          <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'var(--surface-muted)',borderRadius:8,border:'1px solid var(--surface-sunken)'}}>
            {editId===c.id?(
              <>
                <input value={editVal} onChange={e=>setEditVal(e.target.value)} autoFocus
                  style={{...S.inp,flex:1,padding:'5px 8px',fontSize:12}}/>
                <Btn variant='primary' size='sm' onClick={saveEdit} disabled={saving||!editVal.trim()}>Guardar</Btn>
                <Btn variant='ghost' size='sm' onClick={()=>setEditId(null)}>Cancelar</Btn>
              </>
            ):(
              <>
                <span style={{fontSize:12,padding:'2px 10px',borderRadius:20,background:catColor(c.name)+'20',color:catColor(c.name),fontWeight:700,border:`1px solid ${catColor(c.name)}40`}}>{c.name}</span>
                <span style={{fontSize:11,color:'var(--text-disabled)',flex:1}}>{c.model_count} modelo{c.model_count!==1?'s':''}</span>
                <Btn variant='ghost' size='sm' onClick={()=>startEdit(c)}>Renombrar</Btn>
                <button onClick={()=>del(c)} disabled={saving} style={{background:'none',border:'none',color:'#DC2626',fontSize:11,fontWeight:700,cursor:'pointer',padding:'4px 8px'}}>Eliminar</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Agregar nueva */}
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}
          placeholder="Nueva categoría (ej: Naked, Scooter, Enduro)..."
          style={{...S.inp,flex:1,padding:'8px 12px',fontSize:13}}/>
        <Btn variant='primary' size='sm' onClick={add} disabled={saving||!newName.trim()}>
          + Agregar
        </Btn>
      </div>
      {err&&<div style={{marginTop:10,fontSize:11,color:'#DC2626'}}>{err}</div>}
    </div>
  );
}

export function CatalogView({user}){
  const[models,setModels]=useState([]);
  const[brandsMeta,setBrandsMeta]=useState([]);              // [{name, logo_url, model_count}]
  const[brandCats,setBrandCats]=useState([]);                 // categorías de la marca activa
  const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);
  const[showAdd,setShowAdd]=useState(false);
  const[showManageCats,setShowManageCats]=useState(false);
  const[showBrandCats,setShowBrandCats]=useState(false);
  const[successMsg,setSuccessMsg]=useState('');
  // Navegación: null = vista marcas, string = marca activa
  const[activeBrand,setActiveBrand]=useState(null);
  // null = todas las categorías de la marca, string = categoría activa
  const[activeCat,setActiveCat]=useState(null);
  // búsqueda global (solo en vista todas)
  const[search,setSearch]=useState("");
  const canEdit=hasRole(user, ROLES.SUPER, ROLES.ADMIN);
  const canDelete=hasRole(user, ROLES.SUPER);
  const isMobile=useIsMobile();
  const isTablet=useIsMobile(1024);
  const gridCols=isMobile?'1fr':isTablet?'repeat(2,1fr)':'repeat(auto-fill, minmax(220px,1fr))';
  const brandGridCols=isMobile?'1fr':isTablet?'repeat(2,1fr)':'repeat(auto-fill, minmax(260px,1fr))';

  useEffect(()=>{
    api.getModels().then(d=>setModels(Array.isArray(d)?d:[])).catch(()=>{}).finally(()=>setLoading(false));
    api.getBrandsWithLogos().then(d=>setBrandsMeta(Array.isArray(d)?d:[])).catch(()=>{});
  },[]);

  // Al cambiar de marca activa, traer sus categorías persistidas
  useEffect(()=>{
    if(!activeBrand){setBrandCats([]);return;}
    api.getBrandCategories(activeBrand).then(d=>setBrandCats(Array.isArray(d)?d:[])).catch(()=>setBrandCats([]));
  },[activeBrand]);

  const refreshBrandsMeta=()=>api.getBrandsWithLogos().then(d=>setBrandsMeta(Array.isArray(d)?d:[])).catch(()=>{});
  const refreshBrandCats=()=>activeBrand&&api.getBrandCategories(activeBrand).then(d=>setBrandCats(Array.isArray(d)?d:[])).catch(()=>{});

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
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--surface-muted)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',marginBottom:20}}>
              <Ic.search size={14} color="var(--text-disabled)" style={{flexShrink:0}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar marca, modelo..." style={{...S.inp,border:'none',background:'transparent',padding:0,outline:'none',flex:1}}/>
            </div>

            {/* Si hay búsqueda, mostrar resultados flat */}
            {q?(
              filteredModels.length===0?(
                <Empty icon={Ic.search} title={`Sin resultados para "${search}"`} hint="Intenta con otra marca o nombre de modelo."/>
              ):(
                <div>
                  <div style={{fontSize:11,color:"var(--text-disabled)",marginBottom:12,fontWeight:600}}>{filteredModels.length} resultado{filteredModels.length!==1?"s":""}</div>
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
                <div style={{display:"grid",gridTemplateColumns:brandGridCols,gap:14}}>
                  {visibleBrands.map(brand=>{
                    const bms=models.filter(m=>m.brand===brand);
                    const cats=[...new Set(bms.map(m=>m.category).filter(Boolean))].sort();
                    const meta=brandsMeta.find(b=>b.name===brand);
                    return(
                      <BrandCard
                        key={brand}
                        brand={brand}
                        logoUrl={meta?.logo_url}
                        modelCount={bms.length}
                        categories={cats}
                        canEdit={canEdit}
                        onClick={()=>{setActiveBrand(brand);setActiveCat(null);}}
                        onLogoUploaded={refreshBrandsMeta}
                      />
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
  // Unión entre categorías persistidas y las derivadas de los modelos actuales
  const derivedCats=[...new Set(brandModels.map(m=>m.category).filter(Boolean))];
  const persistedCatNames=brandCats.map(c=>c.name);
  const allBrandCatNames=[...new Set([...persistedCatNames,...derivedCats])].sort();
  const shownModels=activeCat&&activeCat!=="__sin_categoria"?brandModels.filter(m=>m.category===activeCat):brandModels;
  const uncategorized=brandModels.filter(m=>!m.category);
  const brandMeta=brandsMeta.find(b=>b.name===activeBrand);
  const brandCatsForChildren=allBrandCatNames; // lista para combos en edit/new

  return(
    <div>
      {/* Breadcrumb / header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>{setActiveBrand(null);setActiveCat(null);setShowBrandCats(false);}}
            style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:"var(--text-disabled)",fontSize:13,fontWeight:600,cursor:"pointer",padding:0,fontFamily:"inherit"}}>
            <Ic.back size={14}/> Catálogo
          </button>
          <span style={{color:"var(--border-strong)"}}>/</span>
          {brandMeta?.logo_url&&<img src={brandMeta.logo_url} alt="" style={{height:22,maxWidth:60,objectFit:'contain'}}/>}
          <span style={{fontSize:16,fontWeight:800,color:"var(--text)"}}>{activeBrand}</span>
          {activeCat&&activeCat!=="__sin_categoria"&&<><span style={{color:"var(--border-strong)"}}>/</span><span style={{fontSize:14,fontWeight:700,color:catColor(activeCat)}}>{activeCat}</span></>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:12,color:"var(--text-disabled)"}}>{(activeCat==="__sin_categoria"?uncategorized:shownModels).length} modelo{(activeCat==="__sin_categoria"?uncategorized:shownModels).length!==1?"s":""}</span>
          {canEdit&&<button onClick={()=>setShowBrandCats(v=>!v)} style={{...S.btn2,fontSize:12,padding:"6px 14px"}}>Categorías</button>}
          {canEdit&&<button onClick={()=>setShowAdd(true)} style={{...S.btn,fontSize:12,padding:"7px 16px"}}>+ Agregar moto</button>}
        </div>
      </div>

      {/* Panel de categorías de la marca */}
      {canEdit&&showBrandCats&&<BrandCategoriesPanel brand={activeBrand} cats={brandCats} onClose={()=>setShowBrandCats(false)} onSaved={refreshBrandCats}/>}

      {/* Pills de categoría */}
      {allBrandCatNames.length>0&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          <button onClick={()=>setActiveCat(null)}
            style={{padding:"6px 16px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,
                    background:!activeCat?"var(--text)":"var(--surface-sunken)",color:!activeCat?"var(--text-on-dark)":"var(--text-muted)",transition:"all 0.12s"}}>
            Todos ({brandModels.length})
          </button>
          {allBrandCatNames.map(c=>{
            const cnt=brandModels.filter(m=>m.category===c).length;
            const active=activeCat===c;
            return(
              <button key={c} onClick={()=>setActiveCat(c)}
                style={{padding:"6px 16px",borderRadius:20,border:`1.5px solid ${active?catColor(c):"var(--border)"}`,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,
                        background:active?catColor(c):"var(--surface)",color:active?"var(--text-on-dark)":catColor(c),transition:"all 0.12s"}}>
                {c} <span style={{fontWeight:400,opacity:0.75}}>({cnt})</span>
              </button>
            );
          })}
          {uncategorized.length>0&&(
            <button onClick={()=>setActiveCat("__sin_categoria")}
              style={{padding:"6px 16px",borderRadius:20,border:`1.5px solid ${activeCat==="__sin_categoria"?"var(--text-subtle)":"var(--border)"}`,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,
                      background:activeCat==="__sin_categoria"?"var(--text-subtle)":"var(--surface)",color:activeCat==="__sin_categoria"?"var(--text-on-dark)":"var(--text-subtle)"}}>
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

      {showAdd&&<AddModelModal onClose={()=>setShowAdd(false)} onAdded={onAdded} allCategories={brandCatsForChildren.length?brandCatsForChildren:allCategories} defaultBrand={activeBrand}/>}
      {selected&&<ModelDetailModal model={selected} canEdit={canEdit} canDelete={canDelete} onClose={()=>setSelected(null)} onSaved={onSaved} onDeleted={onDeleted} allCategories={brandCatsForChildren.length?brandCatsForChildren:allCategories}/>}
    </div>
  );
}

