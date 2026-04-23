import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ViewHeader, Loader, ErrorMsg, Empty, useToast, useConfirm } from '../ui.jsx';

export function StagingImportView() {
  const toast=useToast();
  const confirm=useConfirm();
  const [step, setStep]           = useState('upload');
  const [uploading, setUploading] = useState(false);
  const [batchData, setBatchData] = useState(null);
  const [batches, setBatches]     = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult]       = useState(null);
  const [editingRow, setEditingRow] = useState(null);
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
      toast.error(e.message || 'Error al subir el archivo');
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
    } catch (e) { toast.error('Error'); }
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
    } catch (e) { toast.error('Error al guardar'); }
    finally { setSavingEdit(false); }
  };

  const handlePublish = async () => {
    const validRows = batchData.rows.filter(r => r.status === 'pending' && (!r.validation_errors || r.validation_errors.length === 0));
    if (validRows.length === 0) { toast.info('No hay filas válidas para publicar'); return; }
    const ok = await confirm({ title:`¿Publicar ${validRows.length} modelo(s) al catálogo?`, body:'Esta acción actualiza el catálogo real.', confirmLabel:'Publicar' });
    if (!ok) return;
    setPublishing(true);
    try {
      const res = await api.publishPriceBatch(batchData.batch_id);
      setResult(res);
      loadBatches();
      setStep('done');
    } catch (e) { toast.error(e.message || 'Error al publicar'); }
    finally { setPublishing(false); }
  };

  const reset = () => { setStep('upload'); setBatchData(null); setResult(null); setEditingRow(null); };

  const MATCH_LABEL = { exact: 'Exacto', fuzzy: 'Parcial', new: 'Nuevo', ambiguous: 'Ambiguo', unknown: '—' };
  const MATCH_COLOR = { exact: '#10B981', fuzzy: '#F59E0B', new: '#3B82F6', ambiguous: '#EF4444', unknown: 'var(--text-subtle)' };
  const CAT_OPTS    = ['Commuter','Naked','Sport','Scooter','Adventure','Off-Road','Touring','Eléctrica','Big Bike','ATV','Cruiser'];

  return (
    <div>
      <ViewHeader
        title="Importar Precios"
        size="md"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
          {['upload','history'].map(t => (
            <button key={t} onClick={() => { setStep(t); if (t === 'history') loadBatches(); }}
              style={step===t ? {...S.btn,padding:'6px 14px',fontSize:12} : {...S.btn2,padding:'6px 14px',fontSize:12}}>
              {t === 'upload' ? 'Nueva importación' : 'Historial'}
            </button>
          ))}
        </div>
        }
      />

      <div style={{ background: 'var(--brand-soft)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid var(--brand-strong)', fontSize: 12, color: 'var(--brand)' }}>
        <b>Nuevo flujo seguro:</b> los datos no se publican al catálogo hasta que los revises y apruebes explícitamente.
      </div>

      {/* ── UPLOAD ── */}
      {(step === 'upload' || step === 'done') && (
        <div>
          {step === 'done' && result && (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#10B981', marginBottom: 6 }}>Publicado exitosamente</div>
              <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                {result.published} modelos actualizados · {result.created} modelos nuevos creados
                {result.errors && result.errors.length > 0 && <span style={{ color: '#EF4444' }}> · {result.errors.length} errores</span>}
              </div>
              <button onClick={reset} style={{ ...S.btn, marginTop: 12, fontSize: 12 }}>Nueva importación</button>
            </div>
          )}

          {uploading
            ? <Loader label="Procesando PDF…"/>
            : (
            <div style={{ ...S.card, border: '2px dashed var(--border-strong)', textAlign: 'center', padding: '40px 24px', marginBottom: 16, background: '#FAFAFA', cursor: 'pointer' }}
              onDragOver={e => e.preventDefault()} onDrop={handleDrop}
              onClick={() => document.getElementById('staging-file-input').click()}>
              <Ic.upload size={32} color="var(--text-disabled)" style={{marginBottom:12}}/>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-strong)' }}>
                Arrastra el PDF de lista de precios aquí
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 16 }}>
                Formatos soportados: Honda · Yamaha (Yamaimport) · MMB (Keeway/Benelli/Benda/QJ) · Promobility
              </div>
              <label style={{ ...S.btn, cursor: 'pointer' }}>
                Seleccionar PDF
                <input id="staging-file-input" type="file" accept=".pdf" style={{ display: 'none' }} disabled={uploading}
                  onChange={e => e.target.files[0] && handleUpload(e.target.files[0])} />
              </label>
            </div>
            )}

          <div style={{ ...S.card, background: 'var(--surface-muted)', fontSize: 12, color: 'var(--text-subtle)' }}>
            El parser extrae automáticamente: <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>marca · modelo · categoría · precio lista · bono todo medio de pago</span>. Después puedes revisar y corregir cada fila antes de publicar.
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
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {[
                { label: 'Total', val: batchData.rows.length, c: 'var(--text-strong)' },
                { label: 'Válidos', val: validRows.length, c: '#10B981' },
                { label: 'Con error', val: errorRows.length, c: '#EF4444' },
                { label: 'Rechazados', val: rejectedRows.length, c: 'var(--text-subtle)' },
              ].map(({ label, val, c }) => (
                <div key={label} style={{ ...S.card, padding: '10px 16px', textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{val}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
                </div>
              ))}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={reset} style={S.btn2}>Cancelar</button>
                <button onClick={handlePublish} disabled={publishing || validRows.length === 0}
                  style={{ ...S.btn, background: validRows.length === 0 ? 'var(--border-strong)' : '#10B981', opacity: publishing ? 0.7 : 1 }}>
                  {publishing ? 'Publicando...' : `Publicar ${validRows.length} modelos al catálogo`}
                </button>
              </div>
            </div>

            {/* Tabla */}
            <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                    {['Estado','Marca','Modelo','Cat.','Precio lista','Bono','Match','Acciones'].map(h => (
                      <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchData.rows.map(row => {
                    const hasError = row.validation_errors && row.validation_errors.length > 0;
                    const rejected = row.status === 'rejected';
                    const isEditing = editingRow === row.id;
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--surface-sunken)', opacity: rejected ? 0.4 : 1, background: isEditing ? '#FFF9F0' : 'transparent' }}>
                        <td style={{ padding: '8px 10px' }}>
                          {rejected
                            ? <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>Rechazado</span>
                            : hasError
                            ? <span title={row.validation_errors.join('\n')} style={{ fontSize: 10, color: '#EF4444', cursor: 'help' }}>Error</span>
                            : <span style={{ fontSize: 10, color: '#10B981' }}>OK</span>
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
                              <button onClick={saveEdit} disabled={savingEdit} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#10B981', color: 'var(--text-on-dark)', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>{savingEdit?'…':'OK'}</button>
                              <button onClick={()=>setEditingRow(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-subtle)', fontSize: 11, cursor: 'pointer' }}>×</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.brand}</td>
                            <td style={{ padding: '8px 10px' }}>{row.commercial_name || row.model}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-subtle)' }}>{row.category || '—'}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--brand)' }}>{row.price_list ? `$${row.price_list.toLocaleString('es-CL')}` : '—'}</td>
                            <td style={{ padding: '8px 10px', color: '#10B981' }}>{row.bonus ? `$${row.bonus.toLocaleString('es-CL')}` : '—'}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 10, color: MATCH_COLOR[row.match_type] || 'var(--text-subtle)' }}>
                                {MATCH_LABEL[row.match_type] || '—'}
                                {row.catalog_brand && row.match_type !== 'new' && <span style={{ color: 'var(--text-subtle)', marginLeft: 4 }}>({row.catalog_brand} {row.catalog_model})</span>}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              {!rejected && (
                                <>
                                  <button onClick={() => startEdit(row)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-subtle)', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>Editar</button>
                                  <button onClick={() => handleReject(row.id)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#EF4444', fontSize: 11, cursor: 'pointer' }}>Rechazar</button>
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
          {batches.length === 0
            ? <Empty icon={Ic.file} title="Sin importaciones registradas" hint="Las importaciones de precios quedan registradas aquí."/>
            : batches.map(b => (
              <div key={b.id} style={{ ...S.card, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.filename}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                    {new Date(b.created_at).toLocaleDateString('es-CL')} · {b.uploaded_by_name}
                    {' · '}<span style={{ color: '#10B981' }}>{b.approved_rows} publicados</span>
                    {' · '}<span style={{ color: '#F59E0B' }}>{b.pending_rows} pendientes</span>
                    {b.rejected_rows > 0 && <span style={{ color: 'var(--text-subtle)' }}> · {b.rejected_rows} rechazados</span>}
                  </div>
                </div>
                <Bdg
                  l={b.status === 'published' ? 'Publicado' : b.status === 'partial' ? 'Parcial' : 'Pendiente'}
                  c={b.status === 'published' ? '#10B981' : 'var(--text-subtle)'}
                />
                {b.status !== 'published' && (
                  <button onClick={async () => {
                    const d = await api.getPriceBatch(b.id);
                    setBatchData({ batch_id: b.id, rows: d.rows, total: d.rows.length, filename: b.filename });
                    setStep('review');
                  }} style={{ ...S.btn2, padding: '5px 12px', fontSize: 11, color: 'var(--brand)', borderColor: 'var(--brand-strong)' }}>
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

