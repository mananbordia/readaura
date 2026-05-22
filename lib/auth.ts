// ReadAura is local-first / single-user. There's no login.
// All routes call getSessionUserId() and get back the same local user id.
// The local user row is created on first DB init (see lib/db.ts).
export const LOCAL_USER_ID = 'local';
export const LOCAL_USERNAME = 'local';

export async function getSessionUserId(): Promise<string> {
  return LOCAL_USER_ID;
}
