import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db-connection';

export type MessageType = 'text' | 'image' | 'video' | 'file' | 'audio';

interface ChatMessageAttributes {
  id: string;
  conversation_id: number;
  sender_id: string;
  receiver_id: string;
  message: string;
  message_type: MessageType;
  file_url?: string | null;
  file_name?: string | null;
  file_extension?: string | null;
  file_size?: string | null;
  is_read: boolean;
  deleted_by: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

interface ChatMessageCreationAttributes extends Optional<ChatMessageAttributes, 'id' | 'file_url' | 'file_name' | 'file_extension' | 'file_size' | 'is_read' | 'deleted_by' | 'createdAt' | 'updatedAt'> {}

export class ChatMessage extends Model<ChatMessageAttributes, ChatMessageCreationAttributes> implements ChatMessageAttributes {
  public id!: string;
  public conversation_id!: number;
  public sender_id!: string;
  public receiver_id!: string;
  public message!: string;
  public message_type!: MessageType;
  public file_url?: string | null;
  public file_name?: string | null;
  public file_extension?: string | null;
  public file_size?: string | null;
  public is_read!: boolean;
  public deleted_by!: string[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ChatMessage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    conversation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sender_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    receiver_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    message_type: {
      type: DataTypes.ENUM('text', 'image', 'video', 'file', 'audio'),
      defaultValue: 'text',
    },
    file_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_extension: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_size: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    deleted_by: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
  },
  {
    sequelize,
    modelName: 'ChatMessage',
    tableName: 'ChatMessages',
    timestamps: true,
  }
); 