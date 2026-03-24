// Wrapper para rutas async — captura errores y los pasa al error handler de Express
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Error handler centralizado
const errorHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = status === 500 ? 'Error interno del servidor' : err.message;

  // Solo loguear errores 500 (los 4xx son esperados)
  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
    if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack);
    }
  }

  res.status(status).json({ error: message });
};

module.exports = { asyncHandler, errorHandler };
