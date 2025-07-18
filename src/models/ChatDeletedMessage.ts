import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

interface ChatDeletedMessageAttributes {
  id: number;
  message_id: number;
  deleted_by: number;
}

interface ChatDeletedMessageCreationAttributes extends Optional<ChatDeletedMessageAttributes, 'id'> {}

export class ChatDeletedMessage extends Model<ChatDeletedMessageAttributes, ChatDeletedMessageCreationAttributes> implements ChatDeletedMessageAttributes {
  public id!: number;
  public message_id!: number;
  public deleted_by!: number;
}

export function defineChatDeletedMessageModel(sequelize: Sequelize) {
  ChatDeletedMessage.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      message_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      deleted_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'ChatDeletedMessage',
      tableName: 'ChatDeletedMessages',
      timestamps: false,
    }
  );
  return ChatDeletedMessage;
} 