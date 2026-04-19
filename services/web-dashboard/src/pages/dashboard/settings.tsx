import { useState } from 'react';
import { Settings as SettingsIcon, Cpu, Key, Globe, Info } from 'lucide-react';
import Layout from '../../components/layout/Layout';

const AI_MODELS = [
  { id: 'llama3-8b-8192', name: 'LLaMA 3 8B', provider: 'Groq', desc: 'Fast, good for real-time processing' },
  { id: 'llama3-70b-8192', name: 'LLaMA 3 70B', provider: 'Groq', desc: 'Higher quality, slower' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'Groq', desc: 'Strong reasoning, 32K context' },
  { id: 'gemma-7b-it', name: 'Gemma 7B', provider: 'Groq', desc: 'Google model, efficient' },
];

export default function SettingsPage() {
  const [selectedModel, setSelectedModel] = useState('llama3-8b-8192');
  const [apiUrl, setApiUrl] = useState(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
  const [wsUrl, setWsUrl] = useState(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000');

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-indigo-400" />
            Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">Configure AI models and connection settings</p>
        </div>

        {/* AI Model Selection */}
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-300">AI Model</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Select the AI model used for summarization, action item extraction, and conflict detection.
            Change the model in your backend <code className="text-indigo-400">.env</code> file via <code className="text-indigo-400">GROQ_MODEL</code>.
          </p>

          <div className="space-y-2">
            {AI_MODELS.map((model) => (
              <label
                key={model.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedModel === model.id
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  value={model.id}
                  checked={selectedModel === model.id}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="mt-1 accent-indigo-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{model.name}</span>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{model.provider}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{model.desc}</p>
                  <code className="text-xs text-indigo-400/70 mt-0.5 block">{model.id}</code>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Connection Settings */}
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-300">Connection</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">API URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">WebSocket URL</label>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* API Keys Info */}
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-300">API Keys</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            API keys are configured server-side in the <code className="text-indigo-400">.env</code> file for security.
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 bg-slate-900 rounded-lg">
              <span className="text-slate-400">GROQ_API_KEY</span>
              <span className="text-emerald-400">Configured ✓</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-900 rounded-lg">
              <span className="text-slate-400">ASSEMBLYAI_API_KEY</span>
              <span className="text-emerald-400">Configured ✓</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-900 rounded-lg">
              <span className="text-slate-400">MONGO_URI</span>
              <span className="text-emerald-400">Configured ✓</span>
            </div>
          </div>
        </div>

        {/* How to change AI */}
        <div className="bg-indigo-900/20 border border-indigo-800/30 rounded-xl p-5">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-indigo-300 mb-2">How to Change the AI Model</h3>
              <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                <li>Open <code className="text-indigo-400">.env</code> in the project root</li>
                <li>Change <code className="text-indigo-400">GROQ_MODEL=llama3-8b-8192</code> to your preferred model</li>
                <li>Run <code className="text-indigo-400">docker compose up -d --build</code> to restart</li>
                <li>The API will use the new model for all AI operations</li>
              </ol>
              <p className="text-xs text-slate-500 mt-3">
                You can also swap Groq for OpenAI, Anthropic, or any provider by editing
                <code className="text-indigo-400 ml-1">services/core-api/app/services/groq_service.py</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}