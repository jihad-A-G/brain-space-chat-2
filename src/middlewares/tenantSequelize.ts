import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import { defineModels } from '../models';
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

// Extend Express Request interface to include 'tenant'
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        sequelize: Sequelize;
        models: any;
      };
    }
  }
}

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


export default async function tenantSequelizeMiddleware(req: Request, res: Response, next: NextFunction) {
  try {

    const referer = req.headers.referer || req.headers.referrer as string;
    console.log(`[TENANT DEBUG] Referer header: '${referer}'`);
    if (!referer) {
      return res.status(400).send('No referer header provided');
    }
    let subdomain = '';
    let dbHost = '157.180.50.29';
    let dbName = '';
    let dbUser = '';
    let dbPass = '';
    let useTenantDbLookup = false;
    try {
      const refererUrl = new URL(referer);
      const hostname = refererUrl.hostname;
      const parts = hostname.split('.');
      console.log(`[TENANT DEBUG] Referer hostname: '${hostname}', parts:`, parts);
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Localhost: use special config
        dbHost = '88.198.32.140';
        dbName = 'pos_new';
        dbUser = 'root';
        dbPass = 'TryHarderplease!@#$2232';
        console.log(`[TENANT DEBUG] Referer is localhost, using special credentials`);
      } else if (hostname === 'brain-space2.vercel.app') {
        dbHost = '88.198.32.140';
        dbName = 'pos_new';
        dbUser = 'root';
        dbPass = 'TryHarderplease!@#$2232';
        console.log(`[TENANT DEBUG] Referer is brain-space2.vercel.app, using special credentials`);
      } else if (
        parts.length >= 3 &&
        parts[parts.length - 2] === 'brain-space' &&
        parts[parts.length - 1] === 'app'
      ) {
        subdomain = parts[0];
        if (subdomain === 'chat' || subdomain === 'www') {
          return res.status(400).send('Invalid subdomain');
        }
        if (subdomain === 'dev') {
          dbHost = '88.198.32.140';
          useTenantDbLookup = true;
        } else if (subdomain === '') {
          // Main domain: use brain_space
          dbName = 'brain_space';
          dbUser = 'brain';
          dbPass = '8MUG3eT9GYXT298xtRKg';
        } else {
          useTenantDbLookup = true;
        }
      } else {
        return res.status(400).send('Referer not allowed');
      }
    } catch (err) {
      return res.status(400).send('Invalid referer URL');
    }

    // If using special config (localhost, vercel)
    if (dbName && dbUser && dbPass) {
      const specialSequelize = new Sequelize(dbName, dbUser, dbPass, {
        host: dbHost,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 }
      });
      const models = defineModels(specialSequelize);
      req.tenant = { sequelize: specialSequelize, models };
      return next();
    }

    // If using tenant DB lookup
    if (useTenantDbLookup) {
      // Lookup tenant DB info from tenantDB
      const tenantConn = await mysql.createConnection(tenantDbConfig);
      const [rows]: any = await tenantConn.execute(
        'SELECT db_name, db_user, db_pass FROM tenants WHERE subdomain = ? LIMIT 1',
        [subdomain]
      );
      await tenantConn.end();
      if (!rows.length) {
        return res.status(404).send('Tenant not found');
      }
      const { db_name, db_user, db_pass } = rows[0];
      const tenantSequelize = new Sequelize(db_name, db_user, db_pass, {
        host: dbHost,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 }
      });
      const models = defineModels(tenantSequelize);
      req.tenant = { sequelize: tenantSequelize, models };
      return next();
    }

    // If we reach here, something is wrong
    return res.status(400).send('Invalid tenant configuration');

    // If no subdomain, use default database
    if (!subdomain) {
      console.log(`[TENANT DEBUG] Using default database connection`);
      console.log(`[TENANT DEBUG] Creating new default database connection`);
      console.log(`[TENANT DEBUG] Default DB config:`, {
        host: defaultDbConfig.host,
        user: defaultDbConfig.user,
        database: defaultDbConfig.database
      });

      // Create default database connection
      const defaultSequelizeInstance = new Sequelize(defaultDbConfig.database, defaultDbConfig.user, defaultDbConfig.password, {
        host: defaultDbConfig.host,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 }
      });

      const models = defineModels(defaultSequelizeInstance);
      req.tenant = { sequelize: defaultSequelizeInstance, models };
      return next();
    }

    console.log(`[TENANT DEBUG] Looking up tenant-specific connection for subdomain: '${subdomain}'`);

    // Check cache for tenant-specific connection (REMOVED)

  } catch (err) {
    console.error(`[TENANT ERROR] Middleware error:`, err);
    next(err);
  }
} 