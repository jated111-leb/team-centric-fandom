type Phase = "pre" | "live" | "post";

interface PhaseIndicatorProps {
  activePhase: Phase;
  onPhaseChange: (phase: Phase) => void;
}

const phases: { id: Phase; label: string }[] = [
  { id: "post", label: "بعد المباراة" },
  { id: "live", label: "مباشر" },
  { id: "pre", label: "قبل المباراة" },
];

const PhaseIndicator = ({ activePhase, onPhaseChange }: PhaseIndicatorProps) => (
  <div className="flex items-center justify-center gap-2 py-3">
    {phases.map((phase) => {
      const isActive = activePhase === phase.id;
      return (
        <button
          key={phase.id}
          onClick={() => onPhaseChange(phase.id)}
          className={`inline-flex h-9 px-3 items-center justify-center gap-1.5 text-xs font-medium transition-all ${
            isActive
              ? "rounded-xl border-2 border-wc-accent bg-wc-accent text-wc-accent-foreground"
              : "rounded-xl border-2 border-wc-border bg-wc-bg text-wc-muted"
          }`}
        >
          {phase.label}
        </button>
      );
    })}
  </div>
);

export default PhaseIndicator;
