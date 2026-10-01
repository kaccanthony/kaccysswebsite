'use client';

import { useId, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import styles from './sessionongoing.module.css';

export interface FeedbackImage {
  id: string;
  slot_number: number | null;
  position: number;
  object_key: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at?: string;
  url: string;
}

const MAX_SIZE = 3 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `(${(bytes / 1024 / 1024).toFixed(1)} MB)` : `(${(bytes / 1024).toFixed(1)} KB)`;
}

export default function FeedbackImages({ images, busy, onAdd, onRemove, onError }: {
  images: FeedbackImage[];
  busy: boolean;
  onAdd: (file: File) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const tooltipId = useId();
  const [dragging, setDragging] = useState(false);

  async function addFiles(files: FileList | File[]) {
    if (busy) return;
    const selected = Array.from(files);
    if (images.length + selected.length > 10) return onError('A feedback entry can have at most 10 images.');
    for (const file of selected) {
      if (!TYPES.has(file.type) || file.size === 0) { onError('Choose a PNG, JPEG, JPG, or WebP image.'); continue; }
      if (file.size > MAX_SIZE) { onError(`${file.name} is larger than 3 MB.`); continue; }
      await onAdd(file);
    }
  }

  return (
    <section className={styles.feedbackImages}>
      <div className={styles.feedbackImagesHead}><span>Reference images</span><span>{images.length}/10 images</span></div>
      <div className={styles.imageUploadControls}>
        <div className={styles.imageUploadWrapper}>
          <input ref={input} type="file" accept=".png,.jpeg,.jpg,.webp,image/png,image/jpeg,image/webp" multiple hidden
            onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }} />
          <button
            type="button"
            className={`${styles.imageUploadButton} ${dragging ? styles.imageUploadButtonActive : ''}`}
            aria-label="Upload feedback images"
            aria-describedby={tooltipId}
            disabled={busy || images.length >= 10}
            onClick={() => input.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }}
          >
            <FontAwesomeIcon icon={faUpload} />
          </button>
          <span id={tooltipId} className={styles.imageUploadTooltip} role="tooltip">
            Drop images here or click to browse<br />
            Paste a screenshot with Ctrl + V, PNG, JPEG, JPG and WebP only allowed, 3MB each
          </span>
        </div>
        <div
          className={styles.imagePasteTarget}
          tabIndex={0}
          role="region"
          aria-label="Paste a screenshot here with Control plus V"
          onClick={(event) => event.currentTarget.focus()}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.items).map((item) => item.kind === 'file' ? item.getAsFile() : null).filter((file): file is File => file !== null);
            if (files.length) { event.preventDefault(); void addFiles(files); }
          }}
        >
          {busy ? 'Uploading image…' : 'Click here, then Ctrl + V to paste a screenshot'}
        </div>
      </div>
      {images.length > 0 && <div className={styles.feedbackImageList}>
        {images.map((image) => <div className={styles.feedbackImageItem} key={image.id}>
          <a href={image.url} target="_blank" rel="noopener noreferrer" title="Open image in a new tab">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.feedbackImageThumb} src={image.url} alt={image.file_name} />
          </a>
          <div className={styles.feedbackImageMeta}>
            <a href={image.url} target="_blank" rel="noopener noreferrer" title={image.file_name}>
              {image.file_name.length > 20 ? `${image.file_name.slice(0, 20)}...` : image.file_name}
            </a>
            <span>{sizeLabel(image.size_bytes)}</span>
          </div>
          <button type="button" className={styles.feedbackImageRemove} onClick={() => void onRemove(image.id)} disabled={busy} aria-label={`Remove ${image.file_name}`}>×</button>
        </div>)}
      </div>}
    </section>
  );
}
