import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db-connection';

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
    tableName: 'chat_blocked_users',
    timestamps: true,
  }
); 