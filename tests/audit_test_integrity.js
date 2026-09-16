const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('tests').filter(f => f.startsWith('test_') && f.endsWith('.js'));
console.log('Detailed integrity breakdown for ' + files.length + ' test suites:\n');

console.log('Test File'.padEnd(45) + ' | DB Queries | Status Checks | Body Checks | Total Asserts');
console.log('-'.repeat(90));

let sumDB = 0;
let sumStatus = 0;
let sumBody = 0;
let sumAsserts = 0;

for (const file of files) {
  const code = fs.readFileSync(path.join('tests', file), 'utf8');
  const dbQueries = (code.match(/(pool\.query|db\.query|client\.query|qdb\()/g) || []).length;
  const statusChecks = (code.match(/status(Code)?\s*===/g) || []).length;
  const bodyChecks = (code.match(/(\.body(\.|\b)|\.data(\.|\b)|rows|resBody)/g) || []).length;
  const asserts = (code.match(/(assert\(|assert\.[a-zA-Z]+\(|expect\(|\.toBe\(|\.toEqual\()/g) || []).length;

  sumDB += dbQueries;
  sumStatus += statusChecks;
  sumBody += bodyChecks;
  sumAsserts += asserts;

  console.log(
    file.padEnd(45) +
    ' | ' + String(dbQueries).padStart(10) +
    ' | ' + String(statusChecks).padStart(13) +
    ' | ' + String(bodyChecks).padStart(11) +
    ' | ' + String(asserts).padStart(13)
  );
}

console.log('-'.repeat(90));
console.log(
  'TOTAL'.padEnd(45) +
  ' | ' + String(sumDB).padStart(10) +
  ' | ' + String(sumStatus).padStart(13) +
  ' | ' + String(sumBody).padStart(11) +
  ' | ' + String(sumAsserts).padStart(13)
);
