import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const paths=[];
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${e.name}`;if(e.isDirectory())walk(path);else if(/\.(tsx?|css|json|mjs)$/.test(e.name)&&path!=="src/data/registry.json")paths.push(path);}}
for(const dir of ['src','scripts','tests'])walk(dir);
paths.push('package.json','next.config.ts','playwright.config.ts','README.md');
writeFileSync('SOURCE.md','# NAMAE — ソース全文\n\n'+paths.map(p=>`## ${p}\n\n\`\`\`\n${readFileSync(p,'utf8')}\n\`\`\`\n`).join('\n'));
