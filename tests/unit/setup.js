// Nitro injects createError globally; give the unit tests the same helper.
globalThis.createError = (options = {}) => {
  const error = new Error(options.statusMessage ?? options.message ?? 'Error');
  error.statusCode = options.statusCode ?? 500;
  error.statusMessage = options.statusMessage;
  error.data = options.data;
  return error;
};
