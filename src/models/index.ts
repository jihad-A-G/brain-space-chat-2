import { Sequelize } from 'sequelize';
import { defineUserModel } from './User';
import { defineChatConversationModel } from './ChatConversation';
import { defineChatMessageModel } from './ChatMessage';
import { defineChatBlockedUserModel } from './ChatBlockedUser';
import { defineChatDeletedMessageModel } from './ChatDeletedMessage';
import { setupAssociations } from './associations';

export function defineModels(sequelize: Sequelize) {
  const User = defineUserModel(sequelize);
  const ChatConversation = defineChatConversationModel(sequelize);
  const ChatMessage = defineChatMessageModel(sequelize);
  const ChatBlockedUser = defineChatBlockedUserModel(sequelize);
  const ChatDeletedMessage = defineChatDeletedMessageModel(sequelize);
  const models = { User, ChatConversation, ChatMessage, ChatBlockedUser, ChatDeletedMessage };
  setupAssociations(models);
  return models;
} 