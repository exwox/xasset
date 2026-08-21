export {};
const base=(process.env.BASE_URL??"http://127.0.0.1:3000").replace(/\/$/,"");const email=process.env.SMOKE_EMAIL;const password=process.env.SMOKE_PASSWORD;if(!email||!password)throw new Error("SMOKE_EMAIL and SMOKE_PASSWORD are required");
async function main(){const checks:Record<string,boolean>={};
  const unauth=await fetch(`${base}/api/assets`);checks.unauthenticatedRejected=unauth.status===401;
  const csrf=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json",origin:"https://evil.example","sec-fetch-site":"cross-site"},body:JSON.stringify({email,password})});checks.crossSiteRejected=csrf.status===403;
  const login=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({email,password})});const cookie=login.headers.get("set-cookie")?.split(";",1)[0];if(!login.ok||!cookie)throw new Error(`Valid login failed: ${login.status}`);
  const injection=await fetch(`${base}/api/assets?q=${encodeURIComponent("' OR 1=1; <script>alert(1)</script>")}&pageSize=1`,{headers:{cookie}});checks.injectionHandledAsData=injection.status===200;
  const idor=await fetch(`${base}/api/assets/00000000-0000-4000-8000-000000000000/documents/00000000-0000-4000-8000-000000000001`,{headers:{cookie}});checks.scopedResourceNotFound=idor.status===404;
  const probe=`security-${Date.now()}@invalid.local`;let last=0;for(let index=0;index<11;index+=1){const response=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({email:probe,password:"invalid-password"})});last=response.status}checks.accountRateLimited=last===429;
  const headers=await fetch(`${base}/login`);checks.securityHeaders=headers.headers.get("x-frame-options")==="DENY"&&headers.headers.get("x-content-type-options")==="nosniff"&&Boolean(headers.headers.get("content-security-policy"));
  console.log(JSON.stringify({checks,statuses:{unauth:unauth.status,csrf:csrf.status,injection:injection.status,idor:idor.status,rateLimit:last},ok:Object.values(checks).every(Boolean)},null,2));if(!Object.values(checks).every(Boolean))process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1});
