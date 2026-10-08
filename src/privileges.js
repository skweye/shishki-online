// Bind the privilege to the existing account, never a client-supplied email/name.
export function canLaunchRocket(user, env) {
  return !!env.ROCKET_OWNER_ID && user?.id === env.ROCKET_OWNER_ID;
}
