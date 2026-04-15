/**
 * Fuente única de verdad para estados de lead/ticket.
 * IMPORTANTE: mantener sincronizado con `frontend/src/ui.jsx` (TICKET_STATUS y FOLLOWUP_OPTS).
 */

const TICKET_STATUSES = [
  'nuevo',
  'abierto',
  'en_gestion',
  'cotizado',
  'financiamiento',
  'ganado',
  'perdido',
];

const ACTIVE_STATUSES   = ['nuevo', 'abierto', 'en_gestion', 'cotizado', 'financiamiento'];
const TERMINAL_STATUSES = ['ganado', 'perdido'];

// Estados que requieren evidencia de contacto antes de poder ser seteados manualmente.
const EVIDENCE_REQUIRED = ['en_gestion', 'cotizado', 'financiamiento'];

// Al registrar un contacto, si el ticket está en alguno de estos estados avanza a 'en_gestion'.
const CONTACT_ADVANCES_FROM = ['nuevo', 'abierto'];

// Los 5 valores del seguimiento obligatorio (reducido de 9 en Fase 3).
// Históricos con valores anteriores siguen leyendo OK (columna TEXT).
const FOLLOWUP_STATUSES = [
  'cliente_interesado',
  'contactar_mas_adelante',
  'revisando_cotizacion',
  'agendar_visita',
  'no_responde',
];

const FOLLOWUP_LABELS = {
  cliente_interesado:     'Cliente sigue interesado',
  contactar_mas_adelante: 'Pidió contactar más adelante',
  revisando_cotizacion:   'Está revisando cotización',
  agendar_visita:         'Agendar visita o test ride',
  no_responde:            'No responde',
};

module.exports = {
  TICKET_STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  EVIDENCE_REQUIRED,
  CONTACT_ADVANCES_FROM,
  FOLLOWUP_STATUSES,
  FOLLOWUP_LABELS,
};
