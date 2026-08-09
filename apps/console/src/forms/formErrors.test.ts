import assert from "node:assert/strict";
import test from "node:test";
import {focusFirstInvalidField} from "./formErrors";
test("first invalid field receives focus and is scrolled into view",()=>{let focused=false;let scrolled=false;class FakeElement{focus(){focused=true;}scrollIntoView(){scrolled=true;}}Object.defineProperty(globalThis,"HTMLElement",{value:FakeElement,configurable:true});Object.defineProperty(globalThis,"matchMedia",{value:()=>({matches:true}),configurable:true});const element=new FakeElement();const form={elements:{namedItem:(name:string)=>name==="email"?element:null}} as unknown as HTMLFormElement;focusFirstInvalidField({email:"Invalid",password:"Missing"},form);assert.equal(focused,true);assert.equal(scrolled,true);});
