import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createAssetXlsx, type ExportAssetPhoto, type ExportAssetRow } from "@/lib/xlsx-export";
import { requireApiPermission } from "@/server/api-auth";
import { assetListSchema } from "@/server/asset-schema";
import { listAssets } from "@/server/assets";
import { config } from "@/server/config";
import { query } from "@/server/db";
import { storage } from "@/server/storage";

export async function GET(request: NextRequest) {
  const auth=await requireApiPermission(request,"asset:read");if(auth instanceof NextResponse)return auth;
  const documentAuth=await requireApiPermission(request,"document:download");if(documentAuth instanceof NextResponse)return documentAuth;
  const parsed=assetListSchema.safeParse({...Object.fromEntries(request.nextUrl.searchParams),page:1,pageSize:100});if(!parsed.success)return NextResponse.json({error:"INVALID_QUERY"},{status:400});
  const first=await listAssets(parsed.data);const all=[...first.data];for(let page=2;page<=first.pagination.pages;page+=1)all.push(...(await listAssets({...parsed.data,page})).data);
  const rows=all as ExportAssetRow[];const ids=rows.map(row=>String(row.id));const documents=ids.length?(await query<{assetId:string;objectKey:string;contentType:ExportAssetPhoto["contentType"]}>(`SELECT asset_id "assetId",object_key "objectKey",content_type "contentType" FROM asset_documents WHERE asset_id=ANY($1::uuid[]) AND archived_at IS NULL AND document_type='photo' AND content_type IN ('image/jpeg','image/png','image/webp') ORDER BY created_at`,[ids])).rows:[];const photos=new Map<string,ExportAssetPhoto[]>();for(let offset=0;offset<documents.length;offset+=12){await Promise.all(documents.slice(offset,offset+12).map(async document=>{const object=await storage().send(new GetObjectCommand({Bucket:config().S3_BUCKET,Key:document.objectKey}));const bytes=await object.Body?.transformToByteArray();if(bytes){const current=photos.get(document.assetId)??[];current.push({bytes,contentType:document.contentType});photos.set(document.assetId,current);}}));}const buffer=createAssetXlsx(rows.map(row=>({...row,exportPhotos:photos.get(String(row.id))??[]})));return new NextResponse(buffer,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="xasset-${new Date().toISOString().slice(0,10)}.xlsx"`}});
}
