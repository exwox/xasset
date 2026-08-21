import {NextRequest,NextResponse} from "next/server";
import {createAssetImportTemplateXlsx} from "@/lib/xlsx-export";
import {requireApiPermission} from "@/server/api-auth";
export async function GET(request:NextRequest){const auth=await requireApiPermission(request,"asset:read");if(auth instanceof NextResponse)return auth;return new NextResponse(createAssetImportTemplateXlsx(),{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":"attachment; filename=template-import-aset-xasset.xlsx","cache-control":"private, no-store"}});}
