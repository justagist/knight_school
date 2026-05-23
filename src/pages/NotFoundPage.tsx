import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <div className="text-3xl font-semibold">404</div>
      <div className="mt-2 text-sm text-ink-500 dark:text-ink-400">
        The page you're looking for isn't here.
      </div>
      <Link to="/" className="btn-primary mt-6 text-xs">
        Back to Analyze
      </Link>
    </div>
  );
}
