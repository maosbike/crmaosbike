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
        <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'var(--radius-lg)',padding:'14px 16px',cursor:stats?'pointer':'default'}}
          onClick={()=>stats&&nav('leads')}>
          <div style={{fontSize:28,fontWeight:800,color:'#DC2626',lineHeight:1,marginBottom:4}}>
            {kpi("vencidos","sla_vencidos")}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-disabled)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Sin atender</div>
        </div>
        {/* Leads activos */}
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          <div style={{fontSize:28,fontWeight:800,color:'var(--text)',lineHeight:1,marginBottom:4}}>
            {active.length}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-disabled)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Activos</div>
        </div>
        {/* Ganados */}
        <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:'var(--radius-lg)',padding:'14px 16px'}}>
          <div style={{fontSize:28,fontWeight:800,color:'#15803D',lineHeight:1,marginBottom:4}}>
            {ganados.length}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-disabled)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Ganados</div>
        </div>
        {/* Atender ya */}
        <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:'var(--radius-lg)',padding:'14px 16px'}}>
          <div style={{fontSize:28,fontWeight:800,color:'#B45309',lineHeight:1,marginBottom:4}}>
            {kpi("prox_vencer","proximos_vencer")}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-disabled)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Atender ya</div>
        </div>
        {/* Stock disponible */}
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          <div style={{fontSize:28,fontWeight:800,color:'var(--text-body)',lineHeight:1,marginBottom:4}}>
            {avail}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-disabled)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Stock disp.</div>
        </div>
        {/* Tareas hoy */}
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          <div style={{fontSize:28,fontWeight:800,color:'var(--text-body)',lineHeight:1,marginBottom:4}}>
            {tareasHoy.length||kpi("recordatorios_hoy")}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text-disabled)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Tareas hoy</div>
        </div>
      </div>

      {/* ── Bloque 2: urgentes + tareas en dos columnas ── */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:14,marginBottom:16}}>

        {/* Columna izq: urgentes */}
        <div style={{...S.card,padding:0,overflow:'hidden'}}>
          <div style={{padding:'12px 16px 10px',borderBottom:'1px solid var(--surface-sunken)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Sin atender hoy</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,fontWeight:600,color:'#EF4444',background:'#FEF2F2',padding:'2px 7px',borderRadius:'var(--radius-pill)'}}>{urgentes.length}</span>
              {urgentes.length>8&&<Btn variant="ghost" size="sm" onClick={()=>nav('leads')} style={{fontSize:11,color:'#EF4444',padding:'2px 6px'}}>Ver todos →</Btn>}
            </div>
          </div>
          <div style={{maxHeight:280,overflowY:'auto'}}>
            {urgentes.slice(0,8).map((l,i)=>{
              const st=l.sla_status;
              const horasLeft=l.hours_left;
              const lbl=(st==='breached'||st==='vencido'||horasLeft!=null&&horasLeft<=0)?'Vencido':horasLeft!=null&&horasLeft<2?`${Math.ceil(horasLeft)}h`:horasLeft!=null?`${Math.ceil(horasLeft)}h`:'Sin gestionar';
              const lc=(st==='breached'||st==='vencido'||horasLeft!=null&&horasLeft<=0)?'#EF4444':horasLeft!=null&&horasLeft<2?'#F97316':'var(--text-subtle)';
              return(
                <div key={l.id||l.ticket_id||i} onClick={()=>nav('ticket',String(l.id||l.ticket_id))}
                  style={{padding:'9px 16px',borderBottom:'1px solid var(--surface-muted)',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
                  onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {[l.fn||l.first_name,l.ln||l.last_name].filter(Boolean).join(' ').trim()||'—'}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-disabled)',marginTop:1}}>
                      {l.seller_name||(l.seller_first?`${l.seller_first} ${l.seller_last||''}`.trim():'')||'Sin vendedor'}
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:lc,flexShrink:0}}>{lbl}</span>
                </div>
              );
            })}
            {urgentes.length===0&&(
              <div style={{padding:'28px 16px',textAlign:'center',color:'var(--text-disabled)',fontSize:12}}>Todo al dia</div>
            )}
          </div>
        </div>

        {/* Columna der: tareas hoy */}
        <div style={{...S.card,padding:0,overflow:'hidden'}}>
          <div style={{padding:'12px 16px 10px',borderBottom:'1px solid var(--surface-sunken)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Tareas hoy</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,fontWeight:600,color:'var(--brand)',background:'var(--brand-soft)',padding:'2px 7px',borderRadius:'var(--radius-pill)'}}>{tareasHoy.length}</span>
              {tareasHoy.length>8&&<Btn variant="ghost" size="sm" onClick={()=>nav('calendar')} style={{fontSize:11,color:'var(--brand)',padding:'2px 6px'}}>Ver todas →</Btn>}
            </div>
          </div>
          <div style={{maxHeight:280,overflowY:'auto'}}>
            {tareasHoy.slice(0,8).map((t,i)=>{
              const clientName=[t.client_first,t.client_last].filter(Boolean).join(' ').trim()||t.client_name||'';
              const timeLabel=t.due_time?t.due_time.slice(0,5):fD(t.due_date);
              return(
                <div key={t.id||t.ticket_id||i} onClick={()=>t.ticket_id&&nav('ticket',String(t.ticket_id))}
                  style={{padding:'9px 16px',borderBottom:'1px solid var(--surface-muted)',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
                  onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.title||'—'}</div>
                    <div style={{fontSize:11,color:'var(--text-disabled)',marginTop:1}}>{clientName}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:'var(--brand)',flexShrink:0}}>{timeLabel}</span>
                </div>
              );
            })}
            {tareasHoy.length===0&&(
              <div style={{padding:'28px 16px',textAlign:'center',color:'var(--text-disabled)',fontSize:12}}>Sin tareas para hoy</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bloque 3: Leads recientes ── */}
      <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:16}}>
        <div style={{padding:'12px 16px 10px',borderBottom:'1px solid var(--surface-sunken)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Leads recientes</span>
          <Btn variant="ghost" size="sm" onClick={()=>nav('leads')} style={{fontSize:12,color:'var(--brand)'}}>Ver todos →</Btn>
        </div>
        <div>
          {leads.slice(0,6).map(l=>{
            const motoBrand=l.model_brand||'';
            const motoModel=l.model_name||'';
            const stCfg=TICKET_STATUS[l.status]||{l:l.status,c:'var(--text-subtle)',bg:'var(--surface-muted)'};
            const fotoUrl=l.model_image||null;
            return(
              <div key={l.id} onClick={()=>nav('ticket',String(l.id))}
                style={{padding:'10px 16px',borderBottom:'1px solid var(--surface-muted)',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
                onMouseEnter={e=>e.currentTarget.style.background='#FAFAFA'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                {/* Thumbnail del modelo */}
                <div style={{width:40,height:36,borderRadius:'var(--radius-sm)',background:'var(--surface-sunken)',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {fotoUrl
                    ?<img src={fotoUrl} alt={motoModel} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    :<Ic.bike size={16} color="var(--border-strong)"/>
                  }
                </div>
                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginBottom:1}}>{l.fn} {l.ln}</div>
                  <div style={{fontSize:11,color:'var(--text-disabled)'}}>
                    {motoBrand&&motoModel?`${motoBrand} ${motoModel}`:(motoBrand||motoModel||'Sin modelo')}
                  </div>
                </div>
                {/* Estado badge */}
                <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:'var(--radius-pill)',background:stCfg.bg,color:stCfg.c,flexShrink:0}}>
                  {stCfg.l}
                </span>
              </div>
            );
          })}
          {leads.length===0&&<div style={{padding:'28px 16px',textAlign:'center',color:'var(--text-disabled)',fontSize:12}}>Sin leads todavia</div>}
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
                  <div style={{width:'100%',height:barH,background:d.color,borderRadius:'var(--radius-xs)',opacity:0.8}}/>
                  <span style={{fontSize:8,color:'var(--text-subtle)',textAlign:'center',lineHeight:1.1}}>{d.name}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 14px'}}>Inventario por Sucursal</h3>
          {branches.map(b=>(
            <div key={b.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--surface-sunken)',fontSize:12}}>
              <span style={{color:'var(--text-subtle)'}}>{b.name}</span>
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
