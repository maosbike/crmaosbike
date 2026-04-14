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

// Los 9 valores del seguimiento obligatorio (migración 046_lead_followup.sql).
const FOLLOWUP_STATUSES = [
  'cliente_interesado',
  'quedo_responder',
  'contactar_mas_adelante',
  'revisando_cotizacion',
  'reuniendo_pie_docs',
  'evaluacion_financiera',
  'agendar_visita',
  'requiere_nueva_llamada',
  'otro_avance',
];

const FOLLOWUP_LABELS = {
  cliente_interesado:     'Cliente sigue interesado',
  quedo_responder:        'Quedó de responder',
  contactar_mas_adelante: 'Pidió contactar más adelante',
  revisando_cotizacion:   'Está revisando cotización',
  reuniendo_pie_docs:     'Está reuniendo pie / documentos',
  evaluacion_financiera:  'Está en evaluación financiera',
  agendar_visita:         'Agendar visita o test ride',
  requiere_nueva_llamada: 'Requiere nueva llamada',
  otro_avance:            'Otro avance',
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
