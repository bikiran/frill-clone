// SVG icons - consistent, professional, no emojis
import React from 'react'

type IconProps = { size?: number; color?: string; className?: string }

const baseProps = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const AssignIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
)

export const PinIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </svg>
)

export const MergeIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M6 21V9a9 9 0 0 0 9 9" />
  </svg>
)

export const ArchiveIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
)

export const TrashIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

export const EditIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export const ShareIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)

export const CloseIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export const SearchIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

export const PlusIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export const CheckIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export const ChevronRightIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

export const ChevronDownIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export const LockIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export const EyeIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const FilterIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

export const ImageIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
)

export const BugIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <rect x="8" y="6" width="8" height="14" rx="4" />
    <path d="M19 7l-3 2" />
    <path d="M5 7l3 2" />
    <path d="M19 19l-3-2" />
    <path d="M5 19l3-2" />
    <path d="M20 13h-4" />
    <path d="M4 13h4" />
    <path d="M10 4V2" />
    <path d="M14 4V2" />
  </svg>
)

export const FlagIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
)

export const StarIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

export const HomeIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

export const MapIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
)

export const MegaphoneIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
)

export const LightbulbIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
)

export const SurveyIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="13" y2="17" />
  </svg>
)

export const PollIcon = ({ size = 18, color = 'currentColor', className }: IconProps) => (
  <svg {...baseProps(size, color)} className={className}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)

export const HeartIcon = ({ size = 18, color = 'currentColor', className, filled }: IconProps & { filled?: boolean }) => (
  <svg {...baseProps(size, color)} fill={filled ? color : 'none'} className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

export const BellIcon = ({ size = 18, color = 'currentColor', className, filled }: IconProps & { filled?: boolean }) => (
  <svg {...baseProps(size, color)} fill={filled ? color : 'none'} className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)
