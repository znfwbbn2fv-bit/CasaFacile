import {cpSync,copyFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const output=join(project,'cloudflare','public');
rmSync(output,{force:true,recursive:true});
mkdirSync(output,{recursive:true});
for(const filename of ['index.html','app.js','styles.css','manifest.webmanifest','sw.js',
  'cloud-client.js','cloud-config.js']){
  copyFileSync(join(project,filename),join(output,filename));
}
cpSync(join(project,'assets'),join(output,'assets'),{recursive:true});
console.log('Cloudflare Pages/Workers assets prepared in cloudflare/public');
