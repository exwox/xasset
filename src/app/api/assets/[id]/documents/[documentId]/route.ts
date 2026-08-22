import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest,NextResponse } from "next/server";
import { requireApiPermission } from "@/server/api-auth";
import { writeAudit } from "@/server/audit";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { publicStorage } from "@/server/storage";
interface Context{params:Promise<{id:string;documentId:string}>}
export async function GET(request:NextRequest,context:Context){const auth=await requireApiPermission(request,"document:download");if(auth instanceof NextResponse)return auth;const {id,documentId}=await context.params;const result=await query<{object_key:string;file_name:string}>(`SELECT object_key,file_name FROM asset_documents WHERE id=$1 AND asset_id=$2 AND archived_at IS NULL`,[documentId,id]);if(!result.rows[0])return NextResponse.json({error:"NOT_FOUND"},{status:404});const url=await getSignedUrl(publicStorage(),new GetObjectCommand({Bucket:config().S3_BUCKET,Key:result.rows[0].object_key,ResponseContentDisposition:`inline; filename="${result.rows[0].file_name.replaceAll('"','')}"`}),{expiresIn:300});return NextResponse.json({url,expiresIn:300});}
export async function DELETE(request:NextRequest,context:Context){const auth=await requireApiPermission(request,"document:delete");if(auth instanceof NextResponse)return auth;const {id,documentId}=await context.params;const result=await query<{object_key:string;file_name:string}>(`UPDATE asset_documents SET archived_at=now() WHERE id=$1 AND asset_id=$2 AND archived_at IS NULL RETURNING object_key,file_name`,[documentId,id]);if(!result.rows[0])return NextResponse.json({error:"NOT_FOUND"},{status:404});await writeAudit({actor:auth,action:"asset.document_archive",resourceType:"asset",resourceId:id,before:{documentId,fileName:result.rows[0].file_name},after:{recoverable:true}});return NextResponse.json({ok:true,recoverable:true});}
