import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Crop, ImagePlus, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { api, martPhotoPreview } from '../api';
import { croppedStorefrontFile, storefrontCrop, STOREFRONT_COVER_RATIO } from './storefrontCrop';
import './StorefrontPhoto.css';

type Photo = {url:string;image:HTMLImageElement};
const cropFrameInset = 8;
const cropFrameSize = 100 - cropFrameInset * 2;

export function StorefrontPhoto({value,onChange,onBusy,disabled}:{value:string|null;onChange:(url:string|null)=>void;onBusy:(busy:boolean)=>void;disabled:boolean}){
 const [photo,setPhoto]=useState<Photo|null>(null),[uploading,setUploading]=useState(false),[error,setError]=useState('');
 const [zoom,setZoom]=useState(1),[x,setX]=useState(50),[y,setY]=useState(50);
 const dialog=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;offsetX:number;offsetY:number}|null>(null);
 useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo.url);},[photo]);
 useEffect(()=>{
  if(!photo)return;
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.focus();
  return()=>previous?.focus();
 },[photo]);
 async function choose(file:File){
  setError('');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Choose a JPG, PNG or WebP photo up to 5 MB.');return;}
  const url=URL.createObjectURL(file),image=new Image();image.src=url;onBusy(true);
  try{
   await image.decode();
   if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('Choose a photo smaller than 40 megapixels.');
   setZoom(1);setX(50);setY(50);setPhoto({url,image});
  }catch(reason){URL.revokeObjectURL(url);onBusy(false);setError(reason instanceof Error?reason.message:'This photo could not be opened. Try another photo.');}
 }
 function cancel(){if(uploading)return;setPhoto(null);onBusy(false);setError('');}
 async function save(){
  if(!photo||uploading)return;
  setUploading(true);setError('');
  try{const cropped=await croppedStorefrontFile(photo.image,zoom,x,y);const saved=await api.martUploadPhoto(cropped);onChange(saved.url);setPhoto(null);onBusy(false);}
  catch(reason){setError(reason instanceof Error?reason.message:'We could not upload this photo. Please try again.');}
  finally{setUploading(false);}
 }
 const crop=photo?storefrontCrop(photo.image.naturalWidth,photo.image.naturalHeight,zoom,x,y):null;
 function move(event:PointerEvent<HTMLDivElement>){
  if(!drag.current||!photo||!crop)return;
  const box=event.currentTarget.getBoundingClientRect();
  const sourceX=(event.clientX-drag.current.x)*crop.width/(box.width*cropFrameSize/100);
  const sourceY=(event.clientY-drag.current.y)*crop.height/(box.height*cropFrameSize/100);
  const spaceX=photo.image.naturalWidth-crop.width,spaceY=photo.image.naturalHeight-crop.height;
  if(spaceX>0)setX(Math.min(100,Math.max(0,drag.current.offsetX-sourceX/spaceX*100)));
  if(spaceY>0)setY(Math.min(100,Math.max(0,drag.current.offsetY-sourceY/spaceY*100)));
 }
 return <div className="mart-store-photo-field">
  <div className="mart-photo-heading"><span>Storefront photo</span><small>Optional</small></div>
  <div className="mart-store-photo">
   {value?<img src={martPhotoPreview(value)} alt="Storefront cover"/>:<div className="mart-store-photo-empty"><ImagePlus size={25}/><span>Add a photo of your store or brand</span></div>}
   {value?<button type="button" className="mart-photo-remove" aria-label="Remove storefront photo" disabled={disabled} onClick={()=>onChange(null)}><X size={16}/></button>:null}
  </div>
  <label className={`mart-store-photo-upload ${disabled?'disabled':''}`}><ImagePlus size={16}/>{value?'Change photo':'Choose photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void choose(file);}}/></label>
  <p className="mart-hint">Position your photo before saving. Without a photo, shoppers see your store’s initials.</p>
  {error&&!photo?<p className="mart-photo-error" role="alert">{error}</p>:null}
  {photo&&crop?createPortal(<div className="mart-crop-backdrop" onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget)cancel();}}>
   <div ref={dialog} tabIndex={-1} className="mart-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="mart-crop-title" onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();cancel();}
    if(event.key==='Tab'){
     const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');
     if(!nodes?.length)return;
     const first=nodes[0],last=nodes[nodes.length-1];
     if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
     else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
   }}>
    <header><div><span className="mart-crop-eyebrow"><Crop size={14}/> STOREFRONT PHOTO</span><h2 id="mart-crop-title">Make it fit your store</h2><p>This is how your cover will look in the app.</p></div><button type="button" className="mart-icon-button" aria-label="Cancel photo crop" disabled={uploading} onClick={cancel}><X size={20}/></button></header>
    <div className="mart-crop-window" style={{aspectRatio:String(STOREFRONT_COVER_RATIO)}} onPointerDown={event=>{if(uploading)return;drag.current={x:event.clientX,y:event.clientY,offsetX:x,offsetY:y};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
     <img draggable={false} src={photo.url} alt="Storefront crop preview" style={{width:`${photo.image.naturalWidth/crop.width*cropFrameSize}%`,height:`${photo.image.naturalHeight/crop.height*cropFrameSize}%`,left:`${cropFrameInset-crop.x/crop.width*cropFrameSize}%`,top:`${cropFrameInset-crop.y/crop.height*cropFrameSize}%`}}/>
     <div className="mart-crop-guides" style={{inset:`${cropFrameInset}%`}} aria-hidden="true"><i/><i/><i/><i/><b/><b/><b/><b/></div>
    </div>
    <p className="mart-crop-tip">Move the photo inside the frame. Only the outlined area is saved.</p>
    <div className="mart-crop-controls"><label>Zoom<input aria-label="Photo zoom" type="range" min="1" max="3" step="0.01" value={zoom} disabled={uploading} onChange={event=>setZoom(Number(event.target.value))}/></label><label>Left / right<input aria-label="Horizontal crop position" type="range" min="0" max="100" value={x} disabled={uploading} onChange={event=>setX(Number(event.target.value))}/></label><label>Up / down<input aria-label="Vertical crop position" type="range" min="0" max="100" value={y} disabled={uploading} onChange={event=>setY(Number(event.target.value))}/></label></div>
    {error?<p className="mart-photo-error" role="alert">{error}</p>:null}
    <footer><button type="button" className="mart-crop-reset" disabled={uploading} onClick={()=>{setZoom(1);setX(50);setY(50);}}><RotateCcw size={15}/> Reset</button><button type="button" className="primary" disabled={uploading} onClick={()=>void save()}>{uploading?<><LoaderCircle size={16} className="mart-spinning"/> Uploading…</>:<>Use this photo <Crop size={16}/></>}</button></footer>
   </div>
  </div>,document.body):null}
 </div>;
}
