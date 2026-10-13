import {env} from 'cloudflare:workers';
import {createQaGateway} from '../../../../lib/gateway.mjs';
import {createExportHandler} from '../../../../lib/exports.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){
  const localMock=import.meta.env.DEV===true&&env.RIG_QA_LOCAL_MOCK==='1';
  const options={env,db:env.DB,localMock};
  const path=new URL(request.url).pathname;
  const handler=path==='/api/qa/handoff'||path==='/api/qa/review'?createExportHandler(options):createQaGateway(options);
  try{return await handler(request);}catch{return Response.json({error:'service_unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}
export const GET=handle;
export const POST=handle;
