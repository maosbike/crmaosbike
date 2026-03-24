import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui';

export function StagingImportView() {
  const [step, setStep]           = useState('upload'); // upload | review | history
  const [uploading, setUploading] = useState(false);
  const [batchData, setBatchData] = useState(null);   // { batch_id, rows, ... }
  const [batches, setBatches]     = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult]       = useState(null);
  const [editingRow, setEditingRow] = useState(null); // row id being edited
  const [editForm, setEditForm]   = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const loadBatches = () =>
    api.getPriceBatches().then(setBatches).catch(() => {});

  useEffect(() => { loadBatches(); }, []);

  const handleUpload = async (file) => {
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.uploadPriceFile(fd);
      setBatchData(data);
      setStep('review');
    } catch (e) {
      alert(e.message || 'Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleReject = async (rowId) => {
    try {
      await api.rejectPriceRow(rowId);
      setBatchData(bd => ({ ...bd, rows: bd.rows.map(r => r.id === rowId ? { ...r, status: 'rejected' } : r) }));
    } catch (e) { alert('Error'); }
  };

  const startEdit = (row) => {
    setEditingRow(row.id);
    setEditForm({
      brand: row.brand || '',
      model: row.model || '',
      commercial_name: row.commercial_name || '',
      category: row.category || '',
      cc: row.cc || '',
      year: row.year || '',
      price_list: row.price_list || '',
      bonus: row.bonus || 0,
    });
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const updated = await api.updatePriceRow(editingRow, {
        ...editForm,
        cc: editForm.cc ? Number(editForm.cc) : null,
        year: editForm.year ? Number(editForm.year) : null,
        price_list: Number(editForm.price_list) || null,
        bonus: Number(editForm.bonus) || 0,
      });
      setBatchData(bd => ({ ...bd, rows: bd.rows.map(r => r.id === editingRow ? updated : r) }));
      setEditingRow(null);
    } catch (e) { alert('Error al guardar'); }
    finally { setSavingEdit(false); }
  };

  const handlePublish = async () => {
    const validRows = batchData.rows.filter(r => r.status === 'pending' && (!r.validation_errors || r.validation_errors.length === 0));
    if (validRows.length === 0) { alert('No hay filas válidas para publicar'); return; }
    if (!confirm(`¿Publicar ${validRows.length} modelo(s) al catálogo?\n\nEsta acción actualiza el catálogo real.`)) return;
    setPublishing(true);
    try {
      const res = await api.publishPriceBatch(batchData.batch_id);
      setResult(res);
      loadBatches();
      setStep('done');
    } catch (e) { alert(e.message || 'Error al publicar'); }
    finally { setPublishing(false); }
  };

  const reset = () => { setStep('upload'); setBatchData(null); setResult(null); setEditingRow(null); };

  const MATCH_LABEL = { exact: '✓ Exacto', fuzzy: '~ Parcial', new: '+ Nuevo', ambiguous: '⚠ Ambiguo', unknown: '—' };
  const MATCH_COLOR = { exact: '#10B981', fuzzy: '#F59E0B', new: '#3B82F6', ambiguous: '#EF4444', unknown: '#555' };
  const CAT_OPTS    = ['Commuter','Naked','Sport','Scooter','Adventure','Off-Road','Touring','Eléctrica','Big Bike','ATV','Cruiser'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Importar Precios</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {['upload','history'].map(t => (
            <button key={t} onClick={() => { setStep(t); if (t === 'history') loadBatches(); }}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #333', background: step === t ? '#F28100' : 'transparent', color: step === t ? '#fff' : '#aaa', fontSize: 12, cursor: 'pointer', fontWeight: step === t ? 700 : 400 }}>
              {t === 'upload' ? 'Nueva importación' : 'Historial'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: '#111113', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid #F28100aa', fontSize: 12, color: '#F28100' }}>
        <b>Nuevo flujo seguro:</b> los datos no se publican al catálogo hasta que vos los revisés y aprobés explícitamente.
      </div>

      {/* ── UPLOAD ── */}
      {(step === 'upload' || step === 'done') && (
        <div>
          {step === 'done' && result && (
            <div style={{ background: '#0D2B1A', border: '1px solid #10B98133', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#10B981', marginBottom: 6 }}>¡Publicado exitosamente!</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>
                {result.published} modelos actualizados · {result.created} modelos nuevos creados
                {result.errors && result.errors.length > 0 && <span style={{ color: '#EF4444' }}> · {result.errors.length} errores</span>}
              </div>
              <button onClick={reset} style={{ marginTop: 12, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#F28100', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Nueva importación</button>
            </div>
          )}

          <div style={{ background: '#111113', border: '2px dashed #2A2A2B', borderRadius: 14, padding: 40, textAlign: 'center', marginBottom: 16 }}
            onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {uploading ? 'Procesando PDF...' : 'Arrastrá el PDF de lista de precios aquí'}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>
              Formatos soportados: Honda · Yamaha (Yamaimport) · MMB (Keeway/Benelli/Benda/QJ) · Promobility
            </div>
            <label style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#F28100', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              {uploading ? 'Procesando...' : 'Seleccionar PDF'}
              <input type="file" accept=".pdf" style={{ display: 'none' }} disabled={uploading}
                onChange={e => e.target.files[0] && handleUpload(e.target.files[0])} />
            </label>
          </div>

          <div style={{ background: '#111113', border: '1px solid #1E1E1F', borderRadius: 10, padding: 14, fontSize: 12, color: '#555' }}>
            El parser extrae automáticamente: <span style={{ color: '#aaa' }}>marca · modelo · categoría · precio lista · bono todo medio de pago</span>. Después podés revisar y corregir cada fila antes de publicar.
          </div>
        </div>
      )}

      {/* ── REVIEW ── */}
      {step === 'review' && batchData && (() => {
        const activeRows   = batchData.rows.filter(r => r.status !== 'rejected');
        const validRows    = activeRows.filter(r => !r.validation_errors || r.validation_errors.length === 0);
        const errorRows    = activeRows.filter(r => r.validation_errors && r.validation_errors.length > 0);
        const rejectedRows = batchData.rows.filter(r => r.status === 'rejected');
        return (
          <div>
            {/* Resumen */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Total', val: batchData.rows.length, c: '#666' },
                { label: 'Válidos', val: validRows.length, c: '#10B981' },
                { label: 'Con error', val: errorRows.length, c: '#EF4444' },
                { label: 'Rechazados', val: rejectedRows.length, c: '#555' },
              ].map(({ label, val, c }) => (
                <div key={label} style={{ background: '#111113', border: '1px solid #1E1E1F', borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{val}</div>
                  <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={reset} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #333', background: 'transparent', color: '#aaa', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handlePublish} disabled={publishing || validRows.length === 0}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: validRows.length === 0 ? '#333' : '#10B981', color: '#fff', fontSize: 13, cursor: validRows.length === 0 ? 'default' : 'pointer', fontWeight: 700 }}>
                  {publishing ? 'Publicando...' : `Publicar ${validRows.length} modelos al catálogo`}
                </button>
              </div>
            </div>

            {/* Tabla */}
            <div style={{ background: '#111113', border: '1px solid #1E1E1F', borderRadius: 12, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1E1E1F' }}>
                    {['Estado','Marca','Modelo','Cat.','Precio lista','Bono','Match','Acciones'].map(h => (
                      <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#6B6B6B', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchData.rows.map(row => {
                    const hasError = row.validation_errors && row.validation_errors.length > 0;
                    const rejected = row.status === 'rejected';
                    const isEditing = editingRow === row.id;
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid #1A1A1B', opacity: rejected ? 0.4 : 1, background: isEditing ? '#16161A' : 'transparent' }}>
                        <td style={{ padding: '8px 10px' }}>
                          {rejected
                            ? <span style={{ fontSize: 10, color: '#555' }}>Rechazado</span>
                            : hasError
                            ? <span title={row.validation_errors.join('\n')} style={{ fontSize: 10, color: '#EF4444', cursor: 'help' }}>⚠ Error</span>
                            : <span style={{ fontSize: 10, color: '#10B981' }}>✓ OK</span>
                          }
                        </td>
                        {isEditing ? (
                          <>
                            <td style={{ padding: '4px 6px' }}><input value={editForm.brand} onChange={e=>setEditForm(f=>({...f,brand:e.target.value}))} style={{...S.inp,fontSize:11,padding:'4px 6px',width:80}}/></td>
                            <td style={{ padding: '4px 6px' }}><input value={editForm.model} onChange={e=>setEditForm(f=>({...f,model:e.target.value}))} style={{...S.inp,fontSize:11,padding:'4px 6px',width:100}}/></td>
                            <td style={{ padding: '4px 6px' }}>
                              <select value={editForm.category||''} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))} style={{...S.inp,fontSize:11,padding:'4px 6px'}}>
                                <option value="">—</option>
                                {CAT_OPTS.map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px' }}><input type="number" value={editForm.price_list} onChange={e=>setEditForm(f=>({...f,price_list:e.target.value}))} style={{...S.inp,fontSize:11,padding:'4px 6px',width:100}}/></td>
                            <td style={{ padding: '4px 6px' }}><input type="number" value={editForm.bonus} onChange={e=>setEditForm(f=>({...f,bonus:e.target.value}))} style={{...S.inp,fontSize:11,padding:'4px 6px',width:80}}/></td>
                            <td/>
                            <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                              <button onClick={saveEdit} disabled={savingEdit} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#10B981', color: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>{savingEdit?'…':'OK'}</button>
                              <button onClick={()=>setEditingRow(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#aaa', fontSize: 11, cursor: 'pointer' }}>✕</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.brand}</td>
                            <td style={{ padding: '8px 10px' }}>{row.commercial_name || row.model}</td>
                            <td style={{ padding: '8px 10px', color: '#666' }}>{row.category || '—'}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#F28100' }}>{row.price_list ? `$${row.price_list.toLocaleString('es-CL')}` : '—'}</td>
                            <td style={{ padding: '8px 10px', color: '#10B981' }}>{row.bonus ? `$${row.bonus.toLocaleString('es-CL')}` : '—'}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 10, color: MATCH_COLOR[row.match_type] || '#555' }}>
                                {MATCH_LABEL[row.match_type] || '—'}
                                {row.catalog_brand && row.match_type !== 'new' && <span style={{ color: '#444', marginLeft: 4 }}>({row.catalog_brand} {row.catalog_model})</span>}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              {!rejected && (
                                <>
                                  <button onClick={() => startEdit(row)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#aaa', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>Editar</button>
                                  <button onClick={() => handleReject(row.id)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #3F1111', background: 'transparent', color: '#EF4444', fontSize: 11, cursor: 'pointer' }}>Rechazar</button>
                                </>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── HISTORY ── */}
      {step === 'history' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#888' }}>Importaciones anteriores</div>
          {batches.length === 0
            ? <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 12 }}>Sin importaciones registradas</div>
            : batches.map(b => (
              <div key={b.id} style={{ background: '#111113', border: '1px solid #1E1E1F', borderRadius: 10, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.filename}</div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                    {new Date(b.created_at).toLocaleDateString('es-CL')} · {b.uploaded_by_name}
                    {' · '}<span style={{ color: '#10B981' }}>{b.approved_rows} publicados</span>
                    {' · '}<span style={{ color: '#F59E0B' }}>{b.pending_rows} pendientes</span>
                    {b.rejected_rows > 0 && <span style={{ color: '#555' }}> · {b.rejected_rows} rechazados</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: b.status === 'published' ? '#0D2B1A' : '#1A1A1B', color: b.status === 'published' ? '#10B981' : '#888', border: `1px solid ${b.status === 'published' ? '#10B98133' : '#252525'}` }}>
                  {b.status === 'published' ? 'Publicado' : b.status === 'partial' ? 'Parcial' : 'Pendiente'}
                </span>
                {b.status !== 'published' && (
                  <button onClick={async () => {
                    const d = await api.getPriceBatch(b.id);
                    setBatchData({ batch_id: b.id, rows: d.rows, total: d.rows.length, filename: b.filename });
                    setStep('review');
                  }} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #333', background: 'transparent', color: '#F28100', fontSize: 11, cursor: 'pointer' }}>
                    Revisar
                  </button>
                )}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// PRICELIST VIEW — Importar listas de precios PDF (solo super_admin)
// ═══════════════════════════════════════════

