import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('brochure');
const files=['dashboard','tasks','calendar','rooms','people','stats','sharing','settings','qr-app'];
for(const name of files){
  const p=path.join(dir,'assets',name+'.png');
  if(!fs.existsSync(p)||fs.statSync(p).size<15000)throw Error('Screenshot reale mancante: '+name);
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
await page.goto('file://'+path.join(dir,'CasaFacile_brochure_mobile.html'),{waitUntil:'load'});
await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode()));});
const pdf=path.join(dir,'CasaFacile_Brochure_Smartphone.pdf');
await page.pdf({path:pdf,preferCSSPageSize:true,width:'390px',height:'844px',
  printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});
await browser.close();
if(fs.statSync(pdf).size<120000)throw Error('PDF troppo piccolo');
console.log('Generated '+pdf+' ('+fs.statSync(pdf).size+' bytes)');
