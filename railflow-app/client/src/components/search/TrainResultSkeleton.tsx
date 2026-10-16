import React from 'react';

interface TrainResultSkeletonProps {
  count?: number;
}

export const TrainResultSkeleton: React.FC<TrainResultSkeletonProps> = ({ count = 3 }) => {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading available train schedules">
      {Array.from({ length: count }).map((_, idx) => (
        <article
          key={`train-skeleton-${idx}`}
          className="bg-surface-container-lowest rounded-3xl p-5 sm:p-7 shadow-sm border border-outline-variant/20 text-left animate-pulse motion-reduce:animate-none"
        >
          {/* Top Flag / Identity Strip Skeleton */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-variant/15">
            <div className="flex items-center gap-3">
              <div className="w-16 h-8 rounded-xl bg-surface-container-high" />
              <div>
                <div className="w-40 sm:w-56 h-5 rounded-md bg-surface-container-high" />
                <div className="w-24 sm:w-32 h-3.5 rounded bg-surface-container mt-2" />
              </div>
            </div>
            <div className="w-28 h-7 rounded-full bg-surface-container-high" />
          </div>

          {/* Schedule & Timeline Matrix Skeleton */}
          <div className="grid grid-cols-12 items-center py-5 bg-surface-container-low/50 rounded-2xl px-4 sm:px-6 my-4 border border-outline-variant/20">
            {/* Origin Column */}
            <div className="col-span-4 text-left">
              <div className="w-20 sm:w-28 h-7 sm:h-8 rounded-lg bg-surface-container-high" />
              <div className="w-14 sm:w-20 h-4 rounded bg-surface-container mt-1.5" />
              <div className="w-24 sm:w-32 h-3 rounded bg-surface-container/60 mt-1" />
            </div>

            {/* Journey Duration & Route Track */}
            <div className="col-span-4 flex flex-col items-center justify-center px-2">
              <div className="w-16 h-4 rounded bg-surface-container" />
              <div className="w-full flex items-center justify-between my-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-surface-container-high" />
                <div className="flex-1 h-0.5 bg-surface-container mx-2" />
                <div className="w-4 h-4 rounded-full bg-surface-container-high" />
                <div className="flex-1 h-0.5 bg-surface-container mx-2" />
                <div className="w-2.5 h-2.5 rounded-full bg-surface-container-high" />
              </div>
              <div className="w-24 h-3 rounded bg-surface-container/60" />
            </div>

            {/* Destination Column */}
            <div className="col-span-4 text-right flex flex-col items-end">
              <div className="w-20 sm:w-28 h-7 sm:h-8 rounded-lg bg-surface-container-high" />
              <div className="w-14 sm:w-20 h-4 rounded bg-surface-container mt-1.5" />
              <div className="w-24 sm:w-32 h-3 rounded bg-surface-container/60 mt-1" />
            </div>
          </div>

          {/* Available Travel Classes Pill Skeletons */}
          <div className="mt-4">
            <div className="w-36 h-3.5 rounded bg-surface-container mb-3" />
            <div className="flex flex-wrap gap-2.5 sm:gap-3">
              {[1, 2, 3, 4].map((cIdx) => (
                <div
                  key={cIdx}
                  className="p-3 rounded-2xl border border-outline-variant/20 bg-surface-container-low min-w-[130px] sm:min-w-[150px] flex-1 max-w-[220px] h-20 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-4 rounded bg-surface-container-high" />
                    <div className="w-14 h-4 rounded bg-surface-container-high" />
                  </div>
                  <div className="w-16 h-4 rounded-full bg-surface-container" />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Action Footer Skeleton */}
          <div className="mt-5 pt-4 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="w-36 h-4 rounded bg-surface-container" />
              <div className="w-28 h-4 rounded bg-surface-container" />
            </div>
            <div className="w-36 h-9 rounded-full bg-surface-container-high" />
          </div>
        </article>
      ))}
    </div>
  );
};
