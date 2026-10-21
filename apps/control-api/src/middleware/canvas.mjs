import { readFile } from 'node:fs/promises';
const assets=new Map([['/canvas/',['../../../../apps/workflow-canvas/index.html','text/html; charset=utf-8']],...['app.mjs','model.mjs'].map(n=>[`/canvas/${n}`,[`../../../../apps/workflow-canvas/${n}`,'text/javascript; charset=utf-8']]),['/canvas/style.css',['../../../../apps/workflow-canvas/style.css','text/css; charset=utf-8']]]);
const knownIcons=new Set(JSON.parse(await readFile(new URL('../../../../packages/toolchain/catalog.json',import.meta.url),'utf8')).tools.map(t=>t.id));
export async function serveCanvas(path,res){
  if(path==='/canvas'){res.writeHead(302,{Location:'/canvas/'});res.end();return true;}
  const icon=path.match(/^\/canvas\/icons\/([a-z-]+)\.svg$/);
  const entry=assets.get(path)||(icon&&knownIcons.has(icon[1])?[`../../../../packages/toolchain/icons/${icon[1]}.svg`,'image/svg+xml']:null);
  if(!entry)return false;
  const bytes=await readFile(new URL(entry[0],import.meta.url));
  res.writeHead(200,{'Content-Type':entry[1],'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(bytes);return true;
}
