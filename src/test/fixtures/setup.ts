import { recreateTestDB } from '../utils/recreateTestDB';

export async function mochaGlobalSetup(): Promise<void> {
  await recreateTestDB();
};
