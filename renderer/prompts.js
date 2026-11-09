// Keep physical button positions stable across controller families.
const Prompts = (() => {
  const families = ['xbox', 'playstation', 'nintendo', 'generic'];
  const labels = {keyboard:'Keyboard & mouse',xbox:'Xbox',playstation:'PlayStation',nintendo:'Nintendo',generic:'Gamepad'};
  const assets = new Map(PromptManifest.assets.map(a => [`${a.family}/${a.id}`, a]));
  function detect(id = '') {
    if (/dualsense|dualshock|playstation|sony|054c/i.test(id)) return 'playstation';
    if (/nintendo|switch|joy.con|057e/i.test(id)) return 'nintendo';
    if (/xbox|xinput|045e|microsoft/i.test(id)) return 'xbox';
    return 'generic';
  }
  function icon(family, id) {
    const asset = assets.get(`${family}/${id}`);
    if (!asset) throw new Error(`Unknown prompt: ${family}/${id}`);
    return `<img class="button-prompt" src="assets/prompts/${asset.file}" alt="${asset.label}" draggable="false" width="32" height="32"/>`;
  }
  function hint(family, ids, label) {
    return `<span class="prompt-hint"><span class="prompt-keys">${ids.map(id=>icon(family,id)).join('')}</span><span>${label}</span></span>`;
  }
  function library(family,layout='carousel') {
    const keyboard = family === 'keyboard';
    const playFace = family === 'nintendo' ? 'east' : 'south';
    const groups = keyboard ? [
      ['keyboard',['left','right'],'Browse'],['keyboard',['up','down'],'System'],['keyboard',['enter'],'Play'],
      ['keyboard',['space'],'Open case'],['keyboard',['m'],'Manual'],['keyboard',['i'],'Details'],['keyboard',['o'],'UI mode'],['keyboard',['pageup','pagedown'],'Jump 10'],['keyboard',['f11'],'Fullscreen']
    ] : [
      [family,['left-stick-horizontal'],'Browse'],[family,['lb','rb'],'System'],[family,[playFace],'Play'],
      [family,['north'],'Open case'],[family,['west'],'Manual'],[family,['lt','rt'],'Jump 10']
    ];
    if(['vertical','swatches'].includes(layout)){
      groups[0]=keyboard?['keyboard',layout==='vertical'?['up','down']:['left','right','up','down'],'Browse']:[family,[layout==='vertical'?'left-stick-vertical':'left-stick'],'Browse'];
      if(keyboard)groups[1]=['keyboard',['ctrl','k'],'Systems'];
    }
    return groups.map(g=>hint(...g)).join('');
  }
  function caseHints(family) {
    const keyboard = family === 'keyboard';
    const playFace = family === 'nintendo' ? 'east' : 'south';
    const backFace = family === 'nintendo' ? 'south' : 'east';
    const groups = keyboard ? [
      ['mouse',['drag-left'],'Rotate'],['mouse',['scroll'],'Zoom'],['keyboard',['enter'],'Play'],
      ['keyboard',['m'],'Manual'],['keyboard',['escape'],'Back']
    ] : [
      [family,['left-stick-horizontal'],'Rotate'],[family,['lt','rt'],'Zoom'],[family,[playFace],'Play'],
      [family,['north'],'Open / close'],[family,['west'],'Manual'],[family,[backFace],'Back']
    ];
    return groups.map(g=>hint(...g)).join('');
  }
  return {families,labels,detect,icon,library,caseHints};
})();
