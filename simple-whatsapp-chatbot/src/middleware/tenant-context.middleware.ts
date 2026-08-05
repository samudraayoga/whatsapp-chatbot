import type { NextFunction, Request, Response } from 'express';
import { AppError } from './error.middleware.js';
import {
  TenantContextResolutionError,
  TenantContextService
} from '../services/tenant-context.service.js';
import type { TenantPermission } from '../tenancy/types.js';

export const createTenantContextMiddleware = (
  tenantContextService: TenantContextService
) =>
  async (
    request: Request,
    _response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      request.tenantContext = await tenantContextService.resolveForAdmin(
        request.adminAuth!.id
      );
      next();
    } catch (error) {
      if (error instanceof TenantContextResolutionError) {
        next(new AppError(error.message, 403, error.code));
        return;
      }
      next(error);
    }
  };

export const requireTenantPermission = (permission: TenantPermission) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const hasCompatibilityPermission =
      request.adminAuth?.permissions.includes('chatbot.manage') ?? false;
    const hasTenantPermission =
      request.tenantContext?.permissions.includes(permission) ?? false;

    if (!hasCompatibilityPermission && !hasTenantPermission) {
      next(
        new AppError(
          'You do not have permission to perform this AI tenant action',
          403,
          'TENANT_PERMISSION_DENIED',
          { permission }
        )
      );
      return;
    }

    next();
  };
