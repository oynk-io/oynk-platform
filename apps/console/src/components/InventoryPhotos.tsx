import { useState } from 'react';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import { api, martPhotoPreview } from '../api';

export function InventoryPhotos({value,onChange,onBusy,disabled}:{value:string[];onChange:(urls:string[])=>void;onBusy:(busy:boolean)=>void;disabled:boolean}){
 const [pending,setPending]=useState<{url:string;name:string}|null>(null),[error,setError]=useState('');
 async function add(files:File[]){
  setError('');
  if(value.length+files.length>5){setError('Add up to five photos per item.');return;}
  if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)){
   setError('Choose JPG, PNG or WebP photos up to 5 MB each.');return;
  }
  const urls=[...value];onBusy(true);
  try{
   for(const file of files){
    const preview=URL.createObjectURL(file);setPending({url:preview,name:file.name});
    try{const uploaded=await api.martUploadPhoto(file);if(!urls.includes(uploaded.url)){urls.push(uploaded.url);onChange([...urls]);}}
    finally{URL.revokeObjectURL(preview);setPending(null);}
   }
  }catch(reason){setError(reason instanceof Error?reason.message:'We could not upload this photo. Please try again.');}
  finally{onBusy(false);}
 }
 return <div className="mart-photos">
  <div className="mart-photo-heading"><span>Item photos</span><small>{value.length} / 5</small></div>
  <div className="mart-photo-grid">
   {value.map((url,index)=><div className="mart-photo" key={url}>
    <img src={martPhotoPreview(url)} alt={`Item photo ${index+1}`}/>
    <button type="button" className="mart-photo-remove" aria-label={`Remove photo ${index+1}`} disabled={disabled} onClick={()=>onChange(value.filter((_,i)=>i!==index))}><X size={14}/></button>
    {index===0?<span className="mart-photo-cover">Cover</span>:<button type="button" className="mart-photo-cover" disabled={disabled} onClick={()=>onChange([url,...value.filter((_,i)=>i!==index)])}>Make cover</button>}
   </div>)}
   {pending?<div className="mart-photo mart-photo-pending"><img src={pending.url} alt="Uploading photo"/><span><LoaderCircle size={17} className="mart-spinning"/>Uploading</span></div>:null}
   {value.length<5&&!pending?<label className={`mart-photo-add ${disabled?'disabled':''}`}><ImagePlus size={22}/><span>Add photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value='';if(files.length)void add(files);}}/></label>:null}
  </div>
  <p className="mart-hint">First photo is your cover. JPG, PNG or WebP, up to 5 MB each.</p>
  {error?<p className="mart-photo-error" role="alert">{error}</p>:null}
 </div>;
}
