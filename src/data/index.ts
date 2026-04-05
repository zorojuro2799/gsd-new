import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import Robot from './models/Robot';
import Mission from './models/Mission';
import Task from './models/Task';

// Create the adapter to the underlying database:
const adapter = new SQLiteAdapter({
  schema,
  // (Optional) Database name
  dbName: 'aegis_fleet',
  // (Recommended) JavaScript-based JSI adapter (faster on Android/iOS)
  jsi: true,
  // (Optional) Handle data migration
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
  },
});

// Then, create the Watermelon database from the adapter and models
export const database = new Database({
  adapter,
  modelClasses: [Robot, Mission, Task],
});
