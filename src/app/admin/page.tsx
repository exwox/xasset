import { redirect } from "next/navigation";
import { listAdminUsers, listSites } from "@/server/admin";
import { hasPermission, requirePageSession } from "@/server/auth";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  const session = await requirePageSession();
  if (!hasPermission(session, "admin:manage")) redirect("/");
  const [users, sites] = await Promise.all([listAdminUsers(), listSites()]);
  return <AdminPanel initialUsers={users} initialSites={sites} currentUserId={session.userId} />;
}
