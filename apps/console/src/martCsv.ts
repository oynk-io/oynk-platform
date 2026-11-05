import type { SourceInventoryInput } from './api';

export const inventoryCsvTemplate='name,price,stock_quantity,sku,description,publish_to_mart,image_urls\nExample item,1500,10,SKU-001,Describe your item,true,\n';

export function parseInventoryCsv(csv:string):SourceInventoryInput[]{
 const lines:string[][]=[];let row:string[]=[],value='',quoted=false;
 for(let i=0;i<csv.length;i++){
  const ch=csv[i];
  if(ch==='"'){if(quoted&&csv[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(ch===','&&!quoted){row.push(value);value='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&csv[i+1]==='\n')i++;row.push(value);if(row.some(cell=>cell.trim()))lines.push(row);row=[];value='';}
  else value+=ch;
 }
 row.push(value);if(row.some(cell=>cell.trim()))lines.push(row);
 if(quoted)throw new Error('The CSV has an unfinished quoted field.');
 const headers=(lines.shift()??[]).map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[^a-z]/g,''));
 if(!headers.includes('name')||!headers.includes('price'))throw new Error('CSV needs name and price columns.');
 if(new Set(headers).size!==headers.length)throw new Error('Each CSV column needs a unique heading.');
 const publishColumns=headers.filter(h=>['publishtomart','publishtostore','published','publish'].includes(h));
 if(publishColumns.length>1)throw new Error('Use one publication column: publish_to_mart.');
 if(lines.length>500)throw new Error('Upload up to 500 items at a time.');
 if(!lines.length)throw new Error('The file has no items.');
 return lines.map((values,index)=>{
  const field=(name:string)=>values[headers.indexOf(name)]?.trim()??'';
  const price=Number(field('price')),stock=Number(field('stockquantity')||field('stock')||'0');
  const kind=field('kind')||'product';
  if(!field('name')||field('name').length>160||!field('price')||!Number.isFinite(price)||price<0||price>999999999999.99||Math.abs(Math.round(price*100)-price*100)>0.0001||!Number.isSafeInteger(stock)||stock<0||stock>99999999999||!['product','service'].includes(kind))throw new Error(`Check the name, price, stock and type in row ${index+2}.`);
  const publication=publishColumns.length?field(publishColumns[0]).toLowerCase():'';
  if(publication&&!['true','false','yes','no','1','0'].includes(publication))throw new Error(`Use true or false for publish_to_mart in row ${index+2}.`);
  const imageUrls=field('imageurls').split(';').map(value=>value.trim()).filter(Boolean);
  if(imageUrls.length>5||imageUrls.some(url=>{try{return new URL(url).protocol!=='https:';}catch{return true;}}))throw new Error(`Use up to five HTTPS image URLs separated by semicolons in row ${index+2}.`);
  return {name:field('name'),description:field('description'),kind:kind as 'product'|'service',sku:field('sku'),price,stockQuantity:kind==='service'?null:stock,published:!['false','no','0'].includes(publication),imageUrls};
 });
}
