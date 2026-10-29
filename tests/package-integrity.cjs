const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const {version} = require('../package.json');
const archive = path.resolve(root,`../releases/${version}/QuillDesk-win32-x64/resources/app.asar`);
const asar = require('../node_modules/@electron/asar/lib/asar.js');
const checked=[];
function walk(folder){
  for(const item of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){
    const name=path.join(folder,item.name);
    if(item.isDirectory())walk(name);
    else{
      const source=fs.readFileSync(path.join(root,name));
      const bundled=asar.extractFile(archive,name);
      assert.deepEqual(bundled,source,name+' differs in package');
      checked.push({file:name,sha256:crypto.createHash('sha256').update(source).digest('hex')});
    }
  }
}
for(const folder of ['electron','shared','dist'])walk(folder);
const manifest=JSON.parse(asar.extractFile(archive,'package.json'));
assert.equal(manifest.version,version);
assert.equal(manifest.main,'electron/main.cjs');
fs.writeFileSync(path.join(root,'test-results/package-integrity.json'),JSON.stringify({date:new Date().toISOString(),version,archive,checked,passed:true},null,2));
console.log(`PASS: ${checked.length} source/assets match packaged ${version}`);
