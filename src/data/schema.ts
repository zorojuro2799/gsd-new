import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'robots',
      columns: [
        { name: 'robot_id', type: 'string', isIndexed: true },
        { name: 'model', type: 'string' },
        { name: 'class', type: 'string' },
        { name: 'battery_percent', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'last_update', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'missions',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'tasks',
      columns: [
        { name: 'mission_id', type: 'string', isIndexed: true },
        { name: 'robot_id', type: 'string', isIndexed: true },
        { name: 'command', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'sequence', type: 'number' },
      ],
    }),
  ],
});
