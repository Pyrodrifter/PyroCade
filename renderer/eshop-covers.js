// Display-only sleeves for GameTDB's red eShop template. Source files stay intact.
const EshopCovers=(()=>{
  function analyze(image) {
    const ratio=image.naturalWidth/image.naturalHeight;
    if(ratio<.57||ratio>.66)return null;
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=104;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,64,104);
    let data;try{data=ctx.getImageData(0,0,64,104).data}catch{return null}
    const red=(x,y)=>{const i=(y*64+x)*4;return data[i]>140&&data[i+1]<65&&data[i+2]<80&&data[i]>data[i+1]*2};
    let redCount=0,count=0;
    for(const x of [2,4,59,61])for(const y of [18,25,35,45,55,65,90,99]){count++;if(red(x,y))redCount++}
    for(const y of [13,20,25,67,71,94]){count++;if(red(32,y))redCount++}
    if(redCount/count<.91)return null;
    const rows=[];
    for(let y=26;y<66;y++){let distinct=0;for(let x=8;x<56;x++)if(!red(x,y))distinct++;if(distinct>18)rows.push(y)}
    if(rows.length<15||rows.length>34)return null;
    const crop={x:.1,y:rows[0]/104,w:.8,h:(rows[rows.length-1]-rows[0]+1)/104};
    return {crop,aspect:image.naturalWidth*crop.w/(image.naturalHeight*crop.h)};
  }
  function background(node,url,crop) {
    node.style.backgroundImage=`url("${url}")`;
    node.style.backgroundSize=`${100/crop.w}% ${100/crop.h}%`;
    node.style.backgroundPosition=`${crop.w>=1?50:100*crop.x/(1-crop.w)}% ${crop.h>=1?50:100*crop.y/(1-crop.h)}%`;
  }
  function packshot(image) {
    const ratio=image.naturalWidth/image.naturalHeight;if(ratio<.85||ratio>1.2)return null;
    const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,100,100);
    let pixels;try{pixels=ctx.getImageData(0,0,100,100).data}catch{return null}
    const whiteColumn=x=>{let white=0;for(let y=5;y<95;y++){const i=(y*100+x)*4;if(pixels[i]>246&&pixels[i+1]>246&&pixels[i+2]>246)white++}return white>=88};
    let left=0,right=99;while(left<40&&whiteColumn(left))left++;while(right>60&&whiteColumn(right))right--;
    if(left<8||right>91||right-left<45)return null;
    return {x:left/100,y:0,w:(right-left+1)/100,h:1};
  }
  function element(cls) {const e=document.createElement('div');e.className=cls;return e}
  function sleeve(game,digital,compact=false) {
    const root=element('digital-sleeve'+(compact?' digital-sleeve--compact':''));root.setAttribute('aria-hidden','true');
    const backdrop=element('digital-sleeve-backdrop');background(backdrop,digital.source,digital.crop);
    const shade=element('digital-sleeve-shade');
    const logo=element('digital-sleeve-logo');background(logo,digital.source,{x:0,y:0,w:.21,h:.13});
    const edition=element('digital-sleeve-edition');edition.textContent='DIGITAL';
    const keyart=element('digital-sleeve-keyart');background(keyart,digital.source,digital.crop);keyart.style.aspectRatio=String(digital.aspect);
    const title=element('digital-sleeve-title');title.textContent=game.title.replace(/\bv?\d+(?:\.\d+)+\b/gi,'').replace(/\s+/g,' ').trim();
    title.classList.toggle('digital-sleeve-title--long',title.textContent.length>22);
    const footer=element('digital-sleeve-footer');footer.textContent='Nintendo eShop';
    root.append(backdrop,shade,logo,edition,keyart,title,footer);return root;
  }
  function face(game,a,cls) {
    const e=element('face '+cls);e.style.backgroundImage=`url("${a.front}")`;
    if(a.digital){e.style.backgroundImage='none';e.append(sleeve(game,a.digital))}
    else if(a.packshot)background(e,a.front,a.packshot);
    return e;
  }
  return {analyze,packshot,background,sleeve,face};
})();
