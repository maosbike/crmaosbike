import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, ACTIVE_STATUSES, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket, ViewHeader, useIsMobile, ErrorMsg, Btn } from '../ui.jsx';

export function Dashboard({leads,inv,user,nav,branches=[]}){
  const[stats,setStats]=useState(null);
  const[statsErr,setStatsErr]=useState('');
  const isMobile = useIsMobile();
  const active=leads.filter(l=>ACTIVE_STATUSES.includes(l.status));
  const ganados=leads.filter(l=>l.status==="ganado");
  const perdidos=leads.filter(l=>l.status==="perdido");
  const avail=inv.filter(x=>x.status==="disponible").length;
  const pipe=Object.entries(TICKET_STATUS).slice(0,5).map(([k,v])=>({name:v.l,count:leads.filter(l=>l.status===k).length,color:v.c}));
  useEffect(()=>{api.getCommercialStats().then(d=>setStats(d)).catch(()=>{setStatsErr('No se pudieron cargar los datos.');});},[]);
  const kpi=(key,...fallbacks)=>{if(!stats)return 0;for(const k of[key,...fallbacks]){const v=stats.stats?.[k]??stats.kpis?.[k]??stats[k];if(v!==undefined&&v!==null)return v;}return 0;};
  const urgentes=stats?.leads_urgentes||stats?.urgentes||[];
  const tareasHoy=stats?.recordatorios_hoy||stats?.tareas_hoy||stats?.reminders_today||[];

  return(
    <div>
      <ViewHeader title={`${/a$/i.test((user.fn||'').trim())?'Bienvenida':'Bienvenido'}, ${user.fn}`} subtitle={user.branchName||"Todas las sucursales"} size="md" />
      {statsErr && <ErrorMsg msg={statsErr} />}

      {/* ── Bloque 1: KPI strip horizontal ── */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:16}}>
        {/* Sin atender — SLA vencido */}
        <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:12,padding:'14px 16px',cursor: stats ? 'pointer' : 'default'}}
          onClick={()=>stats&&nav('leads')}>
          <div style={{fontSize:26,fontWeight:800,color:'#DC2626',lineHeight:1,marginBottom:4}}>
            {kpi("vencidos","sla_vencidos")}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'}}>Sin atender</div>
        </div>
        {/* Leads activos */}
        <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:12,padding:'14px 16px'}}>
          <div style={{fontSize:26,fontWeight:800,color:'#15803D',lineHeight:1,marginBottom:4}}>
            {active.length}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'}}>Activos</div>
        </div>
        {/* Ganados */}
        <div style={{background:'#ECFDF5',border:'1px solid #A7F3D0',borderRadius:12,padding:'14px 16px'}}>
          <div style={{fontSize:26,fontWeight:800,color:'#059669',lineHeight:1,marginBottom:4}}>
            {ganados.length}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'}}>Ganados</div>
        </div>
        {/* Stock disponible */}
        <div style={{background:'#F5F3FF',border:'1px solid #DDD6FE',borderRadius:12,padding:'14px 16px'}}>
          <div style={{fontSize:26,fontWeight:800,color:'#7C3AED',lineHeight:1,marginBottom:4}}>
            {avail}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'}}>Stock disp.</div>
        </div>
        {/* Tareas hoy */}
        <div style={{background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:12,padding:'14px 16px'}}>
          <div style={{fontSize:26,fontWeight:800,color:'#C2410C',lineHeight:1,marginBottom:4}}>
            {kpi("recordatorios_hoy")}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'}}>Tareas hoy</div>
        </div>
        {/* Atender ya */}
        <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:12,padding:'14px 16px'}}>
          <div style={{fontSize:26,fontWeight:800,color:'#D97706',lineHeight:1,marginBottom:4}}>
            {kpi("prox_vencer","proximos_vencer")}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em'}}>Atender ya</div>
        </div>
      </div>

      {/* ── Bloque 2: urgentes + tareas en dos columnas ── */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:14,marginBottom:16}}>

        {/* Columna izq: urgentes */}
        <div style={{...S.card,padding:0,overflow:'hidden'}}>
          <div style={{padding:'12px 16px 10px',borderBottom:'1px solid #F3F4F6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>Sin atender hoy</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,fontWeight:600,color:'#EF4444',background:'#FEF2F2',padding:'2px 7px',borderRadius:99}}>{urgentes.length}</span>
              {urgentes.length>8&&<Btn variant="ghost" size="sm" onClick={()=>nav('leads')} style={{fontSize:11,color:'#EF4444',padding:'2px 6px'}}>Ver todos →</Btn>}
            </div>
          </div>
          <div style={{maxHeight:240,overflowY:'auto'}}>
            {urgentes.slice(0,8).map((l,i)=>{
              const st=l.sla_status;
              const horasLeft=l.hours_left;
              const lbl=(st==='breached'||st==='vencido'||horasLeft!=null&&horasLeft<=0)?'Vencido':horasLeft!=null&&horasLeft<2?`${Math.ceil(horasLeft)}h`:horasLeft!=null?`${Math.ceil(horasLeft)}h`:'Sin gestionar';
              const lc=(st==='breached'||st==='vencido'||horasLeft!=null&&horasLeft<=0)?'#EF4444':horasLeft!=null&&horasLeft<2?'#F97316':'#6B7280';
              return(
                <div key={i} onClick={()=>nav('ticket',String(l.id||l.ticket_id))}
                  style={{padding:'9px 16px',borderBottom:'1px solid #F9FAFB',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
                  onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {[l.fn||l.first_name,l.ln||l.last_name].filter(Boolean).join(' ').trim()||'—'}
                    </div>
                    <div style={{fontSize:11,color:'#9CA3AF',marginTop:1}}>
                      {l.seller_name||(l.seller_first?`${l.seller_first} ${l.seller_last||''}`.trim():'')||'Sin vendedor'}
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:lc,flexShrink:0}}>{lbl}</span>
                </div>
              );
            })}
            {urgentes.length===0&&(
              <div style={{padding:'28px 16px',textAlign:'center',color:'#9CA3AF',fontSize:12}}>Todo al dia</div>
            )}
          </div>
        </div>

        {/* Columna der: tareas hoy */}
        <div style={{...S.card,padding:0,overflow:'hidden'}}>
          <div style={{padding:'12px 16px 10px',borderBottom:'1px solid #F3F4F6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>Tareas hoy</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,fontWeight:600,color:'#F28100',background:'rgba(242,129,0,0.1)',padding:'2px 7px',borderRadius:99}}>{tareasHoy.length}</span>
              {tareasHoy.length>8&&<Btn variant="ghost" size="sm" onClick={()=>nav('calendar')} style={{fontSize:11,color:'#F28100',padding:'2px 6px'}}>Ver todas →</Btn>}
            </div>
          </div>
          <div style={{maxHeight:240,overflowY:'auto'}}>
            {tareasHoy.slice(0,8).map((t,i)=>(
              <div key={i} onClick={()=>t.ticket_id&&nav('ticket',String(t.ticket_id))}
                style={{padding:'9px 16px',borderBottom:'1px solid #F9FAFB',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
                onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.title}</div>
                  <div style={{fontSize:11,color:'#9CA3AF',marginTop:1}}>{t.client_name||''}</div>
                </div>
                <span style={{fontSize:11,fontWeight:600,color:'#F28100',flexShrink:0}}>{t.reminder_time||fD(t.reminder_date)}</span>
              </div>
            ))}
            {tareasHoy.length===0&&(
              <div style={{padding:'28px 16px',textAlign:'center',color:'#9CA3AF',fontSize:12}}>Sin tareas para hoy</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bloque 3: Leads recientes ── */}
      <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:16}}>
        <div style={{padding:'12px 16px 10px',borderBottom:'1px solid #F3F4F6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>Leads recientes</span>
          <Btn variant="ghost" size="sm" onClick={()=>nav('leads')} style={{fontSize:12,color:'#F28100'}}>Ver todos →</Btn>
        </div>
        <div>
          {leads.slice(0,6).map(l=>{
            const motoBrand=l.model_brand||'';
            const motoModel=l.model_name||'';
            const stCfg=TICKET_STATUS[l.status]||{l:l.status,c:'#6B7280',bg:'#F9FAFB'};
            return(
              <div key={l.id} onClick={()=>nav('ticket',l.id)}
                style={{padding:'10px 16px',borderBottom:'1px solid #F9FAFB',cursor:'pointer',display:'flex',alignItems:'center',gap:12}}
                onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.fn} {l.ln}</div>
                  <div style={{fontSize:11,color:'#6B7280',marginTop:1}}>
                    {motoBrand&&motoModel?`${motoBrand} ${motoModel}`:(motoBrand||motoModel||'Sin moto')}
                    {l.num?` · #${l.num}`:''}
                  </div>
                </div>
                <span style={{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:99,background:stCfg.bg,color:stCfg.c,flexShrink:0}}>
                  {stCfg.l}
                </span>
                <PBdg p={l.priority}/>
              </div>
            );
          })}
          {leads.length===0&&<div style={{padding:'28px 16px',textAlign:'center',color:'#9CA3AF',fontSize:12}}>Sin leads todavia</div>}
        </div>
      </div>

      {/* ── Bloque 4: Pipeline + Inventario (resumen al fondo) ── */}
      <div className="crm-dash-bottom" style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'2fr 1fr',gap:14,marginBottom:18}}>
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 10px'}}>Pipeline</h3>
          <div style={{display:'flex',gap:4,marginBottom:4}}>
            {pipe.map((d,i)=><div key={i} style={{flex:1,textAlign:'center',fontSize:11,fontWeight:700}}>{d.count}</div>)}
          </div>
          <div style={{display:'flex',gap:4,alignItems:'flex-end',height:88,overflow:'hidden'}}>
            {pipe.map((d,i)=>{
              const maxH=Math.max(...pipe.map(x=>x.count),1);
              const barH=Math.max(Math.round((d.count/maxH)*76),d.count>0?4:2);
              return(
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <div style={{width:'100%',height:barH,background:d.color,borderRadius:4,opacity:0.8}}/>
                  <span style={{fontSize:8,color:'#6B7280',textAlign:'center',lineHeight:1.1}}>{d.name}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 14px'}}>Inventario por Sucursal</h3>
          {branches.map(b=>(
            <div key={b.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #F3F4F6',fontSize:12}}>
              <span style={{color:'#6B7280'}}>{b.name}</span>
              <span style={{fontWeight:700}}>{inv.filter(x=>x.branch_id===b.id&&x.status==='disponible').length} disp.</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LEADS LIST
// ═══════════════════════════════════════════
