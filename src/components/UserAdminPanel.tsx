"use client";

import { useCallback, useEffect, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/firebase/config";
import { useEnterpriseAccess } from "@/components/EnterpriseAccessProvider";

type ManagedUser = {
  uid: string;
  email: string;
  displayName: string;
  role: "store_admin" | "user";
  active: boolean;
};

export function UserAdminPanel() {
  const { firebaseUser, profile, store, stores } = useEnterpriseAccess();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagedUser["role"]>("user");
  const [targetStoreId, setTargetStoreId] = useState(store.id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const request = useCallback(async (method: string, body?: object) => {
    const token = await firebaseUser?.getIdToken();
    const response = await fetch(`/api/admin/users${method === "GET" ? `?storeId=${encodeURIComponent(store.id)}` : ""}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Noe gikk galt.");
    return result;
  }, [firebaseUser, store.id]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request("GET");
      setUsers(result.users);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke hente brukerne.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { setTargetStoreId(store.id); }, [store.id]);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await request("POST", { displayName, email, role, storeId: targetStoreId });
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setDisplayName("");
      setEmail("");
      setRole("user");
      const targetStore = stores.find((item) => item.id === targetStoreId);
      setMessage(`Brukeren er opprettet for ${targetStore?.name || "varehuset"}. Invitasjon er sendt til ${email.trim()}.`);
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke opprette brukeren.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(user: ManagedUser, active: boolean) {
    if (!confirm(`${active ? "Aktivere" : "Deaktivere"} ${user.displayName}?`)) return;
    try {
      await request("PATCH", { uid: user.uid, storeId: store.id, active });
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke endre brukeren.");
    }
  }

  return (
    <section className="userAdminPanel">
      <div className="userAdminHeader">
        <div><span className="sectionKicker">Tilgangsstyring</span><h2>Brukere</h2><p>{store.name} · SAP {store.sapNumber}</p></div>
        <span>{users.filter((user) => user.active).length} aktive</span>
      </div>

      <form className="userCreateForm" onSubmit={createUser}>
        <div><h3>Opprett bruker</h3><p>Brukeren mottar en e-post og velger et sikkert passord selv.</p></div>
        <label>Varehus<select value={targetStoreId} onChange={(event) => setTargetStoreId(event.target.value)} disabled={profile?.systemRole !== "platform_admin"}>{stores.map((item) => <option key={item.id} value={item.id}>{item.name} · SAP {item.sapNumber}</option>)}</select></label>
        <label>Navn<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Fornavn Etternavn" required /></label>
        <label>Jobb-epost<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="navn@coop.no" required /></label>
        <label>Tilgang<select value={role} onChange={(event) => setRole(event.target.value as ManagedUser["role"])}><option value="user">Bruker</option><option value="store_admin">Varehusadministrator</option></select></label>
        <button className="primary" type="submit" disabled={saving}>{saving ? "Oppretter …" : "Opprett og send invitasjon"}</button>
      </form>

      {message && <div className="userAdminMessage">{message}</div>}
      <div className="userList">
        <div className="userListHeader"><strong>Ansatte</strong><span>{loading ? "Laster …" : `${users.length} kontoer`}</span></div>
        {!loading && !users.length && <div className="emptyArchive">Ingen brukere er opprettet for varehuset.</div>}
        {users.map((user) => (
          <article key={user.uid} className={!user.active ? "inactive" : ""}>
            <div className="userAvatar">{user.displayName.trim().charAt(0).toUpperCase() || "?"}</div>
            <div><strong>{user.displayName}</strong><span>{user.email}</span></div>
            <span className="userRole">{user.role === "store_admin" ? "Varehusadmin" : "Bruker"}</span>
            <span className={`userState ${user.active ? "active" : ""}`}>{user.active ? "Aktiv" : "Deaktivert"}</span>
            <button className="textButton" onClick={() => setActive(user, !user.active)}>{user.active ? "Deaktiver" : "Aktiver"}</button>
          </article>
        ))}
      </div>
    </section>
  );
}
