import { DxfManager } from "./dxf-manager";
import { hasPermission, requirePageSession } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function DxfPage() {
  const session = await requirePageSession();
  if (session.role === "viewer") redirect("/");
  return (
    <DxfManager canWrite={hasPermission(session, "dxf:write")} canPublish={hasPermission(session, "dxf:publish")} canAdmin={hasPermission(session,"admin:manage")} />
  );
}
