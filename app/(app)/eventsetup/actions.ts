'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { isEventType } from '@/lib/events/types';
import { eventError } from '@/lib/events/errors';
import { getSiteTimezoneMode } from '@/lib/siteTimezone';

export async function setupEvent(formData: FormData) {
  await getCurrentUser();
  const eventId = Number(formData.get('event_id'));
  const requestedType = String(formData.get('event_type') ?? '');
  const returnUrl = `/eventsetup?event_id=${Number.isSafeInteger(eventId) ? eventId : ''}`;

  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    redirect(`${returnUrl}&error=${encodeURIComponent(eventError('DAB-01', 'Choose a valid event.'))}`);
  }

  const supabase = await createClient();
  const timezoneMode = await getSiteTimezoneMode(supabase);
  const { data: source, error: sourceError } = await supabase.from('event_upcoming')
    .select('event_type, event_status, event_additional_staff').eq('event_id', eventId).maybeSingle();
  if (sourceError || !source) redirect(`${returnUrl}&error=${encodeURIComponent(eventError('ERR_001', sourceError?.message ?? 'Scheduled event not found.'))}`);
  if (!['Scheduled', 'Published'].includes(source.event_status))
    redirect(`${returnUrl}&error=${encodeURIComponent(eventError('DAB-01', 'Only scheduled or published events can be set up.'))}`);
  const eventType = source.event_type || requestedType;
  if (!isEventType(eventType)) redirect(`${returnUrl}&error=${encodeURIComponent(eventError('DAB-01', 'Choose a valid event type in Manage Events.'))}`);
  const { data, error } = await supabase.rpc('start_event_run', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_timezone_mode: timezoneMode,
  });
  if (error || !data) {
    redirect(`${returnUrl}&error=${encodeURIComponent(eventError('ERR_003', error?.message ?? 'Could not open the event panel.'))}`);
  }

  // Carry the planned additional staff into the panel's run snapshot.
  const staff = source?.event_additional_staff;
  if (Array.isArray(staff) && staff.length > 0) {
    const summary = staff.map((row: { name?: string; role?: string }) =>
      row.role ? `${row.name ?? ''} (${row.role})` : row.name ?? '').filter(Boolean).join(', ');
    const { data: updated, error: staffError } = await supabase.from('event_runs').update({ additional_staff: summary })
      .eq('event_run_id', data).select('event_run_id').maybeSingle();
    if (staffError || !updated) redirect(`${returnUrl}&error=${encodeURIComponent(`Could not copy additional staff to the event panel: ${staffError?.message ?? 'Update was not permitted.'}`)}`);
  }

  revalidatePath('/eventsetup');
  revalidatePath('/eventpanel');
  redirect(`/eventpanel?event_id=${data}`);
}
