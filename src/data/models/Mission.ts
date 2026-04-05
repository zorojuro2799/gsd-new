import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class Mission extends Model {
  static table = 'missions';
  static associations = {
    tasks: { type: 'has_many', foreignKey: 'mission_id' },
  } as const;

  @field('name') name!: string;
  @field('status') status!: string;
  @readonly @date('created_at') createdAt!: Date;

  @children('tasks') tasks!: any; // Relationship to Task model
}
