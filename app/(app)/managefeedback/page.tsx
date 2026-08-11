// FILE: app/(app)/managefeedback/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/getCurrentUser';
import { getFeedbackLogs, getSessionTraineeOptions } from '@/lib/feedbackLogs';
import ManageFeedbackInteractive from './ManageFeedbackInteractive';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import './managefeedback.css';

export const metadata = { title: 'Manage Feedback' };

export default async function ManageFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  // Feedback is written by whoever actually trained someone, not just managers,
  // so this gates on "any signed-in staff member" rather than mirroring
  // managesession's `permLevel >= 10` manager-only gate. Tighten this if
  // feedback-writing should actually be more restricted.
  if (!user.isStaff) redirect('/dashboard');

  const params = await searchParams;
  const [logs, traineeOptions] = await Promise.all([getFeedbackLogs(), getSessionTraineeOptions()]);

  return (
    <>
      {params.error && (
        <div className="error-banner">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {params.error}
        </div>
      )}
      {params.success && <div className="success-banner">{params.success}</div>}

      <div className="page-header">
        <div>
          <div className="section-label">Manage Feedback</div>
          <div className="section-sub">Review, edit, and write trainee session feedback.</div>
        </div>
      </div>

      <ManageFeedbackInteractive logs={logs} traineeOptions={traineeOptions} />
    </>
  );
}