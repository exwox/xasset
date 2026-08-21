"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { AdminUserDto, SiteDto } from "@/server/admin";
import { LogoutButton } from "@/components/logout-button";

const roleNames = { administrator: "Admin", user: "User", viewer: "Viewer" } as const;
type ManagedRole = keyof typeof roleNames;

async function jsonRequest(url: string, method: "POST" | "PATCH", data: unknown) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "REQUEST_FAILED");
  return body.data;
}

function SiteRow({ site, onChanged, notify }: { site: SiteDto; onChanged: (site: SiteDto) => void; notify: (value: string) => void }) {
  const [draft, setDraft] = useState(site);
  const [saving, setSaving] = useState(false);
  async function save(activate = false) {
    setSaving(true);
    try {
      const updated = await jsonRequest(`/api/admin/sites/${site.id}`, "PATCH", {
        code: draft.code, name: draft.name, longitude: Number(draft.longitude), latitude: Number(draft.latitude),
        cameraHeight: Number(draft.cameraHeight), ...(activate ? { active: true } : {}),
      }) as SiteDto;
      setDraft(updated); onChanged(updated); notify(activate ? `${updated.name} menjadi active site.` : "Lokasi site tersimpan.");
    } catch (error) { notify(error instanceof Error ? error.message : "Gagal menyimpan site."); }
    finally { setSaving(false); }
  }
  return <article className={`admin-site-row ${site.active ? "active" : ""}`}>
    <div className="admin-site-status"><span>{site.active ? "ACTIVE SITE" : "SITE"}</span><strong>{site.code}</strong></div>
    <label>Nama<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>Longitude<input type="number" step="0.0000001" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: Number(event.target.value) })} /></label>
    <label>Latitude<input type="number" step="0.0000001" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: Number(event.target.value) })} /></label>
    <label>Ketinggian kamera<input type="number" min="100" value={draft.cameraHeight} onChange={(event) => setDraft({ ...draft, cameraHeight: Number(event.target.value) })} /></label>
    <div className="admin-row-actions"><button disabled={saving} onClick={() => void save(false)}>Simpan</button>{!site.active && <button className="primary" disabled={saving} onClick={() => void save(true)}>Jadikan aktif</button>}</div>
  </article>;
}

export function AdminPanel({ initialUsers, initialSites, currentUserId }: { initialUsers: AdminUserDto[]; initialSites: SiteDto[]; currentUserId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [sites, setSites] = useState(initialSites);
  const [message, setMessage] = useState("");
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement=event.currentTarget; const form = new FormData(formElement);
    try {
      const user = await jsonRequest("/api/admin/users", "POST", { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role") }) as AdminUserDto;
      setUsers((current) => [...current, user].sort((a, b) => a.name.localeCompare(b.name))); formElement.reset(); setMessage("User berhasil dibuat.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal membuat user."); }
  }
  async function updateUser(id: string, changes: { role?: ManagedRole; active?: boolean }) {
    try {
      const updated = await jsonRequest(`/api/admin/users/${id}`, "PATCH", changes) as AdminUserDto;
      setUsers((current) => current.map((item) => item.id === id ? updated : item)); setMessage("Hak akses user diperbarui dan langsung berlaku.");
    } catch (error) { setMessage(error instanceof Error && error.message === "LAST_ACTIVE_ADMIN" ? "Admin aktif terakhir tidak boleh diturunkan atau dinonaktifkan." : "Gagal memperbarui user."); }
  }
  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement=event.currentTarget; const form = new FormData(formElement);
    try {
      const site = await jsonRequest("/api/admin/sites", "POST", { code: form.get("code"), name: form.get("name"), longitude: Number(form.get("longitude")), latitude: Number(form.get("latitude")), cameraHeight: Number(form.get("cameraHeight")), active: false }) as SiteDto;
      setSites((current) => [...current, site]); formElement.reset(); setMessage("Site baru berhasil ditambahkan.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal membuat site."); }
  }
  function replaceSite(updated: SiteDto) {
    setSites((current) => current.map((site) => ({ ...site, active: site.id === updated.id ? updated.active : updated.active ? false : site.active, ...(site.id === updated.id ? updated : {}) })));
  }
  return <main className="admin-console">
    <header className="admin-console-header"><div><span className="admin-kicker">SYSTEM ADMINISTRATION</span><h1>Admin Panel</h1></div><nav><Link href="/">Dashboard</Link><Link href="/assets">Data Aset</Link><Link href="/dxf">DXF</Link><LogoutButton /></nav></header>
    {message && <div className="admin-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
    <section className="admin-console-card"><header><div><span className="admin-kicker">MAP CONFIGURATION</span><h2>Lokasi awal peta</h2></div><p>Site aktif menjadi pusat awal dashboard dan default site untuk DXF/import.</p></header>
      <div className="admin-site-list">{sites.map((site) => <SiteRow key={site.id} site={site} onChanged={replaceSite} notify={setMessage} />)}</div>
      <form className="admin-create-form site-create" onSubmit={createSite}><h3>Tambah bandara / site</h3><input name="code" placeholder="Kode, contoh BTH" required /><input name="name" placeholder="Nama bandara" required /><input name="longitude" type="number" step="0.0000001" placeholder="Longitude" required /><input name="latitude" type="number" step="0.0000001" placeholder="Latitude" required /><input name="cameraHeight" type="number" min="100" defaultValue="4200" required /><button className="primary">Tambah site</button></form>
    </section>
    <section className="admin-console-card"><header><div><span className="admin-kicker">ACCESS CONTROL</span><h2>User & role management</h2></div><p>Admin: penuh · User: edit dataset dan DXF · Viewer: dashboard saja.</p></header>
      <div className="admin-user-list">{users.map((user) => <article key={user.id}><div><strong>{user.name}{user.id === currentUserId ? " · Anda" : ""}</strong><small>{user.email}</small></div><select aria-label={`Role ${user.email}`} value={user.role} onChange={(event) => void updateUser(user.id, { role: event.target.value as ManagedRole })}>{Object.entries(roleNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><label className="admin-active-toggle"><input type="checkbox" checked={user.active} onChange={(event) => void updateUser(user.id, { active: event.target.checked })} /> Aktif</label><time>{user.lastLoginAt ? `Login ${new Date(user.lastLoginAt).toLocaleString("id-ID")}` : "Belum pernah login"}</time></article>)}</div>
      <form className="admin-create-form" onSubmit={createUser}><h3>Tambah user</h3><input name="name" placeholder="Nama lengkap" required /><input name="email" type="email" placeholder="email@domain.com" required /><input name="password" type="password" minLength={12} placeholder="Password minimal 12 karakter" required /><select name="role" defaultValue="viewer">{Object.entries(roleNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><button className="primary">Buat user</button></form>
    </section>
  </main>;
}
