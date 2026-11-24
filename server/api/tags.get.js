import { requireUser } from '../utils/auth.js';
import { listUserTags } from '../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { tags: await listUserTags(user.id) };
});
