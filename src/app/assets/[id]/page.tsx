import { notFound,redirect } from "next/navigation";
import { hasPermission,requirePageSession } from "@/server/auth";
import { getAsset } from "@/server/assets";
import { AssetDetail } from "./asset-detail";
interface Props{params:Promise<{id:string}>}
export default async function AssetDetailPage({params}:Props){const session=await requirePageSession();if(session.role==="viewer")redirect("/");const asset=await getAsset((await params).id);if(!asset)notFound();return <AssetDetail initialAsset={JSON.parse(JSON.stringify(asset)) as Record<string,unknown>} canWrite={hasPermission(session,"asset:write")} canUploadDocument={hasPermission(session,"document:upload")} canDownloadDocument={hasPermission(session,"document:download")} canDeleteDocument={hasPermission(session,"document:delete")}/>;}
