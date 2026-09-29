const multer = require('multer');
const logger = require('../lib/logger');

// Sanitised error responses: operational errors return their message; anything
// unexpected returns a generic message. Stack traces are logged, never sent.
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.isOperational ? err.message : 'Something went wrong. Please try again.';

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File size exceeds 5 MB limit' : 'Invalid file upload';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  }

  if (statusCode >= 500) {
    logger.error('API', `${req.method} ${req.originalUrl} failed: ${err.message}`);
    if (err.stack && process.env.NODE_ENV !== 'test') console.error(err.stack);
  }

  const response = { success: false, message };
  if (err.details && statusCode < 500) response.details = err.details;
  res.status(statusCode).json(response);
};

module.exports = errorHandler;
