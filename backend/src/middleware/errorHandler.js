// Wrapper para rutas async — captura errores y los pasa al error handler de Express
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Error handler centralizado.
// - Nunca filtra stack traces, mensajes internos ni detalles de DB al cliente en producción.
// - Loguea el error con request id, ruta y método; jamás el body (puede contener
//   contraseñas, tokens o PII) ni query strings sensibles.
const errorHandler = (err, req, res, _next) => {
  let status = Number.isInteger(err?.status) ? err.status
    : Number.isInteger(err?.statusCode) ? err.statusCode
    : 500;

  // Multer: errores de tamaño/tipo deben volver como 400/413, no 500.
  if (err && err.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  } else if (typeof err?.message === 'string' && /no permitid|no se acepta|tipo no permitido/i.test(err.message)) {
    status = 400;
  }

  // Errores de CORS de la propia configuración suben como Error sin status → 403.
  const isCorsErr = err?.message?.startsWith?.('Origin no permitido');
  const finalStatus = isCorsErr ? 403 : status;

  // Mensaje al cliente: solo seguro para 4xx con mensaje custom; nunca el de errores 5xx.
  const safeMessage = finalStatus < 500 && typeof err?.message === 'string' && err.message.length < 200
    ? err.message
    : 'Error interno del servidor';

  if (finalStatus >= 500) {
    // Log estructurado mínimo, sin body ni headers sensibles.
    console.error(`[ERROR] ${req.method} ${req.path} status=${finalStatus} msg="${(err?.message || '').slice(0, 200)}"`);
    if (process.env.NODE_ENV !== 'production') {
      console.error(err?.stack);
    }
  }

  res.status(finalStatus).json({ error: safeMessage });
};

module.exports = { asyncHandler, errorHandler };
