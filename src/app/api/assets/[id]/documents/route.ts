import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/server/api-auth";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { storage } from "@/server/storage";

interface Context { params: Promise<{ id: string }> }
const allowed = ["application/pdf","image/jpeg","image/png","image/webp","text/plain","text/csv","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const input = z.object({ fileName: z.string().trim().min(1).max(240), contentType: z.enum(allowed as [string,...string[]]), sizeBytes: z.number().int().positive().max(25*1024*1024), documentType: z.enum(["photo","invoice","manual","certificate","inspection","other"]).default("other") });
export async function GET(request: NextRequest, context: Context) { const auth=await requireApiPermission(request,"asset:read");if(auth instanceof NextResponse)return auth;const result=await query(`SELECT id,file_name "fileName",content_type "contentType",size_bytes "sizeBytes",document_type "documentType",description,expires_on "expiresOn",created_at "createdAt" FROM asset_documents WHERE asset_id=$1 AND archived_at IS NULL ORDER BY created_at DESC`,[(await context.params).id]);return NextResponse.json({data:result.rows}); }
export async function POST(request: NextRequest, context: Context) { const auth=await requireApiPermission(request,"document:upload");if(auth instanceof NextResponse)return auth;const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"INVALID_DOCUMENT",details:parsed.error.flatten()},{status:422});const id=(await context.params).id;const exists=await query(`SELECT 1 FROM assets WHERE id=$1 AND archived_at IS NULL`,[id]);if(!exists.rowCount)return NextResponse.json({error:"NOT_FOUND"},{status:404});const safeName=parsed.data.fileName.replace(/[^a-zA-Z0-9._-]+/g,"_");const key=`assets/${id}/${crypto.randomUUID()}-${safeName}`;const command=new PutObjectCommand({Bucket:config().S3_BUCKET,Key:key,ContentType:parsed.data.contentType,ContentLength:parsed.data.sizeBytes,Metadata:{asset:id}});const uploadUrl=await getSignedUrl(storage(),command,{expiresIn:600});return NextResponse.json({uploadUrl,objectKey:key,expiresIn:600}); }
