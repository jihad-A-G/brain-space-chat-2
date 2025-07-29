import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type Gender = 'Male' | 'Female';

interface UserAttributes {
  id: number;
  name: string;
  user_name: string;
  password: string;
  phone_number: string;
  email_address: string;
  gender: Gender;
  disabled: boolean;
  role: number;
  main_image?: string | null;
  token: string;
  mobile_token: string;
  secret_key?: string | null;
  language_id: number;
  last_seen?: Date | null;
  status?: string | null;
  allow_notification: boolean;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'main_image' | 'secret_key' | 'last_seen' | 'status'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public name!: string;
  public user_name!: string;
  public password!: string;
  public phone_number!: string;
  public email_address!: string;
  public gender!: Gender;
  public disabled!: boolean;
  public role!: number;
  public main_image?: string | null;
  public token!: string;
  public mobile_token!: string;
  public secret_key?: string | null;
  public language_id!: number;
  public last_seen?: Date | null;
  public status?: string | null;
  public allow_notification!: boolean;
}

export function defineUserModel(sequelize: Sequelize) {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      user_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email_address: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      gender: {
        type: DataTypes.ENUM('Male', 'Female'),
        allowNull: false,
      },
      disabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      role: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      main_image: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      mobile_token: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      secret_key: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      language_id: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      last_seen: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      allow_notification : {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      }
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: false,
    }
  );
  return User;
} 