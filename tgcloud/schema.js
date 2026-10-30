import { table, integer, text, index } from 'sdk/db'

export const userStates = table('user_states', {
  chatId: integer('chat_id').primaryKey(),
  step: text('step').notNull().default('idle'),
  activeTaskId: integer('active_task_id'),
  updatedAt: integer('updated_at').notNull(),
})

export const tasks = table('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  content: text('content').notNull(),
  targetDate: text('target_date'),
  targetTime: text('target_time'),
  status: text('status').notNull().default('draft'),
  isRemindedToday: integer('is_reminded_today').notNull().default(0),
  lastRolloverDate: text('last_rollover_date'),
  rolloverCount: integer('rollover_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  statusDateIdx: index('idx_tasks_status_date').on(t.status, t.targetDate),
  chatStatusIdx: index('idx_tasks_chat_status').on(t.chatId, t.status),
}))
