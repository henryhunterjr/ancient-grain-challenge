const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'shared.js'),'utf8')+'; globalThis.api=AGC;',sandbox);
const {quizPercentage,lessonProof,LESSONS,taskDescription} = sandbox.api;
for (const bad of ['', ' ',null,undefined,true,[],{},'NaN','Infinity','-Infinity','-1','101','70abc','8 of 10','80%','0x50','1e2']) assert.equal(quizPercentage(bad),null,String(bad));
for (const good of [0,'0',70,'70',100,'100','70.5','.75',' 80 ']) assert.equal(quizPercentage(good),Number(good));
for (const bad of ['','69.999','-1','101','NaN']) assert.throws(()=>lessonProof('Baker',bad));
for (const bad of ['',' ','Baker\nOther','Baker · Score: 100%','x'.repeat(121)]) assert.throws(()=>lessonProof(bad,80));
assert.equal(lessonProof(' Baker ',80),'YouTube: Baker · Score: 80%');
assert.equal(lessonProof('Baker',70),'YouTube: Baker · Score: 70%');
assert.equal(lessonProof('Baker',100),'YouTube: Baker · Score: 100%');
assert.ok(LESSONS.m2.quiz.includes('the-kneading-fallacy'));
assert.equal(Object.values(LESSONS).filter(x=>x.quiz).length,7);
assert.equal(taskDescription({key:'m7',description:'Henry changed this'}),'Henry changed this');
for(const file of ['index.html','lesson.html','admin.html']) {
  const html=fs.readFileSync(path.join(root,file),'utf8');
  for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (script.trim().startsWith('{"@context"')) continue;
    new vm.Script(script,{filename:file});
  }
}
console.log('PASS: numeric percentage matrix, canonical proof, preserved quiz links and all inline script syntax');
