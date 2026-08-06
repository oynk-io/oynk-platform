import { pool } from "../db/pool.js";

async function main():Promise<void>{
  const result=await pool.query<{users:string;organizations:string;active_sessions:string;orphan_memberships:string;roles_without_permissions:string}>(`SELECT
    (SELECT COUNT(*) FROM users)::TEXT users,
    (SELECT COUNT(*) FROM organizations)::TEXT organizations,
    (SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at>NOW())::TEXT active_sessions,
    (SELECT COUNT(*) FROM organization_memberships m LEFT JOIN users u ON u.id=m.user_id LEFT JOIN organizations o ON o.id=m.organization_id WHERE u.id IS NULL OR o.id IS NULL)::TEXT orphan_memberships,
    (SELECT COUNT(*) FROM roles r WHERE NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_name=r.name))::TEXT roles_without_permissions`);
  const row=result.rows[0];
  console.info("Authentication audit",row);
  if(!row||Number(row.orphan_memberships)>0||Number(row.roles_without_permissions)>0)process.exitCode=1;
}
void main().catch((error)=>{console.error("Authentication audit failed",error instanceof Error?error.message:"Unknown error");process.exitCode=1;}).finally(()=>pool.end());
