'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCircleDot, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import styles from './ToastStack.module.css';

export type ToastKind = 'success' | 'warning' | 'error' | 'info';
export interface ToastEntry {
  id: number;
  message: string;
  kind: ToastKind;
  actorName: string;
}

export default function ToastStack({
  toasts, onDismiss, timed = false, connection = false,
}: {
  toasts: readonly ToastEntry[];
  onDismiss: (id: number) => void;
  timed?: boolean;
  connection?: boolean;
}) {
  return (
    <div className={styles.toastContainer} data-toast-stack data-connection-stack={connection || undefined} aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} data-toast className={`${styles.toast} ${styles.show} ${styles[toast.kind]}${timed ? ` ${styles.timed}` : ''}`}>
          <div className={styles.toastMsg}>
            <FontAwesomeIcon icon={toast.kind === 'success' ? faCheck : toast.kind === 'info' ? faCircleDot : faTriangleExclamation} />
            <div className={styles.toastText}>
              <span className={styles.toastActor}>{toast.actorName}</span>
              <span>{toast.message}</span>
            </div>
          </div>
          <button type="button" className={styles.toastDismiss} aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
          {timed && <div className={styles.toastTimer} />}
        </div>
      ))}
    </div>
  );
}
