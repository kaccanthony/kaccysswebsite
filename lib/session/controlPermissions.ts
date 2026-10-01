import type { OverridesState } from '@/types/session';

export interface SessionActorRoles {
  host: boolean;
  coHost: boolean;
  mainAst: boolean;
  internalHelper: boolean;
}

export function getSessionControlAccess(overrides: Partial<OverridesState> | undefined, roles: SessionActorRoles) {
  const all = overrides?.['allow-all'] === true;
  const sessionEditors = roles.host || roles.coHost || roles.internalHelper;
  const hostEditors = roles.host || roles.internalHelper;

  return {
    sessionDetails: all || (overrides?.['session-details'] === true && sessionEditors),
    trainees: all || (overrides?.trainees === true && sessionEditors),
    traineeDetails: all || (overrides?.['trainee-details'] === true && sessionEditors),
    slotOrder: all || (overrides?.['slot-order'] === true && sessionEditors),
    staffRoles: all || (overrides?.['staff-roles'] === true && (roles.host || roles.mainAst)),
    drivers: all || overrides?.['drivers-disable'] !== true || roles.host,
    trainerDetails: all || (overrides?.['trainer-details'] === true && hostEditors),
    staffDelete: all || (overrides?.['staff-delete'] === true && hostEditors),
    staffAddition: all || (overrides?.['staff-addition'] === true && hostEditors),
  };
}
