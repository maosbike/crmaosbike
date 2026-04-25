// Formato de fechas para Yamaha — DD/MM/YYYY en zona horaria Chile.
// Yamaha espera el formato DD/MM/YYYY tal cual aparece en la URL del listado.

const TZ = 'America/Santiago';

function format(date) {
  // Intl.DateTimeFormat con es-CL devuelve "DD-MM-YYYY". Reemplazamos guiones por slashes.
  const fmt = new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return fmt.format(date).replace(/-/g, '/');
}

export function chileToday() {
  return format(new Date());
}

export function chileYesterday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return format(d);
}
