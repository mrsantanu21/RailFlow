import React from 'react';
import { socialLinks } from '../../constants/socialLinks';

interface SocialItemConfig {
  id: keyof typeof socialLinks;
  name: string;
  url: string;
  ariaLabel: string;
  badgeStyle: string;
  icon: React.ReactNode;
}

export const SocialConnectBanner: React.FC = () => {
  const items: SocialItemConfig[] = [
    {
      id: 'github',
      name: 'GitHub',
      url: socialLinks.github,
      ariaLabel: 'Visit our GitHub profile',
      badgeStyle:
        'bg-[#0b101b] border-2 border-[#1f6feb] ring-1 ring-[#1f6feb]/50 shadow-[0_0_12px_rgba(31,111,235,0.45)] hover:shadow-[0_0_22px_rgba(31,111,235,0.85)] hover:border-[#388bfd]',
      icon: (
        <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          />
        </svg>
      ),
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      url: socialLinks.linkedin,
      ariaLabel: 'Visit our LinkedIn profile',
      badgeStyle:
        'bg-[#0077b5] border border-white/20 shadow-[0_0_12px_rgba(0,119,181,0.5)] hover:shadow-[0_0_22px_rgba(0,119,181,0.85)] hover:bg-[#0086cf]',
      icon: (
        <svg className="w-[18px] h-[18px] fill-current text-white" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 8.5h3.5v12h-3.5zm1.75-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6.25 6h3.4v1.7h.05c.48-.9 1.65-1.85 3.4-1.85 3.65 0 4.3 2.4 4.3 5.5v8.65h-3.5v-7.65c0-1.8-.05-4.1-2.5-4.1-2.5 0-2.9 1.95-2.9 4v7.75h-3.5v-12z" />
        </svg>
      ),
    },
    {
      id: 'x',
      name: 'X',
      url: socialLinks.x,
      ariaLabel: 'Visit our X profile',
      badgeStyle:
        'bg-black border-2 border-slate-700/80 ring-1 ring-blue-400/40 shadow-[0_0_12px_rgba(59,130,246,0.35)] hover:shadow-[0_0_22px_rgba(59,130,246,0.7)] hover:border-slate-500',
      icon: (
        <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current text-white" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      id: 'instagram',
      name: 'Instagram',
      url: socialLinks.instagram,
      ariaLabel: 'Visit our Instagram profile',
      badgeStyle:
        'bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] border border-white/25 shadow-[0_0_12px_rgba(220,39,67,0.5)] hover:shadow-[0_0_22px_rgba(220,39,67,0.85)] hover:brightness-110',
      icon: (
        <svg
          className="w-5 h-5 fill-none stroke-current text-white stroke-[2]"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
        </svg>
      ),
    },
    {
      id: 'facebook',
      name: 'Facebook',
      url: socialLinks.facebook,
      ariaLabel: 'Visit our Facebook profile',
      badgeStyle:
        'bg-[#1877f2] border border-white/20 shadow-[0_0_12px_rgba(24,119,242,0.5)] hover:shadow-[0_0_22px_rgba(24,119,242,0.85)] hover:bg-[#2083ff]',
      icon: (
        <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13.397 20.997v-8.196h2.765l.411-3.209h-3.176V7.548c0-.926.258-1.56 1.587-1.56h1.684V3.127A22.336 22.336 0 0 0 14.201 3c-2.444 0-4.122 1.492-4.122 4.231v2.355H7.332v3.209h2.753v8.196h3.312z" />
        </svg>
      ),
    },
  ];

  return (
    <section
      aria-label="Social media connections"
      className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-blue-500/30 bg-gradient-to-r from-[#030925] via-[#071d5b] via-[#0d348a] to-[#071a53] transition-all min-h-[104px] md:h-[106px] flex items-center"
    >
      {/* ─── Visual Effects: Diagonal Light Beams & Glows ─── */}
      {/* Left diagonal cyan beam */}
      <div
        className="absolute -left-16 -top-20 w-80 h-44 bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent -rotate-12 blur-sm pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -left-10 bottom-0 top-0 w-2.5 bg-gradient-to-b from-transparent via-cyan-400/70 to-transparent rotate-[34deg] pointer-events-none"
        aria-hidden="true"
      />

      {/* Right diagonal electric blue streak */}
      <div
        className="absolute -right-16 -bottom-16 w-96 h-40 bg-gradient-to-l from-transparent via-blue-500/30 to-transparent rotate-[24deg] blur-md pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute right-4 -bottom-10 w-[2px] h-48 bg-gradient-to-t from-transparent via-blue-300/60 to-transparent rotate-[28deg] pointer-events-none"
        aria-hidden="true"
      />

      {/* Center radial ambient glow */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_65%_50%,rgba(59,130,246,0.22),transparent_70%)] pointer-events-none"
        aria-hidden="true"
      />

      {/* ─── Content Layer ─── */}
      <div className="relative z-10 w-full px-6 py-4 sm:px-8 sm:py-3 md:px-10 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
        {/* Heading: Target approximately 24-26px on desktop (md:text-[25px]) */}
        <h3 className="text-white text-lg sm:text-[22px] md:text-[25px] font-bold tracking-tight text-center sm:text-left select-none drop-shadow-sm leading-tight shrink-0">
          Get connected with us
        </h3>

        {/* Five Social Media Badges: Target approximately 44-52px in diameter (48px / w-12 h-12) */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 md:gap-4 lg:gap-5">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.ariaLabel}
              title={item.ariaLabel}
              className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center text-white 
                transform transition-all duration-300 ease-out 
                hover:-translate-y-1 hover:scale-110 active:scale-95 
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071a5c]
                ${item.badgeStyle}`}
            >
              {item.icon}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
