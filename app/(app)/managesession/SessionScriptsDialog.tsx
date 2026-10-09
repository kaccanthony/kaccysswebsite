'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboard, faXmark } from '@fortawesome/free-solid-svg-icons';
import { buildSessionScripts, type SessionScriptSource } from '@/lib/sessionScripts';
import type { SiteTimezoneMode } from '@/lib/siteTimezone';

export default function SessionScriptsDialog({ session, timezoneMode, discordIdsByName, onClose, onCopied, onCopyFailed }: {
  session: SessionScriptSource;
  timezoneMode: SiteTimezoneMode;
  discordIdsByName: Record<string, string>;
  onClose: () => void;
  onCopied: () => void;
  onCopyFailed: () => void;
}) {
  const scripts = useMemo(() => buildSessionScripts(session, timezoneMode, discordIdsByName), [session, timezoneMode, discordIdsByName]);
  const [activeKey, setActiveKey] = useState(scripts[0].key);
  const active = scripts.find(script => script.key === activeKey) ?? scripts[0];
  const missingLink = active.key === 'details' && !session.event_link ? 'Add an event link to replace [EVENT LINK].'
    : active.key === 'thread' && !session.forum_link ? 'Add the signup forum link if the forum is open.'
    : (active.key === 'start' || active.key === 'staff') && !session.private_server_link ? 'Add a private server link before sharing this message.'
    : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function copy() {
    try { await navigator.clipboard.writeText(active.content); onCopied(); }
    catch { onCopyFailed(); }
  }

  return <div className="script-backdrop" onClick={onClose}>
    <div className="script-window" role="dialog" aria-modal="true" aria-label="Session messages" onClick={event => event.stopPropagation()}>
      <div className="script-window-header">
        <div><strong>Session messages</strong><span>Preview the exact text, then copy the message you need.</span></div>
        <button type="button" className="modal-close-btn" aria-label="Close session messages" onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button>
      </div>
      <div className="script-window-body">
        <div className="script-tabs" role="tablist" aria-label="Message templates">
          {scripts.map(script => <button key={script.key} type="button" role="tab" aria-selected={active.key === script.key} className={active.key === script.key ? 'active' : ''} onClick={() => setActiveKey(script.key)}>{script.label}</button>)}
        </div>
        <div className="script-preview-panel">
          <div className="script-preview-header"><strong>{active.label}</strong><button type="button" className="btn-primary" onClick={copy}><FontAwesomeIcon icon={faClipboard} /> Copy message</button></div>
          {missingLink && <p className="script-link-note">{missingLink}</p>}
          <pre className="script-preview">{active.content}</pre>
        </div>
      </div>
    </div>
  </div>;
}
