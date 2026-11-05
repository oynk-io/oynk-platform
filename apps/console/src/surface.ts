import type { OrganizationSummary } from '@oynk/shared';

export const surface=(import.meta.env.VITE_OYNK_SURFACE??'console') as 'console'|'control';
export const consoleUrl=(import.meta.env.VITE_CONSOLE_URL??'http://localhost:5174').replace(/\/$/,'');
export const controlUrl=(import.meta.env.VITE_CONTROL_URL??'http://localhost:5176').replace(/\/$/,'');

export function supportsOrganization(organization:OrganizationSummary|null){
 return surface==='control'?organization?.type==='INTERNAL':organization?.type==='BUSINESS'||organization?.type==='SETTLEMENT_PARTNER';
}

export function homeForSurface(organization:OrganizationSummary|null){
 if(!organization)return'/organizations';
 if(organization.type==='INTERNAL')return surface==='control'?'/internal/home':`${controlUrl}/internal/home`;
 const path=organization.type==='BUSINESS'?'/business/home':'/partner/home';
 return surface==='console'?path:`${consoleUrl}${path}`;
}
