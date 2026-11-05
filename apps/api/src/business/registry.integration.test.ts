import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import test from 'node:test';

test('Control business registry', { skip: !process.env.BUSINESS_TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.BUSINESS_TEST_DATABASE_URL!);
  if (url.hostname !== '127.0.0.1' || url.port !== '5433' || url.pathname !== '/oynk_dashboard') {
    throw new Error('Use the loopback development database for the isolated-schema test.');
  }
  const schema = `business_test_${randomUUID().replaceAll('-', '')}`;
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { pool } = await import('../db/pool.js');
  const { businessControlRouter, businessRouter } = await import('./routes.js');
  const { secureHash } = await import('../auth/security.js');
  const { config } = await import('../config.js');
  const { default: express } = await import('express');
  let server: Server | undefined;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    for (const name of [
      '002_identity_auth.sql', '005_business_compliance_profiles.sql', '007_consumer_funding.sql',
      '009_consumer_phone_auth.sql', '010_consumer_phone_links.sql', '020_consumer_handles.sql',
      '022_consumer_quick_pay.sql', '025_quick_pay_funding.sql', '023_consumer_offline_allowance.sql', '024_offline_pay_policy.sql',
      '031_offline_pay_terminal_protocol.sql', '032_business_activation_audit.sql', '033_business_financial_provisioning.sql',
    ]) await pool.query(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'));

    const fresh = randomUUID(), active = randomUUID(), approved = randomUUID(), submitted = randomUUID();
    const internal = randomUUID(), partner = randomUUID();
    for (const [id, type, status, mode, name] of [
      [fresh, 'BUSINESS', 'COMPLIANCE_INCOMPLETE', 'SANDBOX', 'Fresh Registration'],
      [active, 'BUSINESS', 'ACTIVE', 'TEST', 'Verified Store'],
      [approved, 'BUSINESS', 'APPROVED', 'SANDBOX', '100%_ Supply'],
      [submitted, 'BUSINESS', 'COMPLIANCE_SUBMITTED', 'SANDBOX', 'Submitted Store'],
      [internal, 'INTERNAL', 'ACTIVE', 'TEST', 'Operations'],
      [partner, 'SETTLEMENT_PARTNER', 'ACTIVE', 'TEST', 'Partner'],
    ]) await pool.query(`INSERT INTO organizations(id,type,status,platform_mode,legal_name) VALUES($1,$2,$3,$4,$5)`, [id, type, status, mode, name]);
    await pool.query(`INSERT INTO business_compliance_profiles(organization_id,organization_type,registration_number,industry,status) VALUES($1,'RC','RC-123','Retail','SUBMITTED')`, [submitted]);
    await pool.query(`INSERT INTO business_financial_accounts(organization_id,provisioning_state,vfd_account_number,vfd_account_name,smart_account_address,smart_account_network,crypto_usdc_ready,provision_idempotency_key) VALUES($1,'READY','1000000001','Verified Store',$2,'TESTNET',TRUE,$3)`, [active, `C${'A'.repeat(55)}`, randomUUID()]);
    await pool.query(`INSERT INTO business_compliance_profiles(organization_id,organization_type,registration_number,incorporation_date,address_line_1,city,region,address_country,status) VALUES($1,'RC','RC-456','2005-01-05','12 Newton Street','Ikeja','Lagos','NG','SUBMITTED')`, [active]);
    await pool.query(`INSERT INTO business_application_events(organization_id,event_type,to_status,note,metadata) VALUES($1,'APPLICATION_APPROVED','APPROVED','Reviewed documents',$2)`, [active, { privateField: 'excluded' }]);
    await pool.query(`INSERT INTO business_account_provisioning_events(organization_id,event_type,state,metadata) VALUES($1,'ACCOUNTS_READY','READY',$2)`, [active, { privateField: 'excluded' }]);

    await pool.query(await readFile(new URL('../db/migrations/051_business_registry_management.sql', import.meta.url), 'utf8'));
    await pool.query(`UPDATE organizations SET activated_at=NOW() WHERE id=$1`, [active]);
    const credentials = new Map<string, { csrf: string; user: string }>();
    async function session(organizationId: string, role: string) {
      const user = randomUUID(), token = randomUUID(), csrf = randomUUID();
      await pool.query(`INSERT INTO users(id,email,password_hash,first_name,last_name,status) VALUES($1,$2,'test','Registry','Tester','ACTIVE')`, [user, `${user}@example.invalid`]);
      await pool.query(`INSERT INTO organization_memberships(id,user_id,organization_id,role_name) VALUES($1,$2,$3,$4)`, [randomUUID(), user, organizationId, role]);
      await pool.query(`INSERT INTO sessions(id,user_id,active_organization_id,token_hash,csrf_token_hash,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '1 hour')`, [randomUUID(), user, organizationId, secureHash(token), secureHash(csrf)]);
      credentials.set(token, { csrf, user });
      return token;
    }
    const owner = await session(internal, 'PLATFORM_OWNER');
    const auditor = await session(internal, 'INTERNAL_AUDITOR');
    const technical = await session(internal, 'TECHNICAL_ADMIN');
    const merchant = await session(active, 'BUSINESS_OWNER');
    const otherMerchant = await session(fresh, 'BUSINESS_OWNER');
    const reviewer = await session(internal, 'COMPLIANCE_REVIEWER');
    const app = express();
    app.use(express.json());
    app.use('/api/control/businesses', businessControlRouter);
    app.use('/api/business', businessRouter);
    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const endpoint = `${origin}/api/control/businesses`;
    async function request(query = '', token: string | null = owner) {
      const response = await fetch(`${endpoint}${query}`, { headers: token ? { cookie: `${config.AUTH_SESSION_COOKIE_NAME}=${token}` } : {} });
      return { status: response.status, body: await response.json() };
    }

    async function mutate(path: string, body: unknown, token: string | null = owner, csrf = true, scope = '/api/control/businesses') {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) { headers.cookie = `${config.AUTH_SESSION_COOKIE_NAME}=${token}`; if (csrf) headers['x-csrf-token'] = credentials.get(token)!.csrf; }
      const response = await fetch(`${origin}${scope}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }

    await t.test('all registrations appear, including businesses without account or compliance records', async () => {
      const { status, body } = await request();
      assert.equal(status, 200);
      assert.equal(body.total, 4);
      assert.deepEqual(body.summary, { total: 4, active: 1, awaitingReview: 1, needsAccountSetup: 1 });
      assert.deepEqual(new Set(body.businesses.map((business: { id: string }) => business.id)), new Set([fresh, active, approved, submitted]));
      assert.equal(body.nextOffset, null);
      const freshRow = body.businesses.find((business: { id: string }) => business.id === fresh);
      assert.equal(freshRow.profileStatus, null);
      assert.equal(freshRow.vfdAccountNumber, null);
      assert.equal(freshRow.cryptoUsdcReady, false);
      const activeRow = body.businesses.find((business: { id: string }) => business.id === active);
      assert.equal(activeRow.vfdAccountNumber, '1000000001');
      assert.equal(activeRow.cryptoUsdcReady, true);
      assert.equal('password_hash' in activeRow, false);
    });
    await t.test('filters, literal partial search, pagination and empty results', async () => {
      for (const [query, expected] of [
        ['?mode=TEST', active], ['?status=APPROVED', approved], ['?q=gistra', fresh],
        ['?q=%25', approved], ['?q=_', approved], ['?q=RC-123', submitted], ['?q=1000000001', active],
      ]) {
        const { body } = await request(query);
        assert.equal(body.total, 1, query);
        assert.equal(body.businesses[0].id, expected, query);
        assert.equal(body.summary.total, 4);
      }
      const first = (await request('?limit=2')).body;
      const second = (await request(`?limit=2&offset=${first.nextOffset}`)).body;
      assert.equal(first.nextOffset, 2);
      assert.equal(second.nextOffset, null);
      assert.equal(new Set([...first.businesses, ...second.businesses].map((business: { id: string }) => business.id)).size, 4);
      const empty = (await request('?q=notfound')).body;
      assert.equal(empty.total, 0);
      assert.deepEqual(empty.businesses, []);
      assert.equal(empty.nextOffset, null);
      for (const query of ['?limit=101', '?limit=0', '?offset=-1', '?status=invalid', '?mode=invalid', `?q=${'x'.repeat(121)}`]) {
        assert.equal((await request(query)).status, 400, query);
      }
    });
    await t.test('dedicated business details expose profile, accounts, owner contacts and recent history', async () => {
      const { status, body } = await request(`/profiles/${active}`);
      assert.equal(status, 200);
      assert.equal(body.business.id, active);
      assert.equal(body.business.businessType, 'RC');
      assert.equal(body.business.registrationNumber, 'RC-456');
      assert.equal(body.business.incorporationDate, '2005-01-05');
      assert.equal(body.business.addressLine1, '12 Newton Street');
      assert.equal(body.business.vfdAccountNumber, '1000000001');
      assert.equal(body.owners.length, 1);
      assert.equal(body.owners[0].name, 'Registry Tester');
      assert.deepEqual(new Set(body.events.map((event: { eventType: string }) => event.eventType)), new Set(['APPLICATION_APPROVED', 'ACCOUNTS_READY']));
      assert.ok(body.events.some((event: { note: string }) => event.note === 'Reviewed documents'));
      assert.equal('password_hash' in body.owners[0], false);
      assert.equal('metadata' in body.events[0], false);
      assert.equal('actor_user_id' in body.events[0], false);
      assert.equal('vfd_identity_fingerprint' in body.business, false);
      const incomplete = (await request(`/profiles/${fresh}`)).body;
      assert.equal(incomplete.business.registrationNumber, null);
      assert.equal(incomplete.business.vfdAccountNumber, null);
      assert.equal(incomplete.owners.length, 1);
      assert.deepEqual(incomplete.events, []);
      for (const id of [randomUUID(), internal, partner]) assert.equal((await request(`/profiles/${id}`)).status, 404);
      assert.equal((await request('/profiles/invalid!')).status, 400);
      // The detail route must not intercept existing named endpoints.
      assert.equal((await request('/applications')).status, 200);
      assert.equal((await request(`/profiles/${active}`, null)).status, 401);
      assert.equal((await request(`/profiles/${active}`, merchant)).status, 403);
      assert.equal((await request(`/profiles/${active}`, technical)).status, 403);
      assert.equal((await request(`/profiles/${active}`, auditor)).status, 200);
    });
    await t.test('stable readable slugs are backfilled, collision-safe and resolve the same business', async () => {
      const original = (await request(`/profiles/${active}`)).body.business;
      assert.equal(original.slug, 'verified-store');
      assert.equal((await request('/profiles/verified-store')).body.business.id, active);
      assert.equal((await request('/profiles/not-a-business')).status, 404);
      await pool.query(`UPDATE organizations SET legal_name='Updated Store Name',business_slug='try-to-change-it' WHERE id=$1`, [active]);
      assert.equal((await request('/profiles/verified-store')).body.business.legalName, 'Updated Store Name');
      assert.equal((await request(`/profiles/${active}`)).body.business.slug, original.slug);
      const ids = [randomUUID(), randomUUID()];
      await Promise.all(ids.map(id => pool.query(`INSERT INTO organizations(id,type,status,legal_name) VALUES($1,'BUSINESS','DRAFT','Verified Store')`, [id])));
      for (const id of ids) {
        const business = (await request(`/profiles/${id}`)).body.business;
        assert.equal(business.slug, `verified-store-${id.replaceAll('-', '').slice(0, 10)}`);
        assert.equal((await request(`/profiles/${business.slug}`)).body.business.id, id);
      }
      const simultaneous = [randomUUID(), randomUUID(), randomUUID()];
      await Promise.all(simultaneous.map(id => pool.query(`INSERT INTO organizations(id,type,status,legal_name) VALUES($1,'BUSINESS','DRAFT','Concurrent New Business')`, [id])));
      const slugs = (await pool.query(`SELECT business_slug FROM organizations WHERE id=ANY($1::uuid[])`, [simultaneous])).rows.map(row => row.business_slug);
      assert.equal(new Set(slugs).size, 3);
      assert.equal(slugs.filter(slug => slug === 'concurrent-new-business').length, 1);
      const fallback = randomUUID();
      await pool.query(`INSERT INTO organizations(id,type,status,legal_name) VALUES($1,'BUSINESS','DRAFT','!!!')`, [fallback]);
      assert.equal((await request(`/profiles/${fallback}`)).body.business.slug, 'business');
      assert.equal((await pool.query('SELECT business_slug FROM organizations WHERE id=$1', [internal])).rows[0].business_slug, null);
    });
    await t.test('activation controls enforce role, CSRF, state and financial readiness', async () => {
      for (const token of [merchant, auditor, reviewer, technical]) assert.equal((await mutate(`/${active}/deactivate`, { reason: 'Requested pause' }, token)).status, 403);
      assert.equal((await mutate(`/${active}/deactivate`, { reason: 'Requested pause' }, null)).status, 401);
      assert.equal((await mutate(`/${active}/deactivate`, { reason: 'Requested pause' }, owner, false)).body.code, 'CSRF_INVALID');
      assert.equal((await mutate(`/${active}/deactivate`, { reason: 'x' })).status, 400);
      assert.equal((await mutate('/invalid/deactivate', { reason: 'Requested pause' })).status, 400);
      assert.equal((await mutate(`/${randomUUID()}/deactivate`, { reason: 'Requested pause' })).status, 404);
      assert.equal((await mutate(`/${internal}/deactivate`, { reason: 'Requested pause' })).status, 404);
      assert.equal((await mutate(`/${fresh}/deactivate`, { reason: 'Requested pause' })).body.code, 'INVALID_STATE');
      assert.equal((await mutate(`/applications/${approved}/activate`, { note: 'Ready to activate' })).body.code, 'PROVISIONING_INCOMPLETE');
      await pool.query(`UPDATE organizations SET activated_at=NULL WHERE id=$1`, [active]);
      const changed = await mutate(`/${active}/deactivate`, { reason: 'Check business documentation' });
      assert.deepEqual(changed, { status: 200, body: { id: active, status: 'SUSPENDED' } });
      assert.equal((await mutate(`/${active}/deactivate`, { reason: 'Repeated pause' })).status, 409);
      assert.equal((await request('/profiles/verified-store')).body.business.status, 'SUSPENDED');
      assert.ok((await request('/profiles/verified-store')).body.business.activatedAt);
      await pool.query(`UPDATE business_financial_accounts SET crypto_usdc_ready=FALSE WHERE organization_id=$1`, [active]);
      assert.equal((await mutate(`/${active}/reactivate`, { reason: 'Review complete' })).body.code, 'PROVISIONING_INCOMPLETE');
      await pool.query(`UPDATE business_financial_accounts SET crypto_usdc_ready=TRUE WHERE organization_id=$1`, [active]);
      assert.equal((await mutate(`/${active}/reactivate`, { reason: 'Review complete' })).body.status, 'ACTIVE');
      assert.equal((await mutate(`/${active}/reactivate`, { reason: 'Repeated restore' })).status, 409);
      const history = (await request('/profiles/verified-store')).body.events;
      assert.equal(history.filter((event: { eventType: string }) => event.eventType === 'BUSINESS_DEACTIVATED').length, 1);
      assert.equal(history.filter((event: { eventType: string }) => event.eventType === 'BUSINESS_REACTIVATED').length, 1);
      const audits = await pool.query(`SELECT action,metadata FROM audit_logs WHERE organization_id=$1 AND action IN ('BUSINESS_DEACTIVATED','BUSINESS_REACTIVATED') ORDER BY created_at`, [active]);
      assert.equal(audits.rowCount, 2);
      assert.equal(audits.rows[0].metadata.note, 'Check business documentation');
      assert.equal(audits.rows[1].metadata.previousState, 'SUSPENDED');
      await pool.query(`INSERT INTO business_financial_accounts(organization_id,provisioning_state,vfd_account_number,smart_account_address,crypto_usdc_ready,provision_idempotency_key) VALUES($1,'READY','1000000002',$2,TRUE,$3)`, [approved, `C${'B'.repeat(55)}`, randomUUID()]);
      assert.equal((await mutate(`/applications/${approved}/activate`, { note: 'Accounts checked by operator' })).body.status, 'ACTIVE');
      const activation = await pool.query(`SELECT note FROM business_application_events WHERE organization_id=$1 AND event_type='BUSINESS_ACTIVATED'`, [approved]);
      assert.equal(activation.rows[0].note, 'Accounts checked by operator');
    });
    await t.test('application review decisions are atomic and duplicate decisions do not duplicate history', async () => {
      await pool.query(`UPDATE organizations SET status='COMPLIANCE_SUBMITTED' WHERE id=$1`, [fresh]);
      assert.equal((await mutate(`/applications/${fresh}/approve`, { note: 'Verified documents' }, merchant)).status, 403);
      assert.equal((await mutate('/applications/invalid/approve', { note: 'Verified' })).status, 400);
      assert.equal((await mutate(`/applications/${fresh}/approve`, { note: 'Verified documents' })).body.status, 'APPROVED');
      assert.equal((await mutate(`/applications/${fresh}/approve`, { note: 'Retry' })).body.provisioningState, 'PENDING');
      assert.equal((await pool.query(`SELECT COUNT(*)::int count FROM audit_logs WHERE organization_id=$1 AND action='APPLICATION_APPROVED'`, [fresh])).rows[0].count, 1);
      assert.equal((await mutate(`/applications/${submitted}/reject`, { note: 'x' })).status, 400);
      assert.equal((await mutate(`/applications/${submitted}/reject`, { note: 'Documents cannot be verified' })).body.status, 'REJECTED');
      assert.equal((await mutate(`/applications/${submitted}/reject`, { note: 'Retry rejection' })).body.status, 'REJECTED');
      assert.equal((await mutate(`/applications/${active}/reject`, { note: 'Cannot reject an activated account' })).status, 409);
      assert.equal((await pool.query(`SELECT COUNT(*)::int count FROM audit_logs WHERE organization_id=$1 AND action='APPLICATION_REJECTED'`, [submitted])).rows[0].count, 1);
    });
    await t.test('a pending terminal payment cannot be authorized after business deactivation', async () => {
      const { authorizeTerminalPayment, TerminalError } = await import('../terminal/service.js');
      const consumer = randomUUID(), terminalId = randomUUID(), paymentId = randomUUID();
      await pool.query(`INSERT INTO consumer_accounts(id,subject,client_id,network,wallet,profile) VALUES($1,$2,'test','TESTNET',$3,'{}')`, [consumer, `test-${consumer}`, `C${'C'.repeat(55)}`]);
      await pool.query(`INSERT INTO consumer_quick_pay_accounts(account_id,offline_pin_hash) VALUES($1,'not-used')`, [consumer]);
      await pool.query(`INSERT INTO consumer_quick_pay_deposit_accounts(account_id,provider,bank_name,account_number,account_name) VALUES($1,'VFD','VFD','1000000003','Customer')`, [consumer]);
      await pool.query(`INSERT INTO merchant_terminals(id,organization_id,label,terminal_type,status) VALUES($1,$2,'Counter','SOFTWARE','ACTIVE')`, [terminalId, active]);
      await pool.query(`INSERT INTO terminal_payments(id,terminal_id,business_organization_id,consumer_account_id,idempotency_key,amount_kobo,state,expires_at) VALUES($1,$2,$3,$4,$5,10000,'AWAITING_PIN',NOW()+INTERVAL '2 minutes')`, [paymentId, terminalId, active, consumer, randomUUID()]);
      await mutate(`/${active}/deactivate`, { reason: 'Payment access under review' });
      const terminal = { id: terminalId, organization_id: active, status: 'ACTIVE', label: 'Counter', terminal_type: 'SOFTWARE' as const, secret_hash: null };
      await assert.rejects(authorizeTerminalPayment(terminal, paymentId, '123456'), (error: unknown) => error instanceof TerminalError && error.code === 'BUSINESS_INACTIVE');
      assert.equal((await pool.query('SELECT state FROM terminal_payments WHERE id=$1', [paymentId])).rows[0].state, 'AWAITING_PIN');
      assert.equal((await pool.query('SELECT COUNT(*)::int count FROM terminal_payment_events WHERE payment_id=$1', [paymentId])).rows[0].count, 0);
      await mutate(`/${active}/reactivate`, { reason: 'Payment access restored' });
    });
    await t.test('information requests and responses are scoped, idempotent and auditable without suspending a business', async () => {
      const requestId = randomUUID(), note = 'Please provide the current business contact address.';
      for (const token of [merchant, auditor, technical]) assert.equal((await mutate(`/${active}/information-requests`, { requestId, note }, token)).status, 403);
      assert.equal((await mutate(`/${active}/information-requests`, { requestId, note }, reviewer, false)).body.code, 'CSRF_INVALID');
      assert.equal((await mutate(`/${active}/information-requests`, { requestId, note: '' }, reviewer)).status, 400);
      assert.equal((await mutate(`/${randomUUID()}/information-requests`, { requestId, note }, reviewer)).status, 404);
      const attempts = await Promise.all([mutate(`/${active}/information-requests`, { requestId, note }, reviewer), mutate(`/${active}/information-requests`, { requestId, note }, reviewer)]);
      assert.deepEqual(attempts.map(result => result.status).sort(), [200, 201]);
      assert.equal((await mutate(`/${active}/information-requests`, { requestId, note: 'Different question' }, reviewer)).body.code, 'IDEMPOTENCY_CONFLICT');
      assert.equal((await request('/profiles/verified-store')).body.business.status, 'ACTIVE');
      const ownerRequests = await fetch(`http://127.0.0.1:${address.port}/api/business/information-requests`, { headers: { cookie: `${config.AUTH_SESSION_COOKIE_NAME}=${merchant}` } });
      assert.equal((await ownerRequests.json()).requests[0].id, requestId);
      const response = 'Our business address is 12 Newton Street, Ikeja.';
      assert.equal((await mutate(`/information-requests/${requestId}/respond`, { response }, otherMerchant, true, '/api/business')).status, 404);
      assert.equal((await mutate(`/information-requests/${requestId}/respond`, { response }, owner, true, '/api/business')).status, 403);
      assert.equal((await mutate(`/information-requests/${requestId}/respond`, { response }, merchant, false, '/api/business')).body.code, 'CSRF_INVALID');
      assert.equal((await mutate(`/information-requests/${requestId}/respond`, { response }, merchant, true, '/api/business')).body.state, 'RESPONDED');
      assert.equal((await mutate(`/information-requests/${requestId}/respond`, { response }, merchant, true, '/api/business')).status, 200);
      assert.equal((await mutate(`/information-requests/${requestId}/respond`, { response: 'Changed response' }, merchant, true, '/api/business')).status, 409);
      assert.equal((await mutate(`/${fresh}/information-requests/${requestId}/resolve`, { note: 'Reviewed' }, reviewer)).status, 404);
      assert.equal((await mutate(`/${active}/information-requests/${requestId}/resolve`, { note: 'Reviewed' }, merchant)).status, 403);
      assert.equal((await mutate(`/${active}/information-requests/${requestId}/resolve`, { note: 'Reviewed' }, reviewer)).body.state, 'RESOLVED');
      assert.equal((await mutate(`/${active}/information-requests/${requestId}/resolve`, { note: 'Reviewed' }, reviewer)).status, 200);
      assert.equal((await mutate(`/information-requests/${requestId}/respond`, { response }, merchant, true, '/api/business')).status, 409);
      const detail = (await request('/profiles/verified-store')).body;
      assert.equal(detail.informationRequests[0].response, response);
      assert.equal(detail.informationRequests[0].resolutionNote, 'Reviewed');
      assert.equal(detail.business.status, 'ACTIVE');
      const audits = await pool.query(`SELECT action FROM audit_logs WHERE organization_id=$1 AND metadata->>'requestId'=$2 ORDER BY created_at`, [active, requestId]);
      assert.deepEqual(audits.rows.map(row => row.action), ['INFORMATION_REQUESTED', 'INFORMATION_RESPONSE_SUBMITTED', 'INFORMATION_REQUEST_RESOLVED']);
      const closed = randomUUID();
      await pool.query(`INSERT INTO organizations(id,type,status,legal_name) VALUES($1,'BUSINESS','CLOSED','Closed Store')`, [closed]);
      assert.equal((await mutate(`/${closed}/information-requests`, { requestId: randomUUID(), note }, reviewer)).body.code, 'INVALID_STATE');
    });
    await t.test('only internal users with compliance read permission may access the registry', async () => {
      assert.equal((await request('', null)).status, 401);
      assert.equal((await request('', merchant)).status, 403);
      assert.equal((await request('', technical)).status, 403);
      assert.equal((await request('', auditor)).status, 200);
      await pool.query(`UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1`, [secureHash(auditor)]);
      assert.equal((await request('', auditor)).status, 401);
      await pool.query(`UPDATE sessions SET expires_at=NOW()-INTERVAL '1 minute' WHERE token_hash=$1`, [secureHash(owner)]);
      assert.equal((await request()).status, 401);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
