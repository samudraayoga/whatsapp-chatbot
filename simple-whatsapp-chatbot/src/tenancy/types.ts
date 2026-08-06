export const tenantPermissions = [
  'ai.settings.read',
  'ai.settings.manage',
  'ai.prompts.read',
  'ai.prompts.manage',
  'ai.prompts.approve',
  'ai.playground.use',
  'ai.logs.read',
  'ai.feedback.manage',
  'ai.unanswered.manage',
  'ai.evaluations.manage',
  'ai.analytics.read',
  'ai.operations.manage',
  'ai.privacy.manage',
  'ai.pilot.read',
  'ai.release.manage',
  'knowledge.read',
  'knowledge.edit',
  'knowledge.review',
  'knowledge.publish',
  'knowledge.categories.manage'
] as const;

export type TenantPermission = (typeof tenantPermissions)[number];

export type TenantContext = {
  tenantId: string;
  slug: string;
  name: string;
  permissions: TenantPermission[];
};

export const defaultBootstrapTenantPermissions: TenantPermission[] = [
  ...tenantPermissions
];
