// Keep this ratio aligned with the mobile storefront listing cover.
export const STOREFRONT_COVER_RATIO = 1.85;

export function storefrontCrop(width:number,height:number,zoom:number,xPercent:number,yPercent:number){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('This photo could not be opened.');
 const scale=Math.min(3,Math.max(1,Number.isFinite(zoom)?zoom:1));
 const cropWidth=Math.min(width,height*STOREFRONT_COVER_RATIO)/scale;
 const cropHeight=cropWidth/STOREFRONT_COVER_RATIO;
 const clamp=(value:number)=>Math.min(100,Math.max(0,Number.isFinite(value)?value:50));
 return{width:cropWidth,height:cropHeight,x:(width-cropWidth)*clamp(xPercent)/100,y:(height-cropHeight)*clamp(yPercent)/100};
}

export async function croppedStorefrontFile(image:HTMLImageElement,zoom:number,xPercent:number,yPercent:number){
 const crop=storefrontCrop(image.naturalWidth,image.naturalHeight,zoom,xPercent,yPercent);
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.min(1280,Math.round(crop.width)));
 canvas.height=Math.max(1,Math.round(canvas.width/STOREFRONT_COVER_RATIO));
 const context=canvas.getContext('2d');
 if(!context)throw new Error('Your browser could not prepare this photo. Please try another browser.');
 context.fillStyle='#FFFFFF';context.fillRect(0,0,canvas.width,canvas.height);
 context.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('This photo could not be prepared. Please try another photo.')),'image/jpeg',0.92));
 return new File([blob],'storefront-cover.jpg',{type:'image/jpeg'});
}
