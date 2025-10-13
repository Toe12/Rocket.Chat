import type { IRoom } from '@rocket.chat/core-typings';
import { isThreadMessage } from '@rocket.chat/core-typings';
import { useSetting, useUserPreference, useUser, usePermission } from '@rocket.chat/ui-contexts';
import type { ComponentProps } from 'react';
import { Fragment, useMemo } from 'react';

import { MessageListItem } from './MessageListItem';
import { MessageTypes } from '../../../../app/ui-utils/client';
import { useRoomSubscription } from '../contexts/RoomContext';
import { useFirstUnreadMessageId } from '../hooks/useFirstUnreadMessageId';
import { SelectedMessagesProvider } from '../providers/SelectedMessagesProvider';
import { useMessages } from './hooks/useMessages';
import { isMessageSequential } from './lib/isMessageSequential';
import MessageListProvider from './providers/MessageListProvider';

type MessageListProps = {
	rid: IRoom['_id'];
	messageListRef: ComponentProps<typeof MessageListProvider>['messageListRef'];
};

export const MessageList = function MessageList({ rid, messageListRef }: MessageListProps) {
	const messages = useMessages({ rid });
	const subscription = useRoomSubscription(); // Contains user's roles in the room
	const showUserAvatar = !!useUserPreference<boolean>('displayAvatars');
	const messageGroupingPeriod = useSetting('Message_GroupingPeriod', 300);
	const firstUnreadMessageId = useFirstUnreadMessageId();

	// 1. Get the current user's ID and check roles
	const currentUser = useUser();

	// Check for global 'admin' role permission (like the original code)
	const isCurrentUserAdmin = usePermission('access-permissions');

	// Check for room-specific 'moderator' role
	// Rocket.Chat roles in a room are stored in the subscription object's 'roles' array
	const isCurrentUserLeader = subscription?.roles?.includes('leader') ?? false;

	const isCurrentUserModerator = subscription?.roles?.includes('moderator') ?? false;

	// Check if the user is either an Admin OR a Moderator
	const canSeeAllMessages = isCurrentUserAdmin || isCurrentUserModerator || isCurrentUserLeader;

	const currentUserId = currentUser?._id;

	// 2. Filter messages based on the user's role and mentions
	const filteredMessages = useMemo(() => {
		// Condition 1: Admins OR Leaders/Moderators see everything.
		if (canSeeAllMessages) {
			return messages;
		}

		// Condition 2: Standard users filter the list to show only allowed messages.
		return messages.filter((message) => {
			// Check A: Did the current user send the message?
			const isOwnMessage = message.u._id === currentUserId;

			// Check B: Is the current user explicitly mentioned (or is it an 'all'/'here' announcement)?
			const isMentioned = message.mentions?.some(
				(mention) => mention._id === currentUserId || mention._id === 'all' || mention.username === 'here',
			);

			// Check C: Does the message mention ANY other regular user?
			// An 'other regular user' is any user whose ID is NOT the current user's ID
			// AND whose mention ID is NOT 'all' or 'here' (which are special/group mentions).
			const mentionsAnotherRegularUser = message.mentions?.some((mention) => {
				// Check if the mentioned user's ID is NOT the current user's ID
				const isNotCurrentUser = mention._id !== currentUserId;
				// Check if the mention is a specific user (not 'all' or 'here' announcements)
				const isSpecificUserMention = mention._id !== 'all' && mention.username !== 'here';

				return isNotCurrentUser && isSpecificUserMention;
			});

			// A standard user can see the message if:
			// (It's their own message OR they are explicitly mentioned)
			// AND
			// It does NOT mention any other regular user.
			return isOwnMessage || isMentioned; //&& !mentionsAnotherRegularUser;
		});
	}, [messages, canSeeAllMessages, currentUserId]);

	return (
		<MessageListProvider messageListRef={messageListRef}>
			<SelectedMessagesProvider>
				{/* Use the filtered list for rendering */}
				{filteredMessages.map((message, index, { [index - 1]: previous }) => {
					const sequential = isMessageSequential(message, previous, messageGroupingPeriod);
					const showUnreadDivider = firstUnreadMessageId === message._id;
					const system = MessageTypes.isSystemMessage(message);
					const visible = !isThreadMessage(message) && !system;

					return (
						<Fragment key={message._id}>
							<MessageListItem
								message={message}
								previous={previous}
								showUnreadDivider={showUnreadDivider}
								showUserAvatar={showUserAvatar}
								sequential={sequential}
								visible={visible}
								subscription={subscription}
								system={system}
							/>
						</Fragment>
					);
				})}
			</SelectedMessagesProvider>
		</MessageListProvider>
	);
};
