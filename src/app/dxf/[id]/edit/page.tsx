import { notFound } from "next/navigation";
import { hasPermission, requirePageSession } from "@/server/auth";
import { query } from "@/server/db";
import { DxfEditor } from "./dxf-editor";

interface Props { params: Promise<{id:string}>; searchParams: Promise<{version?:string;session?:string}> }
export default async function DxfEditorPage({params,searchParams}:Props) {
  const session=await requirePageSession();
  if(!hasPermission(session,"dxf:write")) notFound();
  const {id}=await params;
  const search=await searchParams;
  const document=(await query<{name:string}>(`SELECT name FROM dxf_documents WHERE id=$1 AND archived_at IS NULL`,[id])).rows[0];
  if(!document) notFound();
  return <DxfEditor documentId={id} documentName={document.name} initialVersionId={search.version ?? null} initialSessionId={search.session ?? null}/>;
}
