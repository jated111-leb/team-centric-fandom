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
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
            isActive
              ? "bg-wc-accent text-wc-accent-foreground"
              : "bg-wc-elevated text-wc-muted"
          }`}
        >
          {phase.label}
        </button>
      );
    })}
  </div>
);

export default PhaseIndicator;
