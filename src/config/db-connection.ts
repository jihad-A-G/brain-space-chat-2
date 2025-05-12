import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = process.env.DB_NAME || 'pos_new';
const DB_USER = process.env.DB_USER || 'jehad';
const DB_PASS = process.env.DB_PASS || 'FcQx1f8myPF[O-UM';
const DB_HOST = process.env.DB_HOST || '88.198.32.140';

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  dialect: 'mysql',
  logging: false,
});

export default sequelize; 