import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import { defineModels } from '../models';
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

// Configuration for tenant lookup database
const tenantDbConfig = {
  host: '157.180.50.29',
  user: 'root',
  password: 'jWAC5hpomatL2',
  database: 'tenantDB',
  charset: 'utf8mb4'
};

// Configuration for default database
const defaultDbConfig = {
  host: '157.180.50.29',
  user: 'brain',
  password: '8MUG3eT9GYXT298xtRKg',
  database: 'brain_space',
  charset: 'utf8mb4'
};

const sequelizeCache: Record<string, { sequelize: Sequelize, models: any }> = {};

export default async function tenantSequelizeMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const host = req.headers.host || '';
    // Remove port if present
    const hostname = host.split(':')[0];
    
    // Extract subdomain from hostname
    const parts = hostname.split('.');
    let subdomain = '';
    
    // Check if this is brain-space.app domain structure
    if (parts.length >= 2 && parts[parts.length - 2] === 'brain-space' && parts[parts.length - 1] === 'app') {
      // If it's x.brain-space.app, subdomain is the first part
      if (parts.length > 2) {
        subdomain = parts[0];
      }
      // If it's just brain-space.app, subdomain is empty
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // For local development, use default database
      subdomain = '';
    } else {
      // For other domains, treat as default
      subdomain = '';
    }

    // If no subdomain, use default database
    if (!subdomain) {
      // Check cache for default connection
      if (sequelizeCache['default']) {
        // @ts-ignore
        req.tenant = sequelizeCache['default'];
        return next();
      }

      // Create default database connection
      const defaultSequelizeInstance = new Sequelize(defaultDbConfig.database, defaultDbConfig.user, defaultDbConfig.password, {
        host: defaultDbConfig.host,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 }
      });

      const models = defineModels(defaultSequelizeInstance);
      sequelizeCache['default'] = { sequelize: defaultSequelizeInstance, models };
      // @ts-ignore
      req.tenant = sequelizeCache['default'];
      return next();
    }

    // Check cache for tenant-specific connection
    if (sequelizeCache[subdomain]) {
      // @ts-ignore
      req.tenant = sequelizeCache[subdomain];
      return next();
    }

    // Lookup tenant DB info from tenantDB
    const tenantConn = await mysql.createConnection(tenantDbConfig);
    const [rows]: any = await tenantConn.execute(
      'SELECT db_name, db_user, db_pass FROM tenants WHERE subdomain = ? LIMIT 1',
      [subdomain]
    );
    await tenantConn.end();

    if (!rows.length) {
      // @ts-ignore
      return res.status(404).send('Tenant not found');
    }

    // @ts-ignore
    const { db_name, db_user, db_pass } = rows[0];
    const tenantSequelize = new Sequelize(db_name, db_user, db_pass, {
      host: 'localhost',
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });

    const models = defineModels(tenantSequelize);
    sequelizeCache[subdomain] = { sequelize: tenantSequelize, models };
    // @ts-ignore
    req.tenant = sequelizeCache[subdomain];
    next();
  } catch (err) {
    next(err);
  }
} 