import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function PricelistView() {
  const [step, setStep]       = useState('upload');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult]   = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState('import');
  const [logs, setLogs]       = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [rowOverrides, setRowOverrides] = useState({}); // { rowIdx: { skip, create_new, model_id } }

  const STATUS_CFG = {
    match:     { l:'Coincide',   c:'#10B981', bg:'rgba(16,185,129,0.1)' },
    update:    { l:'Actualiza',  c:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
    fuzzy:     { l:'Fuzzy',      c:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
    ambiguous: { l:'Ambiguo',    c:'#F28100', bg:'rgba(242,129,0,0.1)'  },
    new:       { l:'Nuevo',      c:'#8B5CF6', bg:'rgba(139,92,246,0.1)' },
  };

  const SOURCE_LABELS = { honda:'Honda', yamaha:'Yamaha', mmb:'MMB (Keeway/Benelli/Benda/QJ)', promobility:'Promobility' };

  const[debugResult,setDebugResult]=useState(null);

  const processFile = async (f) => {
    if (!f) return;
    setLoading(true);
    setDebugResult(null);
    try {
      const fd = new FormData();
      fd.append('pdf', f);
      const data = await api.pricelistPreview(fd);
      setPreview(data);
      setRowOverrides({});
      setStep('preview');
    } catch (e) {
      // Mostrar mensaje completo (puede incluir snippet del texto)
      alert('Error al procesar PDF:\n\n' + e.message);
    }
    finally { setLoading(false); }
  };

  const runDebug = async (f) => {
    if (!f) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('pdf', f);
      const data = await api.pricelistDebug(fd);
      setDebugResult(data);
    } catch(e) { alert('Error en debug: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.pdf')) processFile(f);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    const p = preview.period || new Date().toISOString().slice(0, 7);
    setLoading(true);
    try {
      const rows = (preview.rows || []).map((row, i) => {
        const ov = rowOverrides[i] || {};
        return {
          ...row,
          skip:       ov.skip       ?? false,
          create_new: ov.create_new ?? false,
          model_id:   ov.model_id   ?? row.model_id,
        };
      });
      const data = await api.pricelistConfirm({
        period:      p,
        source_type: preview.source_type,
        filename:    preview.filename,
        rows,
      });
      setResult(data);
      setStep('result');
    } catch (e) { alert('Error al confirmar: ' + e.message); }
    finally { setLoading(false); }
  };

  const loadLogs = async () => {
    if (logs) return;
    setLogsLoading(true);
    try { const d = await api.getPricelistLogs(); setLogs(d); }
    catch { setLogs([]); }
    finally { setLogsLoading(false); }
  };

  const setOv = (i, patch) => setRowOverrides(p => ({ ...p, [i]: { ...(p[i]||{}), ...patch } }));
  const reset = () => { setStep('upload'); setPreview(null); setResult(null); setRowOverrides({}); };

  const fmtP = (n) => n ? '$' + Number(n).toLocaleString('es-CL') : '—';

  const rows = preview?.rows || [];
  const summary = preview?.summary || {};
  const newIndices = rows.map((r, i) => r.status === 'new' ? i : null).filter(i => i !== null);
  const allNewCreated = newIndices.length > 0 && newIndices.every(i => rowOverrides[i]?.create_new);
  const toggleAllNew = () => {
    const val = !allNewCreated;
    setRowOverrides(p => {
      const next = { ...p };
      for (const i of newIndices) next[i] = { ...(next[i]||{}), create_new: val };
      return next;
    });
  };
  const willImport = rows.filter((r,i) => !rowOverrides[i]?.skip && (r.status==='match'||r.status==='update'||r.status==='fuzzy')).length
    + rows.filter((r,i) => !rowOverrides[i]?.skip && r.status==='new' && rowOverrides[i]?.create_new).length;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,margin:0}}>Lista de Precios</h2>
          <p style={{fontSize:12,color:'#6B6B6B',margin:'4px 0 0'}}>Importar PDFs mensuales de precios — solo super_admin</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {[{k:'import',l:'Importar'},{k:'logs',l:'Historial'}].map(t=>(
            <button key={t.k} onClick={()=>{setActiveTab(t.k);if(t.k==='logs'){setLogs(null);loadLogs();}}}
              style={{...S.btn2,padding:'7px 16px',fontSize:12,
                background:activeTab===t.k?'rgba(242,129,0,0.1)':'',
                color:activeTab===t.k?'#F28100':'#A3A3A3',
                border:activeTab===t.k?'1px solid rgba(242,129,0,0.3)':'1px solid #262626'}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {activeTab==='logs' && (
        <div style={S.card}>
          <h3 style={{fontSize:14,fontWeight:600,margin:'0 0 14px'}}>Historial de importaciones</h3>
          {logsLoading ? <p style={{color:'#555',fontSize:13}}>Cargando...</p>
          : !logs?.length ? <p style={{color:'#555',fontSize:13}}>Sin importaciones registradas.</p>
          : <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{borderBottom:'1px solid #1E1E1F'}}>{['Fecha','Archivo','Período','Formato','Total','Importados','Actualizados','Nuevos Modelos','Errores','Por'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 10px',fontSize:10,fontWeight:600,color:'#6B6B6B',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                <tbody>{logs.map((l,i)=><tr key={i} style={{borderBottom:'1px solid #1A1A1B'}}>
                  <td style={{padding:'8px 10px',color:'#888',whiteSpace:'nowrap'}}>{new Date(l.created_at).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
                  <td style={{padding:'8px 10px',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={l.filename}>{l.filename}</td>
                  <td style={{padding:'8px 10px',fontWeight:600,color:'#F28100'}}>{l.period}</td>
                  <td style={{padding:'8px 10px'}}>{SOURCE_LABELS[l.source_type]||l.source_type}</td>
                  <td style={{padding:'8px 10px',textAlign:'center'}}>{l.total_rows}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:'#10B981',fontWeight:600}}>{l.imported}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:'#3B82F6',fontWeight:600}}>{l.updated}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:'#8B5CF6',fontWeight:600}}>{l.new_models}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:l.errors>0?'#EF4444':'#555'}}>{l.errors}</td>
                  <td style={{padding:'8px 10px',fontSize:11,color:'#666'}}>{l.imported_by_name}</td>
                </tr>)}</tbody>
              </table>
            </div>
          }
        </div>
      )}

      {activeTab==='import' && (
        <>
          {/* STEP: UPLOAD */}
          {step==='upload' && (
            <div style={S.card}>
              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={handleDrop}
                style={{border:`2px dashed ${dragOver?'#F28100':'#262626'}`,borderRadius:12,padding:'48px 24px',textAlign:'center',background:dragOver?'rgba(242,129,0,0.04)':'#0E0E0F',transition:'all 0.2s',cursor:'pointer'}}
                onClick={()=>document.getElementById('pl-pdf-input').click()}
              >
                <div style={{width:52,height:52,borderRadius:14,background:'rgba(242,129,0,0.1)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:14}}>
                  <Ic.tag size={26} color="#F28100"/>
                </div>
                <p style={{fontSize:15,fontWeight:600,margin:'0 0 6px'}}>
                  {loading ? 'Procesando PDF...' : 'Arrastra el PDF de lista de precios aquí'}
                </p>
                <p style={{fontSize:12,color:'#555',margin:0}}>o haz clic para seleccionar — Formatos: Honda · Yamaha · MMB · Promobility</p>
                <input id="pl-pdf-input" type="file" accept=".pdf" style={{display:'none'}}
                  onChange={e=>e.target.files[0]&&processFile(e.target.files[0])}/>
              </div>

              <div style={{marginTop:16,padding:14,background:'#0E0E0F',borderRadius:10,fontSize:12,color:'#888'}}>
                <div style={{fontWeight:600,color:'#FAFAFA',marginBottom:8}}>Formatos soportados</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {[
                    ['Honda','Código · Categoría · Precio · Bono TMP · Bono Autofin'],
                    ['Yamaha / Yamaimport','Cilindrada · Precio · Bono Yamaha · Bono Autofin'],
                    ['MMB (Keeway/Benelli/Benda/QJ)','Marca · Precio · Bono · Dcto 30/60 días'],
                    ['Promobility (Suzuki/Cyclone/KYMCO/RE)','Marca · Segmento · Año · Precio · Bono'],
                  ].map(([n,d])=>(
                    <div key={n} style={{padding:'8px 10px',background:'#151516',borderRadius:8,border:'1px solid #1E1E1F'}}>
                      <div style={{fontWeight:600,color:'#F28100',marginBottom:2}}>{n}</div>
                      <div style={{fontSize:11,color:'#666'}}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagnóstico de PDF */}
              <div style={{marginTop:12,padding:12,background:'#0E0E0F',borderRadius:10,border:'1px dashed #252526'}}>
                <div style={{fontSize:11,color:'#555',marginBottom:6}}>¿El PDF no se reconoce? Diagnosticalo antes de importar:</div>
                <label style={{...S.btn2,padding:'6px 12px',fontSize:11,cursor:'pointer',display:'inline-block'}}>
                  {loading?'Analizando...':'🔍 Analizar PDF sin importar'}
                  <input type="file" accept=".pdf" style={{display:'none'}} onChange={e=>e.target.files[0]&&runDebug(e.target.files[0])}/>
                </label>
                {debugResult&&(
                  <div style={{marginTop:10,fontSize:11}}>
                    <div><b>Formato detectado:</b> <span style={{color:debugResult.source_type?'#10B981':'#EF4444'}}>{debugResult.source_type||'No reconocido'}</span></div>
                    <div><b>Líneas:</b> {debugResult.num_lines} · <b>Chars:</b> {debugResult.num_chars}</div>
                    <div style={{marginTop:6,color:'#555',fontWeight:600}}>Primeras 50 líneas extraídas:</div>
                    <pre style={{background:'#070708',borderRadius:6,padding:8,maxHeight:200,overflowY:'auto',fontSize:10,color:'#888',marginTop:4,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
                      {(debugResult.first_50_lines||[]).join('\n')}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP: PREVIEW */}
          {step==='preview' && preview && (
            <div>
              {/* Header del preview */}
              <div style={{...S.card,marginBottom:12,display:'flex',flexWrap:'wrap',gap:16,alignItems:'center'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>
                    {SOURCE_LABELS[preview.source_type]||preview.source_type}
                    {preview.period && <span style={{color:'#F28100',marginLeft:10}}>Período: {preview.period}</span>}
                  </div>
                  <div style={{fontSize:11,color:'#666'}}>{preview.filename}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:10,alignItems:'flex-end'}}>
                {newIndices.length > 0 && (
                  <button onClick={toggleAllNew} style={{
                    padding:'6px 14px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
                    border:`1px solid ${allNewCreated?'rgba(139,92,246,0.5)':'rgba(139,92,246,0.25)'}`,
                    background:allNewCreated?'rgba(139,92,246,0.15)':'rgba(139,92,246,0.07)',
                    color:'#A78BFA',whiteSpace:'nowrap',
                  }}>
                    {allNewCreated ? `✓ Crear todos los nuevos (${newIndices.length})` : `Crear todos los nuevos (${newIndices.length})`}
                  </button>
                )}
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  {[
                    {l:'Total',    v:summary.total,     c:'#FAFAFA'},
                    {l:'Coincide', v:summary.match,     c:'#10B981'},
                    {l:'Actualiza',v:summary.update,    c:'#3B82F6'},
                    {l:'Fuzzy',    v:summary.fuzzy,     c:'#F59E0B'},
                    {l:'Ambiguo',  v:summary.ambiguous, c:'#F28100'},
                    {l:'Nuevo',    v:summary.new,       c:'#8B5CF6'},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{textAlign:'center',padding:'6px 12px',background:'#0E0E0F',borderRadius:8,border:'1px solid #1E1E1F'}}>
                      <div style={{fontSize:18,fontWeight:800,color:c}}>{v||0}</div>
                      <div style={{fontSize:10,color:'#666'}}>{l}</div>
                    </div>
                  ))}
                </div>
                </div>
              </div>

              {/* Tabla de preview */}
              <div style={{...S.card,marginBottom:12,overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #1E1E1F'}}>
                      {['','Estado','Marca','Modelo','Cat.','cc','Precio lista','Bono','P. todo medio','Bono AF','P. AF','Notas'].map(h=>(
                        <th key={h} style={{textAlign:'left',padding:'8px 10px',fontSize:10,fontWeight:600,color:'#6B6B6B',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const ov = rowOverrides[i] || {};
                      const skipped = ov.skip;
                      const cfg = STATUS_CFG[row.status] || STATUS_CFG.new;
                      return (
                        <tr key={i} style={{borderBottom:'1px solid #1A1A1B',opacity:skipped?0.35:1}}>
                          {/* Skip checkbox */}
                          <td style={{padding:'6px 10px'}}>
                            <input type="checkbox" checked={!!ov.skip}
                              onChange={e=>setOv(i,{skip:e.target.checked})}
                              title="Omitir esta fila"/>
                          </td>
                          {/* Status badge */}
                          <td style={{padding:'6px 10px',whiteSpace:'nowrap'}}>
                            <span style={{padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:700,color:cfg.c,background:cfg.bg}}>
                              {cfg.l}
                            </span>
                            {row.status==='new' && !skipped && (
                              <label style={{display:'flex',alignItems:'center',gap:4,marginTop:3,fontSize:10,color:'#8B5CF6',cursor:'pointer'}}>
                                <input type="checkbox" checked={!!ov.create_new}
                                  onChange={e=>setOv(i,{create_new:e.target.checked})}/>
                                Crear
                              </label>
                            )}
                            {row.status==='ambiguous' && !skipped && (
                              <select style={{...S.inp,padding:'2px 6px',fontSize:10,marginTop:3,width:140}}
                                value={ov.model_id||''}
                                onChange={e=>setOv(i,{model_id:e.target.value})}>
                                <option value="">— elegir —</option>
                                {(row.candidates||[]).map(c=>(
                                  <option key={c.id} value={c.id}>{c.brand} {c.model}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{padding:'6px 10px',fontWeight:600}}>{row.brand}</td>
                          <td style={{padding:'6px 10px',maxWidth:180}}>
                            <div style={{fontWeight:600}}>{row.model}</div>
                            {row.code && <div style={{fontSize:10,color:'#555'}}>{row.code}</div>}
                          </td>
                          <td style={{padding:'6px 10px',color:'#888'}}>{row.category||row.segment||'—'}</td>
                          <td style={{padding:'6px 10px',color:'#888'}}>{row.cc||'—'}</td>
                          <td style={{padding:'6px 10px',fontWeight:600}}>{fmtP(row.price_list)}</td>
                          <td style={{padding:'6px 10px',color:'#10B981'}}>{fmtP(row.bono_todo_medio)}</td>
                          <td style={{padding:'6px 10px',fontWeight:600,color:'#3B82F6'}}>{fmtP(row.price_todo_medio)}</td>
                          <td style={{padding:'6px 10px',color:'#F59E0B'}}>{fmtP(row.bono_financiamiento)}</td>
                          <td style={{padding:'6px 10px',fontWeight:600,color:'#F28100'}}>{fmtP(row.price_financiamiento)}</td>
                          <td style={{padding:'6px 10px',fontSize:10,color:'#666',maxWidth:160}}>{row.notes||row.dcto_30_dias||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Acciones */}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',alignItems:'center'}}>
                <span style={{fontSize:12,color:'#888'}}>Se importarán <strong style={{color:'#F28100'}}>{willImport}</strong> filas</span>
                <button onClick={reset} style={{...S.btn2,padding:'9px 20px'}}>Cancelar</button>
                <button onClick={handleConfirm} disabled={loading||willImport===0} style={{...S.btn,padding:'9px 24px',opacity:loading||willImport===0?0.6:1}}>
                  {loading?'Guardando...':'Confirmar importación'}
                </button>
              </div>
            </div>
          )}

          {/* STEP: RESULT */}
          {step==='result' && result && (
            <div style={S.card}>
              <div style={{textAlign:'center',marginBottom:24}}>
                <div style={{width:56,height:56,borderRadius:'50%',background:'rgba(16,185,129,0.15)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:12}}>
                  <Ic.check size={28} color="#10B981"/>
                </div>
                <h3 style={{fontSize:16,fontWeight:700,margin:'0 0 4px'}}>Importación completada</h3>
                <p style={{fontSize:12,color:'#666',margin:0}}>Período {result.period} · {SOURCE_LABELS[result.source_type]||result.source_type}</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:24}}>
                {[
                  {l:'Importados',    v:result.imported,    c:'#10B981'},
                  {l:'Actualizados',  v:result.updated,     c:'#3B82F6'},
                  {l:'Nuevos modelos',v:result.new_models,  c:'#8B5CF6'},
                  {l:'Omitidos',      v:result.skipped,     c:'#6B7280'},
                  {l:'Errores',       v:result.errors?.length||0, c:'#EF4444'},
                ].map(({l,v,c})=>(
                  <div key={l} style={{textAlign:'center',padding:'12px 8px',background:'#0E0E0F',borderRadius:10,border:'1px solid #1E1E1F'}}>
                    <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:11,color:'#666',marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
              {result.errors?.length > 0 && (
                <div style={{marginBottom:16,padding:12,background:'rgba(239,68,68,0.05)',borderRadius:8,border:'1px solid rgba(239,68,68,0.2)'}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#EF4444',marginBottom:6}}>Errores</div>
                  {result.errors.map((e,i)=>(
                    <div key={i} style={{fontSize:11,color:'#EF4444',opacity:0.8}}>{e.model}: {e.error}</div>
                  ))}
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
