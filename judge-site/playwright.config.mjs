import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./browser-test',timeout:30000,workers:1,
 use:{baseURL:'http://127.0.0.1:4325',headless:true,viewport:{width:1280,height:1000},...(process.platform==='win32'?{channel:'msedge'}:{})},
 webServer:{command:`"${process.execPath}" scripts/run-framework.mjs dev --hostname 127.0.0.1 --port 4325`,url:'http://127.0.0.1:4325/api/qa/status',reuseExistingServer:true,env:{NEBIUS_API_KEY:'',NEBIUS_LIVE_ALLOWED:''}},
});
