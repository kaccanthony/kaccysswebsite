'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';

export default function StaffHeaderBackLink() {
  const pathname = usePathname();
  if (pathname === '/staff') return null;

  return (
    <Link href="/staff" className="staff-header-back">
      <FontAwesomeIcon icon={faArrowLeft} />
      <span>Back to Staff Overview</span>
    </Link>
  );
}
