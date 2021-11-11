import Knex from 'knex';

const adminDBConnectionString = process.env.PG_CONNECTION_STRING_ADMIN_DB;
const testDBName = process.env.PG_TEST_DB_NAME;
const templateDBName = process.env.PG_TEST_TEMPLATE_DB_NAME;

export async function recreateTestDB(): Promise<void> {
  if (!adminDBConnectionString) {
    throw new Error('Missing env variable PG_CONNECTION_STRING required for tests');
  }
  if (!testDBName) {
    throw new Error('Missing env variable PG_TEST_DB_NAME required for tests');
  }
  if (!templateDBName) {
    throw new Error('Missing env variable PG_TEST_TEMPLATE_DB_NAME required for tests');
  }
  const adminDb = Knex({
    client: 'pg',
    connection: adminDBConnectionString
  });
  await adminDb.raw('DROP DATABASE IF EXISTS ??', [ testDBName ]);
  await adminDb.raw('CREATE DATABASE ?? TEMPLATE ??', [ testDBName, templateDBName ]);
  adminDb.destroy();
};
