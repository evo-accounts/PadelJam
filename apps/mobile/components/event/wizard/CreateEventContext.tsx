import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react';

import { type EventDraft, defaultDraft, type WizardStep } from './draft';
import { applyPatch } from './draftPatch';
import { stepByKey } from './steps';
import {
  neighbourStep,
  type StepKey,
  stepProgress,
  visibleStepKeys,
} from '@padel/utils';

type CreateEventContextValue = {
  draft: EventDraft;
  patch: (partial: Partial<EventDraft>) => void;
  /** Applies `partial` (if any) and moves to the next visible step — one update, so the path is computed from the new draft. */
  goNext: (partial?: Partial<EventDraft>) => void;
  goBack: () => void;
  /** The current step. */
  step: WizardStep;
  /** The steps this draft actually walks (UX-CEVT-01). */
  steps: WizardStep[];
  /** 0..1 through the visible path. */
  progress: number;
  isFirst: boolean;
  isLast: boolean;
  /**
   * Anything touched since the wizard opened — a patch, or a step taken. ✕ confirms whenever this
   * is true. It is not "the draft differs from the initial one": a tap step can advance without
   * changing anything (re-choosing the group the wizard was opened from), and that is still work
   * the organizer would lose.
   */
  isDirty: boolean;
  communityId: string | undefined;
};

const CreateEventContext = createContext<CreateEventContextValue | null>(null);

type State = { draft: EventDraft; key: StepKey; touched: boolean };
type Action =
  | { type: 'patch'; partial: Partial<EventDraft> }
  | { type: 'next'; partial?: Partial<EventDraft> }
  | { type: 'back' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'patch':
      return { ...state, draft: applyPatch(state.draft, action.partial), touched: true };
    case 'next': {
      const draft = action.partial ? applyPatch(state.draft, action.partial) : state.draft;
      return { draft, key: neighbourStep(draft, state.key, 1), touched: true };
    }
    case 'back':
      return { ...state, key: neighbourStep(state.draft, state.key, -1) };
  }
}

export function CreateEventProvider({
  children,
  initialGroupId,
  communityId,
}: {
  children: ReactNode;
  initialGroupId?: string | null;
  communityId?: string;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, (): State => ({
    draft: {
      ...defaultDraft,
      groupId: initialGroupId ?? null,
      groupCommunityId: initialGroupId ? communityId || undefined : undefined,
      isPrivate: initialGroupId ? false : true,
    },
    key: 'group',
    touched: false,
  }));

  const patch = useCallback((partial: Partial<EventDraft>) => dispatch({ type: 'patch', partial }), []);
  const goNext = useCallback(
    (partial?: Partial<EventDraft>) => dispatch({ type: 'next', partial }),
    [],
  );
  const goBack = useCallback(() => dispatch({ type: 'back' }), []);

  const value = useMemo<CreateEventContextValue>(() => {
    const keys = visibleStepKeys(state.draft);
    return {
      draft: state.draft,
      patch,
      goNext,
      goBack,
      step: stepByKey(state.key),
      steps: keys.map(stepByKey),
      progress: stepProgress(state.draft, state.key),
      isFirst: keys[0] === state.key,
      isLast: keys[keys.length - 1] === state.key,
      isDirty: state.touched,
      communityId,
    };
  }, [state, patch, goNext, goBack, communityId]);

  return <CreateEventContext.Provider value={value}>{children}</CreateEventContext.Provider>;
}

export function useEventWizard(): CreateEventContextValue {
  const ctx = useContext(CreateEventContext);
  if (!ctx) {
    throw new Error('useEventWizard must be used within a CreateEventProvider');
  }
  return ctx;
}
