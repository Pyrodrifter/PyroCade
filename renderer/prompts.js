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
  // Icons for the actions that can be rebound in Settings > Customize; these are the defaults.
  const KEY={left:'left',right:'right',up:'up',down:'down',play:'enter',case:'space',back:'escape',manual:'m',favorite:'f',pgup:'pageup',pgdn:'pagedown'};
  const PAD={play:'south',back:'east',manual:'west',case:'north',sysprev:'lb',sysnext:'rb',pgup:'lt',pgdn:'rt',favorite:'select',random:'left-stick-press'};
  const K=action=>typeof Customize==='undefined'?KEY[action]:Customize.keyIcon(action),P=action=>typeof Customize==='undefined'?PAD[action]:Customize.padIcon(action);
  function icon(family, id) {
    const asset = assets.get(`${family}/${id}`);
    if (!asset) throw new Error(`Unknown prompt: ${family}/${id}`);
    return `<img class="button-prompt" src="assets/prompts/${asset.file}" alt="${asset.label}" draggable="false" width="32" height="32"/>`;
  }
  function hint(family, ids, label) {
    ids=ids.filter(Boolean);if(!ids.length)return ''; // an action with no key bound has no hint
    return `<span class="prompt-hint"><span class="prompt-keys">${ids.map(id=>icon(family,id)).join('')}</span><span>${label}</span></span>`;
  }
  function library(family,layout='carousel') {
    const keyboard = family === 'keyboard';
    const groups = keyboard ? [
      ['keyboard',[K('left'),K('right')],'Browse'],['keyboard',[K('up'),K('down')],'System'],['keyboard',[K('play')],'Play'],
      ['keyboard',[K('case')],'Open case'],['keyboard',[K('manual')],'Manual'],['keyboard',[K('favorite')],'Favourite'],['keyboard',['i'],'Details'],['keyboard',['o'],'UI mode'],['keyboard',[K('pgup'),K('pgdn')],'Jump 10'],['keyboard',['f11'],'Fullscreen']
    ] : [
      [family,['left-stick-horizontal'],'Browse'],[family,[P('sysprev'),P('sysnext')],'System'],[family,[P('play')],'Play'],
      [family,[P('case')],'Open case'],[family,[P('manual')],'Manual'],[family,[P('favorite')],'Favourite'],[family,[P('random')],'Random'],[family,[P('pgup'),P('pgdn')],'Jump 10']
    ];
    if(Appearance.browsesVertically(layout)){
      groups[0]=keyboard?['keyboard',[K('up'),K('down')],'Browse']:[family,['left-stick-vertical'],'Browse'];
      if(keyboard)groups[1]=['keyboard',['ctrl','k'],'Systems'];
    }
    return groups.map(g=>hint(...g)).join('');
  }
  function caseHints(family) {
    const keyboard = family === 'keyboard';
    const groups = keyboard ? [
      ['mouse',['drag-left'],'Rotate'],['mouse',['scroll'],'Zoom'],['keyboard',[K('play')],'Play'],
      ['keyboard',[K('manual')],'Manual'],['keyboard',[K('back')],'Back']
    ] : [
      [family,['left-stick-horizontal'],'Rotate'],[family,[P('pgup'),P('pgdn')],'Zoom'],[family,[P('play')],'Play'],
      [family,[P('case')],'Open / close'],[family,[P('manual')],'Manual'],[family,[P('back')],'Back']
    ];
    return groups.map(g=>hint(...g)).join('');
  }
  return {families,labels,detect,icon,library,caseHints};
})();
