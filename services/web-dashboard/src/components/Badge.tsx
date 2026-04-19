import React from 'react';

interface BadgeProps {
  label: string;
  size?: 'sm' | 'md';
}

const Badge: React.FC<BadgeProps> = ({ label, size = 'md' }) => {
  const colors = ['indigo', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'orange', 'teal'];

  // Deterministically assign color based on the first character of the label
  const colorIndex = label.charCodeAt(0) % colors.length;
  const color = colors[colorIndex];

  const bgClasses = {
    indigo: 'bg-indigo-100',
    emerald: 'bg-emerald-100',
    amber: 'bg-amber-100',
    rose: 'bg-rose-100',
    violet: 'bg-violet-100',
    cyan: 'bg-cyan-100',
    orange: 'bg-orange-100',
    teal: 'bg-teal-100',
  };

  const textClasses = {
    indigo: 'text-indigo-800',
    emerald: 'text-emerald-800',
    amber: 'text-amber-800',
    rose: 'text-rose-800',
    violet: 'text-violet-800',
    cyan: 'text-cyan-800',
    orange: 'text-orange-800',
    teal: 'text-teal-800',
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  };

  const classes = `inline-flex items-center rounded-full font-medium ${bgClasses[color]} ${textClasses[color]} ${sizeClasses[size]}`;

  return <span className={classes}>{label}</span>;
};

export default Badge;