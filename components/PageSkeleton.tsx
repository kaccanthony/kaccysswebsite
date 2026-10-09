import './PageSkeleton.css';

type SkeletonVariant = 'boot' | 'app' | 'login' | 'staff' | 'profile' | 'active' | 'legal' | 'board';

function Block({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`page-skeleton-block ${className}`} />;
}

function Cards({ count = 6, people = false }: { count?: number; people?: boolean }) {
  return (
    <div className={`page-skeleton-grid${people ? ' page-skeleton-people' : ''}`}>
      {Array.from({ length: count }, (_, index) => (
        <div className="page-skeleton-card" key={index}>
          <Block className={people ? 'page-skeleton-avatar' : 'page-skeleton-icon'} />
          <Block className="page-skeleton-line page-skeleton-line-medium" />
          <Block className="page-skeleton-line page-skeleton-line-short" />
        </div>
      ))}
    </div>
  );
}

function Rows() {
  return (
    <div className="page-skeleton-rows">
      <div className="page-skeleton-row page-skeleton-row-heading">
        {Array.from({ length: 4 }, (_, index) => <Block key={index} className="page-skeleton-line" />)}
      </div>
      {Array.from({ length: 5 }, (_, index) => (
        <div className="page-skeleton-row" key={index}>
          {Array.from({ length: 4 }, (_, cell) => <Block key={cell} className="page-skeleton-line" />)}
        </div>
      ))}
    </div>
  );
}

function Header() {
  return <div className="page-skeleton-topbar" aria-hidden="true"><Block className="page-skeleton-logo-small" /><Block className="page-skeleton-line page-skeleton-line-short" /><Block className="page-skeleton-topbar-end" /></div>;
}

export default function PageSkeleton({ variant = 'app' }: { variant?: SkeletonVariant }) {
  if (variant === 'board') {
    return <section className="page-skeleton page-skeleton-board" role="status" aria-label="Loading board" aria-busy="true"><span className="page-skeleton-sr">Loading board…</span><Rows /></section>;
  }

  if (variant === 'login') {
    return (
      <main className="page-skeleton page-skeleton-login" role="status" aria-label="Loading sign in" aria-busy="true">
        <span className="page-skeleton-sr">Loading sign in…</span>
        <div className="page-skeleton-login-card">
          <Block className="page-skeleton-logo" />
          <Block className="page-skeleton-title" />
          <Block className="page-skeleton-line page-skeleton-line-medium" />
          <Block className="page-skeleton-button" />
          <Block className="page-skeleton-line page-skeleton-line-short" />
        </div>
      </main>
    );
  }

  if (variant === 'profile') {
    return (
      <section className="page-skeleton page-skeleton-profile" role="status" aria-label="Loading staff profile" aria-busy="true">
        <span className="page-skeleton-sr">Loading staff profile…</span>
        <div className="bg-app" />
        <Header />
        <div className="page-skeleton-content">
          <Block className="page-skeleton-line page-skeleton-line-short" />
          <div className="page-skeleton-profile-card">
            <Block className="page-skeleton-avatar" />
            <Block className="page-skeleton-title" />
            <Block className="page-skeleton-line page-skeleton-line-short" />
            <div className="page-skeleton-profile-stats"><Cards count={3} /></div>
            <Rows />
          </div>
        </div>
      </section>
    );
  }

  const isBoot = variant === 'boot';
  const isLegal = variant === 'legal';
  const isStaff = variant === 'staff';
  const isActive = variant === 'active';

  return (
    <section className={`page-skeleton page-skeleton-${variant}`} role="status" aria-label="Loading page" aria-busy="true">
      <span className="page-skeleton-sr">Loading page…</span>
      {(isBoot || isStaff || isActive) && <div className="bg-app" />}
      {(isBoot || isStaff || isActive || isLegal) && <Header />}
      <div className="page-skeleton-content">
        <Block className="page-skeleton-title" />
        <Block className="page-skeleton-line page-skeleton-line-medium" />
        {isLegal ? (
          <div className="page-skeleton-legal-card">
            {Array.from({ length: 3 }, (_, index) => <div className="page-skeleton-paragraph" key={index}><Block className="page-skeleton-line page-skeleton-line-medium" /><Block className="page-skeleton-line" /><Block className="page-skeleton-line" /><Block className="page-skeleton-line page-skeleton-line-short" /></div>)}
          </div>
        ) : isActive ? <Rows /> : <Cards count={isStaff ? 8 : 6} people={isStaff} />}
      </div>
    </section>
  );
}
