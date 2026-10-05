/**
 * The app's own `Avatar` inside Stream's chat, in place of Stream's.
 *
 * Stream's avatar hard-codes its initials style (there is no theme key for it,
 * so `chatTheme` cannot reach it) and colours people from its own palette.
 * Swapping the two components that draw a person in a conversation gives them
 * Outfit initials and the colour that person has everywhere else in the app.
 *
 * Both run the image through `avatarUrl`: Stream's `user.image` is whatever the
 * app sent when it connected, the raw profile `avatar_url`, which can be a
 * storage path rather than a URL.
 */
import { View } from 'react-native';
import {
  type ComponentOverrides,
  type MessageAuthorProps,
  type MessageUserReactionsAvatarProps,
  useChannelContext,
  useMessageContext,
  useTheme,
} from 'stream-chat-expo';

import { avatarUrl } from '@/lib/community-images';

import { Avatar } from '../ui';

// Stream's message avatar is 32pt, which is the app's `sm`.
const column = { width: 32, height: 32 };

function MessageAuthor(props: MessageAuthorProps) {
  const { lastGroupMessage, message, showAvatar } = { ...useMessageContext(), ...props };
  const { members } = useChannelContext();
  const {
    theme: {
      messageItemView: { authorWrapper },
    },
  } = useTheme();

  const visible = typeof showAvatar === 'boolean' ? showAvatar : lastGroupMessage;
  const user = message?.user;

  return (
    <View style={authorWrapper.container} testID="message-author">
      {visible && user ? (
        <Avatar
          uri={avatarUrl(user.image)}
          name={user.name ?? user.id}
          colourKey={user.id}
          size="sm"
          // Stream prints the sender's name beside it only in group chats; in a
          // one-to-one the avatar is the only thing saying who wrote the message.
          decorative={Object.keys(members).length > 2}
        />
      ) : (
        // Holds the avatar column, so a group's earlier messages line up with its last.
        <View style={column} />
      )}
    </View>
  );
}

// The reactions sheet lists each reactor with their name beside the avatar.
function MessageUserReactionsAvatar({ reaction }: MessageUserReactionsAvatarProps) {
  return (
    <Avatar
      uri={avatarUrl(reaction.image)}
      name={reaction.name}
      colourKey={reaction.id}
      size="sm"
      decorative
    />
  );
}

/** Pass to `WithComponents`; Stream reads it once, at mount. */
export const chatComponents: ComponentOverrides = { MessageAuthor, MessageUserReactionsAvatar };
