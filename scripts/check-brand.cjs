const {app,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../renderer/assets/brand');
function check(condition,message){if(!condition)throw new Error(message)}
app.whenReady().then(()=>{
  try{
    const ico=fs.readFileSync(path.join(root,'pyrocade.ico'));check(ico.readUInt16LE(0)===0&&ico.readUInt16LE(2)===1,'Invalid Windows icon header');const count=ico.readUInt16LE(4);check(count===7,'Missing icon resolutions');
    for(let i=0;i<count;i++){const entry=6+i*16,size=ico[entry]||256,length=ico.readUInt32LE(entry+8),offset=ico.readUInt32LE(entry+12);check(offset+length<=ico.length,'Truncated icon entry');const img=nativeImage.createFromBuffer(ico.subarray(offset,offset+length));check(!img.isEmpty()&&img.getSize().width===size,'ICO image cannot be decoded')}
    for(const size of [16,24,32,48,64,128,256,512,1024]){const image=nativeImage.createFromPath(path.join(root,'pyrocade-icon-'+size+'.png'));check(image.getSize().width===size&&image.getSize().height===size,'Incorrect PNG dimensions');const bitmap=image.toBitmap();check(bitmap[3]===0,'Icon corners lost transparency');check(bitmap.some((v,i)=>i%4===3&&v>0),'Icon is empty')}
    const mark=nativeImage.createFromPath(path.join(root,'pyrocade-mark.png')).toBitmap();check(mark[(304*512+256)*4+3]===0,'Play-button cutout is not transparent');
    console.log('Passed: 9 PNG sizes, transparent corners, transparent play cutout and 7 decodable Windows ICO entries.');app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
