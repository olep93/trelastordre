"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, db } from "@/firebase/config";
import {
  legacyStore,
  pilotStores,
  type EnterpriseStore,
  type EnterpriseUserProfile,
  type StoreRole,
} from "@/lib/enterprise";

type EnterpriseSession = {
  authEnabled: boolean;
  firebaseUser?: User;
  profile?: EnterpriseUserProfile;
  store: EnterpriseStore;
  stores: EnterpriseStore[];
  storeRole?: StoreRole;
  setStoreId: (storeId: string) => void;
  signOut: () => Promise<void>;
};

const AccessContext = createContext<EnterpriseSession | null>(null);
const authEnabled = process.env.NEXT_PUBLIC_ENTERPRISE_AUTH === "true";

async function loadProfile(user: User) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  if (!snapshot.exists()) return undefined;
  return { uid: user.uid, ...(snapshot.data() as Omit<EnterpriseUserProfile, "uid">) };
}

async function loadStores(storeIds: string[]) {
  const stores = await Promise.all(storeIds.map(async (storeId) => {
    const snapshot = await getDoc(doc(db, "stores", storeId));
    if (!snapshot.exists()) return undefined;
    return { id: storeId, ...(snapshot.data() as Omit<EnterpriseStore, "id">) };
  }));
  return stores.filter((store): store is EnterpriseStore => Boolean(store?.active));
}

export function EnterpriseAccessProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!authEnabled);
  const [user, setUser] = useState<User>();
  const [profile, setProfile] = useState<EnterpriseUserProfile>();
  const [stores, setStores] = useState<EnterpriseStore[]>(authEnabled ? [] : [legacyStore]);
  const [storeRole, setStoreRole] = useState<StoreRole>();
  const [storeId, setStoreIdState] = useState(legacyStore.id);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authEnabled) return;
    return onAuthStateChanged(auth, async (nextUser) => {
      setReady(false);
      setUser(nextUser || undefined);
      setProfile(undefined);
      setStores([]);
      setStoreRole(undefined);
      if (!nextUser) {
        setReady(true);
        return;
      }

      const nextProfile = await loadProfile(nextUser);
      if (!nextProfile?.active) {
        setReady(true);
        return;
      }

      const nextStores = nextProfile.systemRole === "platform_admin"
        ? pilotStores
        : await loadStores(nextProfile.storeIds || []);
      setProfile(nextProfile);
      setStores(nextStores);
      const remembered = localStorage.getItem("trelastordre-store-id");
      const preferred = nextStores.find((store) => store.id === remembered)?.id
        || nextStores.find((store) => store.id === nextProfile.defaultStoreId)?.id
        || nextStores[0]?.id;
      if (preferred) setStoreIdState(preferred);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!authEnabled || !user || !storeId) return;
    if (profile?.systemRole === "platform_admin") {
      setStoreRole("store_admin");
      return;
    }
    getDoc(doc(db, `stores/${storeId}/members/${user.uid}`)).then((snapshot) => {
      const role = snapshot.data()?.role;
      setStoreRole(role === "store_admin" ? "store_admin" : "user");
    });
  }, [profile?.systemRole, storeId, user]);

  function setStoreId(nextStoreId: string) {
    if (!stores.some((store) => store.id === nextStoreId)) return;
    localStorage.setItem("trelastordre-store-id", nextStoreId);
    setStoreIdState(nextStoreId);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError("Kunne ikke logge inn. Kontroller e-post og passord.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setError("Skriv inn e-postadressen først.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setError("Tilbakestillingslenke er sendt. Kontroller også søppelpost.");
    } catch {
      setError("Kunne ikke sende tilbakestillingslenken. Kontroller e-postadressen og prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <main className="enterpriseLoading">Klargjør arbeidsflaten …</main>;

  if (authEnabled && !user) {
    return (
      <main className="enterpriseLogin">
        <form className="enterpriseLoginCard" onSubmit={login}>
          <Image src="/obs-bygg-logo.png" alt="Obs BYGG" width={116} height={76} priority />
          <span>Enterprise</span>
          <h1>Logg inn</h1>
          <p>Bruk kontoen som er knyttet til varehuset ditt.</p>
          <label>E-post<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Passord<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="enterpriseLoginMessage">{error}</div>}
          <button className="primary" type="submit" disabled={submitting}>{submitting ? "Logger inn …" : "Logg inn"}</button>
          <button className="textButton" type="button" onClick={resetPassword} disabled={submitting}>Glemt passord?</button>
        </form>
      </main>
    );
  }

  if (authEnabled && (!profile || !stores.length)) {
    return (
      <main className="enterpriseLogin">
        <section className="enterpriseLoginCard">
          <Image src="/obs-bygg-logo.png" alt="Obs BYGG" width={116} height={76} />
          <h1>Tilgang mangler</h1>
          <p>Kontoen er ikke koblet til et aktivt varehus. Kontakt systemadministrator.</p>
          <button className="secondary" onClick={() => firebaseSignOut(auth)}>Logg ut</button>
        </section>
      </main>
    );
  }

  const store = stores.find((item) => item.id === storeId) || stores[0] || legacyStore;
  const value: EnterpriseSession = {
    authEnabled,
    firebaseUser: user,
    profile,
    store,
    stores,
    storeRole,
    setStoreId,
    signOut: () => firebaseSignOut(auth),
  };

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useEnterpriseAccess() {
  const context = useContext(AccessContext);
  if (!context) throw new Error("EnterpriseAccessProvider mangler.");
  return context;
}

export function StoreSelector() {
  const { authEnabled, profile, store, stores, setStoreId, signOut } = useEnterpriseAccess();
  return (
    <section className="storeContextBar">
      <div>
        <span>Aktivt varehus</span>
        <strong>{store.name}</strong>
        {store.sapNumber && <small>SAP {store.sapNumber}</small>}
      </div>
      <div className="storeContextActions">
        {stores.length > 1 && (
          <select aria-label="Velg varehus" value={store.id} onChange={(event) => setStoreId(event.target.value)}>
            {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        )}
        {authEnabled && <span>{profile?.displayName || profile?.email}</span>}
        {authEnabled && <button className="textButton" onClick={signOut}>Logg ut</button>}
      </div>
    </section>
  );
}
