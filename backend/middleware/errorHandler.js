// backend/middleware/errorHandler.js
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  const errorResponse = {
    message: err.message || 'Internal Server Error',
    status: statusCode,
  };

  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
    errorResponse.path = req.originalUrl;
    errorResponse.method = req.method;
  }

  console.error(`[${req.method}] ${req.originalUrl} - ${err.message}`);

  res.status(statusCode).json(errorResponse);
}
