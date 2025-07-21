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
    console.log(`[TENANT DEBUG] Incoming request host: '${host}'`);
    
    // Remove port if present
    const hostname = host.split(':')[0];
    console.log(`[TENANT DEBUG] Hostname after port removal: '${hostname}'`);
    
    // Extract subdomain from hostname
    const parts = hostname.split('.');
    console.log(`[TENANT DEBUG] Hostname parts:`, parts);
    let subdomain = '';
    
    // Check if this is brain-space.app domain structure
    if (parts.length >= 2 && parts[parts.length - 2] === 'brain-space' && parts[parts.length - 1] === 'app') {
      console.log(`[TENANT DEBUG] Detected brain-space.app domain structure`);
      // If it's x.brain-space.app, subdomain is the first part
      if (parts.length > 2) {
        subdomain = parts[0];
        console.log(`[TENANT DEBUG] Extracted subdomain: '${subdomain}'`);
      } else {
        console.log(`[TENANT DEBUG] No subdomain detected (just brain-space.app)`);
      }
      // If it's just brain-space.app, subdomain is empty
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // For local development, use default database
      subdomain = '';
      console.log(`[TENANT DEBUG] Local development detected, using default database`);
    } else {
      // For other domains, treat as default
      subdomain = '';
      console.log(`[TENANT DEBUG] Other domain detected: '${hostname}', using default database`);
    }

    console.log(`[TENANT DEBUG] Final subdomain decision: '${subdomain}' (empty = default DB)`);

    // If no subdomain, use default database
    if (!subdomain) {
      console.log(`[TENANT DEBUG] Using default database connection`);
      
      // Check cache for default connection
      if (sequelizeCache['default']) {
        console.log(`[TENANT DEBUG] Found cached default connection`);
        // @ts-ignore
        req.tenant = sequelizeCache['default'];
        return next();
      }

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
      sequelizeCache['default'] = { sequelize: defaultSequelizeInstance, models };
      console.log(`[TENANT DEBUG] Default connection cached and assigned to request`);
      // @ts-ignore
      req.tenant = sequelizeCache['default'];
      return next();
    }

    console.log(`[TENANT DEBUG] Looking up tenant-specific connection for subdomain: '${subdomain}'`);

    // Check cache for tenant-specific connection
    if (sequelizeCache[subdomain]) {
      console.log(`[TENANT DEBUG] Found cached connection for subdomain: '${subdomain}'`);
      // @ts-ignore
      req.tenant = sequelizeCache[subdomain];
      return next();
    }

    console.log(`[TENANT DEBUG] No cached connection found, querying tenant database`);
    console.log(`[TENANT DEBUG] Tenant DB lookup config:`, {
      host: tenantDbConfig.host,
      user: tenantDbConfig.user,
      database: tenantDbConfig.database
    });

    // Lookup tenant DB info from tenantDB
    const tenantConn = await mysql.createConnection(tenantDbConfig);
    console.log(`[TENANT DEBUG] Connected to tenant lookup database`);
    
    const [rows]: any = await tenantConn.execute(
      'SELECT db_name, db_user, db_pass FROM tenants WHERE subdomain = ? LIMIT 1',
      [subdomain]
    );
    await tenantConn.end();
    
    console.log(`[TENANT DEBUG] Tenant lookup query result: ${rows.length} rows found`);

    if (!rows.length) {
      console.log(`[TENANT DEBUG] No tenant found for subdomain: '${subdomain}'`);
      // @ts-ignore
      return res.status(404).send('Tenant not found');
    }

    // @ts-ignore
    const { db_name, db_user, db_pass } = rows[0];
    console.log(`[TENANT DEBUG] Found tenant credentials:`, {
      db_name,
      db_user,
      host: 'localhost'
    });

    console.log(`[TENANT DEBUG] Creating tenant-specific database connection`);
    const tenantSequelize = new Sequelize(db_name, db_user, db_pass, {
      host: 'localhost',
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });

    const models = defineModels(tenantSequelize);
    sequelizeCache[subdomain] = { sequelize: tenantSequelize, models };
    console.log(`[TENANT DEBUG] Tenant connection cached and assigned to request for subdomain: '${subdomain}'`);
    // @ts-ignore
    req.tenant = sequelizeCache[subdomain];
    next();
  } catch (err) {
    console.error(`[TENANT ERROR] Middleware error:`, err);
    next(err);
  }
} 