import { pool } from '../db/pool.js';

export type BusinessRegistryFilters = {
  q?: string;
  status?: string;
  mode?: string;
  limit: number;
  offset: number;
};

const businessFields = `o.id, o.business_slug AS slug, o.legal_name AS "legalName", o.trading_name AS "tradingName",
  o.status, o.platform_mode AS "platformMode", o.registration_country AS "registrationCountry",
  o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.activated_at AS "activatedAt",
  p.industry, p.registration_number AS "registrationNumber", p.status AS "profileStatus",
  f.provisioning_state AS "provisioningState", f.vfd_account_number AS "vfdAccountNumber",
  f.vfd_account_name AS "vfdAccountName", f.smart_account_address AS "smartAccountAddress",
  f.smart_account_network AS "smartAccountNetwork", COALESCE(f.crypto_usdc_ready, FALSE) AS "cryptoUsdcReady"`;

export async function listRegisteredBusinesses(filters: BusinessRegistryFilters) {
  // Treat wildcard characters as literal search input.
  const search = filters.q ? `%${filters.q.replace(/[!%_]/g, '!$&')}%` : null;
  const result = await pool.query<{
    businesses: Array<Record<string, unknown>>;
    total: number;
    summary: { total: number; active: number; awaitingReview: number; needsAccountSetup: number };
  }>(`
    WITH registry AS (
      SELECT ${businessFields}
      FROM organizations o
      LEFT JOIN business_compliance_profiles p ON p.organization_id = o.id
      LEFT JOIN business_financial_accounts f ON f.organization_id = o.id
      WHERE o.type = 'BUSINESS'
    ), filtered AS (
      SELECT * FROM registry
      WHERE ($1::text IS NULL OR "legalName" ILIKE $1 ESCAPE '!'
        OR "tradingName" ILIKE $1 ESCAPE '!' OR "registrationNumber" ILIKE $1 ESCAPE '!'
        OR "vfdAccountNumber" ILIKE $1 ESCAPE '!' OR id::text ILIKE $1 ESCAPE '!')
        AND ($2::text IS NULL OR status = $2)
        AND ($3::text IS NULL OR "platformMode" = $3)
    ), page AS (
      SELECT * FROM filtered ORDER BY "createdAt" DESC, id DESC LIMIT $4 OFFSET $5
    )
    SELECT
      (SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY "createdAt" DESC, id DESC), '[]'::jsonb) FROM page) AS businesses,
      (SELECT COUNT(*)::int FROM filtered) AS total,
      (SELECT jsonb_build_object(
        'total', COUNT(*)::int,
        'active', COUNT(*) FILTER (WHERE status = 'ACTIVE')::int,
        'awaitingReview', COUNT(*) FILTER (WHERE status IN ('COMPLIANCE_SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED'))::int,
        'needsAccountSetup', COUNT(*) FILTER (WHERE status = 'APPROVED' AND "provisioningState" IS DISTINCT FROM 'READY')::int
      ) FROM registry) AS summary
  `, [search, filters.status ?? null, filters.mode ?? null, filters.limit, filters.offset]);
  const row = result.rows[0];
  return { ...row, nextOffset: filters.offset + row.businesses.length < row.total ? filters.offset + row.businesses.length : null };
}

export async function registeredBusinessById(identifier: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier) ? identifier : null;
  const result = await pool.query(`
    SELECT ${businessFields}, o.primary_operating_country AS "operatingCountry",
      p.organization_type AS "businessType", p.incorporation_date::text AS "incorporationDate",
      p.website, p.business_description AS "description", p.address_line_1 AS "addressLine1",
      p.address_line_2 AS "addressLine2", p.city, p.region, p.postal_code AS "postalCode",
      p.address_country AS "addressCountry", f.crypto_account_kind AS "cryptoAccountKind",
      f.crypto_account_verified_at AS "cryptoVerifiedAt",
      f.external_settlement_account_number AS "externalAccountNumber",
      f.external_settlement_account_name AS "externalAccountName",
      f.external_settlement_bank_code AS "externalBankCode"
    FROM organizations o
    LEFT JOIN business_compliance_profiles p ON p.organization_id = o.id
    LEFT JOIN business_financial_accounts f ON f.organization_id = o.id
    WHERE (o.business_slug = $1 OR o.id = $2::uuid) AND o.type = 'BUSINESS'
  `, [identifier, uuid]);
  if (!result.rows[0]) return null;
  const id = result.rows[0].id as string;
  const [owners, events, informationRequests] = await Promise.all([
    pool.query(`SELECT u.id, CONCAT_WS(' ',u.first_name,u.last_name) AS name,u.email,u.phone
      FROM organization_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.organization_id=$1 AND m.role_name='BUSINESS_OWNER' AND m.status='ACTIVE'
      ORDER BY m.created_at,u.id`, [id]),
    pool.query(`SELECT history.*, CONCAT_WS(' ',u.first_name,u.last_name) AS "actorName" FROM (
      SELECT 'REVIEW' AS source,sequence::text AS sequence,event_type AS "eventType",to_status AS state,note,actor_user_id,created_at AS "createdAt"
      FROM business_application_events WHERE organization_id=$1
      UNION ALL
      SELECT 'ACCOUNT' AS source,sequence::text AS sequence,event_type AS "eventType",state,NULL AS note,actor_user_id,created_at AS "createdAt"
      FROM business_account_provisioning_events WHERE organization_id=$1
    ) history LEFT JOIN users u ON u.id=history.actor_user_id
    ORDER BY history."createdAt" DESC,source,sequence::bigint DESC LIMIT 50`, [id]),
    pool.query(`SELECT id,note,state,response,resolution_note AS "resolutionNote",created_at AS "createdAt",responded_at AS "respondedAt",resolved_at AS "resolvedAt"
      FROM business_information_requests WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`, [id]),
  ]);
  return { business: result.rows[0], owners: owners.rows, events: events.rows.map(({ actor_user_id: _actor, ...event }) => event), informationRequests: informationRequests.rows };
}
