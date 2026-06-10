import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle } from 'lucide-react';

/**
 * Simple input that validates a CRON expression (5 fields).
 * Shows a tooltip with examples and a validation indicator.
 */
export const CronInput = ({
  value,
  onChange,
  placeholder = '0 2 * * *',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) => {
  const [isValid, setIsValid] = useState(true);

  const validate = (val: string) => {
    // Very simple validation: 5 space‑separated fields, each non‑empty.
    const parts = val.trim().split(/\s+/);
    return parts.length === 5 && parts.every(p => p.length > 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    setIsValid(validate(val));
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full ${isValid ? 'border-amber-500' : 'border-red-500'} focus:ring-amber-300`}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertTriangle
            className={`h-5 w-5 ${isValid ? 'text-amber-300' : 'text-red-400'}`}
          />
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="text-xs">
            CRON format: <code>minute hour day month day-of-week</code><br />
            e.g., <code>0 2 * * *</code> – every day at 02:00.
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
