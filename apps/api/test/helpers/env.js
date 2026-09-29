// Test environment. Must be required before any src/ module.
process.env.NODE_ENV = 'test';
if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL_TEST) {
  process.env.TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/elite_suraksha_test';
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL_TEST;
if (!/test/i.test(process.env.DATABASE_URL)) {
  throw new Error('Refusing to run integration tests against a database whose name does not contain "test"');
}
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret';
process.env.DEMO_MODE_ENABLED = 'true';
process.env.LLM_PROVIDER = 'none';
process.env.HINDSIGHT_LOG_OPERATIONS = process.env.HINDSIGHT_LOG_OPERATIONS || 'false';
