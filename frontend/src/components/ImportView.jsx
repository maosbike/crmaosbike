import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function ImportView() {
  const [step, setStep]         = useState('upload');
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [skipDups, setSkipDups] = useState(true);
  const [filter, setFilter]     = useState('all');
  const [catalogModels, setCatalogModels] = useState([]);
  useEffect(()=>{ api.getModels().then(d=>setCatalogModels(Array.isArray(d)?d:[])).catch(()=>{}); },[]);
  const [dragOver, setDragOver] = useState(false);
  const [logs, setLogs]         = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('import');

  const STATUS_CFG = {
    valid:    { l:'Válido',       c:'#10B981', bg:'rgba(16,185,129,0.1)' },
    error:    { l:'Error',        c:'#EF4444', bg:'rgba(239,68,68,0.1)'  },
    dup_file: { l:'Dup. archivo', c:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
    dup_db:   { l:'Dup. CRM',     c:'#F28100', bg:'rgba(242,129,0,0.1)'  },
  };

  const processFile = async (f) => {
    if (!f) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const data = await api.importPreview(fd);
      setPreview(data);
      setStep('preview');
      setFilter('all');
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const data = await api.importConfirm({
        rows: preview.rows, filename: preview.filename,
        skip_dups: skipDups,
      });
      setResult(data); setStep('result');
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const loadLogs = async () => {
    if (logs) return;
    setLogsLoading(true);
    try { const d = await api.getImportLogs(); setLogs(d); }
    catch { setLogs([]); }
    finally { setLogsLoading(false); }
  };

  const reset = () => { setStep('upload'); setPreview(null); setResult(null); setFilter('all'); };

  const filteredRows = preview?.rows?.filter(r => {
    if (filter==='all')   return true;
    if (filter==='valid') return r.status==='valid';
    if (filter==='error') return r.status==='error';
    if (filter==='dup')   return r.status==='dup_file'||r.status==='dup_db';
    return true;
  }) || [];

  const willImport = preview?.rows?.filter(r =>
    r.status==='valid' ||
    (r.status==='dup_db' && !skipDups)
  ).length || 0;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,margin:0}}>Importar prospectos</h2>
          <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>Carga masiva — acceso exclusivo super_admin</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {[{k:'import',l:'Importación'},{k:'logs',l:'Historial'}].map(t=>(
            <button key={t.k} onClick={()=>{setActiveTab(t.k);if(t.k==='logs')loadLogs();}}
              style={{...S.btn2,padding:'6px 14px',fontSize:12,
                background:activeTab===t.k?'rgba(242,129,0,0.1)':'transparent',
                color:activeTab===t.k?'#F28100':'#6B7280',
                border:activeTab===t.k?'1px solid rgba(242,129,0,0.3)':'1px solid #D1D5DB'}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {activeTab==='logs'&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 14px'}}>Historial de importaciones</h3>
          {logsLoading&&<div style={{color:'#6B7280',fontSize:12}}>Cargando...</div>}
          {logs&&logs.length===0&&<div style={{color:'#6B7280',fontSize:12}}>Sin importaciones registradas.</div>}
          {logs&&logs.length>0&&(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr>{['Fecha','Archivo','Importado por','Total','Importados','Errores','Dups.','Sin vendedor'].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'6px 10px',borderBottom:'1px solid #E5E7EB',color:'#6B7280',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                ))}</tr></thead>
                <tbody>{logs.map(l=>(
                  <tr key={l.id} style={{borderBottom:'1px solid #FFFFFF'}}>
                    <td style={{padding:'7px 10px',color:'#9CA3AF'}}>{fDT(l.created_at)}</td>
                    <td style={{padding:'7px 10px'}}>{l.filename}</td>
                    <td style={{padding:'7px 10px'}}>{l.first_name} {l.last_name}</td>
                    <td style={{padding:'7px 10px',textAlign:'center'}}>{l.total_rows}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:'#10B981',fontWeight:600}}>{l.imported}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:l.errors>0?'#EF4444':'#4B5563'}}>{l.errors}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:l.duplicates>0?'#F59E0B':'#4B5563'}}>{l.duplicates}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:l.no_seller>0?'#6B7280':'#4B5563'}}>{l.no_seller}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab==='import'&&(
        <>
          {step==='upload'&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}
                style={{...S.card,border:`2px dashed ${dragOver?'#F28100':'#D1D5DB'}`,textAlign:'center',
                  padding:'48px 24px',cursor:'pointer',transition:'border 0.2s',
                  background:dragOver?'rgba(242,129,0,0.04)':'#FFFFFF'}}
                onClick={()=>document.getElementById('imp-file-input').click()}
              >
                <Ic.dl size={36} color={dragOver?'#F28100':'#1F2937'}/>
                <div style={{fontSize:15,fontWeight:600,marginTop:12,marginBottom:6}}>
                  {loading?'Procesando archivo..':'Arrastra tu archivo aquí o haz clic para seleccionar'}
                </div>
                <div style={{fontSize:12,color:'#6B7280'}}>CSV o XLSX · Máximo 5 MB</div>
                <input id="imp-file-input" type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}}
                  onChange={e=>e.target.files[0]&&processFile(e.target.files[0])}/>
              </div>

              <div style={{...S.card,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                <Ic.file size={20} color='#F28100'/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>Plantilla CSV</div>
                  <div style={{fontSize:11,color:'#6B7280'}}>Descarga el formato con las columnas requeridas</div>
                </div>
                <a href={api.getImportTemplate()} download="template_prospectos.csv"
                   style={{...S.btn2,padding:'7px 14px',fontSize:12,textDecoration:'none',display:'inline-block'}}>
                  Descargar plantilla
                </a>
              </div>

              <div style={S.card}>
                <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 12px'}}>Columnas del archivo</h3>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead><tr>{['Columna','Obligatoria','Descripción'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'5px 10px',borderBottom:'1px solid #E5E7EB',color:'#6B7280',fontWeight:600}}>{h}</th>
                    ))}</tr></thead>
                    <tbody>{[
                      ['nombre',    'Sí',  'Nombre del prospecto'],
                      ['apellido',  'No',  'Apellido'],
                      ['telefono',  'Sí*', 'Obligatorio si no hay email'],
                      ['email',     'Sí*', 'Obligatorio si no hay teléfono'],
                      ['sucursal',  'Sí',  'Código de sucursal: MPN o MPS (Movicenter → se deriva a MPN)'],
                      ['rut',       'No',  'Formato: 12345678-9'],
                      ['fuente',    'No',  'web / whatsapp / presencial / referido / evento / llamada'],
                      ['prioridad', 'No',  'alta / media / baja'],
                      ['comuna',    'No',  'Ciudad o comuna'],
                      ['color_pref','No',  'Color de moto preferido'],
                    ].map(([col,req,desc])=>(
                      <tr key={col} style={{borderBottom:'1px solid #FFFFFF'}}>
                        <td style={{padding:'5px 10px',fontFamily:'monospace',color:'#F28100'}}>{col}</td>
                        <td style={{padding:'5px 10px',color:req.includes('Sí')?'#10B981':'#4B5563',fontWeight:req.includes('Sí')?600:400}}>{req}</td>
                        <td style={{padding:'5px 10px',color:'#6B7280'}}>{desc}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step==='preview'&&preview&&(
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10}}>
                {[
                  {l:'Total',        v:preview.summary.total,    c:'#111827'},
                  {l:'Válidos',      v:preview.summary.valid,    c:'#10B981'},
                  {l:'Errores',      v:preview.summary.errors,   c:'#EF4444'},
                  {l:'Dup. archivo', v:preview.summary.dup_file, c:'#F59E0B'},
                  {l:'Dup. CRM',     v:preview.summary.dup_db,   c:'#F28100'},
                ].map(x=>(
                  <div key={x.l} style={{...S.card,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:800,color:x.c}}>{x.v}</div>
                    <div style={{fontSize:10,color:'#6B7280',marginTop:2}}>{x.l}</div>
                  </div>
                ))}
              </div>

              <div style={{...S.card,display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:600,color:'#9CA3AF'}}>Opciones:</span>
                <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:12}}>
                  <input type="checkbox" checked={skipDups} onChange={e=>setSkipDups(e.target.checked)} style={{accentColor:'#F28100'}}/>
                  Omitir duplicados del CRM
                </label>
                <div style={{marginLeft:'auto',fontSize:12,color:'#9CA3AF'}}>
                  Importando <span style={{color:'#10B981',fontWeight:700}}>{willImport}</span> de {preview.summary.total}
                </div>
              </div>

              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {[
                  {k:'all',   l:`Todas (${preview.summary.total})`},
                  {k:'valid', l:`Válidas (${preview.summary.valid})`},
                  {k:'error', l:`Errores (${preview.summary.errors})`},
                  {k:'dup',   l:`Duplicados (${preview.summary.dup_file+preview.summary.dup_db})`},
                ].map(t=>(
                  <button key={t.k} onClick={()=>setFilter(t.k)}
                    style={{...S.btn2,padding:'5px 12px',fontSize:11,
                      background:filter===t.k?'rgba(242,129,0,0.1)':'transparent',
                      color:filter===t.k?'#F28100':'#9CA3AF',
                      border:filter===t.k?'1px solid rgba(242,129,0,0.3)':'1px solid #D1D5DB'}}>
                    {t.l}
                  </button>
                ))}
              </div>

              <div style={S.card}>
                <div style={{overflowX:'auto',maxHeight:400,overflowY:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:720}}>
                    <thead style={{position:'sticky',top:0,background:'#FFFFFF',zIndex:1}}>
                      <tr>{['Fila','Estado','Nombre','Teléfono','Email','Sucursal','Moto','Observaciones'].map(h=>(
                        <th key={h} style={{textAlign:'left',padding:'7px 10px',borderBottom:'1px solid #E5E7EB',color:'#6B7280',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r,i)=>{
                        const sc=STATUS_CFG[r.status]||STATUS_CFG.error;
                        const obs=[...(r.errors||[]),r.dup_reason].filter(Boolean).join(' · ');
                        return(
                          <tr key={i} style={{borderBottom:'1px solid #F9FAFB',background:i%2?'transparent':'rgba(255,255,255,0.01)'}}>
                            <td style={{padding:'6px 10px',color:'#6B7280'}}>{r._row}</td>
                            <td style={{padding:'6px 10px'}}>
                              <span style={{display:'inline-flex',padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:600,color:sc.c,background:sc.bg,whiteSpace:'nowrap'}}>{sc.l}</span>
                            </td>
                            <td style={{padding:'6px 10px',fontWeight:500}}>{r.nombre}{r.apellido?` ${r.apellido}`:''}</td>
                            <td style={{padding:'6px 10px',color:'#9CA3AF'}}>{r.telefono||'—'}</td>
                            <td style={{padding:'6px 10px',color:'#9CA3AF'}}>{r.email||'—'}</td>
                            <td style={{padding:'6px 10px'}}>{r.branch_name||r.sucursal_raw||'—'}</td>
                            <td style={{padding:'4px 8px',fontSize:11,minWidth:180}}>
                              {r.model_resolved_name&&<div style={{color:'#10B981',fontWeight:600,marginBottom:2}}>{r.model_resolved_name}</div>}
                              {!r.model_resolved_name&&r.model_raw&&<div style={{color:'#F59E0B',marginBottom:2}}>{r.model_raw}</div>}
                              <select
                                value={r.model_id||''}
                                onChange={e=>{
                                  const sel=catalogModels.find(m=>m.id===e.target.value);
                                  setPreview(p=>({...p,rows:p.rows.map(row=>row===r?{...row,model_id:sel?.id||null,model_resolved_name:sel?`${sel.brand} ${sel.model}`:null}:row)}));
                                }}
                                style={{...S.inp,fontSize:10,padding:'2px 4px',width:'100%'}}
                              >
                                <option value="">{r.model_resolved_name?'Cambiar modelo...':'Seleccionar modelo...'}</option>
                                {catalogModels.map(m=><option key={m.id} value={m.id}>{m.brand} {m.model}</option>)}
                              </select>
                            </td>
                            <td style={{padding:'6px 10px',color:r.errors?.length?'#EF4444':'#4B5563',fontSize:11}}>{obs||'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredRows.length===0&&(
                    <div style={{padding:'24px',textAlign:'center',color:'#6B7280',fontSize:12}}>Sin filas con este filtro</div>
                  )}
                </div>
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={reset} style={{...S.btn2,padding:'9px 20px'}}>Cancelar</button>
                <button onClick={handleConfirm} disabled={willImport===0||loading}
                  style={{...S.btn,padding:'9px 24px',opacity:willImport===0||loading?0.5:1}}>
                  {loading?'Importando...':`Confirmar importación (${willImport} leads)`}
                </button>
              </div>
            </div>
          )}

          {step==='result'&&result&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{...S.card,textAlign:'center',padding:'32px 24px'}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(16,185,129,0.12)",border:"1.5px solid rgba(16,185,129,0.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:18,color:"#10B981",fontWeight:700}}>OK</div>
                <h3 style={{fontSize:18,fontWeight:700,margin:'0 0 6px',color:'#10B981'}}>Importación completada</h3>
                <div style={{fontSize:13,color:'#9CA3AF'}}>{preview?.filename}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
                {[
                  {l:'Leads importados', v:result.imported,  c:'#10B981'},
                  {l:'Errores en fila',  v:result.errors,    c:'#EF4444'},
                  {l:'Sin vendedor',     v:result.no_seller, c:'#F59E0B'},
                ].map(x=>(
                  <div key={x.l} style={{...S.card,padding:'14px',textAlign:'center'}}>
                    <div style={{fontSize:26,fontWeight:800,color:x.c}}>{x.v??0}</div>
                    <div style={{fontSize:10,color:'#6B7280',marginTop:4}}>{x.l}</div>
                  </div>
                ))}
              </div>
              {result.no_seller>0&&(
                <div style={{background:'rgba(245,158,11,0.07)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'flex-start',gap:10,fontSize:12,color:'#92400E'}}>
                  <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
                  <span><strong>{result.no_seller} lead{result.no_seller!==1?'s':''} quedaron sin vendedor asignado.</strong> Revisalos en el panel de admin para reasignar manualmente.</span>
                </div>
              )}
              {result.tickets?.length>0&&(
                <div style={S.card}>
                  <h3 style={{fontSize:12,fontWeight:600,margin:'0 0 10px',color:'#9CA3AF'}}>Tickets creados</h3>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {result.tickets.map(n=>(
                      <span key={n} style={{padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:600,color:'#F28100',background:'rgba(242,129,0,0.1)'}}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>{setActiveTab('logs');setLogs(null);loadLogs();}} style={{...S.btn2,padding:'9px 20px'}}>Ver historial</button>
                <button onClick={reset} style={{...S.btn,padding:'9px 20px'}}>Nueva importación</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// STAGING IMPORT VIEW — Nuevo flujo seguro de importación de precios
// CSV/Excel → staging → revisión → publicar al catálogo (solo super_admin)
// ═══════════════════════════════════════════
