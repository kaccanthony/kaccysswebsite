export function canAccessFeedbackTrainer(
  flags: { op_dept?: boolean | null; cohost_auth?: boolean | null } | null,
  isSiteAdmin: boolean
): boolean {
  return isSiteAdmin || (flags?.op_dept === true && flags.cohost_auth === true);
}
