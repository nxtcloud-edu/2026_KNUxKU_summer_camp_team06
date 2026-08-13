import { Check, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface AgentProgressStep {
  label: string;
  detail: string;
}

export function AgentProgressCard({
  title,
  steps,
  activeStep,
  className,
}: {
  title: string;
  steps: AgentProgressStep[];
  activeStep: number;
  className?: string;
}) {
  return (
    <section className={cn('tw-root agent-progress-card', className)} aria-live="polite">
      <p className="agent-progress-eyebrow">KEEP:ON AGENT</p>
      <strong>{title}</strong>
      <div className="agent-progress-steps">
        {steps.map((step, index) => {
          const complete = index < activeStep;
          const active = index === activeStep;
          return (
            <div
              key={step.label}
              className={cn('agent-progress-step', complete && 'is-complete', active && 'is-active')}
            >
              <span className="agent-progress-icon">
                {complete ? <Check size={13} /> : active ? <Loader2 size={14} /> : <i />}
              </span>
              <span className="agent-progress-copy"><b>{step.label}</b><small>{step.detail}</small></span>
              <span className="agent-progress-bar"><i /></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
