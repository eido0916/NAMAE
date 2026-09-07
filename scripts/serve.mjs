import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
const root=resolve('out');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2'};
createServer(async(req,res)=>{try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}if((await stat(path)).isDirectory())path=resolve(path,'index.html');const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]??(path.endsWith('opengraph-image')?'image/png':'application/octet-stream')});res.end(data);}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found');}}).listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`NAMAE: http://localhost:${process.env.PORT||3000}`));
