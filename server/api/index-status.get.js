import { getIndexStatus } from '../utils/indexer.js';

export default defineEventHandler(async () => {
  return await getIndexStatus();
});
