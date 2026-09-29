const PlatformAdapter = require('./PlatformAdapter');
const AppError = require('../utils/AppError');

// Conceptual adapters. All three share the generic statement format today;
// a real integration would override normalizeStatement() for its export format.
const adapters = {
  GENERIC_DELIVERY: new PlatformAdapter({
    code: 'GENERIC_DELIVERY',
    name: 'Generic Delivery Platform',
    category: 'DELIVERY',
    unitLabel: 'orders'
  }),
  GENERIC_RIDE: new PlatformAdapter({
    code: 'GENERIC_RIDE',
    name: 'Generic Ride Platform',
    category: 'RIDE',
    unitLabel: 'rides'
  }),
  GENERIC_FREELANCE: new PlatformAdapter({
    code: 'GENERIC_FREELANCE',
    name: 'Generic Freelance Platform',
    category: 'FREELANCE',
    unitLabel: 'tasks'
  })
};

const getAdapter = (code) => {
  const adapter = adapters[code];
  if (!adapter) throw new AppError(`Unsupported platform: ${code}`, 400);
  return adapter;
};

const listAdapters = () => Object.values(adapters).map((a) => a.describe());

module.exports = { getAdapter, listAdapters, adapters };
