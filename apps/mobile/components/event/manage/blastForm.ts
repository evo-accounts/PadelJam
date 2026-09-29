/**
 * Send blast (UX-MEVT-18): what the compose sheet sends, as a pure function so the two tiers'
 * rules are unit-tested against what `send_event_blast` (0124) accepts.
 *
 *   Without customisation  a template, unedited: title / description / image go as null and the
 *                          server fills them from the template (anything else, or `save`, raises
 *                          blast_customization_required — B10).
 *   With customisation     the edited text. From a template, "Save blast" stores it under Your
 *                          blasts (p_save). From a saved blast, the tick means "save my changes to
 *                          it": update_saved_blast first, then send without p_save (a second copy
 *                          would otherwise appear in Your blasts on every reuse).
 */
import type { BlastChannel, BlastSendTo } from '@padel/api';

export type BlastDraft = {
  /** Where the draft came from. */
  source: 'template' | 'saved';
  templateId: string | null;
  savedId: string | null;
  title: string;
  description: string;
  imagePath: string | null;
};

export type BlastFieldKey = 'title' | 'description' | 'channels';

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;

export function validateBlast(
  draft: Pick<BlastDraft, 'title' | 'description'>,
  channels: readonly BlastChannel[],
  custom: boolean,
): Partial<Record<BlastFieldKey, 'required' | 'too_long'>> {
  const errors: Partial<Record<BlastFieldKey, 'required' | 'too_long'>> = {};
  if (custom) {
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title) errors.title = 'required';
    else if (title.length > TITLE_MAX) errors.title = 'too_long';
    if (!description) errors.description = 'required';
    else if (description.length > DESCRIPTION_MAX) errors.description = 'too_long';
  }
  if (channels.length === 0) errors.channels = 'required';
  return errors;
}

export type BlastPlan = {
  /** update_saved_blast before sending, when the organizer ticked "save my changes". */
  update: { id: string; title: string; description: string; imagePath: string | null } | null;
  send: {
    sourceTemplateId: string | null;
    title: string | null;
    description: string | null;
    imagePath: string | null;
    channels: BlastChannel[];
    sendTo: BlastSendTo;
    save: boolean;
  };
};

export function blastPlan(
  draft: BlastDraft,
  opts: { custom: boolean; channels: readonly BlastChannel[]; sendTo: BlastSendTo; save: boolean },
): BlastPlan {
  const channels = [...opts.channels];
  if (!opts.custom) {
    return {
      update: null,
      send: { sourceTemplateId: draft.templateId, title: null, description: null, imagePath: null, channels, sendTo: opts.sendTo, save: false },
    };
  }
  const title = draft.title.trim();
  const description = draft.description.trim();
  const fromSaved = draft.source === 'saved' && draft.savedId != null;
  return {
    update: fromSaved && opts.save ? { id: draft.savedId!, title, description, imagePath: draft.imagePath } : null,
    send: {
      sourceTemplateId: draft.templateId,
      title,
      description,
      imagePath: draft.imagePath,
      channels,
      sendTo: opts.sendTo,
      save: !fromSaved && opts.save,
    },
  };
}

/** WhatsApp is sent from the organizer's own app (decision 6): a wa.me link with the text. */
export const whatsappUrl = (shareText: string) => `https://wa.me/?text=${encodeURIComponent(shareText)}`;
