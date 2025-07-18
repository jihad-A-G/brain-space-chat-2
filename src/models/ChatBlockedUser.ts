import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

interface ChatBlockedUserAttributes {
  id: number;
  blocker_id: number;
  blocked_id: number;
}

interface ChatBlockedUserCreationAttributes extends Optional<ChatBlockedUserAttributes, 'id'> {}

export class ChatBlockedUser extends Model<ChatBlockedUserAttributes, ChatBlockedUserCreationAttributes> implements ChatBlockedUserAttributes {
  public id!: number;
  public blocker_id!: number;
  public blocked_id!: number;
}

export function defineChatBlockedUserModel(sequelize: Sequelize) {
  ChatBlockedUser.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      blocker_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      blocked_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'ChatBlockedUser',
      tableName: 'ChatBlockedUsers',
      timestamps: true,
    }
  );
  return ChatBlockedUser;
} 