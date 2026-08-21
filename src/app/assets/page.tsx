import { redirect } from "next/navigation";
import { requirePageSession, hasPermission } from "@/server/auth";
import { AssetTable } from "./asset-table";
import { getActiveSite } from "@/server/admin";

export default async function AssetsPage() { const session = await requirePageSession(); if(session.role === "viewer") redirect("/"); const admin=hasPermission(session,"admin:manage"); const site=await getActiveSite(); return <AssetTable canWrite={hasPermission(session, "asset:write")} canDeleteAll={admin} canAdmin={admin} siteName={site.name} />; }
