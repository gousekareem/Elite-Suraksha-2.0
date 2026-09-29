const AppError = require('../utils/AppError');

const validate = (validator) => (req, res, next) => {
  const result = validator(req);

  if (!result.valid) {
    return next(new AppError('Validation failed', 400, result.errors));
  }

  next();
};

module.exports = validate;