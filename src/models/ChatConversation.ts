import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db-connection';

interface ChatConversationAttributes {
  id: number;
  user_one: number;
  user_two: number;
}

interface ChatConversationCreationAttributes extends Optional<ChatConversationAttributes, 'id'> {}

export class ChatConversation extends Model<ChatConversationAttributes, ChatConversationCreationAttributes> implements ChatConversationAttributes {
  public id!: number;
  public user_one!: number;
  public user_two!: number;
}

ChatConversation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      unique: true,
      allowNull: false,
    },
    user_one: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    user_two: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'ChatConversation',
    tableName: 'ChatConversations',
    timestamps: false,
  }
); 