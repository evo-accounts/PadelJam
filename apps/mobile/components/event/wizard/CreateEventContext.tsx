import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { type EventDraft, defaultDraft, type WizardStep } from './draft';
import { STEPS } from './steps';

type CreateEventContextValue = {
  draft: EventDraft;
  patch: (partial: Partial<EventDraft>) => void;
  stepIndex: number;
  goNext: () => void;
  goBack: () => void;
  steps: WizardStep[];
  isFirst: boolean;
  isLast: boolean;
  isDirty: boolean;
  communityId: string | undefined;
};

const CreateEventContext = createContext<CreateEventContextValue | null>(null);

export function CreateEventProvider({
  children,
  initialGroupId,
  communityId,
}: {
  children: ReactNode;
  initialGroupId?: string | null;
  communityId?: string;
}) {
  const makeInitialDraft = (): EventDraft => ({
    ...defaultDraft,
    groupId: initialGroupId ?? null,
    isPrivate: initialGroupId ? false : true,
  });
  const [draft, setDraft] = useState<EventDraft>(makeInitialDraft);
  const initialDraftRef = useRef<EventDraft | null>(null);
  if (initialDraftRef.current === null) {
    initialDraftRef.current = makeInitialDraft();
  }
  const [stepIndex, setStepIndex] = useState(0);

  const patch = useCallback((partial: Partial<EventDraft>) => {
    setDraft((d) => {
      // Standalone events (no group) must be private — enforced by the schema.
      const forced: Partial<EventDraft> =
        partial.groupId === null ? { isPrivate: true, series: undefined } : {};
      return { ...d, ...partial, ...forced };
    });
  }, []);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + 1)));
  }, []);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i - 1)));
  }, []);

  const value = useMemo<CreateEventContextValue>(
    () => ({
      draft,
      patch,
      stepIndex,
      goNext,
      goBack,
      steps: STEPS,
      isFirst: stepIndex === 0,
      isLast: stepIndex === STEPS.length - 1,
      isDirty: JSON.stringify(draft) !== JSON.stringify(initialDraftRef.current),
      communityId,
    }),
    [draft, patch, stepIndex, goNext, goBack, communityId],
  );

  return <CreateEventContext.Provider value={value}>{children}</CreateEventContext.Provider>;
}

export function useEventWizard(): CreateEventContextValue {
  const ctx = useContext(CreateEventContext);
  if (!ctx) {
    throw new Error('useEventWizard must be used within a CreateEventProvider');
  }
  return ctx;
}
