import { Ic, TY, hasRole, ROLES, ROLE_ADMIN_WRITE } from '../ui.jsx';

// Bottom nav mobile — 5 tabs primarias. Visible solo en <768px via .crm-bottom-nav.
// El ítem "Más" abre el drawer con el resto (Admin, Importar, Reportes, Supplier, etc.).
export function BottomNav({ page, nav, user, onMenuOpen }) {
  const canAdmin = hasRole(user, ...ROLE_ADMIN_WRITE);
  const items = [
    { id: 'dashboard', label: 'Inicio',   icon: Ic.home    },
    { id: 'leads',     label: 'Leads',    icon: Ic.leads   },
    { id: 'pipeline',  label: 'Pipeline', icon: Ic.kanban  },
    // Vendedor ve Ventas; admin/backoffice ve Inventario
    canAdmin
      ? { id: 'inventory', label: 'Stock',  icon: Ic.box  }
      : { id: 'sales',     label: 'Ventas', icon: Ic.sale },
    { id: 'more',      label: 'Más',      icon: Ic.menu    },
  ];

  const isActive = (id) => page === id || (id === 'leads' && page === 'ticket');

  return (
    <nav className="crm-bottom-nav" style={{alignItems:'stretch'}}>
      {items.map(it => {
        const active = id => id === 'more' ? false : isActive(id);
        const act = active(it.id);
        const onClick = () => {
          if (it.id === 'more') { onMenuOpen && onMenuOpen(); return; }
          nav && nav(it.id);
        };
        const color = act ? '#F28100' : '#9CA3AF';
        return (
          <button key={it.id} onClick={onClick}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'inherit', padding: '6px 4px',
              color,
              borderTop: act ? '2px solid #F28100' : '2px solid transparent',
            }}>
            <it.icon size={20} color={color}/>
            <span style={{ fontSize: 9, fontWeight: act ? 700 : 600, letterSpacing: 0, textTransform: 'none', fontFamily: 'inherit' }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
