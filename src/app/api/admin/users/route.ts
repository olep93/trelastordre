import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/firebase/admin";

type AdminContext = {
  uid: string;
  platformAdmin: boolean;
  storeAdmin: boolean;
};

async function authorize(request: NextRequest, storeId: string): Promise<AdminContext> {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("UNAUTHORIZED");

  const decoded = await adminAuth.verifyIdToken(token);
  const [profile, membership] = await Promise.all([
    adminDb.doc(`users/${decoded.uid}`).get(),
    adminDb.doc(`stores/${storeId}/members/${decoded.uid}`).get(),
  ]);
  const platformAdmin = profile.data()?.active === true && profile.data()?.systemRole === "platform_admin";
  const storeAdmin = membership.data()?.active === true && membership.data()?.role === "store_admin";
  if (!platformAdmin && !storeAdmin) throw new Error("FORBIDDEN");
  return { uid: decoded.uid, platformAdmin, storeAdmin };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Du er ikke logget inn." }, { status: 401 });
  if (message === "FORBIDDEN") return NextResponse.json({ error: "Du har ikke tilgang til brukeradministrasjon." }, { status: 403 });
  if (message.includes("Firebase Admin er ikke konfigurert")) {
    return NextResponse.json({ error: "Brukeradministrasjon er ikke aktivert på serveren ennå." }, { status: 503 });
  }
  return NextResponse.json({ error: "Kunne ikke fullføre handlingen." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const storeId = request.nextUrl.searchParams.get("storeId") || "";
    if (!storeId) return NextResponse.json({ error: "Varehus mangler." }, { status: 400 });
    await authorize(request, storeId);

    const members = await adminDb.collection(`stores/${storeId}/members`).get();
    const users = await Promise.all(members.docs.map(async (member) => {
      const profile = await adminDb.doc(`users/${member.id}`).get();
      const data = profile.data() || {};
      return {
        uid: member.id,
        email: data.email || "",
        displayName: data.displayName || "",
        role: member.data().role || "user",
        active: member.data().active === true && data.active !== false,
      };
    }));
    return NextResponse.json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  let createdUid = "";
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const body = await request.json();
    const storeId = String(body.storeId || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();
    const role = body.role === "store_admin" ? "store_admin" : "user";
    if (!storeId || !displayName || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Fyll inn navn, gyldig e-post og varehus." }, { status: 400 });
    }
    await authorize(request, storeId);

    const user = await adminAuth.createUser({ email, displayName, disabled: false });
    createdUid = user.uid;
    const batch = adminDb.batch();
    batch.set(adminDb.doc(`users/${user.uid}`), {
      email,
      displayName,
      systemRole: "user",
      defaultStoreId: storeId,
      storeIds: [storeId],
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(adminDb.doc(`stores/${storeId}/members/${user.uid}`), {
      role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return NextResponse.json({ uid: user.uid, email });
  } catch (error) {
    if (createdUid) await getAdminAuth().deleteUser(createdUid).catch(() => undefined);
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Det finnes allerede en bruker med denne e-postadressen." }, { status: 409 });
    }
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const body = await request.json();
    const storeId = String(body.storeId || "").trim();
    const uid = String(body.uid || "").trim();
    const active = body.active === true;
    if (!storeId || !uid) return NextResponse.json({ error: "Bruker eller varehus mangler." }, { status: 400 });
    const context = await authorize(request, storeId);
    if (context.uid === uid) return NextResponse.json({ error: "Du kan ikke deaktivere din egen konto." }, { status: 400 });

    const target = await adminDb.doc(`users/${uid}`).get();
    if (target.data()?.systemRole === "platform_admin" && !context.platformAdmin) {
      return NextResponse.json({ error: "Bare plattformadministrator kan endre denne kontoen." }, { status: 403 });
    }
    await Promise.all([
      adminDb.doc(`stores/${storeId}/members/${uid}`).set({ active }, { merge: true }),
      adminDb.doc(`users/${uid}`).set({ active }, { merge: true }),
      adminAuth.updateUser(uid, { disabled: !active }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
