import { getVapid } from '../../utils/push.js';

export default defineEventHandler(async () => {
  const { publicKey } = await getVapid();
  return { publicKey };
});
