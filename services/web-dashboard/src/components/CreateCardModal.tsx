import React, { useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/Button';

interface CreateCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any) => void;
}

const CreateCardModal: React.FC<CreateCardModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Please enter some text');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess(data);
        onClose();
        setText('');
        toast.success('Card created!');
      } else {
        setError(data.message || 'Failed to create card');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">New Knowledge Card</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              What's the update?
            </label>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a client email, team update, decision, or any info your team needs to know..."
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg shadow-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)]"
            />
            <div className="text-sm text-[var(--color-text-muted)] mt-1">
              {text.length} characters
            </div>
          </div>

          {/* File upload */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".pdf,.txt,.docx"
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <p className="text-[var(--color-text-muted)]">Drop a file or click to upload</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">Supports PDF, TXT, DOCX files</p>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-[var(--color-border)]">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={handleSubmit}>
            Summarize & Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateCardModal;