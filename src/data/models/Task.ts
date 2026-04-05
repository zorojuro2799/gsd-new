import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';

export default class Task extends Model {
  static table = 'tasks';
  static associations = {
    missions: { type: 'belongs_to', key: 'mission_id' },
  } as const;

  @field('robot_id') robotId!: string;
  @field('command') command!: string;
  @field('status') status!: string;
  @field('sequence') sequence!: number;
  @readonly @date('created_at') createdAt!: Date;

  @relation('missions', 'mission_id') mission!: any; // Relationship to Mission model
}
