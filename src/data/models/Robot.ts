import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Robot extends Model {
  static table = 'robots';

  @field('robot_id') robotId!: string;
  @field('model') model!: string;
  @field('class') class!: string;
  @field('battery_percent') batteryPercent!: number;
  @field('status') status!: string;
  @readonly @date('last_update') lastUpdate!: Date;
}
