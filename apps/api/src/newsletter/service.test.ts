import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createNewsletterService, signupSchema, welcomeEmail } from './service.js';

test('signup normalizes email and requires explicit consent',()=>{
 assert.equal(signupSchema.parse({email:' PERSON@Example.com ',consent:true}).email,'person@example.com');
 assert.equal(signupSchema.safeParse({email:'person@example.com',consent:false}).success,false);
 assert.equal(signupSchema.safeParse({email:'bad\r\nBcc: other@example.com',consent:true}).success,false);
});
test('welcome includes unsubscribe in both email formats',()=>{
 const email=welcomeEmail('https://example.com/api/newsletter/unsubscribe?token=abc');
 assert.match(email.text,/unsubscribe\?token=abc/);assert.match(email.html,/unsubscribe\?token=abc/);
});
test('database deduplication, retries, worker leasing and unsubscribe', {skip:!process.env.NEWSLETTER_TEST_DATABASE_URL}, async()=>{
 const schema='newsletter_test_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:process.env.NEWSLETTER_TEST_DATABASE_URL});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const db=new pg.Pool({connectionString:process.env.NEWSLETTER_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 try {
  await db.query(await readFile(new URL('../db/migrations/008_newsletter.sql',import.meta.url),'utf8'));
  const service=createNewsletterService(db);
  await Promise.all(Array.from({length:5},()=>service.subscribe('test@example.invalid')));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM newsletter_subscribers')).rows[0].n,1);
  await service.deliver(async()=>{throw Error('smtp offline');},'https://example.invalid',false);
  assert.equal((await db.query('SELECT delivery_status FROM newsletter_subscribers')).rows[0].delivery_status,'pending');
  await db.query("UPDATE newsletter_subscribers SET next_attempt_at=NOW()");
  let sent=0;
  const sender=async()=>{sent++;await new Promise(r=>setTimeout(r,30));};
  await Promise.all([service.deliver(sender,'https://example.invalid',false),service.deliver(sender,'https://example.invalid',false)]);
  assert.equal(sent,1);
  await service.subscribe('test@example.invalid');await service.deliver(sender,'https://example.invalid',false);assert.equal(sent,1);
  const token=(await db.query('SELECT unsubscribe_token FROM newsletter_subscribers')).rows[0].unsubscribe_token;
  await service.unsubscribe(token);
  await service.unsubscribe(token);
  await db.query("UPDATE newsletter_subscribers SET delivery_status='pending',next_attempt_at=NOW()");
  await service.deliver(sender,'https://example.invalid',false);assert.equal(sent,1);
  await db.query("UPDATE newsletter_subscribers SET subscribed_at=NOW()-INTERVAL '2 days'");
  await service.subscribe('test@example.invalid');
  await service.deliver(sender,'https://example.invalid',true);
  const row=(await db.query('SELECT * FROM newsletter_subscribers')).rows[0];
  assert.equal(row.unsubscribed_at,null);assert.equal(row.delivery_status,'previewed');assert.equal(row.confirmation_sent_at,null);
  for(let i=0;i<10;i++)assert.equal(await service.allowRequest('local-test'),true);
  assert.equal(await service.allowRequest('local-test'),false);
 } finally {await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
