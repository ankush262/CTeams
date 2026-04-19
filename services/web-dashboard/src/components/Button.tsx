import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  children,
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200';

  const variantClasses = {
    primary: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-dark)] focus:ring-[var(--color-brand)]',
    secondary: 'bg-white border border-[var(--color-brand)] text-[var(--color-brand)] hover:bg-[var(--color-brand)] hover:text-white focus:ring-[var(--color-brand)]',
    ghost: 'text-[var(--color-brand)] hover:bg-indigo-50 focus:ring-[var(--color-brand)]',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const disabledClasses = disabled || loading ? 'opacity-50 cursor-not-allowed' : '';

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClasses}`;

  const Spinner = () => (
    <svg
      className="animate-spin -ml-1 mr-2 h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
};

export default Button;