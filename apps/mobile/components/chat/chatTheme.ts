/**
 * Stream's chat UI in the app's face.
 *
 * stream-chat-expo draws its own `Text` and has no global font option. Its token
 * files declare `typographyFontFamilySans`, but no component reads it. What the
 * components do read is the theme: nearly every text style spreads its theme key
 * last (`{ fontSize, fontWeight, ...theme.dateHeader.text }`), so naming the
 * family on each of those keys puts the SDK in Outfit while Stream keeps picking
 * sizes and weights (400–700, all embedded).
 *
 * `TextFaces<Theme>` is every text style in Stream's `Theme` type outside message
 * markdown, so `satisfies` fails typecheck when an SDK upgrade adds one. Add the
 * new key here. Markdown follows different rules; see `markdown` below.
 *
 * NOT reachable through the theme in 9.3.1 (hard-coded styles; they render in the
 * system face): avatar initials, unread-count badges, labels on Stream's own
 * `Button` (the "N unread" pill), the notification toast (it ignores its
 * `notification.message` key), attachment-picker titles and the reactions
 * sheet's avatar captions.
 */
import type { Theme } from 'stream-chat-expo';

import { font } from '../../theme';

type Face = { fontFamily: string };

// react-native-svg props carry font props too, so `fill` is what tells an icon from a text style.
type IsTextStyle<S> = S extends object
  ? 'fontFamily' extends keyof S
    ? 'fill' extends keyof S
      ? false
      : true
    : false
  : false;
type IsGroup<S> = S extends readonly unknown[] | ((...args: never[]) => unknown)
  ? false
  : S extends object
    ? 'fill' extends keyof S
      ? false
      : true
    : false;
type HasText<S> =
  IsTextStyle<S> extends true
    ? true
    : IsGroup<S> extends true
      ? keyof RequiredFaces<S> extends never
        ? false
        : true
      : false;

/** Markdown styles are set by hand (see `markdown`), so they are typed but not required. */
type ByHand = 'markdown' | 'onlyEmojiMarkdown';

type RequiredFaces<T> = {
  [K in keyof T as K extends ByHand
    ? never
    : HasText<NonNullable<T[K]>> extends true
      ? K
      : never]-?: IsTextStyle<NonNullable<T[K]>> extends true ? Face : TextFaces<NonNullable<T[K]>>;
};

/** Every text style in a Stream theme (sub)tree, each requiring a `Face`; groups without text drop out. */
type TextFaces<T> = RequiredFaces<T> & { [K in keyof T as K extends ByHand ? K : never]?: T[K] };

const face: Face = { fontFamily: font.sans };

/** `{ a: face, b: face }` for the given keys. */
function faces<K extends string>(...keys: K[]): Record<K, Face> {
  return Object.fromEntries(keys.map((k) => [k, face])) as Record<K, Face>;
}

/**
 * Message text, which is deliberately NOT one key per style.
 *
 * Stream spreads these keys over its own markdown defaults instead of merging
 * them, so naming e.g. `heading2` replaces Stream's size and line height for it
 * (the heading then clips). And the markdown renderer styles every run of text
 * as `{ ...text, ...inherited }`, where `strong`, `em` and the headings pass
 * their style down. So `text` alone reaches paragraphs, links, quotes, tables,
 * lists and headings, and anything that names a family of its own (`em` below)
 * still wins.
 *
 * The cost: inline code takes Outfit too, on its code background, because its
 * run gets `text`'s family over the mono one its wrapper sets. Code blocks keep
 * the mono face; Stream draws them without a text run.
 */
const markdown = {
  text: face,
  mentions: face,
  // Bullets and numbers are their own Text beside the item, so they inherit nothing.
  listItemBullet: face,
  // Naming the key replaces Stream's `{ fontWeight: 'bold' }` for it, hence restated.
  listItemNumber: { ...face, fontWeight: 'bold' },
  // Outfit ships no italic and iOS will not slant a custom face, so `_emphasis_`
  // would quietly render upright. The system italic keeps what the sender meant,
  // and `***both***` comes out bold italic.
  em: { fontFamily: 'System' },
} satisfies Theme['messageItemView']['content']['markdown'];

/** Pass as `OverlayProvider`'s `value.style`; `Chat` inherits it from there. */
export const chatTheme = {
  aiTypingIndicatorView: faces('text'),
  attachmentPicker: { ...faces('durationText'), content: faces('text') },
  audioAttachment: faces('progressDurationText', 'speedChangeButtonText'),
  channel: faces('selectChannel'),
  channelListHeaderErrorIndicator: faces('errorText'),
  channelDetailsMenu: { header: faces('metaText'), item: faces('destructiveText', 'standardText') },
  channelPreview: {
    ...faces('date', 'title', 'unreadText'),
    messageDeliveryStatus: faces('text'),
    typingIndicatorPreview: faces('text'),
    message: faces('subtitle', 'errorText', 'draftText'),
    messagePreview: faces('draftText', 'subtitle'),
  },
  dateHeader: faces('text'),
  emptyStateIndicator: faces('channelDetails', 'channelTitle', 'messageTitle'),
  iconBadge: faces('unreadCount'),
  imageGallery: {
    footer: faces('imageCountText'),
    grid: faces('handleText'),
    header: faces('dateText', 'usernameText'),
    videoControl: faces('durationTextStyle'),
  },
  inlineDateSeparator: faces('text'),
  loadingErrorIndicator: faces('errorText', 'retryText'),
  loadingIndicator: faces('loadingText'),
  messageComposer: {
    ...faces('inputBox'),
    audioRecordingInProgress: faces('durationText'),
    audioRecordingPreview: faces('currentTime'),
    cooldownTimer: faces('text'),
    fileAttachmentUploadPreview: faces('filenameText', 'fileSizeText'),
    fileUploadRetryIndicator: faces('networkErrorText', 'retryText'),
    fileUploadNotSupportedIndicator: faces('notSupportedText'),
    sendMessageDisallowedIndicator: faces('text'),
    showThreadMessageInChannelButton: faces('text'),
    suggestions: {
      command: faces('args', 'title'),
      emoji: faces('text'),
      header: faces('title'),
      mention: faces('name', 'tag'),
    },
    videoAttachmentUploadPreview: faces('durationText'),
    linkPreviewList: faces('text', 'titleText'),
  },
  messageList: {
    ...faces('errorNotificationText'),
    inlineUnreadIndicator: faces('text'),
    messageSystem: faces('dateText', 'text'),
    scrollToBottomButton: faces('unreadCountNotificationText'),
  },
  notification: faces('actionButtonText', 'message'),
  messageMenu: {
    actionListItem: faces('title'),
    userReactions: faces('avatarName', 'reactionsText', 'title'),
  },
  messagePreview: faces('message'),
  messageItemView: {
    actions: faces('buttonText'),
    card: { ...faces('linkPreviewText'), footer: faces('description', 'title') },
    content: { ...faces('metaText', 'timestampText'), markdown },
    deleted: faces('deletedText'),
    footer: faces('name', 'editedText'),
    file: faces('fileSize', 'title'),
    unsupportedAttachment: faces('title'),
    gallery: faces('moreImagesText'),
    giphy: faces('actionButtonText', 'giphyHeaderText', 'giphyMaskText'),
    compactUrlPreview: faces('title', 'description', 'linkPreviewText'),
    messageBlocked: faces('text'),
    pinnedHeader: faces('label'),
    savedForLaterHeader: faces('label'),
    reminderHeader: faces('label', 'dot', 'time'),
    sentToChannelHeader: faces('label', 'dot', 'link'),
    reactionListItem: faces('reactionCount'),
    reactionListClustered: faces('reactionCount'),
    replies: faces('messageRepliesText'),
  },
  poll: {
    allOptions: faces('titleText'),
    answersList: { item: faces('answerText') },
    button: faces('text'),
    createContent: {
      addComment: faces('title', 'description'),
      anonymousPoll: faces('title', 'description'),
      maxVotes: faces('input', 'validationText'),
      multipleAnswers: faces('description', 'input', 'title'),
      name: faces('input', 'title'),
      pollOptions: {
        ...faces('title'),
        addOption: faces('text'),
        optionStyle: faces('input', 'validationErrorText'),
      },
      suggestOption: faces('title', 'description'),
    },
    fullResults: faces('headerText', 'headerTitle'),
    inputDialog: faces('button', 'input', 'title'),
    message: { header: faces('subtitle', 'title'), option: faces('votesText', 'text') },
    modalHeader: faces('title'),
    results: {
      ...faces('title', 'titleMeta'),
      item: faces('title', 'titleMeta', 'voteCount'),
      vote: faces('dateText', 'userName'),
    },
  },
  reply: { ...faces('title', 'subtitle'), messagePreview: faces('subtitle') },
  thread: { newThread: faces('text') },
  threadListItem: {
    ...faces('channelName', 'dateText', 'messageRepliesText'),
    messagePreview: faces('draftText', 'subtitle'),
    messagePreviewDeliveryStatus: faces('text', 'username'),
  },
  threadListUnreadBanner: faces('text'),
  typingIndicator: faces('text'),
} satisfies TextFaces<Theme>;
