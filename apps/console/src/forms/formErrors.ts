import { ApiError } from "../api";
import { validationCopy } from "./validationCopy";

export type FieldErrorMap=Record<string,string>;
export type FormErrorState={fieldErrors:FieldErrorMap;formError:string|null;errorCode?:string|null;requestId?:string|null};
export const emptyFormErrors=():FormErrorState=>({fieldErrors:{},formError:null,errorCode:null,requestId:null});
export function clearFieldError(state:FormErrorState,name:string):FormErrorState{if(!state.fieldErrors[name])return state;const fieldErrors={...state.fieldErrors};delete fieldErrors[name];return{...state,fieldErrors};}
export function focusFirstInvalidField(errors:FieldErrorMap,form:HTMLFormElement|null):void{const first=Object.keys(errors)[0];if(!first||!form)return;const element=form.elements.namedItem(first);if(element instanceof HTMLElement){element.focus();element.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});}}
const aliases:Record<string,string>={first_name:"firstName",last_name:"lastName",legal_name:"legalName",registration_country:"registrationCountry",operating_country:"operatingCountry",accepted_terms:"acceptedTerms"};
export function normalizeFieldErrors(input:Record<string,string>|undefined):FieldErrorMap{return Object.fromEntries(Object.entries(input??{}).map(([key,value])=>[aliases[key]??key,value]));}
export function apiErrorToFormState(error:unknown):FormErrorState{if(error instanceof ApiError){const fields=normalizeFieldErrors(error.fieldErrors);if(error.code==="ACCOUNT_EXISTS")fields.email="An account already exists with this email address.";return{fieldErrors:fields,formError:error.message,errorCode:error.code,requestId:error.requestId??null};}return{fieldErrors:{},formError:validationCopy.server,errorCode:"UNKNOWN",requestId:null};}
