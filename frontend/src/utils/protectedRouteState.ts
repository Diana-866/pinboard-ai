export type ProtectedRouteState = "redirect" | "loading" | "authenticated";

/**
 * A stored token alone is not proof that the account profile was restored.
 * Protected screens stay unmounted until the initial /me request settles.
 */
export function getProtectedRouteState(
  hasToken: boolean,
  isAuthReady: boolean,
  hasUser: boolean,
): ProtectedRouteState {
  if (!hasToken) return "redirect";
  if (!isAuthReady) return "loading";
  if (!hasUser) return "redirect";
  return "authenticated";
}
