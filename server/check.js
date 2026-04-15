const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.js')) results.push(file);
  });
  return results;
}
const files = walk('./src/module');
files.forEach(f => {
  const code = fs.readFileSync(f, 'utf8');
  if (code.includes('requirePermission') && !code.includes('require(\'../../middleware/auth\')')) {
      console.log('USED BUT NO AUTH IMPORT in: ' + f);
  }
});
console.log("Check 2 Complete.");
