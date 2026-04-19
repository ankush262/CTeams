import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = 'md', color = 'indigo' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  const classes = `animate-spin rounded-full border-2 border-t-transparent border-${color}-500 ${sizeClasses[size]}`;

  return <div className={classes}></div>;
};

export default Spinner;