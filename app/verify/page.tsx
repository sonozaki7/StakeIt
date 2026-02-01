'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function VerifyRedirectPage(): JSX.Element {
  const searchParams = useSearchParams();

  useEffect(() => {
    const redirectUrl = searchParams.get('redirect');

    if (redirectUrl) {
      window.location.href = decodeURIComponent(redirectUrl);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <h1 className="text-xl font-semibold text-gray-900">
          Redirecting to verification...
        </h1>
        <p className="text-gray-600 mt-2">
          You&apos;ll be asked to log in to prove your activity.
        </p>
      </div>
    </div>
  );
}
