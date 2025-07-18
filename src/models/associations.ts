import { User } from './User';
import { ChatConversation } from './ChatConversation';
import { ChatMessage } from './ChatMessage';
import { ChatBlockedUser } from './ChatBlockedUser';
import { ChatDeletedMessage } from './ChatDeletedMessage';

export function setupAssociations(models: any) {
  const { User, ChatConversation, ChatMessage, ChatBlockedUser, ChatDeletedMessage } = models;
  // User ↔ ChatConversation (user_one, user_two)
  ChatConversation.belongsTo(User, { as: 'userOne', foreignKey: 'user_one' });
  ChatConversation.belongsTo(User, { as: 'userTwo', foreignKey: 'user_two' });
  User.hasMany(ChatConversation, { as: 'conversationsAsUserOne', foreignKey: 'user_one' });
  User.hasMany(ChatConversation, { as: 'conversationsAsUserTwo', foreignKey: 'user_two' });

  // ChatConversation ↔ ChatMessage
  ChatConversation.hasMany(ChatMessage, { foreignKey: 'conversation_id' });
  ChatMessage.belongsTo(ChatConversation, { foreignKey: 'conversation_id' });

  // User ↔ ChatMessage (sender, receiver)
  User.hasMany(ChatMessage, { as: 'sentMessages', foreignKey: 'sender_id' });
  User.hasMany(ChatMessage, { as: 'receivedMessages', foreignKey: 'receiver_id' });
  ChatMessage.belongsTo(User, { as: 'sender', foreignKey: 'sender_id' });
  ChatMessage.belongsTo(User, { as: 'receiver', foreignKey: 'receiver_id' });

  // User ↔ ChatBlockedUser
  User.hasMany(ChatBlockedUser, { as: 'blockedUsers', foreignKey: 'blocker_id' });
  User.hasMany(ChatBlockedUser, { as: 'blockedBy', foreignKey: 'blocked_id' });
  ChatBlockedUser.belongsTo(User, { as: 'blocker', foreignKey: 'blocker_id' });
  ChatBlockedUser.belongsTo(User, { as: 'blocked', foreignKey: 'blocked_id' });

  // User ↔ ChatDeletedMessage
  User.hasMany(ChatDeletedMessage, { foreignKey: 'deleted_by' });
  ChatDeletedMessage.belongsTo(User, { foreignKey: 'deleted_by' });

  // ChatMessage ↔ ChatDeletedMessage
  ChatMessage.hasMany(ChatDeletedMessage, { foreignKey: 'message_id' });
  ChatDeletedMessage.belongsTo(ChatMessage, { foreignKey: 'message_id' });
} 