import { getAdminAuth, getAdminDb } from "@/firebase/admin";

export async function requireStoreAccess(request: Request, storeId: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !storeId) throw new Error("UNAUTHORIZED");

  const decoded = await getAdminAuth().verifyIdToken(token);
  const [profile, membership] = await Promise.all([
    getAdminDb().doc(`users/${decoded.uid}`).get(),
    getAdminDb().doc(`stores/${storeId}/members/${decoded.uid}`).get(),
  ]);
  const activeProfile = profile.data()?.active === true;
  const platformAdmin = activeProfile && profile.data()?.systemRole === "platform_admin";
  const storeMember = activeProfile && membership.data()?.active === true;
  if (!platformAdmin && !storeMember) throw new Error("FORBIDDEN");
  return decoded;
}

export function accessError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "UNAUTHORIZED" || message.includes("auth/id-token")
    ? { status: 401, error: "Du må logge inn." }
    : { status: 403, error: "Du har ikke tilgang til dette varehuset." };
}
