/** V1 local dev identity — replace with real auth in M8. */
export function getDevUser() {
  return {
    id: process.env.DEV_USER_ID || "dev-user-1",
    name: process.env.DEV_USER_NAME || "Carl",
  };
}
