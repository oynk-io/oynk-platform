import { z } from 'zod';

export const inventoryItemSchema=z.object({
 name:z.string().trim().min(1).max(160),description:z.string().max(2000).default(''),
 kind:z.enum(['product','service']).default('product'),sku:z.string().max(120).default(''),
 price:z.number().finite().min(0).max(999999999999.99).refine(value=>Math.abs(Math.round(value*100)-value*100)<0.0001,'Use at most two decimal places.'),
 stockQuantity:z.number().int().min(0).max(99999999999).nullable(),
 published:z.boolean().default(true),
 imageUrls:z.array(z.url().max(2048).refine(url=>url.startsWith('https://'))).max(5).default([]),
}).strict();
