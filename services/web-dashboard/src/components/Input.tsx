import React from 'react';

interface InputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  type?: string;
  icon?: React.ReactNode;
}

const Input: React.FC<InputProps> = ({
  label,
  placeholder,
  value,
  onChange,
  error,
  type = 'text',
  icon,
}) => {
  const inputClasses = `block w-full px-3 py-2 border rounded-lg shadow-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)] transition-colors duration-200 ${
    error ? 'border-red-500' : 'border-[var(--color-border)]'
  } ${icon ? 'pl-10' : ''}`;

  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={inputClasses}
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export default Input;