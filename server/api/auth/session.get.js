import { getSessionUser } from '../../utils/auth.js';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  return { user };
});
