import React, { useEffect, useState } from 'react';
import { Play, Sparkles, AlertCircle, FileAudio, Check, ExternalLink } from 'lucide-react';
import { DemoClip } from '../lib/types';

interface DemoPickerProps {
  onSelectClip: (file: File, clip: DemoClip) => void;
  disabled?: boolean;
}

export const DemoPicker: React.FC<DemoPickerProps> = ({ onSelectClip, disabled = false }) => {
  const [clips, setClips] = useState<DemoClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedClipPath, setSelectedClipPath] = useState<string | null>(null);
  const [fetchingClip, setFetchingClip] = useState(false);

  useEffect(() => {
    async function loadManifest() {
      try {
        const res = await fetch('/demo/manifest.json');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setClips(data);
        } else {
          setClips([]);
        }
      } catch (err: any) {
        setLoadError('No verified demonstration audio clips are currently loaded in /demo/manifest.json.');
      } finally {
        setLoading(false);
      }
    }
    loadManifest();
  }, []);

  const handleChoose = async (clip: DemoClip) => {
    if (disabled || fetchingClip) return;
    setSelectedClipPath(clip.file);
    setFetchingClip(true);

    try {
      const res = await fetch(clip.file);
      if (!res.ok) {
        throw new Error(`Cannot retrieve audio file at ${clip.file} (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const ext = clip.file.split('.').pop() || 'wav';
      const file = new File([blob], clip.file.split('/').pop() || `demo_sample.${ext}`, {
        type: blob.type || 'audio/wav',
      });
      onSelectClip(file, clip);
    } catch (err: any) {
      alert(`Could not load demo sample: ${err.message}. Ensure the audio file exists in public/demo/.`);
    } finally {
      setFetchingClip(false);
    }
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-white">
              Benchmark Demonstration Corpus
            </h3>
            <span className="text-[10px] font-mono uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded">
              Demonstration
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Evaluate real, un-fabricated benchmark audio through the backend. Ground-truth labels are documented below.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500 font-mono py-4">Loading benchmark manifest...</p>
      ) : clips.length === 0 ? (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>No Demonstration Clips Configured</span>
          </div>
          <p>
            To populate demo items without inventing artificial audio, copy benchmark audio files to <code className="text-cyan-300">public/demo/</code> and register their provenance in <code className="text-cyan-300">public/demo/manifest.json</code>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {clips.map((clip) => {
            const isSelected = selectedClipPath === clip.file;
            const isHuman = clip.ground_truth === 'human';

            return (
              <div
                key={clip.file}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-cyan-400/50 bg-cyan-500/5'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                        isHuman
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/20'
                      }`}
                    >
                      Ground Truth: {clip.ground_truth}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {clip.license}
                  </span>
                </div>

                <h4 className="text-xs font-semibold text-white truncate">{clip.title}</h4>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                  {clip.description || `Source: ${clip.source}`}
                </p>

                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                  <div className="text-[10px] text-slate-500 font-mono">
                    {clip.generator ? `Gen: ${clip.generator}` : 'Organic human'}
                  </div>
                  <button
                    type="button"
                    disabled={disabled || fetchingClip}
                    onClick={() => handleChoose(clip)}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-white/10 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run Verification</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
