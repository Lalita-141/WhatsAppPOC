/**
 * Makes an existing member an organization admin. This is the only way to
 * create the first admin; there is deliberately no API for it.
 *
 *   npm run org:make-admin -- <ORG_CODE> <COUNTRY_CODE> <MOBILE_NO>
 *   npm run org:make-admin -- HNT001 +91 9876543210
 */
import "dotenv/config";
import prisma from "../src/config/database.js";
import { writeAuditLog } from "../src/modules/policy/communication.policy.js";

const [orgCode, countryCode, mobileNo] = process.argv.slice(2);

if (!orgCode || !countryCode || !mobileNo) {
  console.error("Usage: npm run org:make-admin -- <ORG_CODE> <COUNTRY_CODE> <MOBILE_NO>");
  process.exit(1);
}

const main = async () => {
  const membership = await prisma.user_organization.findFirst({
    where: {
      deleted_at: null,
      organization_master: { org_code: orgCode, deleted_at: null },
      user_master: { country_code: countryCode, mobile_no: mobileNo, deleted_at: null },
    },
    select: { user_organization_id: true, org_id: true, role: true },
  });

  if (!membership) {
    console.error("No active member with that phone number in that organization.");
    process.exitCode = 1;
    return;
  }

  if (membership.role === "ADMIN") {
    console.log("Already an admin.");
    return;
  }

  await prisma.user_organization.update({
    where: { user_organization_id: membership.user_organization_id },
    data: { role: "ADMIN", updated_at: new Date() },
  });
  await writeAuditLog({
    orgId: membership.org_id,
    actor: null,
    action: "ADMIN_GRANTED_FROM_SERVER",
    targetType: "MEMBER",
    targetId: membership.user_organization_id,
  });
  console.log("Done: member is now an admin.");
};

main().finally(() => prisma.$disconnect());
