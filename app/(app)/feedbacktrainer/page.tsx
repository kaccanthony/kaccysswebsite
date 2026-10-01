import { redirect } from 'next/navigation';
import { getFeedbackTrainerAccess } from '@/lib/feedbackTrainerAccess';
import { getTrainerFeedbackData } from '@/lib/feedbackTrainerData';
import FeedbackTrainerClient from './FeedbackTrainerClient';
import './feedbacktrainer.css';
import { getSiteTimezoneMode } from '@/lib/siteTimezone';
import { createAdminClient } from '@/utils/supabase/admin';

export const metadata = { title: 'Trainer Feedback' };

export default async function FeedbackTrainerPage({ searchParams }: {
  searchParams: Promise<{ selected?: string; success?: string; error?: string }>;
}) {
  const access = await getFeedbackTrainerAccess();
  if (!access) redirect('/dashboard');
  const [data, params, timezoneMode] = await Promise.all([
    getTrainerFeedbackData(), searchParams, getSiteTimezoneMode(createAdminClient()),
  ]);
  const selected = Number(params.selected);
  return <FeedbackTrainerClient
    logs={data.logs}
    viewerDiscordId={access.discordId}
    viewerName={access.discordName}
    timezoneMode={timezoneMode}
    initialImages={data.imagesByLog}
    initialSelected={Number.isSafeInteger(selected) && selected > 0 ? selected : null}
    message={params.success || params.error || null}
    messageKind={params.error ? 'error' : 'success'}
  />;
}
