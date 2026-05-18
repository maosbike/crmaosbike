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

// Motivos de cierre cuando un lead pasa a estado 'perdido'. Alineado con
// la categorización que pide Yamaha al admin para reportar leads perdidos.
// + extensión: motivos operativos para limpiar leads acumulados.
const LOST_REASONS = [
  'compro_otra_marca',
  'compro_misma_marca',         // ya compró otra moto Yamaha por otro canal
  'no_aplica_financiamiento',
  'solo_cotizando',
  'sin_presupuesto',
  'no_contesta',
  'telefono_malo',              // teléfono inválido / no se ubicó al cliente
  'duplicado',                  // lead duplicado (cliente ya tenía otro lead activo)
  'fuera_de_zona',              // cliente fuera del área de cobertura
  'no_califica',                // no tiene licencia / no califica por otros motivos
  'otro',
];

const LOST_REASON_LABELS = {
  compro_otra_marca:        'Compró en otra marca',
  compro_misma_marca:       'Ya compró por otro canal',
  no_aplica_financiamiento: 'No aplica para financiamiento',
  solo_cotizando:           'Solo estaba cotizando (sin intención real)',
  sin_presupuesto:          'Sin presupuesto / sin pie',
  no_contesta:              'No volvió a contestar tras varios intentos',
  telefono_malo:            'Teléfono inválido / no se ubicó',
  duplicado:                'Lead duplicado',
  fuera_de_zona:            'Cliente fuera de zona',
  no_califica:              'No califica (sin licencia u otro)',
  otro:                     'Otro motivo',
};

module.exports = {
  TICKET_STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  EVIDENCE_REQUIRED,
  CONTACT_ADVANCES_FROM,
  FOLLOWUP_STATUSES,
  FOLLOWUP_LABELS,
  LOST_REASONS,
  LOST_REASON_LABELS,
};
