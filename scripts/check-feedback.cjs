const assert = require('node:assert/strict');
const { createReport, createFeedbackService } = require('../feedback');

const diagnostics = 'PyroCade: 0.6.0\nOS: Test OS (x64)\nElectron: test\nInstallation: From source';
const bug = {kind:'bug',summary:'  Cannot open a case  ',description:'Expected a case. Saw an error instead.',steps:'1. Choose a game\n2. Open case',includeDiagnostics:true};

(async () => {
  const opened = [], copied = [];
  const service = createFeedbackService({diagnostics:()=>diagnostics,openExternal:async url=>opened.push(url),writeText:text=>copied.push(text)});
  assert.equal(service.info(), diagnostics);
  const report = createReport(bug, diagnostics);
  assert.equal(report.title, '[Bug] Cannot open a case');
  assert.ok(report.body.includes(bug.steps) && report.body.includes(diagnostics));
  await service.open(bug);
  const url = new URL(opened[0]);
  assert.equal(url.origin + url.pathname, 'https://github.com/Pyrodrifter/PyroCade/issues/new');
  assert.equal(url.searchParams.get('body'), report.body);
  assert.equal(url.searchParams.get('template'), 'bug_report.md');
  service.copy(bug);
  assert.equal(copied[0], `${report.title}\n\n${report.body}`);

  const idea = {...bug,kind:'feedback',summary:'日本語 & #? 🎮',description:'An idea with <markup> & a link: https://example.com',includeDiagnostics:false};
  await service.open(idea);
  const ideaUrl = new URL(opened[1]);
  assert.equal(ideaUrl.searchParams.get('title'), '[Feedback] ' + idea.summary);
  assert.equal(ideaUrl.searchParams.get('template'), 'feedback.md');
  assert.ok(!ideaUrl.searchParams.get('body').includes('Steps to reproduce'));
  assert.ok(!ideaUrl.searchParams.get('body').includes(diagnostics));
  assert.ok(ideaUrl.searchParams.get('body').includes(idea.description));
  for (const bad of [null, {...bug,kind:'other'}, {...bug,summary:'   '}, {...bug,description:''}, {...bug,summary:33}, {...bug,description:'x'.repeat(4001)}, {...bug,steps:'x'.repeat(2001)}]) {
    assert.throws(()=>service.copy(bad));
    await assert.rejects(()=>service.open(bad));
  }
  assert.equal(opened.length, 2, 'Invalid reports opened the browser');
  assert.equal(copied.length, 1, 'Invalid reports overwrote the clipboard');

  const long = {...bug,description:'日本語'.repeat(1000)};
  await assert.rejects(()=>service.open(long), /Copy report/);
  service.copy(long);
  assert.ok(copied.at(-1).includes(long.description), 'Long reports were truncated');
  const windows = createFeedbackService({diagnostics:()=>diagnostics,openExternal:async()=>{throw new Error('URL limit bypassed');},writeText:()=>{},maxUrlLength:2081});
  await assert.rejects(()=>windows.open({...bug,description:'x'.repeat(2100)}), /Copy report/);
  const broken = createFeedbackService({diagnostics:()=>diagnostics,openExternal:async()=>{throw new Error('Browser unavailable');},writeText:()=>{throw new Error('Clipboard unavailable');}});
  await assert.rejects(()=>broken.open(bug), /Browser unavailable/);
  assert.throws(()=>broken.copy(bug), /Clipboard unavailable/);
  console.log('Feedback checks passed: validation, bug/feedback bodies, privacy toggle, URL encoding, fixed destination, copy parity, long reports and failures.');
})().catch(error=>{console.error(error);process.exitCode=1;});
