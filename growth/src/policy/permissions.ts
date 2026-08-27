import { pool } from '../db/pool.ts';
import { config } from '../config.ts';

// PermissionService (bölüm 2, 6, 28): bir yayının HEDEFE gitme izni.
//  - Owned hesap: hesap ACTIVE olmalı; içerik insan onayından geçmiş olmalı
//    (autoPublishOwned açıksa sistem onayı da kabul edilir — bilinçli config).
//  - Topluluk: promotion_policy DO_NOT_POST ise asla; approval_status APPROVED
//    değilse asla. MANUAL_APPROVAL_REQUIRED'da içerik onayı insan tarafından
//    verilmiş olmalı ('system' onayı yetmez).

export interface PermissionVerdict {
  allowed: boolean;
  reason?: string;
}

interface TargetRef {
  platform: string;
  accountId: string | null;
  communityId: string | null;
  contentReviewedBy: string | null; // growth_content_items.reviewed_by
}

export async function checkPermission(target: TargetRef): Promise<PermissionVerdict> {
  const humanApproved = Boolean(target.contentReviewedBy && target.contentReviewedBy !== 'system');

  if (target.communityId) {
    const { rows } = await pool.query<{
      promotion_policy: string; approval_status: string; relationship_status: string;
    }>(
      `SELECT p.promotion_policy, p.approval_status, c.relationship_status
         FROM growth_communities c
         LEFT JOIN growth_community_permissions p ON p.community_id = c.id
        WHERE c.id = $1`,
      [target.communityId],
    );
    const row = rows[0];
    if (!row) return { allowed: false, reason: 'topluluk kaydı yok' };
    if (row.relationship_status === 'BLACKLISTED' || row.relationship_status === 'PAUSED') {
      return { allowed: false, reason: `topluluk durumu: ${row.relationship_status}` };
    }
    const policy = row.promotion_policy ?? 'MANUAL_APPROVAL_REQUIRED';
    if (policy === 'DO_NOT_POST') return { allowed: false, reason: 'promotion_policy: DO_NOT_POST' };
    if ((row.approval_status ?? 'PENDING') !== 'APPROVED') {
      return { allowed: false, reason: 'topluluk admin onayı (approval_status) APPROVED değil' };
    }
    if (policy === 'MANUAL_APPROVAL_REQUIRED' && !humanApproved) {
      return { allowed: false, reason: 'bu topluluk insan onayı ister; içerik insan tarafından onaylanmamış' };
    }
    return { allowed: true };
  }

  if (target.accountId) {
    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM growth_social_accounts WHERE id = $1`,
      [target.accountId],
    );
    const row = rows[0];
    if (!row) return { allowed: false, reason: 'hesap kaydı yok' };
    if (row.status !== 'ACTIVE') return { allowed: false, reason: `hesap durumu: ${row.status}` };
  }

  // Owned yayın: insan onayı yoksa yalnızca autoPublishOwned açıkken geçer.
  if (!humanApproved && !config.autoPublishOwned) {
    return { allowed: false, reason: 'içerik insan onayından geçmemiş (autoPublishOwned kapalı)' };
  }
  return { allowed: true };
}
